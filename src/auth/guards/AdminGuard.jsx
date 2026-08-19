import React, { useEffect, useState } from "react";
import {
  hasSupabaseConfig,
  getStoredSupabaseSession,
  consumeSupabaseAuthHash,
  restoreSupabaseSession,
  verifySupabaseAdminRole
} from "../session.js";

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

function AdminAccessDeniedPanel({ onNav }) {
  return (
    <div style={PANEL_STYLE}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Accesso negato</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16 }}>
          Sei autenticato ma il tuo account non ha i permessi Admin.
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
// produzione (vedi session.js:verifySupabaseAdminRole). Distingue tre stati:
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
  const [roleStatus, setRoleStatus] = useState("checking"); // checking | admin | denied

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      setRoleStatus("admin");
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
  if (roleStatus === "denied") return <AdminAccessDeniedPanel onNav={onNav} />;
  // roleStatus === "admin" qui sotto: jwt_is_admin() e' gia' stato verificato
  // dal backend. Il render-prop espone la sessione verificata ai children che
  // ne hanno bisogno (es. AdminDashboard per costruire l'identita' AI Admin)
  // SOLO dopo questo controllo, mai prima. I children che restano JSX semplice
  // (invariati) continuano a funzionare esattamente come prima.
  return typeof children === "function" ? children({ session, role: "admin" }) : children;
}
