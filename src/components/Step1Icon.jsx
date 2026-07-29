/* Flat line icons for Step 1 (replace emoji). Same treatment as the
   existing site icon set (see ServicesSection.jsx Mailbox/Users/Briefcase):
   stroke-based, currentColor by default, sized via width/height. */
export function Step1Icon({ name, size = 24, color = "currentColor", style }) {
  const svgProps = { width: size, height: size, fill: "none", "aria-hidden": true, style };
  const strokeProps = { stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "mailbox":
      return (
        <svg {...svgProps} viewBox="0 0 32 32">
          <path d="M6 26V13.5A7.5 7.5 0 0 1 13.5 6h5A7.5 7.5 0 0 1 26 13.5V26" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M6 14h20M16 6v20M20 11h4" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M10 26h12" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "handshake":
      return (
        <svg {...svgProps} viewBox="0 0 32 32">
          <path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM4 26c.8-5 3.7-8 8-8s7.2 3 8 8" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M22 14a4 4 0 1 0 0-8M21 18c3.4.4 5.7 3 6.3 7" stroke={color} strokeWidth="2" strokeLinecap="round" opacity=".65" />
        </svg>
      );
    case "building":
      return (
        <svg {...svgProps} viewBox="0 0 32 32">
          <path d="M10 11V8.5A2.5 2.5 0 0 1 12.5 6h7A2.5 2.5 0 0 1 22 8.5V11" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <path d="M6 12h20v14H6V12Z" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 17h20M14 17v2h4v-2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lightbulb":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.15 1 1.9V16h5v-.2c0-.75.4-1.45 1-1.9A6 6 0 0 0 12 3Z" />
        </svg>
      );
    case "target":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="12" r="8" /><circle {...strokeProps} cx="12" cy="12" r="4.5" /><circle {...strokeProps} cx="12" cy="12" r="1" />
        </svg>
      );
    case "clock":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="12" r="8.5" /><path {...strokeProps} d="M12 7.5V12l3 2" />
        </svg>
      );
    case "utensils":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M7 3v6a2 2 0 0 0 2 2v10M7 3v5M9 3v5M7 11h2M17 3c-1.6 0-3 1.7-3 4.5S15.4 12 17 12v9" />
        </svg>
      );
    case "bag":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M6 8h12l-1 12H7L6 8Z" /><path {...strokeProps} d="M9 8V6a3 3 0 0 1 6 0v2" />
        </svg>
      );
    case "medical":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="4" y="4" width="16" height="16" rx="3" /><path {...strokeProps} d="M12 8v8M8 12h8" />
        </svg>
      );
    case "car":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M4 16V12l2-5h12l2 5v4" /><path {...strokeProps} d="M4 16h16M7 16v2M17 16v2" />
          <circle cx="7.5" cy="16" r="1.4" fill={color} stroke="none" /><circle cx="16.5" cy="16" r="1.4" fill={color} stroke="none" />
        </svg>
      );
    case "graduation":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M2 9 12 4l10 5-10 5-10-5Z" /><path {...strokeProps} d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
        </svg>
      );
    case "home":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M4 11 12 4l8 7" /><path {...strokeProps} d="M6 10v9h12v-9" />
        </svg>
      );
    case "droplet":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11Z" />
        </svg>
      );
    case "dumbbell":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M4 10v4M20 10v4M2 12h2M20 12h2M7 8v8M17 8v8M7 12h10" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" />
        </svg>
      );
    case "lightning":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="4" y="5" width="16" height="15" rx="2" /><path {...strokeProps} d="M4 9h16M8 3v4M16 3v4" />
        </svg>
      );
    case "calendarDays":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="4" y="5" width="16" height="15" rx="2" /><path {...strokeProps} d="M4 9h16M8 3v4M16 3v4" />
          <circle cx="8.5" cy="13.2" r=".9" fill={color} stroke="none" /><circle cx="12" cy="13.2" r=".9" fill={color} stroke="none" /><circle cx="15.5" cy="13.2" r=".9" fill={color} stroke="none" />
        </svg>
      );
    case "package":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M21 8 12 3 3 8l9 5 9-5Z" /><path {...strokeProps} d="M3 8v8l9 5 9-5V8" /><path {...strokeProps} d="M12 13v8" />
        </svg>
      );
    case "printer":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M6 9V4h12v5" /><rect {...strokeProps} x="4" y="9" width="16" height="8" rx="2" /><path {...strokeProps} d="M6 14h12v7H6v-7Z" />
        </svg>
      );
    case "lock":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="5" y="11" width="14" height="9" rx="2" /><path {...strokeProps} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case "warning":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="M12 4 21.5 20H2.5L12 4Z" /><path {...strokeProps} d="M12 10v4" /><circle cx="12" cy="17" r=".9" fill={color} stroke="none" />
        </svg>
      );
    case "pin":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M12 21s7-7.58 7-12A7 7 0 0 0 5 9c0 4.42 7 12 7 12Z" /><circle {...strokeProps} cx="12" cy="9" r="2.4" />
        </svg>
      );
    case "eye":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle {...strokeProps} cx="12" cy="12" r="3" />
        </svg>
      );
    case "eyeOff":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M3 3l18 18" /><path {...strokeProps} d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.1 4.1M6.2 6.2C3.6 8 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9" /><path {...strokeProps} d="M9.5 9.8a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    case "compass":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="12" r="9" /><path {...strokeProps} strokeLinejoin="round" d="M15 9l-2 6-6 2 2-6 6-2Z" />
        </svg>
      );
    case "camera":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle {...strokeProps} cx="12" cy="13" r="3.5" />
        </svg>
      );
    case "family":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="8" cy="8" r="3" /><path {...strokeProps} d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle {...strokeProps} cx="17.5" cy="9" r="2.3" /><path {...strokeProps} d="M15.3 20c.2-2.8 2-5 4.5-5.6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M4 20V10M10 20V4M16 20v-7M4 20h16" />
        </svg>
      );
    case "map":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path {...strokeProps} d="M9 4v14M15 6v14" />
        </svg>
      );
    case "search":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="10.5" cy="10.5" r="6.5" /><path {...strokeProps} d="m20 20-4.8-4.8" />
        </svg>
      );
    case "robot":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="4" y="8" width="16" height="12" rx="3" /><path {...strokeProps} d="M12 8V4M9 3.5h6" /><circle {...strokeProps} cx="9" cy="14" r="1.2" /><circle {...strokeProps} cx="15" cy="14" r="1.2" /><path {...strokeProps} d="M9 17.5h6" />
        </svg>
      );
    case "link":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.5 1.5" /><path {...strokeProps} d="M14 10a4 4 0 0 0-5.66 0L5.51 12.83a4 4 0 0 0 5.66 5.66l1.5-1.5" />
        </svg>
      );
    case "user":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="8" r="3.5" /><path {...strokeProps} d="M5 20c1-4 4-6 7-6s6 2 7 6" />
        </svg>
      );
    case "hourglass":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M6 3.5h12M6 20.5h12" /><path {...strokeProps} strokeLinejoin="round" d="M7 3.5v3.2c0 1.6 1.9 3.5 5 5.3 3.1-1.8 5-3.7 5-5.3V3.5M7 20.5v-3.2c0-1.6 1.9-3.5 5-5.3 3.1 1.8 5 3.7 5 5.3v3.2" />
        </svg>
      );
    case "palette":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M12 3a9 8.2 0 1 0 0 16.4c1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 4.5 0 0 0 5-4.5C21 5.6 16.9 3 12 3Z" /><circle cx="8" cy="10.5" r="1.1" fill={color} /><circle cx="12" cy="8" r="1.1" fill={color} /><circle cx="16" cy="10.5" r="1.1" fill={color} />
        </svg>
      );
    case "shop":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M4 9.5 5 4h14l1 5.5" /><path {...strokeProps} strokeLinejoin="round" d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" /><path {...strokeProps} d="M5.5 11.5V20h13v-8.5" />
        </svg>
      );
    case "book":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13ZM20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z" />
        </svg>
      );
    case "mail":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <rect {...strokeProps} x="3" y="5" width="18" height="14" rx="2.5" /><path {...strokeProps} d="m4 6.5 8 6.5 8-6.5" />
        </svg>
      );
    case "checkCircle":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="12" r="8.5" /><path {...strokeProps} d="m8.2 12.3 2.5 2.5 5.1-5.6" />
        </svg>
      );
    case "star":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} strokeLinejoin="round" d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3Z" />
        </svg>
      );
    case "pharmacy":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <circle {...strokeProps} cx="12" cy="12" r="9" /><path {...strokeProps} d="M12 8v8M8 12h8" />
        </svg>
      );
    case "cart":
      return (
        <svg {...svgProps} viewBox="0 0 24 24">
          <path {...strokeProps} d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
          <circle cx="9.5" cy="20" r="1.3" fill={color} stroke="none" /><circle cx="17" cy="20" r="1.3" fill={color} stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
