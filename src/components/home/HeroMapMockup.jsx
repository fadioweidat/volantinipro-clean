import React from "react";

const fontFamily = "'DM Sans', Inter, ui-sans-serif, system-ui, sans-serif";

const styles = {
  shell: {
    width: "100%",
    minHeight: 430,
    height: "clamp(430px, 52vw, 520px)",
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    border: "1px solid rgba(148, 163, 184, 0.32)",
    background:
      "linear-gradient(145deg, rgba(7, 15, 29, 0.98), rgba(10, 20, 36, 0.98) 48%, rgba(12, 27, 48, 0.98))",
    boxShadow:
      "0 34px 90px rgba(0, 0, 0, 0.5), 0 0 70px rgba(249, 115, 22, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
    color: "#f8fafc",
    fontFamily,
  },
  topbar: {
    height: 52,
    display: "grid",
    gridTemplateColumns: "120px minmax(180px, 360px) 120px",
    alignItems: "center",
    gap: 14,
    padding: "0 18px",
    borderBottom: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(7, 14, 27, 0.74)",
  },
  lights: {
    display: "flex",
    gap: 8,
  },
  light: {
    width: 11,
    height: 11,
    borderRadius: "50%",
  },
  address: {
    height: 28,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    color: "rgba(226, 232, 240, 0.64)",
    fontSize: 12,
    fontWeight: 700,
    background: "rgba(255, 255, 255, 0.065)",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  },
  content: {
    height: "calc(100% - 52px)",
    padding: 18,
    display: "grid",
    gridTemplateRows: "78px minmax(0, 1fr)",
    gap: 14,
  },
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
  },
  metric: {
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background:
      "linear-gradient(145deg, rgba(15, 27, 47, 0.92), rgba(10, 20, 36, 0.86))",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    flex: "0 0 auto",
    background: "rgba(255, 255, 255, 0.05)",
  },
  metricValue: {
    margin: 0,
    color: "#f8fafc",
    fontSize: 17,
    lineHeight: 1.05,
    fontWeight: 900,
    letterSpacing: 0,
  },
  metricLabel: {
    margin: "5px 0 0",
    color: "rgba(226, 232, 240, 0.62)",
    fontSize: 11,
    lineHeight: 1.1,
    fontWeight: 600,
  },
  mapFrame: {
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.24)",
    background: "#0a1527",
  },
  toolbar: {
    position: "absolute",
    zIndex: 3,
    top: 14,
    left: 14,
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  chip: {
    height: 32,
    padding: "0 11px",
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    border: "1px solid rgba(226, 232, 240, 0.2)",
    background: "rgba(8, 16, 30, 0.82)",
    color: "rgba(248, 250, 252, 0.9)",
    fontSize: 11,
    fontWeight: 800,
    backdropFilter: "blur(12px)",
  },
  search: {
    height: 32,
    width: 178,
    padding: "0 12px",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    border: "1px solid rgba(226, 232, 240, 0.16)",
    background: "rgba(8, 16, 30, 0.78)",
    color: "rgba(203, 213, 225, 0.58)",
    fontSize: 11,
    fontWeight: 700,
    backdropFilter: "blur(12px)",
  },
  zoom: {
    position: "absolute",
    zIndex: 3,
    top: 58,
    left: 14,
    display: "grid",
    overflow: "hidden",
    borderRadius: 9,
    border: "1px solid rgba(226, 232, 240, 0.16)",
    background: "rgba(8, 16, 30, 0.78)",
    backdropFilter: "blur(12px)",
  },
  zoomBtn: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    color: "#f8fafc",
    fontSize: 20,
    lineHeight: 1,
    borderBottom: "1px solid rgba(226, 232, 240, 0.12)",
  },
  panel: {
    position: "absolute",
    zIndex: 3,
    right: 16,
    top: "22%",
    width: "min(278px, 30%)",
    minWidth: 232,
    padding: 16,
    borderRadius: 15,
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background:
      "linear-gradient(145deg, rgba(8, 18, 32, 0.94), rgba(12, 24, 42, 0.88))",
    boxShadow: "0 22px 54px rgba(0, 0, 0, 0.34)",
    backdropFilter: "blur(16px)",
  },
  panelTitle: {
    margin: "0 0 18px",
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: 900,
  },
  panelHead: {
    display: "grid",
    gridTemplateColumns: "1fr 62px 70px",
    gap: 8,
    marginBottom: 12,
    color: "rgba(226, 232, 240, 0.62)",
    fontSize: 10,
    fontWeight: 700,
  },
  total: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    border: "1px solid rgba(148, 163, 184, 0.17)",
    background: "rgba(15, 23, 42, 0.46)",
  },
  totalLabel: {
    margin: 0,
    color: "rgba(226, 232, 240, 0.56)",
    fontSize: 11,
    fontWeight: 600,
  },
  totalValue: {
    margin: "6px 0 0",
    color: "#f8fafc",
    fontSize: 23,
    fontWeight: 900,
    letterSpacing: 0,
  },
};

