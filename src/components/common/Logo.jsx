import React from "react";
import { C, F } from "../../lib/constants.js";

export function LogoIcon({ dark = false, size = 32 }) {
  // Colori aderenti al Concept B
  const rightSideColor = dark ? C.green : C.navy;
  const panel1 = dark ? "#FFFFFF" : "#071426";
  const panel2 = dark ? "#CBD5E1" : "#334155";
  const panel3 = dark ? "#F1F5F9" : "#1E293B";
  const accent = C.orange;

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Right half (Smooth Pin with hole) */}
      <path d="M 16 2 A 10 10 0 0 1 26 12 C 26 21 16 30 16 30 L 16 14 A 4 4 0 0 0 16 6 L 16 2 Z" fill={rightSideColor} />

      {/* Left half (Folded Paper) */}
      <path d="M 6 8 L 6 18 L 10 23 L 10 13 Z" fill={panel1} />
      <path d="M 10 13 L 10 23 L 13 18 L 13 8 Z" fill={panel2} />
      <path d="M 13 8 L 13 18 L 16 30 L 16 14 A 4 4 0 0 1 16 6 L 16 2 Z" fill={panel3} />

      {/* Orange Trajectory */}
      <path d="M 3 22 C 10 26 20 16 28 9" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <path d="M 23 8 L 28 9 L 26 14" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ dark = false, size = 32, showText = true }) {
  const textColorPrimary = dark ? C.white : C.navy;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <LogoIcon dark={dark} size={size} />
      {showText && (
        <span
          style={{
            fontFamily: F.sans,
            fontSize: size * 0.55, // icon is now relatively larger
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: textColorPrimary,
            lineHeight: 1,
            paddingTop: 2, // optical alignment
          }}
        >
          Volantini<span style={{ color: C.green, fontWeight: 900 }}>Pro</span>
        </span>
      )}
    </div>
  );
}
