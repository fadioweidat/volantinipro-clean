import React, { useEffect, useState } from "react";
import {
  hasSupabaseConfig,
  getStoredSupabaseSession,
  consumeSupabaseAuthHash,
  restoreSupabaseSession,
  verifySupabaseAdminRole
} from "../session.js";
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
  const [roleStatus, setRoleStatus] = useState("checking"); // checking | admin | denied | anonymous | config_error

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
    void restoreSupabaseSession().then(async (restoredSession) => {
      if (cancelled) return;
      if (!restoredSession) {
        setRoleStatus("anonymous");
        onNav?.("login", { context: "admin" });
        return;
      }
      setSession(restoredSession);
      const isAdmin = await verifySupabaseAdminRole(restoredSession);
      if (!cancelled) setRoleStatus(isAdmin ? "admin" : "denied");
    });
    return () => {
      cancelled = true;
    };
    // La sessione iniziale e' intenzionalmente una snapshot: il suo refresh
    // viene gestito dalla SDK e sincronizzato nello storage, non riavviando il
    // guard a ogni rotazione del token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // onNav rimosso dalle dipendenze per evitare il re-trigger a ogni render di AppRouter

  if (roleStatus === "anonymous") return null;
  if (roleStatus === "checking") return <AdminRoleCheckingPlaceholder />;
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
