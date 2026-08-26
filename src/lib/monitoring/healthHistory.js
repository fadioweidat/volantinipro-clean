// FASE Centro Controllo — uptime/performance storico (Blocco F). Funzioni
// pure: nessuna chiamata di rete/DB. Operano su righe gia' lette altrove
// (platform_health_checks). Nessun valore inventato: se il campione e'
// insufficiente il risultato e' esplicitamente INSUFFICIENT_DATA, MAI un
// 100%/0% derivato da 1-2 righe.

export const UPTIME_WINDOWS_MS = Object.freeze({
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
});

// Sotto questa soglia il campione e' troppo piccolo per un uptime%
// significativo (1-2 check non rappresentano ore/giorni di copertura reale
// finche' il collector periodico non e' attivo). Non e' una soglia
// statistica "esatta", e' una scelta di onesta' verso l'Admin: meglio
// dichiarare apertamente "dati insufficienti" che un 100% costruito su un
// solo campionamento manuale.
export const MIN_SAMPLES_FOR_UPTIME = 3;

// L'UPTIME UFFICIALE conta SOLO campioni source='collector'. Un check
// manuale (l'Admin che apre la pagina e preme "Esegui controllo completo")
// e' realizzato a intervalli arbitrari e irregolari — includerlo
// nell'uptime darebbe una falsa impressione di copertura continua anche
// con zero raccolta periodica attiva. I check manuali restano comunque
// persistiti e visibili nello storico DIAGNOSTICO (vedi
// healthCollectorClient.js/PlatformStatus.jsx), semplicemente non entrano
// in questo calcolo. Prima che lo scheduler periodico sia configurato,
// questo significa che uptime 24h/7d/30d resta SEMPRE INSUFFICIENT_DATA,
// per costruzione — comportamento corretto, non un bug.
export const OFFICIAL_UPTIME_SOURCE = "collector";

function isFiniteTime(value) {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

// UPTIME = healthy checks / total valid checks (source='collector') nella
// finestra, dove "valid" esclude 'unknown' (un check che non e' mai
// realmente partito, es. Supabase non configurato, non e' ne' successo ne'
// fallimento: non deve alterare l'uptime in nessuna direzione).
//
// La soglia MIN_SAMPLES_FOR_UPTIME e' verificata sul numero di ESECUZIONI
// DISTINTE del collector (timestamp checked_at distinti), MAI sul numero
// grezzo di righe: una singola esecuzione produce N righe simultanee (una
// per check_name, tutte con lo stesso checked_at) — trattarle come N
// campioni indipendenti gonfierebbe artificialmente la copertura temporale
// apparente. Un solo collector run, anche con 7+ check al suo interno,
// resta un solo punto nel tempo: verificato dal vivo (bug reale trovato
// durante lo smoke test di questa fase — un singolo run con 7 righe
// superava erroneamente la vecchia soglia basata su valid.length).
export function computeUptimeForWindow(rows, windowMs, now = new Date()) {
  const nowMs = now.getTime();
  const cutoff = nowMs - windowMs;
  const valid = (Array.isArray(rows) ? rows : []).filter((row) => {
    const t = isFiniteTime(row?.checked_at);
    return t != null && t >= cutoff && t <= nowMs && row.status !== "unknown" && row.source === OFFICIAL_UPTIME_SOURCE;
  });

  const distinctExecutions = new Set(valid.map((r) => r.checked_at)).size;
  if (distinctExecutions < MIN_SAMPLES_FOR_UPTIME) {
    return { status: "INSUFFICIENT_DATA", sampleCount: valid.length, executionCount: distinctExecutions, uptimePercent: null, failCount: 0, warningCount: 0 };
  }

  const healthy = valid.filter((r) => r.status === "ok").length;
  const failCount = valid.filter((r) => r.status === "fail").length;
  const warningCount = valid.filter((r) => r.status === "warning").length;

  return {
    status: "OK",
    sampleCount: valid.length,
    executionCount: distinctExecutions,
    uptimePercent: Math.round((healthy / valid.length) * 10000) / 100,
    failCount,
    warningCount,
  };
}

export function computeUptimeSummary(rows, now = new Date()) {
  const summary = {};
  for (const [label, windowMs] of Object.entries(UPTIME_WINDOWS_MS)) {
    summary[label] = computeUptimeForWindow(rows, windowMs, now);
  }
  return summary;
}

function percentile(sortedAscValues, p) {
  if (sortedAscValues.length === 0) return null;
  const idx = Math.min(sortedAscValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAscValues.length) - 1));
  return sortedAscValues[idx];
}

// p50/p95 SOLO se c'e' un campione minimo di ESECUZIONI DISTINTE (stessa
// soglia e stesso ragionamento di computeUptimeForWindow sopra: 7 valori di
// response_time_ms dalla stessa esecuzione non sono 7 osservazioni
// indipendenti nel tempo, sono 7 check diversi nello stesso istante).
export function computeResponseTimePercentiles(rows) {
  const withTime = (Array.isArray(rows) ? rows : []).filter((r) => Number.isFinite(r?.response_time_ms) && r?.checked_at);
  const distinctExecutions = new Set(withTime.map((r) => r.checked_at)).size;
  const values = withTime.map((r) => r.response_time_ms).sort((a, b) => a - b);
  if (distinctExecutions < MIN_SAMPLES_FOR_UPTIME) {
    return { status: "INSUFFICIENT_DATA", sampleCount: values.length, executionCount: distinctExecutions, p50: null, p95: null };
  }
  return { status: "OK", sampleCount: values.length, executionCount: distinctExecutions, p50: percentile(values, 50), p95: percentile(values, 95) };
}

// Stima di downtime (ESPLICITAMENTE approssimata, mai spacciata per
// esatta): per ogni check in stato 'fail', attribuisce come downtime il
// tempo fino al campione successivo, con un tetto (MAX_ATTRIBUTABLE_GAP_MS)
// per non sovrastimare quando il campionamento e' rado — oltre quel tetto
// il gap e' troppo largo per attribuirlo con onesta' interamente al
// downtime. Come per l'uptime, SOLO source='collector': un gap tra due
// check manuali sporadici non e' un downtime reale misurato, e' solo
// l'assenza di campionamento.
const MAX_ATTRIBUTABLE_GAP_MS = 60 * 60 * 1000;

export function estimateDowntimeMs(rows) {
  const sorted = [...(Array.isArray(rows) ? rows : [])]
    .filter((r) => isFiniteTime(r?.checked_at) != null && r.source === OFFICIAL_UPTIME_SOURCE)
    .sort((a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime());
  let totalMs = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i].status === "fail") {
      const gap = new Date(sorted[i + 1].checked_at).getTime() - new Date(sorted[i].checked_at).getTime();
      totalMs += Math.min(Math.max(gap, 0), MAX_ATTRIBUTABLE_GAP_MS);
    }
  }
  return totalMs;
}
