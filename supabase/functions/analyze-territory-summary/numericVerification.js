// Verifica numerica server-side per la sintesi AI del report territoriale.
// L'AI interpreta i dati, non li genera mai: ogni numero nel testo prodotto
// dal modello deve corrispondere esattamente a un valore presente nel payload
// dati (famiglie, quantita, copertura, componenti dello score, ecc.). Se anche
// un solo numero non trova corrispondenza, il testo va scartato (status: 'fallback').
//
// Modulo in JS puro (nessuna sintassi TypeScript) cosi da poter essere importato
// sia dalla Edge Function Deno (import relativo con estensione .js) sia dalla
// suite di test Node (tests/*.test.mjs), senza duplicare la logica.

const NUMBER_PATTERN = /\d{1,3}(?:\.\d{3})+(?:,\d+)?%?|\d+(?:,\d+)?%?/g;

function normalizeNumberToken(token) {
  let raw = token.trim();
  const isPercent = raw.endsWith("%");
  if (isPercent) raw = raw.slice(0, -1);
  // it-IT: '.' separatore delle migliaia, ',' separatore decimale.
  raw = raw.replace(/\./g, "").replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return { value, isPercent };
}

export function extractNumbersFromText(text) {
  if (!text) return [];
  const matches = String(text).match(NUMBER_PATTERN) || [];
  return matches.map(normalizeNumberToken).filter((n) => n !== null);
}

function plainKey(value) {
  return `n:${Math.round(value * 100) / 100}`;
}

function percentKey(value) {
  return `p:${value.toFixed(1)}`;
}

// Attraversa l'intero payload (numeri e stringhe che a loro volta contengono
// numeri gia formattati) e costruisce l'insieme dei valori ammessi nel testo.
export function collectAllowedNumbersFromPayload(payload) {
  const allowed = new Set();
  const visit = (val) => {
    if (val == null) return;
    if (typeof val === "number") {
      if (!Number.isFinite(val)) return;
      allowed.add(plainKey(val));
      allowed.add(percentKey(val));
      return;
    }
    if (typeof val === "string") {
      for (const n of extractNumbersFromText(val)) {
        allowed.add(plainKey(n.value));
        allowed.add(percentKey(n.value));
      }
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(visit);
      return;
    }
    if (typeof val === "object") {
      Object.values(val).forEach(visit);
    }
  };
  visit(payload);
  return allowed;
}

// Verifica che ogni numero estratto dal testo generato dal modello corrisponda
// a un valore presente nel payload. Le percentuali sono confrontate con
// tolleranza a una cifra decimale (formattazioni legittime equivalenti, es.
// "1,30%" vs "1,3%" restano valide perche normalizzate allo stesso valore).
export function verifyNumbersAgainstPayload(text, payload) {
  const found = extractNumbersFromText(text);
  const allowed = collectAllowedNumbersFromPayload(payload);
  const invalidNumbers = [];
  for (const n of found) {
    const matches = allowed.has(plainKey(n.value)) || allowed.has(percentKey(n.value));
    if (!matches) invalidNumbers.push(n.value);
  }
  return { valid: invalidNumbers.length === 0, invalidNumbers, checkedCount: found.length };
}
