import { geoJsonContainsPoint } from '../pointInPolygon.js';

export function resolveMilanoMunicipio(territories, lat, lng) {
  const matches = (Array.isArray(territories) ? territories : []).filter(item => geoJsonContainsPoint(item.geometry, lat, lng)).sort((a, b) => a.number - b.number);
  if (!matches.length) return { number: null, name: null, boundaryTie: false };
  return { number: matches[0].number, name: matches[0].name, boundaryTie: matches.length > 1 };
}

export function buildMilanoAddressContext({ addressPoint, coverageAddress, nil, municipio, cap }) {
  const lat = Number(addressPoint?.lat ?? coverageAddress?.lat);
  const lng = Number(addressPoint?.lng ?? coverageAddress?.lng);
  return {
    isMilano: true, addressLabel: addressPoint?.label || coverageAddress?.label || null,
    lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null,
    comune: { name: 'Milano', province: 'MI', code: '015146' },
    nil: { id: nil?.code ?? nil?.id ?? coverageAddress?.nearestNilId ?? null, name: nil?.name ?? coverageAddress?.nearestNilName ?? null, available: Boolean(nil?.name ?? coverageAddress?.nearestNilName) },
    municipio: { number: municipio?.number ?? null, name: municipio?.name ?? null, available: Boolean(municipio?.number), boundaryTie: Boolean(municipio?.boundaryTie) },
    cap: { code: cap?.cap ?? null, available: Boolean(cap?.cap), source: cap?.source ?? 'unavailable', label: cap?.label ?? 'CAP non disponibile' },
  };
}
