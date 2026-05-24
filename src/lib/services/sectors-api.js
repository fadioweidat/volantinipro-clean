import { supabase } from '../supabaseClient.js';

/**
 * Fetches operational sectors from `map_sectors` via PostgREST RPC.
 * Returns a GeoJSON FeatureCollection, or null when backend is not ready.
 */
export async function fetchSectors({ serviceType, centerLat, centerLng, radiusKm = 5 }) {
  if (!supabase) return null;

  const { data, error } = await supabase.rpc('get_map_sectors', {
    p_service_type: serviceType,
    p_center_lat:   centerLat,
    p_center_lng:   centerLng,
    p_radius_km:    radiusKm,
  });

  if (error) {
    // Table / function not yet migrated — silent fallback so map stays usable
    const msg = error.message ?? '';
    if (
      msg.includes('does not exist') ||
      msg.includes('404') ||
      msg.includes('42883') ||  // PostgreSQL: undefined_function
      msg.includes('function')
    ) {
      return null;
    }
    throw error;
  }

  return data ?? null;
}

/**
 * Converts the GeoJSON FeatureCollection from `get_map_sectors` into the
 * internal format expected by Step2Map: Array<{id, numero, name, municipalityCode, geometry}>.
 */
export function parseSectorsGeoJSON(featureCollection) {
  if (!featureCollection?.features?.length) return [];
  return featureCollection.features
    .filter(f => f?.geometry)
    .map(f => ({
      id:               f.properties?.id ?? null,
      numero:           f.properties?.sector_number ?? 1,
      name:             f.properties?.sector_name ?? null,
      municipalityCode: f.properties?.municipality_code ?? null,
      serviceType:      f.properties?.service_type ?? null,
      geometry:         f.geometry,
    }));
}
