import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../../lib/constants.js";
import KpiTooltip from "../../../components/ui/KpiTooltip.jsx";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import { motion } from "framer-motion";
import { AUTH_EXPIRED_MESSAGE, clearExpiredSupabaseSession, hasSupabaseConfig, isAuthTokenExpiredError, isStoredSupabaseSessionExpired, saveSmartPairingWaitlist, supabase } from "../../../lib/supabaseClient.js";
import { supabase as supabaseSdk } from "../../../supabaseClient.js";
import { QUOTE_PRICES, MONTHS_FULL } from "../../../lib/appConstants.js";
import { calculateQuotePricing } from "../../../lib/quotePricing.js";
import { resolveConfiguratorDistributionZones } from "../../../lib/pricing/resolveConfiguratorDistributionZones.js";
import { calculateBusinessMaterials, calculateBusinessOperationalPlan } from "../../../lib/business/business-config.js";
import { formatIntegerIT } from "../../../lib/utils/format.js";
import { isStep2DebugEnabled } from "../../../lib/step2/debugStep2.js";
import { NavButton } from "../../../components/NavButton.jsx";
import { Step1Icon } from "../../../components/Step1Icon.jsx";
import { buildSmartPairingBypassState, calendarDateKey, fetchSmartPairingAvailability, getSelectedSmartPairingDates, isSelectableCalendarDate } from "../../../lib/smartPairingAvailability.js";
import { Step3SmartPairingMainPanel } from "./step3/Step3SmartPairingMainPanel.jsx";
import { Step3SmartPairingSummaryPanel } from "./step3/Step3SmartPairingSummaryPanel.jsx";
// Altri import se necessari verranno aggiunti nel prossimo step

