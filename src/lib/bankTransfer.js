// Coordinate bancarie per il pagamento tramite bonifico.
//
// NESSUN fallback operativo: se anche una sola tra VITE_IBAN /
// VITE_INTESTATARIO / VITE_BANCA non e' configurata, il metodo bonifico e'
// "non disponibile" e la UI NON deve mai mostrare IBAN / intestatario /
// banca placeholder — un cliente che copiasse coordinate finte invierebbe
// denaro nel vuoto. In quel caso i chiamanti mostrano
// BANK_TRANSFER_UNAVAILABLE_MESSAGE al posto delle istruzioni.

export const BANK_TRANSFER_UNAVAILABLE_MESSAGE =
  "Pagamento tramite bonifico temporaneamente non disponibile.";

// Lettura env robusta: import.meta.env sotto Vite (dev server e build),
// process.env come fallback quando il modulo gira sotto il test runner Node
// puro (dove import.meta.env non esiste e l'accesso alla proprieta' lancia).
function readBankEnv(name) {
  let raw;
  try {
    raw = import.meta.env[name];
  } catch {
    raw = typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  }
  return typeof raw === "string" ? raw.trim() : "";
}

export function getBankTransferDetails() {
  const iban = readBankEnv("VITE_IBAN");
  const intestatario = readBankEnv("VITE_INTESTATARIO");
  const banca = readBankEnv("VITE_BANCA");
  const available = Boolean(iban && intestatario && banca);
  return { available, iban, intestatario, banca };
}
