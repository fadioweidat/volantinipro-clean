import { useState } from 'react';

// P1 ADMIN CONTROL + ROLLBACK — modal di conferma generico per azioni
// Admin critiche, con campo motivo OBBLIGATORIO (sezione 5 del ticket).
// Il motivo e' anche validato lato DB (reason NOT NULL + CHECK
// btrim(reason)<>'' su campaign_admin_action_log) — questa validazione
// client-side e' solo UX, non l'unica barriera.
export function ConfirmReasonModal({ title, body, confirmLabel = 'Conferma', busyLabel = 'In corso...', onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmedReason = reason.trim();
  const canConfirm = trimmedReason.length > 0 && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(trimmedReason);
    } catch (err) {
      setError(err?.message || 'Operazione non riuscita.');
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <h3 style={titleStyle}>{title}</h3>
        <p style={bodyStyle}>{body}</p>

        <label style={labelStyle}>
          Motivo
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Descrivi il motivo di questa azione..."
            disabled={busy}
            style={textareaStyle}
            autoFocus
          />
        </label>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={actionsStyle}>
          <button type="button" onClick={onCancel} disabled={busy} style={cancelBtnStyle}>Annulla</button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={confirmBtnStyle(canConfirm)}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Variante "danger" per hard delete (sezione 14): richiede digitare
// esattamente il token atteso (es. "ELIMINA" o l'ID campagna), non un
// semplice confirm() browser.
export function DangerConfirmModal({ title, body, entityLabel, confirmToken, confirmLabel = 'Elimina definitivamente', onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [typedToken, setTypedToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const trimmedReason = reason.trim();
  const canConfirm = trimmedReason.length > 0 && typedToken === confirmToken && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(trimmedReason);
    } catch (err) {
      setError(err?.message || 'Operazione non riuscita.');
      setBusy(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...cardStyle, border: '1px solid #ef4444' }}>
        <h3 style={{ ...titleStyle, color: '#ef4444' }}>{title}</h3>
        {entityLabel && <p style={{ ...bodyStyle, fontFamily: 'monospace', fontSize: 12 }}>{entityLabel}</p>}
        <p style={bodyStyle}>{body}</p>

        <label style={labelStyle}>
          Motivo
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} style={textareaStyle} />
        </label>

        <label style={labelStyle}>
          Digita <strong style={{ color: '#ef4444' }}>{confirmToken}</strong> per confermare
          <input
            type="text"
            value={typedToken}
            onChange={(e) => setTypedToken(e.target.value)}
            disabled={busy}
            style={{ ...textareaStyle, minHeight: 'auto' }}
          />
        </label>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={actionsStyle}>
          <button type="button" onClick={onCancel} disabled={busy} style={cancelBtnStyle}>Annulla</button>
          <button type="button" onClick={handleConfirm} disabled={!canConfirm} style={dangerBtnStyle(canConfirm)}>
            {busy ? 'Eliminazione in corso...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const cardStyle = { background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%' };
const titleStyle = { margin: '0 0 8px', color: '#fff', fontSize: 18 };
const bodyStyle = { margin: '0 0 16px', color: '#9CA3AF', fontSize: 13, lineHeight: 1.5 };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.6)', marginBottom: 12 };
const textareaStyle = { minHeight: 64, background: 'rgba(255,255,255,.04)', border: '1px solid #374151', borderRadius: 8, color: '#fff', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' };
const errorStyle = { background: 'rgba(239,68,68,.1)', border: '1px solid #ef4444', color: '#ef4444', padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13 };
const actionsStyle = { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 };
const cancelBtnStyle = { background: 'transparent', border: '1px solid #374151', color: '#D1D5DB', fontSize: 13, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' };
function confirmBtnStyle(enabled) {
  return { background: enabled ? '#e8571a' : 'rgba(232,87,26,.3)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, padding: '8px 14px', borderRadius: 6, cursor: enabled ? 'pointer' : 'not-allowed' };
}
function dangerBtnStyle(enabled) {
  return { background: enabled ? '#ef4444' : 'rgba(239,68,68,.3)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, padding: '8px 14px', borderRadius: 6, cursor: enabled ? 'pointer' : 'not-allowed' };
}
