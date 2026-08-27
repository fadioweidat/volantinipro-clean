// Validazione/normalizzazione del numero di telefono operatore (schermata
// Admin "Assegna lavoro"). Mirror lato client della stessa regola applicata
// dalla RPC admin_set_operator_phone: cosi' la UI rifiuta l'input non valido
// prima della chiamata, ma la RPC resta comunque l'autorita' finale.
//
// profiles.phone e' NULLABLE: stringa vuota = rimozione consentita.

// Trim + collasso degli spazi interni. Nessun altro rimaneggiamento (il
// numero resta leggibile come lo scrive l'Admin, es. "+39 333 123 4567").
export function normalizePhone(raw) {
  return String(raw ?? "").trim().replace(/\s+/g, " ");
}

// Solo cifre di un numero (per il conteggio minimo/massimo).
export function phoneDigits(raw) {
  return normalizePhone(raw).replace(/\D/g, "");
}

// true = accettabile (incluso il vuoto = rimozione). Accetta formati
// internazionali con/senza prefisso +, spazi, - . ( ). Rifiuta stringhe
// casuali, numeri troppo corti, caratteri non telefonici.
export function isValidPhone(raw) {
  const v = normalizePhone(raw);
  if (v === "") return true;
  if (!/^[+]?[0-9 ().\-]{7,}$/.test(v)) return false;
  const digits = phoneDigits(v);
  return digits.length >= 8 && digits.length <= 15;
}

export const PHONE_INPUT_PLACEHOLDER = "+39 333 1234567";
