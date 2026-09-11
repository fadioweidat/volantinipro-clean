/* Modalità di pagamento centralizzata.
 *
 * `manual_contact` (default): nessun pagamento online, nessuna coordinata
 * bancaria mostrata al cliente. Dopo la conferma della campagna il cliente
 * vede solo la ricevuta ("Abbiamo ricevuto correttamente la tua richiesta")
 * e i CTA di contatto (WhatsApp prioritario, Email alternativa, Dashboard).
 * VolantiniPro contatta il cliente e fornisce le istruzioni di pagamento
 * successivamente.
 *
 * Lo stato di pagamento REALE della campagna (DB / metadata) NON viene mai
 * toccato da questa modalità: è solo una scelta di presentazione lato UI.
 *
 * Il vecchio flusso bonifico resta nel codice (blocco gated in
 * PagamentoBonificoPage) e si riattiva impostando VITE_PAYMENT_MODE su un
 * valore diverso da "manual_contact" (es. "bank_transfer").
 */
import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP,
  HAS_SUPPORT_WHATSAPP,
} from "./contactConfig.js";

function readEnv(name) {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[name] != null) {
      return import.meta.env[name];
    }
  } catch {
    /* import.meta non disponibile fuori da Vite (es. node:test) */
  }
  if (typeof process !== "undefined" && process.env && process.env[name] != null) return process.env[name];
  return undefined;
}

export const PAYMENT_MODE = String(readEnv("VITE_PAYMENT_MODE") || "manual_contact").trim() || "manual_contact";
export const IS_MANUAL_CONTACT = PAYMENT_MODE === "manual_contact";

export const CAMPAIGN_CONTACT_EMAIL_SUBJECT = "VolantiniPro — Richiesta istruzioni pagamento";

const WHATSAPP_BASE_PREFIX = "Buongiorno, ho confermato la mia campagna VolantiniPro.";
const WHATSAPP_BASE_SUFFIX =
  "Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico. Grazie.";

export function formatPaymentServiceLabel(service) {
  if (!service) return null;
  const s = String(service).toLowerCase().trim();
  const map = {
    d2d: 'Door to Door',
    'door-to-door': 'Door to Door',
    'door_to_door': 'Door to Door',
    h2h: 'Hand to Hand',
    'hand-to-hand': 'Hand to Hand',
    'hand_to_hand': 'Hand to Hand',
    b2b: 'Business to Business',
    'business-to-business': 'Business to Business',
    'business_to_business': 'Business to Business',
    direct_mail: 'Direct Mail',
    'direct-mail': 'Direct Mail',
    'direct_marketing': 'Direct Marketing',
  };
  return map[s] || String(service);
}

export function formatPaymentZoneLabel(campaign) {
  if (!campaign) return null;
  const comuni = campaign.comuni || campaign.metadata?.comuni;
  if (Array.isArray(comuni) && comuni.length) {
    const list = comuni.map((c) => (typeof c === 'object' ? c.name || c.nome || c.municipality_name : String(c))).filter(Boolean);
    if (list.length) return [...new Set(list)].join(', ');
  }
  const zone = campaign.zone || campaign.metadata?.zone || campaign.city || campaign.metadata?.city;
  if (typeof zone === 'string' && zone.trim()) return zone.trim();
  if (Array.isArray(zone) && zone.length) {
    const list = zone.map((z) => (typeof z === 'object' ? z.name || z.nome || z.zone_name : String(z))).filter(Boolean);
    if (list.length) return [...new Set(list)].join(', ');
  }
  return null;
}

