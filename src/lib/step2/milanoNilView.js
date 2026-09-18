// UX Milano — helper PURI e PRESENTAZIONALI per lo Step 2.
//
// FIREWALL: nessun calcolo territoriale nuovo. Ogni funzione legge SOLO valori
// gia' calcolati da Step2.jsx (zonesAllocation, conteggi NIL canonici, modalita'
// correnti) e produce stringhe/conteggi per la UI. Nessuna nuova source of
// truth, nessun accesso rete/DB. `normalizeTerritoryName` (accent+case
// insensitive) e' il solo helper riusato, gia' presente in addressIntent.js.
import { normalizeTerritoryName } from "./addressIntent.js";

/**
 * Riassunto copertura NIL per la summary card Milano (§4).
 * @param {{ availableCount:number, zonesAllocation:Array<{allocationStatus?:string, assignedFlyers?:number, requiredFlyers?:number}> }} p
 * @returns {{ available:number, full:number, partial:number, excluded:number, reached:number }}
 *
 * - `available`  = NIL disponibili nel Comune (conteggio canonico Step 2).
 * - `full`/`partial` = da zonesAllocation (stessa fonte della lista/mappa):
 *   full = allocationStatus "full", partial = "partial".
 * - `excluded` = available - full - partial (>= 0): copre anche le NIL non
 *   presenti in zonesAllocation (es. modalita' NIL manuale con sottoinsieme).
 * - `reached` = full + partial.
 */
export function summariseNilCoverage({ availableCount, zonesAllocation } = {}) {
  const available = Math.max(0, Number(availableCount) || 0);
  const rows = Array.isArray(zonesAllocation) ? zonesAllocation : [];
  const statusOf = (a) => {
    if (a && typeof a.allocationStatus === "string") return a.allocationStatus;
    const assigned = Number(a?.assignedFlyers) || 0;
    const required = Number(a?.requiredFlyers) || 0;
    if (assigned <= 0) return "none";
    return required > 0 && assigned >= required ? "full" : "partial";
  };
  let full = 0;
  let partial = 0;
  for (const a of rows) {
    const s = statusOf(a);
    if (s === "full") full += 1;
    else if (s === "partial") partial += 1;
  }
  // Non superare mai il totale disponibile (difensivo: allocazione con piu'
  // righe del conteggio canonico -> si "clampa").
  full = Math.min(full, available);
  partial = Math.min(partial, Math.max(0, available - full));
  const excluded = Math.max(0, available - full - partial);
  return { available, full, partial, excluded, reached: full + partial };
}

/**
 * Etichetta conteggio NIL, coerente con la modalita' corrente (§10).
 * Legge solo booleani/conteggi gia' derivati da Step2.jsx.
 * @returns {string}
 */
export function nilModeCountLabel({
  isRadiusMode = false,
  nilManualMode = false,
  availableCount = 0,
  intersectedCount = 0,
  selectedCount = 0,
  externalComuniCount = 0,
  externalComuniNames = [],
} = {}) {
  if (isRadiusMode) {
    if (Number(externalComuniCount) > 0) {
      const namesList = Array.isArray(externalComuniNames) ? externalComuniNames.filter(Boolean) : [];
      const suffix = namesList.length > 0 ? ` (${namesList.join(", ")})` : "";
      return `${Number(intersectedCount) || 0} NIL Milano + ${Number(externalComuniCount)} ${Number(externalComuniCount) === 1 ? "Comune limitrofo" : "Comuni limitrofi"}${suffix}`;
    }
    return `NIL intercettati dal raggio: ${Number(intersectedCount) || 0}`;
  }
  if (nilManualMode) return `NIL selezionati: ${Number(selectedCount) || 0}`;
  return `NIL disponibili nel Comune: ${Number(availableCount) || 0}`;
}

/**
 * Riga di stato compatta "N completi · N parziali · N esclusi" (§9).
 */
export function nilStatusSummaryLine({ full = 0, partial = 0, excluded = 0 } = {}) {
  const parts = [];
  if (full > 0) parts.push(`${full} ${full === 1 ? "completo" : "completi"}`);
  if (partial > 0) parts.push(`${partial} ${partial === 1 ? "parziale" : "parziali"}`);
  if (excluded > 0) parts.push(`${excluded} ${excluded === 1 ? "escluso" : "esclusi"}`);
  return parts.join(" · ");
}

/**
 * Descrizione NEUTRA dell'ordine di allocazione (§8). Nessun claim "zona
 * migliore" / raccomandazione AI: solo l'ordine reale in uso.
 * @param {{ allocationMode?:string, firstZoneName?:string }} p
 * @returns {{ label:string, criterion:string }|null}
 */
