/**
 * Normalizza un valore (stringa, array o numero) di codici ISTAT comunali.
 * 
 * REGOLA PER NUMERI < 6 CIFRE (es. intero 15146 o stringa "15146"):
 * I codici ISTAT ufficiali comunali usati dal progetto sono rigorosamente stringhe di 6 cifre esatte preservando gli zeri iniziali (^\\d{6}$).
 * Pertanto, un valore come 15146 o "15146" NON viene trasformato silenziosamente o indovinato come "015146",
 * ma viene scartato come malformato/non a 6 cifre.
 */
export function normalizeMunicipalityCodes(value) {
  if (value === null || value === undefined) {
    return {
      codes: [],
      canonical: "",
      codesSet: new Set(),
      hasMilano: false
    };
  }

  let rawList = [];
  if (Array.isArray(value)) {
    rawList = value.map(item => String(item));
  } else if (typeof value === "string") {
    rawList = value.split(",");
  } else if (typeof value === "number") {
    rawList = [String(value)];
  } else {
    return {
      codes: [],
      canonical: "",
      codesSet: new Set(),
      hasMilano: false
    };
  }

  const validSet = new Set();
  for (const raw of rawList) {
    const trimmed = raw.trim();
    // Accetta rigorosamente e solo il formato ISTAT a 6 cifre (es. "015146", "015086")
    if (/^\d{6}$/.test(trimmed)) {
      validSet.add(trimmed);
    }
  }

  const codes = Array.from(validSet).sort();
  const canonical = codes.join(",");
  const codesSet = new Set(codes);
  const hasMilano = codesSet.has("015146");

  return {
    codes,
    canonical,
    codesSet,
    hasMilano
  };
}
