// I template di stampa scrivono i valori in document.write: ogni stringa dei dati
// va resa inerte all'ingresso, cosi' nessun valore puo' diventare markup.
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

export function escapeHtmlDeep(value) {
  if (typeof value === "string") return escapeHtml(value);
  if (Array.isArray(value)) return value.map(escapeHtmlDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeHtmlDeep(item)]));
  }
  return value;
}
