import { useEffect, useRef, useState } from 'react';
import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_ACTION_LABELS,
  CAMPAIGN_ACTION_CONFIRM_COPY,
  getAllowedCampaignActions,
  adminCancelCampaign,
  adminArchiveCampaign,
  adminReopenCampaign,
  adminRevokePaymentConfirmation,
  adminRevokeAssignmentProgram,
  checkCampaignDeleteDependencies,
  hardDeleteCampaign,
} from '../../lib/services/admin-transitions-api.js';
import { ConfirmReasonModal, DangerConfirmModal } from './ConfirmReasonModal.jsx';

// P1 ADMIN CONTROL + ROLLBACK — "Azioni Admin": mostra SOLO le azioni
// valide per lo stato corrente (getAllowedCampaignActions, sezione 4 del
// ticket: "NON mostrare 10 azioni sempre attive"). Ogni azione critica
// passa da ConfirmReasonModal (motivo obbligatorio). Nessuna azione viene
// eseguita direttamente dal click — sempre conferma esplicita in mezzo.
export function AdminActionMenu({ campaign, onDone }) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [deleteCheck, setDeleteCheck] = useState(null); // { safe, blockers } | null while loading
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const allowedActions = getAllowedCampaignActions(campaign);

  async function openDeleteConfirm() {
    setOpen(false);
    setPendingAction(CAMPAIGN_ACTIONS.DELETE);
    setDeleteCheck(null);
    // Pre-check di sola lettura, solo UX (mostra subito il motivo del
    // blocco senza dover prima tentare la RPC) — l'enforcement reale e
    // atomico resta interamente dentro admin_hard_delete_campaign().
    try {
      const result = await checkCampaignDeleteDependencies(campaign.id);
      setDeleteCheck(result);
    } catch (err) {
      setDeleteCheck({ safe: false, blockers: [err?.message || 'Impossibile verificare le dipendenze.'] });
    }
  }

  async function runDelete(reason) {
    await hardDeleteCampaign(campaign.id, reason);
    setPendingAction(null);
    onDone?.();
  }

  async function runAction(reason) {
    const campaignId = campaign.id;
    switch (pendingAction) {
      case CAMPAIGN_ACTIONS.CANCEL:
        await adminCancelCampaign(campaignId, reason);
        break;
      case CAMPAIGN_ACTIONS.ARCHIVE:
        await adminArchiveCampaign(campaignId, reason);
        break;
      case CAMPAIGN_ACTIONS.REOPEN:
        await adminReopenCampaign(campaignId, reason);
        break;
      case CAMPAIGN_ACTIONS.REVOKE_PAYMENT:
        await adminRevokePaymentConfirmation(campaignId, reason);
        break;
      case CAMPAIGN_ACTIONS.REVOKE_PROGRAM:
        if (!campaign.assignment?.id) throw new Error('Nessuna assegnazione attiva collegata a questa campagna.');
        await adminRevokeAssignmentProgram(campaign.assignment.id, reason);
        break;
      default:
        throw new Error('Azione non riconosciuta.');
    }
    setPendingAction(null);
    onDone?.();
  }

  if (allowedActions.length === 0) return null;
  const nonDeleteActions = allowedActions.filter((a) => a !== CAMPAIGN_ACTIONS.DELETE);
  const canDelete = allowedActions.includes(CAMPAIGN_ACTIONS.DELETE);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={triggerStyle}>Azioni Admin ▾</button>
      {open && (
        <div style={menuStyle}>
          {nonDeleteActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => { setOpen(false); setPendingAction(action); }}
              style={menuItemStyle}
            >
              {CAMPAIGN_ACTION_LABELS[action]}
            </button>
          ))}
          {canDelete && (
            <button type="button" onClick={openDeleteConfirm} style={{ ...menuItemStyle, color: '#ef4444', borderBottom: 'none' }}>
              {CAMPAIGN_ACTION_LABELS[CAMPAIGN_ACTIONS.DELETE]}
            </button>
          )}
        </div>
      )}
      {pendingAction && pendingAction !== CAMPAIGN_ACTIONS.DELETE && (
        <ConfirmReasonModal
          title={CAMPAIGN_ACTION_CONFIRM_COPY[pendingAction].title}
          body={CAMPAIGN_ACTION_CONFIRM_COPY[pendingAction].body}
          confirmLabel={CAMPAIGN_ACTION_LABELS[pendingAction]}
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}
      {pendingAction === CAMPAIGN_ACTIONS.DELETE && (
        deleteCheck === null ? (
          <div style={overlayLoadingStyle}>Verifica dipendenze in corso...</div>
        ) : !deleteCheck.safe ? (
          <div style={blockedOverlayStyle}>
            <div style={blockedCardStyle}>
              <h3 style={{ margin: '0 0 8px', color: '#ef4444', fontSize: 16 }}>Campagna non eliminabile</h3>
              <p style={{ margin: '0 0 10px', color: '#9CA3AF', fontSize: 13 }}>
                Questa campagna contiene dati operativi. Puo' essere archiviata o annullata, non eliminata definitivamente.
              </p>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: '#D1D5DB', fontSize: 12.5 }}>
                {deleteCheck.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setPendingAction(null)} style={{ background: 'transparent', border: '1px solid #374151', color: '#D1D5DB', fontSize: 13, padding: '8px 14px', borderRadius: 6, cursor: 'pointer' }}>Chiudi</button>
              </div>
            </div>
          </div>
        ) : (
          <DangerConfirmModal
            title="Eliminazione definitiva"
            entityLabel={`ID: ${campaign.id}`}
            body="Questa azione rimuove permanentemente la campagna. Non reversibile."
            confirmToken="ELIMINA"
            onConfirm={runDelete}
            onCancel={() => setPendingAction(null)}
          />
        )
      )}
    </div>
  );
}

const triggerStyle = {
  background: 'rgba(255,255,255,.05)',
  border: '1px solid #4B5563',
  color: '#D1D5DB',
  fontSize: 11,
  fontWeight: 700,
  padding: '4px 8px',
  borderRadius: 5,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const menuStyle = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 4,
  background: '#1F2937',
  border: '1px solid #374151',
  borderRadius: 8,
  minWidth: 200,
  zIndex: 50,
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0,0,0,.4)',
};
const menuItemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(255,255,255,.06)',
  color: '#E5E7EB',
  fontSize: 12.5,
  padding: '9px 12px',
  cursor: 'pointer',
};
const overlayLoadingStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D1D5DB', fontSize: 13 };
const blockedOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 };
const blockedCardStyle = { background: '#111827', border: '1px solid #ef4444', borderRadius: 12, padding: 24, maxWidth: 460, width: '100%' };
