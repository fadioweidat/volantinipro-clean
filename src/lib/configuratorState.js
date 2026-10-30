export const CONFIGURATOR_DRAFT_KEY = "volantinipro_configurator_draft_v1";
export const CONFIGURATOR_HISTORY_KEY = "volantiniproConfigurator";

const isRecord = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function readConfiguratorDraft(storage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(CONFIGURATOR_DRAFT_KEY) || "null");
    return isRecord(parsed) && parsed.version === 1 && isRecord(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeConfiguratorDraft(storage, data) {
  if (!storage || !isRecord(data)) return false;
  try {
    storage.setItem(CONFIGURATOR_DRAFT_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      data
    }));
    return true;
  } catch {
    return false;
  }
}

// Rimuove solo il draft del configuratore (Step1-4): usata quando l'utente
// avvia esplicitamente una NUOVA campagna, per non riproporre dati di una
// configurazione precedente. Non tocca auth, preferenze o altre chiavi.
export function clearConfiguratorDraft(storage) {
  if (!storage) return false;
  try {
    storage.removeItem(CONFIGURATOR_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

export const SERVICE_DRAFT_LABELS = { d2d: "Door to Door", h2h: "Hand to Hand", b2b: "Business" };

// Una bozza conta solo se contiene scelte del cliente: i valori iniziali no,
// e nemmeno un preventivo gia' inviato.
function hasCustomerChoices(draft) {
  if (!isRecord(draft) || draft.quoteSubmitted) return false;
  const filled = (value) => (Array.isArray(value) ? value.length > 0 : Boolean(value));
  const fields = ["cityName", "searchedLocation", "selectedComuni", "selectedCaps", "zones", "selectedZones", "selectedOperationalPois", "businessZone", "businessMaterialQuantity", "businessTargetCount", "startDate"];
  if (fields.some((field) => filled(draft[field]))) return true;
  if (draft.quantitySource === "customer") return true;
  if (draft.distributionTargetsExplicit && filled(draft.distributionTargets)) return true;
  return Array.isArray(draft.promoterAssignments) && draft.promoterAssignments.some((item) => filled(item?.location));
}

const serviceKey = (value) => (value === "business-distribution" ? "b2b" : value);

/** Bozza con scelte del cliente, stesso o altro servizio: {from} (null se senza servizio), altrimenti null. */
export function draftInProgress(draft) {
  if (!hasCustomerChoices(draft)) return null;
  const from = serviceKey(draft.type);
  return { from: SERVICE_DRAFT_LABELS[from] ? from : null };
}

/** {from, to} se la bozza e' di un altro servizio e contiene scelte del cliente, altrimenti null. */
export function serviceDraftConflict(draft, targetService) {
  const from = serviceKey(draft?.type);
  const to = serviceKey(targetService);
  if (!SERVICE_DRAFT_LABELS[from] || !SERVICE_DRAFT_LABELS[to] || from === to) return null;
  return hasCustomerChoices(draft) ? { from, to } : null;
}

export function configuratorHistoryState(data) {
  return isRecord(data) ? { [CONFIGURATOR_HISTORY_KEY]: data } : null;
}

export function readConfiguratorHistoryState(historyState) {
  const value = historyState?.[CONFIGURATOR_HISTORY_KEY];
  return isRecord(value) ? value : null;
}
