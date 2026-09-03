import React from "react";

const F = { sans: "'DM Sans', Inter, system-ui, sans-serif" };
const ORANGE = "#E8571A";

// Launcher compatto del solo assistente contestuale. Il pannello e i fallback
// di contatto vivono nel componente AI condiviso, non nella logica degli Step.
export default function InlineHelpCta({ onAsk, expanded = false }) {
  const wrap = {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 120,
    fontFamily: F.sans,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    pointerEvents: "none",
  };
  const pill = {
    pointerEvents: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 15px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(10,18,34,0.94)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
  };
  return (
    <div style={wrap}>
      <button type="button" style={pill} onClick={onAsk} aria-expanded={expanded} aria-controls="quote-ai-panel">
        <span aria-hidden="true" style={{ width: 27, height: 27, display: "grid", placeItems: "center", borderRadius: 9, background: ORANGE, fontSize: 15 }}>?</span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25 }}>
          <span>Hai bisogno di aiuto?</span>
          <span style={{ color: "rgba(255,255,255,.62)", fontSize: 10, fontWeight: 650 }}>Chiedi all’assistente VolantiniPro</span>
        </span>
      </button>
    </div>
  );
}
