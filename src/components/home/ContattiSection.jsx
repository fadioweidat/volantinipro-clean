import React from "react";
import { motion } from "framer-motion";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import {
  SUPPORT_EMAIL,
  buildInfoWhatsAppUrl,
  buildInfoMailtoUrl,
} from "../../lib/contactConfig.js";

const F = { serif: "'DM Sans', Inter, system-ui, sans-serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const ORANGE = "#E8571A";

// Monochrome WhatsApp glyph: inherits the button text colour (white), no green badge.
function WhatsAppIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.23 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z" />
    </svg>
  );
}

function CtaButton({ href, onClick, primary, icon, label, sub, mobile }) {
  const base = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    textDecoration: "none",
    borderRadius: 12,
    fontFamily: F.sans,
    fontWeight: 800,
    cursor: "pointer",
    border: primary ? "none" : "1px solid rgba(255,255,255,0.18)",
    // #CE4B15: white text 4.52:1 (WCAG AA); brand ORANGE is 3.6:1.
    background: primary ? "#CE4B15" : "rgba(255,255,255,0.05)",
    color: "#fff",
    boxShadow: primary ? "0 10px 28px rgba(232,87,26,0.35)" : "none",
    padding: mobile ? "18px 20px" : "16px 22px",
    fontSize: mobile ? 16 : 15,
    width: mobile ? "100%" : "auto",
    flex: mobile ? "0 0 auto" : "1 1 0",
    minHeight: mobile ? 58 : 52,
    boxSizing: "border-box",
    lineHeight: 1.2,
  };
  const content = (
    <>
      <span aria-hidden="true" style={{ fontSize: mobile ? 20 : 18 }}>{icon}</span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span>{label}</span>
        {sub ? <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.75 }}>{sub}</span> : null}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} style={base} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>
        {content}
      </a>
    );
  }
  return <button type="button" onClick={onClick} style={base}>{content}</button>;
}

// Sezione "Serve una mano?" — contatto diretto con VolantiniPro: SOLO
// WhatsApp + Email. WhatsApp mostrato quando il numero è configurato
// (VITE_SUPPORT_WHATSAPP, nessun numero inventato). Email: sempre, verso
// l'indirizzo ufficiale. (L'AI sarà negli Step del preventivo, non qui.)
export default function ContattiSection() {
  const isMobile = useIsMobile();
  const whatsappUrl = buildInfoWhatsAppUrl();

  return (
    <section
      id="contatti"
      className="section-tight"
      aria-labelledby="contatti-title"
      style={{ background: "#0B1020", paddingLeft: 28, paddingRight: 28, boxSizing: "border-box", borderTop: "1px solid rgba(255,255,255,0.08)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.22 }}
        style={{
          maxWidth: 900,
          margin: "0 auto",
          textAlign: "center",
          background: "linear-gradient(145deg, #16233b, #101a2e)",
          border: "1px solid rgba(232,87,26,0.28)",
          borderRadius: 24,
          padding: isMobile ? "36px 22px" : "48px 32px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <h2 id="contatti-title" className="landing-h2" style={{ fontFamily: F.serif, fontSize: isMobile ? 32 : 40, lineHeight: 1.1, color: "#F8FAFC", letterSpacing: "-0.03em", margin: 0 }}>
          Serve una mano?
        </h2>
        <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.6, color: "#C3CDDB", margin: "16px auto 28px", maxWidth: 560 }}>
          Hai dubbi sul preventivo, sulla distribuzione o sui servizi? Contatta direttamente VolantiniPro.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            alignItems: "stretch",
            justifyContent: "center",
            maxWidth: isMobile ? 420 : "none",
            margin: "0 auto",
          }}
        >
          {whatsappUrl ? (
            <CtaButton mobile={isMobile} primary href={whatsappUrl} icon={<WhatsAppIcon size={isMobile ? 22 : 20} />} label="WhatsApp" sub="Risposta rapida" />
          ) : null}
          <CtaButton mobile={isMobile} href={buildInfoMailtoUrl()} icon="✉️" label="Scrivici via Email" sub={SUPPORT_EMAIL} />
        </div>
      </motion.div>
    </section>
  );
}
