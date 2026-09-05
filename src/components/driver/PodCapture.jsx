import { useEffect, useRef, useState } from 'react';
import {
  buildDeliveryWatermarkLines,
  canvasToJpegBlob,
  captureVideoFrame,
  compressPodImage,
  detectLowMemoryDevice,
  drawPodWatermark,
  isMemoryError,
  makeThumbnailBlob,
  POD_CAMERA_CONSTRAINTS,
  POD_CAMERA_MAX_DIMENSION,
  POD_MEMORY_PROFILES,
  releaseCanvas,
  stopCameraStream,
  validatePodImageFile,
} from '../../lib/pod/podPhotoProcessing.js';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { reverseGeocode } from '../../lib/geo/geocodeAddress.js';

// TICKET — ANDROID CAMERA FLOW UNUSABLE: MEMORY INSUFFICIENT BEFORE PHOTO
// REACHES APP.
//
// Root cause: il vecchio file-input con attributo capture apriva la camera OEM
// (Samsung) che consegna un JPEG ~12MP (4080x3060) al renderer Chrome, con
// pressione memoria prima/durante l'handoff -> "Memoria insufficiente" ancora
// prima della preview, spesso senza nemmeno un tentativo diagnosticabile.
//
// Nuovo percorso: getUserMedia con risoluzione VINCOLATA (1280x960, max
// 1600x1200). Preview video live leggera. Allo SCATTA: frame del video ->
// canvas <=1600px -> watermark -> JPEG -> stop tracks + release -> upload.
// Nessun JPEG 12MP entra mai nel renderer.
//
// Fallback (getUserMedia assente o permesso negato): SOLO "Scegli dalla
// galleria" (input file senza capture), con avviso esplicito; l'immagine
// passa comunque da compressPodImage (decode-at-target), mai un full-res 12MP.
//
// Backend upload invariato: assignment access_token + RPC
// driver_register_proof_photo, nessun login Supabase Driver.
// Zero campi manuali. Diagnostica multi-tentativo invariata (sessionStorage).

const LOW_MEMORY_FLAG = 'pod_forced_low_memory';
const HISTORY_KEY = 'pod_photo_diagnostic_history';
const SEQ_KEY = 'pod_photo_attempt_seq';
const MAX_ATTEMPTS = 5;
const MAX_STAGE_ROWS = 60;

function readForcedLowMemory() {
  try { return localStorage.getItem(LOW_MEMORY_FLAG) === '1'; } catch { return false; }
}
function persistForcedLowMemory() {
  try { localStorage.setItem(LOW_MEMORY_FLAG, '1'); } catch { /* storage non disponibile */ }
}
function loadHistory() {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveHistory(list) {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_ATTEMPTS))); } catch { /* storage non disponibile */ }
}
function nextAttemptSeq() {
  try {
    const n = Number(sessionStorage.getItem(SEQ_KEY) || '0') + 1;
    sessionStorage.setItem(SEQ_KEY, String(n));
    return n;
  } catch { return 1; }
}
function newAttemptId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function reconcileHistory(list) {
  let changed = false;
  const out = (list || []).map((a) => {
    if (a && a.status === 'running') {
      changed = true;
      return {
        ...a,
        status: 'interrupted',
        reason: 'renderer_reload_or_oom',
        memoryError: a.memoryError ?? true,
        updatedAt: new Date().toISOString(),
      };
    }
    return a;
  });
  return { out, changed };
}

function statusLabel(status) {
  if (status === 'success') return 'SUCCESS';
  if (status === 'failed') return 'FAILED';
  if (status === 'interrupted') return 'INTERRUPTED';
  return 'IN CORSO';
}

