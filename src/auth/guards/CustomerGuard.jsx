import React, { useEffect } from "react";
import { hasSupabaseConfig, getStoredSupabaseSession } from "../session.js";

export function CustomerGuard({ onNav, children }) {
  const session = getStoredSupabaseSession();

  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const accessToken = hash.get("access_token");

    // React esegue prima gli effect dei figli (es. DashboardPage), poi quelli
    // del genitore: se il figlio ha appena consumato l'hash del magic link e
    // salvato la sessione, a questo punto e' gia' in localStorage anche se la
    // variabile "session" catturata al render (prima che il figlio agisse) e'
    // ancora null. Rileggerla qui evita il redirect a login sulla sessione
    // appena creata (race condition al primo caricamento del magic link).
    const currentSession = getStoredSupabaseSession();
    if (hasSupabaseConfig() && !currentSession && !accessToken) {
      onNav("login");
    }
  }, [session, onNav]);

  // Nel componente originale, il rendering non era bloccato, ma il redirect scattava nell'useEffect.
  // Manteniamo questo comportamento per ora.
  return <>{children}</>;
}
