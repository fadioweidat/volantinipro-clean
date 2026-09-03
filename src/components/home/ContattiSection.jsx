import React from "react";
import { motion } from "framer-motion";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import {
  SUPPORT_EMAIL,
  buildInfoWhatsAppUrl,
  buildInfoMailtoUrl,
} from "../../lib/contactConfig.js";

const F = { serif: "'DM Serif Display', Georgia, serif", sans: "'DM Sans', Inter, system-ui, sans-serif" };
const ORANGE = "#E8571A";

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
    background: primary ? ORANGE : "rgba(255,255,255,0.05)",
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
            <CtaButton mobile={isMobile} primary href={whatsappUrl} icon="🟢" label="WhatsApp" sub="Risposta rapida" />
          ) : null}
          <CtaButton mobile={isMobile} href={buildInfoMailtoUrl()} icon="✉️" label="Scrivici via Email" sub={SUPPORT_EMAIL} />
        </div>
      </motion.div>
    </section>
  );
}
