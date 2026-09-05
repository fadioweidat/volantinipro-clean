import { useEffect, useRef, useState } from 'react';
import {
  buildDeliveryWatermarkLines,
  canvasToJpegBlob,
  compressPodImage,
  detectLowMemoryDevice,
  drawPodWatermark,
  isMemoryError,
  makeThumbnailBlob,
  POD_MEMORY_PROFILES,
  releaseCanvas,
  validatePodImageFile,
} from '../../lib/pod/podPhotoProcessing.js';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { reverseGeocode } from '../../lib/geo/geocodeAddress.js';

// TICKET — DIAGNOSTICA FOTO NON VISIBILE NELLA DRIVER APP REALE.
//
// Sul telefono reale l'errore "Impossibile completare l'operazione precedente.
// Memoria insufficiente." fa perdere lo stato React del componente (la card
// torna subito a idle, spesso perche' il renderer Chrome viene ricaricato o
// il componente viene rimontato) e con esso spariva la diagnostica di fase.
//
// Ora la diagnostica NON vive piu' solo nello stato React: ogni stage viene
// scritto SUBITO in sessionStorage (`pod_photo_last_diagnostic`). Al mount il
// componente la rilegge. Se l'ultima diagnostica non e' "finalized" significa
// che il flusso e' stato interrotto senza un errore JS catturabile — quasi
// sempre un OOM del renderer: lo si dichiara esplicitamente.
//
// La sezione "Ultima diagnostica foto" e il pulsante "Copia diagnostica" sono
// SEMPRE visibili sotto la card (anche a flusso idle) finche' esiste una
// diagnostica salvata. fullCleanup / resetToIdle / reset dell'input NON la
// cancellano mai.
//
// Ordine stage: input_received -> dimensions_read -> bitmap_start ->
// bitmap_done -> canvas_draw_start -> canvas_draw_done -> watermark_start ->
// watermark_done -> blob_start -> blob_done -> thumb_start -> thumb_done ->
// preview_ready -> upload_start -> storage_upload_done -> rpc_register_start
// -> rpc_register_done -> cleanup_done.
// Sentinella: camera_pre_js = errore PRIMA che il file arrivi al codice JS.

const LOW_MEMORY_FLAG = 'pod_forced_low_memory';
const DIAG_KEY = 'pod_photo_last_diagnostic';
const MAX_STAGE_ROWS = 60;

