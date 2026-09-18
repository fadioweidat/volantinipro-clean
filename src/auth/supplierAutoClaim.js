import { supabase } from '../lib/supabaseClient.js';
import { supplierApply } from '../lib/services/supplier-api.js';

// Percorso UNICO di auto-claim della candidatura fornitore pending.
// 1. Chiama la RPC server-side claim_supplier_application() che legge l'email
//    da auth.users e associa la riga pending in supplier_applications (device-independent,
//    funziona anche su dispositivo diverso o senza localStorage).
// 2. Fallback su localStorage/user_metadata via supplierApply() in caso di legacy.
export async function claimPendingSupplierApplication(user) {
  if (!user) return null;

  try {
    // Primary path: Canonical server-side claim
    const { data: claimData, error: claimErr } = await supabase.rpc('claim_supplier_application');
    if (!claimErr && claimData && (claimData.claimed || claimData.already_registered)) {
      try { localStorage.removeItem('vp_pending_supplier_application'); } catch { /* ignore */ }
      return true;
    }
  } catch (err) {
    console.warn('[supplierAutoClaim] claim_supplier_application RPC error, attempting fallback:', err);
  }

  // Fallback path: localStorage or user_metadata
  let pending = null;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('vp_pending_supplier_application') : null;
    if (raw) pending = JSON.parse(raw);
  } catch { /* ignore malformed value */ }

  const company = pending?.companyName || user.user_metadata?.company_name || '';
  const contact = pending?.contactName || user.user_metadata?.contact_name || '';
  const phone = pending?.phone || user.user_metadata?.phone || '';

  if (!company && !contact && !phone) return null;

  try {
    await supplierApply({
      companyName: company || 'Fornitore',
      contactName: contact || null,
      phone: phone || null,
      coverageAreas: pending?.coverageAreas || null,
      services: pending?.services || null,
      vatNumber: pending?.vatNumber || null,
    });
    try { localStorage.removeItem('vp_pending_supplier_application'); } catch { /* ignore */ }
    return true;
  } catch (err) {
    console.warn('[supplierAutoClaim] supplierApply fallback error:', err);
    return null;
  }
}