function formatAttempt(a) {
  const head = [
    `attemptId     ${a.attemptId}`,
    `tentativo     #${a.n}   stato ${statusLabel(a.status)}${a.reason ? ` (${a.reason})` : ''}`,
    `sorgente      ${a.kind || '-'}`,
    `startedAt     ${a.startedAt}`,
    `updatedAt     ${a.updatedAt}`,
    `ultimo stage  ${a.lastStage || '-'}`,
    `error.name    ${a.errorName || '-'}`,
    `error.message ${a.errorMessage || '-'}`,
    `memoryError   ${a.memoryError === null || a.memoryError === undefined ? '-' : a.memoryError}`,
    `profilo       ${a.profile || '-'}   deviceMemory ${a.deviceMemory ?? '-'}`,
    `capture       ${a.origWidth ?? '-'}x${a.origHeight ?? '-'}  (${a.origBytes ?? '-'} B in)`,
    `target        ${a.targetWidth ?? '-'}x${a.targetHeight ?? '-'}`,
    `finalBytes    ${a.finalBytes ?? '-'}   elapsed ${a.elapsedMs ?? '-'} ms`,
    '— stages —',
  ].join('\n');
  const rows = (a.stages || []).map((s) => {
    const extra = Object.keys(s).filter((k) => k !== 'stage' && k !== 'atMs').map((k) => `${k}=${s[k]}`).join(' ');
    return `+${String(s.atMs).padStart(5)}ms  ${s.stage}${extra ? '  ' + extra : ''}`;
  }).join('\n');
  return `${head}\n${rows}`;
}

