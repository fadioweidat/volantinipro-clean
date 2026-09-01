// Studio Mappa — generazione automatica su rete stradale REALE.
//
// Riuso consapevole (classe A dell'audit): resolveRoadNetwork e
// selectRoadsFromOrigin sono helper di rete/geometria puri — NON fanno parte
// del "motore operativo GPS" (niente DB, niente campaign_*, niente RPC
// coverage): resolveRoadNetwork chiama solo il proxy server-side `road-network`
// (Overpass). Re-implementare un client Overpass sarebbe fuori scope e
// dannoso. operatorSplit.js NON e' importato: lo Studio usa
// mapStudioOperatorSplit.js.
//
// IMPORTANTE (etichetta richiesta): il risultato e' "N% della RETE STRADALE
// selezionata", MAI "copertura finale". buildAutoResult espone
// `networkPercentLabel` gia' pronto per la UI.

import { resolveRoadNetwork } from '../../../lib/geo/resolveRoadNetwork.js';
import { selectRoadsFromOrigin } from '../../../lib/geo/originRadialSelection.js';

export const AUTO_PRESETS = Object.freeze([25, 50, 60, 70, 80, 90, 100]);
export const AUTO_MIN = 10;
export const AUTO_MAX = 100;

export function clampAutoPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 80;
  return Math.max(AUTO_MIN, Math.min(AUTO_MAX, Math.round(n)));
}

// Scarica (con cache interna del modulo riusato) la rete stradale idonea
// dentro il confine reale del comune. Ritorna { ways, totalLengthM } oppure
// null (source non disponibile — MAI una rete finta).
export async function loadRoadNetwork(municipalityName, boundaryGeoJson) {
  if (!municipalityName || !boundaryGeoJson) return null;
  const net = await resolveRoadNetwork(municipalityName, boundaryGeoJson);
  if (!net || !Array.isArray(net.ways) || net.ways.length === 0 || !(net.totalLengthM > 0)) return null;
  return net;
}

// Seleziona ~percent% della rete per espansione radiale dall'origine.
// origin = [lat,lng]. Ritorna un oggetto pronto per la UI e per l'assegnazione
// all'operatore.
export function buildAutoResult(net, originLatLng, percent) {
  const pct = clampAutoPercent(percent);
  if (!net || !originLatLng) {
    return { ok: false, reason: 'no-network-or-origin', percent: pct };
  }
  const origin = { lat: originLatLng[0], lng: originLatLng[1] };
  const { selectedWays, selectedLengthM, coverageMetricPercent } = selectRoadsFromOrigin(
    { ways: net.ways, totalLengthM: net.totalLengthM },
    origin,
    pct,
    [], // nessuna traccia GPS da evitare nello Studio (progettazione da zero)
  );
  // geometry dei way e' gia' [[lat,lng],...] (resolveRoadNetwork la produce cosi').
  const lines = selectedWays.map((w) => ({ id: w.id, geometry: w.geometry, lengthM: w.lengthM }));
  return {
    ok: true,
    percent: pct,
    requestedPercent: pct,
    // etichetta ESPLICITA richiesta: "80% della rete stradale selezionata"
    networkPercentLabel: `${pct}% della rete stradale selezionata`,
    networkSelectedPercent: Number(coverageMetricPercent.toFixed(1)),
    totalNetworkM: net.totalLengthM,
    selectedNetworkM: selectedLengthM,
    waysTotal: net.ways.length,
    waysSelected: selectedWays.length,
    lines,
  };
}
