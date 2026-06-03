export function formatNumber(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("it-IT").format(n);
}

export const formatNumero = formatNumber;

export function formatCurrency(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
