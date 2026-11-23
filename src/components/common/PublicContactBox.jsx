import React, { useEffect, useState } from "react";
import { buildInfoMailtoUrl, buildInfoWhatsAppUrl } from "../../lib/contactConfig.js";

const F = "'DM Sans', Inter, system-ui, sans-serif";
const WHATSAPP_FALLBACK_URL = "https://wa.me/393517673737";
const MOBILE_QUERY = "(max-width: 640px)";
const DISMISS_KEY = "vp-contact-box-dismissed-step2";
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
const shell = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 120,
  fontFamily: F,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(10,18,34,0.94)",
  color: "#fff",
  boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
  backdropFilter: "blur(8px)",
};
const iconButton = {
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.7)",
  fontSize: 16,
  lineHeight: 1,
  padding: "4px 6px",
  cursor: "pointer",
  fontFamily: F,
};

function readDismissed() {
  try { return window.sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}
function writeDismissed() {
  try { window.sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage non disponibile */ }
}

function useIsMobile(enabled) {
  const [mobile, setMobile] = useState(() => enabled && typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof window.matchMedia !== "function") { setMobile(false); return undefined; }
    const mq = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [enabled]);
  return mobile;
}

// Al posto dell'assistente per i visitatori anonimi: solo contatti, nessuna AI.
// B5 (2026-11-23): nello Step 2 su telefono il box parte compatto ("Contatti"),
// si apre al tocco e si puo' chiudere, cosi' non copre mappa e "Continua".
// Il box non viene mai tolto: chiuso, resta il pulsante compatto finche' il
// visitatore non lo nasconde per la sessione.
export default function PublicContactBox({ compactOnMobile = false }) {
  const mobileCompact = useIsMobile(compactOnMobile);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(() => compactOnMobile && typeof window !== "undefined" && readDismissed());

  const links = (
    <div style={{ display: "flex", gap: 8 }}>
      <a style={link} href={buildInfoWhatsAppUrl() || WHATSAPP_FALLBACK_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <a style={link} href={buildInfoMailtoUrl()}>Email</a>
    </div>
  );

  if (!mobileCompact) {
    return (
      <aside aria-label="Contatti VolantiniPro" data-testid="public-contact-box" style={{ ...shell, padding: "11px 13px" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Hai domande? Scrivici</div>
        {links}
      </aside>
    );
  }

  if (dismissed) return null;

  if (!expanded) {
    return (
      <aside aria-label="Contatti VolantiniPro" data-testid="public-contact-box" data-compact="true" style={{ ...shell, right: 10, bottom: 10, padding: "2px 4px 2px 2px", borderRadius: 999, display: "flex", alignItems: "center", gap: 2 }}>
        <button type="button" data-testid="public-contact-box-open" aria-expanded="false" onClick={() => setExpanded(true)} style={{ ...iconButton, color: "#fff", fontSize: 12, fontWeight: 800, padding: "7px 10px" }}>
          Contatti
        </button>
        <button type="button" data-testid="public-contact-box-dismiss" aria-label="Nascondi contatti" onClick={() => { writeDismissed(); setDismissed(true); }} style={iconButton}>
          ×
        </button>
      </aside>
    );
  }

  return (
    <aside aria-label="Contatti VolantiniPro" data-testid="public-contact-box" data-compact="false" style={{ ...shell, right: 10, bottom: 10, padding: "9px 10px 10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800 }}>Hai domande? Scrivici</span>
        <button type="button" data-testid="public-contact-box-collapse" aria-label="Riduci contatti" onClick={() => setExpanded(false)} style={iconButton}>×</button>
      </div>
      {links}
    </aside>
  );
}
