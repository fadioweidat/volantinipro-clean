// Row actions shared by the two views of the admin "Ordini" page (Tabella and Schede), so both
// offer the same actions. Moved unchanged from ClientsQuotes.jsx (Clienti & Preventivi).
import {
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
  buildSupplierProgramWhatsAppMessage,
} from '../services/admin-api.js';
import { buildDriverAppInstallWhatsAppUrl } from '../services/driverAppDistribution.js';
import { resolveProgramRecipient, savedSupplierCompensation } from '../services/recipientResolver.js';
import { buildAdminClientWhatsAppMessage, buildWhatsAppUrl } from './clientsQuotesView.js';

export const PAID_STATUSES = ['pagato', 'settled_by_credit', 'settled_by_verified_receipt'];
export const isRowPaid = (row) => PAID_STATUSES.includes(row?.paymentStatus);

/** Campaign shape for AdminActionMenu: the menu needs the real campaign status, not the normalized one. */
export const actionMenuCampaign = (row) => ({ ...row, status: row?.rawStatus || row?.status });

/** WhatsApp chat with the client's own number (never the VolantiniPro one); no state change. */
export function openClientWhatsApp(row) {
  const url = buildWhatsAppUrl(row.phone, buildAdminClientWhatsAppMessage(row));
  if (!url) {
    alert('Numero di telefono cliente non disponibile.');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Same text as the WhatsApp message, copied to the clipboard. */
export async function copyClientSummary(row) {
  try {
    await navigator.clipboard?.writeText(buildAdminClientWhatsAppMessage(row));
  } catch {
    /* clipboard non disponibile: nessuna azione distruttiva */
  }
}

export function canSendDriverProgram(row) {
  return isRowPaid(row) && Boolean(row.assignment) && resolveProgramRecipient({ assignment: row.assignment }).valid;
}

/** Opens WhatsApp with the job link for the assigned driver or supplier. */
export function sendDriverProgram(row) {
  const assignment = row.assignment;
  if (!assignment) {
    alert('Nessun programma creato per questa campagna. Assegna prima un gruppo.');
    return;
  }
  if (!isRowPaid(row)) {
    alert('Conferma prima il pagamento.');
    return;
  }
  const resolved = resolveProgramRecipient({ assignment });
  if (!resolved.valid || !resolved.phone) {
    alert(resolved.error || 'Numero destinatario non disponibile. Verifica i dati di contatto dell\'assegnazione.');
    return;
  }

  const link = generateDriverAssignmentLink(assignment.id, assignment.access_token);
  const programRows = (row.programZones || []).map((z, idx) => ({ name: z.name, quantity: z.quantity, priority: idx + 1 }));
  const totalQty = programRows.reduce((sum, z) => sum + (z.quantity || 0), 0);
  const supplierCompensation = savedSupplierCompensation(assignment, row);
  const isSupplierTarget = Boolean(
    resolved.recipientType === 'manual_supplier' ||
    resolved.recipientType === 'registered_supplier' ||
    row.supplierName ||
    assignment.metadata?.supplier_name ||
    assignment.metadata?.manual_supplier?.name ||
    supplierCompensation != null
  );
  const recipientDisplayName = resolved.recipientName || row.supplierName || assignment.metadata?.supplier_name || assignment.metadata?.manual_supplier?.name || row.group?.name || row.operator?.name;
  const common = {
    groupName: row.group?.name || null,
    campaignTitle: row.name || row.client,
    date: assignment.starts_at ? new Date(assignment.starts_at).toLocaleDateString('it-IT') : 'Da definire',
    startTime: assignment.starts_at ? new Date(assignment.starts_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null,
    comuni: programRows.map((r) => r.name),
    zone: programRows.map((r, idx) => `${idx + 1}. ${r.name}`),
    programRows,
    qty: totalQty || null,
    supplierCompensation,
    link,
  };
  const msg = isSupplierTarget
    ? buildSupplierProgramWhatsAppMessage({ supplierName: recipientDisplayName, service: row.service, ...common })
    : buildDriverWhatsAppMessage({ operatorName: recipientDisplayName, ...common });
  window.open(`https://wa.me/${resolved.phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  alert('WhatsApp aperto. Lo stato "Inviato" verra mostrato solo dopo un evento reale del driver (apertura/conferma programma).');
}

export function canOpenDriverApp(row) {
  return Boolean(row.assignment) && resolveProgramRecipient({ assignment: row.assignment }).valid;
}

/** Driver app install message: same for everyone, no personal link. */
export function openDriverAppInstall(row) {
  window.open(buildDriverAppInstallWhatsAppUrl(resolveProgramRecipient({ assignment: row.assignment }).phone), '_blank', 'noopener,noreferrer');
}
