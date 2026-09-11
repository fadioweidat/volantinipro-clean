import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient.js";
import { supabase as authSupabase } from "../../supabaseClient.js";
import { supplierApply } from "../../lib/services/supplier-api.js";
import { F, C } from "../../lib/constants.js";
import { getAuthRedirectBase } from "../../lib/publicAppUrl.js";
import { rememberPendingAuthContext } from "../../auth/session.js";

const DEFAULT_AREAS = [
  "Milano e provincia",
  "Monza e Brianza",
  "Bergamo",
  "Brescia",
  "Como e Lecco",
  "Varese",
  "Pavia e Lodi",
  "Cremona e Mantova",
  "Piemonte (Torino / Novara)",
  "Veneto (Verona / Padova / Vicenza)",
  "Emilia-Romagna (Bologna / Modena / Reggio)",
];

const SERVICE_OPTIONS = [
  { id: "d2d", label: "Door to Door (Casellario postale)" },
  { id: "h2h", label: "Hand to Hand (Volantinaggio a mano / eventi)" },
  { id: "b2b", label: "Business to Business (Negozi e uffici)" },
];

export function SupplierLandingPage({ onNav }) {
  const [viewMode, setViewMode] = useState("overview"); // 'overview' | 'register'
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [selectedAreas, setSelectedAreas] = useState(["Milano e provincia"]);
  const [customArea, setCustomArea] = useState("");
  const [selectedServices, setSelectedServices] = useState(["Door to Door (Casellario postale)"]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && alive) {
          setCurrentUser(session.user);
          if (session.user.email) setEmail(session.user.email);
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const toggleArea = (area) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const addCustomArea = (e) => {
    e.preventDefault();
    const clean = customArea.trim();
    if (clean && !selectedAreas.includes(clean)) {
      setSelectedAreas((prev) => [...prev, clean]);
      setCustomArea("");
    }
  };

  const toggleService = (label) => {
    setSelectedServices((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const company = companyName.trim();
    const contact = contactName.trim();
    const tel = phone.trim();
    const mail = email.trim().toLowerCase();

    if (company.length < 2) {
      setError("Inserisci la ragione sociale o nome ditta (minimo 2 caratteri).");
      return;
    }
    if (contact.length < 2) {
      setError("Inserisci il nome del referente.");
      return;
    }
    if (tel.length < 5) {
      setError("Inserisci un recapito telefonico valido.");
      return;
    }
    if (!mail.includes("@") || !mail.includes(".")) {
      setError("Inserisci un indirizzo email aziendale valido.");
      return;
    }
    if (selectedAreas.length === 0) {
      setError("Seleziona almeno una città o provincia servita.");
      return;
    }
    if (selectedServices.length === 0) {
      setError("Seleziona almeno un servizio di distribuzione offerto.");
      return;
    }

    setBusy(true);

    const payload = {
      companyName: company,
      contactName: contact,
      phone: tel,
      email: mail,
      vatNumber: vatNumber.trim() || null,
      website: website.trim() || null,
      coverageAreas: selectedAreas,
      services: selectedServices,
      notes: notes.trim() || null,
    };

    // If already authenticated:
    if (currentUser) {
      try {
        await supplierApply({
          companyName: payload.companyName,
          contactName: payload.contactName,
          phone: payload.phone,
          vatNumber: payload.vatNumber,
          coverageAreas: payload.coverageAreas,
          services: payload.services,
        });
        setSuccess(true);
      } catch (err) {
        setError(err?.message || "Non è stato possibile registrare la candidatura. Riprova.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // If not authenticated: save pending application and send magic link with supplier context
    try {
      try {
        localStorage.setItem("vp_pending_supplier_application", JSON.stringify(payload));
        rememberPendingAuthContext("supplier");
      } catch {}

      const redirectTo = `${getAuthRedirectBase()}/auth/callback`;
      const { error: otpErr } = await authSupabase.auth.signInWithOtp({
        email: mail,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            company_name: company,
            contact_name: contact,
            phone: tel,
            role: "supplier",
          },
        },
      });

      if (otpErr) throw otpErr;
      setMagicSent(true);
    } catch (err) {
      setError(err?.message || "Errore durante l'invio dell'email di verifica. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>

        {/* Hero Section */}
        <div style={heroStyle}>
          <div style={badgeStyle}>RETE FORNITORI VOLANTINIPRO</div>
          <h1 style={titleStyle}>Lavora con noi</h1>
          <p style={subtitleStyle}>Entra nella rete dei fornitori VolantiniPro.</p>
          <p style={introTextStyle}>
            Collaboriamo con agenzie di distribuzione, centri stampa e squadre dirette
            su tutto il territorio nazionale. Ricevi richieste qualificate, invia preventivi
            e gestisci le campagne con strumenti digitali di tracciamento e reportistica.
          </p>
        </div>

        {/* Choice CTAs (if in overview mode and not submitted) */}
        {!success && !magicSent && (
          <div style={cardsGridStyle}>
            {/* CTA 1: Nuovo Fornitore */}
            <div style={{ ...choiceCardStyle, border: viewMode === "register" ? "2px solid #E8571A" : choiceCardStyle.border }}>
              <div style={cardIconStyle}>🤝</div>
              <div style={cardEyebrowStyle}>PRIMA VOLTA CON NOI?</div>
              <h2 style={cardTitleStyle}>Registrati come fornitore</h2>
              <p style={cardDescStyle}>
                Candidati per ricevere richieste di distribuzione nella tua area operativa.
                Bastano pochi minuti per compilare i dati della tua azienda.
              </p>
              <button
                type="button"
                onClick={() => setViewMode("register")}
                style={primaryBtnStyle}
              >
                Registrati come fornitore →
              </button>
            </div>

            {/* CTA 2: Già Fornitore */}
            <div style={choiceCardStyle}>
              <div style={cardIconStyle}>🔑</div>
              <div style={cardEyebrowStyle}>SEI GIÀ REGISTRATO?</div>
              <h2 style={cardTitleStyle}>Accedi alla Bacheca</h2>
              <p style={cardDescStyle}>
                Accedi con la tua email per consultare le richieste disponibili, inviare
                offerte, visualizzare i lavori assegnati e gestire i tuoi operatori.
              </p>
              <button
                type="button"
                onClick={() => onNav("login?context=supplier")}
                style={secondaryBtnStyle}
              >
                Accedi alla Bacheca Fornitore →
              </button>
            </div>
          </div>
        )}

        {/* Success State (Logged-in submission) */}
        {success && (
          <div style={feedbackBoxStyle}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontFamily: F.serif, fontSize: 26, margin: "0 0 10px", color: "#fff" }}>
              Candidatura inviata con successo!
            </h2>
            <p style={{ color: "rgba(255,255,255,.75)", fontSize: 15, lineHeight: 1.6, maxWidth: 540, margin: "0 auto 24px" }}>
              Grazie <strong>{companyName}</strong>. La tua richiesta è stata registrata ed è in fase di verifica da parte del team VolantiniPro. Ti contatteremo appena il tuo profilo sarà approvato.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onNav("supplier-dashboard")} style={primaryBtnStyle}>
                Vai alla tua Bacheca →
              </button>
              <button type="button" onClick={() => onNav("home")} style={ghostBtnStyle}>
                Torna alla Home
              </button>
            </div>
          </div>
        )}

        {/* Magic Link Sent State (Unauthenticated submission) */}
        {magicSent && (
          <div style={feedbackBoxStyle}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✉️</div>
            <h2 style={{ fontFamily: F.serif, fontSize: 26, margin: "0 0 10px", color: "#fff" }}>
              Controlla la tua email
            </h2>
            <p style={{ color: "rgba(255,255,255,.75)", fontSize: 15, lineHeight: 1.6, maxWidth: 540, margin: "0 auto 24px" }}>
              Abbiamo inviato un link di verifica all'indirizzo <strong>{email}</strong>.
              Clicca sul link ricevuto per confermare la tua identità e completare l'accesso alla tua Bacheca Fornitore.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => onNav("login?context=supplier")} style={secondaryBtnStyle}>
                Apri schermata di accesso
              </button>
              <button type="button" onClick={() => onNav("home")} style={ghostBtnStyle}>
                Torna alla Home
              </button>
            </div>
          </div>
        )}

        {/* Registration Form */}
        {viewMode === "register" && !success && !magicSent && (
          <div style={formWrapperStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,.1)", paddingBottom: 14 }}>
              <div>
                <h2 style={{ fontFamily: F.serif, fontSize: 24, margin: 0, color: "#fff" }}>
                  Modulo di Registrazione Fornitore
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,.55)" }}>
                  Tutti i campi con asterisco (*) sono obbligatori.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode("overview")}
                style={ghostBtnStyle}
              >
                Chiudi modulo ✕
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit}>
              <div style={formGridStyle}>
                <label style={labelStyle}>
                  Ragione Sociale / Nome Ditta *
                  <input
                    required
                    style={inputStyle}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="es. Distribuzioni Lombarde Srl"
                  />
                </label>

                <label style={labelStyle}>
                  Nome e Cognome Referente *
                  <input
                    required
                    style={inputStyle}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="es. Mario Rossi"
                  />
                </label>

                <label style={labelStyle}>
                  Telefono Referente *
                  <input
                    required
                    type="tel"
                    style={inputStyle}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="es. +39 333 1234567"
                  />
                </label>

                <label style={labelStyle}>
                  Email Aziendale *
                  <input
                    required
                    type="email"
                    style={inputStyle}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="es. info@azienda.it"
                  />
                </label>

                <label style={labelStyle}>
                  Partita IVA (opzionale)
                  <input
                    style={inputStyle}
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    placeholder="es. 12345678901"
                  />
                </label>

                <label style={labelStyle}>
                  Sito Web (opzionale)
                  <input
                    type="url"
                    style={inputStyle}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="es. https://www.azienda.it"
                  />
                </label>
              </div>

              {/* Città / Province Servite */}
              <div style={{ marginTop: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>
                  Città e Province Servite *
                  <span style={{ fontWeight: 400, color: "rgba(255,255,255,.5)" }}>
                    Seleziona i territori in cui hai squadre attive.
                  </span>
                </label>
                <div style={chipsContainerStyle}>
                  {DEFAULT_AREAS.map((area) => {
                    const isSel = selectedAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleArea(area)}
                        style={{
                          ...chipStyle,
                          border: isSel ? "1px solid #E8571A" : "1px solid rgba(255,255,255,.14)",
                          background: isSel ? "rgba(232,87,26,.18)" : "rgba(255,255,255,.04)",
                          color: isSel ? "#fff" : "rgba(255,255,255,.75)",
                          fontWeight: isSel ? 700 : 500,
                        }}
                      >
                        {isSel ? "✓ " : "+ "}{area}
                      </button>
                    );
                  })}
                </div>
                {/* Custom Area Input */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Aggiungi un'altra provincia o città specifica (es. Rimini, Forlì)..."
                  />
                  <button type="button" onClick={addCustomArea} style={secondaryBtnStyle}>
                    + Aggiungi
                  </button>
                </div>
              </div>

              {/* Servizi Offerti */}
              <div style={{ marginTop: 20 }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>
                  Servizi di Distribuzione Offerti *
                </label>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                  {SERVICE_OPTIONS.map((srv) => {
                    const isSel = selectedServices.includes(srv.label);
                    return (
                      <label
                        key={srv.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 14px",
                          borderRadius: 10,
                          border: isSel ? "1px solid #E8571A" : "1px solid rgba(255,255,255,.12)",
                          background: isSel ? "rgba(232,87,26,.08)" : "rgba(255,255,255,.03)",
                          cursor: "pointer",
                          color: "#fff",
                          fontSize: 13.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleService(srv.label)}
                          style={{ accentColor: "#E8571A", width: 18, height: 18 }}
                        />
                        <span>{srv.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Note / Flotta */}
              <div style={{ marginTop: 20 }}>
                <label style={labelStyle}>
                  Note aggiuntive / Dimensione flotta / Esperienza (opzionale)
                  <textarea
                    rows={3}
                    style={{ ...inputStyle, minHeight: 74, resize: "vertical" }}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Descrivi brevemente la tua struttura: numero di operatori, anni di attività, mezzi disponibili..."
                  />
                </label>
              </div>

              {error && (
                <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5", fontSize: 13 }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={busy}
                  style={{ ...primaryBtnStyle, minHeight: 48, padding: "0 28px", fontSize: 15 }}
                >
                  {busy ? "Invio candidatura in corso…" : "Invia candidatura fornitore →"}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("overview")}
                  style={ghostBtnStyle}
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Value Proposition & Advantages */}
        <div style={{ marginTop: 60 }}>
          <h2 style={{ fontFamily: F.serif, fontSize: 26, color: "#fff", textAlign: "center", margin: "0 0 32px" }}>
            Perché collaborare con VolantiniPro
          </h2>
          <div style={advantagesGridStyle}>
            <div style={advantageCardStyle}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📍</div>
              <h3 style={advTitleStyle}>Richieste geolocalizzate</h3>
              <p style={advDescStyle}>
                Ricevi direttamente nella tua bacheca richieste di distribuzione mirate sulle tue zone di competenza.
              </p>
            </div>
            <div style={advantageCardStyle}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💶</div>
              <h3 style={advTitleStyle}>Pagamenti e compensi certi</h3>
              <p style={advDescStyle}>
                Accordi trasparenti, nessuna trattenuta nascosta e liquidazione puntuale al termine di ogni campagna certificata.
              </p>
            </div>
            <div style={advantageCardStyle}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📱</div>
              <h3 style={advTitleStyle}>Strumenti digitali avanzati</h3>
              <p style={advDescStyle}>
                Assegna facilmente le squadre alle zone, genera link per i driver e traccia le distribuzioni in tempo reale con report automatici.
              </p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const pageStyle = {
  minHeight: "100vh",
  background: "#080F1E",
  color: "#fff",
  fontFamily: F.sans,
  padding: "48px 20px 80px",
};

const containerStyle = {
  maxWidth: 1040,
  margin: "0 auto",
};

const heroStyle = {
  textAlign: "center",
  maxWidth: 720,
  margin: "0 auto 40px",
};

const badgeStyle = {
  display: "inline-block",
  padding: "6px 14px",
  borderRadius: 20,
  background: "rgba(232,87,26,.15)",
  border: "1px solid rgba(232,87,26,.4)",
  color: "#E8571A",
  fontSize: 11.5,
  fontWeight: 900,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  marginBottom: 16,
};

const titleStyle = {
  fontFamily: F.serif,
  fontSize: "clamp(32px, 5vw, 48px)",
  color: "#fff",
  margin: "0 0 10px",
  lineHeight: 1.15,
};

const subtitleStyle = {
  fontSize: 20,
  color: "#E8571A",
  fontWeight: 700,
  margin: "0 0 14px",
};

const introTextStyle = {
  fontSize: 15,
  lineHeight: 1.6,
  color: "rgba(255,255,255,.65)",
  margin: 0,
};

const cardsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 20,
  marginBottom: 36,
};

const choiceCardStyle = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 16,
  padding: "28px 24px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "0 12px 32px rgba(0,0,0,.25)",
};

const cardIconStyle = {
  fontSize: 32,
  marginBottom: 12,
};

const cardEyebrowStyle = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".12em",
  textTransform: "uppercase",
  color: "#E8571A",
  marginBottom: 6,
};

const cardTitleStyle = {
  fontFamily: F.serif,
  fontSize: 22,
  color: "#fff",
  margin: "0 0 10px",
};

const cardDescStyle = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "rgba(255,255,255,.6)",
  margin: "0 0 24px",
  flex: 1,
};

const formWrapperStyle = {
  background: "rgba(255,255,255,.04)",
  border: "1px solid rgba(232,87,26,.3)",
  borderRadius: 16,
  padding: "32px 28px",
  marginBottom: 40,
  boxShadow: "0 16px 40px rgba(0,0,0,.3)",
};

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(255,255,255,.85)",
};

const inputStyle = {
  width: "100%",
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.15)",
  background: "#0E182A",
  color: "#fff",
  fontFamily: F.sans,
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

const chipsContainerStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const chipStyle = {
  padding: "8px 14px",
  borderRadius: 20,
  fontSize: 12.5,
  cursor: "pointer",
  transition: "all 0.15s ease",
  fontFamily: F.sans,
};

const primaryBtnStyle = {
  minHeight: 46,
  padding: "0 22px",
  borderRadius: 10,
  border: "none",
  background: "#E8571A",
  color: "#fff",
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 6px 16px rgba(232,87,26,.3)",
  transition: "all 0.15s ease",
};

const secondaryBtnStyle = {
  minHeight: 46,
  padding: "0 22px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.2)",
  background: "rgba(255,255,255,.06)",
  color: "#fff",
  fontFamily: F.sans,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const ghostBtnStyle = {
  minHeight: 40,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,.14)",
  background: "transparent",
  color: "rgba(255,255,255,.7)",
  fontFamily: F.sans,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const feedbackBoxStyle = {
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: 16,
  padding: "40px 24px",
  textAlign: "center",
  marginBottom: 40,
};

const advantagesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 20,
};

const advantageCardStyle = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.08)",
  borderRadius: 12,
  padding: "24px 20px",
};

const advTitleStyle = {
  fontFamily: F.serif,
  fontSize: 18,
  color: "#fff",
  margin: "0 0 8px",
};

const advDescStyle = {
  fontSize: 13.5,
  lineHeight: 1.55,
  color: "rgba(255,255,255,.6)",
  margin: 0,
};
