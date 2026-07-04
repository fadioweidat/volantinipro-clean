import { supabase } from '../../supabaseClient.js';
import { logAuditEvent } from '../audit.js';

// CRM layer for the "Clienti + Referenti" vertical. Reads/writes the
// existing `clienti` table (extended additively — see CRM_CLIENTI_SETUP.sql)
// and the new `clienti_referenti` table. Every write is mirrored to
// audit_log; every read degrades to an empty/available:false result instead
// of throwing, matching the existing selectOptionalTable convention used
// elsewhere in admin-api.js.

const CLIENTI_STATI = ['nuovo', 'attivo', 'inattivo', 'vip'];

export async function listClienti({ search = '', stato = 'all', comune = '' } = {}) {
  if (!supabase) return { rows: [], available: false };
  try {
    let query = supabase.from('clienti').select('*').order('created_at', { ascending: false });
    if (stato !== 'all') query = query.eq('stato', stato);
    if (comune) query = query.ilike('comune', `%${comune}%`);
    const { data, error } = await query;
    if (error) return { rows: [], available: false, error: error.message };
    let rows = Array.isArray(data) ? data : [];
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      rows = rows.filter((row) => [
        row.nome, row.cognome, row.azienda, row.email, row.telefono, row.cellulare,
        row.comune, row.provincia, row.categoria, ...(Array.isArray(row.tags) ? row.tags : []),
      ].filter(Boolean).join(' ').toLowerCase().includes(needle));
    }
    return { rows, available: true };
  } catch (err) {
    return { rows: [], available: false, error: err?.message || String(err) };
  }
}

export async function getClienteReferenti(clienteId) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from('clienti_referenti')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function updateCliente(id, patch) {
  if (!supabase) throw new Error('Supabase non configurato');
  const body = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('clienti').update(body).eq('id', id);
  if (error) {
    logAuditEvent({ action: 'crm_client_updated', resourceType: 'clienti', resourceId: id, success: false, errorMessage: error.message });
    throw error;
  }
  logAuditEvent({ action: 'crm_client_updated', resourceType: 'clienti', resourceId: id, metadata: { fields: Object.keys(patch) } });
  return true;
}

export async function createReferente(clienteId, payload) {
  if (!supabase) throw new Error('Supabase non configurato');
  const body = {
    cliente_id: clienteId,
    nome: payload.nome,
    ruolo: payload.ruolo || null,
    telefono: payload.telefono || null,
    email: payload.email || null,
    note: payload.note || null,
  };
  const { data, error } = await supabase.from('clienti_referenti').insert(body).select('*').single();
  if (error) {
    logAuditEvent({ action: 'crm_referente_created', resourceType: 'clienti_referenti', success: false, errorMessage: error.message, metadata: { clienteId } });
    throw error;
  }
  logAuditEvent({ action: 'crm_referente_created', resourceType: 'clienti_referenti', resourceId: data?.id, metadata: { clienteId } });
  return data;
}

export async function updateReferente(id, patch) {
  if (!supabase) throw new Error('Supabase non configurato');
  const body = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('clienti_referenti').update(body).eq('id', id);
  if (error) {
    logAuditEvent({ action: 'crm_referente_updated', resourceType: 'clienti_referenti', resourceId: id, success: false, errorMessage: error.message });
    throw error;
  }
  logAuditEvent({ action: 'crm_referente_updated', resourceType: 'clienti_referenti', resourceId: id, metadata: { fields: Object.keys(patch) } });
  return true;
}

export async function deleteReferente(id) {
  if (!supabase) throw new Error('Supabase non configurato');
  const { error } = await supabase.from('clienti_referenti').delete().eq('id', id);
  if (error) {
    logAuditEvent({ action: 'crm_referente_deleted', resourceType: 'clienti_referenti', resourceId: id, success: false, errorMessage: error.message });
    throw error;
  }
  logAuditEvent({ action: 'crm_referente_deleted', resourceType: 'clienti_referenti', resourceId: id });
  return true;
}

export function isKnownStato(value) {
  return CLIENTI_STATI.includes(value);
}

export { CLIENTI_STATI };
