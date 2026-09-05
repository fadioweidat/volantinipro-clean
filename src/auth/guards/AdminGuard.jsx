import React, { useEffect, useState } from "react";
import {
  hasSupabaseConfig,
  getStoredSupabaseSession,
  consumeSupabaseAuthHash,
  restoreSupabaseSession,
  verifySupabaseAdminRole,
  getSessionEmail
} from "../session.js";
import { isAuthorizedAdminEmail } from "../adminAuthorization.js";
import { logError, ERROR_CATEGORIES, ERROR_SEVERITY } from "../../lib/monitoring/errorLog.js";

const PANEL_STYLE = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "110px 24px 80px",
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
  color: "rgba(255,255,255,.72)",
  textAlign: "center"
};

function AdminRoleCheckingPlaceholder() {
  return <div style={PANEL_STYLE}>Verifica ruolo Admin in corso...</div>;
}

// TICKET — FIX ADMIN PAGE STUCK ON "VERIFICA RUOLO ADMIN IN CORSO...":
// prima di questo fix restoreSupabaseSession()/verifySupabaseAdminRole()
// venivano solo await-ati, senza alcun timeout — se una delle due richieste
// di rete restava sospesa (visto dal vivo durante un incidente Supabase:
// 504/errori JWT intermittenti sul gateway), roleStatus restava "checking"
// per sempre e la pagina non usciva mai dallo spinner. ADMIN_ROLE_CHECK_
// TIMEOUT_MS pone un limite ragionevole: se la verifica non termina entro
// quel tempo, l'utente vede un errore chiaro con un modo per riprovare,
// mai uno spinner infinito.
const ADMIN_ROLE_CHECK_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("ADMIN_ROLE_CHECK_TIMEOUT")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function AdminRoleCheckErrorPanel({ onRetry }) {
  return (
    <div style={PANEL_STYLE}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Impossibile verificare l'accesso Admin. Riprova.</div>
        <button
          onClick={onRetry}
          style={{
            minHeight: 40,
            padding: "0 20px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(255,255,255,.08)",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Riprova
        </button>
      </div>
    </div>
  );
}

function AdminAccessDeniedPanel({ onNav, reason }) {
  return (
    <div style={PANEL_STYLE}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Accesso negato</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
          {reason || "Sei autenticato ma il tuo account non ha i permessi Admin."}
        </div>
        <button
          onClick={() => onNav?.("home")}
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,.5)",
            fontFamily: "inherit",
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "underline"
          }}
        >
          Torna alla homepage
        </button>
      </div>
    </div>
  );
}