export function neutralPriorityLabel({ allocationMode = "auto", firstZoneName = "" } = {}) {
  const name = String(firstZoneName || "").trim();
  if (allocationMode === "manual") {
    return { label: "Assegnazione manuale per zona", criterion: "Manuale" };
  }
  if (!name) return null;
  if (allocationMode === "priority") {
    return {
      label: `Prima zona nell'ordine di priorità scelto: ${name}`,
      criterion: "Ordine manuale (frecce)",
    };
  }
  return {
    label: `Prima zona nell'ordine di allocazione: ${name}`,
    criterion: "Ordine di allocazione automatica",
  };
}

/**
 * Filtro locale (§6): filtra righe lista NIL per nome, accent+case insensitive.
 * SOLO presentazionale — non tocca `selected` / `selZones` / allocazione.
 * Query vuota -> ritorna `rows` invariato (stesso riferimento).
 * @param {Array} rows righe { type, zone:{name} } di Step2 (zoneRowsForList)
 * @param {string} query
 */
export function filterNilRows(rows, query) {
  const q = normalizeTerritoryName(String(query || "").trim());
  if (!q || !Array.isArray(rows)) return rows;
  return rows.filter((row) => {
    if (!row || row.type !== "zone") return false; // via i separatori/marginal-summary durante la ricerca
    const name = row.zone?.name ?? row.zone?.nil_name ?? row.zone?.comune_name ?? "";
    return normalizeTerritoryName(name).includes(q);
  });
}

/**
 * TICKET — "Trova una zona" da filtro debole ad autocomplete reale.
 * Filtra + ORDINA (prefisso prima, poi sottostringa) le righe zona per la
 * tendina risultati. Stessa fonte dati di filterNilRows (zoneRowsForList),
 * stesso matching accent+case-insensitive (normalizeTerritoryName) — solo
 * ordinamento aggiunto, nessun nuovo criterio di inclusione/esclusione:
 * qualunque riga che filterNilRows includerebbe e' inclusa anche qui, nello
 * stesso identico set, solo riordinata. Nessuna chiamata di rete: legge SOLO
 * `rows` gia' calcolate da Step2.jsx (zoneRowsForList).
 * @param {Array} rows righe { type, zone:{id,name,isNil} } di Step2
 * @param {string} query
 * @param {{ limit?: number }} [opts] limite risultati mostrati in tendina
 * @returns {Array<{id:string, name:string, isNil:boolean}>}
 */
export function rankNilSearchResults(rows, query, { limit = 20 } = {}) {
  const q = normalizeTerritoryName(String(query || "").trim());
  if (!q || !Array.isArray(rows)) return [];
  const matches = [];
  for (const row of rows) {
    if (!row || row.type !== "zone" || !row.zone) continue;
    const name = row.zone.name ?? row.zone.nil_name ?? row.zone.comune_name ?? "";
    const normalized = normalizeTerritoryName(name);
    if (!normalized.includes(q)) continue;
    matches.push({
      id: row.zone.id,
      name,
      isNil: Boolean(row.zone.isNil),
      // prefisso vince su sottostringa; a parita' di tipo, ordine alfabetico
      // stabile cosi' il risultato non "salta" ad ogni digitazione.
      rank: normalized.startsWith(q) ? 0 : 1,
    });
  }
  matches.sort((a, b) => (a.rank - b.rank) || a.name.localeCompare(b.name, "it"));
  return matches.slice(0, Math.max(0, limit)).map(({ id, name, isNil }) => ({ id, name, isNil }));
}

/**
 * Copy della guida "bassa copertura" (§5) con quantita' e copertura REALI.
 * Nessun numero hardcoded: tutto passato dal chiamante.
 * @returns {string}
 */
export function lowCoverageMilanoCopy({ quantity, coveragePct } = {}) {
  const qty = Number(quantity);
  const cov = Number(coveragePct);
  const qtyText = Number.isFinite(qty) && qty > 0
    ? qty.toLocaleString("it-IT")
    : "la quantità attuale";
  const covText = Number.isFinite(cov)
    ? `${cov % 1 === 0 ? cov : Number(cov.toFixed(1))}%`
    : null;
  return (
    `Con ${qtyText} volantini Milano completo` +
    (covText ? ` è coperto al ${covText} del fabbisogno` : " è molto ampio") +
    `. Per una distribuzione più concentrata puoi scegliere uno o più NIL, ` +
    `usare un raggio, oppure mantenere Milano completo.`
  );
}
