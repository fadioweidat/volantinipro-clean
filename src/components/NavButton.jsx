import { F } from "../lib/constants.js";

export function NavButton({ onClick, children, full = false, compact = false, style, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="vp-navbtn"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
        width: full ? "100%" : undefined,
        minHeight: compact ? 38 : 42,
        padding: compact ? "8px 12px" : "10px 18px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,.16)",
        background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
        color: "#F1F5F9",
        fontFamily: F.sans,
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
        cursor: "pointer",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 10px 24px rgba(0,0,0,.16)",
        transition: "border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease, color .18s ease",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
