import { useState, useEffect, useMemo, useRef } from "react";
import { Step1Icon } from "../../components/Step1Icon.jsx";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { useServiceAnalysis } from "../../hooks/useServiceAnalysis.js";
import { normalizeNominatimGeocodeResult, canonicalizeItalianMunicipalityName } from "../../lib/geocoding/canonicalizeItalianMunicipalityName.js";
import { buildExtraServicesRegistry, buildExtraServicesById, buildOptionalExtras, OPTIONAL_EXTRAS_ORDER } from "../../lib/extraServicesRegistry.js";
import { TIMING_OPTIONS, TimingUrgencyPicker } from "../../components/TimingUrgencyPicker.jsx";
import { printQuotePdf } from "../../lib/pdf/printQuotePdf.js";
import { distributionTypes } from "../../lib/distributionTypes.js";
import { activityButtons } from "../../lib/activityButtons.js";
import {
  extractMunicipalityTerritorialData,
  computeTerritorialCampaign,
  buildQuickQuoteExplanation,
  computeH2HTerritorialSummary,
  computeBusinessTerritorialEstimate,
} from "../../lib/quickQuote/territorialCampaignCalculator.js";
import { getBusinessDefaultCopies } from "../../lib/business/business-config.js";
import { calculateQuotePricing } from "../../lib/quotePricing.js";
import { QUOTE_PRICES } from "../../lib/appConstants.js";
import { resolveConfiguratorDistributionZones } from "../../lib/pricing/resolveConfiguratorDistributionZones.js";

const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };
const C = {
  orange: "#E8571A", navy: "#0B192C", navyDeep: "#060F1A", navyMid: "#122036",
  cream: "#FDFBF7", green: "#2ECC8A", blue: "#60A5FA", purple: "#A78BFA",
  yellow: "#FBBF24", red: "#F87171", teal: "#2DD4BF", muted: "#64748B", white: "#FFFFFF",
};

const MAX_COMUNI = 3;
// Stesso raggio "singolo comune" gia' usato altrove in questo file
// (Math.min(Math.max(3, 3), 8) == 3) — riusato qui per interrogare
// analysis-poi-search una volta per ciascun comune selezionato (H2H/B2B):
// l'endpoint restituisce un unico aggregato per l'area interrogata, senza
// breakdown per comune, quindi l'unico modo corretto di ottenere un dato
// reale per-comune e' un fetch per comune con un raggio stretto, mai
// un'unica chiamata ad ampio raggio che mescolerebbe zone diverse.
const POI_SINGLE_COMUNE_RADIUS_KM = 3;
// Timeout client-side per singolo comune, solo H2H/B2B nel Preventivo
// Rapido. useServiceAnalysis.js (condiviso con Step2) non espone alcun
// timeout parametrico ne' altrove nel progetto esiste una configurazione
// riusabile per questo — verificato prima di introdurlo, per non duplicare
// funzionalita' gia' presenti (AbortController e stale-request protection
// sono gia' nell'hook e vengono riusati cosi' come sono). Il limite non
// tocca lo Step2 in alcun modo: e' applicato solo qui, sui 3 fetch
// per-comune sotto.
const POI_PER_COMUNE_TIMEOUT_MS = 25000;

