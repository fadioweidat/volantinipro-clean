// Motore deterministico "Fattibilità della mia attività". Nessuna chiamata di
// rete qui: prende in input i dati REALI già recuperati (territorio + POI) e
// produce concorrenza / bacino potenziale / punteggio finale con regole
// fisse e verificabili. Nessun dato mancante viene inventato: dove non c'è
// una fonte reale il campo torna `null` e la UI mostra "Dato non disponibile".
import { NOT_AVAILABLE, PRELIMINARY, competitorCategoriesForTargets } from './feasibilityBusinessSchemas.js';

// ── Affidabilità dei dati (ticket "PREMIUM FEASIBILITY REPORTS" §4) ────────
// Regola deterministica e trasparente: conta quante fonti reali erano
// disponibili su un totale fisso di 4 — MAI un punteggio statistico
// inventato. Le 4 fonti coincidono con gli esempi del ticket: geocoding
// risolto, ISTAT (popolazione/famiglie), provider POI raggiungibile, dati
// cliente completi.
export function computeDataReliability({ locationResolved, territorialAvailable, poisAvailable, inputsComplete }) {
  const factors = [
    { name: 'Località geocodificata', available: Boolean(locationResolved) },
    { name: 'Dati ISTAT (popolazione/famiglie)', available: Boolean(territorialAvailable) },
    { name: 'Provider punti di interesse raggiungibile', available: Boolean(poisAvailable) },
    { name: 'Dati cliente completi', available: Boolean(inputsComplete) },
  ];
  const available = factors.filter(f => f.available).length;
  const level = available >= 3 ? 'ALTA' : available === 2 ? 'MEDIA' : 'BASSA';
  return { level, factors, factorsAvailable: available, factorsPossible: factors.length };
}

const EARTH_RADIUS_KM = 6371;
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * @param {object} params
 * @param {{lat:number,lng:number}} params.center
 * @param {number} params.radiusKm
 * @param {Array} params.pois real POIs from usePoi/fetchPois (may be [])
 * @param {boolean} params.poisAvailable false only on a real fetch error (never on "0 results")
 * @param {string[]} params.targets activityToPoiTargets(...).targets
 * @param {{population:number|null, households:number|null, available:boolean}} params.territorial
 * @param {boolean} params.inputsComplete true se i campi cliente richiesti erano validi (§4 data reliability)
 */
export function buildBusinessAnalysis({ center, radiusKm, pois = [], poisAvailable = true, targets = [], territorial, inputsComplete = true }) {
  const competitorCats = competitorCategoriesForTargets(targets);
  const distanced = (pois || []).map(p => ({ ...p, distanceKm: center ? Math.round(haversineKm(center.lat, center.lng, p.lat, p.lng) * 100) / 100 : null }));

  const competitors = competitorCats.length
    ? distanced.filter(p => competitorCats.includes(p.category)).sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
    : [];
  const complementary = distanced.filter(p => !competitorCats.includes(p.category)).sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));

  const area = radiusKm > 0 ? Math.PI * radiusKm * radiusKm : null;
  const competitorDensity = competitorCats.length && area ? competitors.length / area : null;

  // Soglie deterministiche (per km²), scelte per un raggio tipico di analisi
  // (3-5 km): documentate qui, non "a sensazione" nel report.
  let competitionLevel = NOT_AVAILABLE;
  if (!poisAvailable) competitionLevel = NOT_AVAILABLE;
  else if (!competitorCats.length) competitionLevel = NOT_AVAILABLE; // attività non mappata: nessuna base per classificare la concorrenza
  else if (competitorDensity == null) competitionLevel = NOT_AVAILABLE;
  else if (competitorDensity < 0.5) competitionLevel = 'BASSA';
  else if (competitorDensity < 1.5) competitionLevel = 'MEDIA';
  else competitionLevel = 'ALTA';

  const targetPotential = {
    households: territorial?.available ? territorial.households : null,
    population: territorial?.available ? territorial.population : null,
    available: Boolean(territorial?.available),
  };

  // Punteggio finale deterministico: combina densità demografica (bacino),
  // livello di concorrenza (inverso) e contesto POI (complementari nel
  // raggio). Ogni fattore "Dato non disponibile" viene escluso dalla somma
  // (mai sostituito con un valore a caso) e il punteggio si basa solo sui
  // fattori realmente disponibili; se NESSUN fattore è disponibile il
  // risultato è "Valutazione preliminare" (vedi sotto), mai un voto inventato.
  const factors = [];
  if (targetPotential.available) {
    const pop = targetPotential.population || 0;
    factors.push(pop >= 15000 ? 2 : pop >= 5000 ? 1 : 0); // bacino: alto/medio/basso
  }
  if (competitionLevel !== NOT_AVAILABLE) {
    factors.push(competitionLevel === 'BASSA' ? 2 : competitionLevel === 'MEDIA' ? 1 : 0); // meno concorrenza = meglio
  }
  if (poisAvailable) {
    factors.push(complementary.length >= 8 ? 2 : complementary.length >= 3 ? 1 : 0); // contesto/traffico
  }

  // Nessun fattore reale disponibile: un ALTA/MEDIA/BASSA "normale" qui
  // sarebbe un verdetto forte su zero dati. Il giudizio complessivo diventa
  // "Valutazione preliminare" (§5) — i singoli campi restano NOT_AVAILABLE.
  let score = PRELIMINARY;
  if (factors.length > 0) {
    const avg = factors.reduce((s, v) => s + v, 0) / factors.length;
    score = avg >= 1.5 ? 'ALTA' : avg >= 0.75 ? 'MEDIA' : 'BASSA';
  }

  const locationResolved = Boolean(center);
  const dataReliability = computeDataReliability({
    locationResolved,
    territorialAvailable: targetPotential.available,
    poisAvailable,
    inputsComplete,
  });

  return {
    center, radiusKm,
    competitors: competitors.slice(0, 12),
    competitorCount: competitorCats.length ? competitors.length : null,
    complementaryPois: complementary.slice(0, 12),
    competitionLevel,
    competitorDensity: competitorDensity != null ? Math.round(competitorDensity * 100) / 100 : null,
    nearestCompetitorKm: competitors[0]?.distanceKm ?? null,
    targetPotential,
    score,
    factorsUsed: factors.length,
    factorsPossible: 3,
    poisAvailable,
    locationResolved,
    dataReliability,
  };
}
