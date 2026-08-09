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

export function configuratorHistoryState(data) {
  return isRecord(data) ? { [CONFIGURATOR_HISTORY_KEY]: data } : null;
}

export function readConfiguratorHistoryState(historyState) {
  const value = historyState?.[CONFIGURATOR_HISTORY_KEY];
  return isRecord(value) ? value : null;
}
