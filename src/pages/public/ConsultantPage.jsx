import { useState } from "react";
import { TimingUrgencyPicker } from "../../components/TimingUrgencyPicker.jsx";
import { trackConsultationRequested } from "../../lib/analytics/siteEvents.js";
import { sendConsultationRequest } from "../../api/sendConsultationRequest.js";

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", navy: "#0B192C", navyDeep: "#060F1A", navyMid: "#122036",
  cream: "#FDFBF7", green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF", muted: "#64748B", white: "#FFFFFF",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Campi obbligatori del form
const REQUIRED_FIELDS = ["nome", "telefono", "comune"];

function NavButton({ onClick, children, style, ...rest }) {
  return (
    <button
      type="button" onClick={onClick} className="vp-navbtn"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, minHeight: 42, padding: "10px 18px",
        borderRadius: 10, border: "1px solid rgba(255,255,255,.16)",
        background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
        color: "#F1F5F9", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// required=true -> asterisco rosso; required=false -> "(opzionale)"
function FieldLabel({ children, required }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>
      {children}
      {required ? (
        <span style={{ color: C.red, marginLeft: 4 }}>*</span>
      ) : (
        <span style={{ color: "rgba(255,255,255,.3)", fontWeight: 600, marginLeft: 4 }}>(opzionale)</span>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "11px 13px", borderRadius: 9,
  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
  color: C.white, fontFamily: F.sans, fontSize: 13, colorScheme: "dark",
};

const inputErrorStyle = {
  ...inputStyle,
  border: "1px solid rgba(248,113,113,.5)",
};

/**
 * Valida il form lato client.
 * @returns {{ valid: boolean, errors: Record<string,string> }}
 */
function validateForm(form) {
  const errors = {};
  for (const field of REQUIRED_FIELDS) {
    if (!form[field] || !String(form[field]).trim()) {
      errors[field] = "Campo obbligatorio";
    }
  }
  // Email: opzionale ma se compilata deve essere valida
  if (form.email && form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
    errors.email = "Email non valida";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export default function ConsultantPage({ onStart, data }) {
  const [form, setForm] = useState({
    nome: "",
    telefono: "",
    email: "",
    comune: data?.cityName || data?.searchedLocation || "",
    service: data?.type || data?.selectedService || "d2d",
    qty: data?.qty || data?.flyerQuantity || 10000,
    messaggio: "",
  });
  const [timing, setTiming] = useState("asap");
  const [customDate, setCustomDate] = useState("");

  // Stati invio: 'idle' | 'sending' | 'success' | 'error'
  const [submitState, setSubmitState] = useState("idle");
  // Errori di validazione per campo
  const [fieldErrors, setFieldErrors] = useState({});
  // Messaggio di errore server
  const [serverError, setServerError] = useState("");

  const setField = (key) => (e) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    // Clear field error on change
    if (fieldErrors[key]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  };

  const goToQuick = () => {
    onStart("quick", { comune: form.comune, service: form.service, qty: form.qty });
  };

  async function handleSubmit() {
    // Non permettere doppio submit
    if (submitState === "sending" || submitState === "success") return;

    // Validazione client-side
    const { valid, errors } = validateForm(form);
    if (!valid) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setServerError("");
    setSubmitState("sending");

    try {
      // Fire analytics (fire-and-forget, non blocca il submit)
      trackConsultationRequested();

      const result = await sendConsultationRequest({
        nome: form.nome,
        telefono: form.telefono,
        email: form.email,
        comune: form.comune,
        servizio: form.service,
        quantita: form.qty,
        timing,
        customDate: timing === "custom" ? customDate : undefined,
        messaggio: form.messaggio,
      });

      if (result.ok) {
        setSubmitState("success");
      } else {
        // Backend error — preserva i dati compilati
        const codeMsg = result.code === "RATE_LIMITED"
          ? "Troppe richieste. Attendi qualche minuto e riprova."
          : result.code === "NETWORK_ERROR"
          ? "Errore di rete. Controlla la connessione e riprova."
          : "Non siamo riusciti a inviare la richiesta. Riprova oppure contattaci su WhatsApp.";
        setServerError(codeMsg);
        setSubmitState("error");
      }
    } catch {
      setServerError("Non siamo riusciti a inviare la richiesta. Riprova oppure contattaci su WhatsApp.");
      setSubmitState("error");
    }
  }

  const isSending = submitState === "sending";
  const isSuccess = submitState === "success";

  // Stile pulsante in base allo stato
  const submitBtnStyle = {
    padding: "12px 18px", borderRadius: 10, border: "none",
    background: isSending ? "rgba(232,87,26,.6)" : isSuccess ? C.green : C.orange,
    color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800,
    cursor: isSending || isSuccess ? "not-allowed" : "pointer",
    opacity: isSending ? 0.8 : 1,
    transition: "background 0.2s, opacity 0.2s",
  };

  const fieldStyle = (key) => fieldErrors[key] ? inputErrorStyle : inputStyle;

  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, padding: "72px 28px 120px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <NavButton onClick={() => onStart("home")} style={{ marginBottom: 22 }}>Home</NavButton>

        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.orange, marginBottom: 12 }}>
            Supporto diretto
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: 46, color: C.white, letterSpacing: "-1.4px", marginBottom: 10 }}>
            Parla con un consulente
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 16, color: "rgba(255,255,255,.52)", maxWidth: 660, lineHeight: 1.65 }}>
            Raccontaci la campagna e ti ricontattiamo per costruire una proposta operativa sulla tua zona.
          </p>
        </div>

        <div style={{ borderRadius: 16, padding: "24px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 20 }}>
            <div>
              <FieldLabel required>Nome e Cognome</FieldLabel>
              <input
                value={form.nome}
                onChange={setField("nome")}
                placeholder="Nome e Cognome"
                style={fieldStyle("nome")}
                disabled={isSending || isSuccess}
                aria-invalid={!!fieldErrors.nome}
              />
              {fieldErrors.nome && (
                <div style={{ fontFamily: F.sans, fontSize: 11, color: C.red, marginTop: 4 }}>{fieldErrors.nome}</div>
              )}
            </div>
            <div>
              <FieldLabel required>Telefono / WhatsApp</FieldLabel>
              <input
                value={form.telefono}
                onChange={setField("telefono")}
                placeholder="Telefono / WhatsApp"
                style={fieldStyle("telefono")}
                disabled={isSending || isSuccess}
                aria-invalid={!!fieldErrors.telefono}
              />
              {fieldErrors.telefono && (
                <div style={{ fontFamily: F.sans, fontSize: 11, color: C.red, marginTop: 4 }}>{fieldErrors.telefono}</div>
              )}
            </div>
            <div>
              <FieldLabel>Email</FieldLabel>
              <input
                value={form.email}
                onChange={setField("email")}
                placeholder="Email"
                style={fieldStyle("email")}
                disabled={isSending || isSuccess}
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && (
                <div style={{ fontFamily: F.sans, fontSize: 11, color: C.red, marginTop: 4 }}>{fieldErrors.email}</div>
              )}
            </div>
            <div>
              <FieldLabel required>Comune o zona</FieldLabel>
              <input
                value={form.comune}
                onChange={setField("comune")}
                placeholder="Comune o zona"
                style={fieldStyle("comune")}
                disabled={isSending || isSuccess}
                aria-invalid={!!fieldErrors.comune}
              />
              {fieldErrors.comune && (
                <div style={{ fontFamily: F.sans, fontSize: 11, color: C.red, marginTop: 4 }}>{fieldErrors.comune}</div>
              )}
            </div>
            <div>
              <FieldLabel required>Servizio</FieldLabel>
              <select
                value={form.service}
                onChange={setField("service")}
                style={inputStyle}
                disabled={isSending || isSuccess}
              >
                <option value="d2d">Door to Door</option>
                <option value="h2h">Hand to Hand</option>
                <option value="b2b">Business Distribution</option>
              </select>
            </div>
            <div>
              <FieldLabel required>Quantità</FieldLabel>
              <select
                value={form.qty}
                onChange={(e) => setForm((prev) => ({ ...prev, qty: Number(e.target.value) }))}
                style={inputStyle}
                disabled={isSending || isSuccess}
              >
                {[5000, 10000, 25000, 50000, 100000].map((v) => (
                  <option key={v} value={v}>{v.toLocaleString("it-IT", { useGrouping: true })} volantini</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Quando vuoi distribuire</FieldLabel>
            <TimingUrgencyPicker
              timing={timing} onTimingChange={setTiming}
              customDate={customDate} onCustomDateChange={setCustomDate}
              inputStyle={isSending || isSuccess ? { ...inputStyle, opacity: 0.6, pointerEvents: "none" } : inputStyle}
            />
          </div>

          <div>
            <FieldLabel>Messaggio</FieldLabel>
            <textarea
              value={form.messaggio}
              onChange={setField("messaggio")}
              placeholder="Raccontaci di più sulla campagna"
              rows={4}
              disabled={isSending || isSuccess}
              style={{ ...inputStyle, width: "100%", resize: "vertical", marginBottom: 12 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSending || isSuccess}
              style={submitBtnStyle}
              aria-busy={isSending}
            >
              {isSending ? "Invio in corso..." : isSuccess ? "Richiesta inviata ✓" : "Invia richiesta"}
            </button>
            <button
              type="button"
              onClick={goToQuick}
              disabled={isSending}
              style={{
                padding: "12px 18px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,.14)",
                background: "rgba(255,255,255,.05)",
                color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 700,
                cursor: isSending ? "not-allowed" : "pointer",
                opacity: isSending ? 0.5 : 1,
              }}
            >
              Preventivo rapido
            </button>
          </div>

          {/* Banner successo */}
          {isSuccess && (
            <div
              role="status"
              aria-live="polite"
              style={{
                marginTop: 16, padding: "12px 16px", borderRadius: 10,
                background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.3)",
                fontFamily: F.sans, fontSize: 13, color: C.green, lineHeight: 1.5,
              }}
            >
              ✓ Richiesta inviata correttamente. Ti ricontatteremo al più presto.
            </div>
          )}

          {/* Banner errore server */}
          {submitState === "error" && serverError && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                marginTop: 16, padding: "12px 16px", borderRadius: 10,
                background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.3)",
                fontFamily: F.sans, fontSize: 13, color: C.red, lineHeight: 1.5,
              }}
            >
              {serverError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