export function PodCapture({ campaignId, sessionId, assignmentId = null, accessToken = null, lastPosition, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | camera | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [cameraError, setCameraError] = useState(null); // fallback -> solo galleria
  const [previewUrl, setPreviewUrl] = useState(null);
  const [meta, setMeta] = useState(null);
  const [profileId, setProfileId] = useState(
    () => ((detectLowMemoryDevice() || readForcedLowMemory()) ? 'low' : 'default'),
  );
  const [memoryFailure, setMemoryFailure] = useState(false);
  const [history, setHistory] = useState(() => {
    const { out, changed } = reconcileHistory(loadHistory());
    if (changed) saveHistory(out);
    return out;
  });
  const [showPrev, setShowPrev] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const finalBlobRef = useRef(null);
  const takenAtRef = useRef(null);
  const previewUrlRef = useRef(null);
  const busyRef = useRef(false);
  const profileRef = useRef(profileId);
  const stageLogRef = useRef([]);
  const attemptRef = useRef(null);
  const t0Ref = useRef(0);
  const galleryInputRef = useRef(null);

  profileRef.current = profileId;

  useEffect(() => {
    const { out, changed } = reconcileHistory(loadHistory());
    if (changed) { saveHistory(out); setHistory(out); }
  }, []);

  // Unmount: fotocamera spenta, nessuna object URL orfana.
  useEffect(() => () => {
    stopCameraStream(streamRef.current, videoRef.current);
    streamRef.current = null;
    revokePreview();
    finalBlobRef.current = null;
  }, []);

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function persistCurrent(a) {
    const list = loadHistory();
    if (list.length && list[0].attemptId === a.attemptId) list[0] = { ...a };
    else list.unshift({ ...a });
    const trimmed = list.slice(0, MAX_ATTEMPTS);
    saveHistory(trimmed);
    setHistory(trimmed);
  }

  function startAttempt(kind) {
    const attempt = {
      attemptId: newAttemptId(),
      n: nextAttemptSeq(),
      kind, // 'camera' | 'gallery'
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'running',
      reason: null,
      lastStage: null,
      errorName: null,
      errorMessage: null,
      memoryError: null,
      origBytes: null,
      origWidth: null,
      origHeight: null,
      targetWidth: null,
      targetHeight: null,
      finalBytes: null,
      elapsedMs: 0,
      profile: profileRef.current,
      deviceMemory: (typeof navigator !== 'undefined' ? navigator.deviceMemory : null) ?? null,
      reachedPreview: false,
      stages: [],
    };
    attemptRef.current = attempt;
    stageLogRef.current = [];
    persistCurrent(attempt);
    return attempt;
  }

  function pushStage(name, extra) {
    const a = attemptRef.current;
    if (!a) return;
    const atMs = Math.round(nowMs() - (t0Ref.current || nowMs()));
    const entry = { stage: name, atMs, ...(extra || {}) };
    stageLogRef.current = [...stageLogRef.current, entry].slice(-MAX_STAGE_ROWS);

    a.stages = stageLogRef.current;
    a.lastStage = name;
    a.elapsedMs = atMs;
    a.updatedAt = new Date().toISOString();
    if (name === 'preview_ready') a.reachedPreview = true;

    for (const s of stageLogRef.current) {
      if (s.origBytes != null) a.origBytes = s.origBytes;
      if (s.origWidth != null) a.origWidth = s.origWidth;
      if (s.origHeight != null) a.origHeight = s.origHeight;
      if (s.targetWidth != null) a.targetWidth = s.targetWidth;
      if (s.targetHeight != null) a.targetHeight = s.targetHeight;
      if (s.finalBytes != null) a.finalBytes = s.finalBytes;
    }

    persistCurrent(a);
  }

  function finalizeAttempt(status, opts = {}) {
    const a = attemptRef.current;
    if (!a) return;
    a.status = status;
    a.reason = opts.reason || a.reason || null;
    if (opts.lastStageOverride) a.lastStage = opts.lastStageOverride;
    a.errorName = opts.error?.name || a.errorName || null;
    a.errorMessage = opts.error ? (opts.error.message || String(opts.error)) : (opts.errorMessage || a.errorMessage || null);
    a.memoryError = opts.memoryError ?? a.memoryError ?? null;
    a.elapsedMs = Math.round(nowMs() - (t0Ref.current || nowMs()));
    a.updatedAt = new Date().toISOString();
    persistCurrent(a);
    attemptRef.current = null;
  }

  function revokePreview() {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* gia' revocata */ }
      previewUrlRef.current = null;
    }
  }

  // NON tocca la history: la diagnostica sopravvive a errore, reset, teardown.
  function fullCleanup() {
    revokePreview();
    setPreviewUrl(null);
    finalBlobRef.current = null;
    takenAtRef.current = null;
  }

  function stopCamera() {
    stopCameraStream(streamRef.current, videoRef.current);
    streamRef.current = null;
  }

  function resetToIdle() {
    stopCamera();
    fullCleanup();
    setMeta(null);
    setError(null);
    setStage('idle');
    busyRef.current = false;
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  }

  function switchToLowMemory() {
    profileRef.current = 'low';
    setProfileId('low');
    persistForcedLowMemory();
  }

  async function openCamera() {
    if (busyRef.current) return;
    setError(null);
    setCameraError(null);
    setMemoryFailure(false);
    t0Ref.current = nowMs();
    startAttempt('camera');
    pushStage('camera_request', { profile: profileRef.current });
    setStage('camera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error('Fotocamera web non supportata su questo browser.'), { name: 'NotSupportedError' });
      }
      const stream = await navigator.mediaDevices.getUserMedia(POD_CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => { /* autoplay puo' richiedere gesture: il frame arriva comunque */ });
      }
      const track = stream.getVideoTracks?.()[0];
      const s = track?.getSettings?.() || {};
      pushStage('camera_ready', {
        width: s.width ?? v?.videoWidth ?? null,
        height: s.height ?? v?.videoHeight ?? null,
      });
    } catch (err) {
      stopCamera();
      pushStage('camera_error', { name: err?.name || null, message: err?.message || String(err) });
      finalizeAttempt('failed', { error: err, reason: 'camera_unavailable' });
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Permesso fotocamera negato. Abilita la fotocamera per il sito, oppure usa "Scegli dalla galleria".'
          : 'Fotocamera web non disponibile su questo dispositivo. Usa "Scegli dalla galleria".',
      );
      setStage('error');
    }
  }

  async function handleShutter() {
    if (busyRef.current) return;
    if (!attemptRef.current) startAttempt('camera');
    busyRef.current = true;
    setError(null);
    setStage('preparing');

    const profile = POD_MEMORY_PROFILES[profileRef.current] || POD_MEMORY_PROFILES.default;
    let canvas = null;
    try {
      const v = videoRef.current;
      pushStage('shutter', { vw: v?.videoWidth ?? null, vh: v?.videoHeight ?? null });

      pushStage('frame_draw_start', { profile: profile.id });
      const framed = captureVideoFrame(v, Math.min(profile.maxDimension, POD_CAMERA_MAX_DIMENSION));
      canvas = framed.canvas;
      pushStage('frame_draw_done', {
        origWidth: framed.origWidth,
        origHeight: framed.origHeight,
        targetWidth: framed.width,
        targetHeight: framed.height,
      });

      const takenAt = new Date().toISOString();

      let geo = null;
      if (lastPosition?.lat != null && lastPosition?.lng != null) {
        geo = await reverseGeocode(lastPosition.lat, lastPosition.lng).catch(() => null);
      }

      pushStage('watermark_start');
      drawPodWatermark(canvas, buildDeliveryWatermarkLines({
        takenAt,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        city,
        street: geo?.street || null,
        houseNumber: geo?.houseNumber || null,
        geoCity: geo?.city || null,
      }));
      pushStage('watermark_done');

      const finalW = canvas.width;
      const finalH = canvas.height;

      pushStage('blob_start', { quality: profile.quality });
      const blob = await canvasToJpegBlob(canvas, profile.quality);
      pushStage('blob_done', { finalBytes: blob.size, finalW, finalH });

      pushStage('thumb_start');
      const thumbBlob = await makeThumbnailBlob(canvas).catch(() => null);
      pushStage('thumb_done', { thumbBytes: thumbBlob?.size ?? null });

      releaseCanvas(canvas);
      canvas = null;

      // fotocamera spenta appena il frame e' catturato: niente stream vivo
      // durante preview/upload.
      stopCamera();
      pushStage('tracks_stopped');

      finalBlobRef.current = blob;
      takenAtRef.current = takenAt;

      revokePreview();
      const url = URL.createObjectURL(thumbBlob || blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setMeta({
        origW: framed.origWidth,
        origH: framed.origHeight,
        finalW, finalH,
        finalBytes: blob.size,
        ms: Math.round(nowMs() - t0Ref.current),
      });
      pushStage('preview_ready');
      setStage('preview');
    } catch (err) {
      const mem = isMemoryError(err);
      finalizeAttempt('failed', { error: err, memoryError: mem });
      if (canvas) releaseCanvas(canvas);
      stopCamera();
      fullCleanup();
      if (mem) {
        switchToLowMemory();
        setMemoryFailure(true);
        setError('Memoria insufficiente durante lo scatto. Riprova in modalita\' leggera.');
      } else {
        setError(err?.message || 'Scatto non riuscito. Riprova.');
      }
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  // Fallback galleria: input file SENZA capture. L'immagine passa comunque da
  // compressPodImage (decode-at-target), mai un full-res 12MP nel renderer.
  async function handleGallerySelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (busyRef.current) return;

    t0Ref.current = nowMs();

    if (!file) {
      startAttempt('gallery');
      finalizeAttempt('failed', {
        reason: 'camera_pre_js',
        lastStageOverride: 'camera_pre_js',
        memoryError: null,
        errorMessage: 'Errore avvenuto prima che la foto arrivasse alla pipeline JavaScript',
      });
      setError('Nessuna foto ricevuta. Riprova.');
      setStage('error');
      return;
    }

    busyRef.current = true;
    setError(null);
    setMemoryFailure(false);
    setStage('preparing');

    const profile = POD_MEMORY_PROFILES[profileRef.current] || POD_MEMORY_PROFILES.default;
    startAttempt('gallery');
    pushStage('input_received', { origBytes: file.size, type: file.type || null, profile: profile.id });

    let canvas = null;
    try {
      validatePodImageFile(file);

      const compressed = await compressPodImage(file, { maxDimension: profile.maxDimension, onStage: pushStage });
      canvas = compressed.canvas;

      const takenAt = new Date().toISOString();

      let geo = null;
      if (lastPosition?.lat != null && lastPosition?.lng != null) {
        geo = await reverseGeocode(lastPosition.lat, lastPosition.lng).catch(() => null);
      }

      pushStage('watermark_start');
      drawPodWatermark(canvas, buildDeliveryWatermarkLines({
        takenAt,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        city,
        street: geo?.street || null,
        houseNumber: geo?.houseNumber || null,
        geoCity: geo?.city || null,
      }));
      pushStage('watermark_done');

      const finalW = canvas.width;
      const finalH = canvas.height;

      pushStage('blob_start', { quality: profile.quality });
      const blob = await canvasToJpegBlob(canvas, profile.quality);
      pushStage('blob_done', { finalBytes: blob.size, finalW, finalH });

      pushStage('thumb_start');
      const thumbBlob = await makeThumbnailBlob(canvas).catch(() => null);
      pushStage('thumb_done', { thumbBytes: thumbBlob?.size ?? null });

      releaseCanvas(canvas);
      canvas = null;

      finalBlobRef.current = blob;
      takenAtRef.current = takenAt;

      revokePreview();
      const url = URL.createObjectURL(thumbBlob || blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setMeta({
        origBytes: file.size,
        origW: compressed.origWidth || null,
        origH: compressed.origHeight || null,
        finalW, finalH,
        finalBytes: blob.size,
        ms: Math.round(nowMs() - t0Ref.current),
      });
      pushStage('preview_ready');
      setStage('preview');
    } catch (err) {
      const mem = isMemoryError(err);
      finalizeAttempt('failed', { error: err, memoryError: mem });
      if (canvas) releaseCanvas(canvas);
      fullCleanup();
      if (mem) {
        switchToLowMemory();
        setMemoryFailure(true);
        setError('Memoria del telefono insufficiente durante l\'elaborazione. Riprova in modalita\' leggera.');
      } else {
        setError(err?.message || 'Foto non valida.');
      }
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  async function handleConfirm() {
    if (busyRef.current) return;
    if (!finalBlobRef.current) { setStage('idle'); return; }
    busyRef.current = true;
    setStage('uploading');
    setError(null);
    try {
      pushStage('upload_start', { blobBytes: finalBlobRef.current.size });
      const record = await uploadProofPhoto({
        campaignId,
        sessionId,
        assignmentId,
        accessToken,
        blob: finalBlobRef.current,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        takenAt: takenAtRef.current || new Date().toISOString(),
        onStage: pushStage,
      });
      onUploaded?.(record);
      pushStage('cleanup_done');
      finalizeAttempt('success');
      resetToIdle();
    } catch (err) {
      const mem = isMemoryError(err);
      finalizeAttempt('failed', { error: err, memoryError: mem, lastStageOverride: 'upload' });
      if (mem) { switchToLowMemory(); setMemoryFailure(true); }
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  function copyAttempt(a) {
    if (!a) return;
    try { navigator.clipboard?.writeText(JSON.stringify(a, null, 2)); } catch { /* clipboard non disponibile */ }
  }

  function clearHistory() {
    try { sessionStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
    setHistory([]);
    setShowPrev(false);
  }

  const scattoDisabled = stage === 'preparing' || stage === 'uploading' || busyRef.current;
  const profileLabel = profileRef.current === 'low' ? 'leggera (max 1280px)' : 'standard (max 1600px)';
  const cur = history[0] || null;

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Foto prova campagna</p>

      <input ref={galleryInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGallerySelected} />

      {stage === 'idle' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Data, ora, posizione e "GPS verificato" vengono aggiunti automaticamente alla foto.</div>
          <div style={{ ...mutedStyle, fontSize: 11 }}>Fotocamera web a bassa risoluzione · modalita' {profileLabel}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} disabled={scattoDisabled} onClick={openCamera}>Scatta foto</button>
            <button type="button" style={secondaryButtonStyle} disabled={scattoDisabled} onClick={() => galleryInputRef.current?.click()}>Scegli dalla galleria</button>
          </div>
          {profileRef.current === 'low' && (
            <button type="button" style={linkButtonStyle} onClick={() => { profileRef.current = 'default'; setProfileId('default'); try { localStorage.removeItem(LOW_MEMORY_FLAG); } catch { /* ignore */ } }}>
              Torna alla modalita' standard
            </button>
          )}
        </div>
      )}

      {stage === 'camera' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <video ref={videoRef} playsInline muted autoPlay style={videoStyle} />
          <div style={mutedStyle}>Inquadra il punto di consegna, poi premi SCATTA.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} disabled={scattoDisabled} onClick={handleShutter}>SCATTA</button>
            <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Annulla</button>
          </div>
        </div>
      )}

      {stage === 'preparing' && <div style={mutedStyle}>Elaborazione foto e watermark in corso ({profileLabel})...</div>}

      {stage === 'error' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={errorStyle}>{cameraError || error}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {finalBlobRef.current && <button type="button" style={primaryButtonStyle} onClick={handleConfirm}>Riprova invio</button>}
            {cameraError && (
              <button type="button" style={primaryButtonStyle} onClick={() => galleryInputRef.current?.click()}>Scegli dalla galleria</button>
            )}
            {!cameraError && !finalBlobRef.current && (
              <button type="button" style={primaryButtonStyle} onClick={openCamera}>Riprova fotocamera</button>
            )}
            {(memoryFailure || profileRef.current === 'low') && !finalBlobRef.current && (
              <button type="button" style={secondaryButtonStyle} onClick={() => { switchToLowMemory(); openCamera(); }}>Modalita' leggera</button>
            )}
            <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Nuovo scatto</button>
          </div>
        </div>
      )}

      {stage === 'preview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewUrl && <img src={previewUrl} alt="Anteprima foto con watermark" style={previewImgStyle} />}
          {meta && (
            <div style={{ ...mutedStyle, fontSize: 11 }}>
              {meta.finalW}×{meta.finalH} · {(meta.finalBytes / 1024).toFixed(0)} KB · {meta.ms} ms · {profileLabel}
            </div>
          )}
          <div style={mutedStyle}>Controlla che il watermark sia leggibile, poi conferma. L'upload e' automatico.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} onClick={handleConfirm}>Conferma e invia</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => { resetToIdle(); openCamera(); }}>Riscatta</button>
          </div>
        </div>
      )}

      {stage === 'uploading' && <div style={mutedStyle}>Caricamento foto in corso...</div>}

      {cur && (
        <div style={lastDiagStyle}>
          <div style={lastDiagHeadStyle}>Ultima diagnostica foto</div>
          <div style={lastStageBigStyle}>Tentativo #{cur.n} · {statusLabel(cur.status)}</div>
          <div style={lastStageBigStyle}>ULTIMO STAGE: {cur.lastStage || 'sconosciuto'}</div>
          {cur.reason === 'renderer_reload_or_oom' && (
            <div style={errorStyle}>Interrotto: reload del renderer Chrome o esaurimento memoria (nessun errore JS catturato).</div>
          )}
          {cur.lastStage === 'camera_pre_js' && (
            <div style={errorStyle}>Errore avvenuto prima che la foto arrivasse alla pipeline JavaScript</div>
          )}
          <pre style={diagPreStyle}>{formatAttempt(cur)}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={secondaryButtonStyle} onClick={() => copyAttempt(cur)}>Copia diagnostica</button>
            {history.length > 1 && (
              <button type="button" style={secondaryButtonStyle} onClick={() => setShowPrev((v) => !v)}>
                {showPrev ? 'Nascondi tentativi precedenti' : 'Mostra tentativi precedenti'}
              </button>
            )}
            <button type="button" style={linkButtonStyle} onClick={clearHistory}>Cancella storico</button>
          </div>
          {showPrev && history.slice(1).map((a) => (
            <div key={a.attemptId} style={prevItemStyle}>
              <div style={{ fontWeight: 900, fontSize: 12, color: '#0f172a' }}>
                Tentativo #{a.n} · {statusLabel(a.status)} · ULTIMO STAGE: {a.lastStage || '-'}
              </div>
              <pre style={diagPreStyle}>{formatAttempt(a)}</pre>
              <button type="button" style={secondaryButtonStyle} onClick={() => copyAttempt(a)}>Copia diagnostica</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const mutedStyle = { color: '#64748b', fontSize: 13 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', fontSize: 13 };
const primaryButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 14px', background: '#fff', color: '#17211f', fontWeight: 900, cursor: 'pointer', fontSize: 12 };
const linkButtonStyle = { border: 'none', background: 'none', color: '#2563eb', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 };
const videoStyle = { width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
const previewImgStyle = { width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
const lastDiagStyle = { marginTop: 14, border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'grid', gap: 8 };
const lastDiagHeadStyle = { fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', color: '#334155' };
const lastStageBigStyle = { fontSize: 15, fontWeight: 900, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const diagPreStyle = { margin: 0, fontSize: 10.5, lineHeight: 1.5, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' };
const prevItemStyle = { borderTop: '1px dashed #cbd5e1', paddingTop: 8, display: 'grid', gap: 6 };
