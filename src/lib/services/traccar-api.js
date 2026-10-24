import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';

// Uses the existing authenticated client. No service-role key in the browser.
export async function traccarAdminControl(action, args = {}) {
  await ensureSupabaseSessionBridge?.();
  if (!supabase) throw new Error('Collegamento Supabase non disponibile');
  const { data, error } = await supabase.rpc('traccar_admin_control', { p_action: action, ...args });
  if (error) {
    if (['PGRST202', '42883', '42P01'].includes(error.code)) {
      throw new Error('Piano B non installato in questo ambiente: applicare la migration di prova.');
    }
    throw new Error(error.message || 'Operazione Piano B non riuscita');
  }
  if (!data || typeof data !== 'object') throw new Error('Risposta Piano B non valida');
  return data;
}
