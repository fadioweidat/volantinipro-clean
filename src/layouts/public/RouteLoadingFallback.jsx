import React from "react";

// BUNDLE-OPTIMIZE-1: fallback minimale per i confini React.lazy/Suspense
// introdotti dal code-splitting per ruolo. Stile ripreso identico dal
// placeholder gia' esistente in AdminGuard (AdminRoleCheckingPlaceholder,
// src/auth/guards/AdminGuard.jsx) per restare coerenti con l'UI approvata,
// senza introdurre un nuovo pattern visivo.
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

export function RouteLoadingFallback() {
  return <div style={PANEL_STYLE}>Caricamento in corso...</div>;
}
