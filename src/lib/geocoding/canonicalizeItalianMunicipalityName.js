const CONFIRMED_ITALIAN_MUNICIPALITY_ALIASES = new Map([
  // Nominatim may localize the official Italian municipality Milano as
  // "Milan" even when countrycodes=it. Keep this list intentionally minimal:
  // aliases are accepted only for results explicitly belonging to Italy.
  ['milan', 'Milano'],
]);

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function countryCodeFromContext(context = {}) {
  return cleanName(
    context.country_code
      || context.countryCode
      || context.address?.country_code
      || context.address?.countryCode,
  ).toLowerCase();
}

function preferredAdministrativeName(name, context = {}) {
  const address = context.address || {};
  return cleanName(
    address.city
      || address.town
      || address.municipality
      || address.village
      || address.city_district
      || context.city
      || context.town
      || context.municipality
      || context.village
      || context.city_district
      || name,
  );
}

export function canonicalizeItalianMunicipalityName(name, context = {}) {
  const administrativeName = preferredAdministrativeName(name, context);
  if (!administrativeName || countryCodeFromContext(context) !== 'it') return cleanName(name) || administrativeName;
  return CONFIRMED_ITALIAN_MUNICIPALITY_ALIASES.get(administrativeName.toLowerCase()) || administrativeName;
}

function canonicalizeDisplayName(displayName, rawMunicipality, canonicalMunicipality) {
  const parts = String(displayName || '').split(',').map(part => part.trim()).filter(Boolean);
  if (!rawMunicipality || rawMunicipality === canonicalMunicipality) return parts.join(', ');
  const rawKey = rawMunicipality.toLowerCase();
  return parts.map(part => part.toLowerCase() === rawKey ? canonicalMunicipality : part).join(', ');
}

export function normalizeNominatimGeocodeResult(result = {}, { addressLike = false } = {}) {
  const address = result.address || {};
  const displayName = cleanName(result.display_name || result.name);
  const firstDisplayPart = cleanName(displayName.split(',')[0]);
  const rawMunicipality = preferredAdministrativeName(firstDisplayPart, result);
  const municipality = canonicalizeItalianMunicipalityName(rawMunicipality, result);
  const street = cleanName(address.road || address.pedestrian || address.footway || address.path || firstDisplayPart);
  const houseNumber = cleanName(address.house_number) || null;
  const canonicalFullName = canonicalizeDisplayName(displayName, rawMunicipality, municipality);
  const name = addressLike
    ? canonicalFullName.split(',').slice(0, 3).join(', ')
    : municipality;
  const label = addressLike ? ([street, houseNumber].filter(Boolean).join(' ') || firstDisplayPart) : municipality;

  return {
    id: result.place_id,
    name,
    fullName: canonicalFullName,
    label,
    street,
    houseNumber,
    postcode: address.postcode || null,
    city: municipality,
    province: address.county || address.state || null,
    countryCode: countryCodeFromContext(result) || null,
    lat: Number.parseFloat(result.lat),
    lng: Number.parseFloat(result.lon),
    placeType: result.addresstype || result.type || result.class || null,
    providerPlaceId: result.place_id,
    precision: result.addresstype || result.type || result.class || null,
  };
}

