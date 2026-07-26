import { useState, useEffect, useMemo, useRef } from "react";
import { Step1Icon } from "../components/Step1Icon.jsx";
import { useServiceAnalysis } from "../hooks/useServiceAnalysis.js";
import { normalizeNominatimGeocodeResult, canonicalizeItalianMunicipalityName } from "../lib/geocoding/canonicalizeItalianMunicipalityName.js";
import { buildExtraServicesRegistry, buildExtraServicesById, buildOptionalExtras, OPTIONAL_EXTRAS_ORDER } from "../lib/extraServicesRegistry.js";
import { TIMING_OPTIONS, TimingUrgencyPicker } from "../components/TimingUrgencyPicker.jsx";

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", navy: "#0B192C", navyDeep: "#060F1A", navyMid: "#122036",
  cream: "#FDFBF7", green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF", muted: "#64748B", white: "#FFFFFF",
};

// Stesso prezzo per 1.000 usato da Step4 (QUOTE_PRICES) — duplicato qui come
// letterale perche' non e' un modulo importabile, ma il valore e' identico.
const QUOTE_PRICES = { d2d: 18.5, h2h: 22.0, b2b: 35.0 };
const MAX_COMUNI = 3;

const SERVICE_OPTIONS = [
  { id: "d2d", label: "Door to Door", sub: "Cassette postali", icon: "mailbox", color: C.green },
  { id: "h2h", label: "Hand to Hand", sub: "Promoter in strada", icon: "handshake", color: C.blue },
  { id: "b2b", label: "Business Distribution", sub: "Attività ed uffici", icon: "building", color: C.purple },
];

const FORMAT_OPTIONS = [
  { id: "A6", label: "A6", size: "10x15 cm" },
  { id: "A5", label: "A5", size: "15x21 cm" },
  { id: "A4", label: "A4", size: "21x29 cm" },
  { id: "DL", label: "DL", size: "10x21 cm" },
];

