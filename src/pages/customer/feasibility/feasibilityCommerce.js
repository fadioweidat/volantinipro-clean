import { ensureSupabaseSessionBridge, supabase } from '../../../supabaseClient.js';
export const TOKEN_KEY = 'vp_feasibility_capability_v3';
export function analysisToken(reset = false) {
  let value = reset ? null : sessionStorage.getItem(TOKEN_KEY);
  if (!value) { value = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem(TOKEN_KEY, value); }
  return value;
}
export async function commerce(action, payload = {}, { signal } = {}) {
  await ensureSupabaseSessionBridge();
  const { data } = await supabase.auth.getSession();
  const env = import.meta.env;
  const response = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/feasibility-commerce`, {
    method: 'POST', signal: signal || AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token || env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ ...payload, action, requestId: crypto.randomUUID() }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'REQUEST_FAILED');
  return result;
}
export function errorText(error) {
  const codes = { AUTH_REQUIRED:'Accedi per continuare.', CLIENT_REQUIRED:'Questo servizio richiede un account cliente.', ADMIN_REQUIRED:'Verifica riservata ad Admin.', REVIEW_REQUIRED:'Campagna modificata: è necessaria una nuova verifica Admin. Il credito non è stato consumato.', ELIGIBILITY_VERIFICATION_REQUIRED:'Richiedi ad Admin la verifica della campagna prima di applicare il credito.', CREDIT_ALREADY_USED:'Credito già utilizzato.', CREDIT_EXPIRED:'Credito scaduto.', CAMPAIGN_NOT_ELIGIBLE:'La conferma della campagna non rientra nella validità del credito.', NOT_FOUND:'Contenuto non disponibile per questo account.', REPORT_LOCKED:'Il report sarà disponibile dopo la verifica del pagamento.', ANALYSIS_FROZEN:'Questa analisi è associata a un acquisto. Crea una nuova analisi per cambiare i dati.', NARRATIVE_LIMIT:'Limite di generazioni raggiunto per questa analisi.', MESSAGE_LIMIT:'Limite messaggi raggiunto. Puoi completare il riepilogo.', DAILY_LIMIT:'Limite giornaliero raggiunto.' };
  return codes[error?.message] || 'Operazione non completata. Riprova o contatta assistenza.';
}