function Icon({ type, color }) {
  if (type === "radius") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="9" stroke={color} strokeWidth="1.7" />
        <path d="M11 11L17 7" stroke={color} strokeWidth="1.7" />
        <circle cx="11" cy="11" r="2" fill={color} />
      </svg>
    );
  }

  if (type === "city") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M5 19V7h6v12M11 10h6v9M3 19h16" stroke={color} strokeWidth="1.7" />
        <path d="M7.5 10h1M7.5 13h1M13.5 13h1M13.5 16h1" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "report") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M6 3h7l4 4v12H6V3Z" stroke={color} strokeWidth="1.7" />
        <path d="M13 3v5h4M8.5 12h5M8.5 15h4" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="8" cy="7" r="3" stroke={color} strokeWidth="1.7" />
      <circle cx="15" cy="9" r="2.4" stroke={color} strokeWidth="1.7" />
      <path d="M3.5 18c.7-3 2.5-4.6 5-4.6s4.3 1.6 5 4.6M12 18c.5-2 1.8-3.1 3.6-3.1 1.7 0 2.9 1 3.4 3.1" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MetricTile({ icon, color, value, label }) {
  return (
    <div style={styles.metric}>
      <span style={{ ...styles.iconBox, color }}>
        <Icon type={icon} color={color} />
      </span>
      <span>
        <p style={styles.metricValue}>{value}</p>
        <p style={styles.metricLabel}>{label}</p>
      </span>
    </div>
  );
}

