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

export const CAMPAIGN_CONTACT_EMAIL_SUBJECT = "Campagna VolantiniPro - richiesta informazioni";

const WHATSAPP_BASE_TEXT =
  "Buongiorno, ho appena confermato una campagna VolantiniPro. Vorrei ricevere le informazioni per completare la conferma e il pagamento.";

/** Testo WhatsApp precompilato cliente -> VolantiniPro dopo la conferma campagna. */
export function buildCampaignContactWhatsAppText(campaignId) {
  const id = campaignId == null ? "" : String(campaignId).trim();
  return id ? `${WHATSAPP_BASE_TEXT}\n\nID campagna: ${id}` : WHATSAPP_BASE_TEXT;
}

/** Corpo email precompilato cliente -> VolantiniPro dopo la conferma campagna. */
export function buildCampaignContactEmailBody(campaignId) {
  const lines = [
    "Buongiorno,",
    "ho appena confermato una campagna VolantiniPro.",
    "Vorrei ricevere le informazioni per completare la conferma e il pagamento.",
  ];
  const id = campaignId == null ? "" : String(campaignId).trim();
  if (id) lines.push("", `ID campagna: ${id}`);
  return lines.join("\n");
}

/** URL wa.me precompilato, oppure null se il numero WhatsApp non è configurato. */
export function buildCampaignContactWhatsAppUrl(campaignId) {
  if (!HAS_SUPPORT_WHATSAPP) return null;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(buildCampaignContactWhatsAppText(campaignId))}`;
}

/** mailto: verso l'email ufficiale con oggetto e corpo precompilati. */
export function buildCampaignContactMailtoUrl(campaignId) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CAMPAIGN_CONTACT_EMAIL_SUBJECT)}&body=${encodeURIComponent(
    buildCampaignContactEmailBody(campaignId),
  )}`;
}
