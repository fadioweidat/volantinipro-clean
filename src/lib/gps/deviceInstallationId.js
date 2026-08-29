// Identificatore di INSTALLAZIONE/BROWSER, non di hardware.
//
// Serve solo a distinguere "questo browser/installazione" da un altro quando
// lo stesso link Driver (stesso access_token) viene aperto su due dispositivi:
// il secondo device non deve adottare/scrivere la sessione GPS del primo.
//
// NON e' un fingerprint hardware: nessun identificatore permanente del
// dispositivo, nessuna probe di canvas/font/hardware. E' un UUID casuale
// generato una sola volta e conservato in localStorage. Se l'utente pulisce i
// dati del browser, il device "diventa" nuovo — comportamento accettabile e
// voluto (e' una nuova installazione).

const STORAGE_KEY = 'vp:gps:device-installation-id';

function randomUuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    // no-op: fallback sotto
  }
  // Fallback non crittografico ma sufficiente a distinguere installazioni.
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getDeviceInstallationId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = randomUuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // localStorage non disponibile (private mode / storage disabilitato):
    // niente ownership persistente possibile — ritorna null e il chiamante
    // ricade sul comportamento "nessun device noto".
    return null;
  }
}

// Claim locale "questo device possiede la sessione X per l'assignment/campagna
// Y". Usato al resume per NON adottare silenziosamente una sessione avviata da
// un altro device. Bypassabile lato client (per questo esiste anche il
// controllo server-side nella migrazione device-ownership) ma sufficiente a
// fermare il caso reale accidentale: link inoltrato e aperto su un secondo
// browser.
function claimKey(scope) {
  return `vp:gps:session-claim:${scope || 'unknown'}`;
}

export function readSessionClaim(scope) {
  try {
    const raw = window.localStorage.getItem(claimKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSessionClaim(scope, sessionId) {
  try {
    window.localStorage.setItem(
      claimKey(scope),
      JSON.stringify({ sessionId, deviceId: getDeviceInstallationId(), at: new Date().toISOString() }),
    );
  } catch {
    // best-effort
  }
}

export function clearSessionClaim(scope) {
  try {
    window.localStorage.removeItem(claimKey(scope));
  } catch {
    // best-effort
  }
}
