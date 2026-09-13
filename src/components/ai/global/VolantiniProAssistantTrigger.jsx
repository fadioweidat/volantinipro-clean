import React from "react";

const F = { sans: "'DM Sans', Inter, system-ui, sans-serif" };
const ORANGE = "#E8571A";

/**
 * Reusable floating trigger pill for the Global VolantiniPro AI Assistant.
 * Preserves the exact styling and accessibility of the original launcher.
 */
export default function VolantiniProAssistantTrigger({
  onAsk,
  onClick,
  expanded = false,
  label = "Hai bisogno di aiuto?",
  sublabel = "Chiedi all’assistente VolantiniPro",
  badge = "?",
  ariaControls = "quote-ai-panel",
}) {
  const handleClick = onAsk || onClick;

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
    <div style={wrap} className="volantinipro-assistant-trigger-wrap">
      <button
        type="button"
        style={pill}
        onClick={handleClick}
        aria-expanded={expanded}
        aria-controls={ariaControls}
        aria-label={`${label} - ${sublabel}`}
      >
        <span
          aria-hidden="true"
          style={{
            width: 27,
            height: 27,
            display: "grid",
            placeItems: "center",
            borderRadius: 9,
            background: ORANGE,
            fontSize: 15,
          }}
        >
          {badge}
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.25 }}>
          <span>{label}</span>
          <span style={{ color: "rgba(255,255,255,.62)", fontSize: 10, fontWeight: 650 }}>{sublabel}</span>
        </span>
      </button>
    </div>
  );
}
