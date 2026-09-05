import { useEffect, useRef, useState } from 'react';
import {
  buildDeliveryWatermarkLines,
  canvasToJpegBlob,
  compressPodImage,
  drawPodWatermark,
  releaseCanvas,
  validatePodImageFile,
} from '../../lib/pod/podPhotoProcessing.js';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { reverseGeocode } from '../../lib/geo/geocodeAddress.js';

// TICKET — MEMORY EXHAUSTION DURING PHOTO CAPTURE (Chrome Android:
// "Impossibile completare l'operazione precedente. Memoria insufficiente.").
//
// Pipeline memoria-safe, UNA foto alla volta:
//   camera File -> compressPodImage (decode DIRETTO a lato lungo 1600px,
//   mai il buffer RGBA full-res) -> drawPodWatermark -> Blob JPEG ~q0.8 ->
//   releaseCanvas (canvas 1x1, backing store liberato SUBITO) -> UNA object
//   URL per l'anteprima -> upload dello STESSO Blob (nessun re-encode) ->
//   cleanup completo.
// In nessun momento vivono contemporaneamente original + canvas + preview:
// dopo la produzione del Blob resta solo il Blob (~300KB-1MB) + la sua URL.
// Mai base64/DataURL in React state. Lock seriale: durante processing o
// upload i pulsanti di scatto sono disabilitati.
export function PodCapture({ campaignId, sessionId, assignmentId = null, accessToken = null, lastPosition, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [meta, setMeta] = useState(null); // { origBytes, origW, origH, finalW, finalH, finalBytes, ms }
  const finalBlobRef = useRef(null);
  const takenAtRef = useRef(null);
  const previewUrlRef = useRef(null);
  const busyRef = useRef(false); // lock seriale: 1 processing / 1 upload
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Cleanup all'unmount: nessuna object URL orfana.
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

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // libera subito la FileList dell'input
    if (!file) return;
    if (busyRef.current) return; // gia' un'immagine in lavorazione
    busyRef.current = true;
    setError(null);
    setStage('preparing');

    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const origBytes = file.size;
    let canvas = null;
    try {
      validatePodImageFile(file);

      // decode + downscale in un passo: mai il full-res in RAM
      const compressed = await compressPodImage(file);
      canvas = compressed.canvas;

      const takenAt = new Date().toISOString();

      // reverse geocoding NON bloccante, time-boxed
      let geo = null;
      if (lastPosition?.lat != null && lastPosition?.lng != null) {
        geo = await reverseGeocode(lastPosition.lat, lastPosition.lng).catch(() => null);
      }

      drawPodWatermark(canvas, buildDeliveryWatermarkLines({
        takenAt,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        city,
        street: geo?.street || null,
        houseNumber: geo?.houseNumber || null,
        geoCity: geo?.city || null,
      }));

      const finalW = canvas.width;
      const finalH = canvas.height;
      const blob = await canvasToJpegBlob(canvas); // ~q0.8

      // libera SUBITO il backing store del canvas: da qui in poi resta solo
      // il Blob (~300KB-1MB) + una object URL per l'anteprima.
      releaseCanvas(canvas);
      canvas = null;

      finalBlobRef.current = blob;
      takenAtRef.current = takenAt;

      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setMeta({
        origBytes,
        origW: compressed.origWidth || null,
        origH: compressed.origHeight || null,
        finalW, finalH,
        finalBytes: blob.size,
        ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
      });
      setStage('preview');
    } catch (err) {
      if (canvas) releaseCanvas(canvas);
      fullCleanup();
      setError(err?.message || 'Foto non valida.');
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
      const record = await uploadProofPhoto({
        campaignId,
        sessionId,
        assignmentId,
        accessToken,
        blob: finalBlobRef.current, // stesso Blob gia' compresso+watermarkato
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        takenAt: takenAtRef.current || new Date().toISOString(),
      });
      onUploaded?.(record);
      resetToIdle();
    } catch (err) {
      // Recovery: lo stato torna utilizzabile, il Blob e' ancora valido per
      // un nuovo tentativo senza rifare processing.
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    } finally {
      busyRef.current = false;
    }
  }

  const scattoDisabled = stage === 'preparing' || stage === 'uploading' || busyRef.current;

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Foto prova campagna</p>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {stage === 'idle' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Data, ora, posizione e "GPS verificato" vengono aggiunti automaticamente alla foto.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} disabled={scattoDisabled} onClick={() => cameraInputRef.current?.click()}>Scatta foto</button>
            <button type="button" style={secondaryButtonStyle} disabled={scattoDisabled} onClick={() => fileInputRef.current?.click()}>Scegli dalla galleria</button>
          </div>
        </div>
      )}

      {stage === 'preparing' && <div style={mutedStyle}>Elaborazione foto e watermark in corso...</div>}

      {stage === 'error' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={errorStyle}>{error}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {finalBlobRef.current && <button type="button" style={primaryButtonStyle} onClick={handleConfirm}>Riprova invio</button>}
            <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Nuovo scatto</button>
          </div>
        </div>
      )}

      {stage === 'preview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewUrl && <img src={previewUrl} alt="Anteprima foto con watermark" style={previewImgStyle} />}
          {meta && (
            <div style={{ ...mutedStyle, fontSize: 11 }}>
              {meta.finalW}×{meta.finalH} · {(meta.finalBytes / 1024).toFixed(0)} KB · {meta.ms} ms
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
    </section>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const mutedStyle = { color: '#64748b', fontSize: 13 };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca', fontSize: 13 };
const primaryButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 16px', background: '#fff', color: '#17211f', fontWeight: 900, cursor: 'pointer' };
const previewImgStyle = { width: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
