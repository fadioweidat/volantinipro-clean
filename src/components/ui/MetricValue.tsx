import React from "react";

type MetricValueProps = {
  value: number | string | React.ReactNode | null | undefined;
  format?: "number" | "percent" | "currency-range";
  unit?: string;
  color?: string;
};

const secondaryStyle: React.CSSProperties = {
  color: "rgba(255,255,255,.38)",
  fontSize: 11,
  fontStyle: "italic",
  lineHeight: 1.25,
};

export function MetricValue({ value, format, unit, color }: MetricValueProps) {
  if (React.isValidElement(value)) return value;

  if (value === null || value === undefined || value === "") {
    return <span className="text-secondary text-sm italic" style={secondaryStyle}>Dato non disponibile</span>;
  }

  let rendered = value;
  if (typeof value === "number") {
    if (format === "percent") rendered = `${value}%`;
    else rendered = value.toLocaleString("it-IT");
  }

  if (format === "currency-range" && typeof value === "string") {
    rendered = value;
  }

  return (
    <span style={{ color: color || "inherit" }}>
      {rendered}
      {unit ? <span style={{ marginLeft: 4, color: "rgba(255,255,255,.38)", fontSize: "0.85em" }}>{unit}</span> : null}
    </span>
  );
}

export default MetricValue;
