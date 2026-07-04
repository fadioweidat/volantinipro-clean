import { useState } from "react";

const GRAD = "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)";
const GRAD_HOVER = "linear-gradient(135deg, #F97316 0%, #D0450B 100%)";
const PRIMARY_COLOR = "#E8571A";

const baseStyle = {
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: 12,
  padding: "0 20px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  transition: "background .18s ease, color .18s ease, border-color .18s ease, transform .18s ease",
};

const variantStyles = {
  primary: {
    border: "1.5px solid transparent",
    background: GRAD,
    color: "#fff",
    boxShadow: "0 10px 28px rgba(232, 87, 26, 0.28)",
  },
  secondary: {
    border: `1.5px solid rgba(148, 163, 184, 0.25)`,
    background: "transparent",
    color: "#CBD5E1",
    boxShadow: "none",
  },
  ghost: {
    border: "1.5px solid transparent",
    background: "transparent",
    color: "#CBD5E1",
    boxShadow: "none",
    paddingInline: 0,
  },
};

export default function Button({
  as: Component = "button",
  variant = "primary",
  style,
  onMouseEnter,
  onMouseLeave,
  children,
  type = "button",
  ...props
}) {
  const [hovered, setHovered] = useState(false);
  const safeVariant = variantStyles[variant] ? variant : "primary";
  const hoverStyle =
    safeVariant === "primary"
      ? { background: GRAD_HOVER, transform: "translateY(-1px)" }
      : safeVariant === "secondary"
        ? { background: "rgba(232,87,26,0.12)", color: "#F8FAFC", border: `1.5px solid ${PRIMARY_COLOR}`, transform: "translateY(-1px)" }
        : { textDecoration: "underline", textUnderlineOffset: 4 };

  return (
    <Component
      type={Component === "button" ? type : undefined}
      onMouseEnter={(event) => {
        setHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        onMouseLeave?.(event);
      }}
      style={{ ...baseStyle, ...variantStyles[safeVariant], ...(hovered ? hoverStyle : null), ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}
