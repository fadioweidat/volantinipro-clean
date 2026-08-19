// P1 ADMIN CONTROL + ROLLBACK — state machine centralizzata + wrapper delle
// 5 RPC transazionali (admin_cancel_campaign, admin_archive_campaign,
// admin_reopen_campaign, admin_revoke_payment_confirmation,
// admin_revoke_assignment_program — vedi supabase/migrations/
// 20260818120000..120200) e funzione di dependency-check per l'hard
// delete sicuro. Un solo punto di verita' per "quali azioni Admin sono
// valide per lo stato corrente" — nessuna condizione di transizione
// duplicata nei componenti UI.
import { supabase } from '../../supabaseClient.js';

// Stati reali di campaigns.status (campaigns_status_check, verificato
// contro lo schema live): draft|pending_review|approved|scheduled|
// in_progress|completed|cancelled|archived|problem.
export const CAMPAIGN_ACTIONS = {
  CANCEL: 'cancel',
  ARCHIVE: 'archive',
  REOPEN: 'reopen',
  REVOKE_PAYMENT: 'revoke_payment',
  REVOKE_PROGRAM: 'revoke_program',
  DELETE: 'delete',
};

/**
 * Azioni Admin valide per lo stato CORRENTE di una campagna. Specchio
 * esatto delle precondizioni gia' verificate server-side in ogni RPC
 * (admin_cancel_campaign, admin_archive_campaign, admin_reopen_campaign) —
 * qui servono solo per decidere quali voci mostrare nel menu; la vera
 * validazione resta sempre lato DB (questa funzione non e' un secondo
 * enforcement, e' solo UX: mostrare solo cio' che puo' davvero riuscire).
 * @param {{status: string, paymentStatus?: string, programStatus?: string}} campaign
 * @returns {string[]} sottoinsieme di CAMPAIGN_ACTIONS
 */
export function getAllowedCampaignActions(campaign) {
  if (!campaign) return [];
  const { status, paymentStatus, programStatus } = campaign;
  const actions = [];

  if (status !== 'cancelled' && status !== 'archived') {
    actions.push(CAMPAIGN_ACTIONS.CANCEL);
  }
  if (status === 'completed' || status === 'cancelled') {
    actions.push(CAMPAIGN_ACTIONS.ARCHIVE);
  }
  if (status === 'completed' || status === 'cancelled' || status === 'archived') {
    actions.push(CAMPAIGN_ACTIONS.REOPEN);
  }
  if (paymentStatus === 'pagato') {
    actions.push(CAMPAIGN_ACTIONS.REVOKE_PAYMENT);
  }
  if (['inviato', 'aperto', 'confermato'].includes(programStatus)) {
    actions.push(CAMPAIGN_ACTIONS.REVOKE_PROGRAM);
  }
  // DELETE e' governato da un check di dipendenze separato
  // (checkCampaignDeleteDependencies), non solo dallo stato — vedi sotto.
  if (status === 'draft') {
    actions.push(CAMPAIGN_ACTIONS.DELETE);
  }
  return actions;
}

export const CAMPAIGN_ACTION_LABELS = {
  [CAMPAIGN_ACTIONS.CANCEL]: 'Annulla',
  [CAMPAIGN_ACTIONS.ARCHIVE]: 'Archivia',
  [CAMPAIGN_ACTIONS.REOPEN]: 'Riapri',
  [CAMPAIGN_ACTIONS.REVOKE_PAYMENT]: 'Revoca conferma pagamento',
  [CAMPAIGN_ACTIONS.REVOKE_PROGRAM]: 'Revoca programma',
  [CAMPAIGN_ACTIONS.DELETE]: 'Elimina definitivamente',
};

// Testo del modal di conferma (sezione 5 del ticket: "mostrare chiaramente
// cosa succede"). Non generico — una frase per azione, coerente con le
// garanzie reali implementate nelle RPC (cosa viene toccato, cosa resta).
export const CAMPAIGN_ACTION_CONFIRM_COPY = {
  [CAMPAIGN_ACTIONS.CANCEL]: {
    title: 'Conferma annullamento',
    body: 'La campagna passera\' allo stato ANNULLATA. Pagamento, assegnazioni e storico GPS non vengono toccati.',
  },
  [CAMPAIGN_ACTIONS.ARCHIVE]: {
    title: 'Conferma archiviazione',
    body: 'La campagna verra\' chiusa amministrativamente (ARCHIVIATA) e nascosta dalle viste operative correnti. Storico e dati restano intatti; puo\' essere riaperta in qualsiasi momento.',
  },
  [CAMPAIGN_ACTIONS.REOPEN]: {
    title: 'Conferma riapertura',
    body: 'La campagna tornera\' allo stato operativo precedente. Nessun dato storico (GPS, pagamento, assegnazioni) viene alterato.',
  },
  [CAMPAIGN_ACTIONS.REVOKE_PAYMENT]: {
    title: 'Conferma revoca pagamento',
    body: 'Il pagamento tornera\' "da pagare". La data/riferimento del pagamento precedentemente confermato NON viene cancellata: resta visibile nello storico.',
  },
  [CAMPAIGN_ACTIONS.REVOKE_PROGRAM]: {
    title: 'Conferma revoca programma',
    body: 'Il programma inviato all\'operatore viene revocato. Gruppo e assegnazione restano invariati. GPS non viene toccato.',
  },
  [CAMPAIGN_ACTIONS.DELETE]: {
    title: 'Eliminazione definitiva',
    body: 'Questa azione rimuove permanentemente la campagna. Non reversibile. Consentita solo per bozze senza alcuna dipendenza operativa (nessun pagamento, assegnazione, programma, sessione GPS o report).',
  },
};