function LegendRow({ color, name, population, coverage, width }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 62px 70px",
        gap: 8,
        alignItems: "center",
        marginBottom: 14,
        fontSize: 11,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          color: "#f8fafc",
          fontWeight: 800,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 12px ${color}`,
            flex: "0 0 auto",
          }}
        />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </span>
      <span style={{ color: "rgba(226, 232, 240, 0.7)", textAlign: "right" }}>
        {population}
      </span>
      <span style={{ color: "#f8fafc", textAlign: "right", fontWeight: 800 }}>
        {coverage}
        <span
          style={{
            display: "block",
            height: 3,
            marginTop: 5,
            borderRadius: 999,
            background: "rgba(148, 163, 184, 0.2)",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              display: "block",
              width,
              height: "100%",
              borderRadius: 999,
              background: "#f97316",
            }}
          />
        </span>
      </span>
    </div>
  );
}

export default function HeroMapMockup() {
  return (
    <div style={styles.shell} aria-label="Anteprima visuale mappa territoriale">
      <div style={styles.topbar} aria-hidden="true">
        <div style={styles.lights}>
          <span style={{ ...styles.light, background: "#ff5f57" }} />
          <span style={{ ...styles.light, background: "#ffbd2e" }} />
          <span style={{ ...styles.light, background: "#28c840" }} />
        </div>
        <div style={styles.address}>
          <span style={{ fontSize: 13 }}>lock</span>
          app.volantinipro.it
        </div>
        <div />
      </div>

      <div style={styles.content}>
        <div style={styles.metrics} aria-hidden="true">
          <MetricTile
            icon="people"
            color="#f97316"
            value="25.720"
            label="Famiglie raggiungibili"
          />
          <MetricTile
            icon="radius"
            color="#2dd4bf"
            value="3 km"
            label="Raggio di analisi"
          />
          <MetricTile icon="city" color="#60a5fa" value="3" label="Comuni coinvolti" />
          <MetricTile icon="report" color="#fb6a1a" value="Report" label="Output" />
        </div>

        <div style={styles.mapFrame}>
          <div style={styles.toolbar} aria-hidden="true">
            <span style={styles.chip}>Livelli dati</span>
            <span style={styles.chip}>Filtri</span>
            <span style={styles.search}>Cerca indirizzo...</span>
          </div>

          <div style={styles.zoom} aria-hidden="true">
            <span style={styles.zoomBtn}>+</span>
            <span style={styles.zoomBtn}>-</span>
            <span style={{ ...styles.zoomBtn, borderBottom: 0, fontSize: 15 }}>o</span>
          </div>

          <svg
            viewBox="0 0 1040 420"
            role="img"
            aria-labelledby="hero-map-mockup-title hero-map-mockup-desc"
            preserveAspectRatio="xMidYMid slice"
            style={{ width: "100%", height: "100%", display: "block" }}
          >
            <title id="hero-map-mockup-title">Mockup mappa territoriale</title>
            <desc id="hero-map-mockup-desc">
              Visual mockup with abstract municipal areas, analysis radius and
              coverage labels. This is not a live map.
            </desc>

            <defs>
              <linearGradient id="mapBg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#0a1424" />
                <stop offset="52%" stopColor="#0d1b2d" />
                <stop offset="100%" stopColor="#08111f" />
              </linearGradient>
              <radialGradient id="orangeAura" cx="50%" cy="53%" r="42%">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.18" />
                <stop offset="46%" stopColor="#f97316" stopOpacity="0.05" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </radialGradient>
              <pattern id="microGrid" width="22" height="22" patternUnits="userSpaceOnUse">
                <path d="M22 0H0V22" fill="none" stroke="#e2e8f0" strokeOpacity="0.035" />
              </pattern>
              <filter id="mapShadow" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="16" stdDeviation="14" floodColor="#020617" floodOpacity="0.42" />
              </filter>
              <filter id="markerGlow" x="-90%" y="-90%" width="280%" height="280%">
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width="1040" height="420" fill="url(#mapBg)" />
            <rect width="1040" height="420" fill="#020617" opacity="0.18" />
            <rect width="1040" height="420" fill="url(#microGrid)" />
            <rect width="1040" height="420" fill="url(#orangeAura)" />

            <g opacity="0.38">
              <path d="M0 58h1040M0 117h1040M0 177h1040M0 236h1040M0 296h1040M0 356h1040" stroke="#94a3b8" strokeOpacity="0.08" />
              <path d="M68 0v420M141 0v420M214 0v420M287 0v420M360 0v420M433 0v420M506 0v420M579 0v420M652 0v420M725 0v420M798 0v420M871 0v420M944 0v420" stroke="#94a3b8" strokeOpacity="0.07" />
            </g>

            <g opacity="0.22" fill="#12351f">
              <path d="M5 12h170v74H30zM748 295h115v104H713zM888 318h136v102H855zM36 310h95v80H0v-42z" />
            </g>

            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M-45 334C88 306 169 281 278 231S454 150 562 164 725 236 850 176 970 120 1088 104" stroke="#f8fafc" strokeOpacity="0.2" strokeWidth="4.1" />
              <path d="M-44 335C88 307 169 282 278 232S454 151 562 165 725 237 850 177 970 121 1088 105" stroke="#475569" strokeOpacity="0.55" strokeWidth="2" />
              <path d="M-35 247C84 251 171 214 268 212S410 267 514 251 637 151 746 166 919 248 1086 224" stroke="#e2e8f0" strokeOpacity="0.2" strokeWidth="3" />
              <path d="M130 430C165 341 203 286 281 246S394 197 472 115 602 20 744 -18" stroke="#e2e8f0" strokeOpacity="0.18" strokeWidth="3.2" />
              <path d="M384 -28C372 67 398 139 471 194S570 295 571 420" stroke="#cbd5e1" strokeOpacity="0.2" strokeWidth="2.6" />
              <path d="M721 -28C693 79 711 144 764 213S835 318 811 444" stroke="#fde68a" strokeOpacity="0.24" strokeWidth="2.8" />
              <path d="M-18 164C98 154 178 159 260 136S398 75 520 83 670 126 782 92 938 34 1080 45" stroke="#93c5fd" strokeOpacity="0.15" strokeWidth="2" />
              <path d="M208 418C256 351 306 332 372 309S487 262 548 214 664 166 742 169" stroke="#bfdbfe" strokeOpacity="0.16" strokeWidth="2" />
              <path d="M60 52C158 96 229 116 324 98S505 49 630 75 776 111 936 54" stroke="#fde68a" strokeOpacity="0.16" strokeWidth="1.7" />
              <path d="M28 391C144 366 220 348 326 344S480 373 594 348 738 286 870 296 972 320 1088 285" stroke="#e5e7eb" strokeOpacity="0.14" strokeWidth="1.8" />
              <path d="M-10 207C95 192 168 180 254 188S421 231 522 207 702 129 826 145 954 190 1074 165" stroke="#cbd5e1" strokeOpacity="0.13" strokeWidth="1.7" />
            </g>

            <g opacity="0.5" fill="none" stroke="#64748b" strokeWidth="0.8">
              <path d="M20 73L112 132L86 220L38 303M78 40L192 103L176 196L120 292M130 18L286 92L336 205L268 361M218 26L315 118L318 213L398 315M420 18L456 156L410 286L440 408M503 11L538 116L522 228L590 339M548 30L602 156L574 300L628 430M644 8L692 114L672 218L716 336M706 8L742 168L706 309L762 414M842 44L782 186L824 322L962 380M918 8L862 112L908 240L1012 356" />
              <path d="M35 286L194 260L348 205L546 214L706 309L1012 274M26 196L258 137L456 156L602 156L782 186L1002 142M112 362L272 360L440 408L628 430M54 128L212 145L382 122L566 126L760 82L1012 94M76 242L228 220L383 260L562 266L714 240L1000 218M19 360L182 335L318 304L486 324L678 352L908 346" />
              <path d="M330 0L338 96L366 176L348 292L360 420M600 0L584 96L618 184L604 276L660 420M786 0L742 96L766 180L730 278L780 420" strokeOpacity="0.82" />
            </g>

            <g fontFamily={fontFamily} fontSize="10" fontWeight="800" fill="#cbd5e1" fillOpacity="0.54">
              <text x="628" y="50">Sesto San Giovanni</text>
              <text x="131" y="72">Dugnano</text>
              <text x="876" y="76">SP35</text>
              <text x="724" y="29">SS36</text>
              <text x="82" y="386">Affori</text>
              <text x="572" y="393">Bicocca</text>
              <text x="852" y="357">Niguarda</text>
              <text x="635" y="318" transform="rotate(-68 635 318)">Viale Fulvio Testi</text>
              <text x="238" y="380" transform="rotate(-17 238 380)">Viale Enrico Fermi</text>
              <text x="357" y="316" transform="rotate(-9 357 316)">Via Gramsci</text>
              <text x="459" y="164" transform="rotate(-19 459 164)">Viale Lombardia</text>
              <text x="742" y="252" transform="rotate(-48 742 252)">Via Lincoln</text>
            </g>

            <g filter="url(#mapShadow)" strokeWidth="1.7">
              <polygon points="72,109 96,88 145,79 193,70 250,83 306,104 341,128 333,166 346,205 310,226 268,257 208,250 160,264 91,239 48,191 52,146" fill="#2563eb" fillOpacity="0.25" stroke="#3b82f6" strokeOpacity="0.82" />
              <polygon points="342,130 397,92 474,72 545,85 606,108 594,158 612,206 565,239 486,282 431,258 378,230 342,205 333,166" fill="#22c55e" fillOpacity="0.2" stroke="#4ade80" strokeOpacity="0.78" />
              <polygon points="604,109 675,83 764,58 844,83 914,119 888,178 862,239 789,261 701,272 642,242 592,213 612,158" fill="#8b5cf6" fillOpacity="0.23" stroke="#a855f7" strokeOpacity="0.82" />
              <polygon points="92,239 160,264 208,250 268,258 316,358 258,391 199,420 128,399 56,367 42,306" fill="#0ea5e9" fillOpacity="0.13" stroke="#60a5fa" strokeOpacity="0.5" />
              <polygon points="268,258 431,258 486,282 461,387 382,371 316,358" fill="#14b8a6" fillOpacity="0.21" stroke="#2dd4bf" strokeOpacity="0.75" />
              <polygon points="486,282 701,272 758,396 637,402 461,387" fill="#f97316" fillOpacity="0.08" stroke="#f97316" strokeOpacity="0.42" />
            </g>

            <circle cx="514" cy="222" r="142" fill="#f97316" fillOpacity="0.055" stroke="#f97316" strokeWidth="2.6" strokeDasharray="8 8" />
            <circle cx="514" cy="222" r="158" fill="none" stroke="#f97316" strokeOpacity="0.1" strokeWidth="14" />

            <g fontFamily={fontFamily} fontWeight="900" textAnchor="middle">
              <text x="205" y="171" fill="#f8fafc" fontSize="18">Bresso</text>
              <text x="350" y="276" fill="#bbf7d0" fontSize="16">Cusano Milanino</text>
              <text x="738" y="195" fill="#f5f3ff" fontSize="18">Cinisello</text>
              <text x="738" y="217" fill="#f5f3ff" fontSize="18">Balsamo</text>
              <text x="158" y="345" fill="#e2e8f0" fillOpacity="0.76" fontSize="16">Cormano</text>
              <text x="835" y="360" fill="#86efac" fillOpacity="0.84" fontSize="14">Parco</text>
              <text x="840" y="378" fill="#86efac" fillOpacity="0.84" fontSize="14">Nord Milano</text>
            </g>

            <g fontFamily={fontFamily} fontSize="13" fontWeight="900" textAnchor="middle">
              <g transform="translate(205 195)">
                <rect x="-24" y="-14" width="48" height="26" rx="6" fill="#2563eb" />
                <text y="5" fill="#eff6ff">87%</text>
              </g>
              <g transform="translate(349 296)">
                <rect x="-24" y="-14" width="48" height="26" rx="6" fill="#22c55e" />
                <text y="5" fill="#052e16">78%</text>
              </g>
              <g transform="translate(738 237)">
                <rect x="-24" y="-14" width="48" height="26" rx="6" fill="#a855f7" />
                <text y="5" fill="#faf5ff">65%</text>
              </g>
            </g>

            <g transform="translate(514 222)" filter="url(#markerGlow)">
              <circle r="34" fill="#f97316" fillOpacity="0.16" />
              <path d="M0-30C-15.8-30-28-17.8-28-2.5-28 17.5-7.5 30.5 0 43 7.5 30.5 28 17.5 28-2.5 28-17.8 15.8-30 0-30Z" fill="#f97316" stroke="#fed7aa" strokeWidth="2.4" />
              <circle cy="-4" r="8.5" fill="#fff7ed" />
            </g>

            <g transform="translate(453 354)" fontFamily={fontFamily} fontWeight="900">
              <rect width="122" height="30" rx="6" fill="#251207" stroke="#f97316" strokeOpacity="0.72" />
              <text x="61" y="20" textAnchor="middle" fill="#ffedd5" fontSize="13">Raggio 3 km</text>
            </g>
          </svg>

          <aside style={styles.panel} aria-hidden="true">
            <p style={styles.panelTitle}>Comuni nel raggio</p>
            <div style={styles.panelHead}>
              <span />
              <span style={{ textAlign: "right" }}>Popolazione</span>
              <span style={{ textAlign: "right" }}>Copertura</span>
            </div>
            <LegendRow color="#60a5fa" name="Bresso" population="11.200" coverage="87%" width="87%" />
            <LegendRow color="#4ade80" name="Cusano Milanino" population="6.100" coverage="78%" width="78%" />
            <LegendRow color="#a78bfa" name="Cinisello Balsamo" population="18.700" coverage="65%" width="65%" />

            <div style={styles.total}>
              <p style={styles.totalLabel}>Totale famiglie raggiungibili</p>
              <p style={styles.totalValue}>25.720</p>
            </div>
            <p style={{ margin: "14px 0 0", color: "rgba(226, 232, 240, 0.45)", fontSize: 10, fontWeight: 700 }}>
              Dati aggiornati: Maggio 2024
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
