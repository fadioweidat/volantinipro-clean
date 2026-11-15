import React, { useEffect, useState } from "react";
import { restoreSupabaseSession, verifySupabaseAdminRole } from "../../auth/session.js";

// Un utente puo' essere sia Cliente sia Admin con la stessa email.
// Mostra il cambio area soltanto dopo un controllo positivo lato backend;
// AdminGuard verifica comunque nuovamente il ruolo sulla route /admin.
export default function AdminAreaSwitch({ onNav }) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreSupabaseSession()
      .then(async (session) => Boolean(session && await verifySupabaseAdminRole(session)))
      .then((isAdmin) => { if (active) setAllowed(isAdmin); })
      .catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, []);

  if (!allowed) return null;

  return (
    <button
      type="button"
      onClick={() => onNav("admin")}
      style={{
        minHeight: 44,
        padding: "0 16px",
        borderRadius: 10,
        border: "1px solid rgba(46,204,138,.4)",
        background: "rgba(46,204,138,.12)",
        color: "#2ecc8a",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      Vai ad Admin
    </button>
  );
}
