// Raggio della SOLA richiesta POI (usePoi -> /api/poi-search) in Step 2.
//
// In modalità Comune/NIL Step 2 usa un raggio TECNICO di analisi
// (effectiveRadiusKm: 15 km per Milano NIL, 25 km per più comuni) che serve a
// recuperare tutte le zone dal backend. Passato così com'è ai POI, senza un
// settore specifico, la query Overpass con tutte le categorie non risponde
// entro il timeout per provider (misure 2026-09-30: Milano 12-15 km e
// multi-comune 25 km sempre in timeout; 6 km ok 3/3 in ~6 s).
//
// Regola (e SOLO questa): se il raggio POI è quello tecnico di analisi e non
// c'è un settore che restringa le categorie, la richiesta POI usa al massimo
// POI_NO_SECTOR_MAX_RADIUS_KM. Nessun altro valore di Step 2 cambia: analisi
// territoriale, NIL, comuni, famiglie, quantità, copertura, pricing e
// useSectors continuano a usare i raggi di sempre. Con un settore specifico,
// in modalità Raggio (scelta dell'utente) o con un indirizzo (2,5 km) il
// raggio POI resta esattamente quello attuale.
import { getPoiTagsForService, getPoiTagsForTargets } from '../services/poi-api.js';

export const POI_NO_SECTOR_MAX_RADIUS_KM = 6;

/**
 * true se la selezione restringe davvero le categorie POI richieste. Stessa
 * regola della query server (getServiceTargetTags in
 * supabase/functions/_shared/poiSearchProxy.ts, allineata dai test): nessun
 * target, 'all', 'altro' o target senza categorie mappate = tutte le categorie.
 */
export function hasSpecificPoiSector(serviceType, targetSelection) {
  const all = getPoiTagsForService(serviceType);
  const selected = getPoiTagsForTargets(serviceType, targetSelection);
  return selected.length > 0 && selected.length < all.length;
}

/**
 * @param {{ poiRadiusKm: number, usesTechnicalAnalysisRadius: boolean, serviceType: string, targetSelection: string[] }} p
 * @returns {number} raggio da inviare a usePoi
 */
export function resolvePoiQueryRadiusKm({ poiRadiusKm, usesTechnicalAnalysisRadius, serviceType, targetSelection }) {
  const radius = Number(poiRadiusKm);
  if (!Number.isFinite(radius) || radius <= 0) return poiRadiusKm;
  if (!usesTechnicalAnalysisRadius) return poiRadiusKm;
  if (hasSpecificPoiSector(serviceType, targetSelection)) return poiRadiusKm;
  return Math.min(radius, POI_NO_SECTOR_MAX_RADIUS_KM);
}