function unwrap({ data, error }) {
  if (error) throw new Error(error.message || 'Operazione non riuscita.');
  return data;
}

export async function adminCancelCampaign(campaignId, reason) {
  return unwrap(await supabase.rpc('admin_cancel_campaign', { p_campaign_id: campaignId, p_reason: reason }));
}

export async function adminArchiveCampaign(campaignId, reason) {
  return unwrap(await supabase.rpc('admin_archive_campaign', { p_campaign_id: campaignId, p_reason: reason }));
}

export async function adminReopenCampaign(campaignId, reason) {
  return unwrap(await supabase.rpc('admin_reopen_campaign', { p_campaign_id: campaignId, p_reason: reason }));
}

export async function adminRevokePaymentConfirmation(campaignId, reason) {
  return unwrap(await supabase.rpc('admin_revoke_payment_confirmation', { p_campaign_id: campaignId, p_reason: reason }));
}

export async function adminRevokeAssignmentProgram(assignmentId, reason) {
  return unwrap(await supabase.rpc('admin_revoke_assignment_program', { p_assignment_id: assignmentId, p_reason: reason }));
}

/**
 * Storico azioni Admin per una campagna (per la timeline/drawer) — sola
 * lettura, RLS admin-only su campaign_admin_action_log.
 */
export async function getCampaignAdminActionLog(campaignId) {
  const { data, error } = await supabase
    .from('campaign_admin_action_log')
    .select('id, action, previous_state, new_state, reason, actor_id, created_at')
    .eq('campaign_id_snapshot', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Impossibile caricare lo storico azioni Admin.');
  return data || [];
}

/**
 * Dependency check esplicito per l'hard delete sicuro (sezione 13 del
 * ticket) — SOLA LETTURA, solo per UX (mostrare subito perche' il delete
 * sarebbe bloccato, senza dover prima tentare la RPC). L'enforcement
 * reale, atomico, e' interamente server-side dentro admin_hard_delete_
 * campaign() (supabase/migrations/20260818140100_admin_hard_delete_
 * campaign.sql) — questa funzione puo' avere una finestra TOCTOU rispetto
 * alla chiamata RPC vera e propria, per questo la RPC ripete tutti questi
 * controlli da capo nella stessa transazione del DELETE.
 *
 * Specchio esatto delle 16 tabelle verificate dalla RPC (audit
 * information_schema completo, non dedotto da migration file).
 * @returns {{safe: boolean, blockers: string[]}}
 */
export async function checkCampaignDeleteDependencies(campaignId) {
  const blockers = [];

  const checks = [
    ['operator_assignments', 'Almeno un\'assegnazione (anche revocata) esiste per questa campagna.'],
    ['operational_groups', 'Almeno un gruppo operativo esiste per questa campagna.'],
    ['assignment_event_log', 'Esiste storico eventi di programma (invio/apertura/conferma/revoca).'],
    ['delivery_sessions', 'Esistono sessioni GPS collegate.'],
    ['gps_tracking_points', 'Esistono punti GPS reali collegati.'],
    ['proof_photos', 'Esistono foto prova collegate.'],
    ['quotes', 'Esiste uno storico preventivi/importi collegato.'],
    ['campaign_assets', 'Esistono file caricati (asset) collegati.'],
    ['ai_reports', 'Esiste un report generato collegato.'],
    ['campaign_zone_progress_history', 'Esiste storico override Admin sulla copertura.'],
    ['campaign_coverage_adjustments', 'Esistono aree Manuale Admin disegnate.'],
    ['campaign_coverage_adjustments_log', 'Esiste storico delle aree Manuale Admin.'],
    ['campaign_zone_snapshots', 'Esistono snapshot territoriali collegati.'],
    ['campaign_events', 'Esiste uno storico eventi campagna collegato.'],
  ];

  const [{ data: campaign }, ...counts] = await Promise.all([
    supabase.from('campaigns').select('metadata').eq('id', campaignId).maybeSingle(),
    ...checks.map(([table]) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)),
  ]);

  const paymentStatus = campaign?.metadata?.payment_status;
  if (paymentStatus === 'pagato') blockers.push('Pagamento confermato presente.');
  checks.forEach(([, message], i) => {
    if ((counts[i]?.count || 0) > 0) blockers.push(message);
  });

  return { safe: blockers.length === 0, blockers };
}

/**
 * Hard delete reale — chiama admin_hard_delete_campaign(), che ripete
 * atomicamente (stessa transazione) tutti i controlli di
 * checkCampaignDeleteDependencies() sopra prima di cancellare, scrive
 * l'audit (campaign_hard_deleted, sopravvive al DELETE tramite
 * campaign_id_snapshot/campaign_title_snapshot immutabili) e cancella SOLO
 * public.campaigns — mai gps_tracking_points/delivery_sessions/
 * proof_photos, verificato live con una batteria di test QA (creazione
 * campagne QA dedicate, mai su campagne reali) prima di collegare questa
 * funzione alla RPC.
 */
export async function hardDeleteCampaign(campaignId, reason) {
  const { error } = await supabase.rpc('admin_hard_delete_campaign', { p_campaign_id: campaignId, p_reason: reason });
  if (error) throw new Error(error.message || 'Eliminazione non riuscita.');
}
