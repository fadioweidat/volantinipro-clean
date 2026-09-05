import { useState } from 'react';
import { approveProofPhoto } from '../../lib/services/gps-api.js';

// TICKET — APPROVAZIONE FOTO PROOF ADMIN -> CLIENTE.
// Azione condivisa da GpsMonitor e CampaignReport: nessuna duplicazione di
// logica business. Approva SOLO tramite la RPC approve_proof_photo (guard
// Admin reale lato DB). Loading per singola foto, aggiornamento UI immediato
// via onApproved(photoId, approvedAt) — nessun refresh pagina. Non re-encoda
// nulla: la RPC valorizza solo approved_at/approved_by, l'oggetto storage
// (watermark burnato dal Driver) resta identico.
export function ProofPhotoApproveButton({ photo, onApproved, variant = 'light' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (photo?.approved_at) {
    return <span style={variant === 'dark' ? approvedDark : approvedLight}>Approvata</span>;
  }

  async function handleApprove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await approveProofPhoto(photo.id);
      onApproved?.(photo.id, row?.approved_at || new Date().toISOString(), row);
    } catch (err) {
      setError(err?.message || 'Approvazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  const btn = variant === 'dark' ? btnDark : btnLight;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={handleApprove} disabled={busy} style={{ ...btn, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Approvazione…' : 'Approva'}
      </button>
      {error && <span style={errStyle}>{error}</span>}
    </span>
  );
}

const btnLight = { border: 'none', borderRadius: 8, padding: '6px 12px', background: '#0f766e', color: '#fff', fontWeight: 800, fontSize: 12 };
const btnDark = { border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '6px 12px', background: 'rgba(15,118,110,.9)', color: '#fff', fontWeight: 800, fontSize: 12 };
const approvedLight = { fontSize: 11, fontWeight: 800, color: '#0f766e' };
const approvedDark = { fontSize: 11, fontWeight: 800, color: '#5eead4' };
const errStyle = { fontSize: 11, color: '#b91c1c' };
