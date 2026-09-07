import { InvalidTerritoryGeometry, polygonMetrics } from './territoryTypes.js';

export const MUNICIPI_SOURCE = Object.freeze({
  name: 'Comune di Milano — DS379: Territorio: superficie dei Municipi',
  url: 'https://dati.comune.milano.it/dataset/ds379-infogeo-municipi-superficie',
  resource: 'https://dati.comune.milano.it/dataset/36ba21c2-8b48-43ce-bbe1-e236a8a49ff6/resource/99ecd085-0b04-4fb2-a66e-9795694d4fc4/download/ds379_municipi_label.geojson',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  referenceDate: '2017-01-13', modifiedDate: '2019-12-13',
});
export const MUNICIPI_ATTRIBUTION = 'Comune di Milano — DS379, CC BY 4.0. Geometrie originali; bbox, centroide planare e area sferica calcolati per la visualizzazione.';
export const MUNICIPI_ASSET = '/data/territories/milano-municipi-ds379.geojson';

export function normalizeMilanoMunicipi(dataset) {
  if (dataset?.type !== 'FeatureCollection' || dataset.features?.length !== 9 ||
      (dataset.crs && !['EPSG:4326', 'urn:ogc:def:crs:OGC:1.3:CRS84'].includes(dataset.crs.properties?.name))) {
    throw new InvalidTerritoryGeometry('Dataset Municipi o CRS non valido');
  }
  const seen = new Set();
  const records = dataset.features.map(feature => {
    const number = feature.properties?.MUNICIPIO;
    if (feature.type !== 'Feature' || !Number.isInteger(number) || number < 1 || number > 9 || seen.has(number)) {
      throw new InvalidTerritoryGeometry('Identificativi Municipi non validi');
    }
    seen.add(number);
    return {
      id: `milano-municipio-${number}`, type: 'municipio', number, name: `Municipio ${number}`,
      municipality: 'Milano', province: 'MI', geometry: feature.geometry,
      ...polygonMetrics(feature.geometry), source: MUNICIPI_SOURCE, attribution: MUNICIPI_ATTRIBUTION,
    };
  });
  return records.sort((a, b) => a.number - b.number);
}

// Successful data is cached for the page lifetime. Aborted/failed reads are never cached.
let cached;
export async function loadMilanoMunicipi({ signal, fetchImpl = fetch, timeoutMs = 12000 } = {}) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (cached) return cached;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(MUNICIPI_ASSET, { signal: controller.signal, cache: 'force-cache' });
    if (!response.ok) throw new Error('Dataset Municipi non disponibile');
    const result = normalizeMilanoMunicipi(await response.json());
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    cached = result;
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
