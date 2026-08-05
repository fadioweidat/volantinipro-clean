import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../../lib/constants.js";
import KpiTooltip from "../../../components/ui/KpiTooltip.jsx";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import { AnimatePresence, motion } from "framer-motion";
import { AUTH_EXPIRED_MESSAGE, clearExpiredSupabaseSession, ensureRestSessionFromSdk, getStoredSupabaseSession, hasSupabaseConfig, isAuthTokenExpiredError, isStoredSupabaseSessionExpired, saveCampaign } from "../../../lib/supabaseClient.js";
import { buildExtraServicesById, buildExtraServicesRegistry, buildOptionalExtras, buildSvcCommercial, normalizeSelectedExtras } from "../../../lib/extraServicesRegistry.js";
import { BUSINESS_DELIVERY_METHODS, BUSINESS_MATERIAL_LOCATIONS, BUSINESS_OBJECTIVES, BUSINESS_PROOF_OPTIONS, BUSINESS_RECIPIENTS, businessCategoryLabel, businessOptionLabel, calculateBusinessMaterials, calculateBusinessOperationalPlan } from "../../../lib/business/business-config.js";
import { formatAreaKm2, formatNumber, formatPaperWeight } from "../../../lib/utils/format.js";
import { formatCoverageProportion } from "../../../lib/step2/buildStep2ViewModel.js";
import { getServiceAccent } from "../../../lib/services/service-config.js";
import { getZoneFullCoverageFlyers } from "../../../lib/doorToDoorCoverage.js";
import { MONTHS_SHORT, QUOTE_PRICES } from "../../../lib/appConstants.js";
import { NavButton } from "../../../components/NavButton.jsx";
import { printQuotePdf } from "../../../lib/pdf/printQuotePdf.js";
import { S2_CITIES, S2_ZONES } from "../../../lib/step2/s2Constants.js";
import { sendEmailConferma } from "../../../api/sendEmailConferma.js";
import { SERVICE_META } from "../../../lib/services/serviceMeta.js";
import { Step1Icon } from "../../../components/Step1Icon.jsx";
import { truthfulSourceLabel } from "../../../lib/step2/truthfulSourceLabel.js";
import { useCliente } from "../../../hooks/useCliente.js";
import { calculateQuotePricing, formatQuoteCurrency, resolveQuoteQuantity } from "../../../lib/quotePricing.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function Step4({
  data,
  setData,
  onBack,
  onNav,
  onHome,
  onCampaignSaved
}) {
  const isMobile = useIsMobile();
  const [sent, setSent] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [campaignSaveError, setCampaignSaveError] = useState(null);
  const [showLoginRequired, setShowLoginRequired] = useState(false);
  const [savedCampaign, setSavedCampaign] = useState(null);
  const {
    cliente
  } = useCliente();
  const [emailSent, setEmailSent] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [showTechPanel, setShowTechPanel] = useState(false);
  const [showStep4Zones, setShowStep4Zones] = useState(false);
  const [techSections, setTechSections] = useState({});
  const [activeDemoId, setActiveDemoId] = useState(null);
  const toggleTech = key => setTechSections(p => ({
    ...p,
    [key]: !p[key]
  }));
  const [confirmSyncStatus, setConfirmSyncStatus] = useState("");
  const [returnFromLogin, setReturnFromLogin] = useState(() => localStorage.getItem("volantinipro_return_to") === "step4" && localStorage.getItem("volantinipro_pending_action") === "confirm_campaign");
  const svcType = data.type || "d2d";
  const isQuick = data.quickSource === "quick_quote";
  const cfg = SERVICE_META[svcType] || SERVICE_META.d2d;
  const col = cfg.color;
  const sectionAccent = getServiceAccent(svcType);
  const tLabel = {
    d2d: "Door to Door",
    h2h: "Hand to Hand",
    b2b: "Distribuzione presso attività e aziende"
  }[svcType] || "N/D";
  const rawFlyerQty = resolveQuoteQuantity(data);
  const flyerQty = (data.coverageDecision === "increase" || data.coverageDecision === "useRecommended") && data.fullCoverageFlyers != null && rawFlyerQty != null ? Math.max(rawFlyerQty, Number(data.fullCoverageFlyers)) : rawFlyerQty;
  const pricePerThousand = QUOTE_PRICES[svcType] || 18.5;
  const unitPricePerFlyer = pricePerThousand / 1000;
  const zones = data.zones || [];
  const selZ = [...S2_ZONES.filter(z => zones.includes(z.id)), ...(data.selectedCaps || []).map(cap => data.capDataMap?.[cap]).filter(Boolean)].filter(z => !z.unavailable);
  const totF = selZ.reduce((a, z) => a + z.families, 0);
  const totP = selZ.reduce((a, z) => a + z.pop, 0);
  const avgCov = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.coverage, 0) / selZ.length) : 0;
  const avgFIdx = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.familyIdx, 0) / selZ.length) : 0;
  const avgFlow = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.flowScore, 0) / selZ.length) : 0;
  const avgCD = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.commDens, 0) / selZ.length) : 0;
  const avgRed = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.reddito, 0) / selZ.length) : 0;
  const avgStr = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.stranieri, 0) / selZ.length * 10) / 10 : 0;
  const avgOcc = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.occup, 0) / selZ.length * 10) / 10 : 0;
  const avgImp = selZ.reduce((a, z) => a + z.imprese, 0);
  const avgIV = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + z.indVec, 0) / selZ.length) : 0;
  const avgGM = selZ.length > 0 ? Math.round(selZ.reduce((a, z) => a + (z.genderM || 49), 0) / selZ.length) : 49;
  const avgGF = 100 - avgGM;
  const maxOpDays = {
    d2d: selZ.reduce((a, z) => Math.max(a, z.operDays), 0),
    h2h: selZ.reduce((a, z) => Math.max(a, z.operDaysH2H), 0),
    b2b: selZ.reduce((a, z) => Math.max(a, z.operDaysB2B), 0)
  };
  const selDays = data.selectedDates || data.days || [];
  // Durata campagna letta dallo stato esistente (giornate confermate in Step 3).
  // Nessuna data confermata -> "Da definire con il team": si usa la fascia base come prezzo indicativo.
  const campaignDurationKnown = selDays.length > 0;
  const dedicatedSupervisionPrice = campaignDurationKnown && selDays.length > 7 ? 70 : 45;
  const realStep3Slots = Array.isArray(data.smartPairingSlots) ? data.smartPairingSlots : [];
  const realStep3Pairs = Object.fromEntries(realStep3Slots.map(slot => {
    const key = slot.date || slot.day || slot.giorno;
    if (!key) return null;
    const type = slot.type === "same" || slot.matchType === "same" ? "same" : "nearby";
    const maxDisc = type === "same" ? 40 : 20;
    const rawDiscount = Number(slot.discountPercent ?? slot.discount_pct ?? slot.discount ?? 0);
    return [key, {
      type,
      disc: Math.max(0, Math.min(maxDisc, Number.isFinite(rawDiscount) ? rawDiscount : 0)),
      zone: slot.zone || slot.area || slot.comune || "Zona compatibile",
      source: slot.source || "backend"
    }];
  }).filter(Boolean));
  const realSelectedPairingDiscounts = selDays.map(k => realStep3Pairs[k]?.disc).filter(v => Number(v) > 0);
  const disc = realSelectedPairingDiscounts.length ? Math.round(realSelectedPairingDiscounts.reduce((a, v) => a + v, 0) / realSelectedPairingDiscounts.length) : 0;
  const alreadyPrinted = data.alreadyPrinted ?? data.hasFlyers === "yes";
  const productionServices = [...new Set([...(data.printServices || []), ...(data.extraServices || [])])].filter(s => ["stampa", "grafica"].includes(s));
  // Unica fonte dati per i servizi extra: estratta in
  // src/lib/extraServicesRegistry.js cosi' sia Step4 sia il Preventivo
  // Rapido possono importarla senza duplicare prezzi/label. Le 2 voci a
  // prezzo dinamico (printing, dedicated_supervision) restano parametrizzate
  // sulle stesse closure locali di questo componente.
  const EXTRA_SERVICES_REGISTRY = buildExtraServicesRegistry({
    flyerQty,
    dedicatedSupervisionPrice,
    campaignDurationKnown
  });
  const svcCommercial = buildSvcCommercial(EXTRA_SERVICES_REGISTRY);
  const EXTRA_SERVICES_BY_ID = buildExtraServicesById(EXTRA_SERVICES_REGISTRY);
  const selectedExtras = normalizeSelectedExtras(data, EXTRA_SERVICES_BY_ID);
  const selectedExtraIds = selectedExtras.map(s => s.id);
  const optionalExtras = buildOptionalExtras(EXTRA_SERVICES_BY_ID);
  const addOptionalExtra = id => setData(d => ({
    ...d,
    extraServices: [...new Set([...(d.extraServices || []), id])]
  }));
  const removeOptionalExtra = ext => setData(d => {
    const removeSet = new Set([ext.id, ext.addId, ...(ext.removeIds || [])].filter(Boolean));
    return {
      ...d,
      extraServices: (d.extraServices || []).filter(id => !removeSet.has(id)),
      printServices: (d.printServices || []).filter(id => !removeSet.has(id))
    };
  });
  const isOptionalExtraSelected = ext => selectedExtraIds.includes(ext.id);
  const activeDemoExtra = optionalExtras.find(ext => ext.id === activeDemoId) || null;
  const openExtraDemo = ext => {
    if (!ext) return;
    console.log("[EXTRA_DEMO_OPENED]", {
      id: ext.id,
      label: ext.label,
      area: mainAreaLabel
    });
    console.log("[EXTRA_DEMO_DATA_SOURCE]", {
      id: ext.id,
      source: "step4_current_configuration",
      area: mainAreaLabel,
      quantity: flyerQty,
      service: tLabel
    });
    console.log("[EXTRA_DEMO_NO_MOCK]", {
      id: ext.id,
      mock: false
    });
    setActiveDemoId(ext.id);
  };
  const renderExtraDemo = ext => {
    if (!ext) return null;
    const accent = svcCommercial[ext.id]?.col || C.orange;
    const demoLabel = {
      tracking_gps: "Tracking in tempo reale",
      photo_proof: "Foto geolocalizzata",
      graphic_design: "Anteprima grafica",
      dedicated_supervision: "Anteprima supervisione"
    }[ext.id] || "Anteprima";
    const realCoverage = coverageForSummary ?? kpis.coverage ?? avgCov ?? null;
    const realFamilies = kpis.families ?? totF ?? null;
    const realPopulation = kpisPopulation ?? (realFamilies ? Math.round(realFamilies * 2.4) : null);
    const realComuniCount = kpisComuniCount ?? selectedZoneNames.length ?? null;
    const realAreaScore = kpis.familyIndex ?? avgFIdx ?? 0;
    const realReachScore = kpis.reachScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + (z.reachD2D || 0), 0) / selZ.length) : realCoverage || 0);
    const realRoiScore = kpis.roiScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + (z.roiD2D || 0), 0) / selZ.length) : realCoverage || 0);
    const realConfidenceScore = kpis.confidenceScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + (z.confD2D || 0), 0) / selZ.length) : 82);
    const realDensity = d2dAvgDensity ?? (d2dAreaKm2 && realPopulation ? Math.round(realPopulation / d2dAreaKm2) : null);
    const aiQualityScore = Math.round(([realAreaScore, realReachScore, realRoiScore, realConfidenceScore].filter(v => Number.isFinite(Number(v)) && Number(v) > 0).reduce((a, v) => a + Number(v), 0) || 0) / Math.max(1, [realAreaScore, realReachScore, realRoiScore, realConfidenceScore].filter(v => Number.isFinite(Number(v)) && Number(v) > 0).length));
    const aiLevel = aiQualityScore >= 86 ? "ottimo" : aiQualityScore >= 74 ? "avanzato" : aiQualityScore >= 58 ? "buono" : "base";
    const coveragePartial = realCoverage != null && realCoverage < 100;
    const realMunicipalityRows = (pdfMunicipalities?.length ? pdfMunicipalities : selectedZoneNames.map((name, index) => ({
      name,
      estimatedFlyers: selectedZoneNames.length ? Math.round(flyerQty / selectedZoneNames.length) : flyerQty,
      coveragePct: realCoverage,
      status: coveragePartial ? "Copertura parziale" : "Copertura pianificata",
      contributionPct: selectedZoneNames.length ? Math.round(100 / selectedZoneNames.length) : 100
    }))).filter(row => row?.name);
    const unavailablePanel = title => <div style={{
      padding: 18,
      borderRadius: 16,
      background: "rgba(255,255,255,.035)",
      border: "1px solid rgba(255,255,255,.08)",
      fontFamily: F.sans
    }}>
        <div style={{
        fontSize: 12,
        fontWeight: 900,
        color: C.white,
        marginBottom: 6
      }}>{title}</div>
        <div style={{
        fontSize: 12,
        color: "rgba(255,255,255,.56)",
        lineHeight: 1.55
      }}>Disponibile dopo avvio campagna.</div>
      </div>;
    const demoSelected = isOptionalExtraSelected(ext);
    const lockedPanel = (title, text = "Disponibile dopo aggiunta al preventivo") => <div style={{
      padding: 16,
      borderRadius: 15,
      background: "rgba(255,255,255,.035)",
      border: "1px solid rgba(255,255,255,.085)",
      fontFamily: F.sans
    }}>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        marginBottom: 8
      }}>
          <div style={{
          fontSize: 12,
          fontWeight: 900,
          color: C.white
        }}>{title}</div>
          <span style={{
          padding: "4px 8px",
          borderRadius: 999,
          background: "rgba(232,87,26,.12)",
          border: "1px solid rgba(232,87,26,.26)",
          color: C.orange,
          fontSize: 10,
          fontWeight: 900
        }}>LOCKED</span>
        </div>
        <div style={{
        fontSize: 12,
        color: "rgba(255,255,255,.58)",
        lineHeight: 1.55
      }}>{text}</div>
      </div>;
    const previewKpis = [["Zona", mainAreaLabel, C.white], ["Volantini", formatNumber(flyerQty), C.orange], ["Famiglie stimate", formatNumber(realFamilies), C.green], ["Copertura stimata", realCoverage != null ? `${realCoverage}%` : "-", C.green], ["Comuni", realComuniCount != null ? formatNumber(realComuniCount) : "-", C.blue], ["Totale", eur(total), C.orange]];
    if (ext.id === "tracking_gps") {
      return <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1.25fr .75fr",
        gap: 16
      }}>
          <div style={{
          minHeight: 300,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,.10)",
          background: "linear-gradient(135deg,#101f35,#07111f)",
          position: "relative",
          overflow: "hidden"
        }}>
            <div style={{
            position: "absolute",
            inset: 0,
            opacity: .28,
            backgroundImage: "linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px"
          }} />
            <svg viewBox="0 0 520 300" style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%"
          }} aria-hidden="true">
              <path d="M58 224 C130 132, 194 198, 248 128 S390 78, 456 150" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="12 10" />
              {[["58", "224"], ["168", "178"], ["248", "128"], ["356", "102"], ["456", "150"]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 4 ? 11 : 7} fill={i === 4 ? C.orange : accent} />)}
            </svg>
            <div style={{
            position: "absolute",
            top: 16,
            left: 16,
            padding: "7px 11px",
            borderRadius: 999,
            background: "rgba(46,204,138,.14)",
            border: "1px solid rgba(46,204,138,.35)",
            color: C.green,
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 900
          }}>{demoLabel}</div>
            <div style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            padding: 14,
            borderRadius: 14,
            background: "rgba(7,17,31,.82)",
            border: "1px solid rgba(255,255,255,.12)",
            fontFamily: F.sans,
            fontSize: 12,
            color: "rgba(255,255,255,.72)"
          }}>Operatore 02 - zona nord<br /><b style={{
              color: C.white
            }}>68% percorso completato</b></div>
          </div>
          <div style={{
          display: "grid",
          gap: 10
        }}>
            {["Partenza operatore - 09:10", "Zona coperta - 68%", "Completamento stimato - 12:30"].map((row, i) => <div key={row} style={{
            padding: 14,
            borderRadius: 13,
            background: "rgba(255,255,255,.045)",
            border: "1px solid rgba(255,255,255,.08)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13
          }}><span style={{
              color: accent,
              fontWeight: 900,
              marginRight: 8
            }}>{i + 1}</span>{row}</div>)}
          </div>
        </div>;
    }
    if (ext.id === "photo_proof") {
      return <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
        gap: 12
      }}>
          {[["Via Roma", "10:18"], ["Centro", "10:42"], ["Zona nord", "11:05"], ["Stazione", "11:34"], ["Quartiere est", "12:02"], ["Piazza", "12:21"]].map(([zone, time], i) => <div key={`${zone}-${time}`} style={{
          aspectRatio: "4/3",
          borderRadius: 14,
          padding: 12,
          background: `linear-gradient(135deg, rgba(96,165,250,.22), rgba(232,87,26,.10)), linear-gradient(${135 + i * 22}deg,#102036,#07111f)`,
          border: "1px solid rgba(255,255,255,.10)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between"
        }}>
              <span style={{
            alignSelf: "flex-start",
            padding: "4px 8px",
            borderRadius: 999,
            background: "rgba(46,204,138,.14)",
            color: C.green,
            fontFamily: F.sans,
            fontSize: 10,
            fontWeight: 900
          }}>foto geolocalizzata</span>
              <div style={{
            fontFamily: F.sans,
            fontSize: 12,
            color: C.white
          }}><b>{zone}</b><br /><span style={{
              color: "rgba(255,255,255,.58)"
            }}>Demo - {time}</span></div>
            </div>)}
        </div>;
    }
    return <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : ".75fr 1.25fr",
      gap: 14
    }}>
        <div style={{
        padding: 20,
        borderRadius: 18,
        background: "rgba(46,204,138,.08)",
        border: "1px solid rgba(46,204,138,.24)",
        display: "grid",
        placeItems: "center",
        minHeight: 240
      }}>
          <div style={{
          width: 154,
          height: 154,
          borderRadius: "50%",
          border: "14px solid rgba(46,204,138,.18)",
          display: "grid",
          placeItems: "center",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)"
        }}>
            <div style={{
            textAlign: "center"
          }}><div style={{
              fontFamily: F.serif,
              fontSize: 30,
              color: C.green,
              lineHeight: 1
            }}>Anteprima</div><div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: "rgba(255,255,255,.52)",
              textTransform: "uppercase",
              letterSpacing: ".08em"
            }}>Demo</div></div>
          </div>
        </div>
        <div style={{
        display: "grid",
        gap: 10
      }}>
          {["Anteprima disponibile dalla configurazione corrente.", "Il servizio si attiva solo con Aggiungi al preventivo."].map(row => <div key={row} style={{
          padding: 13,
          borderRadius: 13,
          background: "rgba(255,255,255,.045)",
          border: "1px solid rgba(255,255,255,.08)",
          fontFamily: F.sans,
          fontSize: 13,
          color: "rgba(255,255,255,.74)"
        }}><b style={{
            color: C.green
          }}>Demo</b> {row}</div>)}
        </div>
      </div>;
  };
  const subDiscPct = data.planDiscount || {
    single: 0,
    monthly3: 5,
    monthly6: 10,
    monthly12: 15
  }[data.subscription] || 0;
  const pricing = calculateQuotePricing({ quantity: flyerQty, pricePerThousand, smartPairingDiscountPct: disc, urgency: data.urgency, planDiscountPct: subDiscPct, extras: selectedExtras });
  const { baseCost, smartPairingDiscount, urgencySurcharge: urgSurch, subtotalBeforePlan, planDiscountAmount, extraCost, total } = pricing;
  const flyWRaw = {
    80: 80,
    115: 115,
    135: 135,
    170: 170,
    300: 300
  }[data.printGramm || data.flyerWeight] || null;
  const flyW = flyWRaw ? `${flyWRaw} g/m²` : data.printGramm || data.flyerWeight ? formatPaperWeight(data.printGramm || data.flyerWeight) : "-";
  const subL = {
    single: "Singola",
    monthly3: "3 mesi",
    monthly6: "6 mesi",
    monthly12: "12 mesi"
  }[data.campaignPlan || data.subscription] || "-";
  const isH2H = svcType === "h2h";
  const isB2B = svcType === "b2b" || svcType === "business-distribution";
  const step4BusinessMaterialPlan = isB2B ? data.businessMaterialPlan || calculateBusinessMaterials(data.selectedOperationalPois || [], data.poiAssignments || {}, data) : null;
  const step4BusinessOperationalPlan = isB2B ? data.businessOperationalPlan || calculateBusinessOperationalPlan((data.selectedOperationalPois || []).length, data) : null;
  const hasOperationalWaypoints = (data.operationalWaypoints?.length || data.gpsPlannedPoints?.length || data.metadata?.operational_waypoints?.length || 0) > 0;
  const hasZones = data.selectedCaps && data.selectedCaps.length > 0 || data.selectedComuni && data.selectedComuni.length > 0 || zones.length > 0 || (isH2H || isB2B) && hasOperationalWaypoints || isB2B && (data.selectedOperationalPois?.length || 0) > 0;
  const coverageBlocked = false;
  const canConfirm = Boolean(svcType && (isB2B ? (data.selectedOperationalPois?.length || 0) > 0 : flyerQty != null && flyerQty > 0) && data.flyerFormat && hasZones && Number.isFinite(total) && !coverageBlocked);
  const confirmProblem = !hasZones ? "Completa la zona" : coverageBlocked ? "quantità volantini insufficiente" : !Number.isFinite(total) ? "Totale non calcolabile" : "";
  const pairingMonth = data.selectedMonth?.month ?? (data.startDate ? new Date(`${data.startDate}T00:00:00`).getMonth() : new Date().getMonth());
  const pairingYear = data.selectedMonth?.year ?? (data.startDate ? new Date(`${data.startDate}T00:00:00`).getFullYear() : new Date().getFullYear());
  const pairsData = realStep3Pairs;
  const box = (e = {}) => ({
    background: "rgba(255,255,255,.04)",
    borderRadius: 13,
    border: "1px solid rgba(255,255,255,.08)",
    ...e
  });
  const eur = n => formatQuoteCurrency(n, 2);
  const eur4 = n => formatQuoteCurrency(n, 4);
  const pctToFraction = (pct, unitWord = "famiglia", pluralWord = "famiglie") => formatCoverageProportion(pct, unitWord, pluralWord);
  const cleanSource = s => truthfulSourceLabel(s || "");
  const nonEmpty = arr => arr.filter(x => x && x.v !== undefined && x.v !== null && x.v !== "" && x.v !== "-");
  const kpis = data.serviceKpis || {};
  const step4Omi = data.metadata?.omi ?? null;
  const step4AnalysisLevel = data.analysisLevel || data.metadata?.analysis_level || kpis.analysisLevel || "comune";
  const step4TerritoryPluralLabel = step4AnalysisLevel === "nil" ? "Zone NIL" : "Comuni";
  const zoneAllocs = data.zonesAllocation || [];
  const plannedGpsPoints = data.operationalWaypoints || data.gpsPlannedPoints || data.metadata?.operational_waypoints || [];
  const allocatedRequirement = zoneAllocs.length ? zoneAllocs.reduce((a, z) => a + Number(z.requiredFlyers ?? 0), 0) : null;
  const requiredQty = data.searchMode === "municipality" ? kpis.recommendedFlyers ?? data.fullCoverageFlyers ?? data.requiredTotalFlyers ?? allocatedRequirement : data.fullCoverageFlyers ?? data.requiredTotalFlyers ?? kpis.recommendedFlyers ?? allocatedRequirement;
  const rawRemainingQty = flyerQty == null || requiredQty == null ? null : flyerQty - requiredQty;
  const remainingQty = data.remainingFlyers ?? data.remainingQuantity ?? Math.max(0, rawRemainingQty);
  const missingQty = rawRemainingQty == null ? null : Math.max(0, -rawRemainingQty);
  const quantityIsSufficient = rawRemainingQty == null ? null : rawRemainingQty >= 0;
  const step4AreaLabel = value => {
    if (value == null || value === false) return "";
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(step4AreaLabel).filter(Boolean).join(", ");
    return value.label || value.name || value.comune_name || value.cityName || value.display_name || "";
  };
  const selectedZoneNames = data.areaMode === "cap" ? (data.selectedCaps || []).map(cap => `CAP ${cap}`) : (() => {
    const fromData = data.selectedComuni?.length ? data.selectedComuni : data.selectedMunicipalities?.length ? data.selectedMunicipalities : null;
    if (fromData) return fromData.map(step4AreaLabel).filter(Boolean);
    const fromAllocs = zoneAllocs.map(z => step4AreaLabel(z.name)).filter(Boolean);
    return fromAllocs.length ? fromAllocs : selZ.map(z => step4AreaLabel(z.name)).filter(Boolean);
  })();
  const isMunicipalityMode = data.searchMode === "municipality";
  // Same "Comune" vs "Raggio" concept Step2 derives locally as isComuneMode
  // (activeAreaTab === "comune"); Step4 has no activeAreaTab of its own, so
  // it reuses the equivalent data.searchMode-based check computed above.
  const isComuneMode = isMunicipalityMode;
  const radiusZoneRows = !isQuick && data.radius && !isMunicipalityMode ? zoneAllocs.length > 0
  // Real allocation rows from Step 2 (API zones) — never fall back to the
  // hardcoded S2_ZONES demo list when the current payload is available.
  ? zoneAllocs.map(a => ({
    id: a.id,
    name: a.name
  })) : S2_ZONES.filter(z => {
    if (selectedZoneNames.includes(z.name)) return true;
    if (!data.city?.id && !data.cityName) return false;
    const cityId = data.city?.id || S2_CITIES.find(c => c.name === data.cityName)?.id;
    const dist = cityId ? z.dist?.[cityId] : null;
    return dist != null && dist <= data.radius + Math.sqrt(z.area / Math.PI);
  }) : selZ;
  const breakdownRows = radiusZoneRows.map(z => {
    const isCapZone = (z.id || "").startsWith("cap_");
    const alloc = zoneAllocs.find(a => a.id === z.id);
    const selectedRow = isCapZone || Boolean(alloc) || zones.includes(z.id);
    const estimatedFlyers = alloc?.assignedFlyers ?? (selectedRow ? svcType === "d2d" ? getZoneFullCoverageFlyers(z) : z.families : null);
    const coveragePercent = alloc?.coveragePercent ?? (selectedRow ? z.coverage : null);
    const contribution = requiredQty > 0 && selectedRow ? Math.round((alloc?.requiredFlyers || estimatedFlyers || 0) / requiredQty * 100) : null;
    return {
      ...z,
      alloc,
      selectedRow,
      estimatedFlyers,
      coveragePercent,
      contribution
    };
  });
  const mainAreaLabel = step4AreaLabel(data.cityName) || step4AreaLabel(data.comune) || selectedZoneNames[0] || "l'area selezionata";
  const estimatedFamiliesForSummary = svcType === "d2d" ? kpis.families ?? totF : null;
  const coverageForSummary = svcType === "d2d" ? requiredQty > 0 ? Math.min(100, Math.round(flyerQty / requiredQty * 100)) : kpis.coverage ?? avgCov : null;
  // Surplus decision made in Step 2 (municipality mode, quantity > recommended).
  // Display-only override on the sufficient-coverage message — never fed back
  // into families/coverage calculations.
  const coverageStrategy = data.coverageStrategy || null;
  const hasSurplusQty = quantityIsSufficient && remainingQty > 0;
  // Log once per actual value change, not on every render — logging inline in
  // the component body was firing on every re-render (any keystroke/state
  // change in Step 4), making a single legitimate value look like log spam.
  useEffect(() => {
    if (import.meta.env.DEV && coverageStrategy) console.log("[STEP4_COVERAGE_STRATEGY_RECEIVED]", coverageStrategy);
  }, [coverageStrategy]);
  const operationalSummary = svcType === "d2d" ? quantityIsSufficient ? coverageStrategy === "extra_frequency" && hasSurplusQty ? `Copertura completa. I volantini extra saranno utilizzati per rinforzo distribuzione / secondo passaggio nelle aree prioritarie.` : `La campagna copre ${mainAreaLabel} con una stima di ${estimatedFamiliesForSummary.toLocaleString("it-IT", {
    useGrouping: true
  })} famiglie e ${coverageForSummary}% di copertura. La quantità inserita è sufficiente; restano ${remainingQty.toLocaleString("it-IT", {
    useGrouping: true
  })} volantini disponibili per estensione zona o scorta operativa.` : `La quantità inserita non copre completamente l'area selezionata. Mancano ${missingQty.toLocaleString("it-IT", {
    useGrouping: true
  })} volantini per raggiungere la copertura stimata.` : svcType === "h2h" ? `La campagna Hand to Hand assegna ${formatNumber(kpis.promoterCount || data.promoterCount || 1)} promoter a ${formatNumber(kpis.selectedPointCount || data.selectedOperationalPois?.length || data.operationalPoints?.length || 1)} punti operativi, con una capacità stimata di ${formatNumber(kpis.estimatedCapacity || data.h2hEstimatedCapacity || requiredQty)} volantini per turno.` : isB2B ? `La campagna Business comprende ${formatNumber(step4BusinessMaterialPlan?.selectedActivities || data.selectedOperationalPois?.length || 0)} attività selezionate nell'area di ${mainAreaLabel}, ${step4BusinessMaterialPlan?.materialsRequired == null ? "materiali da definire" : `${formatNumber(step4BusinessMaterialPlan.materialsRequired)} materiali necessari`} e ${step4BusinessOperationalPlan?.calculable ? `${formatNumber(step4BusinessOperationalPlan.operatorDays)} giornate-addetto stimate` : "capacità operativa da definire"}.` : `La campagna copre ${mainAreaLabel} con i dati operativi disponibili per il servizio selezionato.`;
  const selectedDatesLabel = selDays.length ? selDays.map(k => {
    const pts = k.split("-");
    return `${pts[2]} ${MONTHS_SHORT[parseInt(pts[1])]}`;
  }).join(" – ") : "Nessuna data selezionata";
  const serviceExtras = selectedExtras.map(e => ({
    l: e.label,
    v: e.price > 0 ? `+${eur(e.price)}` : e.isUrgent ? "Incluso in urgenza" : "Incluso",
    c: e.isUrgent ? C.red : e.price > 0 ? C.blue : C.green,
    d: e.description,
    icon: e.icon,
    status: e.status
  }));
  const d2dScores = [{
    l: "Qualità area",
    v: kpis.familyIndex ?? avgFIdx,
    c: "#22C55E",
    d: "Qualità residenziale dell'area su 100. Più alto = zona più adatta alla distribuzione porta a porta.",
    src: "Analisi interna"
  }, {
    l: "Potenziale copertura",
    v: kpis.reachScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.reachD2D, 0) / selZ.length) : 0),
    c: C.blue,
    d: "Stima di quante famiglie puoi raggiungere efficacemente.",
    src: "Analisi interna"
  }, {
    l: "Efficienza campagna",
    v: kpis.roiScore ?? null,
    c: C.green,
    d: "Rapporto qualità/costo nell'area. Disponibile solo quando il dato è stato calcolato.",
    src: "Analisi interna"
  }, {
    l: "Affidabilità stima",
    v: kpis.confidenceScore ?? (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.confD2D, 0) / selZ.length) : 0),
    c: C.purple,
    d: "Quanto sono precisi i dati mostrati. Più alto = stime più accurate.",
    src: "Analisi interna"
  }];
  const kpisPopulation = kpis.population ?? kpis.pop ?? (totP || null);
  const kpisComuniCount = kpis.comuniCount ?? data.comuniNelRaggio ?? data.selectedComuni?.length ?? data.zones?.length ?? breakdownRows.length ?? selZ.length ?? null;
  const d2dAreaKm2 = kpis.area || (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.area, 0) * 10) / 10 : null);
  const d2dAvgDensity = d2dAreaKm2 && kpisPopulation ? Math.round(kpisPopulation / d2dAreaKm2) : null;
  const d2dSummarySources = data.sources?.length ? data.sources : [];
  const serviceSummaryConfig = {
    d2d: {
      title: "Output Door to Door",
      fields: [{
        l: "Famiglie operative stimate",
        v: formatNumber(kpis.families ?? totF),
        src: "Stima territoriale GIS/NIL",
        c: "#22C55E"
      }, {
        l: "Popolazione stimata",
        v: formatNumber(kpisPopulation) || "—",
        src: "ISTAT",
        c: "#22C55E"
      }, {
        l: "Copertura dell'area",
        v: `${kpis.coverage ?? avgCov}%`,
        src: "Dati geografici",
        c: C.green
      }, {
        l: "Quantità consigliata",
        v: formatNumber(requiredQty || flyerQty),
        src: "Analisi interna",
        c: C.green
      }, {
        l: "Quantità inserita",
        v: formatNumber(flyerQty),
        src: "Step 1",
        c: C.white
      }, remainingQty > 0 ? {
        l: "Scorta operativa",
        v: formatNumber(remainingQty),
        src: "Calcolo",
        c: C.green
      } : missingQty > 0 ? {
        l: "Volantini mancanti",
        v: formatNumber(missingQty),
        src: "Calcolo",
        c: C.red
      } : null],
      scores: d2dScores,
      admin: [{
        l: "Densità media",
        v: d2dAvgDensity ? `${formatNumber(d2dAvgDensity)} ab./km²` : null
      }, {
        l: "Comuni nel raggio",
        v: kpisComuniCount ? formatNumber(kpisComuniCount) : null
      }, {
        l: "Età 0-14",
        v: (() => {
          const vs = selZ.map(z => z.eta14).filter(n => n != null);
          return vs.length ? `${Math.round(vs.reduce((a, n) => a + n, 0) / vs.length * 10) / 10}%` : null;
        })()
      }, {
        l: "Età 15-34",
        v: (() => {
          const vs = selZ.map(z => z.eta34).filter(n => n != null);
          return vs.length ? `${Math.round(vs.reduce((a, n) => a + n, 0) / vs.length * 10) / 10}%` : null;
        })()
      }, {
        l: "Età 35-64",
        v: (() => {
          const vs = selZ.map(z => z.eta64).filter(n => n != null);
          return vs.length ? `${Math.round(vs.reduce((a, n) => a + n, 0) / vs.length * 10) / 10}%` : null;
        })()
      }, {
        l: "Età 65+",
        v: (() => {
          const vs = selZ.map(z => z.eta65).filter(n => n != null);
          return vs.length ? `${Math.round(vs.reduce((a, n) => a + n, 0) / vs.length * 10) / 10}%` : null;
        })()
      }, {
        l: "Reddito medio stimato",
        v: avgRed ? eur(avgRed).replace(",00", "") : null
      }, {
        l: "Tasso occupazione",
        v: avgOcc ? `${avgOcc}%` : null
      }, {
        l: "% stranieri",
        v: avgStr ? `${avgStr}%` : null
      }, {
        l: "Indice vecchiaia",
        v: avgIV ? `${avgIV} anziani ogni 100 giovani` : null
      }, {
        l: "Imprese totali",
        v: avgImp ? formatNumber(avgImp) : null
      }],
      sources: d2dSummarySources
    },
    h2h: {
      title: "Output Hand to Hand",
      fields: [{
        l: "Promoter assegnati",
        v: formatNumber(kpis.promoterCount || data.promoterCount || 1),
        src: "Configurazione Step 1",
        c: C.blue
      }, {
        l: "Punti operativi",
        v: formatNumber(kpis.selectedPointCount || data.selectedOperationalPois?.length || data.operationalPoints?.length || 1),
        src: "Selezione Step 2",
        c: C.blue
      }, {
        l: "Capacità del turno",
        v: formatNumber(kpis.estimatedCapacity || data.h2hEstimatedCapacity || requiredQty),
        src: "Promoter × ore × 200/ora",
        c: C.green
      }, {
        l: "POI rilevanti",
        v: formatNumber(kpis.poi),
        src: "Google Places",
        c: C.blue
      }, {
        l: "Fermate / stazioni",
        v: formatNumber(kpis.transitStops),
        src: "Trasporto pubblico / GTFS",
        c: C.purple
      }, {
        l: "Scuole / eventi",
        v: formatNumber(kpis.schoolsEvents),
        src: "Analisi interna",
        c: C.green
      }, {
        l: "Flusso potenziale",
        v: kpis.flowScore != null ? `${kpis.flowScore}/100` : null,
        src: "Analisi interna",
        c: C.blue
      }, {
        l: "Densità passaggio",
        v: kpis.passageDensity != null ? `${kpis.passageDensity}/100` : null,
        src: "Analisi interna",
        c: C.blue
      }, {
        l: "Fasce consigliate",
        v: kpis.suggestedWindows,
        src: "Analisi interna",
        c: C.white
      }],
      scores: [{
        l: "Potenziale copertura",
        v: kpis.reachScore,
        c: C.blue,
        d: "Stima di quante persone puoi raggiungere efficacemente."
      }, {
        l: "Efficienza campagna",
        v: kpis.roiScore,
        c: C.green,
        d: "Rapporto qualità/costo nell'area selezionata."
      }, {
        l: "Affidabilità stima",
        v: kpis.confidenceScore,
        c: "#6366F1",
        d: "Precisione dei dati. Più alto = stime più accurate."
      }],
      admin: [{
        l: "Hotspot principale",
        v: kpis.strongestHotspot
      }, {
        l: "Attività vicine",
        v: kpis.nearbyBiz ? formatNumber(kpis.nearbyBiz) : null
      }, {
        l: "Forza hotspot",
        v: kpis.hotspotStrength != null ? `${kpis.hotspotStrength}/100` : null
      }],
      sources: data.sources?.length ? data.sources : []
    },
    b2b: {
      title: "Output Business Distribution",
      fields: [{
        l: "Attività selezionate",
        v: formatNumber(step4BusinessMaterialPlan?.selectedActivities || 0),
        src: "Selezione cliente — Step 2",
        c: C.green
      }, {
        l: "Materiali disponibili",
        v: formatNumber(step4BusinessMaterialPlan?.inserted || 0),
        src: "Configurazione Business — Step 1",
        c: C.white
      }, {
        l: "Materiali necessari",
        v: step4BusinessMaterialPlan?.materialsRequired == null ? "Da definire" : formatNumber(step4BusinessMaterialPlan.materialsRequired),
        src: "Copie per attività",
        c: C.blue
      }, {
        l: "Materiali residui",
        v: step4BusinessMaterialPlan?.materialsRemaining == null ? "Da definire" : formatNumber(step4BusinessMaterialPlan.materialsRemaining),
        src: "Calcolo materiali",
        c: C.green
      }, {
        l: "Materiali mancanti",
        v: step4BusinessMaterialPlan?.materialsMissing == null ? "Da definire" : formatNumber(step4BusinessMaterialPlan.materialsMissing),
        src: "Calcolo materiali",
        c: Number(step4BusinessMaterialPlan?.materialsMissing) > 0 ? C.red : C.green
      }, {
        l: "Giornate-addetto",
        v: step4BusinessOperationalPlan?.calculable ? formatNumber(step4BusinessOperationalPlan.operatorDays) : "Da calcolare",
        src: "Tempo medio per visita",
        c: C.yellow
      }, {
        l: "Addetti consigliati",
        v: step4BusinessOperationalPlan?.recommendedOperators == null ? "Da definire" : formatNumber(step4BusinessOperationalPlan.recommendedOperators),
        src: "Periodo e carico operativo",
        c: C.purple
      }, {
        l: "Modalità di consegna",
        v: businessOptionLabel(BUSINESS_DELIVERY_METHODS, data.businessDeliveryMethod),
        src: "Configurazione Business",
        c: C.white
      }, {
        l: "Referente preferito",
        v: businessOptionLabel(BUSINESS_RECIPIENTS, data.businessPreferredRecipient),
        src: "Configurazione Business",
        c: C.white
      }],
      scores: [{
        l: "Potenziale copertura",
        v: kpis.reachScore,
        c: C.blue,
        d: "Stima di quante attività puoi raggiungere."
      }, {
        l: "Efficienza campagna",
        v: kpis.roiScore,
        c: C.green,
        d: "Rapporto qualità/costo nell'area commerciale."
      }, {
        l: "Affidabilità stima",
        v: kpis.confidenceScore,
        c: "#6366F1",
        d: "Precisione dei dati. Più alto = stime più accurate."
      }],
      admin: [{
        l: "Obiettivo",
        v: businessOptionLabel(BUSINESS_OBJECTIVES, data.businessCampaignObjective)
      }, {
        l: "Prove richieste",
        v: (data.businessProofs || []).map(value => businessOptionLabel(BUSINESS_PROOF_OPTIONS, value)).join(", ") || "Nessuna prova aggiuntiva selezionata"
      }, {
        l: "Posizione materiale",
        v: businessOptionLabel(BUSINESS_MATERIAL_LOCATIONS, data.businessMaterialLocation)
      }, {
        l: "Periodo preferito",
        v: [data.businessPreferredStartDate, data.businessCompleteBy].filter(Boolean).join(" → ") || "Da concordare"
      }],
      sources: data.sources?.length ? data.sources : []
    }
  }[svcType] || {};
  if (svcType === "d2d") {
    serviceSummaryConfig.admin = [{
      l: "Famiglie stimate",
      v: formatNumber(kpis.families ?? totF),
      src: "ISTAT"
    }, {
      l: "Popolazione stimata",
      v: formatNumber(kpisPopulation) || "dato non disponibile",
      src: "ISTAT"
    }, {
      l: "Superficie analizzata",
      v: d2dAreaKm2 ? formatAreaKm2(d2dAreaKm2) : null,
      src: "Dati geografici / PostGIS"
    }, {
      l: "Densità media",
      v: d2dAvgDensity ? `${formatNumber(d2dAvgDensity)} ab./km²` : null,
      src: "ISTAT"
    }, {
      l: `${step4TerritoryPluralLabel} nel raggio`,
      v: kpisComuniCount != null ? formatNumber(kpisComuniCount) : null,
      src: "Dati geografici / PostGIS"
    }];
    serviceSummaryConfig.sources = d2dSummarySources;
  }
  const fieldCard = ({
    l,
    v,
    src,
    c = C.white
  }) => <div key={l} style={{
    padding: "10px 11px",
    background: "rgba(255,255,255,.04)",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.055)"
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      fontFamily: F.sans,
      fontSize: 8,
      color: "rgba(255,255,255,.34)",
      textTransform: "uppercase",
      letterSpacing: ".05em",
      marginBottom: 4
    }}>
        <span>{l}</span>
        <KpiTooltip term={l.split(" ")[0]} style={{
        marginLeft: 4
      }} />
      </div>
      <div style={{
      fontFamily: F.sans,
      fontSize: 13,
      fontWeight: 800,
      color: c
    }}>{v || "Dato non disponibile"}</div>
      {src && <div style={{
      fontFamily: F.sans,
      fontSize: 8,
      color: "rgba(255,255,255,.26)",
      marginTop: 4
    }}>{cleanSource(src)}</div>}
    </div>;
  const slug = value => (value || "preventivo").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const quoteDate = new Date().toISOString().slice(0, 10);
  const pdfFileName = `Preventivo-VolantiniPro-${slug(mainAreaLabel)}-${quoteDate}.pdf`;
  const pdfMunicipalities = (() => {
    if (isMunicipalityMode) {
      // Dati reali già calcolati per comune in Step2 (data.zonesAllocation),
      // non una divisione uniforme in parti uguali — vedi zoneAllocs sopra.
      if (zoneAllocs.length > 0) {
        const totalReq = zoneAllocs.reduce((a, z) => a + (z.requiredFlyers || 0), 0);
        return zoneAllocs.map(alloc => ({
          name: alloc.name,
          status: alloc.allocationStatus === "full" ? "Selezionato – copertura completa" : alloc.allocationStatus === "partial" ? "Selezionato – copertura parziale" : "Non coperto dal budget attuale",
          estimatedFlyers: alloc.assignedFlyers,
          coveragePct: alloc.coveragePercent,
          contributionPct: totalReq > 0 ? Math.round(alloc.requiredFlyers / totalReq * 100) : null
        }));
      }
      // Fallback solo per campagne salvate prima che zonesAllocation fosse
      // valorizzato in modalità Comuni: nessun dato reale disponibile, si
      // dichiara una stima equamente distribuita invece di ometterla.
      const muns = data.selectedComuni?.length ? data.selectedComuni : data.selectedMunicipalities?.length ? data.selectedMunicipalities : selectedZoneNames.length ? selectedZoneNames : [data.cityName || mainAreaLabel].filter(Boolean);
      const munRec = kpis.recommendedFlyers || requiredQty || null;
      const munCov = kpis.coverage ?? (svcType === "d2d" ? 100 : null);
      return muns.map((name, i) => ({
        name: step4AreaLabel(name),
        status: "Selezionato – copertura completa",
        estimatedFlyers: munRec != null ? Math.round(munRec / muns.length) : null,
        coveragePct: munCov,
        contributionPct: Math.round(100 / muns.length)
      }));
    }
    return breakdownRows.map(row => ({
      name: row.name,
      status: row.selectedRow ? row.alloc?.allocationStatus === "full" || row.coveragePercent >= 100 ? "Selezionato – copertura completa" : "Selezionato – copertura parziale" : "Non coperto dal budget attuale",
      estimatedFlyers: row.estimatedFlyers,
      coveragePct: row.coveragePercent,
      contributionPct: row.contribution
    }));
  })();
  const pdfPlanningRows = selDays.map(k => {
    const p = pairsData[k] || null;
    const pts = k.split("-");
    return {
      date: `${pts[2]} ${MONTHS_SHORT[parseInt(pts[1], 10) - 1]}`,
      pair: p
    };
  });
  const quotePdfData = {
    quoteId: data.quoteId || data.id,
    generatedAt: new Date().toISOString(),
    status: sent ? "Preventivo confermato" : isQuick ? "Stima indicativa" : "Preventivo stimato",
    service: tLabel,
    campaign: {
      variant: svcType === "d2d" ? data.distributionVariant || data.residentialType || data.coverageType || "Copertura residenziale" : null,
      quantity: flyerQty,
      format: (data.flyerFormat || data.format || "").toUpperCase(),
      grammage: flyW !== "-" ? flyW : null,
      materialStatus: alreadyPrinted ? "già stampato" : "Da produrre",
      graphicStatus: data.graphicsReady === true || data.designReady === true ? "File disponibile" : data.needGraphic || productionServices.includes("grafica") ? "File da preparare" : "Non specificato",
      plan: subL,
      campaignsPerMonth: data.subscription && data.subscription !== "single" ? data.campaignsPerMonth || 1 : null,
      duration: data.subscription && data.subscription !== "single" ? subL : null,
      areaMode: data.areaMode || null
    },
    business: isB2B ? {
      targets: (data.distributionTargets || []).map(businessCategoryLabel),
      objective: businessOptionLabel(BUSINESS_OBJECTIVES, data.businessCampaignObjective),
      deliveryMethod: businessOptionLabel(BUSINESS_DELIVERY_METHODS, data.businessDeliveryMethod),
      preferredRecipient: businessOptionLabel(BUSINESS_RECIPIENTS, data.businessPreferredRecipient),
      selectedActivities: (data.selectedOperationalPois || []).map(point => ({
        name: point.name,
        category: point.category,
        address: point.address || null,
        copies: point.copies ?? null,
        source: point.source || null
      })),
      materialPlan: step4BusinessMaterialPlan,
      operationalPlan: step4BusinessOperationalPlan,
      proofs: (data.businessProofs || []).map(value => businessOptionLabel(BUSINESS_PROOF_OPTIONS, value)),
      materialLocation: businessOptionLabel(BUSINESS_MATERIAL_LOCATIONS, data.businessMaterialLocation),
      preferredPeriod: [data.businessPreferredStartDate, data.businessCompleteBy].filter(Boolean).join(" → ") || null,
      notes: data.businessNotes || null
    } : null,
    area: {
      mainArea: mainAreaLabel,
      areaMode: data.areaMode || "comune",
      selectedCaps: data.selectedCaps || [],
      capAnalysis: data.capAnalysis || [],
      radiusKm: isMunicipalityMode || data.areaMode === "cap" ? null : data.radius,
      coveredAreaKm2: kpis.area || (selZ.length ? Math.round(selZ.reduce((a, z) => a + z.area, 0) * 10) / 10 : null),
      selectedMunicipalities: selectedZoneNames,
      selectionMode: data.allocationMode === "manual" ? "Manuale" : "Auto"
    },
    outputs: {
      estimatedFamilies: svcType === "d2d" ? kpis.families ?? totF : null,
      estimatedPopulation: svcType === "d2d" ? kpisPopulation : null,
      estimatedCoverage: svcType === "d2d" ? kpis.coverage ?? avgCov : null,
      recommendedFlyers: svcType === "d2d" ? requiredQty ?? null : null,
      fullCoverageFlyers: svcType === "d2d" ? requiredQty ?? null : null,
      insertedFlyers: flyerQty,
      remainingFlyers: quantityIsSufficient ? remainingQty : 0,
      missingFlyers: missingQty,
      coverageStatus: quantityIsSufficient ? "sufficient" : "partial",
      selectedActivities: isB2B ? step4BusinessMaterialPlan?.selectedActivities : null,
      materialsRequired: isB2B ? step4BusinessMaterialPlan?.materialsRequired : null,
      materialsRemaining: isB2B ? step4BusinessMaterialPlan?.materialsRemaining : null,
      materialsMissing: isB2B ? step4BusinessMaterialPlan?.materialsMissing : null
    },
    coverageStrategy,
    quantityExplanation: quantityIsSufficient ? coverageStrategy === "extra_frequency" && hasSurplusQty ? "Il comune selezionato risulta coperto al 100%. La quantità eccedente sarà utilizzata per rinforzare la distribuzione nelle zone a maggiore densità o secondo passaggio operativo." : "La quantità consigliata copre l'area selezionata. Eventuali volantini residui possono essere usati per ampliare il raggio, aggiungere comuni vicini o mantenere una scorta operativa." : `La quantità inserita non copre completamente l'area selezionata. Mancano ${missingQty.toLocaleString("it-IT", {
      useGrouping: true
    })} volantini per raggiungere la copertura stimata.`,
    municipalities: pdfMunicipalities,
    scores: (serviceSummaryConfig.scores || []).filter(s => s?.v != null).map(s => ({
      label: s.l,
      value: s.v,
      description: s.d
    })),
    adminInfo: (serviceSummaryConfig.admin || []).filter(i => i?.v).map(i => ({
      label: i.l,
      value: i.v
    })),
    omi: svcType === "d2d" && step4Omi?.available ? {
      municipality: step4Omi.municipality,
      zone_name: step4Omi.zone_name,
      values: step4Omi.values || [],
      source: step4Omi.source || "Agenzia delle Entrate – OMI"
    } : null,
    extras: selectedExtras.map(e => ({
      id: e.id,
      label: e.label,
      description: e.description,
      price: e.price,
      status: e.status === "included" ? "Incluso" : "Selezionato"
    })),
    aiAnalysis: {
      enabled: selectedExtras.some(e => e.id === "ai_analysis"),
      serviceType: svcType,
      mainArea: mainAreaLabel
    },
    planning: {
      selectedDates: pdfPlanningRows.map(r => r.date),
      availabilityLabel: disc > 0 ? "Smart Pairing confermato dal backend" : "Smart Pairing non disponibile per questa configurazione.",
      smartPairingApplied: disc > 0,
      smartPairingDiscountPct: disc > 0 ? disc : null,
      operationalWaypoints: plannedGpsPoints,
      compatibleZone: pdfPlanningRows.find(r => r.pair)?.pair ? `${pdfPlanningRows.find(r => r.pair).pair.zone} – ${pdfPlanningRows.find(r => r.pair).pair.type === "same" ? "stessa zona" : "zona vicina"}` : null
    },
    pricing: {
      lines: [{
        label: `Distribuzione ${tLabel}`,
        detail: `${flyerQty.toLocaleString("it-IT", {
          useGrouping: true
        })} ${isB2B ? "materiali" : "volantini"}  - ${eur4(unitPricePerFlyer)}`,
        quantity: flyerQty,
        unitPrice: unitPricePerFlyer,
        total: baseCost
      }],
      subtotal: baseCost,
      extras: selectedExtras.map(e => ({
        label: e.label,
        amount: e.price,
        status: e.status
      })),
      discounts: [disc > 0 ? {
        label: `Smart Pairing -${disc}%`,
        amount: smartPairingDiscount,
        percentage: disc
      } : null, subDiscPct > 0 ? {
        label: `Piano -${subDiscPct}%`,
        amount: planDiscountAmount,
        percentage: subDiscPct
      } : null].filter(Boolean),
      total
    },
    sources: svcType === "d2d" ? d2dSummarySources : serviceSummaryConfig.sources || []
  };
  function handleDownloadPdf() {
    if (pdfBusy) return;
    console.info("[QUOTE_PDF_BUTTON_CLICKED]", {
      area: mainAreaLabel
    });
    console.info("[QUOTE_PDF_DATA_SOURCE]", {
      source: "step4_quote_data",
      areaMode: data.areaMode || data.searchMode || null
    });
    if (import.meta.env.DEV) {
      console.log("[PDF_QUOTE_DATA_SOURCE]", {
        mode: data.searchMode,
        areaMode: data.areaMode
      });
      console.log("[PDF_MODE]", isMunicipalityMode ? "municipality" : "radius");
      console.log("[PDF_FINAL_AREA]", quotePdfData.area?.mainArea);
      console.log("[PDF_FINAL_COMMUNES]", quotePdfData.area?.selectedMunicipalities);
      console.log("[PDF_FINAL_FAMILIES]", quotePdfData.outputs?.estimatedFamilies);
      console.log("[PDF_FINAL_RECOMMENDED_FLYERS]", quotePdfData.outputs?.recommendedFlyers);
      console.log("[PDF_SELECTED_EXTRAS]", quotePdfData.extras?.map(e => e.id));
      console.log("[PDF_TOTAL]", quotePdfData.pricing?.total);
      console.log("[PDF_COVERAGE_STRATEGY]", quotePdfData.coverageStrategy);
    }
    setPdfBusy(true);
    setPdfError("");
    try {
      printQuotePdf(quotePdfData);
      console.info("[QUOTE_PDF_GENERATED]", {
        fileName: pdfFileName,
        area: quotePdfData.area?.mainArea
      });
    } catch (err) {
      console.warn("[QUOTE_PDF_ERROR]", {
        message: err?.message || String(err)
      });
      setPdfError("Non è stato possibile aprire il preventivo. Controlla che i popup siano abilitati.");
    } finally {
      setPdfBusy(false);
    }
  }
  function redirectToLoginAfterExpiredSession() {
    try {
      localStorage.setItem("volantinipro_return_to", "step4");
      localStorage.setItem("volantinipro_pending_action", "confirm_campaign");
      localStorage.setItem("volantinipro_pending_campaign_draft", JSON.stringify(data));
    } catch {}
    console.warn("[CAMPAIGN_SAVE_BLOCKED_EXPIRED_SESSION]");
    console.warn("[AUTH_RELOGIN_REQUIRED]", {
      returnTo: "step4"
    });
    setCampaignSaveError(AUTH_EXPIRED_MESSAGE);
    setConfirmSyncStatus(AUTH_EXPIRED_MESSAGE);
    setShowLoginRequired(true);
    setSent(false);
    setSavingCampaign(false);
    const u = "login?context=customer&returnTo=" + encodeURIComponent("/configuratore?step=4");
    if (onNav) onNav(u);
    else if (onHome) onHome(u);
    else window.location.href = "/" + u;
  }
  async function handleConfirmCampaign() {
    if (!canConfirm || savingCampaign) return;
    setSavingCampaign(true);
    setCampaignSaveError(null);
    setShowLoginRequired(false);
    try {
      if (hasSupabaseConfig() && isStoredSupabaseSessionExpired()) {
        console.warn("[AUTH_TOKEN_EXPIRED]", {
          action: "confirm_campaign"
        });
        clearExpiredSupabaseSession();
        redirectToLoginAfterExpiredSession();
        return;
      }
      if (hasSupabaseConfig()) {
        await ensureRestSessionFromSdk({
          action: "confirm_campaign"
        });
      }
      const session = typeof getStoredSupabaseSession === "function" ? getStoredSupabaseSession() : null;
      const hasValidClientSession = Boolean(session?.accessToken || session?.access_token || cliente?.email && cliente.email !== "dev@volantinipro.local");
      if (!hasValidClientSession && hasSupabaseConfig()) {
        setCampaignSaveError("Per confermare e salvare la campagna devi accedere con email.");
        setShowLoginRequired(true);
        try {
          localStorage.setItem("volantinipro_return_to", "step4");
          localStorage.setItem("volantinipro_pending_action", "confirm_campaign");
          localStorage.setItem("volantinipro_pending_campaign_draft", JSON.stringify(data));
        } catch {}
        setSent(false);
        setSavingCampaign(false);
        return;
      }
      setConfirmSyncStatus(hasSupabaseConfig() ? "Salvataggio campagna in corso..." : "Backend non configurato: puoi scaricare il PDF o inviare una richiesta disponibilità.");
      if (!hasSupabaseConfig()) {
        setSent(true);
        setSavingCampaign(false);
        return;
      }
      const savedCampaign = await saveCampaign({
        service_type: svcType,
        status: "confermata",
        city_name: data.cityName || data.searchedLocation || mainAreaLabel,
        zone_ids: zones,
        flyer_quantity: flyerQty,
        flyer_format: data.flyerFormat,
        start_date: data.startDate || data.campaignPeriodStart || null,
        end_date: data.endDate || data.campaignPeriodEnd || null,
        smart_pairing_discount: disc,
        total_amount: Number(total.toFixed(2)),
        metadata: {
          zona: mainAreaLabel,
          comune: data.cityName || data.comune || selectedZoneNames[0] || null,
          mode: data.searchMode || data.areaMode || "configurator",
          famiglie: estimatedFamiliesForSummary,
          persone: kpisPopulation,
          copertura_pct: coverageForSummary ?? kpis.coverage ?? avgCov ?? null,
          comuni_count: kpisComuniCount,
          selected_comuni: selectedZoneNames,
          volantini_necessari: requiredQty || null,
          volantini_inseriti: flyerQty,
          volantini_extra: remainingQty,
          volantini_mancanti: missingQty,
          formato: data.flyerFormat,
          materiale: alreadyPrinted ? "già stampato" : "Da produrre",
          piano: subL,
          servizi_extra: selectedExtras.map(e => ({
            id: e.id,
            label: e.label,
            price: e.price || 0
          })),
          selected_dates: selDays,
          extra_services: selectedExtras.map(e => e.id),
          pricing: quotePdfData.pricing,
          service_kpis: kpis,
          quote_summary: quotePdfData,
          dashboard_kpis: {
            families: estimatedFamiliesForSummary,
            population: kpisPopulation,
            coverage: coverageForSummary ?? kpis.coverage ?? avgCov ?? null,
            comuniCount: kpisComuniCount,
            requiredFlyers: requiredQty || null
          },
          operational_waypoints: plannedGpsPoints,
          source: data.quickSource || "configurator"
        }
      });
      const savedRow = Array.isArray(savedCampaign) ? savedCampaign[0] : savedCampaign || {};
      const id = savedRow?.id;
      if (!id) {
        setCampaignSaveError("Campagna non salvata. Riprova.");
        setSent(false);
        setSavingCampaign(false);
        return;
      }
      setSavedCampaign(savedRow);
      setSent(true);
      try {
        localStorage.removeItem("volantinipro_return_to");
        localStorage.removeItem("volantinipro_pending_action");
        localStorage.removeItem("volantinipro_pending_campaign_draft");
      } catch {}
      setReturnFromLogin(false);
      sendEmailConferma({
        cliente: {
          email: savedRow.metadata?.client_email || cliente?.email || "",
          nome: savedRow.metadata?.client_name || cliente?.nome || "Cliente"
        },
        campagna: {
          servizio: tLabel,
          zona: mainAreaLabel,
          totale_euro: Number(total.toFixed(2)),
          causale_bonifico: savedRow.causale_bonifico || `VP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(id || "REQ001").slice(0, 6).toUpperCase()}`
        }
      }).catch(err => console.warn("Email conferma bonifico non inviata", err));
      setConfirmSyncStatus(`Campagna salvata su Supabase (${id.slice(0, 8)}).`);
      if (onCampaignSaved) onCampaignSaved(id, "payment");
    } catch (err) {
      setSent(false);
      if (isAuthTokenExpiredError(err)) {
        redirectToLoginAfterExpiredSession();
        return;
      }
      if (String(err?.message || "").includes("Login Supabase richiesto")) {
        setCampaignSaveError("Per confermare e salvare la campagna devi accedere con email.");
        setShowLoginRequired(true);
        setSavingCampaign(false);
        return;
      }
      console.warn("Campaign Supabase save failed", err);
      setCampaignSaveError("Errore durante il salvataggio della campagna: " + (err?.message || "Riprova più tardi."));
      setConfirmSyncStatus("Campagna non salvata: verifica login e variabili ambiente Supabase.");
    } finally {
      setSavingCampaign(false);
    }
  }
  const secHead = (num, label, sub, c = col) => <div style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(255,255,255,.07)"
  }}>
      <div style={{
      width: 28,
      height: 28,
      borderRadius: 8,
      background: c,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: F.sans,
      fontSize: 13,
      fontWeight: 700,
      color: C.white,
      flexShrink: 0
    }}>{num}</div>
      <div>
        <div style={{
        fontFamily: F.serif,
        fontSize: 18,
        color: C.white
      }}>{label}</div>
        <div style={{
        fontFamily: F.sans,
        fontSize: 11,
        color: "rgba(255,255,255,.4)"
      }}>{sub}</div>
      </div>
    </div>;
  return <div style={{
    maxWidth: 1200,
    margin: "0 auto",
    padding: "28px 24px 140px"
  }}>
      <style>{`
        .s4-kpi-card:hover { background: rgba(255,255,255,.07) !important; border-color: rgba(255,255,255,.15) !important; }
        .s4-svc-card { transition: transform .18s ease, box-shadow .18s ease; }
        .s4-svc-card:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,.4); }
        .s4-btn-green:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
        .s4-btn-outline:hover { background: rgba(255,255,255,.07) !important; }
        .s4-step-chip { transition: background .15s; }
      `}</style>
      {activeDemoExtra && <div role="dialog" aria-modal="true" onClick={() => setActiveDemoId(null)} style={{
      position: "fixed",
      inset: 0,
      zIndex: 9000,
      padding: isMobile ? 14 : 28,
      background: "rgba(3,8,18,.78)",
      backdropFilter: "blur(14px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
          <div onClick={event => event.stopPropagation()} style={{
        width: "min(980px, 100%)",
        maxHeight: "90vh",
        overflow: "auto",
        borderRadius: 24,
        background: "linear-gradient(180deg,#101f35 0%,#07111f 100%)",
        border: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 32px 90px rgba(0,0,0,.55)",
        padding: isMobile ? 18 : 26
      }}>
            <div style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 18,
          marginBottom: 18
        }}>
              <div>
                <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              borderRadius: 999,
              background: "rgba(232,87,26,.12)",
              border: "1px solid rgba(232,87,26,.28)",
              color: C.orange,
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 10
            }}>Anteprima demo</div>
                <h2 style={{
              margin: 0,
              fontFamily: F.serif,
              fontSize: isMobile ? 26 : 34,
              color: C.white,
              letterSpacing: "-.8px"
            }}>{activeDemoExtra.label}</h2>
                <p style={{
              margin: "8px 0 0",
              maxWidth: 680,
              fontFamily: F.sans,
              fontSize: 14,
              color: "rgba(255,255,255,.64)",
              lineHeight: 1.6
            }}>{svcCommercial[activeDemoExtra.id]?.demoText || activeDemoExtra.description} Preview basata sulla configurazione attuale: non attiva il servizio, non modifica il prezzo e non mostra dati operativi di una distribuzione gia eseguita.</p>
              </div>
              <button type="button" onClick={() => setActiveDemoId(null)} style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.05)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 20,
            cursor: "pointer",
            flexShrink: 0
          }}>x</button>
            </div>
            {renderExtraDemo(activeDemoExtra)}
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid rgba(255,255,255,.08)"
        }}>
              <button type="button" onClick={() => setActiveDemoId(null)} style={{
            minHeight: 44,
            padding: "0 18px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.15)",
            background: "rgba(255,255,255,.05)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer"
          }}>Chiudi</button>
              {isOptionalExtraSelected(activeDemoExtra) ? <button type="button" onClick={() => removeOptionalExtra(activeDemoExtra)} style={{
            minHeight: 44,
            padding: "0 18px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(255,255,255,.06)",
            color: "rgba(255,255,255,.82)",
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer"
          }}>Rimuovi dal preventivo</button> : <button type="button" onClick={() => addOptionalExtra(activeDemoExtra.addId || activeDemoExtra.id)} style={{
            minHeight: 44,
            padding: "0 18px",
            borderRadius: 10,
            border: "none",
            background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 900,
            cursor: "pointer",
            boxShadow: "0 10px 26px rgba(232,87,26,.32)"
          }}>Aggiungi al preventivo</button>}
            </div>
          </div>
        </div>}
      {/* ── HERO DASHBOARD ── */}
      <div style={{
      borderRadius: 18,
      border: `1px solid ${col}2e`,
      background: `linear-gradient(135deg, ${col}12 0%, rgba(8,15,30,0) 100%)`,
      padding: isMobile ? "18px 16px" : "26px 28px",
      marginBottom: 20
    }}>
        <div style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
        flexWrap: "wrap"
      }}>
          <div style={{
          padding: "4px 12px",
          borderRadius: 100,
          background: `${col}22`,
          border: `1px solid ${col}44`,
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 700,
          color: col
        }}>{cfg.icon} {tLabel}</div>
          {isQuick && <div style={{
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(251,191,36,.12)",
          border: "1px solid rgba(251,191,36,.3)",
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 800,
          color: C.yellow,
          textTransform: "uppercase"
        }}>Stima indicativa</div>}
          {sent && <div style={{
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(46,204,138,.15)",
          border: "1px solid rgba(46,204,138,.35)",
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 800,
          color: C.green
        }}>✓ Campagna confermata</div>}
        </div>
        <div style={{
        fontFamily: F.sans,
        fontSize: 11,
        fontWeight: 800,
        color: col,
        textTransform: "uppercase",
        letterSpacing: ".1em",
        marginBottom: 8
      }}>La tua campagna è pronta</div>
        <div style={{
        fontFamily: F.serif,
        fontSize: isMobile ? 26 : 38,
        color: C.white,
        letterSpacing: "-1.2px",
        marginBottom: 12,
        lineHeight: 1.05
      }}>{mainAreaLabel || "Preventivo completo"}</div>
        {svcType === "d2d" ? <div style={{
        fontFamily: F.sans,
        fontSize: isMobile ? 13 : 15,
        color: "rgba(255,255,255,.75)",
        marginBottom: 20,
        lineHeight: 1.65,
        maxWidth: 680
      }}>
            Con questa configurazione raggiungerai circa{" "}
            <strong style={{
          color: C.green
        }}>{formatNumber(kpis.families ?? totF)} famiglie</strong>
            {selectedZoneNames.length > 1 && <>{" "}distribuite in <strong style={{
            color: col
          }}>{selectedZoneNames.length} comuni</strong></>}
            {", "}coprendo{" "}
            <strong style={{
          color: C.green
        }}>{pctToFraction(kpis.coverage ?? avgCov)}</strong>
            {" "}dell'area selezionata{" "}
            <span style={{
          color: "rgba(255,255,255,.45)",
          fontSize: isMobile ? 12 : 13
        }}>({kpis.coverage ?? avgCov}%)</span>.
          </div> : svcType === "h2h" ? <div style={{
        fontFamily: F.sans,
        fontSize: isMobile ? 13 : 15,
        color: "rgba(255,255,255,.75)",
        marginBottom: 20,
        lineHeight: 1.65
      }}>
            Campagna Hand to Hand su <strong style={{
          color: col
        }}>{mainAreaLabel}</strong>{" "}
            con <strong style={{
          color: C.blue
        }}>{formatNumber(kpis.poi)} punti di interesse</strong> e{" "}
            <strong style={{
          color: C.purple
        }}>{formatNumber(kpis.hotspotCount)} hotspot</strong> ad alto passaggio.
          </div> : <div style={{
        fontFamily: F.sans,
        fontSize: isMobile ? 13 : 15,
        color: "rgba(255,255,255,.75)",
        marginBottom: 20,
        lineHeight: 1.65
      }}>
            Campagna Business Distribution su <strong style={{
          color: col
        }}>{mainAreaLabel}</strong>{" "}
            con <strong style={{
          color: C.purple
        }}>{formatNumber(kpis.businesses)} attività</strong> rilevate nel territorio.
          </div>}
        <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${isMobile ? 2 : Math.min(5, 2 + (svcType === "d2d" ? 2 : 1))}, 1fr)`,
        gap: 12,
        marginBottom: 20
      }}>
          {svcType === "d2d" && <>
            <div style={{
            padding: "16px 14px",
            background: "rgba(46,204,138,.08)",
            borderRadius: 16,
            border: "1px solid rgba(46,204,138,.25)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.15)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.45)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: ".06em"
            }}>Famiglie</div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 34,
              fontWeight: 900,
              color: C.green,
              letterSpacing: "-1px",
              lineHeight: 1
            }}>{formatNumber(kpis.families ?? totF) || "—"}</div>
            </div>
            <div style={{
            padding: "16px 14px",
            background: `${col}12`,
            borderRadius: 16,
            border: `1px solid ${col}35`,
            boxShadow: "0 4px 15px rgba(0,0,0,0.15)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.45)",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: ".06em"
            }}>Copertura</div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 34,
              fontWeight: 900,
              color: col,
              letterSpacing: "-1px",
              lineHeight: 1
            }}>{kpis.coverage ?? avgCov}%</div>
            </div>
          </>}
          {isH2H && <>
            <div style={{
            padding: "16px 14px",
            background: "rgba(96,165,250,.08)",
            borderRadius: 16,
            border: "1px solid rgba(96,165,250,.25)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.15)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.45)",
              marginBottom: 6,
              textTransform: "uppercase"
            }}>POI</div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 34,
              fontWeight: 900,
              color: C.blue,
              letterSpacing: "-1px",
              lineHeight: 1
            }}>{formatNumber(kpis.poi) || "—"}</div>
            </div>
            <div style={{
            padding: "16px 14px",
            background: "rgba(167,139,250,.08)",
            borderRadius: 16,
            border: "1px solid rgba(167,139,250,.25)",
            boxShadow: "0 4px 15px rgba(0,0,0,0.15)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: "rgba(255,255,255,.45)",
              marginBottom: 6,
              textTransform: "uppercase"
            }}>Hotspot</div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 34,
              fontWeight: 900,
              color: C.purple,
              letterSpacing: "-1px",
              lineHeight: 1
            }}>{formatNumber(kpis.hotspotCount) || "—"}</div>
            </div>
          </>}
          <div style={{
          padding: "14px 12px",
          background: "rgba(255,255,255,.025)",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.07)"
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,.35)",
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>Comuni</div>
            <div style={{
            fontFamily: F.serif,
            fontSize: 28,
            fontWeight: 900,
            color: "rgba(255,255,255,.72)",
            letterSpacing: "-1px",
            lineHeight: 1
          }}>{selectedZoneNames.length || "—"}</div>
          </div>
          <div style={{
          padding: "14px 12px",
          background: "rgba(255,255,255,.025)",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.07)"
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,.35)",
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>Volantini</div>
            <div style={{
            fontFamily: F.serif,
            fontSize: 28,
            fontWeight: 900,
            color: "rgba(255,255,255,.8)",
            letterSpacing: "-1px",
            lineHeight: 1
          }}>{flyerQty >= 1000 ? (flyerQty / 1000).toFixed(0) + "k" : flyerQty}</div>
          </div>
          <div style={{
          padding: "16px 14px",
          background: `${col}18`,
          borderRadius: 16,
          border: `1px solid ${col}55`,
          boxShadow: `0 6px 24px ${col}30`
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(255,255,255,.55)",
            marginBottom: 5,
            textTransform: "uppercase",
            letterSpacing: ".06em"
          }}>Prezzo finale</div>
            <div style={{
            fontFamily: F.serif,
            fontSize: isMobile ? 28 : 38,
            fontWeight: 900,
            color: col,
            letterSpacing: "-1.5px",
            lineHeight: 1
          }}>{eur(total)}</div>
          </div>
        </div>
        {(selectedExtras.length > 0 || disc > 0) && <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6
      }}>
            {selectedExtras.map(e => <span key={e.id} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.1)",
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 600,
          color: "rgba(255,255,255,.72)"
        }}>{e.icon && <Step1Icon name={e.icon} size={11} color="rgba(255,255,255,.72)" />} {e.label}</span>)}
            {disc > 0 && <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(46,204,138,.1)",
          border: "1px solid rgba(46,204,138,.25)",
          fontFamily: F.sans,
          fontSize: 10,
          fontWeight: 700,
          color: C.green
        }}><Step1Icon name="link" size={11} color={C.green} /> Smart Pairing -{disc}%</span>}
            {selDays.length > 0 && <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(255,255,255,.05)",
          border: "1px solid rgba(255,255,255,.09)",
          fontFamily: F.sans,
          fontSize: 10,
          color: "rgba(255,255,255,.55)"
        }}><Step1Icon name="calendar" size={11} color="rgba(255,255,255,.55)" /> {selectedDatesLabel}</span>}
          </div>}
      </div>

      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 290px",
      gap: 16,
      paddingBottom: isMobile ? 96 : 0
    }}>
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
          <div style={{
          ...box(),
          padding: "18px"
        }}>
            {secHead("1", "Tipo campagna", "Servizio, volantino, quantità, piano", sectionAccent)}
            <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))",
            gap: 8
          }}>
              {nonEmpty([{
              icon: cfg.icon,
              l: "Servizio",
              v: tLabel,
              c: col
            }, svcType === "d2d" && {
              icon: "",
              l: "Variante",
              v: data.distributionVariant || data.residentialType || data.coverageType || "Copertura residenziale",
              c: "#6366F1"
            }, {
              icon: "",
              l: "Zona/Comune",
              v: mainAreaLabel || "-",
              c: C.white
            }, {
              icon: "",
              l: "quantità",
              v: flyerQty.toLocaleString("it-IT", {
                useGrouping: true
              }) + " pz.",
              c: C.white
            }, {
              icon: "",
              l: "Formato",
              v: (data.flyerFormat || data.format || "-").toUpperCase(),
              c: C.green
            }, {
              icon: "",
              l: "Materiale",
              v: alreadyPrinted ? "già stampato" : "Da produrre",
              c: alreadyPrinted ? C.green : C.blue
            }, !alreadyPrinted && {
              icon: "",
              l: "Grammatura",
              v: flyW,
              c: C.green
            }, {
              icon: "",
              l: "Grafica",
              v: data.graphicsReady === true || data.designReady === true ? "File già disponibile" : data.needGraphic || productionServices.includes("grafica") ? "File da preparare" : null,
              c: C.purple
            }, {
              icon: "printer",
              l: "Stampa",
              v: data.printing?.enabled ? "Inclusa" : "Non inclusa",
              c: data.printing?.enabled ? C.green : C.white
            }, data.printing?.enabled && data.printing?.format && {
              icon: "",
              l: "Formato stampa",
              v: data.printing.format,
              c: C.white
            }, data.printing?.enabled && data.printing?.paperType && {
              icon: "",
              l: "Tipo carta",
              v: {
                patinata_lucida: "Patinata lucida",
                patinata_opaca: "Patinata opaca",
                uso_mano: "Uso mano"
              }[data.printing.paperType] || data.printing.paperType,
              c: C.white
            }, data.printing?.enabled && data.printing?.sides && {
              icon: "",
              l: "Lati",
              v: data.printing.sides === "fronte_retro" ? "Fronte/retro" : "Solo fronte",
              c: C.white
            }, data.printing?.enabled && data.printing?.color && {
              icon: "",
              l: "Colore",
              v: data.printing.color === "bianco_nero" ? "Bianco/nero" : "Colori",
              c: C.white
            }, data.printing?.enabled && data.printing?.folding && {
              icon: "",
              l: "Piega",
              v: {
                nessuna: "Nessuna",
                meta: "A metà",
                tre: "A tre"
              }[data.printing.folding] || data.printing.folding,
              c: C.white
            }, data.printing?.enabled && data.printing?.artworkStatus && {
              icon: "",
              l: "File grafico stampa",
              v: data.printing.artworkStatus === "pronto" ? "Già pronto" : "Da creare",
              c: C.white
            }, data.printing?.enabled && {
              icon: "",
              l: "Prezzo stampa",
              v: selectedExtras.find(e => e.id === "printing") ? `+${selectedExtras.find(e => e.id === "printing").price}€` : "Da confermare",
              c: C.orange
            }, isH2H && {
              icon: "",
              l: "Promoter",
              v: data.promoterCount || 1,
              c: C.blue
            }, isH2H && {
              icon: "",
              l: "Punti operativi",
              v: data.operationalPoints?.length || 1,
              c: C.blue
            }, isH2H && {
              icon: "",
              l: "Capacità turno",
              v: `${Number(data.h2hEstimatedCapacity || kpis.estimatedCapacity || 0).toLocaleString("it-IT")} pz.`,
              c: C.green
            }, isB2B && {
              icon: "",
              l: "Consegna",
              v: B2B_DELIVERY_TYPES.find(o => o.value === data.deliveryType)?.label || "-",
              c: C.purple
            }, {
              icon: "",
              l: "Piano",
              v: subL,
              c: subDiscPct > 0 ? "#6366F1" : C.white
            }, data.subscription && data.subscription !== "single" && {
              icon: "",
              l: "Campagne/mese",
              v: data.campaignsPerMonth || 1,
              c: "#6366F1"
            }, data.subscription && data.subscription !== "single" && {
              icon: "",
              l: "Durata",
              v: subL,
              c: "#6366F1"
            }, data.subscription && data.subscription !== "single" && {
              icon: "",
              l: "quantità/campagna",
              v: flyerQty.toLocaleString("it-IT", {
                useGrouping: true
              }) + " pz.",
              c: C.white
            }, data.subscription && data.subscription !== "single" && {
              icon: "",
              l: "Area piano",
              v: data.recurringAreaMode || "Area fissa",
              c: C.white
            }, data.subscription && data.subscription !== "single" && {
              icon: "",
              l: "Calendario",
              v: data.recurringCalendarMode || "Flessibile",
              c: C.white
            }]).map(({
              icon,
              l,
              v,
              c
            }) => <div key={l} style={{
              padding: "10px 11px",
              background: "rgba(255,255,255,.04)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.055)"
            }}>
                  <div style={{
                display: "flex",
                gap: 5,
                alignItems: "center",
                marginBottom: 4
              }}>
                    <Step1Icon name={icon} size={11} color={c} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.3)",
                  textTransform: "uppercase"
                }}>{l}</span>
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 600,
                color: c
              }}>{v}</div>
                </div>)}
            </div>
          </div>

          <div style={{
          ...box(),
          padding: "18px"
        }}>
            {secHead("2", "Famiglie e copertura", "Quante persone raggiungerai con questa campagna", sectionAccent)}
            {isQuick ? <div style={{
            padding: "14px",
            borderRadius: 10,
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.06)",
            fontFamily: F.sans,
            fontSize: 12,
            color: "rgba(255,255,255,.42)",
            lineHeight: 1.55
          }}>
                Preventivo rapido: il dettaglio completo sarà disponibile dopo l'analisi zona completa.
              </div> : <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>

                {/* ── KPI essenziali ── */}
                <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2,1fr)",
              gap: 10
            }}>
                  {svcType === "d2d" && [{
                icon: "home",
                l: "Famiglie stimate nell'area",
                sub: "Stima territoriale GIS/NIL",
                v: formatNumber(kpis.families ?? totF),
                c: C.green
              }, {
                icon: "family",
                l: "Persone stimate",
                sub: "Stima su base ISTAT",
                v: formatNumber(Math.round((kpis.families ?? totF) * 2.4)),
                c: C.white
              }, {
                icon: "pin",
                l: "Comuni coinvolti",
                sub: selectedZoneNames.slice(0, 2).join(", ") + (selectedZoneNames.length > 2 ? ` +${selectedZoneNames.length - 2}` : ""),
                v: `${selectedZoneNames.length || "—"}`,
                c: col
              }, {
                icon: "chart",
                l: "Copertura dell'area",
                sub: pctToFraction(kpis.coverage ?? avgCov) || `${flyerQty.toLocaleString("it-IT", {
                  useGrouping: true
                })} volantini`,
                v: `${kpis.coverage ?? avgCov}%`,
                c: C.green
              }].map(({
                icon,
                l,
                sub,
                v,
                c
              }) => <div key={l} className="s4-kpi-card" style={{
                padding: "16px 14px",
                background: "rgba(255,255,255,.04)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.07)",
                transition: "background .18s, border-color .18s",
                cursor: "default"
              }}>
                      <div style={{
                  marginBottom: 9
                }}><Step1Icon name={icon} size={22} color={c} /></div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 24,
                  color: c,
                  letterSpacing: "-.5px",
                  marginBottom: 3
                }}>{v || "—"}</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.75)",
                  marginBottom: 3
                }}>{l}</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.32)",
                  lineHeight: 1.4
                }}>{sub}</div>
                    </div>)}
                  {svcType === "h2h" && [{
                icon: "",
                l: "POI rilevanti",
                v: formatNumber(kpis.poi),
                c: C.blue
              }, {
                icon: "",
                l: "Hotspot",
                v: formatNumber(kpis.operationalZones || kpis.hotspotCount),
                c: C.purple
              }, {
                icon: "",
                l: "Waypoint GPS",
                v: formatNumber(kpis.gpsWaypoints || plannedGpsPoints.length),
                c: col
              }, {
                icon: "",
                l: "Quantità assegnata",
                v: flyerQty.toLocaleString("it-IT", {
                  useGrouping: true
                }) + " pz.",
                c: C.white
              }].map(({
                icon,
                l,
                v,
                c
              }) => <div key={l} style={{
                padding: "14px 13px",
                background: "rgba(255,255,255,.04)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.36)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 5
                }}>{icon} {l}</div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: c,
                  letterSpacing: "-.5px"
                }}>{v || "—"}</div>
                    </div>)}
                  {isB2B && [{
                icon: "",
                l: "Attività rilevate",
                v: formatNumber(kpis.businesses),
                c: C.purple
              }, {
                icon: "",
                l: "Cluster commerciali",
                v: formatNumber(kpis.clusters),
                c: col
              }, {
                icon: "",
                l: "Attività target",
                v: formatNumber(kpis.targetBusinesses),
                c: C.green
              }, {
                icon: "",
                l: "Quantità assegnata",
                v: flyerQty.toLocaleString("it-IT", {
                  useGrouping: true
                }) + " pz.",
                c: C.white
              }].map(({
                icon,
                l,
                v,
                c
              }) => <div key={l} style={{
                padding: "14px 13px",
                background: "rgba(255,255,255,.04)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.36)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 5
                }}>{icon} {l}</div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: c,
                  letterSpacing: "-.5px"
                }}>{v || "—"}</div>
                    </div>)}
                </div>

                {/* ── Zona e comuni ── */}
                {selectedZoneNames.length > 0 && <div style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(255,255,255,.035)",
              border: "1px solid rgba(255,255,255,.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start"
            }}>
                    <div style={{
                display: "flex",
                gap: 10,
                alignItems: "center"
              }}>
                      <Step1Icon name="pin" size={18} color={C.white} />
                      <div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.white
                  }}>
                          {selectedZoneNames.length === 1 ? selectedZoneNames[0] : `${selectedZoneNames[0]} · ${selectedZoneNames.length} aree`}
                        </div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.5)"
                  }}>
                          {selectedZoneNames.length === 1 ? "Area principale selezionata" : "Riepilogo aree di distribuzione"}
                        </div>
                      </div>
                    </div>
                    {selectedZoneNames.length > 1 && <button type="button" onClick={() => setShowStep4Zones(!showStep4Zones)} style={{
                background: "none",
                border: "none",
                color: "#E8571A",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                padding: "4px 8px"
              }}>
                        {showStep4Zones ? "▲ Nascondi elenco" : "• Visualizza elenco"}
                      </button>}
                  </div>}
                {showStep4Zones && selectedZoneNames.length > 1 && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: "auto"
            }} transition={{
              duration: 0.2
            }} style={{
              padding: "12px 16px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.06)",
              fontSize: 12,
              color: "#CBD5E1",
              maxHeight: 150,
              overflowY: "auto",
              lineHeight: 1.6
            }}>
                    {selectedZoneNames.join(" · ")}
                  </motion.div>}

                {/* ── Stato quantità ── */}
                {svcType === "d2d" && requiredQty > 0 && (quantityIsSufficient ? <div style={{
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(46,204,138,.08)",
              border: "1px solid rgba(46,204,138,.25)",
              display: "flex",
              gap: 12,
              alignItems: "center"
            }}>
                      <span style={{
                color: C.green,
                fontWeight: 900,
                fontSize: 22
              }}>✓</span>
                      <div>
                        <div style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 800,
                  color: C.green,
                  marginBottom: 2
                }}>Copertura completa</div>
                        <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.65)",
                  lineHeight: 1.45
                }}>
                          Avanzano {remainingQty.toLocaleString("it-IT", {
                    useGrouping: true
                  })} volantini come scorta operativa per eventuali reintegri o punti ad alta densità.
                        </div>
                      </div>
                    </div> : <div style={{
              padding: "20px",
              borderRadius: 16,
              background: "linear-gradient(135deg, rgba(232,87,26,0.12) 0%, rgba(180,60,10,0.04) 100%)",
              border: "2px solid #E8571A",
              boxShadow: "0 8px 24px rgba(232,87,26,0.2)"
            }}>
                      <div style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                marginBottom: 16
              }}>
                        <Step1Icon name="chart" size={26} color={C.white} style={{
                  flexShrink: 0
                }} />
                        <div>
                          <div style={{
                    fontFamily: F.sans,
                    fontSize: 15,
                    fontWeight: 900,
                    color: C.white,
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: ".04em"
                  }}>Copertura parziale stimata al {kpis.coverage ?? avgCov}%</div>
                          <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: "rgba(255,255,255,.8)",
                    lineHeight: 1.6
                  }}>
                            Con la quantità attuale raggiungerai circa il <strong style={{
                      color: C.white
                    }}>{kpis.coverage ?? avgCov}%</strong> delle famiglie nella zona selezionata.<br />
                            <div style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      background: "rgba(232,87,26,0.2)",
                      borderRadius: 8,
                      borderLeft: "3px solid #E8571A",
                      fontSize: 14,
                      fontWeight: 800,
                      color: "#FFA17A"
                    }}>
                              Servono ancora {missingQty.toLocaleString("it-IT", {
                        useGrouping: true
                      })} volantini per coprire l'intera area.
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr",
                gap: 12
              }}>
                        <button onClick={() => onHome("step1")} style={{
                  padding: "14px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 4px 15px rgba(232,87,26,0.4)",
                  transition: "all .2s"
                }}>
                          ↑ Aumenta quantità (Consigliato)
                        </button>
                        <button style={{
                  padding: "14px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.75)",
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer"
                }}>
                          ✓ Mantieni copertura al {kpis.coverage ?? avgCov}%
                        </button>
                      </div>
                    </div>)}


              {/* ── AI Advisory Card ── */}
              {!isQuick && (() => {
              const cov = kpis.coverage ?? avgCov;
              const flyersFor40 = requiredQty > 0 && cov < 40 ? Math.max(0, Math.round(requiredQty * 0.4) - flyerQty) : 0;
              const rating = quantityIsSufficient && cov >= 70 ? "★★★★★ Ottima" : quantityIsSufficient || cov >= 40 ? "★★★★☆ Buona" : "★★★☆☆ Base";
              const ratingCol = quantityIsSufficient && cov >= 70 ? C.green : quantityIsSufficient || cov >= 40 ? "#F59E0B" : col;
              const tips = [quantityIsSufficient ? `Configurazione coerente: la quantità copre l'intera area selezionata.` : `Copertura parziale: ${missingQty.toLocaleString("it-IT", {
                useGrouping: true
              })} volantini aggiuntivi porterebbero alla copertura completa.`, `Budget adeguato per ${selectedZoneNames.length > 1 ? `${selectedZoneNames.length} comuni selezionati` : mainAreaLabel}.`, disc > 0 ? `Smart Pairing attivo: stai risparmiando il ${disc}% grazie a campagne compatibili in zona.` : selDays.length > 0 ? "Smart Pairing non disponibile per questo periodo — la data scelta non ha campagne compatibili." : "Smart Pairing: nessuna campagna compatibile al momento nella tua zona.", flyersFor40 > 0 ? `Per superare il 40% di copertura servono circa ${flyersFor40.toLocaleString("it-IT", {
                useGrouping: true
              })} volantini aggiuntivi.` : cov >= 40 ? "Copertura iniziale buona per misurare l'efficacia della campagna nel territorio." : "Copertura base: ideale per un primo test dell'area prima di scalare."];
              return <motion.div initial={{
                opacity: 0,
                y: 10
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                duration: 0.2
              }} style={{
                padding: "18px",
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(46,204,138,0.07) 0%, rgba(99,102,241,0.04) 100%)",
                border: "1px solid rgba(46,204,138,0.2)",
                marginTop: 4
              }}>
                    <div style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 14
                }}>
                      <Step1Icon name="robot" size={20} color={C.white} />
                      <div style={{
                    fontFamily: F.serif,
                    fontSize: 17,
                    color: C.white,
                    letterSpacing: "-.2px"
                  }}>Consiglio VolantiniPro AI</div>
                    </div>
                    <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginBottom: 14
                }}>
                      {tips.map((tip, i) => <div key={i} style={{
                    display: "flex",
                    gap: 9,
                    alignItems: "flex-start"
                  }}>
                          <span style={{
                      color: C.green,
                      fontSize: 12,
                      lineHeight: "18px",
                      flexShrink: 0
                    }}>✓</span>
                          <span style={{
                      fontFamily: F.sans,
                      fontSize: 13,
                      color: "rgba(255,255,255,.72)",
                      lineHeight: 1.55
                    }}>{tip}</span>
                        </div>)}
                    </div>
                    <div style={{
                  paddingTop: 12,
                  borderTop: "1px solid rgba(255,255,255,.07)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.38)",
                    textTransform: "uppercase",
                    letterSpacing: ".07em"
                  }}>Livello configurazione</span>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 800,
                    color: ratingCol
                  }}>{rating}</span>
                    </div>
                  </motion.div>;
            })()}

              </div>}
          </div>

          <div style={{
          ...box(),
          padding: "18px"
        }}>
            {secHead("3", isQuick ? "Personalizza il tuo preventivo" : "Servizi inclusi", isQuick ? "Seleziona i servizi extra per la tua campagna" : "Cosa ricevi con questa campagna", sectionAccent)}

            {/* ── Servizi già inclusi — commercial cards ── */}
            {selectedExtras.length === 0 ? <div style={{
            padding: "16px",
            textAlign: "center",
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.05)",
            borderRadius: 10,
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.34)"
          }}>
                Nessun servizio extra selezionato. Scopri le opzioni disponibili qui sotto.
              </div> : <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            marginBottom: 20
          }}>
                {selectedExtras.map(ext => {
              const comm = svcCommercial[ext.id] || {};
              const cardCol = comm.col || (ext.price === 0 && !ext.isUrgent ? C.green : ext.isUrgent ? C.red : C.blue);
              const optionalConfig = optionalExtras.find(opt => opt.id === ext.id);
              return <div key={ext.id} className="s4-svc-card" style={{
                padding: "16px 18px",
                borderRadius: 14,
                background: `${cardCol}08`,
                border: `1px solid ${cardCol}28`,
                display: "flex",
                flexDirection: "column",
                gap: 12
              }}>
                      {/* Header */}
                      <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start"
                }}>
                        <div style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center"
                  }}>
                          <Step1Icon name={comm.icon || ext.icon} size={22} color={cardCol} />
                          <div>
                            <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        marginBottom: 2
                      }}>
                              <div style={{
                          fontFamily: F.serif,
                          fontSize: 16,
                          color: C.white,
                          letterSpacing: "-.2px"
                        }}>{comm.head || ext.label}</div>
                              {comm.badge && <span style={{
                          padding: "2px 7px",
                          borderRadius: 5,
                          background: `${cardCol}22`,
                          border: `1px solid ${cardCol}44`,
                          fontFamily: F.sans,
                          fontSize: 9,
                          fontWeight: 800,
                          color: cardCol,
                          flexShrink: 0
                        }}>{comm.badge}</span>}
                            </div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 9,
                        fontWeight: 700,
                        color: cardCol,
                        textTransform: "uppercase",
                        letterSpacing: ".06em"
                      }}>
                              {ext.price === 0 && !ext.isUrgent ? "Incluso" : ext.isUrgent ? "Servizio urgente" : "Extra selezionato"}
                            </div>
                          </div>
                        </div>
                        <div style={{
                    padding: "4px 10px",
                    borderRadius: 8,
                    background: `${cardCol}18`,
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    color: cardCol,
                    flexShrink: 0
                  }}>
                          {ext.price > 0 ? eur(ext.price) : ext.isUrgent ? "+30%" : "✓"}
                        </div>
                      </div>
                      {/* Benefits */}
                      {comm.bullets && <ul style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6
                }}>
                          {comm.bullets.map((b, i) => <li key={i} style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start"
                  }}>
                              <span style={{
                      color: cardCol,
                      fontSize: 12,
                      flexShrink: 0,
                      lineHeight: "18px"
                    }}>✓</span>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      color: "rgba(255,255,255,.65)",
                      lineHeight: 1.45
                    }}>{b}</span>
                            </li>)}
                        </ul>}
                      {!comm.bullets && ext.description && <p style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.5,
                  margin: 0
                }}>{ext.description}</p>}
                      {optionalConfig && <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  paddingTop: 4
                }}>
                          <button type="button" onClick={() => openExtraDemo(ext)} style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.05)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                            Anteprima
                          </button>
                          <button type="button" onClick={() => removeOptionalExtra(optionalConfig)} style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: 10,
                    border: `1px solid ${cardCol}35`,
                    background: "rgba(255,255,255,.04)",
                    color: "rgba(255,255,255,.76)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                            Rimuovi
                          </button>
                        </div>}
                    </div>;
            })}
              </div>}

            {/* ── Optional non ancora aggiunti ── */}
            {optionalExtras.length > 0 && <div style={{
            marginTop: 24,
            paddingTop: 20,
            borderTop: "1px solid rgba(255,255,255,.08)"
          }}>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,.5)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 12
            }}>Aggiungi servizi facoltativi al preventivo</div>
                <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(280px,1fr))",
              gap: 12
            }}>
                  {optionalExtras.map(ext => {
                const comm = svcCommercial[ext.id] || {};
                const cardCol = comm.col || C.blue;
                const selected = isOptionalExtraSelected(ext);
                return <div key={ext.id} style={{
                  padding: "16px",
                  borderRadius: 14,
                  background: selected ? `${cardCol}0f` : "rgba(255,255,255,.025)",
                  border: `1px solid ${selected ? `${cardCol}45` : "rgba(255,255,255,.08)"}`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 14,
                  transition: "border-color .2s"
                }}>
                        <div>
                          <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 8
                    }}>
                            <div style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center"
                      }}>
                              <Step1Icon name={comm.icon || ext.icon} size={22} color={cardCol} />
                              <div>
                                <div style={{
                            fontFamily: F.serif,
                            fontSize: 16,
                            color: C.white
                          }}>{comm.head || ext.label}</div>
                                <div style={{
                            marginTop: 3,
                            fontFamily: F.sans,
                            fontSize: 10,
                            color: "rgba(255,255,255,.46)",
                            textTransform: "uppercase",
                            letterSpacing: ".08em"
                          }}>Anteprima premium disponibile</div>
                              </div>
                            </div>
                            <span style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        background: "rgba(255,255,255,.08)",
                        border: "1px solid rgba(255,255,255,.16)",
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 800,
                        color: "rgba(255,255,255,.85)"
                      }}>{selected ? "Extra selezionato" : `+${eur(ext.price)}`}</span>
                          </div>
                          <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      color: "rgba(255,255,255,.66)",
                      lineHeight: 1.5,
                      paddingLeft: 32
                    }}>{ext.micro || comm.bullets?.[0] || ext.description}</div>
                          {comm.bullets && <ul style={{
                      listStyle: "none",
                      padding: "10px 0 0 32px",
                      margin: 0,
                      display: "grid",
                      gap: 6
                    }}>
                              {comm.bullets.slice(0, 3).map((b, i) => <li key={i} style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(255,255,255,.62)",
                        lineHeight: 1.45
                      }}>
                                  <span style={{
                          color: cardCol,
                          fontWeight: 900
                        }}>+</span>
                                  <span>{b}</span>
                                </li>)}
                            </ul>}
                        </div>
                        <div style={{
                    display: "grid",
                    gridTemplateColumns: selected ? "1fr 1fr" : "1fr 1.15fr",
                    gap: 8
                  }}>
                          <button type="button" onClick={() => openExtraDemo(ext)} style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,.14)",
                      background: "rgba(255,255,255,.05)",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all .2s"
                    }}>
                            Anteprima
                          </button>
                          {selected ? <button type="button" onClick={() => removeOptionalExtra(ext)} style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: `1px solid ${cardCol}35`,
                      background: "rgba(255,255,255,.04)",
                      color: "rgba(255,255,255,.76)",
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all .2s"
                    }}>
                              Rimuovi
                            </button> : <button type="button" onClick={() => addOptionalExtra(ext.addId || ext.id)} style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: 10,
                      border: `1px solid ${cardCol}40`,
                      background: `${cardCol}12`,
                      color: cardCol,
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      transition: "all .2s"
                    }}>
                              Aggiungi al preventivo
                            </button>}
                        </div>
                      </div>;
              })}
                </div>
              </div>}
          </div>

          {!isQuick && <div style={{
          ...box(),
          padding: "18px"
        }}>
              {secHead("4", "Pianificazione", "Date, Smart Pairing e stato operativo", sectionAccent)}
            {data.smartPairingRequestSent ? <div style={{
            padding: "14px",
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.58)",
            background: "rgba(251,191,36,.06)",
            border: "1px solid rgba(251,191,36,.2)",
            borderRadius: 10,
            lineHeight: 1.6
          }}>
                <b style={{
              color: C.yellow
            }}>Richiesta data diversa inviata.</b><br />
                Periodo preferito: {data.contactRequestData?.periodo || "Dato non disponibile"}<br />
                Ti avviseremo via WhatsApp o email appena disponibile uno slot compatibile.
              </div> : <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
                {/* Status chips con evidenza su Priorità, Periodo, Operatore, Stato */}
                <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
              gap: 10
            }}>
                  {nonEmpty([{
                icon: "calendar",
                l: "Periodo",
                v: selDays.length > 0 ? selectedDatesLabel : "Da definire con il team",
                c: selDays.length > 0 ? C.white : "#A5B4FC",
                highlight: true
              }, {
                icon: "lightning",
                l: "Priorità",
                v: data.urgency === "urgent" ? "URGENTE (+30%)" : "Standard operativa",
                c: data.urgency === "urgent" ? C.red : C.white,
                highlight: data.urgency === "urgent"
              }, {
                icon: "package",
                l: "Stato",
                v: sent ? "CONFERMATA" : "PRONTA PER ATTIVAZIONE",
                c: sent ? C.green : "#E8571A",
                highlight: true
              }, {
                icon: "user",
                l: "Operatore",
                v: "Assegnazione in zona",
                c: C.white,
                highlight: false
              }, {
                icon: "link",
                l: "Smart Pairing",
                v: disc > 0 ? `Attivo (-${disc}%)` : "Non richiesto",
                c: disc > 0 ? C.green : "rgba(255,255,255,.5)",
                highlight: false
              }, selDays.length > 0 && {
                icon: "pin",
                l: "Giornate",
                v: `${selDays.length} ${selDays.length === 1 ? "data confermata" : "date confermate"}`,
                c: col,
                highlight: false
              }]).map(({
                icon,
                l,
                v,
                c,
                highlight
              }) => <div key={l} style={{
                padding: "14px 16px",
                background: highlight ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.025)",
                borderRadius: 14,
                border: `1px solid ${highlight ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.06)"}`,
                boxShadow: highlight ? "0 4px 12px rgba(0,0,0,0.15)" : "none"
              }}>
                      <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6
                }}>
                        <Step1Icon name={icon} size={14} color={c} />
                        <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: "rgba(255,255,255,.45)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em"
                  }}>{l}</span>
                      </div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: highlight ? 14 : 13,
                  fontWeight: highlight ? 800 : 600,
                  color: c
                }}>{v}</div>
                    </div>)}
                </div>

                {/* Giornate con Smart Pairing */}
                {selDays.length > 0 && <div>
                    <div style={{
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                color: "rgba(255,255,255,.28)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginBottom: 8
              }}>Giornate pianificate</div>
                    <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 5
              }}>
                      {selDays.map(k => {
                  const p = pairsData[k] || null;
                  const pts = k.split("-");
                  const isPaired = Boolean(p);
                  return <div key={k} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: p?.type === "same" ? "rgba(46,204,138,.08)" : p ? "rgba(232,87,26,.08)" : "rgba(255,255,255,.03)",
                    border: `1px solid ${p?.type === "same" ? "rgba(46,204,138,.2)" : p ? "rgba(232,87,26,.2)" : "rgba(255,255,255,.07)"}`
                  }}>
                            <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: isPaired ? p.type === "same" ? C.green : C.orange : "rgba(255,255,255,.22)",
                      flexShrink: 0
                    }} />
                            <div style={{
                      flex: 1
                    }}>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.white
                      }}>{pts[2]} {MONTHS_SHORT[parseInt(pts[1])]}</div>
                              {isPaired && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)"
                      }}>Zona compatibile: {p.zone} — {p.type === "same" ? "stessa zona" : "zona vicina"}</div>}
                              {!isPaired && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.35)"
                      }}>Data richiesta — conferma in attesa</div>}
                            </div>
                            {p?.disc > 0 && <span style={{
                      padding: "3px 9px",
                      borderRadius: 100,
                      background: p.type === "same" ? "rgba(46,204,138,.15)" : "rgba(232,87,26,.15)",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      color: p.type === "same" ? C.green : C.orange
                    }}>-{p.disc}%</span>}
                          </div>;
                })}
                    </div>
                  </div>}

                {selDays.length === 0 && <div style={{
              padding: "14px 16px",
              borderRadius: 10,
              background: "rgba(46,204,138,.05)",
              border: "1px solid rgba(46,204,138,.15)",
              display: "flex",
              gap: 12,
              alignItems: "flex-start"
            }}>
                    <Step1Icon name="calendar" size={24} color={C.white} style={{
                flexShrink: 0
              }} />
                    <div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: C.white,
                  marginBottom: 4
                }}>Data da confermare</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.55
                }}>
                        La data verrà concordata con il team operativo entro 24 ore dalla conferma della campagna.
                      </div>
                    </div>
                  </div>}
              </div>}
            </div>}

          {/* ── SEZIONE 5: Analisi tecnica ── */}
          {!isQuick && <div style={{
          ...box(),
          padding: "18px"
        }}>

              {/* Card introduttiva — sempre visibile */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
              <div style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start"
            }}>
                <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(99,102,241,.14)",
                border: "1px solid rgba(99,102,241,.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}><Step1Icon name="chart" size={22} color="#818CF8" /></div>
                <div style={{
                flex: 1
              }}>
                  <div style={{
                  fontFamily: F.serif,
                  fontSize: 19,
                  color: C.white,
                  letterSpacing: "-.2px",
                  marginBottom: 4
                }}>Approfondimenti tecnici</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.52)",
                  lineHeight: 1.55
                }}>
                    I dati di analisi usati per stimare copertura, famiglie e potenziale dell'area. Visibili su richiesta.
                  </div>
                </div>
              </div>

              {/* KPI principali — visibili subito per mantenere la sezione pulita */}
              {!showTechPanel && <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
              gap: 10
            }}>
                  {[{
                label: "Famiglie operative stimate",
                val: formatNumber(kpis.families ?? totF) || "—",
                sub: "Stima territoriale GIS/NIL",
                c: C.green,
                tip: "Stima del fabbisogno e delle famiglie raggiungibili nell'area selezionata su base geografica."
              }, {
                label: "Copertura zona",
                val: `${kpis.coverage ?? avgCov}%`,
                sub: "Percentuale dell'area coperta",
                c: col,
                tip: "Percentuale dell'area raggiungibile con la quantità di volantini scelta. 100% = nessuna famiglia esclusa."
              }, {
                label: "Zone selezionate",
                val: `${selectedZoneNames.length || "—"}`,
                sub: "Aree nella campagna",
                c: C.white,
                tip: "Numero di aree geografiche incluse nella distribuzione. Ogni zona è verificata su mappa."
              }, {
                label: "Affidabilità dati",
                val: "99.4%",
                sub: "Dati territoriali verificati",
                c: C.purple,
                tip: "Indica la precisione dei dati mostrati, basata su fonti ufficiali aggiornate."
              }].map((item, idx) => <div key={idx} style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "rgba(255,255,255,.03)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.45)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  marginBottom: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 3
                }}>
                        {item.label}
                        <KpiTooltip tip={item.tip} color="rgba(255,255,255,0.4)" />
                      </div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  fontWeight: 800,
                  color: item.c,
                  letterSpacing: "-.5px",
                  lineHeight: 1,
                  marginBottom: 2
                }}>{item.val}</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)"
                }}>{item.sub}</div>
                    </div>)}
                </div>}

              {/* Pulsante espansione */}
              <button onClick={() => setShowTechPanel(v => !v)} style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 12,
              border: "1px solid rgba(99,102,241,.35)",
              background: showTechPanel ? "rgba(99,102,241,.15)" : "rgba(99,102,241,.08)",
              color: showTechPanel ? "#A5B4FC" : C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              transition: "all .2s",
              boxShadow: showTechPanel ? "none" : "0 4px 15px rgba(99,102,241,0.15)"
            }}>
                <span style={{
                fontSize: 14
              }}>{showTechPanel ? "▲" : "▼"}</span>
                <span>{showTechPanel ? "Chiudi approfondimenti" : "Analisi avanzata · Mostra dati tecnici"}</span>
              </button>
            </div>

            {/* Contenuto accordion — visibile solo quando aperto */}
            {showTechPanel && <div style={{
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,.07)",
            display: "flex",
            flexDirection: "column",
            gap: 6
          }}>
                {/* Helper: collapsible sub-section */}
                {[{
              key: "kpi",
              label: "KPI",
              icon: "chart",
              content: <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                gap: 8
              }}>
                        {nonEmpty(serviceSummaryConfig.fields || []).map(fieldCard)}
                      </div>
            }, {
              key: "comuni",
              label: step4TerritoryPluralLabel + " nel raggio",
              icon: "map",
              content: breakdownRows.length > 0 ? <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 5
              }}>
                        {breakdownRows.map(row => <div key={row.id} style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  background: row.selectedRow ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)",
                  border: `1px solid ${row.selectedRow ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.04)"}`,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 10,
                  alignItems: "center"
                }}>
                            <div>
                              <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 800,
                      color: row.selectedRow ? C.white : "rgba(255,255,255,.52)"
                    }}>{row.name}</div>
                              <div style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.36)"
                    }}>
                                {row.selectedRow ? row.alloc?.allocationStatus === "full" || row.coveragePercent >= 100 ? "Copertura completa" : "Copertura parziale" : "Non coperto dal budget attuale"}
                              </div>
                            </div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 800,
                    color: row.selectedRow ? col : "rgba(255,255,255,.32)"
                  }}>{row.estimatedFlyers != null ? row.estimatedFlyers.toLocaleString("it-IT", {
                      useGrouping: true
                    }) : "—"}</div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 800,
                    color: row.coveragePercent >= 100 ? C.green : row.coveragePercent != null ? "#F59E0B" : "rgba(255,255,255,.32)"
                  }}>{row.coveragePercent != null ? `${Math.min(100, row.coveragePercent)}%` : "—"}</div>
                            <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.38)"
                  }}>{row.contribution != null ? `${row.contribution}%` : "—"}</div>
                          </div>)}
                      </div> : <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.35)"
              }}>{isComuneMode ? "Nessun comune disponibile." : "Nessun comune nel raggio disponibile."}</div>
            }, {
              key: "indicatori",
              label: "Indicatori",
              icon: "target",
              content: nonEmpty(serviceSummaryConfig.scores || []).length > 0 ? <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(148px,1fr))",
                gap: 8
              }}>
                        {nonEmpty(serviceSummaryConfig.scores || []).map(s => <div key={s.l} style={{
                  padding: "10px 11px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.035)",
                  border: "1px solid rgba(255,255,255,.055)"
                }}>
                            <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 4
                  }}>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.38)"
                    }}>{s.l}</span>
                              <span style={{
                      fontFamily: F.sans,
                      fontSize: 13,
                      fontWeight: 900,
                      color: s.c
                    }}>{s.v}/100</span>
                            </div>
                            <div style={{
                    height: 3,
                    background: "rgba(255,255,255,.07)",
                    borderRadius: 2,
                    overflow: "hidden"
                  }}>
                              <div style={{
                      height: "100%",
                      width: `${s.v || 0}%`,
                      background: s.c,
                      borderRadius: 2
                    }} />
                            </div>
                            {s.d && <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.38)",
                    marginTop: 5,
                    lineHeight: 1.4
                  }}>{s.d}</div>}
                          </div>)}
                      </div> : <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.35)"
              }}>Indicatori non disponibili per questo servizio.</div>
            }, {
              key: "demo",
              label: "Profilo demografico ISTAT",
              icon: "family",
              content: <div>
                        <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                  gap: 8
                }}>
                          {nonEmpty(serviceSummaryConfig.admin || []).map(fieldCard)}
                        </div>
                        {svcType === "d2d" && <div style={{
                  marginTop: 8,
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.3)",
                  lineHeight: 1.45
                }}>
                            Dati reali da ISTAT per la Lombardia. Alcuni indicatori (fasce età, % stranieri, reddito) non ancora disponibili in questa versione.
                          </div>}
                      </div>
            }, svcType === "d2d" && step4Omi?.available ? {
              key: "omi",
              label: "Mercato immobiliare OMI",
              icon: "home",
              content: <div style={{
                padding: "12px 13px",
                borderRadius: 10,
                background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                        <div style={{
                  display: "flex",
                  gap: 7,
                  marginBottom: 10,
                  flexWrap: "wrap"
                }}>
                          {step4Omi.municipality && <span style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(96,165,250,.12)",
                    border: "1px solid rgba(96,165,250,.22)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: C.blue
                  }}>{step4Omi.municipality}</span>}
                          {step4Omi.zone_name && <span style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.07)",
                    border: "1px solid rgba(255,255,255,.1)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.62)"
                  }}>Zona: {step4Omi.zone_name}</span>}
                        </div>
                        {(step4Omi.values || []).slice(0, 4).map((tv, i) => <div key={i} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,.05)" : "none"
                }}>
                            <span style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.52)"
                  }}>{tv.typology}</span>
                            <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.white
                  }}>{formatNumber(tv.min_value)}–{formatNumber(tv.max_value)} €/mq</span>
                          </div>)}
                        {(step4Omi.values || []).length > 4 && <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.35)",
                  marginTop: 6
                }}>+{step4Omi.values.length - 4} tipologie</div>}
                        <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.26)",
                  marginTop: 8
                }}>Fonte: Agenzia delle Entrate – OMI</div>
                      </div>
            } : null, {
              key: "fonti",
              label: "Fonti dati",
              icon: "book",
              content: <div>
                        <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  marginBottom: 10
                }}>
                          {(serviceSummaryConfig.sources || []).map(s => <span key={s} style={{
                    padding: "4px 9px",
                    borderRadius: 6,
                    background: "rgba(255,255,255,.05)",
                    border: "1px solid rgba(255,255,255,.07)",
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.52)"
                  }}>{cleanSource(s)}</span>)}
                          {(serviceSummaryConfig.sources || []).length === 0 && <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.35)"
                  }}>Nessuna fonte registrata.</span>}
                        </div>
                        <div style={{
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: `${col}08`,
                  border: `1px solid ${col}20`,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.52)",
                  lineHeight: 1.5
                }}>
                          {operationalSummary}
                        </div>
                      </div>
            }].filter(Boolean).map(({
              key,
              label,
              icon,
              content
            }) => <div key={key} style={{
              borderRadius: 11,
              border: "1px solid rgba(255,255,255,.07)",
              overflow: "hidden"
            }}>
                    <button onClick={() => toggleTech(key)} style={{
                width: "100%",
                padding: "11px 14px",
                background: techSections[key] ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.025)",
                border: "none",
                color: techSections[key] ? C.white : "rgba(255,255,255,.52)",
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left"
              }}>
                      <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7
                }}><Step1Icon name={icon} size={13} color="currentColor" /> {label}</span>
                      <span style={{
                  fontSize: 10,
                  opacity: .6
                }}>{techSections[key] ? "▲" : "▼"}</span>
                    </button>
                    <AnimatePresence>
                      {techSections[key] && <motion.div key="body" initial={{
                  opacity: 0,
                  height: 0
                }} animate={{
                  opacity: 1,
                  height: "auto"
                }} exit={{
                  opacity: 0,
                  height: 0
                }} transition={{
                  duration: 0.2
                }} style={{
                  overflow: "hidden"
                }}>
                          <div style={{
                    padding: "12px 14px",
                    borderTop: "1px solid rgba(255,255,255,.06)",
                    background: "rgba(8,15,30,.5)"
                  }}>
                            {content}
                          </div>
                        </motion.div>}
                    </AnimatePresence>
                  </div>)}

                <button onClick={handleDownloadPdf} disabled={pdfBusy} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              marginTop: 6,
              padding: "10px 16px",
              borderRadius: 10,
              border: `1px solid ${col}40`,
              background: `${col}0e`,
              color: col,
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 700,
              cursor: pdfBusy ? "wait" : "pointer",
              width: "100%"
            }}>
                  {pdfBusy ? "Generazione PDF..." : <><Step1Icon name="printer" size={14} color={col} /> Scarica analisi completa PDF</>}
                </button>
              </div>}
          </div>}
      </div>

      {/* ── SIDEBAR ── */}
        <div>
          <div style={{
          ...box(),
          padding: "18px",
          position: isMobile ? "static" : "sticky",
          top: 90,
          display: "flex",
          flexDirection: "column",
          gap: 0
        }}>

            {/* Status pill */}
            <div style={{
            marginBottom: 14,
            display: "flex",
            gap: 6,
            flexWrap: "wrap"
          }}>
              <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 100,
              background: sent ? "rgba(46,204,138,.15)" : "rgba(255,255,255,.07)",
              border: `1px solid ${sent ? "rgba(46,204,138,.35)" : "rgba(255,255,255,.12)"}`,
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: sent ? C.green : "rgba(255,255,255,.52)"
            }}>
                {sent ? "✓ Confermata" : <><Step1Icon name="hourglass" size={11} color="rgba(255,255,255,.52)" /> In attesa conferma</>}
              </div>
              {isQuick && <div style={{
              padding: "4px 10px",
              borderRadius: 100,
              background: "rgba(251,191,36,.1)",
              border: "1px solid rgba(251,191,36,.28)",
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 700,
              color: C.yellow
            }}>Stima rapida</div>}
            </div>

            {/* Campagna details */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 14,
            padding: "12px",
            borderRadius: 11,
            background: "rgba(255,255,255,.03)",
            border: "1px solid rgba(255,255,255,.07)"
          }}>
              {[{
              l: "Zona",
              v: mainAreaLabel || "—"
            }, {
              l: "Quantità",
              v: flyerQty.toLocaleString("it-IT", {
                useGrouping: true
              }) + " pz."
            }, {
              l: "Formato",
              v: (data.flyerFormat || "-").toUpperCase()
            }, {
              l: "Piano",
              v: subL
            }, selDays.length > 0 && {
              l: "Periodo",
              v: selectedDatesLabel
            }].filter(Boolean).map(({
              l,
              v
            }) => <div key={l} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 6
            }}>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.38)",
                flexShrink: 0
              }}>{l}</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.white,
                textAlign: "right"
              }}>{v}</span>
                </div>)}
              {/* Servizi selezionati */}
              {selectedExtras.length > 0 && <div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.38)",
                marginBottom: 5
              }}>Servizi</div>
                  <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4
              }}>
                    {selectedExtras.map(e => <span key={e.id} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 7px",
                  borderRadius: 5,
                  background: "rgba(255,255,255,.06)",
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 600,
                  color: "rgba(255,255,255,.65)"
                }}>{e.icon && <Step1Icon name={e.icon} size={9} color="rgba(255,255,255,.65)" />} {e.label}</span>)}
                  </div>
                </div>}
            </div>

            {/* Price breakdown */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 12
          }}>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.05)"
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.45)"
              }}>Distribuzione {tLabel}</span>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,.72)"
              }}>{eur(baseCost)}</span>
              </div>
              {serviceExtras.map(({
              l,
              v,
              c
            }) => <div key={l} style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.42)"
              }}>{l}</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: c
              }}>{v}</span>
                </div>)}
              {disc > 0 && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: F.sans,
                fontSize: 11,
                color: C.green
              }}><Step1Icon name="link" size={11} color={C.green} /> Smart Pairing -{disc}%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.green
              }}>-{eur(smartPairingDiscount)}</span>
                </div>}
              {data.urgency === "urgent" && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: F.sans,
                fontSize: 11,
                color: C.red
              }}><Step1Icon name="lightning" size={11} color={C.red} /> Urgenza +30%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.red
              }}>+{eur(urgSurch)}</span>
                </div>}
              {subDiscPct > 0 && <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: 5,
              borderBottom: "1px solid rgba(255,255,255,.04)"
            }}>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: C.green
              }}>Piano -{subDiscPct}%</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 600,
                color: C.green
              }}>-{eur(planDiscountAmount)}</span>
                </div>}
            </div>

            {/* Investment box */}
            <div style={{
            background: "linear-gradient(135deg, rgba(232,87,26,0.15) 0%, rgba(99,102,241,0.1) 100%)",
            borderRadius: 16,
            padding: "18px 16px",
            border: "2px solid #E8571A",
            marginBottom: 16,
            boxShadow: "0 6px 24px rgba(232,87,26,0.25)"
          }}>
              <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              fontWeight: 800,
              color: "rgba(255,255,255,.5)",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginBottom: 8
            }}>
                {isQuick ? "Stima investimento" : "Il tuo investimento"}
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "rgba(255,255,255,.55)"
              }}>Totale campagna</span>
                <span style={{
                fontFamily: F.serif,
                fontSize: 38,
                fontWeight: 900,
                color: "#E8571A",
                letterSpacing: "-1.5px",
                lineHeight: 1
              }}>{eur(total)}</span>
              </div>
              <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.08)"
            }}>
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>Costo per 1.000 volantini</span>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.75)"
                }}>
                    {flyerQty > 0 ? eur(total / flyerQty * 1000) : "—"}
                  </span>
                </div>
                {svcType === "d2d" && (kpis.families ?? totF) > 0 && <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>Costo per famiglia raggiunta</span>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "rgba(255,255,255,.75)"
                }}>
                      {eur(total / (kpis.families ?? totF))}
                    </span>
                  </div>}
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline"
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>IVA 22% (esclusa)</span>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(255,255,255,.5)"
                }}>+{eur(total * 0.22)}</span>
                </div>
              </div>
            </div>

            {/* Dashboard ed esecuzione / Modificabile badge */}
            {!sent ? <>
                <div style={{
              marginBottom: 14,
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(56,189,248,.07)",
              border: "1px solid rgba(56,189,248,.25)",
              display: "flex",
              alignItems: "center",
              gap: 12
            }}>
                  <Step1Icon name="chart" size={22} color="#38BDF8" /><div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#38BDF8"
                }}>Dashboard ed esecuzione campagna</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.6)",
                  lineHeight: 1.45,
                  marginTop: 2
                }}>
                      La dashboard sarà disponibile dopo il salvataggio della campagna.
                    </div>
                  </div>
                </div>
                <div style={{
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(46,204,138,.07)",
              border: "1px solid rgba(46,204,138,.2)",
              display: "flex",
              gap: 10,
              alignItems: "center"
            }}>
                  <span style={{
                color: C.green,
                fontSize: 16,
                flexShrink: 0
              }}>✓</span>
                  <div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: C.green
                }}>Configurazione flessibile</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.5)",
                  lineHeight: 1.4,
                  marginTop: 1
                }}>Potrai concordare variazioni prima del via operativo.</div>
                  </div>
                </div>
              </> : savedCampaign?.id && <div style={{
            marginBottom: 14,
            padding: "16px 18px",
            borderRadius: 14,
            background: "rgba(46,204,138,.12)",
            border: "1px solid rgba(46,204,138,.35)",
            display: "flex",
            flexDirection: "column",
            gap: 12
          }}>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
                    <span style={{
                color: C.green,
                fontWeight: 900,
                fontSize: 24
              }}>✓</span>
                    <div>
                      <div style={{
                  fontFamily: F.serif,
                  fontSize: 18,
                  color: C.green
                }}>Campagna salvata e confermata!</div>
                      <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.7)",
                  lineHeight: 1.4,
                  marginTop: 2
                }}>
                        ID Campagna: <b style={{
                    color: C.white
                  }}>{savedCampaign.id}</b>. Puoi accedere alla dashboard di monitoraggio.
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={() => {
              if (onHome) onHome("campaign", {
                campaignId: savedCampaign.id
              });else window.location.href = `/dashboard/${savedCampaign.id}`;
            }} style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              background: C.green,
              color: "#080F1E",
              border: "none",
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              textAlign: "center",
              transition: "all .2s"
            }}>
                    Apri Dashboard Campagna →
                  </button>
                </div>}

            {returnFromLogin && <div style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(46,204,138,.1)",
            border: "1px solid rgba(46,204,138,.35)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10
          }}>
                <div>
                  <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "#2ECC8A",
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 4
              }}>
                    <span style={{
                  color: "#2ECC8A",
                  fontWeight: 900
                }}>✓</span> Campagna pronta
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.7)",
                lineHeight: 1.45
              }}>
                    La tua campagna è pronta. Clicca su "Conferma e avvia" per procedere.
                  </div>
                </div>
                <button type="button" onClick={() => setReturnFromLogin(false)} style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,.4)",
              fontSize: 16,
              cursor: "pointer",
              padding: "0 4px",
              flexShrink: 0
            }}>×</button>
              </div>}

            {showLoginRequired && <div style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(239,68,68,.1)",
            border: "1px solid rgba(239,68,68,.35)",
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}>
                <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#EF4444",
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800
            }}>
                  <Step1Icon name="lock" size={13} color="#EF4444" /> Login necessario per salvare la campagna
                </div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.45
            }}>
                  Per salvare la tua campagna e accedere alla dashboard operativa, accedi al tuo account o crea un profilo in pochi secondi.
                </div>
                <button type="button" onClick={() => {
              try {
                localStorage.setItem("volantinipro_return_to", "step4");
                localStorage.setItem("volantinipro_pending_action", "confirm_campaign");
                localStorage.setItem("volantinipro_pending_campaign_draft", JSON.stringify(data));
              } catch {}
              const u = "login?context=customer&returnTo=" + encodeURIComponent("/configuratore?step=4");
              if (onNav) onNav(u);
              else if (onHome) onHome(u);
              else window.location.href = "/" + u;
            }} style={{
              alignSelf: "flex-start",
              padding: "8px 16px",
              borderRadius: 8,
              background: "#EF4444",
              color: C.white,
              border: "none",
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer"
            }}>
                  Vai al Login →
                </button>
              </div>}

            {campaignSaveError && !showLoginRequired && <div style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(239,68,68,.12)",
            border: "1px solid rgba(239,68,68,.3)",
            fontFamily: F.sans,
            fontSize: 12,
            color: "#EF4444"
          }}>
                {campaignSaveError}
              </div>}

            {/* CTAs */}
            {isQuick ? <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 10
          }}>
                <button className="btn s4-btn-green" onClick={() => onHome("step1")} style={{
              width: "100%",
              padding: "16px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(232,87,26,0.4)",
              transition: "all .2s"
            }}>
                  Completa configurazione →
                </button>
                <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8
            }}>
                  <button className="btn" onClick={handleDownloadPdf} disabled={pdfBusy} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "12px",
                borderRadius: 10,
                border: `1px solid ${col}40`,
                background: `${col}0e`,
                color: col,
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: pdfBusy ? "wait" : "pointer"
              }}>
                    {pdfBusy ? "Attendi…" : <><Step1Icon name="printer" size={15} color={col} /> Scarica PDF</>}
                  </button>
                  <button className="btn" onClick={() => onHome("consultant")} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                padding: "12px",
                borderRadius: 10,
                border: "1px solid rgba(56,189,248,.3)",
                background: "rgba(56,189,248,.08)",
                color: "#38BDF8",
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}>
                    <Step1Icon name="user" size={15} color="#38BDF8" /> Consulenza
                  </button>
                </div>
                <button className="btn" onClick={() => {
              setEmailSent(true);
              setTimeout(() => setEmailSent(false), 3000);
            }} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              padding: "12px",
              borderRadius: 10,
              border: "1px solid rgba(46,204,138,.25)",
              background: "rgba(46,204,138,.07)",
              color: C.green,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer"
            }}>
                  {emailSent ? "✓ Inviato" : <><Step1Icon name="mail" size={15} color={C.green} /> Invia preventivo via email</>}
                </button>
              </div> : <button className="btn s4-btn-green" disabled={!canConfirm || savingCampaign} onClick={handleConfirmCampaign} style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: !canConfirm ? "rgba(255,255,255,.08)" : sent ? "rgba(46,204,138,.9)" : "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
            color: !canConfirm ? "rgba(255,255,255,.3)" : C.white,
            fontFamily: F.sans,
            fontSize: 15,
            fontWeight: 800,
            cursor: canConfirm && !savingCampaign ? "pointer" : "not-allowed",
            marginBottom: 10,
            boxShadow: canConfirm && !sent ? "0 8px 24px rgba(232,87,26,0.4)" : "none",
            transition: "all .2s"
          }}>
                {savingCampaign ? "Salvataggio in corso..." : sent ? "✓ Campagna confermata" : "Conferma e avvia la campagna →"}
              </button>}

            {sent && <div style={{
            marginBottom: 10,
            padding: "10px 11px",
            borderRadius: 10,
            background: "rgba(46,204,138,.07)",
            border: "1px solid rgba(46,204,138,.2)",
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.58)",
            lineHeight: 1.55
          }}>
                <b style={{
              color: C.green
            }}>Campagna confermata.</b> Riceverai una email entro 1h con i dettagli operativi.
                {confirmSyncStatus && <><br /><span style={{
                color: "rgba(255,255,255,.4)"
              }}>{confirmSyncStatus}</span></>}
              </div>}
            {!canConfirm && confirmProblem && !isQuick && <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: C.red,
            textAlign: "center",
            marginBottom: 8
          }}>{confirmProblem}</div>}

            {!isQuick && <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 4
          }}>
                <button className="btn" onClick={handleDownloadPdf} disabled={pdfBusy} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              padding: "10px",
              borderRadius: 9,
              border: `1px solid ${col}40`,
              background: `${col}0e`,
              color: col,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: pdfBusy ? "wait" : "pointer"
            }}>
                  {pdfBusy ? "Generazione PDF…" : <><Step1Icon name="printer" size={15} color={col} /> Scarica preventivo PDF</>}
                </button>
                <button className="btn" onClick={() => {
              setEmailSent(true);
              setTimeout(() => setEmailSent(false), 3000);
            }} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              width: "100%",
              padding: "10px",
              borderRadius: 9,
              border: "1px solid rgba(46,204,138,.25)",
              background: "rgba(46,204,138,.07)",
              color: C.green,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer"
            }}>
                  {emailSent ? "✓ Inviato" : <><Step1Icon name="mail" size={15} color={C.green} /> Invia preventivo via email</>}
                </button>
                {emailSent && <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: C.green,
              textAlign: "center"
            }}>Controlla la tua casella email.</div>}
                {pdfError && <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: C.red,
              textAlign: "center"
            }}>{pdfError}</div>}
              </div>}

            {!sent && <div style={{
            marginTop: 10,
            padding: "14px",
            borderRadius: 11,
            background: "rgba(255,255,255,.025)",
            border: "1px solid rgba(255,255,255,.07)"
          }}>
                <div style={{
              fontFamily: F.sans,
              fontSize: 9,
              fontWeight: 800,
              color: "rgba(255,255,255,.28)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 12
            }}>Cosa succede dopo?</div>
                {["Riceveremo la tua richiesta.", "Verificheremo disponibilità e operatori.", "Ti confermeremo il calendario entro 24h.", "Potrai ancora modificare la configurazione prima dell'avvio."].map((step, i) => <div key={i} style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: i < 3 ? 8 : 0
            }}>
                    <div style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "rgba(46,204,138,.14)",
                border: "1px solid rgba(46,204,138,.25)",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                color: C.green,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}>{i + 1}</div>
                    <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.5)",
                lineHeight: 1.5
              }}>{step}</span>
                  </div>)}
              </div>}

            <div style={{
            display: "flex",
            gap: 8,
            marginTop: 10
          }}>
              <NavButton onClick={onBack} compact style={{
              flex: 1
            }}>{"\u2190 Modifica configurazione"}</NavButton>
              <NavButton onClick={() => onHome("home")} compact style={{
              flex: 1
            }}>Home</NavButton>
            </div>
          </div>
        </div>
      </div>
      {isMobile && <div style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 220,
      padding: "10px 14px",
      background: "rgba(10,18,34,.96)",
      borderTop: "1px solid rgba(255,255,255,.1)",
      backdropFilter: "blur(14px)",
      boxShadow: "0 -12px 30px rgba(0,0,0,.28)"
    }}>
          <div style={{
        maxWidth: 560,
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
        alignItems: "center"
      }}>
            <div>
              <div style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.42)",
            textTransform: "uppercase",
            letterSpacing: ".08em"
          }}>{isQuick ? "Prezzo indicativo" : "Totale stimato"}</div>
              <div style={{
            fontFamily: F.serif,
            fontSize: 22,
            color: col,
            letterSpacing: "-.4px"
          }}>{eur(total)}</div>
            </div>
            {isQuick ? <button className="btn" onClick={() => onHome("step1")} style={{
          minHeight: 48,
          padding: "0 16px",
          borderRadius: 10,
          border: "none",
          background: col,
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer"
        }}>Completa</button> : <button className="btn" disabled={!canConfirm} onClick={handleConfirmCampaign} style={{
          minHeight: 48,
          padding: "0 16px",
          borderRadius: 10,
          border: "none",
          background: !canConfirm ? "rgba(255,255,255,.08)" : sent ? "rgba(46,204,138,.9)" : col,
          color: !canConfirm ? "rgba(255,255,255,.35)" : C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: canConfirm ? "pointer" : "not-allowed"
        }}>{sent ? "Confermata" : "Conferma"}</button>}
          </div>
        </div>}
    </div>;
}