/** Testo WhatsApp precompilato cliente -> VolantiniPro dopo la conferma campagna. */
export function buildCampaignContactWhatsAppText(campaignOrId) {
  if (campaignOrId == null) {
    return `${WHATSAPP_BASE_PREFIX}\n${WHATSAPP_BASE_SUFFIX}`;
  }
  if (typeof campaignOrId === 'string' || typeof campaignOrId === 'number') {
    const id = String(campaignOrId).trim();
    if (!id) return `${WHATSAPP_BASE_PREFIX}\n${WHATSAPP_BASE_SUFFIX}`;
    return `${WHATSAPP_BASE_PREFIX}\nID campagna: ${id}\n${WHATSAPP_BASE_SUFFIX}`;
  }

  const c = campaignOrId;
  const id = c.id || c.code || c.order_id || null;
  const service = formatPaymentServiceLabel(c.service || c.type || c.service_type || c.metadata?.service || c.metadata?.type);
  const zone = formatPaymentZoneLabel(c);
  const qty = c.flyers_count || c.qty || c.quantity || c.metadata?.flyers_count || c.metadata?.qty || null;
  const date = c.starts_at || c.date || c.metadata?.starts_at || null;

  let amountDue = null;
  if (c.settlement && c.settlement.settlement_status !== 'not_applicable') {
    amountDue = c.settlement.amount_due_cents != null ? c.settlement.amount_due_cents / 100 : null;
  } else {
    amountDue = c.total ?? c.metadata?.total ?? c.preventivo?.totale ?? c.price ?? null;
  }

  const lines = [WHATSAPP_BASE_PREFIX];
  if (id) lines.push(`ID campagna: ${id}`);
  if (service) lines.push(`Servizio: ${service}`);
  if (zone) lines.push(`Zona: ${zone}`);
  if (qty) lines.push(`Quantità: ${Number(qty).toLocaleString('it-IT')} volantini`);
  if (date) {
    const dateFormatted = typeof date === 'string' && date.includes('-') && !date.includes('/')
      ? new Date(date).toLocaleDateString('it-IT')
      : String(date);
    lines.push(`Data campagna: ${dateFormatted}`);
  }
  if (amountDue != null && Number.isFinite(Number(amountDue))) {
    lines.push(`Totale da pagare: € ${Number(amountDue).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  lines.push(WHATSAPP_BASE_SUFFIX);

  return lines.join('\n');
}

/** Oggetto email precompilato cliente -> VolantiniPro con ID campagna opzionale. */
export function buildCampaignContactEmailSubject(campaignOrId) {
  const id = typeof campaignOrId === 'object' && campaignOrId != null
    ? campaignOrId.id || campaignOrId.code || campaignOrId.order_id || ''
    : (campaignOrId == null ? '' : String(campaignOrId).trim());
  return id
    ? `VolantiniPro — Richiesta istruzioni pagamento — ${id}`
    : "VolantiniPro — Richiesta istruzioni pagamento";
}

/** Corpo email precompilato cliente -> VolantiniPro dopo la conferma campagna. */
export function buildCampaignContactEmailBody(campaignOrId) {
  const lines = [
    "Buongiorno,",
    "",
    "ho confermato la mia campagna VolantiniPro.",
    "",
  ];
  if (typeof campaignOrId === 'object' && campaignOrId != null) {
    const c = campaignOrId;
    const id = c.id || c.code || c.order_id || null;
    const service = formatPaymentServiceLabel(c.service || c.type || c.service_type || c.metadata?.service || c.metadata?.type);
    const zone = formatPaymentZoneLabel(c);
    const qty = c.flyers_count || c.qty || c.quantity || c.metadata?.flyers_count || c.metadata?.qty || null;
    let amountDue = null;
    if (c.settlement && c.settlement.settlement_status !== 'not_applicable') {
      amountDue = c.settlement.amount_due_cents != null ? c.settlement.amount_due_cents / 100 : null;
    } else {
      amountDue = c.total ?? c.metadata?.total ?? c.preventivo?.totale ?? c.price ?? null;
    }
    if (id) lines.push(`ID campagna: ${id}`);
    if (service) lines.push(`Servizio: ${service}`);
    if (zone) lines.push(`Zona: ${zone}`);
    if (qty) lines.push(`Quantità: ${Number(qty).toLocaleString('it-IT')} volantini`);
    if (amountDue != null && Number.isFinite(Number(amountDue))) {
      lines.push(`Totale da pagare: € ${Number(amountDue).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    }
    lines.push("");
  } else {
    const id = campaignOrId == null ? "" : String(campaignOrId).trim();
    if (id) {
      lines.push(`ID campagna: ${id}`, "");
    }
  }
  lines.push("Vorrei ricevere le istruzioni per completare il pagamento tramite bonifico.", "", "Grazie.");
  return lines.join("\n");
}

/** URL wa.me precompilato, oppure null se il numero WhatsApp non è configurato. */
export function buildCampaignContactWhatsAppUrl(campaignOrId) {
  if (!HAS_SUPPORT_WHATSAPP) return null;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(buildCampaignContactWhatsAppText(campaignOrId))}`;
}

/** mailto: verso l'email ufficiale con oggetto e corpo precompilati. */
export function buildCampaignContactMailtoUrl(campaignOrId) {
  const subject = buildCampaignContactEmailSubject(campaignOrId);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    buildCampaignContactEmailBody(campaignOrId),
  )}`;
}
