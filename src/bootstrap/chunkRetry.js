// Bug "pagina bianca Driver da WhatsApp/Chrome Android" — Fase D. Funzioni
// pure/quasi-pure (l'unico side effect e' sessionStorage, mai localStorage
// ne' alcuna chiamata di rete) estratte da src/main.jsx per essere
// testabili senza eseguire il bootstrap reale (main.jsx chiama
// createRoot(...).render(...) a livello di modulo, che richiede un vero
// DOM browser e non puo' essere importato sotto node:test).
//
// SOLO un flag booleano per pathname in sessionStorage — MAI un token o un
// dato di assignment: l'access token del Driver non transita mai per questo
// modulo (letto solo da window.location.search dentro gli hook Driver).
export const CHUNK_RETRY_KEY_PREFIX = "volantinipro:driver-bootstrap-retry:";

export function chunkRetryKey(pathname) {
  return `${CHUNK_RETRY_KEY_PREFIX}${pathname}`;
}

export function hasAlreadyRetried(pathname) {
  try {
    return window.sessionStorage.getItem(chunkRetryKey(pathname)) === "1";
  } catch {
    // sessionStorage indisponibile (es. modalita' privata restrittiva):
    // fail-safe verso "non ha ancora ritentato", cosi' l'utente ottiene
    // comunque un tentativo di reload invece di restare bloccato.
    return false;
  }
}

export function markRetried(pathname) {
  try {
    window.sessionStorage.setItem(chunkRetryKey(pathname), "1");
  } catch {
    // Non fatale: se sessionStorage non e' scrivibile il reload avviene
    // comunque, semplicemente non c'e' modo di ricordare che e' gia'
    // avvenuto — nel caso peggiore un secondo reload in piu', mai un loop
    // infinito perche' la pagina, se il problema persiste, mostrera'
    // comunque l'errore alla ricarica successiva (nessuno stato che si
    // auto-perpetua).
  }
}

export function clearRetryFlag(pathname) {
  try {
    window.sessionStorage.removeItem(chunkRetryKey(pathname));
  } catch {
    // ignore
  }
}

// Pattern reali osservati per un chunk/dynamic import fallito nei browser
// principali (Chrome/Firefox/Safari) — MAI un errore applicativo generico:
// un falso positivo qui farebbe ricaricare la pagina invece di mostrare un
// vero errore, nascondendo bug reali.
export const CHUNK_LOAD_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w.-]+ failed|Unable to preload CSS/i;

export function isChunkLoadError(error) {
  return CHUNK_LOAD_ERROR_PATTERN.test(String(error?.message || ""));
}
