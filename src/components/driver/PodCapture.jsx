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

// TICKET — PHOTO PIPELINE STILL FAILS ON REAL ANDROID DEVICE.
//
// Il fix precedente (decode-at-target + releaseCanvas + lock seriale) NON ha
// risolto "Impossibile completare l'operazione precedente. Memoria
// insufficiente." sul telefono reale. Questo giro NON introduce ottimizzazioni
// speculative: aggiunge (1) diagnostica di fase per capire ESATTAMENTE dove
// fallisce, (2) un profilo memoria dinamico (default 1600px/q0.8 vs low
// 1280px/q0.7), (3) anteprima via thumbnail dedicata (<=480px) invece del
// blob finale, (4) recovery "modalita' leggera" dopo un errore di memoria.
//
// Ordine stage (ognuno loggato con timestamp relativo, dimensioni, elapsed,
// error.name/message; MAI token o dati sensibili):
//   input_received -> dimensions_read -> bitmap_start -> bitmap_done ->
//   canvas_draw_start -> canvas_draw_done -> watermark_start -> watermark_done
//   -> blob_start -> blob_done -> thumb_start -> thumb_done -> preview_ready
//   -> upload_start -> storage_upload_done -> rpc_register_start ->
//   rpc_register_done -> cleanup_done

const LOW_MEMORY_FLAG = 'pod_forced_low_memory';
const MAX_STAGE_ROWS = 60;

function readForcedLowMemory() {
  try { return localStorage.getItem(LOW_MEMORY_FLAG) === '1'; } catch { return false; }
}
function persistForcedLowMemory() {
  try { localStorage.setItem(LOW_MEMORY_FLAG, '1'); } catch { /* storage non disponibile */ }
}

export function PodCapture({ campaignId, sessionId, assignmentId = null, accessToken = null, lastPosition, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [meta, setMeta] = useState(null); // { origBytes, origW, origH, finalW, finalH, finalBytes, ms }
  const [stageLog, setStageLog] = useState([]); // diagnostica di fase (temporanea)
  const [profileId, setProfileId] = useState(
    () => ((detectLowMemoryDevice() || readForcedLowMemory()) ? 'low' : 'default'),
  );
  const [memoryFailure, setMemoryFailure] = useState(false);

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

  function nowMs() {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  // Registra uno stage: timestamp relativo all'inizio dello scatto corrente,
  // + qualunque campo extra (dimensioni, byte, error.name/message).
  function pushStage(name, extra) {
    const entry = { stage: name, atMs: Math.round(nowMs() - (t0Ref.current || nowMs())), ...(extra || {}) };
    stageLogRef.current = [...stageLogRef.current, entry].slice(-MAX_STAGE_ROWS);
    setStageLog(stageLogRef.current);
    try { console.info('[PodCapture]', JSON.stringify(entry)); } catch { /* console non disponibile */ }
  }

  function revokePreview() {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* gia' revocata */ }
      previewUrlRef.current = null;
    }
  }

  function fullCleanup() {
    revokePreview();
    setPreviewUrl(null);
    finalBlobRef.current = null;
    takenAtRef.current = null;
  }

  // Cleanup all'unmount: nessuna object URL orfana, nessun Blob trattenuto.
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
    if (!file) return;
    if (busyRef.current) return; // gia' un'immagine in lavorazione
    busyRef.current = true;
    setError(null);
    setMemoryFailure(false);
    setStage('preparing');

    t0Ref.current = nowMs();
    stageLogRef.current = [];
    setStageLog([]);

    const profile = POD_MEMORY_PROFILES[profileRef.current] || POD_MEMORY_PROFILES.default;
    const origBytes = file.size;
    pushStage('input_received', { origBytes, type: file.type || null, profile: profile.id });

    let canvas = null;
    try {
      validatePodImageFile(file);

      // decode + downscale in un passo, secondo il profilo memoria attivo
      const compressed = await compressPodImage(file, { maxDimension: profile.maxDimension, onStage: pushStage });
      canvas = compressed.canvas;

      const takenAt = new Date().toISOString();

      // reverse geocoding NON bloccante, time-boxed
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
      const blob = await canvasToJpegBlob(canvas, profile.quality); // upload usa QUESTO blob
      pushStage('blob_done', { finalBytes: blob.size, finalW, finalH });

      // anteprima leggera: thumbnail <=480px dal canvas finale, poi si libera
      // il canvas grande. La preview <img> non decodifica mai il JPEG finale.
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
      pushStage('error', { failedAfter: stageLogRef.current[stageLogRef.current.length - 1]?.stage || 'input_received', name: err?.name || null, message: err?.message || String(err), memoryError: mem });
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
        blob: finalBlobRef.current, // stesso Blob gia' compresso+watermarkato
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
      pushStage('error', { failedAfter: 'upload', name: err?.name || null, message: err?.message || String(err), memoryError: mem });
      if (mem) { switchToLowMemory(); setMemoryFailure(true); }
      // Recovery: lo stato torna utilizzabile, il Blob e' ancora valido per un
      // nuovo tentativo di upload senza rifare il processing.
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  function copyDiagnostics() {
    const text = JSON.stringify({ profile: profileRef.current, deviceMemory: (typeof navigator !== 'undefined' ? navigator.deviceMemory : null) ?? null, meta, stages: stageLogRef.current }, null, 2);
    try { navigator.clipboard?.writeText(text); } catch { /* clipboard non disponibile */ }
  }

  const scattoDisabled = stage === 'preparing' || stage === 'uploading' || busyRef.current;
  const profileLabel = profileRef.current === 'low' ? 'leggera (1280px)' : 'standard (1600px)';

  const diagnosticsBlock = stageLog.length > 0 && (
    <details style={diagStyle}>
      <summary style={diagSummaryStyle}>Diagnostica ({stageLog.length} stage) · modalita' {profileLabel}</summary>
      <pre style={diagPreStyle}>{stageLog.map((s) => `+${String(s.atMs).padStart(5)}ms  ${s.stage}${formatExtra(s)}`).join('\n')}</pre>
      <button type="button" style={secondaryButtonStyle} onClick={copyDiagnostics}>Copia diagnostica</button>
    </details>
  );

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

      {stage === 'preparing' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Elaborazione foto e watermark in corso ({profileLabel})...</div>
          {diagnosticsBlock}
        </div>
      )}

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
          {diagnosticsBlock}
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
          {diagnosticsBlock}
        </div>
      )}

      {stage === 'uploading' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Caricamento foto in corso...</div>
          {diagnosticsBlock}
        </div>
      )}
    </section>
  );
}

function formatExtra(s) {
  const keys = Object.keys(s).filter((k) => k !== 'stage' && k !== 'atMs');
  if (!keys.length) return '';
  return '  ' + keys.map((k) => `${k}=${s[k]}`).join(' ');
}

const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const mutedStyle = { color: '#64748b', fontSize: 13 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', fontSize: 13 };
const primaryButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 16px', background: '#fff', color: '#17211f', fontWeight: 900, cursor: 'pointer' };
const linkButtonStyle = { border: 'none', background: 'none', color: '#2563eb', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0, justifySelf: 'start' };
const previewImgStyle = { width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
const diagStyle = { border: '1px dashed #cbd5e1', borderRadius: 10, padding: 10, background: '#f8fafc' };
const diagSummaryStyle = { fontSize: 12, fontWeight: 900, color: '#334155', cursor: 'pointer' };
const diagPreStyle = { margin: '8px 0', fontSize: 10.5, lineHeight: 1.5, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' };