// Verifica reale (non piu' pass-through): richiede una sessione Supabase
// autenticata (stesso meccanismo di CustomerGuard/DashboardPage) E un ruolo
// Admin confermato dal backend tramite l'RPC jwt_is_admin() gia' esistente in
// produzione (vedi session.js:verifySupabaseAdminRole). Distingue quattro stati,
// TUTTI fail-closed tranne l'ultimo:
//   - config Supabase assente                 -> pannello "Accesso negato", nessun redirect
//   - anonimo (nessuna sessione valida)      -> redirect a /login?context=admin
//   - autenticato ma jwt_is_admin() = false   -> pannello "Accesso negato", nessun redirect
//   - autenticato e jwt_is_admin() = true     -> children (Dashboard Admin)
// La sessione viene letta/consumata in modo sincrono nel primo render
// (useState lazy init): children non viene mai dipinto prima che sessione e
// ruolo siano entrambi verificati, nemmeno per un frame.
export function AdminGuard({ onNav, children }) {
  const [session, setSession] = useState(
    () => consumeSupabaseAuthHash("/admin") || getStoredSupabaseSession()
  );
  const [roleStatus, setRoleStatus] = useState("checking"); // checking | admin | denied | anonymous | config_error | error
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      // FAIL-CLOSED: prima di questa fix, config Supabase assente
      // promuoveva automaticamente ad Admin (roleStatus="admin") — un
      // bypass fail-open incompatibile con il resto dell'architettura auth,
      // che nega sempre su qualunque errore/configurazione mancante (vedi
      // verifySupabaseAdminRole in session.js e jwt_is_admin() lato DB).
      // Senza config nota non possiamo raggiungere ne' verificare una
      // sessione ne' un ruolo: l'unico esito corretto e' negare l'accesso,
      // mai concederlo per assenza di dati. Nessun bypass dev/local
      // implicito qui: se serve sviluppo locale senza Supabase configurato,
      // va gestito altrove in modo esplicito, non da questo Guard.
      setRoleStatus("config_error");
      // Configurazione auth realmente mancante su una route Admin: un
      // fallimento infrastrutturale reale (nessuno puo' entrare in /admin
      // finche' non e' risolto), non "utente non autorizzato" — merita un
      // log tecnico distinto dal normale "non-admin" (vedi ramo 'denied'
      // sotto, che NON logga mai). Nessun dato personale/token qui: la
      // configurazione mancante e' nota a priori, non serve leggere nulla
      // dalla sessione.
      logError({
        category: ERROR_CATEGORIES.AUTH,
        module: "admin_guard",
        message: "Configurazione Supabase Auth mancante su route Admin",
        severity: ERROR_SEVERITY.CRITICAL,
      });
      return undefined;
    }
    let cancelled = false;
    setRoleStatus("checking");
    void withTimeout(restoreSupabaseSession(), ADMIN_ROLE_CHECK_TIMEOUT_MS)
      .then(async (restoredSession) => {
        if (cancelled) return;
        if (!restoredSession) {
          setRoleStatus("anonymous");
          onNav?.("login", { context: "admin" });
          return;
        }
        setSession(restoredSession);
        // TICKET — ADMIN MAGIC LINK SOLO PER fenice.sp@gmail.com: controllo
        // locale, sincrono, PRIMA della verifica di rete (jwt_is_admin()).
        // Un'email diversa nega l'accesso immediatamente, senza consumare
        // budget di rete/timeout e senza mai dipendere solo dal frontend —
        // la stessa regola e' applicata anche lato backend in
        // jwt_is_admin()/gps_is_admin() (migration 20260905150000), quindi
        // un utente non potrebbe comunque leggere dati Admin chiamando le
        // RPC direttamente anche aggirando questo controllo client-side.
        const email = getSessionEmail(restoredSession);
        if (!isAuthorizedAdminEmail(email)) {
          if (!cancelled) setRoleStatus("denied");
          return;
        }
        const isAdmin = await withTimeout(verifySupabaseAdminRole(restoredSession), ADMIN_ROLE_CHECK_TIMEOUT_MS);
        if (!cancelled) setRoleStatus(isAdmin ? "admin" : "denied");
      })
      .catch((err) => {
        if (cancelled) return;
        // MAI uno spinner infinito: se la sessione o la verifica del ruolo
        // non terminano entro ADMIN_ROLE_CHECK_TIMEOUT_MS (visto dal vivo
        // durante un incidente di rete/gateway Supabase), l'utente vede un
        // errore chiaro con un modo per riprovare invece di restare bloccato
        // su "Verifica ruolo Admin in corso...". Fail-closed: un timeout non
        // concede MAI l'accesso Admin.
        logError({
          category: ERROR_CATEGORIES.AUTH,
          module: "admin_guard",
          message: err?.message || "Verifica ruolo Admin non completata",
          severity: ERROR_SEVERITY.WARNING,
        });
        setRoleStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // La sessione iniziale e' intenzionalmente una snapshot: il suo refresh
    // viene gestito dalla SDK e sincronizzato nello storage, non riavviando il
    // guard a ogni rotazione del token. retryToken forza un nuovo tentativo
    // quando l'utente preme "Riprova" dopo un timeout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]); // onNav rimosso dalle dipendenze per evitare il re-trigger a ogni render di AppRouter

  if (roleStatus === "anonymous") return null;
  if (roleStatus === "checking") return <AdminRoleCheckingPlaceholder />;
  if (roleStatus === "error") return <AdminRoleCheckErrorPanel onRetry={() => setRetryToken((t) => t + 1)} />;
  // Nessuno stack trace/variabile ambiente esposta: solo un messaggio
  // diagnostico generico, stesso pannello "Accesso negato" gia' usato per
  // un ruolo non-Admin — nessuna nuova UX introdotta.
  if (roleStatus === "config_error") return <AdminAccessDeniedPanel onNav={onNav} reason="Configurazione autenticazione non disponibile." />;
  if (roleStatus === "denied") return <AdminAccessDeniedPanel onNav={onNav} />;
  // roleStatus === "admin" qui sotto: jwt_is_admin() e' gia' stato verificato
  // dal backend. Il render-prop espone la sessione verificata ai children che
  // ne hanno bisogno (es. AdminDashboard per costruire l'identita' AI Admin)
  // SOLO dopo questo controllo, mai prima. I children che restano JSX semplice
  // (invariati) continuano a funzionare esattamente come prima.
  return typeof children === "function" ? children({ session, role: "admin" }) : children;
}
