import React from "react";

// NOTE: Allo stato attuale (commit 85bb090), non esiste un controllo di ruolo frontend per Admin.
// AdminDashboard viene renderizzato direttamente e si affida interamente a Supabase RLS.
// Questo componente preserva il comportamento esatto, comportandosi come pass-through.
// RISCHIO SEPARATO: Assenza di role verification frontend.
export function AdminGuard({ children }) {
  return <>{children}</>;
}
