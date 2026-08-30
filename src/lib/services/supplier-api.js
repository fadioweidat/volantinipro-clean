// Marketplace Fornitore — client API.
//
// SOLO RPC SECURITY DEFINER autorizzate. Nessun `.from(...).insert/update`
// diretto su `quotes`/`supplier_profiles`/`operator_assignments`. Nessun
// `supplier_id` inviato dal browser (lo deriva il DB da auth.uid()). Nessuna
// chiave privilegiata, nessun token nel client.
import { supabase } from '../supabaseClient';

async function rpc(name, args = undefined) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    // Il client REST leggero (src/lib/supabaseClient) mette il corpo grezzo
    // (spesso JSON PostgREST) dentro error.message. Lo normalizziamo qui:
    // i chiamanti ricevono SEMPRE un `.message` = token di dominio pulito
    // (es. OFFERTA_GIA_INVIATA) e un `.code` separato, mai il JSON grezzo.
    let message = error.message || `RPC ${name} fallita`;
    let code = error.code || null;
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const body = JSON.parse(trimmed);
        message = body.message || body.error || message;
        code = code || body.code || null;
      } catch { /* non JSON valido: lascia message com'è */ }
    }
    const e = new Error(message);
    e.code = code;
    e.rpc = name;
    throw e;
  }
  return data;
}

// ── Fornitore ──────────────────────────────────────────────────────────────

/** Richieste marketplace disponibili (solo Fornitore verificato lato DB).
 *  Payload: request_code opaco, servizio, quantità, zona, date — nessun dato Cliente. */
export function getSupplierAvailableRequests() {
  return rpc('supplier_get_available_requests');
}

/** Invia un'offerta. `requestCode` = codice opaco della richiesta.
 *  Il DB verifica verified + disponibilità + no-duplicati e imposta supplier_id. */
export function supplierSubmitQuote({ requestCode, totalAmount, estimatedTime = null, availability = null, allowedPublicNotes = null, validUntil = null }) {
  return rpc('supplier_submit_quote', {
    p_request_code: requestCode,
    p_total_amount: totalAmount,
    p_estimated_time: estimatedTime,
    p_availability: availability,
    p_allowed_public_notes: allowedPublicNotes,
    p_valid_until: validUntil,
  });
}

/** Le proprie offerte inviate. */
export function supplierListOwnQuotes() {
  return rpc('supplier_list_own_quotes');
}

/** Le campagne vinte (lavori assegnati). */
export function supplierListAssignedCampaigns() {
  return rpc('supplier_list_assigned_campaigns');
}

/** I propri operatori. */
export function supplierListOwnOperators() {
  return rpc('supplier_list_own_operators');
}

/** Assegnazioni operatore GIA' esistenti sulle proprie campagne (read-only).
 *  Serve alla Dashboard per ricostruire "operatore assegnato" dopo un refresh.
 *  Isolamento server-side: SOLO campagne dove campaigns.supplier_id = auth.uid().
 *  Payload minimo: nessun contatto operatore, nessun dato di altri Supplier. */
export function supplierListCampaignAssignments() {
  return rpc('supplier_list_campaign_assignments');
}

/** Assegna un proprio operatore a una campagna vinta. */
export function supplierAssignOperator(operatorId, campaignId) {
  return rpc('supplier_assign_operator', { p_operator_id: operatorId, p_campaign_id: campaignId });
}

/** Aggiorna i campi profilo consentiti (mai status/verified/admin_notes). */
export function supplierUpdateProfile({ companyName, contactName = null, phone = null, coverageAreas = null, services = null }) {
  return rpc('supplier_update_profile', {
    p_company_name: companyName,
    p_contact_name: contactName,
    p_phone: phone,
    p_coverage_areas: coverageAreas,
    p_services: services,
  });
}

// ── Cliente ────────────────────────────────────────────────────────────────

/** Offerte Fornitore ANONIME per una campagna del cliente (solo public_code). */
export function customerGetSupplierQuotes(campaignId) {
  return rpc('customer_get_supplier_quotes', { p_campaign_id: campaignId });
}

/** Accetta una singola offerta. La campagna è derivata dalla quote lato DB;
 *  single-winner con lock, idempotente. */
export function customerAcceptQuote(quoteId) {
  return rpc('customer_accept_supplier_quote', { p_quote_id: quoteId });
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** Solo Admin: cambia lo stato di verifica di un fornitore. */
export function adminSetSupplierStatus(supplierId, status, notes = null) {
  return rpc('admin_set_supplier_status', { p_supplier_id: supplierId, p_status: status, p_notes: notes });
}