// Ranking client-side dei suggerimenti Nominatim: il provider ordina per
// "importance" (popolazione/rilevanza OSM), non per aderenza al testo
// digitato — per query brevi questo puo' mettere un capoluogo (es. "Varese")
// prima del comune con corrispondenza esatta/prefisso (es. "Varedo").
// Riordina soltanto i risultati gia' restituiti dal provider: nessun comune
// inventato o aggiunto.
function rankMunicipalitySuggestions(list, query) {
  const q = String(query || "").trim().toLowerCase();
  const rank = (s) => {
    const name = String(s.name || "").toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    return 3;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

const SERVICE_OPTIONS = [
  { id: "d2d", label: "Door to Door", sub: "Cassette postali", icon: "mailbox" },
  { id: "h2h", label: "Hand to Hand", sub: "Promoter in strada", icon: "handshake" },
  { id: "b2b", label: "Business Distribution", sub: "Attività ed uffici", icon: "building" },
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

function n(value) {
  return Number(value || 0).toLocaleString("it-IT", { useGrouping: true });
}

export default function QuickQuotePage({ onStart, onContact, data }) {
  // Stesso hook/breakpoint di Step1.jsx per le card "Tipo di distribuzione":
  // le card "Tipo di servizio" qui replicano lo stesso comportamento a
  // colonna singola sotto i 760px.
  const isMobile = useIsMobile();
  const [service, setService] = useState(data?.type || data?.selectedService || "d2d");
  const [activityType, setActivityType] = useState(data?.activityType || data?.businessSector || "");
  const [comuni, setComuni] = useState([]); // [{ name, lat, lng }]
  // Il comune arrivato da un'altra pagina (es. "Parla con un consulente") non
  // e' geocodificato: si precompila solo il testo di ricerca, l'utente lo
  // conferma dal suggerimento come qualunque altro comune (mai un chip con
  // coordinate finte).
  const [comuneInput, setComuneInput] = useState(data?.cityName || data?.searchedLocation || "");
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  // La quantita' e' ora opzionale per costruzione: null = "calcola
  // automaticamente" (CASO A del ticket). Deliberatamente NON precompilata da
  // data?.qty/flyerQuantity (che puo' arrivare da un'altra pagina/draft
  // salvato) — il Preventivo Rapido deve partire sempre pulito, senza una
  // quantita' ereditata che sembrerebbe gia' "decisa" dal territorio.
  const [qty, setQty] = useState(null);
  const [format, setFormat] = useState("A5");
  const [printed, setPrinted] = useState("true");
  const [timing, setTiming] = useState("asap");
  const [customDate, setCustomDate] = useState("");
  const [extraIds, setExtraIds] = useState([]);
  const [showAdvancedExtras, setShowAdvancedExtras] = useState(false);
  const [quantityAcknowledged, setQuantityAcknowledged] = useState(false);
  // Timeout client-side per-comune (H2H/B2B) — indice true quando lo slot ha
  // superato POI_PER_COMUNE_TIMEOUT_MS senza risolvere. Una volta true resta
  // "sticky" per quel comune (sez. 3: "mantieni i dati... mostra Bresso come
  // non disponibile"), anche se il fetch di sfondo risolvesse piu' tardi.
  const [poiTimedOut, setPoiTimedOut] = useState([false, false, false]);
  const poiTimeoutTimersRef = useRef([null, null, null]);
  // Snapshot della stima Business esplicitamente accettata dal cliente
  // (click "Usa X copie"): finche' resta null, il prezzo segue liberamente
  // la stima live (nessuna scelta esplicita ancora fatta); dopo un click,
  // resta fissa a quel valore anche se arrivano nuovi dati — sez. 8: mai
  // cambiare silenziosamente una quantita' gia' accettata.
  const [acceptedBusinessEstimate, setAcceptedBusinessEstimate] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!comuneInput || comuneInput.length < 2 || comuni.length >= MAX_COMUNI) {
      setSuggestions([]);
      return undefined;
    }
    setSuggestLoading(true);
    // Le risposte Nominatim possono arrivare fuori ordine rispetto alle
    // richieste (rete non deterministica): senza questo flag, una risposta
    // lenta per un prefisso piu' corto digitato in precedenza (es. "va") puo'
    // sovrascrivere quella corretta e piu' recente per il testo attuale
    // (es. "varedo"), mostrando un comune sbagliato. Il flag scarta ogni
    // risposta che non appartiene piu' all'esecuzione corrente dell'effetto.
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(comuneInput)}&countrycodes=it&format=json&addressdetails=1&limit=6&featuretype=city`);
        const d = await r.json();
        if (stale) return;
        const normalized = d.map((f) => normalizeNominatimGeocodeResult(f, { addressLike: false }));
        setSuggestions(rankMunicipalitySuggestions(normalized, comuneInput));
      } catch {
        if (!stale) setSuggestions([]);
      } finally {
        if (!stale) setSuggestLoading(false);
      }
    }, 350);
    debounceRef.current = t;
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [comuneInput, comuni.length]);

  const addComune = (suggestion) => {
    if (comuni.length >= MAX_COMUNI) return;
    const canonicalName = canonicalizeItalianMunicipalityName(suggestion.name, suggestion);
    const alreadyAdded = comuni.some((c) => c.name.toLowerCase() === canonicalName.toLowerCase());
    if (alreadyAdded) {
      setDuplicateWarning(true);
      return;
    }
    setComuni((prev) => [...prev, { name: canonicalName, lat: suggestion.lat, lng: suggestion.lng }]);
    setComuneInput("");
    setSuggestions([]);
    setDropOpen(false);
    setQuantityAcknowledged(false);
    setDuplicateWarning(false);
  };

  const removeComune = (name) => {
    setComuni((prev) => prev.filter((c) => c.name !== name));
    setQuantityAcknowledged(false);
  };

  // Cambio servizio: la raccomandazione territoriale automatica esiste solo
  // per Door to Door (vedi territorialCampaignCalculator.js — nessuna fonte
  // dati reale per H2H/B2B). Non azzeriamo la quantita' gia' inserita
  // dall'utente (sarebbe una perdita di dato non richiesta), ricalcoliamo
  // solo cosa deriva dal territorio.
  useEffect(() => {
    setQuantityAcknowledged(false);
  }, [service]);

  // Stessa formula di Step2 per il raggio tecnico "comune intero"
  // (volantinipro-final.jsx, effectiveRadiusKm): singolo comune -> clamp
  // [3,8]; piu' comuni -> floor 25km per sweepare abbastanza comuni_breakdown
  // dal centroide del primo comune (l'ancora geocodificata).
  const effectiveRadiusKm = comuni.length > 1 ? Math.max(25, 3) : Math.min(Math.max(3, 3), 8);
  const anchor = comuni[0] || null;
  const selectionScope = comuni.length > 1 ? "multi" : (comuni.length === 1 ? "municipality" : null);

  // Il fetch anchor-based (fino a 25km per il multi-comune) resta valido solo
  // per D2D, dove analysis-istat restituisce comuni_breakdown e i singoli
  // comuni richiesti vengono filtrati per nome (vedi municipalityRows sotto).
  // Per H2H/B2B analysis-poi-search restituisce invece UN SOLO aggregato per
  // l'area interrogata (nessun comuni_breakdown): usare qui lo stesso fetch
  // ad ampio raggio produrrebbe un numero impreciso, mescolando POI/attivita'
  // di zone estranee ai comuni scelti. Percio' questo fetch viene disabilitato
  // (municipality: null) per H2H/B2B, sostituito dai fetch per-comune sotto.
  const { data: apiData, loading: territorialLoading, error: territorialError } = useServiceAnalysis(
    anchor?.lat, anchor?.lng, effectiveRadiusKm, service,
    service === "d2d" ? (anchor?.name || null) : null, qty || null, "comune", null, selectionScope, null
  );

  // H2H/B2B — un fetch analysis-poi-search per ciascuno slot comune (fino a
  // MAX_COMUNI), sempre chiamati (regole degli hook) ma attivi solo quando
  // service !== "d2d" e lo slot ha un comune reale: useServiceAnalysis stesso
  // salta il fetch quando municipality e' null (hasValidZone diventa false).
  const poiSlot0 = useServiceAnalysis(
    comuni[0]?.lat, comuni[0]?.lng, POI_SINGLE_COMUNE_RADIUS_KM, service,
    service !== "d2d" && comuni[0] ? comuni[0].name : null, null, "comune", null, "municipality", null
  );
  const poiSlot1 = useServiceAnalysis(
    comuni[1]?.lat, comuni[1]?.lng, POI_SINGLE_COMUNE_RADIUS_KM, service,
    service !== "d2d" && comuni[1] ? comuni[1].name : null, null, "comune", null, "municipality", null
  );
  const poiSlot2 = useServiceAnalysis(
    comuni[2]?.lat, comuni[2]?.lng, POI_SINGLE_COMUNE_RADIUS_KM, service,
    service !== "d2d" && comuni[2] ? comuni[2].name : null, null, "comune", null, "municipality", null
  );
  const poiSlots = [poiSlot0, poiSlot1, poiSlot2];
  const poiSlotsLoading = [poiSlot0.loading, poiSlot1.loading, poiSlot2.loading];

  // Invalidazione immediata (sez. 7): cambio comuni/servizio azzera i
  // timeout precedenti e la stima Business esplicitamente accettata — un
  // risultato "timeout" o una quantita' "usata" non devono sopravvivere a un
  // input diverso da quello per cui erano stati calcolati.
  useEffect(() => {
    setPoiTimedOut([false, false, false]);
    setAcceptedBusinessEstimate(null);
    poiTimeoutTimersRef.current.forEach((t) => t && clearTimeout(t));
    poiTimeoutTimersRef.current = [null, null, null];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, comuni]);

  // Timeout per-comune: un timer parte quando lo slot inizia a caricare, si
  // annulla se lo slot risolve prima del limite, altrimenti marca quel
  // comune come "timeout" — senza toccare gli altri slot ne' bloccare la UI
  // in attesa (sez. 2). Nessuna modifica a useServiceAnalysis.js: il fetch di
  // sfondo continua, ma la UI smette di aspettarlo.
  useEffect(() => {
    if (service === "d2d") return undefined;
    poiSlotsLoading.forEach((loading, i) => {
      if (loading && !poiTimeoutTimersRef.current[i]) {
        poiTimeoutTimersRef.current[i] = setTimeout(() => {
          setPoiTimedOut((prev) => {
            if (prev[i]) return prev;
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, POI_PER_COMUNE_TIMEOUT_MS);
      }
      if (!loading && poiTimeoutTimersRef.current[i]) {
        clearTimeout(poiTimeoutTimersRef.current[i]);
        poiTimeoutTimersRef.current[i] = null;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, poiSlotsLoading[0], poiSlotsLoading[1], poiSlotsLoading[2]]);

  useEffect(() => () => poiTimeoutTimersRef.current.forEach((t) => t && clearTimeout(t)), []);

  // Risultati progressivi (sez. 3): ogni comune ha uno status indipendente,
  // mai un'attesa collettiva su tutti e 3 prima di mostrare qualcosa.
  const poiMunicipalityResults = useMemo(() => {
    if (service === "d2d") return [];
    return comuni.map((c, i) => {
      const slot = poiSlots[i];
      if (poiTimedOut[i]) return { municipality: c.name, status: "timeout", values: null };
      if (slot?.loading) return { municipality: c.name, status: "pending", values: null };
      const hasValues = Boolean(slot?.data?.values) && Object.keys(slot.data.values).length > 0;
      const matched = hasValues && !slot?.error;
      return { municipality: c.name, status: matched ? "matched" : "unavailable", values: matched ? slot.data.values : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, comuni, poiTimedOut, poiSlot0.data, poiSlot1.data, poiSlot2.data, poiSlot0.error, poiSlot1.error, poiSlot2.error, poiSlotsLoading[0], poiSlotsLoading[1], poiSlotsLoading[2]]);

  // Nessun gate su "tutti caricati": l'aggregato si ricalcola man mano che i
  // singoli comuni completano (matched/timeout/unavailable), sez. 3.
  const h2hSummary = useMemo(
    () => (service === "h2h" && comuni.length > 0 ? computeH2HTerritorialSummary({ municipalityResults: poiMunicipalityResults }) : null),
    [service, comuni.length, poiMunicipalityResults]
  );
  const businessDefaultCopies = useMemo(() => getBusinessDefaultCopies({}), []);
  const businessEstimate = useMemo(
    () => (service === "b2b" && comuni.length > 0
      ? computeBusinessTerritorialEstimate({ municipalityResults: poiMunicipalityResults, defaultCopies: businessDefaultCopies })
      : null),
    [service, comuni.length, poiMunicipalityResults, businessDefaultCopies]
  );
  // true solo mentre NESSUN comune ha ancora risolto (evita di mostrare un
  // pannello vuoto per una frazione di secondo prima del primo risultato).
  const poiAllPending = service !== "d2d" && comuni.length > 0 && poiMunicipalityResults.every((r) => r.status === "pending");

  // CALCOLO TERRITORIALE — deterministico, riusa Step2 (vedi
  // territorialCampaignCalculator.js). Durante il caricamento non calcoliamo
  // affatto: niente stima precedente mostrata come valida (sez. 9 del ticket).
  const municipalityRows = useMemo(() => {
    const rows = Array.isArray(apiData?.comuni_breakdown) ? apiData.comuni_breakdown : [];
    return comuni.map((c) => {
      const match = rows.find((row) => {
        const rowName = row.comune_name || row.municipality_name || row.comune || row.name || "";
        return canonicalizeItalianMunicipalityName(rowName, row).toLowerCase() === c.name.toLowerCase();
      });
      const { households, population } = extractMunicipalityTerritorialData(match);
      return { municipality: c.name, households, population, matched: Boolean(match) && households != null };
    });
  }, [comuni, apiData]);

  const campaign = useMemo(
    () => computeTerritorialCampaign({ municipalityRows, requestedQuantity: qty, service }),
    [municipalityRows, qty, service]
  );

  const hasComuni = comuni.length > 0;
  const territorialReady = hasComuni && !territorialLoading && !territorialError;
  // recommendedQty generalizzato: D2D invariato (stessa condizione di prima).
  // B2B usa la STIMA parziale-consentita (sez. 5: "NON presentare 154 come
  // totale dei tre comuni" ma comunque USABILE come stima su quelli
  // completati) — se il cliente ha gia' accettato un valore esplicitamente
  // (click "Usa X copie"), quel valore resta fisso finche' non lo riaccetta
  // (sez. 8); altrimenti segue la stima live man mano che i comuni
  // completano. H2H resta sempre null: nessuna formula affidabile esiste per
  // derivare una quantita' da POI/score senza promoter e ore (vedi analisi).
  const recommendedQty = service === "d2d"
    ? (campaign.supported && campaign.hasData && campaign.allMatched ? campaign.recommendedQuantity : null)
    : service === "b2b"
      ? (acceptedBusinessEstimate ?? businessEstimate?.estimatedMaterials ?? null)
      : null;
  // Stima live piu' recente, per confrontarla con quella eventualmente gia'
  // accettata e proporre l'aggiornamento senza sostituirla di nascosto.
  const businessEstimateOutdated = service === "b2b"
    && acceptedBusinessEstimate != null
    && businessEstimate?.estimatedMaterials != null
    && businessEstimate.estimatedMaterials !== acceptedBusinessEstimate;
  const showShortfall = service === "d2d" && recommendedQty != null && qty != null && qty < recommendedQty && !quantityAcknowledged;
  const showSurplus = service === "d2d" && recommendedQty != null && qty != null && qty >= recommendedQty;
  const coveragePctAtCurrentQty = campaign.estimatedCoverage;

  // Quantita' effettivamente utilizzata per il prezzo (sez. 12: il prezzo non
  // va calcolato prima di aver determinato questa quantita'). Se il cliente
  // non ha inserito nulla ed e' disponibile una raccomandazione D2D o una
  // stima B2B, si usa quella. Altrimenti la quantita' inserita manualmente
  // (unico caso possibile per H2H, dato che recommendedQty resta sempre null).
  const effectiveQuantity = qty != null ? qty : recommendedQty;
  // canPrice: D2D invariato. B2B/H2H non attendono piu' il completamento di
  // tutti i comuni (progressive loading, sez. 3): basta una quantita'
  // effettiva valida, gia' derivata solo da comuni "matched" a monte.
  const canPrice = service === "d2d"
    ? (!territorialLoading && effectiveQuantity != null && effectiveQuantity > 0 && hasComuni && !territorialError)
    : (hasComuni && effectiveQuantity != null && effectiveQuantity > 0);

  const urgency = TIMING_OPTIONS.find((t) => t.id === timing)?.urgency || "normal";

  const registry = useMemo(
    () => buildExtraServicesRegistry({ flyerQty: effectiveQuantity || 0, dedicatedSupervisionPrice: 45, campaignDurationKnown: false }),
    [effectiveQuantity]
  );
  const registryById = useMemo(() => buildExtraServicesById(registry), [registry]);
  const optionalExtras = useMemo(() => buildOptionalExtras(registryById), [registryById]);

  const MAIN_EXTRA_IDS = useMemo(() => ["control_pro", "tracking_gps", "photo_report_advanced"], []);
  const ADVANCED_EXTRA_IDS = useMemo(() => ["photo_proof", "video_proof", "qr_analytics", "advanced_report", "account_manager", "dedicated_supervision"], []);

  const mainExtras = useMemo(() => optionalExtras.filter((e) => MAIN_EXTRA_IDS.includes(e.id)), [optionalExtras, MAIN_EXTRA_IDS]);
  const advancedExtras = useMemo(() => optionalExtras.filter((e) => ADVANCED_EXTRA_IDS.includes(e.id)), [optionalExtras, ADVANCED_EXTRA_IDS]);
  const activeAdvancedCount = useMemo(() => extraIds.filter((id) => ADVANCED_EXTRA_IDS.includes(id)).length, [extraIds, ADVANCED_EXTRA_IDS]);

  const toggleExtra = (id) => {
    setExtraIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // PREZZO — P1 PRICING ENGINE sezione 21: centralizzato su
  // calculateQuotePricing (stesso modulo condiviso usato da Step4), non
  // piu' una formula duplicata a mano. Stesso input (quantita', tariffa,
  // urgenza, extra) => stesso identico output di Step4 per lo stesso
  // servizio/comune/quantita'/urgenza — nessun piano applicato qui (Quick
  // Quote non raccoglie una scelta di piano continuativo), come gia' prima.
  const pricePerThousand = QUOTE_PRICES[service] || 18.5;
  const pricingQty = effectiveQuantity || 0;
  const extraLineItems = extraIds.map((id) => ({ id, price: registryById[id]?.price || 0 }));
  // P0 WIRING REALE sezione 6 — griglia territoriale attiva per D2D SOLO
  // quando un singolo comune reale e' selezionato (Quick Quote non
  // raccoglie una quantita' per-comune quando ne sono selezionati piu' di
  // uno, vedi audit: mai inventare una ripartizione qui). Con un solo
  // comune, questo produce esattamente lo stesso prezzo di Step4 per lo
  // stesso input (stessa classifyTerritory, stesso calculateQuotePricing).
  const quickDistributionZones = service === "d2d" && comuni.length === 1 && pricingQty > 0
    ? resolveConfiguratorDistributionZones({ selectedComuni: comuni }, pricingQty).zones
    : null;
  const quickPricing = calculateQuotePricing({
    quantity: pricingQty,
    pricePerThousand,
    urgency,
    extras: extraLineItems,
    distributionZones: quickDistributionZones,
  });
  const baseCost = quickPricing.baseCost ?? 0;
  const urgencySurcharge = quickPricing.urgencySurcharge ?? 0;
  const urgencySurchargePctLabel = baseCost > 0 ? Math.round((urgencySurcharge / baseCost) * 100) : 0;
  const extrasCost = quickPricing.extraCost ?? 0;
  const total = quickPricing.total ?? (baseCost + urgencySurcharge + extrasCost);

  // PRESENTAZIONE / CONSIGLIO — testo deterministico sempre disponibile
  // (nessuna dipendenza da AI, sez. 7 del ticket). Solo D2D: H2H e B2B hanno
  // testi di trasparenza propri (vedi pannelli dedicati sotto), diversi da
  // quello generico D2D-oriented di buildQuickQuoteExplanation.
  const explanation = hasComuni && service === "d2d"
    ? buildQuickQuoteExplanation({
        service,
        municipalities: comuni.map((c) => c.name),
        requestedQuantity: qty,
        recommendedQuantity: recommendedQty,
        estimatedCoverage: coveragePctAtCurrentQty,
        status: campaign.status,
      })
    : null;

  const comuneCapReached = comuni.length >= MAX_COMUNI;

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.06)",
    color: C.white, fontFamily: F.sans, fontSize: 14, colorScheme: "dark",
  };

  const goToGuidedPath = () => {
    onStart("step1", {
      service, comune: anchor?.name || "", qty: effectiveQuantity || undefined, format,
      urgency: urgency === "urgent" ? "urgent" : "normal",
      activityType,
    });
  };

  const serviceLabel = SERVICE_OPTIONS.find((s) => s.id === service)?.label || service;

  // Riusa la stessa funzione di generazione PDF di Step4 (printQuotePdf),
  // mappando solo i campi realmente disponibili nel Rapido. Le sezioni che
  // richiedono dati non raccolti qui (pianificazione date, business plan,
  // punteggi Step2) restano vuote/null cosi' printQuotePdf le omette da
  // sola — mai un valore inventato per riempirle.
  const handleRequestQuote = () => {
    if (!canPrice) return;
    const mainArea = comuni.map((c) => c.name).join(", ") || comuneInput || "Zona da definire";
    const quotePdfData = {
      generatedAt: new Date().toISOString(),
      status: "Stima indicativa",
      service: serviceLabel,
      campaign: {
        variant: null,
        quantity: effectiveQuantity,
        format: format,
        grammage: null,
        materialStatus: printed === "true" ? "già stampato" : "Da produrre",
        graphicStatus: null,
        plan: "Singola",
        campaignsPerMonth: null,
        duration: null,
        areaMode: comuni.length > 1 ? "multi" : "comune",
      },
      business: null,
      area: {
        mainArea,
        areaMode: comuni.length > 1 ? "multi" : "comune",
        selectedCaps: [],
        capAnalysis: [],
        radiusKm: null,
        coveredAreaKm2: null,
        selectedMunicipalities: comuni.map((c) => c.name),
        selectionMode: "Auto",
      },
      outputs: {
        estimatedFamilies: campaign.allMatched ? campaign.breakdown.reduce((s, b) => s + (b.households || 0), 0) : null,
        estimatedPopulation: null,
        estimatedCoverage: coveragePctAtCurrentQty,
        recommendedFlyers: recommendedQty,
        fullCoverageFlyers: recommendedQty,
        insertedFlyers: effectiveQuantity,
        remainingFlyers: recommendedQty && effectiveQuantity > recommendedQty ? effectiveQuantity - recommendedQty : 0,
        missingFlyers: recommendedQty && effectiveQuantity < recommendedQty ? recommendedQty - effectiveQuantity : 0,
        coverageStatus: recommendedQty ? (effectiveQuantity >= recommendedQty ? "sufficient" : "partial") : null,
      },
      coverageStrategy: null,
      municipalities: campaign.breakdown.map((b) => ({
        name: b.municipality,
        status: b.households != null ? "Dato disponibile" : "In elaborazione",
        estimatedFlyers: b.requestedQuantity,
        coveragePct: b.estimatedCoverage,
        contributionPct: recommendedQty && b.recommendedQuantity ? Math.round((b.recommendedQuantity / recommendedQty) * 100) : null,
      })),
      scores: [],
      adminInfo: [],
      omi: null,
      extras: extraIds.map((id) => ({
        id,
        label: registryById[id]?.head,
        description: registryById[id]?.optionalDescription || null,
        price: registryById[id]?.price || 0,
        status: "Selezionato",
      })),
      aiAnalysis: { enabled: false, serviceType: service, mainArea },
      planning: {
        selectedDates: timing === "custom" && customDate ? [customDate] : [],
        availabilityLabel: null,
        smartPairingApplied: false,
        smartPairingDiscountPct: null,
        operationalWaypoints: [],
        compatibleZone: null,
      },
      pricing: {
        lines: [
          {
            label: `Distribuzione ${serviceLabel}`,
            detail: `${n(effectiveQuantity)} volantini`,
            quantity: effectiveQuantity,
            unitPrice: pricePerThousand / 1000,
            total: baseCost,
          },
          ...(urgencySurcharge > 0 ? [{ label: `Maggiorazione urgenza (+${urgencySurchargePctLabel}%)`, quantity: null, unitPrice: null, total: urgencySurcharge }] : []),
        ],
        subtotal: baseCost,
        extras: extraIds.map((id) => ({ label: registryById[id]?.head, amount: registryById[id]?.price || 0, status: "Selezionato" })),
        discounts: [],
        total,
      },
      sources: campaign.allMatched ? ["Analisi territoriale GIS/NIL"] : [],
    };
    printQuotePdf(quotePdfData);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, padding: "48px 20px 80px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <button
          type="button" onClick={() => onStart("home")} className="vp-navbtn"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, minHeight: 38, padding: "8px 16px",
            borderRadius: 10, border: "1px solid rgba(255,255,255,.16)",
            background: "linear-gradient(180deg, rgba(18,32,54,.74), rgba(6,15,26,.72))",
            color: "#F1F5F9", fontFamily: F.sans, fontSize: 13, fontWeight: 800, cursor: "pointer", marginBottom: 20,
          }}
        >
          ← Home
        </button>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: ".15em", textTransform: "uppercase", color: C.blue, marginBottom: 8 }}>
            Preventivo Immediato
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: "clamp(30px, 4vw, 40px)", color: C.white, letterSpacing: "-1.2px", margin: "0 0 8px" }}>
            Preventivo rapido
          </h1>
          <p style={{ fontFamily: F.sans, fontSize: 15, color: "rgba(255,255,255,.6)", lineHeight: 1.5, maxWidth: 640, margin: 0 }}>
            Configura servizio e comuni: calcoliamo subito la stima trasparente basata sui dati territoriali reali.
          </p>
        </div>

        <div className="qq-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, alignItems: "start" }}>
          {/* Form principale a sinistra */}
          <div style={{ background: "rgba(255,255,255,.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: isMobile ? "20px 16px" : "24px 26px", boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}>

            {/* 1. SCELTA SERVIZIO */}
            <div style={{ marginBottom: 24 }}>
              <FieldLabel>1. Tipo di servizio</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
                {SERVICE_OPTIONS.map((opt) => {
                  const t = distributionTypes.find((x) => x.id === opt.id);
                  if (!t) return null;
                  const active = service === opt.id;
                  return (
                    <button
                      type="button" role="radio" aria-checked={active} key={t.id} onClick={() => setService(t.id)}
                      className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`}
                      style={{
                        padding: "16px 14px",
                        borderRadius: 14,
                        background: active ? "linear-gradient(180deg, rgba(34,197,94,.14), rgba(34,197,94,.06))" : "rgba(9,18,33,.55)",
                        border: `1.5px solid ${active ? "rgba(34,197,94,.5)" : "rgba(255,255,255,.09)"}`,
                        boxShadow: active ? "0 10px 24px rgba(34,197,94,.12)" : "inset 0 1px 0 rgba(255,255,255,.03)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        position: "relative",
                        textAlign: "left",
                        color: "inherit",
                        transition: "all .2s ease",
                      }}
                    >
                      {active && (
                        <div style={{ position: "absolute", top: 12, right: 12, padding: "2px 7px", borderRadius: 999, background: "rgba(34,197,94,.18)", border: "1px solid rgba(34,197,94,.4)", color: C.green, fontFamily: F.sans, fontSize: 9.5, fontWeight: 800 }}>
                          ✓ Attivo
                        </div>
                      )}
                      <div style={{ marginBottom: 10 }}>
                        <Step1Icon name={t.icon} size={28} color={active ? C.green : "rgba(255,255,255,.8)"} />
                      </div>
                      <div style={{ fontFamily: F.serif, fontSize: 17, color: "#F8FAFC", marginBottom: 4 }}>
                        {t.name}
                      </div>
                      <p style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 1.4, color: "#94A3B8", margin: "0 0 10px", minHeight: 34 }}>
                        {t.desc}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,0.05)", marginTop: "auto" }}>
                        <div style={{ fontSize: 11, color: "#CBD5E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ color: "rgba(255,255,255,.5)" }}>Uso:</span> {t.useCases}
                        </div>
                        <div style={{ fontSize: 11, color: "#CBD5E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ color: "rgba(255,255,255,.5)" }}>Target:</span> {t.target}
                        </div>
                        <div style={{ fontSize: 11, color: "#CBD5E1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ color: "rgba(255,255,255,.5)" }}>Tempo:</span> {t.time}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. DOVE VUOI DISTRIBUIRE (COMUNI / ZONE) */}
            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <FieldLabel>2. Dove vuoi distribuire?</FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: comuni.length ? 10 : 0 }}>
                {comuni.map((c) => (
                  <span
                    key={c.name}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 20, background: `${C.blue}1f`, border: `1px solid ${C.blue}55`, color: C.blue, fontFamily: F.sans, fontSize: 12.5, fontWeight: 700 }}
                  >
                    📍 {c.name}
                    <button
                      type="button" onClick={() => removeComune(c.name)} aria-label={`Rimuovi ${c.name}`}
                      style={{ border: "none", background: "transparent", color: C.blue, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
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
                    onChange={(e) => { setComuneInput(e.target.value); setDropOpen(true); setDuplicateWarning(false); }}
                    onFocus={() => setDropOpen(true)}
                    placeholder={comuni.length === 0 ? "Es: Milano, Cormano…" : "Aggiungi un altro comune…"}
                    style={inputStyle}
                  />
                  {duplicateWarning && (
                    <div style={{ fontFamily: F.sans, fontSize: 11.5, color: C.yellow, marginTop: 4 }}>
                      Comune già selezionato.
                    </div>
                  )}
                  {dropOpen && comuneInput.length >= 2 && (
                    <div style={{ position: "absolute", zIndex: 10, top: "calc(100% + 4px)", left: 0, right: 0, background: C.navy, border: "1px solid rgba(255,255,255,.14)", borderRadius: 10, overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,.5)" }}>
                      {suggestLoading && (
                        <div style={{ padding: "10px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)" }}>Cerco comuni…</div>
                      )}
                      {!suggestLoading && suggestions.length === 0 && (
                        <div style={{ padding: "10px 14px", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)" }}>Nessun risultato trovato</div>
                      )}
                      {!suggestLoading && suggestions.map((s) => (
                        <button
                          key={s.id} type="button" onClick={() => addComune(s)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 13, cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.05)" }}
                        >
                          {s.name}{s.province ? ` · ${s.province}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {comuneCapReached && (
                <div style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.45)", marginTop: 4 }}>
                  Massimo {MAX_COMUNI} comuni inseriti per il calcolo rapido.{" "}
                  <button
                    type="button"
                    onClick={() => onContact("consultant", { comune: comuni.map((c) => c.name).join(", "), service, qty: effectiveQuantity, activityType })}
                    style={{ border: "none", background: "transparent", color: C.blue, fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
                  >
                    Hai più comuni? Parla con un consulente
                  </button>
                </div>
              )}

              {/* Settore / Attività (compatto, opzionale) */}
              <div style={{ marginTop: 12 }}>
                <select value={activityType} onChange={(e) => setActivityType(e.target.value)} style={{ ...inputStyle, padding: "8px 12px", fontSize: 12.5 }}>
                  <option value="">Settore o tipo attività (opzionale)</option>
                  {activityButtons.map((btn) => (
                    <option key={btn.value} value={btn.value}>{btn.label}</option>
                  ))}
                </select>
              </div>

              {/* BOX RISULTATI TERRITORIALI D2D */}
              {service === "d2d" && hasComuni && territorialLoading && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", fontSize: 12, color: "rgba(255,255,255,.6)" }}>
                  Calcolo dati territoriali in corso…
                </div>
              )}
              {service === "d2d" && hasComuni && !territorialLoading && territorialError && (
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", fontSize: 12, color: "rgba(255,255,255,.6)" }}>
                  Dati territoriali momentaneamente non disponibili.
                </div>
              )}
              {service === "d2d" && territorialReady && campaign.breakdown.length > 0 && campaign.allMatched && (
                <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 800, color: C.green }}>
                      Fabbisogno stimato: {n(recommendedQty)} volantini
                    </span>
                    <span style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.7)" }}>
                      Copertura: {qty == null ? "100%" : `${coveragePctAtCurrentQty}%`}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {campaign.breakdown.map((b) => (
                      <div key={b.municipality} style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.65)" }}>
                        <span>• {b.municipality}</span>
                        <span>{b.households != null ? `${n(qty == null ? b.recommendedQuantity : b.requestedQuantity)} volantini` : "dato n/d"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* BOX RISULTATI H2H */}
              {service === "h2h" && hasComuni && !poiAllPending && h2hSummary && (
                <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.white, marginBottom: 4 }}>
                    Punti di passaggio rilevati: {h2hSummary.poiCount != null ? n(h2hSummary.poiCount) : "n/d"}
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.5)" }}>
                    La quantità H2H dipende dalla durata e dai promoter. Inserisci la quantità desiderata sotto.
                  </div>
                </div>
              )}

              {/* BOX RISULTATI B2B */}
              {service === "b2b" && hasComuni && !poiAllPending && businessEstimate && (
                <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 10, background: "rgba(46,204,138,.08)", border: "1px solid rgba(46,204,138,.3)" }}>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.green, marginBottom: 4 }}>
                    Attività target rilevate: {businessEstimate.targetActivitiesCount != null ? n(businessEstimate.targetActivitiesCount) : "n/d"}
                  </div>
                  {businessEstimate.estimatedMaterials != null && (
                    <div style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.65)" }}>
                      Stima consigliata materiali: {n(businessEstimate.estimatedMaterials)} copie ({businessEstimate.defaultCopies} per attività).
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. QUANTITÀ VOLANTINI */}
            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <FieldLabel>3. Quantità volantini</FieldLabel>
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", marginBottom: 10 }}>
                Con Automatica calcoliamo la quantità consigliata usando i dati territoriali reali.
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                {service !== "h2h" && (
                  <button
                    type="button"
                    onClick={() => {
                      setQty(null);
                      if (service === "b2b") setAcceptedBusinessEstimate(businessEstimate?.estimatedMaterials ?? null);
                      setQuantityAcknowledged(false);
                    }}
                    disabled={service === "b2b" && recommendedQty == null}
                    style={{
                      padding: "7px 12px", borderRadius: 8,
                      border: `1px solid ${qty === null ? C.green : "rgba(255,255,255,.12)"}`,
                      background: qty === null ? `${C.green}22` : "rgba(255,255,255,.04)",
                      color: qty === null ? C.green : "rgba(255,255,255,.65)",
                      fontFamily: F.sans, fontSize: 12, fontWeight: 700,
                      cursor: service === "b2b" && recommendedQty == null ? "not-allowed" : "pointer",
                      opacity: service === "b2b" && recommendedQty == null ? 0.5 : 1,
                    }}
                  >
                    {service === "b2b"
                      ? (recommendedQty != null ? `Usa ${n(recommendedQty)} copie` : "Automatica (consigliata)")
                      : "Automatica (consigliata)"}
                  </button>
                )}
                {[5000, 10000, 25000, 50000, 100000].map((value) => (
                  <button
                    key={value} type="button" onClick={() => { setQty(value); setQuantityAcknowledged(false); }}
                    style={{
                      padding: "7px 12px", borderRadius: 8,
                      border: `1px solid ${qty === value ? C.blue : "rgba(255,255,255,.12)"}`,
                      background: qty === value ? `${C.blue}22` : "rgba(255,255,255,.04)",
                      color: qty === value ? C.blue : "rgba(255,255,255,.65)",
                      fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {n(value)}
                  </button>
                ))}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="number" value={qty ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setQty(raw === "" ? null : (parseInt(raw, 10) || 0));
                    setQuantityAcknowledged(false);
                  }}
                  placeholder="Oppure inserisci una quantità personalizzata (lascia vuoto per automatica)"
                  style={{ ...inputStyle, paddingRight: 40 }}
                />
                <div style={{ position: "absolute", right: 14, top: 12, fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.4)" }}>pz.</div>
              </div>

              {/* Warning Shortfall D2D */}
              {showShortfall && (
                <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: `${C.yellow}14`, border: `1px solid ${C.yellow}55` }}>
                  <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 4 }}>
                    Quantità inferiore al fabbisogno stimato ({n(recommendedQty)} pz) · Copertura: {coveragePctAtCurrentQty}%
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    <button
                      type="button" onClick={() => setQty(recommendedQty)}
                      style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: C.yellow, color: C.navyDeep, fontFamily: F.sans, fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                    >
                      Aumenta a {n(recommendedQty)}
                    </button>
                    <button
                      type="button" onClick={() => setQuantityAcknowledged(true)}
                      style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "rgba(255,255,255,.7)", fontFamily: F.sans, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    >
                      Mantieni {n(qty)}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. MATERIALE (FORMATO & STAMPA) SU STESSA RIGA */}
            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <FieldLabel>4. Materiale (Formato & Stampa)</FieldLabel>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, alignItems: "start" }}>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.6)", marginBottom: 6, fontWeight: 600 }}>Formato</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {FORMAT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id} type="button" onClick={() => setFormat(opt.id)}
                        style={{
                          padding: "6px 12px", borderRadius: 7,
                          border: `1px solid ${format === opt.id ? C.blue : "rgba(255,255,255,.12)"}`,
                          background: format === opt.id ? `${C.blue}22` : "rgba(255,255,255,.04)",
                          color: format === opt.id ? C.blue : "rgba(255,255,255,.65)",
                          fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.6)", marginBottom: 6, fontWeight: 600 }}>Stato materiale</div>
                  <select value={printed} onChange={(e) => setPrinted(e.target.value)} style={{ ...inputStyle, padding: "8px 12px", fontSize: 12.5 }}>
                    <option value="true">Sì, già stampato</option>
                    <option value="false">No, devo stamparlo</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 5. QUANDO PARTE LA CAMPAGNA */}
            <div style={{ marginBottom: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <FieldLabel>5. Quando parte la campagna</FieldLabel>
              <TimingUrgencyPicker
                timing={timing} onTimingChange={setTiming}
                customDate={customDate} onCustomDateChange={setCustomDate}
                inputStyle={inputStyle}
              />
            </div>

            {/* 6. SERVIZI EXTRA OPZIONALI */}
            <div style={{ paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
              <FieldLabel>6. Servizi extra opzionali</FieldLabel>

              {/* 3 Extra principali visibili subito */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
                {mainExtras.map((ext) => {
                  const selected = extraIds.includes(ext.id);
                  return (
                    <label
                      key={ext.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9,
                        border: `1px solid ${selected ? C.blue : "rgba(255,255,255,.09)"}`,
                        background: selected ? `${C.blue}14` : "rgba(255,255,255,.025)",
                        cursor: "pointer", transition: "all .15s ease",
                      }}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggleExtra(ext.id)} style={{ accentColor: C.blue }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, color: C.white }}>{ext.label}</span>
                          {ext.badge && (
                            <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 4, background: `${ext.col || C.blue}22`, color: ext.col || C.blue, fontWeight: 800 }}>
                              {ext.badge}
                            </span>
                          )}
                        </div>
                        <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 1 }}>{ext.description}</div>
                      </div>
                      <div style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 800, color: C.blue, whiteSpace: "nowrap" }}>+{money(ext.price)}</div>
                    </label>
                  );
                })}
              </div>

              {/* Accordion toggle per altri servizi avanzati */}
              <button
                type="button"
                onClick={() => setShowAdvancedExtras((prev) => !prev)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)",
                  color: "#CBD5E1", fontFamily: F.sans, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  width: "100%", justifyContent: "space-between",
                }}
              >
                <span>
                  {showAdvancedExtras ? "▲ Nascondi servizi avanzati" : `▼ Mostra altri servizi avanzati (${advancedExtras.length})`}
                </span>
                {activeAdvancedCount > 0 && (
                  <span style={{ padding: "2px 7px", borderRadius: 10, background: `${C.blue}22`, color: C.blue, fontSize: 10.5, fontWeight: 800 }}>
                    {activeAdvancedCount} attivi
                  </span>
                )}
              </button>

              {/* Contenuto Accordion (6 extra avanzati) */}
              {showAdvancedExtras && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10, paddingTop: 10, borderTop: "1px dashed rgba(255,255,255,.08)" }}>
                  {advancedExtras.map((ext) => {
                    const selected = extraIds.includes(ext.id);
                    return (
                      <label
                        key={ext.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9,
                          border: `1px solid ${selected ? C.blue : "rgba(255,255,255,.09)"}`,
                          background: selected ? `${C.blue}14` : "rgba(255,255,255,.02)",
                          cursor: "pointer", transition: "all .15s ease",
                        }}
                      >
                        <input type="checkbox" checked={selected} onChange={() => toggleExtra(ext.id)} style={{ accentColor: C.blue }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.white }}>{ext.label}</div>
                          <div style={{ fontFamily: F.sans, fontSize: 10.5, color: "rgba(255,255,255,.45)" }}>{ext.description}</div>
                        </div>
                        <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 800, color: C.blue, whiteSpace: "nowrap" }}>+{money(ext.price)}</div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Colonna destra: Riepilogo Live Sticky */}
          <div className="qq-sticky" style={{ position: "sticky", top: 20, background: "rgba(255,255,255,.03)", borderRadius: 16, border: "1px solid rgba(255,255,255,.08)", padding: "20px 22px", boxShadow: "0 20px 50px rgba(0,0,0,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "rgba(255,255,255,.45)" }}>
                Riepilogo preventivo
              </div>
              <span style={{ padding: "2px 7px", borderRadius: 4, background: canPrice ? "rgba(34,197,94,.15)" : "rgba(234,179,8,.15)", color: canPrice ? C.green : C.yellow, fontFamily: F.sans, fontSize: 10, fontWeight: 800 }}>
                {canPrice ? "Pronto" : "Incompleto"}
              </span>
            </div>

            {/* Check-list dei parametri selezionati */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                <span>Servizio:</span>
                <span style={{ color: "#F8FAFC", fontWeight: 700 }}>{serviceLabel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                <span>Zona:</span>
                <span style={{ color: hasComuni ? "#F8FAFC" : C.yellow, fontWeight: 700, maxWidth: 180, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {hasComuni ? comuni.map((c) => c.name).join(", ") : "Seleziona comune"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                <span>Quantità:</span>
                <span style={{ color: "#F8FAFC", fontWeight: 700 }}>
                  {effectiveQuantity ? `${n(effectiveQuantity)} pz` : (hasComuni ? "In calcolo…" : "In attesa")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                <span>Formato / Stampa:</span>
                <span style={{ color: "#F8FAFC", fontWeight: 700 }}>{format} · {printed === "true" ? "Stampato" : "Da stampare"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                <span>Tempistica:</span>
                <span style={{ color: "#F8FAFC", fontWeight: 700 }}>{TIMING_OPTIONS.find((t) => t.id === timing)?.label || "Appena possibile"}</span>
              </div>
              {extraIds.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: C.blue }}>
                  <span>Extra attivi:</span>
                  <span style={{ fontWeight: 700 }}>{extraIds.length} selezionati</span>
                </div>
              )}
            </div>

            {/* Visualizzazione Prezzo o Stato Incompleto */}
            {!hasComuni ? (
              <div style={{ padding: "12px 14px", borderRadius: 10, background: `${C.yellow}14`, border: `1px solid ${C.yellow}44`, marginBottom: 14 }}>
                <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.yellow, marginBottom: 2 }}>
                  Seleziona almeno 1 comune per calcolare la stima.
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 11, color: "rgba(255,255,255,.55)" }}>
                  Inserisci il comune target per attivare il calcolo automatico della copertura e del preventivo.
                </div>
              </div>
            ) : (service === "d2d" && territorialLoading) || (service === "b2b" && poiAllPending) ? (
              <div style={{ padding: "16px 0", fontFamily: F.sans, fontSize: 12.5, color: "rgba(255,255,255,.5)", textAlign: "center" }}>
                Calcolo dati territoriali in corso…
              </div>
            ) : (
              <>
                <div style={{ fontFamily: F.serif, fontSize: 34, color: C.white, marginBottom: 2, letterSpacing: "-0.5px" }}>
                  {canPrice ? money(total) : "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <span style={{ fontFamily: F.sans, fontSize: 11.5, color: "rgba(255,255,255,.5)" }}>+ IVA</span>
                  <span style={{ fontFamily: F.sans, fontSize: 10.5, color: "rgba(255,255,255,.35)" }}>• Stima indicativa</span>
                </div>

                {/* Scomposizione voci di costo */}
                {canPrice && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.65)" }}>
                      <span>Distribuzione ({n(effectiveQuantity)} pz)</span>
                      <span>{money(baseCost)}</span>
                    </div>
                    {urgencySurcharge > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: C.red }}>
                        <span>Urgenza (+{urgencySurchargePctLabel}%)</span>
                        <span>+{money(urgencySurcharge)}</span>
                      </div>
                    )}
                    {extraIds.map((id) => (
                      <div key={id} style={{ display: "flex", justifyContent: "space-between", fontFamily: F.sans, fontSize: 12, color: C.blue }}>
                        <span>{registryById[id]?.head}</span>
                        <span>+{money(registryById[id]?.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Pulsante CTA principale */}
            <button
              type="button"
              onClick={handleRequestQuote}
              disabled={!canPrice}
              style={{
                width: "100%", padding: "14px", borderRadius: 10, border: "none",
                background: canPrice ? C.orange : "rgba(255,255,255,.08)",
                color: canPrice ? C.white : "rgba(255,255,255,.35)",
                fontFamily: F.sans, fontSize: 14, fontWeight: 800,
                cursor: canPrice ? "pointer" : "not-allowed", marginBottom: 10,
                boxShadow: canPrice ? "0 8px 20px rgba(232,87,26,.3)" : "none",
                transition: "all .15s ease",
              }}
            >
              {canPrice ? "Ricevi il preventivo" : "Completa i dati"}
            </button>

            <div style={{ fontFamily: F.sans, fontSize: 10, color: "rgba(255,255,255,.35)", lineHeight: 1.45, marginBottom: 16 }}>
              Stima indicativa. Il preventivo definitivo viene confermato dopo l’analisi completa dell’area.
            </div>

            {/* Box percorso guidato */}
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)" }}>
              <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, color: C.white, marginBottom: 4 }}>
                Vuoi vedere zona e copertura sulla mappa?
              </div>
              <div style={{ fontFamily: F.sans, fontSize: 10.5, color: "rgba(255,255,255,.5)", lineHeight: 1.4, marginBottom: 8 }}>
                Continua nel percorso guidato con mappa interattiva e analisi territoriale completa.
              </div>
              <button
                type="button" onClick={goToGuidedPath}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: C.white, fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
              >
                Continua nel percorso guidato →
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .qq-grid { grid-template-columns: 1fr !important; gap: 20px !important; }
          .qq-sticky { position: static !important; }
        }
      `}</style>
    </div>
  );
}
