const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = { blue: "#60A5FA", red: "#F87171", white: "#FFFFFF" };

// Componente unico riusato da Preventivo Rapido (Parte B) e Parla con un
// consulente (Parte C) — vedi NON FARE: "non duplicare il componente tra
// Parte B e Parte C". Il sovrapprezzo +30% e' lo stesso applicato realmente
// da Step4 (data.urgency === "urgent" -> baseCost*0.3), non i valori 20/35%
// mostrati solo nella stima locale di Step1.
export const TIMING_OPTIONS = [
  { id: "asap", label: "Appena possibile", desc: "Pianificazione ordinaria", urgency: "normal" },
  { id: "2weeks", label: "Entro 2 settimane", desc: "Nessuna maggiorazione", urgency: "normal" },
  { id: "urgent", label: "Urgente", desc: "Attivazione prioritaria", urgency: "urgent", surchargeLabel: "+30%" },
  { id: "custom", label: "Scegli una data", desc: "Data di inizio specifica", urgency: "normal" },
];

export function TimingUrgencyPicker({ timing, onTimingChange, customDate, onCustomDateChange, inputStyle }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {TIMING_OPTIONS.map((opt) => (
          <button
            key={opt.id} type="button" onClick={() => onTimingChange(opt.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, textAlign: "left",
              padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1.5px solid ${timing === opt.id ? (opt.urgency === "urgent" ? C.red : C.blue) : "rgba(255,255,255,.12)"}`,
              background: timing === opt.id ? `${opt.urgency === "urgent" ? C.red : C.blue}18` : "rgba(255,255,255,.03)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: timing === opt.id ? (opt.urgency === "urgent" ? C.red : C.blue) : C.white }}>
              {opt.label}
              {opt.surchargeLabel && (
                <span style={{ fontSize: 10, fontWeight: 800, color: C.red }}>{opt.surchargeLabel}</span>
              )}
            </span>
            <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>{opt.desc}</span>
          </button>
        ))}
      </div>
      {timing === "custom" && (
        <input
          type="date" value={customDate} onChange={(e) => onCustomDateChange(e.target.value)}
          style={{ ...inputStyle, marginTop: 10 }}
        />
      )}
    </div>
  );
}