function readForcedLowMemory() {
  try { return localStorage.getItem(LOW_MEMORY_FLAG) === '1'; } catch { return false; }
}
function persistForcedLowMemory() {
  try { localStorage.setItem(LOW_MEMORY_FLAG, '1'); } catch { /* storage non disponibile */ }
}
function loadLastDiagnostic() {
  try {
    const raw = sessionStorage.getItem(DIAG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}
function saveLastDiagnostic(diag) {
  try { sessionStorage.setItem(DIAG_KEY, JSON.stringify(diag)); } catch { /* storage non disponibile */ }
  try { console.info('[PodCapture] diagnostic', JSON.stringify(diag)); } catch { /* console non disponibile */ }
}

// Costruisce l'oggetto diagnostica dai campi noti + dagli stage gia' raccolti.
function buildDiagnostic(stages, extra) {
  const pick = (name) => stages.find((s) => s.stage === name) || null;
  const input = pick('input_received');
  const dims = pick('dimensions_read');
  const blobDone = pick('blob_done');
  const last = stages.length ? stages[stages.length - 1].stage : null;
  return {
    lastStage: extra?.lastStageOverride || last || 'sconosciuto',
    beforePipeline: !!extra?.beforePipeline,
    errorName: extra?.error?.name || null,
    errorMessage: extra?.error ? (extra.error.message || String(extra.error)) : (extra?.errorMessage || null),
    memoryError: extra?.memoryError ?? null,
    origBytes: input?.origBytes ?? null,
    origWidth: dims?.origWidth ?? null,
    origHeight: dims?.origHeight ?? null,
    targetWidth: dims?.targetWidth ?? null,
    targetHeight: dims?.targetHeight ?? null,
    finalBytes: blobDone?.finalBytes ?? null,
    elapsedMs: extra?.elapsedMs ?? (stages.length ? stages[stages.length - 1].atMs : null),
    timestamp: new Date().toISOString(),
    profile: extra?.profile || null,
    deviceMemory: (typeof navigator !== 'undefined' ? navigator.deviceMemory : null) ?? null,
    finalized: !!extra?.finalized,
    stages,
  };
}

export function PodCapture({ campaignId, sessionId, assignmentId = null, accessToken = null, lastPosition, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [meta, setMeta] = useState(null); // { origBytes, origW, origH, finalW, finalH, finalBytes, ms }
  const [profileId, setProfileId] = useState(
    () => ((detectLowMemoryDevice() || readForcedLowMemory()) ? 'low' : 'default'),
  );
  const [memoryFailure, setMemoryFailure] = useState(false);
  // Diagnostica persistente: sopravvive a rimonti e reload del renderer.
  const [lastDiagnostic, setLastDiagnostic] = useState(() => loadLastDiagnostic());

  const finalBlobRef = useRef(null);
  const takenAtRef = useRef(null);
  const previewUrlRef = useRef(null);
  const busyRef = useRef(false); // lock seriale: 1 processing / 1 upload
  const profileRef = useRef(profileId);
  const stageLogRef = useRef([]);
  const t0Ref = useRef(0);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  profileRef.current = profileId;

  // Al mount: se l'ultima diagnostica salvata non e' finalized, il flusso e'
  // stato interrotto senza un errore JS -> quasi sempre OOM del renderer.
  useEffect(() => {
    const d = loadLastDiagnostic();
    if (d && !d.finalized) {
      const promoted = {
        ...d,
        finalized: true,
        interrupted: true,
        memoryError: d.memoryError ?? true,
        errorMessage: d.errorMessage || 'Flusso interrotto senza errore JavaScript catturabile (probabile esaurimento memoria del renderer).',
      };
      saveLastDiagnostic(promoted);
      setLastDiagnostic(promoted);
    } else if (d) {
      setLastDiagnostic(d);
    }
  }, []);

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  // Registra uno stage e lo persiste SUBITO: se il renderer muore ora, al
  // mount successivo l'ultimo stage senza il suo *_done e' il punto di rottura.
  function pushStage(name, extra) {
    const entry = { stage: name, atMs: Math.round(nowMs() - (t0Ref.current || nowMs())), ...(extra || {}) };
    stageLogRef.current = [...stageLogRef.current, entry].slice(-MAX_STAGE_ROWS);
    const diag = buildDiagnostic(stageLogRef.current, {
      profile: profileRef.current,
      finalized: name === 'cleanup_done',
    });
    saveLastDiagnostic(diag);
    setLastDiagnostic(diag);
  }

  // Chiude la diagnostica con un esito d'errore (o pre-pipeline) e la persiste.
  function finalizeDiagnostic(extra) {
    const diag = buildDiagnostic(stageLogRef.current, { ...extra, profile: profileRef.current, finalized: true });
    saveLastDiagnostic(diag);
    setLastDiagnostic(diag);
    return diag;
  }

  function revokePreview() {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* gia' revocata */ }
      previewUrlRef.current = null;
    }
  }

  // NON tocca lastDiagnostic ne' sessionStorage: la diagnostica deve
  // sopravvivere a errore, reset e distruzione dell'anteprima.
  function fullCleanup() {
    revokePreview();
    setPreviewUrl(null);
    finalBlobRef.current = null;
    takenAtRef.current = null;
  }

  useEffect(() => () => { revokePreview(); finalBlobRef.current = null; }, []);

  function resetToIdle() {
    fullCleanup();
    setMeta(null);
    setError(null);
    setStage('idle');
    busyRef.current = false;
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function switchToLowMemory() {
    profileRef.current = 'low';
    setProfileId('low');
    persistForcedLowMemory();
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // libera SUBITO la FileList dell'input
    if (busyRef.current) return; // gia' un'immagine in lavorazione

    if (!file) {
      // Item 6: nessun file arrivato al codice JS -> errore/annullo PRIMA
      // che la foto entri nella pipeline (camera intent / OS Android / OOM
      // durante il ritorno dalla fotocamera).
      stageLogRef.current = [];
      t0Ref.current = nowMs();
      finalizeDiagnostic({
        lastStageOverride: 'camera_pre_js',
        beforePipeline: true,
        memoryError: null,
        errorMessage: 'Errore avvenuto prima che la foto arrivasse alla pipeline JavaScript',
      });
      setError('Nessuna foto ricevuta dalla fotocamera. Riprova.');
      setStage('error');
      return;
    }

    busyRef.current = true;
    setError(null);
    setMemoryFailure(false);
    setStage('preparing');

    t0Ref.current = nowMs();
    stageLogRef.current = [];

    const profile = POD_MEMORY_PROFILES[profileRef.current] || POD_MEMORY_PROFILES.default;
    const origBytes = file.size;
    pushStage('input_received', { origBytes, type: file.type || null, profile: profile.id });

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
        origBytes,
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
      finalizeDiagnostic({ error: err, memoryError: mem, elapsedMs: Math.round(nowMs() - t0Ref.current) });
      if (canvas) releaseCanvas(canvas);
      fullCleanup();
      if (mem) {
        switchToLowMemory();
        setMemoryFailure(true);
        setError('Memoria del telefono insufficiente durante l\'elaborazione. Riprova in modalita\' leggera (foto piu\' piccola).');
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
      resetToIdle();
    } catch (err) {
      const mem = isMemoryError(err);
      finalizeDiagnostic({ error: err, memoryError: mem, lastStageOverride: 'upload', elapsedMs: Math.round(nowMs() - t0Ref.current) });
      if (mem) { switchToLowMemory(); setMemoryFailure(true); }
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  function copyLastDiagnostic() {
    if (!lastDiagnostic) return;
    try { navigator.clipboard?.writeText(JSON.stringify(lastDiagnostic, null, 2)); } catch { /* clipboard non disponibile */ }
  }

  function clearLastDiagnostic() {
    try { sessionStorage.removeItem(DIAG_KEY); } catch { /* ignore */ }
    setLastDiagnostic(null);
  }

  const scattoDisabled = stage === 'preparing' || stage === 'uploading' || busyRef.current;
  const profileLabel = profileRef.current === 'low' ? 'leggera (1280px)' : 'standard (1600px)';

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Foto prova campagna</p>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {stage === 'idle' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Data, ora, posizione e "GPS verificato" vengono aggiunti automaticamente alla foto.</div>
          <div style={{ ...mutedStyle, fontSize: 11 }}>Modalita' foto: {profileLabel}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} disabled={scattoDisabled} onClick={() => cameraInputRef.current?.click()}>Scatta foto</button>
            <button type="button" style={secondaryButtonStyle} disabled={scattoDisabled} onClick={() => fileInputRef.current?.click()}>Scegli dalla galleria</button>
          </div>
          {profileRef.current === 'low' && (
            <button type="button" style={linkButtonStyle} onClick={() => { profileRef.current = 'default'; setProfileId('default'); try { localStorage.removeItem(LOW_MEMORY_FLAG); } catch { /* ignore */ } }}>
              Torna alla modalita' standard
            </button>
          )}
        </div>
      )}

      {stage === 'preparing' && <div style={mutedStyle}>Elaborazione foto e watermark in corso ({profileLabel})...</div>}

      {stage === 'error' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={errorStyle}>{error}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {finalBlobRef.current && <button type="button" style={primaryButtonStyle} onClick={handleConfirm}>Riprova invio</button>}
            {(memoryFailure || profileRef.current === 'low') && !finalBlobRef.current && (
              <button type="button" style={primaryButtonStyle} onClick={() => { switchToLowMemory(); resetToIdle(); cameraInputRef.current?.click(); }}>Riprova in modalita' leggera</button>
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
            <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Riscatta</button>
          </div>
        </div>
      )}

      {stage === 'uploading' && <div style={mutedStyle}>Caricamento foto in corso...</div>}

      {/* SEMPRE visibile finche' esiste una diagnostica salvata: anche a idle,
          anche dopo un rimonto / reload del renderer (sessionStorage). */}
      {lastDiagnostic && (
        <div style={lastDiagStyle}>
          <div style={lastDiagHeadStyle}>Ultima diagnostica foto</div>
          <div style={lastStageBigStyle}>ULTIMO STAGE: {lastDiagnostic.lastStage || 'sconosciuto'}</div>
          {lastDiagnostic.beforePipeline && (
            <div style={errorStyle}>Errore avvenuto prima che la foto arrivasse alla pipeline JavaScript</div>
          )}
          {lastDiagnostic.interrupted && !lastDiagnostic.beforePipeline && (
            <div style={errorStyle}>Flusso interrotto senza errore JavaScript — probabile esaurimento memoria del renderer Chrome.</div>
          )}
          <pre style={diagPreStyle}>{formatDiagnostic(lastDiagnostic)}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={secondaryButtonStyle} onClick={copyLastDiagnostic}>Copia diagnostica</button>
            <button type="button" style={linkButtonStyle} onClick={clearLastDiagnostic}>Nascondi</button>
          </div>
        </div>
      )}
    </section>
  );
}

function formatDiagnostic(d) {
  const head = [
    `timestamp     ${d.timestamp || '-'}`,
    `ultimo stage  ${d.lastStage || '-'}`,
    `error.name    ${d.errorName || '-'}`,
    `error.message ${d.errorMessage || '-'}`,
    `memoryError   ${d.memoryError === null || d.memoryError === undefined ? '-' : d.memoryError}`,
    `profilo       ${d.profile || '-'}  deviceMemory ${d.deviceMemory ?? '-'}`,
    `origBytes     ${d.origBytes ?? '-'}   orig ${d.origWidth ?? '-'}x${d.origHeight ?? '-'}`,
    `target        ${d.targetWidth ?? '-'}x${d.targetHeight ?? '-'}`,
    `finalBytes    ${d.finalBytes ?? '-'}   elapsed ${d.elapsedMs ?? '-'} ms`,
    `finalized     ${!!d.finalized}${d.interrupted ? ' (interrotto)' : ''}`,
    '— stages —',
  ].join('\n');
  const rows = (d.stages || []).map((s) => {
    const extra = Object.keys(s).filter((k) => k !== 'stage' && k !== 'atMs')
      .map((k) => `${k}=${s[k]}`).join(' ');
    return `+${String(s.atMs).padStart(5)}ms  ${s.stage}${extra ? '  ' + extra : ''}`;
  }).join('\n');
  return `${head}\n${rows}`;
}

const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const mutedStyle = { color: '#64748b', fontSize: 13 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', fontSize: 13 };
const primaryButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 16px', background: '#fff', color: '#17211f', fontWeight: 900, cursor: 'pointer' };
const linkButtonStyle = { border: 'none', background: 'none', color: '#2563eb', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 };
const previewImgStyle = { width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
const lastDiagStyle = { marginTop: 14, border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'grid', gap: 8 };
const lastDiagHeadStyle = { fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.1em', color: '#334155' };
const lastStageBigStyle = { fontSize: 15, fontWeight: 900, color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const diagPreStyle = { margin: 0, fontSize: 10.5, lineHeight: 1.5, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' };
