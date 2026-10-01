// Resa di una percentuale di copertura (zona o sessione) senza falsi zeri:
// assente/non numerica -> 'n/d'; 0,09 resta 0,09% (mai arrotondato a 0%).
// La percentuale TOTALE campagna non passa da qui: e' coverageDisplay di
// aggregateOperationalMetrics (final_operational_coverage_pct), identica per
// Admin e Cliente.
export function formatCoveragePercent(value, fallback = 'n/d') {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}
