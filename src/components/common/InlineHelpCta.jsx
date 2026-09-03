import React, { useState } from "react";
import { buildInfoWhatsAppUrl } from "../../lib/contactConfig.js";

const F = { sans: "'DM Sans', Inter, system-ui, sans-serif" };
const ORANGE = "#E8571A";

// Richiamo di aiuto compatto per il configuratore (Step 1-4). Fisso in basso a
// destra, piccolo, richiudibile: NON copre il contenuto e non entra nel flusso.
// "Chiedi all'AI" -> onAsk (di norma va allo step con l'assistente).
// "WhatsApp" -> wa.me, solo se il numero ufficiale è configurato.
export default function InlineHelpCta({ onAsk }) {
  const [open, setOpen] = useState(false);
  const whatsappUrl = buildInfoWhatsAppUrl();

  const wrap = {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 120,
    fontFamily: F.sans,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 8,
    pointerEvents: "none",
  };
  const pill = {
    pointerEvents: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(10,18,34,0.94)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
    backdropFilter: "blur(8px)",
  };
  const action = (primary) => ({
    pointerEvents: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 14px",
    borderRadius: 10,
    textDecoration: "none",
    border: primary ? "none" : "1px solid rgba(255,255,255,0.18)",
    background: primary ? ORANGE : "rgba(10,18,34,0.94)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
  });

  if (!open) {
    return (
      <div style={wrap}>
        <button type="button" style={pill} onClick={() => setOpen(true)} aria-expanded="false">
          <span aria-hidden="true">💬</span> Hai bisogno di aiuto?
        </button>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div
        style={{
          pointerEvents: "auto",
          background: "rgba(10,18,34,0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 14,
          padding: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxWidth: 260,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Hai bisogno di aiuto?</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Chiudi"
            style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.6)", fontSize: 16, cursor: "pointer", lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={action(true)} onClick={() => { setOpen(false); onAsk?.(); }}>
            <span aria-hidden="true">🤖</span> Chiedi all’AI
          </button>
          {whatsappUrl ? (
            <a style={action(false)} href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
              <span aria-hidden="true">🟢</span> WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
