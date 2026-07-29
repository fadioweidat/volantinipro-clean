import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../../lib/constants.js";
import KpiTooltip from "../../../components/ui/KpiTooltip.jsx";
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

  // Diagnostic-only: confirms what's really in these two tables without
  // altering the calendar/pairing logic above (that logic has no mapping yet
  // for `smart_pairing_slots`/`availability_slots`' real columns — see report).
  useEffect(() => {
    let cancelled = false;
    if (!supabase) return;
    (async () => {
      try {
        const {
          data: rows,
          error
        } = await supabase.from("smart_pairing_slots").select("id").eq("stato", "attiva");
        if (!cancelled) console.info("[STEP3_SMART_PAIRING_SLOTS_LOAD]", {
          count: rows?.length || 0,
          error: error?.message || null
        });
      } catch (err) {
        if (!cancelled) console.info("[STEP3_SMART_PAIRING_SLOTS_LOAD]", {
          count: 0,
          error: err?.message || String(err)
        });
      }
      try {
        const {
          data: rows,
          error
        } = await supabase.from("availability_slots").select("id");
        if (!cancelled) console.info("[STEP3_AVAILABILITY_SLOTS_LOAD]", {
          count: rows?.length || 0,
          error: error?.message || null
        });
      } catch (err) {
        if (!cancelled) console.info("[STEP3_AVAILABILITY_SLOTS_LOAD]", {
          count: 0,
          error: err?.message || String(err)
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const activeZone = data.dateMode === "per_zone" ? (data.campaignZones || []).find(z => z.id === activeCalZoneId) : null;
  useEffect(() => {
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      const z = (data.campaignZones || []).find(x => x.id === activeCalZoneId);
      setSelDays(z?.selectedDates || z?.days || []);
    } else {
      setSelDays(data.selectedDates || data.days || []);
    }
  }, [activeCalZoneId, data.dateMode, data.campaignZones, data.selectedDates, data.days]);
  const getMinMaxDates = dates => {
    if (!dates || dates.length === 0) return {
      start: null,
      end: null
    };
    const sorted = [...dates].sort();
    return {
      start: sorted[0],
      end: sorted[sorted.length - 1]
    };
  };
  const updateDays = newDays => {
    setSelDays(newDays);
    if (data.dateMode === "per_zone" && activeCalZoneId) {
      setData(prev => {
        const minMax = getMinMaxDates(newDays);
        const updatedZones = (prev.campaignZones || []).map(z => {
          if (z.id === activeCalZoneId) {
            return {
              ...z,
              selectedDates: newDays,
              days: newDays,
              startDate: minMax.start,
              endDate: minMax.end,
              start_date: minMax.start,
              end_date: minMax.end
            };
          }
          return z;
        });
        const allDates = updatedZones.reduce((acc, z) => {
          if (z.selectedDates) acc.push(...z.selectedDates);
          return acc;
        }, []);
        const uniqueDates = [...new Set(allDates)];
        const overallMinMax = getMinMaxDates(uniqueDates);
        return {
          ...prev,
          campaignZones: updatedZones,
          selectedDates: uniqueDates,
          days: uniqueDates,
          startDate: overallMinMax.start,
          endDate: overallMinMax.end
        };
      });
    } else {
      setData(prev => {
        const minMax = getMinMaxDates(newDays);
        const updatedZones = (prev.campaignZones || []).map(z => ({
          ...z,
          selectedDates: newDays,
          days: newDays,
          startDate: minMax.start,
          endDate: minMax.end,
          start_date: minMax.start,
          end_date: minMax.end
        }));
        return {
          ...prev,
          selectedDates: newDays,
          days: newDays,
          startDate: minMax.start,
          endDate: minMax.end,
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
    return `${d} ${MONTHS_FULL[parseInt(m)]} ${y}`;
  };
  const selectedInfo = selDays.filter(k => pairs[k]).map(k => ({
    key: k,
    pair: pairs[k]
  }));
  const pairingDays = selectedInfo.filter(x => x.pair).map(x => x.key);
  const normalDays = [];
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
  const basePrice = BASE_PRICES[currentServiceType] || 1.85;
  const activeQty = activeZone ? Number(activeZone.assigned_flyers || 0) : Number(data.qty || 0);
  const baseCost = activeZone ? activeQty / 1000 * basePrice : activeQty / 1000 * basePrice * ((data.campaignZones || []).length || 1);
  const saved = baseCost * (averagePairingDiscount / 100);
  function toggle(d) {
    const k = `${year}-${month}-${d}`;
    if (!pairs[k]) return;
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
        if (z.selectedDates) acc.push(...z.selectedDates);
        return acc;
      }, []);
      const uniqueSelectedDates = [...new Set(allSelectedDates)];
      const minMax = getMinMaxDates(uniqueSelectedDates);
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
        contactRequestData: contactOverride || data.contactRequestData || null,
        startDate: minMax.start,
        endDate: minMax.end
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
      days: [],
      avgDiscount: 0,
      selectedDates: [],
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
      const hasUnplanned = (data.campaignZones || []).some(z => !z.selectedDates || z.selectedDates.length === 0);
      if (hasUnplanned) {
        const firstUnplanned = (data.campaignZones || []).find(z => !z.selectedDates || z.selectedDates.length === 0);
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
    if (selDays.length === 0 && data.dateMode !== "per_zone") {
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
    setNavError("");
    setData(d => ({
      ...d,
      ...buildFinalPayload(null),
      days: [],
      avgDiscount: 0,
      selectedDates: [],
      selectedDaysCount: 0,
      pairingDays: [],
      pairingType: {},
      pairingDiscountPercent: {},
      averagePairingDiscount: 0,
      maxPairingDiscount: 0,
      calendarStatus: "no_smart_pairing",
      smartPairingStatus: "request_based",
      availableDates: [],
      smartPairingSlots: [],
      smartPairingAvailabilitySource: "none"
    }));
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
            <Step1Icon name="sparkles" size={13} color={C.white} /> SMART PAIRING AI
          </span>
          {/* 8. STATO RICERCA BADGE */}
          <span style={{
          padding: "4px 10px",
          borderRadius: 100,
          background: realSmartPairingSlots.length > 0 ? "rgba(46,204,138,0.15)" : "rgba(255,255,255,.07)",
          border: `1px solid ${realSmartPairingSlots.length > 0 ? "rgba(46,204,138,0.4)" : "rgba(255,255,255,.15)"}`,
          color: realSmartPairingSlots.length > 0 ? C.green : "rgba(255,255,255,.7)",
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 700
        }}>
            {realSmartPairingSlots.length > 0 ? selDays.length > 0 ? "● Confermato" : "● Campagne compatibili" : "● Ricerca in corso"}
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
          L'intelligenza artificiale raggruppa automaticamente campagne compatibili nella stessa zona. Quando troviamo campagne compatibili ricevi una notifica e distribuiamo ottimizzando logistica e mezzi.
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
          {[{
          step: "1",
          title: "Hai scelto la zona",
          desc: compactZoneLabel,
          status: "completed"
        }, {
          step: "2",
          title: "L'AI cerca",
          desc: "Campagne compatibili",
          status: "completed"
        }, {
          step: "3",
          title: "Slot proposti",
          desc: "Finestre disponibili",
          status: "active"
        }, {
          step: "4",
          title: "Confermi",
          desc: "Scegli le date",
          status: "future"
        }, {
          step: "5",
          title: "Risparmi",
          desc: "Fino al 40%",
          status: selDays.length > 0 ? "completed" : "future",
          highlight: true
        }].map(item => {
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

      {/* 3. KPI CARDS */}
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
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
      }, {
        label: "Possibile risparmio",
        val: "40%",
        sub: "Solo con abbinamento confermato",
        color: C.yellow,
        tip: "Risparmio massimo potenziale, applicabile soltanto quando il backend conferma uno Smart Pairing compatibile."
      }] : [{
        label: "Possibile risparmio",
        val: "40%",
        sub: "Fino a -40% in zona",
        color: C.green,
        tip: "Percentuale di risparmio ottenibile condividendo il percorso con un'altra campagna nella stessa zona."
      }, {
        label: "Campagne compatibili",
        val: realSmartPairingSlots.length > 0 ? realSmartPairingSlots.length : "0",
        sub: realSmartPairingSlots.length > 0 ? "In quest'area" : "In ricerca continua",
        color: C.cyan,
        tip: "Numero di campagne attive nell'area che possono essere abbinate alla tua per ridurre i costi."
      }, {
        label: "Operatori disponibili",
        val: realSmartPairingSlots.length > 0 ? Math.max(4, Math.round((activeQty || 10000) / 2500)) : "4+",
        sub: "Squadra di zona",
        color: C.white,
        tip: "Numero di operatori già attivi nella zona che possono gestire anche la tua distribuzione."
      }, {
        label: "Tempo medio attesa",
        val: realSmartPairingSlots.length > 0 ? "0 giorni" : "2 giorni",
        sub: realSmartPairingSlots.length > 0 ? "Disponibile ora" : "Notifica prioritaria",
        color: C.white,
        tip: "Tempo stimato prima di poter iniziare la distribuzione condividendo le risorse operative."
      }]).map((kpi, i) => <div key={i} style={{
        background: "rgba(255,255,255,0.035)",
        borderRadius: 16,
        padding: "20px",
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
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

          {/* 4 & 9. CALENDARIO COMPATTO OPPURE CASO "NESSUNO SLOT" */}
          {realSmartPairingSlots.length === 0 ? <motion.div initial={{
          opacity: 0,
          y: 10
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          duration: 0.2
        }} style={{
          background: "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.03) 100%)",
          borderRadius: 20,
          padding: "32px 26px",
          border: "1px solid rgba(251,191,36,0.25)",
          textAlign: "center",
          marginBottom: 28,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
        }}>
              <div style={{
            width: 54,
            height: 54,
            borderRadius: "50%",
            background: "rgba(251,191,36,0.15)",
            color: C.yellow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px"
          }}><Step1Icon name="search" size={26} color={C.yellow} /></div>
              <h3 style={{
            fontFamily: F.serif,
            fontSize: 24,
            color: C.white,
            marginBottom: 8
          }}>Nessuna campagna compatibile al momento.</h3>
              <p style={{
            fontFamily: F.sans,
            fontSize: 14,
            color: "rgba(255,255,255,0.7)",
            maxWidth: 520,
            margin: "0 auto 24px",
            lineHeight: 1.6
          }}>
                L'AI continua automaticamente la ricerca nelle prossime ore. Riceverai una notifica appena sarà disponibile uno Smart Pairing compatibile con la tua zona.
              </p>
              <div style={{
            display: "flex",
            gap: 12,
            justifyContent: "center",
            flexWrap: "wrap"
          }}>
                {!formSent && <button onClick={() => setShowRequest(true)} style={{
              padding: "12px 24px",
              borderRadius: 10,
              background: "linear-gradient(135deg, #E8571A 0%, #D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 800,
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(232,87,26,0.4)"
            }}>
                    Attivami
                  </button>}
                <button onClick={handleSkipPairing} style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer"
            }}>
                  Continua senza Smart Pairing →
                </button>
              </div>
            </motion.div> : <div style={{
          marginBottom: 28
        }}>
              <div style={{
            display: "flex",
            gap: 14,
            marginBottom: 14,
            flexWrap: "wrap"
          }}>
                {[{
              c: C.green,
              l: "Verde: Smart Pairing stessa zona confermato"
            }, {
              c: C.purple,
              l: "Viola/Blu: Smart Pairing zona compatibile confermato"
            }, {
              c: C.orange,
              l: "Bordo/check: selezionato"
            }].map(({
              c,
              l
            }) => <div key={l} style={{
              display: "flex",
              alignItems: "center",
              gap: 6
            }}>
                    <div style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: c,
                flexShrink: 0
              }} />
                    <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.6)"
              }}>{l}</span>
                  </div>)}
              </div>

              <div style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 14
          }}>
                <button onClick={() => {
              if (month > 0) setMonth(m => m - 1);else {
                setMonth(11);
                setYear(y => y - 1);
              }
            }} style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
              color: C.white,
              cursor: "pointer",
              fontSize: 14
            }}>-</button>
                <span style={{
              fontFamily: F.serif,
              fontSize: 20,
              color: C.white,
              minWidth: 165,
              textAlign: "center"
            }}>{MONTHS_FULL[month]} {year}</span>
                <button onClick={() => {
              if (month < 11) setMonth(m => m + 1);else {
                setMonth(0);
                setYear(y => y + 1);
              }
            }} style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(255,255,255,.04)",
              color: C.white,
              cursor: "pointer",
              fontSize: 14
            }}>+ </button>
              </div>

              <div style={{
            position: "relative",
            background: "rgba(255,255,255,.03)",
            borderRadius: 16,
            padding: 16,
            border: "1px solid rgba(255,255,255,.08)",
            overflow: "hidden"
          }}>
                <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              gap: 4,
              marginBottom: 6
            }}>
                  {DI.map(d => <div key={d} style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,.3)",
                textAlign: "center",
                padding: "4px 0"
              }}>{d}</div>)}
                </div>
                <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(7,1fr)",
              gap: 4
            }}>
                  {Array(fdow(month, year)).fill(null).map((_, i) => <div key={`e${i}`} />)}
                  {Array(dim(month, year)).fill(null).map((_, i) => {
                const d = i + 1,
                  k = `${year}-${month}-${d}`,
                  pair = pairs[k];
                const sel = selDays.includes(k);
                let bg = "rgba(255,255,255,.025)",
                  border = "1px solid rgba(255,255,255,.04)",
                  tc = "rgba(255,255,255,.22)";
                if (sel && pair) {
                  bg = pair.type === "same" ? "rgba(46,204,138,.25)" : "rgba(167,139,250,.22)";
                  border = `2px solid ${pair.type === "same" ? C.green : C.purple}`;
                  tc = C.white;
                } else if (pair?.type === "same") {
                  bg = "rgba(46,204,138,.1)";
                  border = "1px solid rgba(46,204,138,.3)";
                  tc = C.green;
                } else if (pair?.type === "nearby") {
                  bg = "rgba(167,139,250,.1)";
                  border = "1px solid rgba(167,139,250,.3)";
                  tc = C.purple;
                }
                return <div key={d} onClick={() => toggle(d)} style={{
                  minHeight: isMobile ? 44 : 52,
                  borderRadius: 8,
                  padding: "6px 2px",
                  textAlign: "center",
                  cursor: pair ? "pointer" : "default",
                  background: bg,
                  border,
                  transition: "all .15s"
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: sel ? 700 : 400,
                    color: tc,
                    marginBottom: 1
                  }}>{d}</div>
                        {pair && !sel && <div style={{
                    fontFamily: F.sans,
                    fontSize: 8,
                    fontWeight: 700,
                    color: pair.type === "same" ? C.green : C.purple,
                    marginTop: 2
                  }}>-{pair.disc}%</div>}
                        {sel && <div style={{
                    fontSize: 8,
                    marginTop: 2,
                    color: C.white,
                    fontWeight: 800
                  }}>-{pair.disc}%</div>}
                      </div>;
              })}
                </div>
              </div>
              <button onClick={() => {
            setShowRequest(v => !v);
            setSelDays([]);
            setFormSent(false);
            setSmartPairingRegistered(false);
            setFormError("");
          }} style={{
            marginTop: 14,
            padding: "11px 15px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.04)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            width: "100%"
          }}>
                Non trovo il giorno che voglio · Avvisami per date diverse
              </button>
            </div>}

          {showRequest && <div style={{
          marginBottom: 28,
          borderRadius: 16,
          padding: "22px",
          background: "rgba(255,255,255,.05)",
          border: "2px solid rgba(251,191,36,.3)"
        }}>
              {shouldShowContinueToStep4 ? <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 14
          }}>
                  <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 4px"
            }}>
                    <span style={{
                color: C.green,
                fontWeight: 900,
                fontSize: 22
              }}>✓</span>
                    <div style={{
                fontFamily: F.sans,
                fontSize: 14,
                color: C.white,
                fontWeight: 600,
                lineHeight: 1.5
              }}>
                      Richiesta registrata. Ti avviseremo appena ci sono slot compatibili.
                    </div>
                  </div>
                  <button className="btn" onClick={handleContinueToStep4} style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(232,87,26,0.35)"
            }}>
                    Continua al preventivo →
                  </button>
                </div> : <>
                  <div style={{
              fontFamily: F.serif,
              fontSize: 20,
              color: C.white,
              marginBottom: 6
            }}>Richiedi avviso Smart Pairing</div>
                  <div style={{
              fontFamily: F.sans,
              fontSize: 13,
              color: "rgba(255,255,255,.6)",
              lineHeight: 1.55,
              marginBottom: 16
            }}>
                    Ti avviseremo via WhatsApp o Email quando lavoriamo nella tua zona o in una zona vicina compatibile.
                  </div>
                  <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 14
            }}>
                    <input value={form.nome} onChange={e => setForm(f => ({
                ...f,
                nome: e.target.value
              }))} placeholder="Nome e Cognome" style={inputStyle} />
                    <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 12
              }}>
                      <div>
                        <div style={{
                    display: "flex",
                    alignItems: "center",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.07)",
                    overflow: "hidden",
                    transition: "border-color .2s, box-shadow .2s"
                  }}>
                          <span style={{
                      alignSelf: "stretch",
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0 12px",
                      background: "rgba(46,204,138,.12)",
                      borderRight: "1px solid rgba(255,255,255,.1)",
                      color: C.green,
                      fontFamily: F.sans,
                      fontSize: 14,
                      fontWeight: 900
                    }}>+39</span>
                          <input value={form.telefono} onChange={e => setForm(f => ({
                      ...f,
                      telefono: sanitizeWhatsAppLocal(e.target.value)
                    }))} placeholder="327 123 4567" type="tel" inputMode="numeric" style={{
                      ...inputStyle,
                      border: "none",
                      background: "transparent",
                      borderRadius: 0,
                      paddingLeft: 12
                    }} />
                        </div>
                      </div>
                      <input value={form.email} onChange={e => setForm(f => ({
                  ...f,
                  email: e.target.value
                }))} placeholder="Email" type="email" style={inputStyle} />
                    </div>
                    <div style={{
                padding: 14,
                borderRadius: 14,
                background: "rgba(255,255,255,.035)",
                border: "1px solid rgba(255,255,255,.09)"
              }}>
                      <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 12,
                  flexWrap: "wrap"
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    color: "rgba(255,255,255,.58)",
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    textTransform: "uppercase"
                  }}>Periodo preferito</div>
                        <div style={{
                    color: "rgba(255,255,255,.48)",
                    fontSize: 16
                  }}>CAL</div>
                      </div>
                      <div style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 12
                }}>
                        {[["single_date", "Data singola"], ["date_range", "Intervallo date"], ["weekdays", "Giorni preferiti"], ["text", "Testo libero"]].map(([type, label]) => {
                    const active = (form.preferredPeriod?.type || "single_date") === type;
                    return <button key={type} type="button" onClick={() => updatePreferredPeriod({
                      type
                    })} style={{
                      padding: "7px 10px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.12)"}`,
                      background: active ? "rgba(46,204,138,.13)" : "rgba(255,255,255,.035)",
                      color: active ? C.green : "rgba(255,255,255,.68)",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}>
                              {label}
                            </button>;
                  })}
                      </div>
                      {(form.preferredPeriod?.type || "single_date") === "single_date" && <input type="date" value={form.preferredPeriod?.startDate || ""} onChange={e => updatePreferredPeriod({
                  startDate: e.target.value
                })} style={inputStyle} />}
                      {form.preferredPeriod?.type === "date_range" && <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: 10
                }}>
                          <input type="date" value={form.preferredPeriod?.startDate || ""} onChange={e => updatePreferredPeriod({
                    startDate: e.target.value
                  })} style={inputStyle} />
                          <input type="date" value={form.preferredPeriod?.endDate || ""} onChange={e => updatePreferredPeriod({
                    endDate: e.target.value
                  })} style={inputStyle} />
                        </div>}
                      {form.preferredPeriod?.type === "weekdays" && <div style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap"
                }}>
                          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab"].map(day => {
                    const active = (form.preferredPeriod?.weekdays || []).includes(day);
                    return <button key={day} type="button" onClick={() => togglePreferredWeekday(day)} style={{
                      minWidth: 46,
                      padding: "9px 10px",
                      borderRadius: 10,
                      border: `1px solid ${active ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.12)"}`,
                      background: active ? "rgba(46,204,138,.14)" : "rgba(255,255,255,.04)",
                      color: active ? C.green : "rgba(255,255,255,.72)",
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 850,
                      cursor: "pointer"
                    }}>{day}</button>;
                  })}
                        </div>}
                      {form.preferredPeriod?.type === "text" && <input value={form.preferredPeriod?.text || ""} onChange={e => updatePreferredPeriod({
                  text: e.target.value
                })} placeholder="Seleziona una data o scrivi giorni preferiti" style={inputStyle} />}
                      <div style={{
                  marginTop: 8,
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.42)"
                }}>Esempio: 3 agosto, prossima settimana, lun-mar</div>
                    </div>
                    <textarea value={form.note || ""} onChange={e => setForm(f => ({
                ...f,
                note: e.target.value
              }))} placeholder="Note opzionali" rows={3} style={{
                ...inputStyle,
                resize: "vertical"
              }} />
                  </div>
                  {formError && <div style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "rgba(248,113,113,.15)",
              border: "1px solid rgba(248,113,113,.3)",
              fontFamily: F.sans,
              fontSize: 12,
              color: C.red,
              marginBottom: 12
            }}>{formError}</div>}
                  <button className="btn" onClick={handleRequestSubmit} style={{
              width: "100%",
              padding: "14px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(99,102,241,0.3)"
            }}>
                    Avvisami appena ci sono slot compatibili
                  </button>
                </>}
            </div>}

          {/* 5. PERCHÉ CONVIENE */}
          <div style={{
          background: "rgba(255,255,255,0.025)",
          borderRadius: 18,
          padding: "24px",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24
        }}>
            <h3 style={{
            fontFamily: F.serif,
            fontSize: 22,
            color: C.white,
            marginBottom: 16
          }}>Perché scegliere Smart Pairing?</h3>
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 12
          }}>
              {["Risparmio economico fino al 40%", "Minore impatto ambientale", "Maggiore efficienza logistica", "Distribuzione ottimizzata in zona", "Stesso report finale certificato GPS"].map((adv, idx) => <div key={idx} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(46,204,138,0.06)",
              border: "1px solid rgba(46,204,138,0.18)"
            }}>
                  <span style={{
                color: C.green,
                fontWeight: 900,
                fontSize: 15
              }}>✓</span>
                  <span style={{
                fontFamily: F.sans,
                fontSize: 13,
                color: "rgba(255,255,255,0.88)",
                fontWeight: 600
              }}>{adv}</span>
                </div>)}
            </div>
          </div>

          {/* 6. COME FUNZIONA */}
          <div id="smart-pairing-how" style={{
          background: "rgba(255,255,255,0.025)",
          borderRadius: 18,
          padding: "24px",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24
        }}>
            <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            color: "#E8571A",
            textTransform: "uppercase",
            letterSpacing: ".1em",
            marginBottom: 6
          }}>Algoritmo di abbinamento</div>
            <h3 style={{
            fontFamily: F.serif,
            fontSize: 22,
            color: C.white,
            marginBottom: 14
          }}>Come funziona l'AI</h3>
            <p style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.6,
            marginBottom: 16
          }}>
              L'AI confronta costantemente i flussi di distribuzione analizzando i seguenti parametri:
            </p>
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
            gap: 10,
            marginBottom: 18
          }}>
              {[{
              icon: "pin",
              label: "Zona"
            }, {
              icon: "package",
              label: "Quantità"
            }, {
              icon: "calendar",
              label: "Periodo"
            }, {
              icon: "family",
              label: "Operatori"
            }, {
              icon: "lightning",
              label: "Disponibilità"
            }, {
              icon: "map",
              label: "Itinerari"
            }].map((param, idx) => <div key={idx} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: F.sans,
              fontSize: 13,
              color: C.white,
              fontWeight: 600
            }}>
                  <Step1Icon name={param.icon} size={16} color={C.white} />
                  <span>{param.label}</span>
                </div>)}
            </div>
            <div style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(232,87,26,0.1)",
            border: "1px solid rgba(232,87,26,0.3)",
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,0.92)",
            fontWeight: 600,
            lineHeight: 1.5
          }}>
              Successivamente crea automaticamente gruppi di distribuzione compatibili, abbattendo i costi di uscita logistica.
            </div>
          </div>

          {/* 10. MIGLIORARE LA FIDUCIA */}
          <div style={{
          background: "rgba(255,255,255,0.025)",
          borderRadius: 18,
          padding: "24px",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 24
        }}>
            <h3 style={{
            fontFamily: F.serif,
            fontSize: 20,
            color: C.white,
            marginBottom: 10
          }}>Come viene calcolato il risparmio?</h3>
            <p style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.6,
            marginBottom: 14
          }}>
              Il sistema confronta automaticamente: <b style={{
              color: C.white
            }}>stessa zona, stesso periodo, quantità, disponibilità operatori e percorsi stradali</b>.
            </p>
            <div style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(46,204,138,0.08)",
            borderLeft: `3px solid ${C.green}`,
            fontFamily: F.sans,
            fontSize: 12,
            color: "rgba(255,255,255,0.85)",
            lineHeight: 1.55
          }}>
              <Step1Icon name="lock" size={15} color="rgba(255,255,255,0.85)" style={{
              flexShrink: 0,
              marginTop: 2
            }} />
              <span><b>Garanzia trasparenza:</b> Il risparmio mostrato deriva esclusivamente da campagne realmente compatibili. <b>Non vengono utilizzati dati casuali.</b></span>
            </div>
          </div>
        </div>

        {/* 7. SIDEBAR — MOSTRARE SEMPRE */}
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: isMobile ? "relative" : "sticky",
        top: 24
      }}>
          <div style={{
          background: "rgba(255,255,255,.04)",
          borderRadius: 20,
          padding: "24px",
          border: "1px solid rgba(255,255,255,.1)",
          boxShadow: "0 14px 35px rgba(0,0,0,0.3)"
        }}>
            <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(255,255,255,.08)"
          }}>
              <span style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: "rgba(255,255,255,.4)",
              textTransform: "uppercase",
              letterSpacing: ".1em"
            }}>Riepilogo Smart Pairing</span>
              <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: realSmartPairingSlots.length > 0 ? C.green : C.yellow,
              boxShadow: `0 0 10px ${realSmartPairingSlots.length > 0 ? C.green : C.yellow}`
            }} />
            </div>
            
            <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 13,
            fontFamily: F.sans,
            fontSize: 13
          }}>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Servizio</span>
                <span style={{
                color: C.white,
                fontWeight: 700
              }}>{svcLabel}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Zone</span>
                <div style={{
                textAlign: "right"
              }}>
                  <div style={{
                  color: C.white,
                  fontWeight: 700
                }}>{compactZoneLabel}</div>
                  {allZonesList.length > 1 && <button type="button" onClick={() => setShowZoneDetails(!showZoneDetails)} style={{
                  background: "none",
                  border: "none",
                  color: "#E8571A",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  padding: 0,
                  marginTop: 2
                }}>
                      {showZoneDetails ? "▲ Nascondi elenco" : "• Visualizza elenco"}
                    </button>}
                </div>
              </div>
              {showZoneDetails && allZonesList.length > 1 && <motion.div initial={{
              opacity: 0,
              height: 0
            }} animate={{
              opacity: 1,
              height: "auto"
            }} transition={{
              duration: 0.2
            }} style={{
              padding: "10px 12px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: 8,
              fontSize: 11,
              color: "#CBD5E1",
              maxHeight: 130,
              overflowY: "auto",
              lineHeight: 1.5
            }}>
                  {allZonesList.join(" · ")}
                </motion.div>}
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Quantità</span>
                <span style={{
                color: C.white,
                fontWeight: 700
              }}>{activeQty.toLocaleString("it-IT")} vol.</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Possibile sconto</span>
                <span style={{
                color: C.green,
                fontWeight: 800
              }}>{averagePairingDiscount > 0 ? `-${averagePairingDiscount}%` : "Fino a -40%"}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Tempo stimato</span>
                <span style={{
                color: C.white,
                fontWeight: 600
              }}>{realSmartPairingSlots.length > 0 ? "Immediato" : "2-3 giorni"}</span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
                <span style={{
                color: "rgba(255,255,255,.5)"
              }}>Stato ricerca</span>
                <span style={{
                padding: "3px 8px",
                borderRadius: 6,
                background: realSmartPairingSlots.length > 0 ? selDays.length > 0 ? "rgba(46,204,138,0.15)" : "rgba(6,182,212,0.15)" : "rgba(255,255,255,.07)",
                color: realSmartPairingSlots.length > 0 ? selDays.length > 0 ? C.green : C.cyan : "rgba(255,255,255,.7)",
                fontSize: 11,
                fontWeight: 700
              }}>
                  {realSmartPairingSlots.length > 0 ? selDays.length > 0 ? "Confermato" : "Compatibili" : "Ricerca in corso"}
                </span>
              </div>
              <div style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: 10,
              borderTop: "1px solid rgba(255,255,255,.08)"
            }}>
                <span style={{
                color: "rgba(255,255,255,.6)"
              }}>Slot disponibili</span>
                <span style={{
                color: realSmartPairingSlots.length > 0 ? C.green : C.white,
                fontWeight: 800,
                fontSize: 15
              }}>{realSmartPairingSlots.length}</span>
              </div>
            </div>
          </div>

          <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}>
            {selDays.length > 0 ? <button className="btn" onClick={handlePrimary} style={{
            width: "100%",
            padding: "16px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(232,87,26,0.35)",
            transition: "all .2s"
          }}>
                Attivami e genera preventivo
              </button> : realSmartPairingSlots.length > 0 ? <div style={{
            padding: "10px",
            textAlign: "center",
            fontFamily: F.sans,
            fontSize: 12,
            color: "rgba(255,255,255,.5)"
          }}>
                Scegli una o più date compatibili per continuare
              </div> : null}
            {navError && <div style={{
            padding: "9px 12px",
            borderRadius: 8,
            background: "rgba(248,113,113,.12)",
            border: "1px solid rgba(248,113,113,.3)",
            fontFamily: F.sans,
            fontSize: 12,
            color: C.red
          }}>
                {navError}
              </div>}
            
            <button className="btn" onClick={handleSkipPairing} style={{
            width: "100%",
            padding: "13px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(255,255,255,.03)",
            color: "rgba(255,255,255,.85)",
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all .2s"
          }}>
              Continua senza Smart Pairing →
            </button>
            <NavButton onClick={handleBackToZone} full>{"\u2190 Zona e mappa"}</NavButton>
          </div>
        </div>
      </div>
    </div>;
}

