import { supabase } from '../supabaseClient.js';

/**
 * Fetches operational sectors from `map_sectors` via PostgREST RPC.
 * Returns a GeoJSON FeatureCollection, or null when backend is not ready.
 */
export async function fetchSectors({ serviceType, centerLat, centerLng, radiusKm = 5, signal }) {
  if (!supabase) return null;

  if (import.meta.env.DEV) console.log(`[MAP_SECTORS_REQUEST] type: ${serviceType}, lat: ${centerLat}, lng: ${centerLng}, radiusKm: ${radiusKm}`);

  try {
    const { data, error } = await supabase.rpc('get_map_sectors', {
      p_service_type: serviceType,
      p_center_lat:   centerLat,
      p_center_lng:   centerLng,
      p_radius_km:    radiusKm,
    }, { signal });

    if (error) {
      if (import.meta.env.DEV) console.warn("[MAP_SECTORS_ERROR]", error);
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
      // Return null instead of throwing to prevent crashing
      return null;
    }

    if (import.meta.env.DEV) console.log(`[MAP_SECTORS_RESPONSE] Success, received features: ${data?.features?.length || 0}`);
    return data ?? null;
  } catch (err) {
    if (err.name === 'AbortError') return null;
    if (import.meta.env.DEV) console.error("[MAP_SECTORS_ERROR]", err);
    return null; // fallback
  }
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
