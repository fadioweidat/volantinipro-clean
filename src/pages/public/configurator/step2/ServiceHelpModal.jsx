import React from "react";
import { C, F } from "../../../../lib/constants.js";

export function ServiceHelpModal({ isOpen, onClose, explanation, serviceColor = C.orange }) {
  if (!isOpen || !explanation) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vp-service-help-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(3, 7, 18, 0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0F172A",
          border: "1px solid rgba(255, 255, 255, 0.14)",
          borderRadius: 16,
          maxWidth: 580,
          width: "100%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.6)",
          fontFamily: F.sans,
          color: C.white,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: serviceColor, textTransform: "uppercase", letterSpacing: ".08em" }}>
              Guida al Servizio
            </div>
            <h3 id="vp-service-help-title" style={{ margin: "3px 0 0 0", fontSize: 17, fontWeight: 800, color: C.white }}>
              Come funziona: {explanation.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi guida"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.white,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content list */}
        <div style={{ padding: "20px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "rgba(255, 255, 255, 0.85)" }}>
            {explanation.summary}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(explanation.helpFaq || []).map((faq, idx) => (
              <div
                key={idx}
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.07)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: serviceColor, marginBottom: 4 }}>
                  {faq.q}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(255, 255, 255, 0.78)" }}>
                  {faq.a}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid rgba(255, 255, 255, 0.10)",
            display: "flex",
            justifyContent: "flex-end",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              background: serviceColor,
              border: "none",
              color: C.white,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: F.sans,
            }}
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}

export default ServiceHelpModal;
