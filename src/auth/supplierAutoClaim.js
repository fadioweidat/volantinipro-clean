import { supplierApply } from '../lib/services/supplier-api.js';

// Percorso UNICO di auto-claim della candidatura fornitore pending
// (localStorage 'vp_pending_supplier_application' o user_metadata di
// signup). Prima di questo fix, SupplierGuard.jsx e SupplierDashboard.jsx
// duplicavano indipendentemente questa stessa logica (stessa chiave
// localStorage, stessi campi di fallback) — un rischio di doppia esecuzione/
// race se entrambi montavano quasi simultaneamente. Ora e' chiamato SOLO da
// SupplierGuard (l'unico componente che puo' davvero trovarsi nello stato
// "autenticato, nessuna riga supplier_profiles ancora"): SupplierDashboard
// monta solo dopo che il Guard ha già risolto lo stato a 'ok', quindi non ha
// mai bisogno di questo percorso.
//
// Idempotente: se non c'e' nulla di pending (localStorage vuoto e nessun
// dato utile in user_metadata) non chiama alcuna RPC. Dopo una chiamata
// riuscita rimuove la chiave localStorage, cosi' un refresh/re-render
// successivo non trova piu' nulla da reclamare (nessuna doppia mutazione).
export async function claimPendingSupplierApplication(user) {
  if (!user) return null;

  let pending = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vp_pending_supplier_application') : null;
    if (raw) pending = JSON.parse(raw);
  } catch { /* ignore malformed value */ }

  const company = pending?.companyName || user.user_metadata?.company_name || '';
  const contact = pending?.contactName || user.user_metadata?.contact_name || '';
  const phone = pending?.phone || user.user_metadata?.phone || '';

  if (!company && !contact && !phone) return null;

  await supplierApply({
    companyName: company || 'Fornitore',
    contactName: contact || null,
    phone: phone || null,
  });
  try { localStorage.removeItem('vp_pending_supplier_application'); } catch { /* ignore */ }
  return true;
}