function FieldLabel({ children }) {
  return (
    <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,.35)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function money(value) {
  return `€${Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuickQuotePage({ onStart, onContact }) {
  const [service, setService] = useState("d2d");
  const [comuni, setComuni] = useState([]); // [{ name, lat, lng }]
  const [comuneInput, setComuneInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [qty, setQty] = useState(10000);
  const [format, setFormat] = useState("A5");
  const [printed, setPrinted] = useState("true");
  const [timing, setTiming] = useState("asap");
  const [customDate, setCustomDate] = useState("");
  const [extraIds, setExtraIds] = useState([]);
  const [shortfallAcknowledged, setShortfallAcknowledged] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!comuneInput || comuneInput.length < 2 || comuni.length >= MAX_COMUNI) {
      setSuggestions([]);
      return undefined;
    }
    setSuggestLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(comuneInput)}&countrycodes=it&format=json&addressdetails=1&limit=6&featuretype=city`);
        const d = await r.json();
        setSuggestions(d.map((f) => normalizeNominatimGeocodeResult(f, { addressLike: false })));
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);
    debounceRef.current = t;
    return () => clearTimeout(t);
  }, [comuneInput, comuni.length]);

  const addComune = (suggestion) => {
    if (comuni.length >= MAX_COMUNI) return;
    const canonicalName = canonicalizeItalianMunicipalityName(suggestion.name, suggestion);
    const alreadyAdded = comuni.some((c) => c.name.toLowerCase() === canonicalName.toLowerCase());
    if (alreadyAdded) return;
    setComuni((prev) => [...prev, { name: canonicalName, lat: suggestion.lat, lng: suggestion.lng }]);
    setComuneInput("");
    setSuggestions([]);
    setDropOpen(false);
    setShortfallAcknowledged(false);
  };

  const removeComune = (name) => {
    setComuni((prev) => prev.filter((c) => c.name !== name));
    setShortfallAcknowledged(false);
  };

  // Stessa formula di Step2 per il raggio tecnico "comune intero"
  // (volantinipro-final.jsx, effectiveRadiusKm): singolo comune -> clamp
  // [3,8]; piu' comuni -> floor 25km per sweepare abbastanza comuni_breakdown
  // dal centroide del primo comune (l'ancora geocodificata).
  const effectiveRadiusKm = comuni.length > 1 ? Math.max(25, 3) : Math.min(Math.max(3, 3), 8);
  const anchor = comuni[0] || null;
  const selectionScope = comuni.length > 1 ? "multi" : (comuni.length === 1 ? "municipality" : null);

  const { data: apiData, loading: territorialLoading, error: territorialError } = useServiceAnalysis(
    anchor?.lat, anchor?.lng, effectiveRadiusKm, service,
    anchor?.name || null, qty, "comune", null, selectionScope, null
  );

  const comuniBreakdown = useMemo(() => {
    const rows = Array.isArray(apiData?.comuni_breakdown) ? apiData.comuni_breakdown : [];
    return comuni.map((c) => {
      const match = rows.find((row) => {
        const rowName = row.comune_name || row.municipality_name || row.comune || row.name || "";
        return canonicalizeItalianMunicipalityName(rowName, row).toLowerCase() === c.name.toLowerCase();
      });
      const families = match ? Number(match.families || match.households || match.householdsTotal || match.households_total || 0) : null;
      return { name: c.name, families, matched: Boolean(match) };
    });
  }, [comuni, apiData]);

  const totalFamilies = comuniBreakdown.reduce((sum, c) => sum + (c.families || 0), 0);
  const allMatched = comuni.length > 0 && comuniBreakdown.every((c) => c.matched);
  const recommendedQty = allMatched && totalFamilies > 0 ? totalFamilies : null;
  const showShortfall = recommendedQty && qty < recommendedQty && !shortfallAcknowledged;
  const coveragePctAtCurrentQty = recommendedQty ? Math.min(100, Math.round((qty / recommendedQty) * 100)) : null;

  const urgency = TIMING_OPTIONS.find((t) => t.id === timing)?.urgency || "normal";

  const registry = useMemo(
    () => buildExtraServicesRegistry({ flyerQty: qty, dedicatedSupervisionPrice: 45, campaignDurationKnown: false }),
    [qty]
  );
  const registryById = useMemo(() => buildExtraServicesById(registry), [registry]);
  const optionalExtras = useMemo(() => buildOptionalExtras(registryById), [registryById]);

  const toggleExtra = (id) => {
    setExtraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Stessa formula di Step4 (QUOTE_PRICES-based): base + sovrapprezzo urgenza
  // (+30% reale, non i valori 20/35% mostrati solo in Step1) + extra.
  const pricePerThousand = QUOTE_PRICES[service] || 18.5;
  const baseCost = qty * (pricePerThousand / 1000);
  const urgencySurcharge = urgency === "urgent" ? baseCost * 0.3 : 0;
  const extrasCost = extraIds.reduce((sum, id) => sum + (registryById[id]?.price || 0), 0);
  const total = baseCost + urgencySurcharge + extrasCost;

  const comuneCapReached = comuni.length >= MAX_COMUNI;

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
    color: C.white, fontFamily: F.sans, fontSize: 14, colorScheme: "dark",
  };

  const goToGuidedPath = () => {
    onStart("step1", {
      service, comune: anchor?.name || "", qty, format,
      urgency: urgency === "urgent" ? "urgent" : "normal",
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, padding: "72px 20px 120px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <button
          type="button" onClick={() => onStart("home")} className="vp-navbtn"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, minHeight: 42, padding: "10px 18px",
            borderRadius: 10, border: "1px solid rgba(255,255,255,.16)",
            background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
            color: "#F1F5F9", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 24,
          }}
        >
          Home
        </button>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.blue, marginBottom: 12 }}>
            Scorciatoia
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: 44, color: C.white, letterSpacing: "-1.4px", marginBottom: 12 }}>
            Preventivo rapido
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 16, color: "rgba(255,255,255,.52)", lineHeight: 1.6, maxWidth: 640 }}>
            Configura fino a 3 comuni e ricevi una stima con dati territoriali reali. Potrai completare l'analisi nel percorso guidato o parlare con un consulente.
          </p>
        </div>

        <div className="qq-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 28, alignItems: "start" }}>
          <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", padding: "28px", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>

            <FieldLabel>Tipo di servizio</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
              {SERVICE_OPTIONS.map((opt) => (
                <button
                  key={opt.id} type="button" onClick={() => setService(opt.id)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
                    padding: "14px", borderRadius: 12, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${service === opt.id ? opt.color : "rgba(255,255,255,.12)"}`,
                    background: service === opt.id ? `${opt.color}18` : "rgba(255,255,255,.03)",
                  }}
                >
                  <Step1Icon name={opt.icon} size={20} color={service === opt.id ? opt.color : "rgba(255,255,255,.6)"} />
                  <span style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: service === opt.id ? opt.color : C.white }}>{opt.label}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)" }}>{opt.sub}</span>
                </button>
              ))}
            </div>

            <FieldLabel>Comuni o zone target (fino a {MAX_COMUNI})</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: comuni.length ? 12 : 0 }}>
              {comuni.map((c) => (
                <span
                  key={c.name}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 8px 6px 12px", borderRadius: 20, background: `${C.blue}1f`, border: `1px solid ${C.blue}55`, color: C.blue, fontFamily: F.sans, fontSize: 13, fontWeight: 700 }}
                >
                  {c.name}
                  <button
                    type="button" onClick={() => removeComune(c.name)} aria-label={`Rimuovi ${c.name}`}
                    style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {!comuneCapReached && (
              <div style={{ position: "relative" }}>
                <input
                  value={comuneInput}
                  onChange={(e) => { setComuneInput(e.target.value); setDropOpen(true); }}
                  onFocus={() => setDropOpen(true)}
                  placeholder={comuni.length === 0 ? "Es: Milano, Cormano..." : "Aggiungi un altro comune..."}
                  style={inputStyle}
                />
                {dropOpen && comuneInput.length >= 2 && (
                  <div style={{ position: "absolute", zIndex: 5, top: "calc(100% + 4px)", left: 0, right: 0, background: C.navy, border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>
                    {suggestLoading && (
                      <div style={{ padding: "10px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)" }}>Cerco comuni...</div>
                    )}
                    {!suggestLoading && suggestions.length === 0 && (
                      <div style={{ padding: "10px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)" }}>Nessun risultato</div>
                    )}
                    {!suggestLoading && suggestions.map((s) => (
                      <button
                        key={s.id} type="button" onClick={() => addComune(s)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 13, cursor: "pointer" }}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {comuneCapReached && (
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                Massimo {MAX_COMUNI} comuni per il preventivo rapido.
              </div>
            )}

            {comuni.length > 0 && (
              <div style={{ marginTop: 16, padding: "14px", borderRadius: 12, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
                {territorialLoading || (!allMatched && !territorialError) ? (
                  <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)" }}>
                    Calcolo dati territoriali...
                  </div>
                ) : territorialError ? (
                  <div style={{ fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.45)" }}>
                    Dato non disponibile al momento. Verrà ricalcolato nello Step 2.
                  </div>
                ) : (
                  <>
                    <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.green, marginBottom: 8 }}>
                      {comuni.length} {comuni.length === 1 ? "comune" : "comuni"} · {totalFamilies.toLocaleString("it-IT", { useGrouping: true })} famiglie totali · stima territoriale GIS/NIL
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {comuniBreakdown.map((c) => (
                        <div key={c.name} style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.55)" }}>
                          <span>{c.name}</span>
                          <span>{c.matched ? `${c.families.toLocaleString("it-IT", { useGrouping: true })} famiglie` : "dato non disponibile"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div style={{ marginTop: 24, marginBottom: 24 }}>
              <FieldLabel>Quantità volantini</FieldLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {[5000, 10000, 25000, 50000, 100000].map((value) => (
                  <button
                    key={value} type="button" onClick={() => { setQty(value); setShortfallAcknowledged(false); }}
                    style={{
                      padding: "8px 14px", borderRadius: 8,
                      border: `1px solid ${qty === value ? C.blue : "rgba(255,255,255,.12)"}`,
                      background: qty === value ? `${C.blue}22` : "rgba(255,255,255,.04)",
                      color: qty === value ? C.blue : "rgba(255,255,255,.6)",
                      fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {value.toLocaleString("it-IT", { useGrouping: true })}
                  </button>
                ))}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="number" value={qty}
                  onChange={(e) => { setQty(parseInt(e.target.value, 10) || 0); setShortfallAcknowledged(false); }}
                  placeholder="Inserisci quantità manuale" style={inputStyle}
                />
                <div style={{ position: "absolute", right: 14, top: 12, fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.3)" }}>pz.</div>
              </div>
              {recommendedQty && (
                <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.45)", marginTop: 6 }}>
                  Consigliati ~{recommendedQty.toLocaleString("it-IT", { useGrouping: true })} pz per coprire l'area selezionata.
                </div>
              )}
              {showShortfall && (
                <div style={{ marginTop: 12, padding: "14px", borderRadius: 12, background: `${C.yellow}14`, border: `1px solid ${C.yellow}55` }}>
                  <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.yellow, marginBottom: 6 }}>
                    Quantità insufficiente per l'area scelta
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 10, lineHeight: 1.5 }}>
                    Con {qty.toLocaleString("it-IT", { useGrouping: true })} pz copri circa il {coveragePctAtCurrentQty}% dell'area richiesta
                    {comuni.length > 1 ? " (allocazione proporzionale alle famiglie stimate per comune)." : "."}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button" onClick={() => setQty(recommendedQty)}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.yellow, color: C.navyDeep, fontFamily: F.sans, fontSize: 12, fontWeight: 800, cursor: "pointer" }}
                    >
                      Porta a {recommendedQty.toLocaleString("it-IT", { useGrouping: true })} pz
                    </button>
                    <button
                      type="button" onClick={() => setShortfallAcknowledged(true)}
                      style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "rgba(255,255,255,.7)", fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                    >
                      Procedi con quantità attuale
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
              <div>
                <FieldLabel>Formato materiale</FieldLabel>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id} type="button" onClick={() => setFormat(opt.id)}
                      style={{
                        padding: "8px 14px", borderRadius: 8,
                        border: `1px solid ${format === opt.id ? C.blue : "rgba(255,255,255,.12)"}`,
                        background: format === opt.id ? `${C.blue}22` : "rgba(255,255,255,.04)",
                        color: format === opt.id ? C.blue : "rgba(255,255,255,.6)",
                        fontFamily: F.sans, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Stato materiale</FieldLabel>
                <select value={printed} onChange={(e) => setPrinted(e.target.value)} style={inputStyle}>
                  <option value="true">Sì, già stampato</option>
                  <option value="false">No, devo stamparlo</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <FieldLabel>Quando parte la campagna</FieldLabel>
              <TimingUrgencyPicker
                timing={timing} onTimingChange={setTiming}
                customDate={customDate} onCustomDateChange={setCustomDate}
                inputStyle={inputStyle}
              />
            </div>

            <div>
              <FieldLabel>Servizi extra opzionali</FieldLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {optionalExtras.map((ext) => {
                  const selected = extraIds.includes(ext.id);
                  return (
                    <label
                      key={ext.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${selected ? C.blue : "rgba(255,255,255,.1)"}`, background: selected ? `${C.blue}14` : "rgba(255,255,255,.03)", cursor: "pointer" }}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggleExtra(ext.id)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 700, color: C.white }}>{ext.label}</div>
                        <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)" }}>{ext.description}</div>
                      </div>
                      <div style={{ fontFamily: F.sans, fontSize: 13, fontWeight: 800, color: C.blue }}>+{money(ext.price)}</div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="qq-sticky" style={{ position: "sticky", top: 24, background: "rgba(255,255,255,.03)", borderRadius: 20, border: "1px solid rgba(255,255,255,.08)", padding: "24px", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.4)", marginBottom: 12 }}>
              La tua stima
            </div>

            <div style={{ fontFamily: F.serif, fontSize: 36, color: C.white, marginBottom: 4 }}>{money(total)}</div>
            <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 20 }}>IVA 22% esclusa</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.6)" }}>
                <span>{SERVICE_OPTIONS.find((s) => s.id === service)?.label} · {qty.toLocaleString("it-IT", { useGrouping: true })} pz</span>
                <span>{money(baseCost)}</span>
              </div>
              {urgencySurcharge > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 13, color: C.red }}>
                  <span>Urgenza (+30%)</span>
                  <span>+{money(urgencySurcharge)}</span>
                </div>
              )}
              {extraIds.map((id) => (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 13, color: "rgba(255,255,255,.6)" }}>
                  <span>{registryById[id]?.head}</span>
                  <span>+{money(registryById[id]?.price)}</span>
                </div>
              ))}
            </div>

            {comuni.length > 0 && (
              <div style={{ marginBottom: 16, padding: "12px", borderRadius: 10, background: allMatched ? `${C.green}14` : "rgba(255,255,255,.04)", border: `1px solid ${allMatched ? C.green + "55" : "rgba(255,255,255,.1)"}` }}>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: allMatched ? C.green : "rgba(255,255,255,.5)" }}>
                  {allMatched ? `${totalFamilies.toLocaleString("it-IT", { useGrouping: true })} famiglie stimate · ${comuni.length} comuni` : "Dati territoriali in elaborazione..."}
                </div>
                {recommendedQty && (
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                    Copertura con quantità attuale: {coveragePctAtCurrentQty}%
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => onContact("consultant")}
              style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 15, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}
            >
              Richiedi questo preventivo
            </button>

            <div style={{ padding: "14px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", marginBottom: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 6 }}>
                {comuni.length > 1 ? "Vuoi analizzare tutti i comuni nel dettaglio?" : "Vuoi vedere zona e copertura sulla mappa?"}
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)", lineHeight: 1.5, marginBottom: 10 }}>
                Continua nel percorso guidato: la configurazione attuale viene precompilata, poi analizzi zona e copertura in tempo reale.
              </div>
              <button
                type="button" onClick={goToGuidedPath}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Continua nel percorso guidato →
              </button>
            </div>

            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", lineHeight: 1.5 }}>
              Stima indicativa non vincolante. Il preventivo definitivo viene confermato dopo l'analisi completa dell'area.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .qq-grid { grid-template-columns: 1fr !important; }
          .qq-sticky { position: static !important; }
        }
      `}</style>
    </div>
  );
}
