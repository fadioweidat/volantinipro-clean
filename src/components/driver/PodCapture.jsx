import { useRef, useState } from 'react';
import {
  buildDeliveryWatermarkLines,
  canvasToJpegBlob,
  compressPodImage,
  drawPodWatermark,
  validatePodImageFile,
} from '../../lib/pod/podPhotoProcessing.js';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { reverseGeocode } from '../../lib/geo/geocodeAddress.js';

// TICKET — BUG REALE PHOTO CAPTURE FLOW.
// Flusso "Foto prova campagna" ridotto all'essenziale: il Driver preme
// SCATTA FOTO, il sistema fa tutto in automatico (GPS gia' acquisito dal
// tracking + reverse geocoding NON bloccante + watermark burnato sui pixel),
// mostra l'anteprima GIA' watermarkata, e con Conferma la carica.
//   - NESSUN campo manuale (Cliente/Indirizzo/DDT/Colli/Note): l'indirizzo
//     non lo digita piu' il Driver e nessun campo blocca l'invio.
//   - Watermark visibile nell'anteprima, non solo nei metadata DB.
//   - Upload via access_token dell'assignment (mai Magic Link): la RPC
//     driver_register_proof_photo rilegge l'autorizzazione server-side.
// `city` = Comune reale della zona/campagna attiva (fonte interna,
// priorita' sul comune del reverse geocoding). `assignmentId`/`accessToken`
// per l'upload token-mode.
export function PodCapture({ campaignId, sessionId, assignmentId = null, accessToken = null, lastPosition, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const canvasRef = useRef(null);
  const takenAtRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  function clearPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    canvasRef.current = null;
    takenAtRef.current = null;
  }

  function resetToIdle() {
    clearPreview();
    setError(null);
    setStage('idle');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setStage('preparing');
    try {
      validatePodImageFile(file);
      const { canvas } = await compressPodImage(file);
      const takenAt = new Date().toISOString();

      // Reverse geocoding NON bloccante e time-boxed: se risponde in tempo
      // con dati REALI -> via/civico/comune nel watermark; altrimenti
      // (timeout/429/offline/risposta incompleta) -> null e si ripiega sulle
      // coordinate reali. Non lancia mai e non attende oltre il suo timeout.
      let geo = null;
      if (lastPosition?.lat != null && lastPosition?.lng != null) {
        geo = await reverseGeocode(lastPosition.lat, lastPosition.lng).catch(() => null);
      }

      // Watermark burnato SUBITO: l'anteprima mostrata al Driver e' gia'
      // quella definitiva (stesso canvas poi caricato).
      drawPodWatermark(canvas, buildDeliveryWatermarkLines({
        takenAt,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        city,
        street: geo?.street || null,
        houseNumber: geo?.houseNumber || null,
        geoCity: geo?.city || null,
      }));

      canvasRef.current = canvas;
      takenAtRef.current = takenAt;
      const blob = await canvasToJpegBlob(canvas);
      setPreviewUrl(URL.createObjectURL(blob));
      setStage('preview');
    } catch (err) {
      setError(err?.message || 'Foto non valida.');
      setStage('error');
    }
  }

  async function handleConfirm() {
    if (!canvasRef.current) return;
    setStage('uploading');
    setError(null);
    try {
      const finalBlob = await canvasToJpegBlob(canvasRef.current);
      const record = await uploadProofPhoto({
        campaignId,
        sessionId,
        assignmentId,
        accessToken,
        blob: finalBlob,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        takenAt: takenAtRef.current || new Date().toISOString(),
      });
      onUploaded?.(record);
      resetToIdle();
    } catch (err) {
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    }
  }

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Foto prova campagna</p>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {stage === 'idle' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={mutedStyle}>Data, ora, posizione e "GPS verificato" vengono aggiunti automaticamente alla foto.</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} onClick={() => cameraInputRef.current?.click()}>Scatta foto</button>
            <button type="button" style={secondaryButtonStyle} onClick={() => fileInputRef.current?.click()}>Scegli dalla galleria</button>
          </div>
        </div>
      )}

      {stage === 'preparing' && <div style={mutedStyle}>Elaborazione foto e watermark in corso...</div>}

      {stage === 'error' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={errorStyle}>{error}</div>
          <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Riprova</button>
        </div>
      )}

      {stage === 'preview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewUrl && <img src={previewUrl} alt="Anteprima foto con watermark" style={previewImgStyle} />}
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
