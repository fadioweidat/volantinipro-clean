// Vista compatta di "Programma Operativo" lato Driver. SOLO presentazione:
// raggruppa/filtra le zone GIA' caricate (nessuna chiamata di rete, nessuna
// nuova logica di stato). L'ordine di programma e la numerazione originale
// restano quelli di `zones`.

import { ZONE_STATE } from './zoneWorkflow.js';

export const FUTURE_ZONES_DEFAULT_LIMIT = 4;

export const ZONE_FILTERS = Object.freeze([
  { value: 'all', label: 'Tutte' },
  { value: 'in_progress', label: 'In corso' },
  { value: 'to_start', label: 'Da iniziare' },
  { value: 'completed', label: 'Completate' },
]);

export function normalizeZoneSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function zoneMatchesQuery(zone, query) {
  const q = normalizeZoneSearch(query);
  if (!q) return true;
  return normalizeZoneSearch(zone?.zone_name).includes(q);
}

/**
 * @param zones     zone in ordine di programma (assignmentZones / fallback)
 * @param stateOf   workflow.stateOf — unica fonte dello stato zona
 * @returns conteggi REALI (sull'intero programma) + gruppi filtrati
 */
export function buildZoneListView(zones = [], stateOf, { query = '', filter = 'all', expandedFuture = false, showCompleted = false } = {}) {
  const numbered = (zones || []).map((zone, index) => ({ zone, index, number: index + 1 }));
  const stateFor = (zone) => (zone?.isLegacy ? ZONE_STATE.TO_START : stateOf(zone));

  const counts = { total: numbered.length, inProgress: 0, toStart: 0, completed: 0 };
  for (const { zone } of numbered) {
    const s = stateFor(zone);
    if (s === ZONE_STATE.IN_PROGRESS) counts.inProgress += 1;
    else if (s === ZONE_STATE.COMPLETED) counts.completed += 1;
    else counts.toStart += 1;
  }

  const searching = normalizeZoneSearch(query).length > 0;
  const matching = numbered.filter(({ zone }) => zoneMatchesQuery(zone, query));
  const inProgressAll = matching.filter(({ zone }) => stateFor(zone) === ZONE_STATE.IN_PROGRESS);
  const toStartAll = matching.filter(({ zone }) => stateFor(zone) === ZONE_STATE.TO_START);
  const completedAll = matching.filter(({ zone }) => stateFor(zone) === ZONE_STATE.COMPLETED);

  const showInProgress = filter === 'all' || filter === 'in_progress';
  const showToStart = filter === 'all' || filter === 'to_start';
  const showCompletedSection = filter === 'all' || filter === 'completed';

  // Con ricerca attiva si mostrano TUTTI i risultati, senza limite/collasso.
  const futureExpanded = expandedFuture || searching;
  const futureVisible = showToStart
    ? (futureExpanded ? toStartAll : toStartAll.slice(0, FUTURE_ZONES_DEFAULT_LIMIT))
    : [];
  const completedExpanded = showCompleted || searching || filter === 'completed';

  return {
    counts,
    searching,
    inProgress: showInProgress ? inProgressAll : [],
    toStart: { all: showToStart ? toStartAll : [], visible: futureVisible, hiddenCount: showToStart ? Math.max(0, toStartAll.length - futureVisible.length) : 0, canCollapse: showToStart && futureExpanded && !searching && toStartAll.length > FUTURE_ZONES_DEFAULT_LIMIT },
    completed: { all: showCompletedSection ? completedAll : [], expanded: completedExpanded },
    noResults: searching && matching.length === 0,
  };
}

export function programSummaryText(counts) {
  const parts = [`${counts.total} ${counts.total === 1 ? 'zona' : 'zone'}`, `${counts.inProgress} in corso`, `${counts.toStart} da iniziare`, `${counts.completed} ${counts.completed === 1 ? 'completata' : 'completate'}`];
  return parts.join(' · ');
}
