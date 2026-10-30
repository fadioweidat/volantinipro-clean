// Quali servizi di controllo a pagamento ha una campagna. Gli extra stanno in
// campaigns.metadata in tre forme: extra_services (id, configuratore),
// servizi_extra (oggetti dal configuratore, nomi dal Preventivo Rapido) e
// quote_summary.business.proofs (nomi, percorso Business).
// Stessi elenchi di public.campaign_metadata_has_extra (migrazione
// 20261030200000): se ne cambi uno, cambia anche l'altro.
export const GPS_EXTRA_KEYS = Object.freeze([
  "tracking_gps", "gps", "gps_default", "gps_plus_report", "control_pro", "control_pro_99",
  "tracking gps", "tracking gps live", "gps + report finale", "controllo pro",
]);
export const PHOTO_EXTRA_KEYS = Object.freeze([
  "photo_proof", "foto", "foto_localizzate", "photo_report_advanced", "control_pro", "control_pro_99",
  "foto proof", "foto proof base", "report fotografico", "report fotografico completo", "controllo pro",
  "foto geolocalizzate",
]);

const array = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

function extraKeys(metadata) {
  const source = metadata && typeof metadata === "object" ? metadata : {};
  const keys = [
    ...array(source.extra_services),
    ...array(source.quote_summary?.business?.proofs),
    ...array(source.servizi_extra).flatMap((item) => (item && typeof item === "object" ? [item.id, item.label] : [item])),
  ];
  return new Set(keys.map(clean).filter(Boolean));
}

export function campaignExtraAccess(metadata) {
  const keys = extraKeys(metadata);
  return {
    gps: GPS_EXTRA_KEYS.some((key) => keys.has(key)),
    photos: PHOTO_EXTRA_KEYS.some((key) => keys.has(key)),
  };
}

// Admin e operatori vedono sempre tutto: il limite vale solo per il Cliente.
export const FULL_EXTRA_ACCESS = Object.freeze({ gps: true, photos: true });
