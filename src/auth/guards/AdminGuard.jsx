import React, { useEffect, useState } from "react";
import {
  hasSupabaseConfig,
  getStoredSupabaseSession,
  consumeSupabaseAuthHash,
  isStoredSupabaseSessionValid,
  clearStoredSupabaseSession
} from "../session.js";

// Verifica reale (non piu' pass-through): richiede una sessione Supabase
// autenticata, con lo stesso meccanismo gia' usato da CustomerGuard/DashboardPage
// (localStorage "vp_supabase_session" + consumo dell'hash #access_token del
// magic link). La sessione viene letta/consumata in modo sincrono nel primo
// render (useState lazy init), cosi' children non viene mai dipinto per un
// utente non autenticato, nemmeno per un frame.
//
// RISCHIO RESIDUO DOCUMENTATO: in questo progetto non esiste una verifica di
// ruolo Admin (nessuna tabella/claim ruolo lato Supabase, nessun controllo
// backend). Questo guard blocca quindi l'accesso ANONIMO, ma qualunque
// sessione Supabase autenticata (anche una sessione cliente) supera il
// controllo. Non inventiamo un ruolo ne' un token finto: i dati reali restano
// protetti solo da Supabase RLS, invariata.
export function AdminGuard({ onNav, children }) {
  const [session, setSession] = useState(
    () => consumeSupabaseAuthHash("/admin") || getStoredSupabaseSession()
  );

  const authorized = !hasSupabaseConfig() || isStoredSupabaseSessionValid(session);

  useEffect(() => {
    if (authorized) return;
    if (session) clearStoredSupabaseSession();
    onNav?.("login", { context: "admin" });
  }, [authorized, session, onNav]);

  if (!authorized) return null;
  return <>{children}</>;
}
