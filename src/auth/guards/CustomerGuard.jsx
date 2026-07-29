import React, { useEffect } from "react";
import { hasSupabaseConfig, getStoredSupabaseSession } from "../session.js";

export function CustomerGuard({ onNav, children }) {
  const session = getStoredSupabaseSession();

  useEffect(() => {
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const accessToken = hash.get("access_token");

    // Mantieni il comportamento esatto: se c'è config ma non c'è sessione e neanche token nell'hash, redirect a login.
    if (hasSupabaseConfig() && !session && !accessToken) {
      onNav("login");
    }
  }, [session, onNav]);

  // Nel componente originale, il rendering non era bloccato, ma il redirect scattava nell'useEffect.
  // Manteniamo questo comportamento per ora.
  return <>{children}</>;
}
