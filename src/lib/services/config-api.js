import { supabase } from '../../supabaseClient.js';
import { logAuditEvent } from '../audit.js';

// Centro Configurazione — verticale "Impostazioni Generali". Chiave/valore
// generico (jsonb) cosi' i verticali futuri (Servizi, Notifiche, Territorio,
// ecc.) possono aggiungere righe senza toccare lo schema. IMPORTANTE: queste
// impostazioni sono salvate e tracciate, ma NON sono ancora lette da nessun
// altro punto dell'app (Step1-4, prezzi, tema visivo restano quelli
// hardcoded nel codice) — collegarle al comportamento reale del sito e' un
// lavoro separato, deliberatamente fuori da questo verticale.

export async function listImpostazioni({ categoria = 'all', search = '' } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    let query = supabase.from('impostazioni').select('*').order('categoria').order('chiave');
    if (categoria !== 'all') query = query.eq('categoria', categoria);
    const { data, error } = await query;
    if (error) return { rows: [], available: false, error: error.message };
    let rows = Array.isArray(data) ? data : [];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((row) => [row.chiave, row.descrizione, row.categoria].filter(Boolean).join(' ').toLowerCase().includes(needle));
    }
    return { rows, available: true };
  } catch (err) {
    return { rows: [], available: false, error: err?.message || String(err) };
  }
}

export async function updateImpostazione(chiave, nuovoValore, motivazione = null) {
  if (!supabase) throw new Error('Supabase non configurato');
  try {
    const { data: current } = await supabase.from('impostazioni').select('valore').eq('chiave', chiave).maybeSingle();
    const valorePrecedente = current?.valore ?? null;

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user || null;

    const { error } = await supabase
      .from('impostazioni')
      .update({
        valore: nuovoValore,
        updated_at: new Date().toISOString(),
        updated_by_id: user?.id || null,
        updated_by_email: user?.email || null,
      })
      .eq('chiave', chiave);
    if (error) throw error;

    logAuditEvent({
      action: 'config_setting_updated',
      resourceType: 'impostazioni',
      resourceId: chiave,
      metadata: { valore_precedente: valorePrecedente, valore_nuovo: nuovoValore, motivazione: motivazione || null },
    });
    return true;
  } catch (err) {
    logAuditEvent({ action: 'config_setting_update_failed', resourceType: 'impostazioni', resourceId: chiave, success: false, errorMessage: err?.message || String(err) });
    throw err;
  }
}
