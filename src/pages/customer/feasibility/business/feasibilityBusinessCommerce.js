// Client wrapper for the independent `feasibility-business-commerce` edge
// function (ticket "BUSINESS FEASIBILITY €49 COMMERCE BACKEND"). Mirrors
// feasibilityCommerce.js's shape exactly, but talks to a different,
// isolated function — this file must never import from feasibilityCommerce.js
// or feasibilityEngine.js (Campaign Feasibility, off-limits).
import { ensureSupabaseSessionBridge, supabase } from '../../../../supabaseClient.js';

export async function businessCommerce(action, payload = {}, { signal } = {}) {
  await ensureSupabaseSessionBridge();
  const { data } = await supabase.auth.getSession();
  const env = import.meta.env;
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/feasibility-business-commerce`, {
    method: 'POST', signal: signal || AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token || env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ ...payload, action, requestId: payload.requestId || crypto.randomUUID() }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'REQUEST_FAILED');
  return result;
}

export function businessCommerceErrorText(error) {
  const codes = {
    AUTH_REQUIRED: 'Accedi per continuare.',
    CLIENT_REQUIRED: 'Questo servizio richiede un account cliente.',
    ADMIN_REQUIRED: 'Verifica riservata ad Admin.',
    NOT_FOUND: 'Contenuto non disponibile per questo account.',
    PAYMENT_REQUIRED: 'Il report completo sarà disponibile dopo la verifica del pagamento.',
    RECEIPT_CONFIRMATION_REQUIRED: 'Indica un riferimento di verifica valido.',
    INVALID_PAYMENT_STATE: 'Questo acquisto non può essere verificato nel suo stato attuale.',
    REQUEST_ALREADY_USED: 'Richiesta già elaborata.',
  };
  return codes[error?.message] || 'Operazione non completata. Riprova o contatta assistenza.';
}
