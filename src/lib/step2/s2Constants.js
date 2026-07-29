import { GEO_DATA } from "../geoData.js";
import { ZONE_DATA } from "./zoneData.js";

const RADIUS_OPTIONS = [.5, 1, 2, 3, 5, 8, 10];

export const S2_CITIES = ZONE_DATA.map(z => ({
  ...z,
  ...(GEO_DATA.find(c => c.id === z.id) || {})
}));

export const S2_RADII = RADIUS_OPTIONS;

export const S2_ZONES = S2_CITIES;
