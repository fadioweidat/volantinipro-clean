import { useState } from "react";

const BRAND_ORANGE = "#E8571A";
const BRAND_ORANGE_HOVER = "#D14A14";
const DARK_BG = "#1A1A1A";

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
    background: BRAND_ORANGE,
    color: "#fff",
    boxShadow: "0 10px 28px rgba(232, 87, 26, 0.24)",
  },
  secondary: {
    border: `1.5px solid ${BRAND_ORANGE}`,
    background: "transparent",
    color: BRAND_ORANGE,
    boxShadow: "none",
  },
  ghost: {
    border: "1.5px solid transparent",
    background: "transparent",
    color: DARK_BG,
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
      ? { background: BRAND_ORANGE_HOVER, transform: "translateY(-1px)" }
      : safeVariant === "secondary"
        ? { background: BRAND_ORANGE, color: "#fff", transform: "translateY(-1px)" }
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
