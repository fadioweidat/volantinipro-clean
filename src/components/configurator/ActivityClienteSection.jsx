import { useEffect, useState } from "react";

const CATEGORIES = [
  { name: "Ristorazione", icon: "🍕" },
  { name: "Retail", icon: "🛍️" },
  { name: "Immobiliare", icon: "🏠" },
  { name: "Fitness", icon: "💪" },
  { name: "Beauty", icon: "💄" },
  { name: "Automotive", icon: "🚗" },
  { name: "Sanitario", icon: "🏥" },
  { name: "Servizi", icon: "⚙️" },
  { name: "Altro", icon: "📦" }
];

const C = {
  orange: "#E8571A",
  orangeGlow: "rgba(232, 87, 26, 0.25)",
  white: "#FFFFFF",
  muted: "rgba(255, 255, 255, 0.46)",
  borderActive: "#E8571A",
  borderPassive: "rgba(255, 255, 255, 0.1)",
  bgActive: "rgba(232, 87, 26, 0.10)",
  bgPassive: "rgba(255, 255, 255, 0.045)",
};

export default function ActivityClienteSection({ value = "", onChange, style }) {
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [isTextareaHovered, setIsTextareaHovered] = useState(false);

  // Normalize check for selected category
  const getSelectedCategory = () => {
    // If the input value exactly matches a category, it's selected
    const found = CATEGORIES.find(cat => cat.name.toLowerCase() === value.trim().toLowerCase());
    return found ? found.name : "";
  };

  const selectedCategory = getSelectedCategory();

  const handleCategoryClick = (categoryName) => {
    onChange?.(categoryName);
  };

  return (
    <section id="section-attivita" className="activity-client-section" style={style}>
      {/* Dynamic Placeholder Styling */}
      <style>{`
        .activity-client-textarea::placeholder {
          color: rgba(255, 255, 255, 0.35) !important;
        }
      `}</style>

      {/* Section Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            background: "rgba(232, 87, 26, 0.14)",
            border: "1px solid rgba(232, 87, 26, 0.28)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 800,
            color: C.orange
          }}>
            02
          </span>
          <h3 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: 23,
            color: C.white,
            letterSpacing: "-.4px",
            margin: 0
          }}>
            Attività cliente
          </h3>
        </div>
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: C.muted,
          lineHeight: 1.55,
          margin: 0
        }}>
          Che attività vuoi promuovere? Serve per orientare targeting e raccomandazioni territoriali.
        </p>
      </div>

      {/* Category Selection Area */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          fontWeight: 800,
          color: "rgba(255, 255, 255, 0.42)",
          letterSpacing: ".08em",
          textTransform: "uppercase",
          marginBottom: 10
        }}>
          Categorie popolari
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10
        }}>
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.name;
            const hovered = hoveredCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                onMouseEnter={() => setHoveredCategory(cat.name)}
                onMouseLeave={() => setHoveredCategory(null)}
                onClick={() => handleCategoryClick(cat.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: `1.5px solid ${active ? C.borderActive : hovered ? "rgba(232, 87, 26, 0.4)" : C.borderPassive}`,
                  background: active ? C.bgActive : hovered ? "rgba(255, 255, 255, 0.075)" : C.bgPassive,
                  color: active ? C.white : hovered ? C.white : "rgba(255, 255, 255, 0.72)",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "left",
                  transition: "transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease",
                  outline: "none",
                  boxShadow: active ? `0 8px 20px ${C.orangeGlow}` : "none",
                  transform: hovered ? "translateY(-1px)" : "none",
                }}
              >
                {/* Emoji Icon Container */}
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: active ? "rgba(232, 87, 26, 0.2)" : "rgba(255, 255, 255, 0.06)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  flexShrink: 0,
                  transition: "background 0.16s ease"
                }}>
                  {cat.icon}
                </span>
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Description Textarea Field */}
      <div>
        <label
          htmlFor="activity-client-textarea"
          style={{
            display: "block",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 800,
            color: "rgba(255, 255, 255, 0.42)",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            marginBottom: 8
          }}
        >
          Descrivi la tua attività
        </label>
        <textarea
          id="activity-client-textarea"
          className="activity-client-textarea"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onFocus={() => setIsTextareaFocused(true)}
          onBlur={() => setIsTextareaFocused(false)}
          onMouseEnter={() => setIsTextareaHovered(true)}
          onMouseLeave={() => setIsTextareaHovered(false)}
          placeholder="Es. Pizzeria con forno a legna, Studio Dentistico specializzato, Agenzia Immobiliare residenziale, Impresa Edile di ristrutturazioni..."
          autoComplete="off"
          style={{
            width: "100%",
            minHeight: 94,
            padding: "12px 14px",
            borderRadius: 12,
            border: `1.5px solid ${isTextareaFocused ? C.borderActive : isTextareaHovered ? "rgba(232, 87, 26, 0.4)" : "rgba(255, 255, 255, 0.14)"}`,
            background: isTextareaFocused ? "rgba(232, 87, 26, 0.05)" : isTextareaHovered ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.06)",
            color: C.white,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            lineHeight: 1.5,
            outline: "none",
            resize: "vertical",
            transition: "border-color 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease",
            boxShadow: isTextareaFocused ? `0 0 14px ${C.orangeGlow}` : "none",
          }}
        />
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.55,
          marginTop: 6,
          marginRight: 0,
          marginBottom: 0,
          marginLeft: 0
        }}>
          Questa informazione aiuta a personalizzare l&apos;analisi territoriale nel prossimo step.
        </p>
      </div>
    </section>
  );
}
