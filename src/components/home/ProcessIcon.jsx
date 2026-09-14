import React from 'react';

// Small presentation-only icons shared by the two homepage sections.
export default function ProcessIcon({ name, className = '' }) {
  const paths = {
    document: <><path d="M7 3h11l7 7v23H7zM18 3v8h7M11 16h10M11 21h10M11 26h7" /></>,
    pin: <><path d="M16 33S5 21 5 13a11 11 0 0 1 22 0c0 8-11 20-11 20Z" /><circle cx="16" cy="13" r="4" /></>,
    sliders: <><path d="M3 8h26M3 18h26M3 28h26" /><circle cx="12" cy="8" r="3" /><circle cx="23" cy="18" r="3" /><circle cx="9" cy="28" r="3" /></>,
    euro: <><path d="M7 3h11l7 7v23H7zM18 3v8h7M19 17c-6-5-11 7-3 9h3M10 19h8M10 22h7" /></>,
    shop: <><path d="M4 13 7 5h18l3 8M5 17v15h22V17M11 32v-9h10v9M4 13v3a4 4 0 0 0 8 0 4 4 0 0 0 8 0 4 4 0 0 0 8 0v-3Z" /></>,
    chart: <><path d="M5 30V20h4v10zM14 30V12h4v18zM23 30V4h4v26z" /></>,
    shield: <><path d="m16 3 11 4v10c0 8-11 15-11 15S5 25 5 17V7zM10 17l4 4 8-9" /></>,
    people: <><circle cx="16" cy="10" r="4" /><path d="M8 29v-4a8 8 0 0 1 16 0v4M4 12a3 3 0 1 0 0-6M28 12a3 3 0 1 1 0-6M2 25v-4a6 6 0 0 1 4-6M30 25v-4a6 6 0 0 0-4-6" /></>,
    data: <><ellipse cx="16" cy="7" rx="11" ry="4" /><path d="M5 7v21c0 5 22 5 22 0V7M5 14c0 5 22 5 22 0M5 21c0 5 22 5 22 0" /></>,
    info: <><circle cx="16" cy="18" r="13" /><path d="M16 16v10M16 10v1" /></>,
  };
  return <svg className={className} viewBox="0 0 32 36" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.document}</svg>;
}
