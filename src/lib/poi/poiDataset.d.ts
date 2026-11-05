// Tipi di src/lib/poi/poiDataset.js per i gusci TypeScript (api/poi-search.ts).
export type PoiDatasetCell = { n: Array<[number, number, number, Record<string, string>]>; w: Array<[number, number, number, Record<string, string>]> };
export type PoiDatasetQueryResult = { covered: true; elements: any[] } | { covered: false; reason: string };

export function cellsForCircle(circle: { centerLat: number; centerLng: number; radiusKm: number }, cellDeg: number): string[];
export function queryPoiDataset(
  dataset: { manifest: any; cells: Record<string, PoiDatasetCell> },
  query: { centerLat: number; centerLng: number; radiusKm: number; tags: Array<{ key: string; val: string }>; cap: number },
): PoiDatasetQueryResult;
export function validatePoiBundle(manifest: any, bundle: any): string | null;
