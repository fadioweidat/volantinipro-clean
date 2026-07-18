export function formatNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("it-IT").format(n).replace(/[\s\u202F\u00A0]/g, ".");
}

export const formatNumero = formatNumber;

export function formatIntegerIT(value, fallback = "Dato non disponibile") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n));
}

export function formatDecimalIT(value, digits = 1, fallback = "Dato non disponibile") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: "always",
  }).format(n);
}

export function formatPercentIT(value, digits = 0, fallback = "Dato non disponibile") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return `${formatDecimalIT(n, digits, fallback)}%`;
}

export function formatAreaIT(value, fallback = "Dato non disponibile") {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return `${formatDecimalIT(n, 1, fallback)} km²`;
}

export function formatCurrency(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
