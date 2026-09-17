import React, { useEffect, useState } from "react";
import { hasSupabaseConfig, getStoredSupabaseSession } from "../session.js";

function readAccessTokenFromUrlHash() {
  if (typeof window === "undefined") return null;
  const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
  return hash.get("access_token");
}

// Il primo render monta SEMPRE i children (mai bloccato): React esegue
// prima gli effect dei figli (es. DashboardPage), poi quello del genitore —
// e' il figlio stesso a consumare l'hash del magic link e a salvare la
// sessione nel proprio effect di mount. Se qui bloccassimo il render dei
// children finche' non "confermato", quell'effect non scatterebbe mai e il
// login via magic link (e qualunque altro flusso che stabilisce la
// sessione dal mount di un figlio) si romperebbe — era esattamente il
// motivo per cui il rendering non era mai bloccato prima. Vedi test
// "non reindirizza se un figlio salva la sessione nel proprio effect di
// mount" in tests/auth_login_admin_guard.test.mjs.
//
// Il fix qui e' piu' stretto: a differenza della versione precedente, se il
// PROPRIO effect (che corre DOPO quello dei figli, nello stesso commit)
// trova che non esiste ancora nessuna sessione ne' un token da consumare,
// i children vengono nascosti immediatamente (return null) insieme al
// redirect — invece di restare visibili a tempo indeterminato in attesa che
// la navigazione altrove prenda effetto. Per un visitatore anonimo comune
// questo chiude la finestra di "flash" al minimo possibile (un solo giro di
// render+effect), senza toccare in alcun modo il caso legittimo in cui un
// figlio stabilisce la sessione al proprio mount.
export function CustomerGuard({ onNav, children }) {
  const session = getStoredSupabaseSession();
  const [confirmed, setConfirmed] = useState(true);

  useEffect(() => {
    const accessToken = readAccessTokenFromUrlHash();

    // React esegue prima gli effect dei figli (es. DashboardPage), poi quelli
    // del genitore: se il figlio ha appena consumato l'hash del magic link e
    // salvato la sessione, a questo punto e' gia' in localStorage anche se la
    // variabile "session" catturata al render (prima che il figlio agisse) e'
    // ancora null. Rileggerla qui evita il redirect a login sulla sessione
    // appena creata (race condition al primo caricamento del magic link).
    const currentSession = getStoredSupabaseSession();
    if (hasSupabaseConfig() && !currentSession && !accessToken) {
      setConfirmed(false);
      onNav("login");
      return;
    }
    setConfirmed(true);
  }, [session, onNav]);

  if (!confirmed) return null;
  return <>{children}</>;
}
