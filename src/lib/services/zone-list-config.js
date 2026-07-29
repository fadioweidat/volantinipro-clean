export const SOGLIA_RILEVANZA_ZONA = {
  min_percent_nel_raggio: 10,
  min_famiglie: 500,
};

export const GRANDE_CITTA_ZONE_THRESHOLD = 15;

export function isZonaRilevante(zone, thresholds = SOGLIA_RILEVANZA_ZONA) {
  const percent = Number(zone?.coverage ?? zone?.pct ?? zone?.percent_nel_raggio ?? 0);
  const families = Number(zone?.families ?? zone?.famiglie ?? 0);
  return percent >= thresholds.min_percent_nel_raggio || families >= thresholds.min_famiglie;
}