export function Step3({
  data,
  setData,
  onNext,
  onBack
}) {
  if (isStep2DebugEnabled() && typeof window !== "undefined") {
    window.__VOLANTINIPRO_STEP3_DATA__ = data;
  }
  const isMobile = useIsMobile();
  const isBusinessStep3 = data.type === "b2b" || data.type === "business-distribution";
  const businessStep3MaterialPlan = data.businessMaterialPlan || calculateBusinessMaterials(data.selectedOperationalPois || [], data.poiAssignments || {}, data);
  const businessStep3OperationalPlan = data.businessOperationalPlan || calculateBusinessOperationalPlan((data.selectedOperationalPois || []).length, data);
  const initialCalendarDate = (() => {
    const raw = data.startDate || data.campaignPeriodStart;
    const parsed = raw ? new Date(`${raw}T00:00:00`) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  })();
  const [activeCalZoneId, setActiveCalZoneId] = useState(data.activeZoneId || data.campaignZones?.[0]?.id);
  const [selDays, setSelDays] = useState([]);
  const [showZoneDetails, setShowZoneDetails] = useState(false);
  const [navError, setNavError] = useState("");
  const [formSent, setFormSent] = useState(Boolean(data.smartPairingRequestSent));
  const [smartPairingRegistered, setSmartPairingRegistered] = useState(Boolean(data.smartPairingRequestSent));
  const shouldShowContinueToStep4 = formSent || smartPairingRegistered;
  // availabilityStatus distingue: loading | success | error
  // "loading"  → richiesta in corso (nessun dato ancora)
  // "success"  → risposta 200 ricevuta (slots può essere [] = zero match reali)
  // "error"    → fetch/invoke fallita (network, 5xx, auth) — NON equivale a zero match
  const [availabilityStatus, setAvailabilityStatus] = useState("loading");
  const [availabilityRetryCount, setAvailabilityRetryCount] = useState(0);
  useEffect(() => {
    console.info("[STEP3_STATE_INIT]", {
      formSent,
      smartPairingRegistered
    });
    console.info("[STEP3_ERROR_BOUNDARY_CHECK]", {
      mounted: true
    });
  }, []);
  useEffect(() => {
    if (!data.dateMode) {
      setData(prev => ({
        ...prev,
        dateMode: "global"
      }));
    }
  }, []);
  useEffect(() => {
    if (shouldShowContinueToStep4) console.info("[STEP3_SHOW_CONTINUE_TO_STEP4]", {
      formSent,
      smartPairingRegistered
    });
  }, [shouldShowContinueToStep4, formSent, smartPairingRegistered]);

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      // Supabase non configurato: non è un errore di rete, non cambiamo stato
      return;
    }
    setAvailabilityStatus("loading");
    (async () => {
      try {
        const availability = await fetchSmartPairingAvailability(supabaseSdk, {
          service: data.type || "d2d",
          zone: data.cityName || (typeof data.selectedComuni?.[0] === "string" ? data.selectedComuni[0] : data.selectedComuni?.[0]?.name || data.selectedComuni?.[0]?.label) || "",
          lat: data.city?.lat ?? data.selectedSearchPoint?.lat ?? null,
          lng: data.city?.lng ?? data.selectedSearchPoint?.lng ?? null,
          startDate: data.startDate || data.campaignPeriodStart || null
        });
        if (!cancelled) {
          setData(prev => ({ ...prev, ...availability, smartPairingAvailabilitySource: availability.source }));
          setAvailabilityStatus("success");
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[STEP3_AVAILABILITY_LOAD_FAILED]", { code: err?.message || "SMART_PAIRING_DATA_UNAVAILABLE" });
          setAvailabilityStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // availabilityRetryCount è incluso per permettere il retry manuale
  }, [data.type, data.cityName, data.city?.lat, data.city?.lng, data.selectedSearchPoint?.lat, data.selectedSearchPoint?.lng, data.campaignPeriodStart, setData, availabilityRetryCount]);
  const activeZone = data.dateMode === "per_zone" ? (data.campaignZones || []).find(z => z.id === activeCalZoneId) : null;
  useEffect(() => {
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      const z = (data.campaignZones || []).find(x => x.id === activeCalZoneId);
      setSelDays(z?.smartPairingSelectedDates || []);
    } else {
      setSelDays(data.smartPairingSelectedDates || []);
    }
  }, [activeCalZoneId, data.dateMode, data.campaignZones, data.smartPairingSelectedDates]);
  const updateDays = newDays => {
    setSelDays(newDays);
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      setData(prev => {
        const updatedZones = (prev.campaignZones || []).map(z => {
          if (z.id === activeCalZoneId) {
            return {
              ...z,
              step1SelectedDates: z.step1SelectedDates || z.selectedDates || z.days || [],
              smartPairingSelectedDates: newDays
            };
          }
          return z;
        });
        const allDates = updatedZones.reduce((acc, z) => {
          if (z.smartPairingSelectedDates) acc.push(...z.smartPairingSelectedDates);
          return acc;
        }, []);
        const uniqueDates = [...new Set(allDates)];
        return {
          ...prev,
          step1SelectedDates: prev.step1SelectedDates || prev.selectedDates || prev.days || [],
          campaignZones: updatedZones,
          smartPairingSelectedDates: uniqueDates
        };
      });
    } else {
      setData(prev => {
        const updatedZones = (prev.campaignZones || []).map(z => ({
          ...z,
          step1SelectedDates: z.step1SelectedDates || z.selectedDates || z.days || [],
          smartPairingSelectedDates: newDays
        }));
        return {
          ...prev,
          step1SelectedDates: prev.step1SelectedDates || prev.selectedDates || prev.days || [],
          smartPairingSelectedDates: newDays,
          campaignZones: updatedZones
        };
      });
    }
  };
  const [month, setMonth] = useState(data.selectedMonth?.month ?? initialCalendarDate.getMonth());
  const [year, setYear] = useState(data.selectedMonth?.year ?? initialCalendarDate.getFullYear());
  const [form, setForm] = useState(() => {
    const savedContact = data.contactRequestData || {};
    const savedPeriod = savedContact.preferred_period || savedContact.preferredPeriod || {};
    const phoneDigits = String(savedContact.telefono || "").replace(/\D/g, "").replace(/^39(?=\d{9,})/, "");
    const {
      telefono: _savedTelefono,
      preferred_period: _savedPreferredPeriod,
      preferredPeriod: _savedPreferredPeriodCamel,
      ...savedContactRest
    } = savedContact;
    return {
      nome: "",
      email: "",
      periodo: "",
      note: "",
      ...savedContactRest,
      telefono: phoneDigits,
      preferredPeriod: {
        type: savedPeriod.type || "single_date",
        startDate: savedPeriod.startDate || "",
        endDate: savedPeriod.endDate || "",
        weekdays: Array.isArray(savedPeriod.weekdays) ? savedPeriod.weekdays : [],
        text: savedPeriod.text || savedContact.periodo || ""
      }
    };
  });
  const [showRequest, setShowRequest] = useState(Boolean(data.smartPairingRequestSent));
  const [formError, setFormError] = useState("");
  const DI = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
  const planMonths = {
    single: 1,
    monthly3: 3,
    monthly6: 6,
    monthly12: 12
  };
  const planLabel = {
    single: "Campagna singola",
    monthly3: "Piano 3 mesi",
    monthly6: "Piano 6 mesi",
    monthly12: "Piano 12 mesi"
  }[data.subscription] || "Campagna singola";
  const isContinuativePlan = data.subscription && data.subscription !== "single";
  const totalCampaigns = data.totalCampaigns || (data.campaignsPerMonth || 1) * (planMonths[data.subscription] || 1);
  const realSmartPairingSlots = Array.isArray(data.smartPairingSlots) ? data.smartPairingSlots : [];
  const realAvailabilityDates = Array.isArray(data.availableDates) ? data.availableDates : [];
  const pairs = Object.fromEntries(realSmartPairingSlots.map(slot => {
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
  const availableDates = new Set(realAvailabilityDates.map(d => typeof d === "string" ? d : d?.date).filter(Boolean));
  const wx = {};
  const dim = (m, y) => new Date(y, m + 1, 0).getDate();
  const fdow = (m, y) => {
    let d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  const fmtDay = k => {
    const [y, m, d] = k.split("-");
    return `${d} ${MONTHS_FULL[parseInt(m, 10) - 1]} ${y}`;
  };
  const selectedInfo = selDays.filter(k => pairs[k]).map(k => ({
    key: k,
    pair: pairs[k]
  }));
  const pairingDays = selectedInfo.filter(x => x.pair).map(x => x.key);
  const normalDays = selDays.filter(k => !pairs[k]);
  const requestOnlyDays = [];
  const totalPairDisc = pairingDays.reduce((a, k) => a + (pairs[k]?.disc || 0), 0);
  const averagePairingDiscount = pairingDays.length ? Math.round(totalPairDisc / pairingDays.length) : 0;
  const maxPairingDiscount = pairingDays.length ? Math.max(...pairingDays.map(k => pairs[k].disc)) : 0;
  const requiresManualConfirmation = false;
  const calendarStatus = pairingDays.length === 0 ? "empty" : "smart_pairing_selected";
  const currentServiceType = activeZone ? activeZone.service_type : data.type || "d2d";
  const svcLabel = {
    d2d: "Door to Door",
    h2h: "Hand to Hand",
    b2b: "Distribuzione presso attività e aziende"
  }[currentServiceType] || "Servizio";
  const toZoneDisplayName = zone => {
    if (typeof zone === "string") return zone;
    if (!zone || typeof zone !== "object") return "";
    return zone.zone_label || zone.cityName || zone.label || zone.name || zone.id || "";
  };
  const allZonesList = activeZone ? [activeZone.zone_label || activeZone.cityName || `Zona ${activeCalZoneId}`] : (data.selectedComuni && data.selectedComuni.length ? data.selectedComuni : data.zones && data.zones.length ? data.zones : [data.cityName || "Zona da Step 2"]).map(toZoneDisplayName).filter(Boolean);
  const compactZoneLabel = allZonesList.length > 1 ? `${allZonesList[0]} (+${allZonesList.length - 1} zone)` : allZonesList[0] || "Zona selezionata";
  const fmtIsoDate = v => {
    if (!v) return "";
    const p = v.split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : "";
  };
  const periodLabel = data.startDate && data.endDate ? `${fmtIsoDate(data.startDate)}  ${fmtIsoDate(data.endDate)}` : data.startDate ? `Dal ${fmtIsoDate(data.startDate)}` : "";
  const sanitizeWhatsAppLocal = value => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.replace(/^39(?=\d{9,})/, "").slice(0, 12);
  };
  const normalizeWhatsApp = value => `+39${sanitizeWhatsAppLocal(value)}`;
  const updatePreferredPeriod = patch => {
    setForm(f => ({
      ...f,
      preferredPeriod: {
        ...(f.preferredPeriod || {
          type: "single_date",
          startDate: "",
          endDate: "",
          weekdays: [],
          text: ""
        }),
        ...patch
      }
    }));
  };
  const togglePreferredWeekday = day => {
    setForm(f => {
      const current = f.preferredPeriod || {
        type: "weekdays",
        startDate: "",
        endDate: "",
        weekdays: [],
        text: ""
      };
      const weekdays = Array.isArray(current.weekdays) ? current.weekdays : [];
      return {
        ...f,
        preferredPeriod: {
          ...current,
          type: "weekdays",
          weekdays: weekdays.includes(day) ? weekdays.filter(d => d !== day) : [...weekdays, day]
        }
      };
    });
  };
  const buildPreferredPeriod = () => {
    const p = form.preferredPeriod || {};
    if (p.type === "single_date" && p.startDate) return {
      type: "single_date",
      startDate: p.startDate,
      endDate: "",
      weekdays: [],
      text: ""
    };
    if (p.type === "date_range" && p.startDate) return {
      type: "date_range",
      startDate: p.startDate,
      endDate: p.endDate || "",
      weekdays: [],
      text: ""
    };
    if (p.type === "weekdays" && Array.isArray(p.weekdays) && p.weekdays.length) return {
      type: "weekdays",
      startDate: "",
      endDate: "",
      weekdays: p.weekdays,
      text: ""
    };
    if (String(p.text || form.periodo || "").trim()) return {
      type: "text",
      startDate: "",
      endDate: "",
      weekdays: [],
      text: String(p.text || form.periodo || "").trim()
    };
    return null;
  };
  const preferredPeriodToText = period => {
    if (!period) return "";
    if (period.type === "single_date") return `Data preferita: ${fmtIsoDate(period.startDate) || period.startDate}`;
    if (period.type === "date_range") return `Intervallo: ${fmtIsoDate(period.startDate) || period.startDate}${period.endDate ? ` - ${fmtIsoDate(period.endDate) || period.endDate}` : ""}`;
    if (period.type === "weekdays") return `Giorni preferiti: ${(period.weekdays || []).join(", ")}`;
    return `Periodo: ${period.text}`;
  };
  // P0 WIRING REALE — rimossa la terza formula indipendente (BASE_PRICES,
  // 1/10 di QUOTE_PRICES per un bug di denominatore mai stato notato perche'
  // baseCost/saved qui sotto non erano mai lette da nessun altro punto del
  // file, ne' renderizzate ne' scritte in data: codice morto). Sostituita
  // con la STESSA pipeline centrale di Step4 (calculateQuotePricing +
  // resolveConfiguratorDistributionZones, griglia territoriale reale per
  // D2D, tariffa flat invariata per h2h/b2b) cosi' che, se in futuro questo
  // valore viene effettivamente mostrato, coincida per costruzione con
  // Step4 per lo stesso input — mai una seconda tabella prezzi.
  const activeQty = activeZone ? Number(activeZone.assigned_flyers || 0) : Number(data.qty || 0);
  const step3PricePerThousand = QUOTE_PRICES[currentServiceType] || 18.5;
  const step3DistributionZones = currentServiceType === "d2d"
    ? resolveConfiguratorDistributionZones(data, activeQty).zones
    : null;
  const step3Pricing = calculateQuotePricing({ quantity: activeQty, pricePerThousand: step3PricePerThousand, distributionZones: step3DistributionZones });
  const baseCost = step3Pricing.baseCost ?? 0;
  const saved = baseCost * (averagePairingDiscount / 100);
  function toggle(d) {
    const k = calendarDateKey(year, month, d);
    if (!pairs[k] || !isSelectableCalendarDate(k, availableDates, pairs[k])) return;
    const newDays = selDays.includes(k) ? selDays.filter(x => x !== k) : [...selDays, k];
    updateDays(newDays);
    setShowRequest(false);
    setFormSent(false);
  }
  function buildPayload(contactOverride) {
    const pairingByDay = Object.fromEntries(selDays.map(k => [k, pairs[k] ? pairs[k].type : "none"]));
    const discountByDay = Object.fromEntries(selDays.map(k => [k, pairs[k]?.disc || 0]));
    return {
      days: selDays,
      avgDiscount: averagePairingDiscount,
      selectedDates: selDays,
      smartPairingSelectedDates: selDays,
      selectedMonth: {
        month,
        year,
        label: `${MONTHS_FULL[month]} ${year}`
      },
      selectedDaysCount: selDays.length,
      pairingDays,
      normalDays,
      requestOnlyDays,
      pairingType: pairingByDay,
      pairingDiscountPercent: discountByDay,
      averagePairingDiscount,
      maxPairingDiscount,
      calendarStatus,
      requiresManualConfirmation,
      availableDates: realAvailabilityDates,
      smartPairingSlots: realSmartPairingSlots,
      smartPairingAvailabilitySource: realSmartPairingSlots.length || realAvailabilityDates.length ? "backend" : "none",
      smartPairingRequestSent: false,
      smartPairingStatus: pairingDays.length ? "selected" : "none",
      contactRequestData: contactOverride || data.contactRequestData || null
    };
  }
  function buildFinalPayload(contactOverride) {
    if (data.dateMode === "per_zone") {
      const allSelectedDates = (data.campaignZones || []).reduce((acc, z) => {
        if (z.smartPairingSelectedDates) acc.push(...z.smartPairingSelectedDates);
        return acc;
      }, []);
      const uniqueSelectedDates = [...new Set(allSelectedDates)];
      const pairingByDay = Object.fromEntries(uniqueSelectedDates.map(k => [k, pairs[k] ? pairs[k].type : "none"]));
      const discountByDay = Object.fromEntries(uniqueSelectedDates.map(k => [k, pairs[k]?.disc || 0]));
      const allZonePairingDays = uniqueSelectedDates.filter(k => pairs[k]);
      const totalAllZonePairDisc = allZonePairingDays.reduce((a, k) => a + (pairs[k]?.disc || 0), 0);
      const overallAverageDiscount = allZonePairingDays.length ? Math.round(totalAllZonePairDisc / allZonePairingDays.length) : 0;
      const overallMaxDiscount = allZonePairingDays.length ? Math.max(...allZonePairingDays.map(k => pairs[k].disc)) : 0;
      return {
        days: uniqueSelectedDates,
        avgDiscount: overallAverageDiscount,
        selectedDates: uniqueSelectedDates,
        smartPairingSelectedDates: uniqueSelectedDates,
        selectedMonth: {
          month,
          year,
          label: `${MONTHS_FULL[month]} ${year}`
        },
        selectedDaysCount: uniqueSelectedDates.length,
        pairingDays: allZonePairingDays,
        normalDays,
        requestOnlyDays,
        pairingType: pairingByDay,
        pairingDiscountPercent: discountByDay,
        averagePairingDiscount: overallAverageDiscount,
        maxPairingDiscount: overallMaxDiscount,
        calendarStatus: allZonePairingDays.length ? "smart_pairing_selected" : "no_smart_pairing",
        requiresManualConfirmation,
        availableDates: realAvailabilityDates,
        smartPairingSlots: realSmartPairingSlots,
        smartPairingAvailabilitySource: realSmartPairingSlots.length || realAvailabilityDates.length ? "backend" : "none",
        smartPairingRequestSent: false,
        smartPairingStatus: allZonePairingDays.length ? "selected" : "none",
        contactRequestData: contactOverride || data.contactRequestData || null
      };
    } else {
      return buildPayload(contactOverride);
    }
  }
  function validateRequestForm() {
    if (!form.nome.trim()) {
      setFormError("Inserisci nome e cognome");
      return false;
    }
    if (sanitizeWhatsAppLocal(form.telefono).length < 9) {
      setFormError("Inserisci un numero WhatsApp valido");
      return false;
    }
    if (!form.email.includes("@")) {
      setFormError("Inserisci una email valida");
      return false;
    }
    if (!buildPreferredPeriod()) {
      setFormError("Indica il periodo o i giorni preferiti");
      return false;
    }
    setFormError("");
    return true;
  }
  async function handleRequestSubmit() {
    if (!validateRequestForm()) return;
    const preferredPeriod = buildPreferredPeriod();
    const preferredPeriodText = preferredPeriodToText(preferredPeriod);
    const whatsapp = normalizeWhatsApp(form.telefono);
    const comunePrincipale = allZonesList[0] || data.cityName || "Zona da confermare";
    console.info("[STEP3_FORM_STATE]", {
      nome: form.nome,
      email: form.email,
      telefono: form.telefono,
      preferredPeriod,
      note: form.note || ""
    });
    if (hasSupabaseConfig()) {
      if (isStoredSupabaseSessionExpired()) {
        console.warn("[SMART_PAIRING_BLOCKED_EXPIRED_SESSION]");
        console.warn("[AUTH_TOKEN_EXPIRED]", {
          action: "smart_pairing_submit"
        });
        clearExpiredSupabaseSession();
        console.warn("[AUTH_RELOGIN_REQUIRED]", {
          action: "smart_pairing_submit"
        });
        setFormError(AUTH_EXPIRED_MESSAGE);
        return;
      }
      const waitlistPayload = {
        nome: form.nome,
        email: form.email,
        whatsapp,
        comune: comunePrincipale,
        servizio: currentServiceType,
        date_preferite: preferredPeriodText,
        note: form.note || null
      };
      console.info("[STEP3_WAITLIST_PAYLOAD]", waitlistPayload);
      try {
        await saveSmartPairingWaitlist(waitlistPayload);
      } catch (err) {
        if (isAuthTokenExpiredError(err)) {
          setFormError(AUTH_EXPIRED_MESSAGE);
          return;
        }
        // Real failure (RLS block or otherwise): show it, don't silently
        // advance as if the request had been saved.
        setFormError(err?.message || "Richiesta Smart Pairing non salvata. Riprova.");
        return;
      }
    }
    console.info("[STEP3_SMART_PAIRING_REGISTERED]", navSnapshot());
    console.info("[STEP3_WAITLIST_INSERT_SUCCESS]", navSnapshot());
    setFormSent(true);
    setSmartPairingRegistered(true);
    setFormError("");
    setData(d => ({
      ...d,
      smartPairingSelectedDates: [],
      avgDiscount: 0,
      selectedDaysCount: 0,
      pairingDays: [],
      normalDays: [],
      requestOnlyDays: [],
      pairingType: {},
      pairingDiscountPercent: {},
      averagePairingDiscount: 0,
      maxPairingDiscount: 0,
      calendarStatus: "smart_pairing_request",
      smartPairingStatus: "request_sent",
      smartPairingRequestSent: true,
      requiresManualConfirmation: true,
      contactRequestData: {
        ...form,
        telefono: whatsapp,
        periodo: preferredPeriodText,
        preferred_period: preferredPeriod,
        preferredPeriod
      }
    }));
    // Don't auto-advance: let the user see the confirmation message below,
    // they can continue via the main "Genera preventivo" action whenever ready.
  }

  // --- Navigation (Step3 -> Step2 / Step3 -> Step4) ---
  // Single funnel for every "go back to Step2" request: only handleBackToZone
  // (wired to the explicit "← Zona e mappa" button) is allowed to pass the
  // "explicit_back_button" source. Any other caller is blocked and logged —
  // this is the anti-regression guard against an accidental/implicit step2
  // redirect from validation logic, waitlist submission, etc.
  function navSnapshot() {
    return {
      service: currentServiceType,
      zone: compactZoneLabel,
      quantity: activeQty,
      smartPairingEnabled: realSmartPairingSlots.length > 0,
      waitlistRegistered: Boolean(data.smartPairingRequestSent)
    };
  }
  function safeGoBackToStep2(source) {
    if (source !== "explicit_back_button") {
      console.error("[STEP3_NAV_UNEXPECTED_STEP2_GUARD]", {
        source,
        ...navSnapshot()
      });
      return;
    }
    // TEMPORANEO — solo per individuare il chiamante reale, da rimuovere una
    // volta chiusa l'indagine. Le variabili elencate nel ticket (selectedMunicipality,
    // zonesInRadius.length, selZones.length, serviceKpis) non esistono in Step3
    // (sono di Step2): uso qui l'equivalente reale disponibile in questo scope.
    console.warn("[STEP3_NAV_BACK_TO_STEP2_REASON]", {
      source,
      dateMode: data.dateMode,
      selDaysCount: selDays.length,
      realSmartPairingSlotsCount: realSmartPairingSlots.length,
      smartPairingRequestSent: Boolean(data.smartPairingRequestSent),
      formSent,
      showRequest,
      ...navSnapshot(),
      callerStack: new Error("STEP3_NAV_BACK_TO_STEP2_TRACE").stack
    });
    console.info("[STEP3_NAV_BACK_TO_STEP2]", navSnapshot());
    onBack();
  }
  function handleBackToZone() {
    safeGoBackToStep2("explicit_back_button");
  }
  function handleContinueToStep4() {
    console.info("[STEP3_NAV_TO_STEP4]", navSnapshot());
    onNext();
  }
  function handlePrimary() {
    console.info("[STEP3_NAV_CLICK_CONTINUE]", {
      action: "attivami_e_genera_preventivo"
    });
    console.info("[STEP3_NAV_STATE_BEFORE_CHANGE]", navSnapshot());
    if (data.dateMode === "per_zone") {
      const hasUnplanned = (data.campaignZones || []).some(z => getSelectedSmartPairingDates(z.smartPairingSelectedDates, realSmartPairingSlots).length === 0);
      if (hasUnplanned) {
        const firstUnplanned = (data.campaignZones || []).find(z => getSelectedSmartPairingDates(z.smartPairingSelectedDates, realSmartPairingSlots).length === 0);
        if (firstUnplanned) {
          setActiveCalZoneId(firstUnplanned.id);
          const msg = `Pianifica le date anche per la zona: ${firstUnplanned.zone_label || firstUnplanned.cityName || "successiva"}`;
          console.warn("[STEP3_NAV_BLOCKED_VALIDATION]", {
            reason: "unplanned_zone",
            ...navSnapshot()
          });
          setNavError(msg);
          alert(msg);
          return;
        }
      }
    }
    if (pairingDays.length === 0 && data.dateMode !== "per_zone") {
      console.warn("[STEP3_NAV_BLOCKED_VALIDATION]", {
        reason: "no_dates_selected",
        ...navSnapshot()
      });
      setNavError("Seleziona almeno una data compatibile prima di continuare.");
      return;
    }
    setNavError("");
    setData(d => ({
      ...d,
      ...buildFinalPayload(null)
    }));
    handleContinueToStep4();
  }
  function handleSkipPairing() {
    console.info("[STEP3_NAV_CLICK_CONTINUE]", {
      action: "continua_senza_smart_pairing"
    });
    console.info("[STEP3_NAV_STATE_BEFORE_CHANGE]", navSnapshot());
    // Se la disponibilità non è stata verificata (errore tecnico), avvisiamo
    // esplicitamente con smartPairingStatus = "skipped_unverified" anziché "none",
    // in modo che Step 4 possa mostrare un avviso appropriato.
    setNavError("");
    // In caso di errore, non c'è un payload di date da buildFinalPayload
    // (non ci sono date selezionabili). Aggiorniamo solo lo stato Smart Pairing.
    setData(d => buildSmartPairingBypassState(d, availabilityStatus));
    handleContinueToStep4();
  }
  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,.14)",
    background: "rgba(255,255,255,.07)",
    color: C.white,
    fontFamily: F.sans,
    fontSize: 14
  };
  return <div style={{
    maxWidth: 1200,
    margin: "0 auto",
    padding: "40px 28px 130px"
  }}>
      <style>{`
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 15px rgba(6,182,212,0.3); transform: scale(0.99); }
          50% { box-shadow: 0 0 30px rgba(99,102,241,0.6); transform: scale(1.01); }
          100% { box-shadow: 0 0 15px rgba(6,182,212,0.3); transform: scale(0.99); }
        }
      `}</style>

      {isBusinessStep3 && <div style={{
      marginBottom: 24,
      padding: isMobile ? 18 : 24,
      borderRadius: 20,
      background: "linear-gradient(135deg,rgba(76,29,149,.20),rgba(15,23,42,.96))",
      border: "1px solid rgba(167,139,250,.32)"
    }}>
          <div style={{
        fontFamily: F.sans,
        fontSize: 10,
        fontWeight: 900,
        color: "#C4B5FD",
        letterSpacing: ".1em",
        textTransform: "uppercase"
      }}>Piano Business confermato nello Step 2</div>
          <h2 style={{
        fontFamily: F.serif,
        fontSize: isMobile ? 25 : 31,
        color: C.white,
        margin: "8px 0 14px"
      }}>Attività, materiali e capacità operativa</h2>
          <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
        gap: 10
      }}>
            {[["Attività selezionate", businessStep3MaterialPlan.selectedActivities], ["Materiali necessari", businessStep3MaterialPlan.materialsRequired == null ? "Da definire" : `${formatIntegerIT(businessStep3MaterialPlan.materialsRequired)} pz.`], ["Giornate-addetto", businessStep3OperationalPlan.calculable ? businessStep3OperationalPlan.operatorDays : "Da calcolare"], ["Addetti consigliati", businessStep3OperationalPlan.recommendedOperators ?? "Da definire"]].map(([label, value]) => <div key={label} style={{
          padding: 12,
          borderRadius: 11,
          background: "rgba(5,12,24,.48)",
          border: "1px solid rgba(255,255,255,.07)"
        }}><div style={{
            fontFamily: F.sans,
            fontSize: 8,
            color: "rgba(255,255,255,.45)",
            textTransform: "uppercase"
          }}>{label}</div><div style={{
            fontFamily: F.sans,
            fontSize: 16,
            fontWeight: 900,
            color: C.white,
            marginTop: 5
          }}>{value}</div></div>)}
          </div>
          <div style={{
        marginTop: 12,
        fontFamily: F.sans,
        fontSize: 11,
        color: "rgba(255,255,255,.6)",
        lineHeight: 1.5
      }}>Lo Smart Pairing può ottimizzare il calendario e la logistica. Non modifica le aziende selezionate, le copie per attività o le prove richieste.</div>
        </div>}

      {/* 1. HERO CARD */}
      <div style={{
      background: "linear-gradient(135deg, rgba(30,41,59,0.85) 0%, rgba(15,23,42,0.95) 100%)",
      borderRadius: 24,
      padding: isMobile ? "28px 20px" : "36px 40px",
      border: "1px solid rgba(99,102,241,0.3)",
      boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
      marginBottom: 32,
      position: "relative",
      overflow: "hidden"
    }}>
        <div style={{
        position: "absolute",
        top: -40,
        right: -40,
        width: 220,
        height: 220,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)",
        pointerEvents: "none"
      }} />
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap"
      }}>
          <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          borderRadius: 100,
          background: "linear-gradient(135deg, #6366F1, #06B6D4)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          boxShadow: "0 0 20px rgba(6,182,212,0.4)",
          animation: "pulseGlow 2.5s infinite"
        }}>
            <Step1Icon name="sparkles" size={13} color={C.white} /> SMART PAIRING
          </span>
          {/* 8. STATO RICERCA BADGE */}
          <span style={{
          padding: "4px 10px",
          borderRadius: 100,
          background: availabilityStatus === "error"
            ? "rgba(239,68,68,0.15)"
            : realSmartPairingSlots.length > 0 ? "rgba(46,204,138,0.15)" : "rgba(255,255,255,.07)",
          border: `1px solid ${availabilityStatus === "error" ? "rgba(239,68,68,0.4)" : realSmartPairingSlots.length > 0 ? "rgba(46,204,138,0.4)" : "rgba(255,255,255,.15)"}`,
          color: availabilityStatus === "error" ? "#F87171" : realSmartPairingSlots.length > 0 ? C.green : "rgba(255,255,255,.7)",
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 700
        }}>
            {availabilityStatus === "loading"
              ? "● Verifica in corso…"
              : availabilityStatus === "error"
                ? "● Verifica non riuscita"
                : realSmartPairingSlots.length > 0
                  ? (selDays.length > 0 ? "● Confermato" : "● Campagne compatibili")
                  : (formSent ? "● Richiesta registrata" : "● Nessun match")}
          </span>
        </div>
        <h2 style={{
        fontFamily: F.serif,
        fontSize: isMobile ? 32 : 42,
        color: C.white,
        letterSpacing: "-1.2px",
        lineHeight: 1.1,
        marginBottom: 14
      }}>
          Riduci il costo della distribuzione fino al 40%.
        </h2>
        <p style={{
        fontFamily: F.sans,
        fontSize: isMobile ? 14 : 16,
        color: "rgba(255,255,255,0.72)",
        lineHeight: 1.65,
        maxWidth: 720,
        marginBottom: 24
      }}>
          Il sistema cerca automaticamente campagne compatibili nella stessa zona o nelle vicinanze, per condividere parte della logistica e ridurre i costi.
        </p>
        <button onClick={() => document.getElementById("smart-pairing-how")?.scrollIntoView({
        behavior: "smooth"
      })} style={{
        padding: "10px 20px",
        borderRadius: 10,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.2)",
        color: C.white,
        fontFamily: F.sans,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer"
      }}>
          Come funziona ↓
        </button>
      </div>

      {/* 2. TIMELINE PROCESSO */}
      <div style={{
      background: "rgba(255,255,255,0.025)",
      borderRadius: 20,
      padding: isMobile ? "20px 16px" : "24px 30px",
      border: "1px solid rgba(255,255,255,0.06)",
      marginBottom: 32
    }}>
        <div style={{
        fontFamily: F.sans,
        fontSize: 11,
        fontWeight: 800,
        color: "rgba(255,255,255,0.4)",
        textTransform: "uppercase",
        letterSpacing: ".1em",
        marginBottom: 18
      }}>Il Processo Smart Pairing</div>
        <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(5, 1fr)",
        gap: isMobile ? 12 : 16,
        alignItems: "center"
      }}>
          {(realSmartPairingSlots.length > 0 ? [{
          step: "1",
          title: "Zona selezionata",
          desc: compactZoneLabel,
          status: "completed"
        }, {
          step: "2",
          title: "Ricerca compatibilità",
          desc: "Campagne compatibili",
          status: "completed"
        }, {
          step: "3",
          title: "Slot disponibili",
          desc: "Finestre disponibili",
          status: "active"
        }, {
          step: "4",
          title: "Conferma data",
          desc: "Scegli le date",
          status: "future"
        }, {
          step: "5",
          title: "Applica risparmio",
          desc: "Fino al 40%",
          status: selDays.length > 0 ? "completed" : "future",
          highlight: true
        }] : [{
          step: "1",
          title: "Zona selezionata",
          desc: compactZoneLabel,
          status: "completed"
        }, {
          step: "2",
          title: availabilityStatus === "error" ? "Verifica non riuscita" : "Compatibilità verificata",
          desc: availabilityStatus === "error" ? "Errore di rete/backend" : "Nessun match",
          status: availabilityStatus === "error" ? "active" : "completed"
        }, {
          step: "3",
          title: availabilityStatus === "error" ? "Slot non verificati" : "Nessun slot compatibile",
          desc: availabilityStatus === "error" ? "Impossibile verificare" : "Finestre non trovate",
          status: availabilityStatus === "error" ? "future" : "active"
        }, {
          step: "4",
          title: availabilityStatus === "error" ? "Riprova o continua" : "Registra richiesta",
          desc: availabilityStatus === "error" ? "Riprova verifica" : "Verifica futura",
          status: formSent ? "completed" : "future",
          highlight: true
        }]).map(item => {
          let bg = "rgba(255,255,255,0.03)";
          let border = "1px solid rgba(255,255,255,0.07)";
          let stepBg = "rgba(255,255,255,0.12)";
          let stepColor = "rgba(255,255,255,0.6)";
          let titleColor = "rgba(255,255,255,0.5)";
          if (item.status === "completed") {
            bg = "rgba(46,204,138,0.08)";
            border = "1px solid rgba(46,204,138,0.3)";
            stepBg = C.green;
            stepColor = "#000";
            titleColor = C.green;
          } else if (item.status === "active") {
            bg = "rgba(232,87,26,0.12)";
            border = "1px solid rgba(232,87,26,0.45)";
            stepBg = "#E8571A";
            stepColor = C.white;
            titleColor = "#E8571A";
          }
          return <div key={item.step} style={{
            background: bg,
            border,
            borderRadius: 14,
            padding: "14px 16px",
            transition: "all .2s"
          }}>
                <div style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: stepBg,
              color: stepColor,
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 8,
              boxShadow: item.status === "active" ? "0 0 12px rgba(232,87,26,0.5)" : "none"
            }}>
                  {item.status === "completed" ? "✓" : item.step}
                </div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              color: titleColor,
              marginBottom: 2
            }}>{item.title}</div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,0.55)"
            }}>{item.desc}</div>
              </div>;
        })}
        </div>
      </div>

      {/* 3. KPI CARDS — "1fr" puro su CSS Grid equivale a minmax(auto,1fr):
          la colonna NON scende mai sotto la larghezza minima del proprio
          contenuto (es. sub-testo lungo come "Nessuna campagna compatibile
          al momento."), quindi su 395px la griglia 2 colonne traboccava
          comunque. minmax(0,1fr) permette alle colonne di restringersi
          davvero, lasciando che il testo vada a capo dentro la card. */}
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, 1fr)",
      gap: 14,
      marginBottom: 32
    }}>
        {(isBusinessStep3 ? [{
        label: "Attività selezionate",
        val: businessStep3MaterialPlan.selectedActivities,
        sub: "Piano di visita",
        color: C.purple,
        tip: "Attività realmente selezionate nello Step 2."
      }, {
        label: "Materiali necessari",
        val: businessStep3MaterialPlan.materialsRequired == null ? "—" : formatIntegerIT(businessStep3MaterialPlan.materialsRequired),
        sub: "Copie calcolate",
        color: C.green,
        tip: "Somma delle copie previste per tutte le attività selezionate."
      }, {
        label: "Giornate-addetto",
        val: businessStep3OperationalPlan.calculable ? businessStep3OperationalPlan.operatorDays : "—",
        sub: "Stima operativa",
        color: C.cyan,
        tip: "Giornate complessive stimate dal tempo medio per visita."
      }, (() => {
        const hasMatch = realSmartPairingSlots.length > 0;
        const bestDiscount = hasMatch ? Math.max(...realSmartPairingSlots.map(s => s.discountPercent)) : 0;
        return {
          label: hasMatch ? "Risparmio applicato" : "Risparmio disponibile",
          val: hasMatch ? `${bestDiscount}%` : "Fino al 40%",
          sub: hasMatch ? (bestDiscount === 40 ? "Stessa zona" : "Zona vicina") : "Da verificare",
          color: hasMatch ? C.green : C.yellow,
          tip: hasMatch ? "Risparmio assegnato dall'abbinamento confermato." : "Risparmio massimo previsto dalle regole Smart Pairing."
        };
      })()] : (() => {
        const hasMatch = realSmartPairingSlots.length > 0;
        const isLoading = availabilityStatus === "loading";
        const isError = availabilityStatus === "error";
        const bestDiscount = hasMatch ? Math.max(...realSmartPairingSlots.map(s => s.discountPercent)) : 0;
        return [{
          label: hasMatch ? "Risparmio applicato" : "Risparmio disponibile",
          val: isLoading ? "…" : isError ? "—" : hasMatch ? `${bestDiscount}%` : "Fino al 40%",
          sub: isLoading ? "Verifica in corso" : isError ? "Non verificabile" : hasMatch ? (bestDiscount === 40 ? "Stessa zona" : "Zona vicina") : "Da verificare",
          color: isError ? "rgba(255,255,255,0.4)" : hasMatch ? C.green : C.yellow,
          tip: hasMatch ? "Risparmio assegnato dall'abbinamento confermato." : "Risparmio massimo previsto dalle regole Smart Pairing."
        }, {
          label: "Campagne compatibili",
          val: isLoading ? "…" : isError ? "—" : hasMatch ? realSmartPairingSlots.length : "0",
          sub: isLoading ? "Verifica in corso" : isError ? "Verifica non riuscita" : hasMatch ? "In quest'area" : "Nessuna campagna compatibile al momento.",
          color: isError ? "rgba(255,255,255,0.4)" : C.cyan,
          tip: "Numero di campagne attive nell'area che possono essere abbinate alla tua per ridurre i costi."
        }, {
          label: "Slot operativi",
          val: isLoading ? "…" : isError ? "Non disponibile" : hasMatch ? "Disponibile" : "Nessuno",
          sub: isLoading ? "Verifica in corso" : isError ? "Impossibile verificare" : hasMatch ? "Slot libero" : "Slot esauriti",
          color: isError ? "rgba(255,255,255,0.4)" : C.white,
          tip: "Disponibilità logistica per l'abbinamento in base alla capacità giornaliera."
        }, {
          label: "Stato ricerca",
          val: isLoading ? "…" : isError ? "Verifica non riuscita" : hasMatch ? "Match disponibile" : "Nessun match",
          sub: isLoading ? "Richiesta in corso" : isError ? "Riprova per verificare" : hasMatch ? "Pronto per l'abbinamento" : "Richiesta registrabile",
          color: isError ? "#F87171" : C.white,
          tip: "Stato dell'abbinamento per la zona selezionata."
        }];
      })()).map((kpi, i) => <div key={i} style={{
        background: "rgba(255,255,255,0.035)",
        borderRadius: 16,
        padding: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        minWidth: 0,
        boxSizing: "border-box"
      }}>
            <div style={{
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.45)",
          textTransform: "uppercase",
          letterSpacing: ".06em",
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}>
              {kpi.label}
              <KpiTooltip tip={kpi.tip} color="rgba(255,255,255,0.4)" />
            </div>
            <div style={{
          fontFamily: F.serif,
          fontSize: 38,
          fontWeight: 900,
          color: kpi.color,
          lineHeight: 1,
          letterSpacing: "-1px",
          marginBottom: 6
        }}>{kpi.val}</div>
            <div style={{
          fontFamily: F.sans,
          fontSize: 11,
          color: "rgba(255,255,255,0.5)"
        }}>{kpi.sub}</div>
          </div>)}
      </div>

      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 340px",
      gap: 24,
      alignItems: "start"
    }}>
        <div>
          {isContinuativePlan && <div style={{
          marginBottom: 18,
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(99,102,241,.07)",
          border: "1px solid rgba(99,102,241,.20)",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
          gap: 10
        }}>
              {[{
            l: "Piano",
            v: planLabel
          }, {
            l: "Campagne/mese",
            v: data.campaignsPerMonth || 1
          }, {
            l: "Totale campagne",
            v: totalCampaigns
          }].map(({
            l,
            v
          }) => <div key={l} style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(255,255,255,.05)"
          }}>
                  <div style={{
              fontFamily: F.sans,
              fontSize: 9,
              color: "rgba(255,255,255,.34)",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              marginBottom: 2
            }}>{l}</div>
                  <div style={{
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              color: C.white
            }}>{v}</div>
                </div>)}
              <div style={{
            gridColumn: "1 / -1",
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.5)",
            lineHeight: 1.45
          }}>
                Per piani continuativi, lo Smart Pairing mostra solo abbinamenti compatibili confermati dal backend. Se non trovi slot adatti, richiedi un avviso e il team ti avviserà appena apriamo campagne compatibili.
              </div>
            </div>}

          {/* 4 & 9. CALENDARIO COMPATTO OPPURE CASO "NESSUNO SLOT" / ERRORE */}
          <Step3SmartPairingMainPanel
            availabilityStatus={availabilityStatus}
            setAvailabilityStatus={setAvailabilityStatus}
            setAvailabilityRetryCount={setAvailabilityRetryCount}
            realSmartPairingSlots={realSmartPairingSlots}
            availableDates={availableDates}
            isMobile={isMobile}
            handleContinueToStep4={handleContinueToStep4}
            shouldShowContinueToStep4={shouldShowContinueToStep4}
            handleSkipPairing={handleSkipPairing}
            month={month}
            setMonth={setMonth}
            year={year}
            setYear={setYear}
            selDays={selDays}
            setSelDays={setSelDays}
            isSelectableCalendarDate={isSelectableCalendarDate}
            preferredPeriod={form.preferredPeriod}
            updatePreferredPeriod={updatePreferredPeriod}
            togglePreferredWeekday={togglePreferredWeekday}
            showRequest={showRequest}
            setShowRequest={setShowRequest}
            form={form}
            setForm={setForm}
            formError={formError}
            setFormError={setFormError}
            formSent={formSent}
            setFormSent={setFormSent}
            handleRequestSubmit={handleRequestSubmit}
            setSmartPairingRegistered={setSmartPairingRegistered}
            dateMode={data.dateMode}
            pairs={pairs}
            toggle={toggle}
            sanitizeWhatsAppLocal={sanitizeWhatsAppLocal}
          />
        </div>

        {/* 7. SIDEBAR — MOSTRARE SEMPRE */}
        <Step3SmartPairingSummaryPanel
          isMobile={isMobile}
          realSmartPairingSlots={realSmartPairingSlots}
          pairingDays={pairingDays}
          formSent={formSent}
          svcLabel={svcLabel}
          compactZoneLabel={compactZoneLabel}
          allZonesList={allZonesList}
          showZoneDetails={showZoneDetails}
          setShowZoneDetails={setShowZoneDetails}
          activeQty={activeQty}
          averagePairingDiscount={averagePairingDiscount}
          handlePrimary={handlePrimary}
          navError={navError}
          handleSkipPairing={handleSkipPairing}
          handleBackToZone={handleBackToZone}
        />
      </div>
    </div>;
}
