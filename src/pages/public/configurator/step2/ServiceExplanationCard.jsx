import React, { useState } from "react";
import { C, F } from "../../../../lib/constants.js";
import { getServiceExplanation } from "../../../../lib/step2/serviceExplanations.js";
import { ServiceHelpModal } from "./ServiceHelpModal.jsx";

export function ServiceExplanationCard({ serviceType, serviceColor = C.orange }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const explanation = getServiceExplanation(serviceType);

  return (
    <div
      className="vp-step2-service-explanation"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,.05) 0%, rgba(255,255,255,.02) 100%)",
        border: "1px solid rgba(255,255,255,.10)",
        borderRadius: 14,
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: F.sans,
        boxSizing: "border-box",
        marginBottom: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: serviceColor,
              background: "rgba(255,255,255,.06)",
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            Servizio Selezionato
          </span>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.white }}>
            {explanation.name}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          style={{
            background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 20,
            padding: "5px 12px",
            color: "rgba(255,255,255,.85)",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: F.sans,
            transition: "all .15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,.12)";
            e.currentTarget.style.borderColor = serviceColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
          }}
        >
          <span style={{ color: serviceColor, fontSize: 13 }}>ℹ</span>
          Come funziona questo servizio?
        </button>
      </div>

      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "rgba(255,255,255,.82)" }}>
        {explanation.summary}
      </p>

      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", fontStyle: "italic" }}>
        {explanation.step2ChoiceDescription}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
          paddingTop: 4,
          borderTop: "1px solid rgba(255,255,255,.06)",
        }}
      >
        {explanation.bullets.map((bullet, idx) => (
          <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11.5, color: "rgba(255,255,255,.75)" }}>
            <span style={{ color: serviceColor, fontWeight: 900, lineHeight: 1 }}>•</span>
            <span>{bullet}</span>
          </div>
        ))}
      </div>

      <ServiceHelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        explanation={explanation}
        serviceColor={serviceColor}
      />
    </div>
  );
}

export default ServiceExplanationCard;
