import { useRef, useState } from 'react';
import {
  POD_OUTCOME_OPTIONS,
  buildDeliveryWatermarkLines,
  buildProofPhotoNote,
  canvasToJpegBlob,
  compressPodImage,
  drawPodWatermark,
  validatePodImageFile,
} from '../../lib/pod/podPhotoProcessing.js';
import { uploadProofPhoto } from '../../lib/services/gps-api.js';
import { reverseGeocode } from '../../lib/geo/geocodeAddress.js';

const initialForm = { client: '', address: '', ddt: '', colli: '', outcome: 'consegnato', note: '' };

// TICKET — WATERMARK FOTO CLIENTE: `city` e' il Comune REALE della zona/
// campagna attiva (stessa fonte gia' usata per il confine mappa in
// DriverAssignmentPage.jsx — realComuneName), passato dal chiamante. Il
// watermark burnato sulla foto usa SOLO dati automatici (data/ora reali,
// coordinate GPS del dispositivo, questo comune) — mai i campi del form
// sotto (Cliente/Indirizzo/DDT/Colli/Esito), che restano solo per la nota
// di consegna salvata separatamente (proof_photos.note), non per i pixel
// della foto.
export function PodCapture({ campaignId, sessionId, lastPosition, driverName, city = null, onUploaded }) {
  const [stage, setStage] = useState('idle'); // idle | preparing | preview | uploading | error
  const [error, setError] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [previewUrl, setPreviewUrl] = useState(null);
  const canvasRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  function resetToIdle() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    canvasRef.current = null;
    setForm(initialForm);
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
      canvasRef.current = canvas;
      const blob = await canvasToJpegBlob(canvas);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
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
      const takenAt = new Date().toISOString();
      // Fase 4: reverse geocoding NON bloccante e time-boxed. Se risponde in
      // tempo con dati REALI -> via/civico/comune nel watermark; altrimenti
      // (timeout, 429, offline, risposta incompleta) -> null e si ripiega
      // sulle coordinate reali. L'upload prosegue in ogni caso: reverseGeocode
      // non lancia mai e non attende oltre il suo timeout interno.
      let geo = null;
      if (lastPosition?.lat != null && lastPosition?.lng != null) {
        geo = await reverseGeocode(lastPosition.lat, lastPosition.lng).catch(() => null);
      }
      const watermarkLines = buildDeliveryWatermarkLines({
        takenAt,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        city,
        street: geo?.street || null,
        houseNumber: geo?.houseNumber || null,
        geoCity: geo?.city || null,
      });
      drawPodWatermark(canvasRef.current, watermarkLines);
      const finalBlob = await canvasToJpegBlob(canvasRef.current);
      const note = buildProofPhotoNote({ ...form, driverName });

      const record = await uploadProofPhoto({
        campaignId,
        sessionId,
        blob: finalBlob,
        lat: lastPosition?.lat,
        lng: lastPosition?.lng,
        takenAt,
        note,
      });

      onUploaded?.(record);
      resetToIdle();
    } catch (err) {
      setError(err?.message || 'Caricamento foto non riuscito. Riprova.');
      setStage('error');
    }
  }

  function handleRetake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    canvasRef.current = null;
    setError(null);
    setStage('idle');
  }

  function handleCancel() {
    resetToIdle();
  }

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Prova di consegna</p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      {stage === 'idle' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" style={primaryButtonStyle} onClick={() => cameraInputRef.current?.click()}>
            Scatta foto
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => fileInputRef.current?.click()}>
            Scegli dalla galleria
          </button>
        </div>
      )}

      {stage === 'preparing' && <div style={mutedStyle}>Elaborazione foto in corso...</div>}

      {stage === 'error' && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={errorStyle}>{error}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" style={secondaryButtonStyle} onClick={resetToIdle}>Riprova</button>
          </div>
        </div>
      )}

      {stage === 'preview' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {previewUrl && <img src={previewUrl} alt="Anteprima foto prova" style={previewImgStyle} />}

          <div style={formGridStyle}>
            <label style={labelStyle}>Cliente
              <input style={inputStyle} value={form.client} onChange={(e) => setForm((prev) => ({ ...prev, client: e.target.value }))} placeholder="Nome cliente" />
            </label>
            <label style={labelStyle}>Indirizzo
              <input style={inputStyle} value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="Via, civico, comune" />
            </label>
            <label style={labelStyle}>DDT
              <input style={inputStyle} value={form.ddt} onChange={(e) => setForm((prev) => ({ ...prev, ddt: e.target.value }))} placeholder="Numero DDT" />
            </label>
            <label style={labelStyle}>Colli
              <input style={inputStyle} type="number" min="0" value={form.colli} onChange={(e) => setForm((prev) => ({ ...prev, colli: e.target.value }))} placeholder="0" />
            </label>
            <label style={labelStyle}>Esito consegna
              <select style={inputStyle} value={form.outcome} onChange={(e) => setForm((prev) => ({ ...prev, outcome: e.target.value }))}>
                {POD_OUTCOME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Note
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} placeholder="Note aggiuntive (opzionale)" />
            </label>
          </div>

          <div style={mutedStyle}>
            {lastPosition?.lat != null && lastPosition?.lng != null
              ? `Coordinate GPS attuali: ${Number(lastPosition.lat).toFixed(5)}, ${Number(lastPosition.lng).toFixed(5)}`
              : 'Coordinate GPS non disponibili: verranno omesse dal watermark.'}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" style={primaryButtonStyle} onClick={handleConfirm}>Conferma e invia</button>
            <button type="button" style={secondaryButtonStyle} onClick={handleRetake}>Riscatta</button>
            <button type="button" style={dangerButtonStyle} onClick={handleCancel}>Annulla</button>
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
const dangerButtonStyle = { border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', background: '#fff', color: '#b91c1c', fontWeight: 900, cursor: 'pointer' };
const previewImgStyle = { width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, border: '1px solid #e2e8f0', background: '#0b0f14' };
const formGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 };
const labelStyle = { display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: '#475569' };
const inputStyle = { border: '1px solid #cbd5e1', background: '#fff', color: '#17211f', borderRadius: 9, padding: '10px 11px', font: 'inherit' };
