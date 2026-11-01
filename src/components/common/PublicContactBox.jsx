import React from "react";
import { buildInfoMailtoUrl, buildInfoWhatsAppUrl } from "../../lib/contactConfig.js";

const F = "'DM Sans', Inter, system-ui, sans-serif";
const WHATSAPP_FALLBACK_URL = "https://wa.me/393517673737";
const link = {
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  textDecoration: "none",
  padding: "7px 11px",
  borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.06)",
};

// Al posto dell'assistente per i visitatori anonimi: solo contatti, nessuna AI.
export default function PublicContactBox() {
  return (
    <aside
      aria-label="Contatti VolantiniPro"
      data-testid="public-contact-box"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 120,
        fontFamily: F,
        padding: "11px 13px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(10,18,34,0.94)",
        color: "#fff",
        boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Hai domande? Scrivici</div>
      <div style={{ display: "flex", gap: 8 }}>
        <a style={link} href={buildInfoWhatsAppUrl() || WHATSAPP_FALLBACK_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a style={link} href={buildInfoMailtoUrl()}>Email</a>
      </div>
    </aside>
  );
}
