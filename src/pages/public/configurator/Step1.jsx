import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../../lib/constants.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function Step1({
  data,
  setData,
  onNext,
  onHome
}) {
  const isMobile = useIsMobile();
  const [showSmartPairingModal, setShowSmartPairingModal] = useState(false);
  const [resolvingOperationalLocation, setResolvingOperationalLocation] = useState(false);
  const [operationalLocationError, setOperationalLocationError] = useState("");
  const updateData = useCallback(newVals => {
    setData(prev => {
      const next = {
        ...prev,
        ...newVals
      };
      const monthsMult = {
        single: 1,
        monthly3: 3,
        monthly6: 6,
        monthly12: 12
      };
      const discountMult = {
        single: 0,
        monthly3: 5,
        monthly6: 10,
        monthly12: 15
      };
      const mMult = monthsMult[next.subscription] || 1;
      const pDisc = discountMult[next.subscription] || 0;
      const cPerMonth = next.subscription === "single" ? 1 : next.campaignsPerMonth || 1;
      // Keep the existing "stampa" extraService (and its Step4 pricing formula,
      // unchanged) in sync with the new printing module's enabled state —
      // does not invent a new price, just reuses the one that already exists.
      const printingEnabled = Boolean(next.printing?.enabled);
      const extraServicesWithPrint = printingEnabled ? [...new Set([...(next.extraServices || []), "stampa"])] : (next.extraServices || []).filter(s => s !== "stampa");
      // Punti Vetrina only makes sense on Door to Door — force it off the
      // moment the service changes away from d2d, however that happens.
      const puntiVetrinaForService = next.type === "d2d" ? Boolean(next.puntiVetrina) : false;
      return {
        ...next,
        extraServices: extraServicesWithPrint,
        puntiVetrina: puntiVetrinaForService,
        campaignsPerMonth: cPerMonth,
        selectedService: next.type,
        businessSector: next.activityType,
        flyerQuantity: next.qty,
        campaignPeriodStart: next.startDate,
        campaignPeriodEnd: next.endDate,
        alreadyPrinted: next.hasFlyers === "yes",
        printServices: extraServicesWithPrint.filter(s => ["stampa", "grafica"].includes(s)),
        paperWeight: next.printing?.grammage || next.printGramm,
        printSides: next.printing?.sides || next.printSide,
        colorMode: next.printing?.color || next.printColor,
        campaignPlan: next.subscription,
        totalCampaigns: cPerMonth * mMult,
        planDiscount: pDisc,
        promoterCount: next.promoterCount,
        timeSlot: next.timeSlot,
        serviceDurationHours: next.serviceDurationHours,
        distributionLocation: next.distributionLocation,
        distributionPointType: next.distributionPointType,
        operationalNotes: next.operationalNotes,
        targetBusinessType: next.targetBusinessType,
        businessCategory: next.businessCategory,
        targetBusinessCount: next.targetBusinessCount,
        businessZone: next.businessZone,
        deliveryType: next.deliveryType
      };
    });
  }, [setData]);
  const toggleExtra = serviceId => {
    const current = data.extraServices || [];
    const nextExtras = current.includes(serviceId) ? current.filter(s => s !== serviceId) : [...current, serviceId];
    updateData({
      extraServices: nextExtras
    });
  };
  const formatDateDisplay = isoStr => {
    if (!isoStr) return "";
    const parts = isoStr.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "";
  };
  const maskDateInput = val => {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  };
  const parseDateToIso = val => {
    const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "";
    const [, d, m, y] = match;
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    if (dateObj.getFullYear() !== Number(y) || dateObj.getMonth() !== Number(m) - 1 || dateObj.getDate() !== Number(d)) return "";
    return `${y}-${m}-${d}`;
  };
  const periodPresets = [{
    id: "asap",
    icon: "lightning",
    label: "Prima possibile",
    desc: "Avvio appena ultimata la preparazione logistica"
  }, {
    id: "within7",
    icon: "calendar",
    label: "Entro 7 giorni",
    desc: "Distribuzione programmata nella prossima settimana"
  }, {
    id: "within15",
    icon: "calendarDays",
    label: "Entro 15 giorni",
    desc: "Pianificazione strategica a breve termine"
  }, {
    id: "custom",
    icon: "target",
    label: "Scelgo la data",
    desc: "Definisci tu il periodo esatto di inizio e fine"
  }];
  const materialOptions = [{
    id: "yes",
    icon: "package",
    label: "No, ho già i volantini",
    desc: "Fornisci tu il materiale pronto per la distribuzione logistica"
  }, {
    id: "no",
    icon: "printer",
    label: "Sì, voglio anche stampa",
    desc: "Aggiungiamo la stampa tipografica professionale al preventivo finale"
  }];
  const printFormatOptions = [{
    id: "A6",
    label: "A6",
    size: "10x15 cm"
  }, {
    id: "A5",
    label: "A5",
    size: "15x21 cm"
  }, {
    id: "A4",
    label: "A4",
    size: "21x29 cm"
  }];
  const printPaperTypeOptions = [{
    id: "patinata_lucida",
    label: "Patinata lucida"
  }, {
    id: "patinata_opaca",
    label: "Patinata opaca"
  }, {
    id: "uso_mano",
    label: "Uso mano"
  }];
  const printGrammageOptions = [{
    id: "90",
    label: "90g"
  }, {
    id: "115",
    label: "115g"
  }, {
    id: "130",
    label: "130g"
  }, {
    id: "170",
    label: "170g"
  }];
  const printSidesOptions = [{
    id: "fronte",
    label: "Solo fronte"
  }, {
    id: "fronte_retro",
    label: "Fronte/retro"
  }];
  const printColorOptions = [{
    id: "colori",
    label: "Colori"
  }, {
    id: "bianco_nero",
    label: "Bianco/nero"
  }];
  const printFoldingOptions = [{
    id: "nessuna",
    label: "Nessuna"
  }, {
    id: "meta",
    label: "Piega a metà"
  }, {
    id: "tre",
    label: "Piega a tre"
  }];
  const printArtworkOptions = [{
    id: "pronto",
    label: "Già pronto"
  }, {
    id: "da_creare",
    label: "Da creare"
  }];
  const printing = {
    format: String(data.flyerFormat || "A5").toUpperCase(),
    grammage: String(data.paperWeight || data.printGramm || "115"),
    sides: data.printSides || data.printSide || "fronte",
    color: data.colorMode === "cmyk" ? "colori" : data.colorMode || data.printColor || "colori",
    folding: "nessuna",
    artworkStatus: "pronto",
    ...(data.printing || {})
  };
  const updatePrinting = patch => updateData({
    printing: {
      ...printing,
      ...patch
    }
  });
  const priorityOptions = [{
    id: "normal",
    label: "Standard",
    desc: "5–7 giorni lavorativi • Pianificazione ordinaria",
    badge: ""
  }, {
    id: "urgent",
    label: "Urgente",
    desc: "Avvio rapido in 24–48h ove disponibile • Maggiorazione +20%",
    badge: "Rapido"
  }, {
    id: "express",
    label: "Express",
    desc: "Priorità massima immediata e dedicata • Maggiorazione +35%",
    badge: "Prioritario"
  }];
  const planOptions = [{
    id: "single",
    label: "Singola",
    subtitle: "Una sola campagna",
    disc: 0
  }, {
    id: "monthly3",
    label: "Trimestrale",
    subtitle: "Pianificazione 3 mesi",
    disc: 5
  }, {
    id: "monthly6",
    label: "Semestrale",
    subtitle: "Pianificazione 6 mesi",
    disc: 10
  }, {
    id: "monthly12",
    label: "Annuale",
    subtitle: "Pianificazione 12 mesi",
    disc: 15
  }];
  const baseRate = {
    d2d: 18.5,
    h2h: 22.0,
    b2b: 35.0,
    "business-distribution": 35.0
  }[data.type || "d2d"] || 18.5;
  const activeQty = data.qty || 10000;
  const distEst = activeQty / 1000 * baseRate;
  const printEst = data.hasFlyers === "no" ? Math.round(activeQty / 1000 * 29) : 0;
  let subtotalEst = distEst + printEst;
  if (data.urgency === "urgent") subtotalEst *= 1.2;
  if (data.urgency === "express") subtotalEst *= 1.35;
  const discPct = {
    single: 0,
    monthly3: 5,
    monthly6: 10,
    monthly12: 15
  }[data.subscription] || 0;
  if (discPct > 0) subtotalEst = subtotalEst * (1 - discPct / 100);
  const totalEstFormatted = Math.round(subtotalEst).toLocaleString("it-IT");
  const handleContinue = async () => {
    const isBusinessService = data.type === "b2b" || data.type === "business-distribution";
    if (step1Issues.length > 0) {
      const firstIssue = step1Issues[0];
      setOperationalLocationError(firstIssue.label);
      document.getElementById(firstIssue.id)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      return;
    }
    if (data.type === "h2h") {
      if (!Array.isArray(data.distributionTargets) || data.distributionTargets.length === 0) {
        setOperationalLocationError("Seleziona almeno un tipo di luogo dove distribuire.");
        document.getElementById("section-distribution-targets")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (!data.promoterCount || !data.timeSlot || !data.serviceDurationHours) {
        setOperationalLocationError("Seleziona numero promoter, fascia oraria e durata del servizio.");
        document.getElementById("section-h2h-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (!String(promoterAssignments[0]?.location || "").trim()) {
        setOperationalLocationError("Inserisci almeno il comune o il punto di partenza del Promoter 1.");
        document.getElementById("section-h2h-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      setResolvingOperationalLocation(true);
      setOperationalLocationError("");
      try {
        const resolvedAssignments = [];
        const savedAssignments = promoterAssignments.map(assignment => ({
          ...assignment
        }));
        const parentCities = [];
        const resolvedLocationCache = new Map();
        for (let index = 0; index < promoterAssignments.length; index += 1) {
          if (!String(promoterAssignments[index]?.location || "").trim()) continue;
          try {
            const currentAssignment = promoterAssignments[index];
            const locationCacheKey = `${normalizeTerritoryName(currentAssignment.location)}|${normalizeTerritoryName(currentAssignment.pointType)}`;
            let resolved = resolvedLocationCache.get(locationCacheKey);
            if (!resolved) {
              resolved = await geocodePromoterAssignment(currentAssignment);
              resolvedLocationCache.set(locationCacheKey, resolved);
            }
            const resolvedPoint = {
              ...resolved.point,
              ...currentAssignment,
              label: resolved.point.label,
              lat: resolved.point.lat,
              lng: resolved.point.lng,
              parentComune: resolved.point.parentComune,
              city: resolved.point.city,
              precision: resolved.point.precision,
              unconfirmed: resolved.point.unconfirmed,
              source: resolved.point.source,
              promoterNumber: index + 1,
              assignedQuantity: Math.max(1, Number(promoterAssignments[index]?.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR,
              microRadiusMeters: 400,
              timeSlot: promoterAssignments[index]?.timeSlot || data.timeSlot,
              serviceDurationHours: Math.max(1, Number(promoterAssignments[index]?.serviceDurationHours || serviceDurationHours))
            };
            resolvedAssignments.push(resolvedPoint);
            savedAssignments[index] = resolvedPoint;
            parentCities.push(resolved.parentCity);
          } catch (error) {
            error.promoterNumber = index + 1;
            throw error;
          }
        }
        const primaryPoint = resolvedAssignments[0];
        const primaryCity = parentCities[0];
        flushSync(() => {
          setData(prev => ({
            ...prev,
            city: primaryCity,
            cityName: primaryCity.label || primaryCity.name,
            searchedLocation: primaryPoint.label,
            selectedComuni: Array.from(new Map(parentCities.map(item => [getMunicipalityDedupKey(item), item])).values()),
            selectedSearchPoint: primaryPoint,
            promoterAssignments: savedAssignments,
            operationalPoints: resolvedAssignments,
            h2hEstimatedCapacity: promoterAssignments.reduce((total, assignment) => total + Math.max(1, Number(assignment.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR, 0),
            distributionLocation: primaryPoint.location,
            distributionPointType: primaryPoint.pointType,
            searchMode: "address",
            radius: Number(prev.radius || 3),
            radiusKm: Number(prev.radius || 3),
            selectedRadius: Number(prev.radius || 3),
            radiusSelectionConfirmed: true,
            zones: [],
            selectedZones: [],
            coverageDecision: null,
            coverageStrategy: null
          }));
        });
      } catch (error) {
        const promoterLabel = error?.promoterNumber ? ` del Promoter ${error.promoterNumber}` : "";
        const firstLocation = String(promoterAssignments[0]?.location || "").trim();
        const normalizedFirstLocation = normalizeTerritoryName(firstLocation);
        const fallbackCity = GEO_DATA.find(known => {
          const normalizedKnown = normalizeTerritoryName(known.name || known.label || "");
          return normalizedFirstLocation === normalizedKnown || normalizedFirstLocation.startsWith(`${normalizedKnown} `) || normalizedFirstLocation.includes(` ${normalizedKnown} `);
        }) || (Number.isFinite(Number(data.city?.lat)) && Number.isFinite(Number(data.city?.lng)) ? data.city : null);
        if (fallbackCity) {
          const recoveredCity = {
            ...fallbackCity,
            label: fallbackCity.label || fallbackCity.name
          };
          const recoveredPoint = {
            ...promoterAssignments[0],
            label: `${firstLocation || recoveredCity.label} (centro area indicativo)`,
            lat: Number(recoveredCity.lat),
            lng: Number(recoveredCity.lng),
            type: "operational_point",
            parentComune: recoveredCity.label || recoveredCity.name,
            city: recoveredCity.label || recoveredCity.name,
            precision: "municipality_recovery",
            unconfirmed: true,
            source: "step1_recovery",
            promoterNumber: 1,
            assignedQuantity: Math.max(1, Number(promoterAssignments[0]?.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR,
            microRadiusMeters: 400
          };
          setData(prev => ({
            ...prev,
            city: recoveredCity,
            cityName: recoveredCity.label || recoveredCity.name,
            searchedLocation: recoveredPoint.label,
            selectedComuni: [recoveredCity],
            selectedSearchPoint: recoveredPoint,
            promoterAssignments: promoterAssignments.map((assignment, index) => index === 0 ? recoveredPoint : assignment),
            operationalPoints: [recoveredPoint],
            h2hEstimatedCapacity: promoterAssignments.reduce((total, assignment) => total + Math.max(1, Number(assignment.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR, 0),
            distributionLocation: firstLocation,
            distributionPointType: promoterAssignments[0]?.pointType || "",
            searchMode: "address",
            radius: Number(prev.radius || 3),
            radiusKm: Number(prev.radius || 3),
            selectedRadius: Number(prev.radius || 3),
            radiusSelectionConfirmed: true,
            zones: [],
            selectedZones: [],
            coverageDecision: null,
            coverageStrategy: null
          }));
          setOperationalLocationError("");
          if (import.meta.env.DEV) console.info(`[STEP1_PROMOTER_LOCATION_RECOVERED] ${error?.message || "UNKNOWN_ERROR"} -> ${recoveredCity.label || recoveredCity.name}`);
          setResolvingOperationalLocation(false);
          onNext();
          return;
        }
        const diagnosticCode = error?.message || "UNKNOWN_GEOCODING_ERROR";
        setOperationalLocationError(`Non riesco a trovare il punto${promoterLabel}. Inserisci anche il comune (es. Varedo, Via Roma). Codice: ${diagnosticCode}`);
        if (import.meta.env.DEV) console.warn(`[STEP1_PROMOTER_LOCATION_BLOCKED] promoter=${error?.promoterNumber || "?"} error=${diagnosticCode}`);
        setResolvingOperationalLocation(false);
        return;
      }
      setResolvingOperationalLocation(false);
    }
    if (data.type === "b2b" || data.type === "business-distribution") {
      if (!String(data.businessZone || "").trim()) {
        setOperationalLocationError("Inserisci il comune o la zona di partenza della campagna Business.");
        document.getElementById("business-starting-area")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        document.getElementById("business-starting-area")?.focus();
        return;
      }
      if (!Array.isArray(data.distributionTargets) || data.distributionTargets.length === 0) {
        setOperationalLocationError("Seleziona almeno un tipo di attività o luogo da visitare.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (!data.businessCampaignObjective) {
        setOperationalLocationError("Seleziona l’obiettivo della campagna Business.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      const definitionMode = data.businessDefinitionMode || "materials";
      const usesMaterials = definitionMode === "materials" || definitionMode === "both";
      const usesActivities = definitionMode === "activities" || definitionMode === "both";
      if (usesMaterials && Number(data.businessMaterialQuantity || data.qty || 0) < 1) {
        setOperationalLocationError("Indica quante copie o materiali sono disponibili.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (usesActivities && Number(data.businessTargetCount || 0) < 1) {
        setOperationalLocationError("Indica quante attività vuoi raggiungere.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (!data.businessDeliveryMethod) {
        setOperationalLocationError("Seleziona la modalità di consegna Business.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (!data.businessMaterialLocation) {
        setOperationalLocationError("Indica dove si trova il materiale da distribuire.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      if (data.businessMaterialLocation === "pickup_client" && !String(data.businessPickup?.address || "").trim()) {
        setOperationalLocationError("Inserisci l’indirizzo per il ritiro del materiale.");
        document.getElementById("section-business-config")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        return;
      }
      setOperationalLocationError("");
      const materialQuantity = Math.max(0, Number(data.businessMaterialQuantity || data.qty || 0));
      setResolvingOperationalLocation(true);
      let resolvedBusinessArea;
      try {
        resolvedBusinessArea = await geocodePromoterAssignment({
          location: String(data.businessZone || "").trim(),
          pointType: ""
        });
      } catch (error) {
        const diagnosticCode = error?.message || "BUSINESS_AREA_NOT_FOUND";
        setOperationalLocationError(`Non riesco a trovare il comune o la zona Business. Controlla il nome e riprova. Codice: ${diagnosticCode}`);
        document.getElementById("business-starting-area")?.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        setResolvingOperationalLocation(false);
        return;
      }
      const businessCity = {
        ...resolvedBusinessArea.parentCity,
        label: resolvedBusinessArea.parentCity?.label || resolvedBusinessArea.parentCity?.name
      };
      flushSync(() => {
        setData(prev => ({
          ...prev,
          qty: materialQuantity,
          flyerQuantity: materialQuantity,
          promoterCount: null,
          businessOperatorCount: null,
          businessEstimatedStops: null,
          timeSlot: null,
          serviceDurationHours: null,
          city: businessCity,
          cityName: businessCity.label || businessCity.name || "",
          searchedLocation: businessCity.label || businessCity.name || "",
          selectedComuni: [businessCity],
          selectedSearchPoint: null,
          searchMode: "municipality",
          zones: [],
          selectedZones: [],
          coverageDecision: null,
          coverageStrategy: null
        }));
      });
      setResolvingOperationalLocation(false);
    }
    onNext();
  };
  const promoterAssignments = buildPromoterAssignments(data);
  const promoterCount = Math.max(1, Number(data.promoterCount || 1));
  const serviceDurationHours = Math.max(1, Number(data.serviceDurationHours || 4));
  const estimatedH2HCapacity = promoterAssignments.reduce((total, assignment) => total + Math.max(1, Number(assignment.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR, 0);
  const selectedDistributionTargets = Array.isArray(data.distributionTargets) ? data.distributionTargets : [];
  const toggleDistributionTarget = target => {
    if (target === "all") {
      updateData({
        distributionTargets: selectedDistributionTargets.includes("all") ? [] : ["all"],
        distributionTargetsExplicit: true
      });
      return;
    }
    const withoutAll = selectedDistributionTargets.filter(item => item !== "all");
    updateData({
      distributionTargets: withoutAll.includes(target) ? withoutAll.filter(item => item !== target) : [...withoutAll, target],
      distributionTargetsExplicit: true
    });
  };
  const updateTeamSchedule = patch => {
    const assignments = buildPromoterAssignments({
      ...data,
      ...patch
    }).map(assignment => ({
      ...assignment,
      ...patch
    }));
    updateData({
      ...patch,
      promoterAssignments: assignments
    });
  };
  const updatePromoterCount = value => {
    const count = Math.max(1, Number(value) || 1);
    const assignments = buildPromoterAssignments(data, count);
    updateData({
      promoterCount: count,
      promoterAssignments: assignments,
      distributionLocation: assignments[0]?.location || "",
      distributionPointType: assignments[0]?.pointType || ""
    });
  };
  const updatePromoterAssignment = (index, patch) => {
    const assignments = buildPromoterAssignments(data).map((assignment, assignmentIndex) => assignmentIndex === index ? {
      ...assignment,
      ...patch,
      label: null,
      lat: null,
      lng: null,
      parentComune: null
    } : assignment);
    updateData({
      promoterAssignments: assignments,
      distributionLocation: assignments[0]?.location || "",
      distributionPointType: assignments[0]?.pointType || ""
    });
  };
  const copyFirstPromoterPoint = () => {
    const assignments = buildPromoterAssignments(data);
    const first = assignments[0];
    updateData({
      promoterAssignments: assignments.map((assignment, index) => index === 0 ? assignment : {
        ...assignment,
        location: first.location,
        pointType: first.pointType,
        label: null,
        lat: null,
        lng: null,
        parentComune: null
      })
    });
  };
  const isH2H = data.type === "h2h";
  const isB2B = data.type === "b2b" || data.type === "business-distribution";
  const dateError = !!(data.startDate && data.endDate && data.endDate < data.startDate);
  const currentServiceLabel = {
    d2d: "Door to Door",
    h2h: "Hand to Hand",
    b2b: "Distribuzione presso attività e aziende",
    "business-distribution": "Distribuzione presso attività e aziende"
  }[data.type] || "Da selezionare";
  const currentPlanLabel = {
    single: "Singola",
    monthly3: "Trimestrale (-5%)",
    monthly6: "Semestrale (-10%)",
    monthly12: "Annuale (-15%)"
  }[data.subscription] || "Da selezionare";
  const currentUrgencyLabel = {
    normal: "Standard",
    urgent: "Urgente (+20%)",
    express: "Express (+35%)"
  }[data.urgency] || "Da selezionare";
  const currentPrintLabel = data.hasFlyers === "yes" ? "Già stampati" : data.hasFlyers === "no" ? "Da stampare (+stampa)" : "Da selezionare";
  const currentFormatLabel = data.flyerFormat ? String(data.flyerFormat).toUpperCase() : "Da selezionare";
  const businessDefinitionMode = data.businessDefinitionMode || "materials";
  const step1Issues = [!data.type && {
    id: "section-servizio",
    label: "Scegli il servizio"
  }, !data.activityType && {
    id: "section-settore",
    label: "Indica il settore dell'attività"
  }, !isB2B && (!data.qty || Number(data.qty) < 1000) && {
    id: "section-quantita",
    label: "Inserisci almeno 1.000 volantini"
  }, !isB2B && !data.hasFlyers && {
    id: "section-formato",
    label: "Indica se il materiale è già stampato"
  }, !data.flyerFormat && {
    id: "section-formato",
    label: "Scegli il formato"
  }, !isB2B && !data.urgency && {
    id: "section-urgenza",
    label: "Scegli la priorità"
  }, !data.subscription && {
    id: "section-piano",
    label: "Scegli il piano"
  }, isH2H && selectedDistributionTargets.length === 0 && {
    id: "section-distribution-targets",
    label: "Scegli almeno un luogo Hand to Hand"
  }, isH2H && (!data.promoterCount || !data.timeSlot || !data.serviceDurationHours) && {
    id: "section-h2h-config",
    label: "Completa squadra, orario e durata"
  }, isH2H && !String(promoterAssignments[0]?.location || "").trim() && {
    id: "section-h2h-config",
    label: "Inserisci il centro dell'area Hand to Hand"
  }, isB2B && !String(data.businessZone || "").trim() && {
    id: "section-business-config",
    label: "Inserisci il comune Business"
  }, isB2B && selectedDistributionTargets.length === 0 && {
    id: "section-business-config",
    label: "Scegli le attività Business"
  }, isB2B && !data.businessCampaignObjective && {
    id: "section-business-config",
    label: "Scegli l'obiettivo Business"
  }, isB2B && ["materials", "both"].includes(businessDefinitionMode) && Number(data.businessMaterialQuantity || data.qty || 0) < 1 && {
    id: "section-business-config",
    label: "Inserisci la quantità di materiali"
  }, isB2B && ["activities", "both"].includes(businessDefinitionMode) && Number(data.businessTargetCount || 0) < 1 && {
    id: "section-business-config",
    label: "Inserisci il numero di attività"
  }, isB2B && !data.businessDeliveryMethod && {
    id: "section-business-config",
    label: "Scegli la modalità di consegna"
  }, isB2B && !data.businessMaterialLocation && {
    id: "section-business-config",
    label: "Indica dove si trova il materiale"
  }, isB2B && data.businessMaterialLocation === "pickup_client" && !String(data.businessPickup?.address || "").trim() && {
    id: "section-business-config",
    label: "Inserisci l'indirizzo di ritiro"
  }, dateError && {
    id: "section-periodo",
    label: "Correggi il periodo selezionato"
  }].filter(Boolean);
  const canContinueStep1 = step1Issues.length === 0 && !resolvingOperationalLocation;
  const quantityValue = Math.max(0, Number(data.businessMaterialQuantity ?? data.qty ?? 0) || 0);
  const quantityFeedback = quantityValue >= 1000 ? {
    label: "Quantità valida per procedere",
    text: "La copertura reale verrà calcolata automaticamente nello Step 2.",
    color: "#86EFAC"
  } : {
    label: "Quantità da completare",
    text: "Inserisci almeno 1.000 materiali per procedere.",
    color: "#FCD34D"
  };
  const summaryRows = [{
    label: "Servizio",
    val: currentServiceLabel
  }, {
    label: "Zona",
    val: isB2B ? data.businessZone || "Da selezionare" : "Da selezionare nello Step 2"
  }, {
    label: "Formato",
    val: currentFormatLabel
  }, {
    label: "Quantità",
    val: `${new Intl.NumberFormat("it-IT").format(quantityValue || 0)} pz`
  }, {
    label: "Piano",
    val: currentPlanLabel
  }, {
    label: "Stampa",
    val: currentPrintLabel
  }, {
    label: "Urgenza",
    val: currentUrgencyLabel
  }, ...(data.puntiVetrina ? [{
    label: "Punti Vetrina",
    val: "Inclusi (+€35)"
  }] : [])];
  const ctaChecklist = [{
    label: "Servizio",
    complete: Boolean(data.type)
  }, {
    label: "Settore e target",
    complete: Boolean(data.activityType) && (!isH2H && !isB2B ? true : selectedDistributionTargets.length > 0)
  }, {
    label: "Quantità",
    complete: isB2B ? Number(data.businessMaterialQuantity || data.qty || 0) >= 1 : Number(data.qty || 0) >= 1000
  }, {
    label: "Materiale",
    complete: Boolean(data.flyerFormat) && (isB2B ? Boolean(data.businessMaterialLocation) : Boolean(data.hasFlyers))
  }, {
    label: "Piano",
    complete: Boolean(data.subscription)
  }, {
    label: "Configurazione operativa",
    complete: isH2H ? Boolean(data.promoterCount && data.timeSlot && data.serviceDurationHours && String(promoterAssignments[0]?.location || "").trim()) : isB2B ? Boolean(String(data.businessZone || "").trim() && data.businessCampaignObjective && data.businessDeliveryMethod && (data.businessMaterialLocation !== "pickup_client" || String(data.businessPickup?.address || "").trim())) : Boolean(data.urgency) && !dateError
  }];
  const s1Green = "#22C55E";
  const s1Panel = {
    background: "linear-gradient(180deg, rgba(18,32,54,.96), rgba(12,24,42,.96))",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.105)",
    padding: isMobile ? 20 : 32,
    boxShadow: "0 22px 60px rgba(0,0,0,.22)"
  };
  const s1Card = (active = false) => ({
    background: active ? "linear-gradient(180deg, rgba(34,197,94,.13), rgba(34,197,94,.055))" : "rgba(9,18,33,.58)",
    border: `1.5px solid ${active ? "rgba(34,197,94,.45)" : "rgba(255,255,255,.105)"}`,
    boxShadow: active ? "0 18px 42px rgba(34,197,94,.13)" : "inset 0 1px 0 rgba(255,255,255,.035)"
  });
  const s1EyebrowStyle = {
    fontFamily: F.sans,
    fontSize: 12,
    fontWeight: 900,
    color: "rgba(255,255,255,.48)",
    letterSpacing: ".12em",
    textTransform: "uppercase",
    marginBottom: 6
  };
  const s1OptionButton = (active = false) => ({
    border: `1.5px solid ${active ? "rgba(34,197,94,.46)" : "rgba(255,255,255,.105)"}`,
    background: active ? "rgba(34,197,94,.12)" : "rgba(9,18,33,.55)",
    color: active ? s1Green : "#CBD5E1",
    boxShadow: active ? "0 12px 28px rgba(34,197,94,.11)" : "none"
  });
  return <div className="vp-s1-root" style={{
    maxWidth: 1440,
    margin: "0 auto",
    padding: isMobile ? "32px 16px 120px" : "48px 28px 140px",
    color: "#F8FAFC",
    background: "linear-gradient(180deg,#07111f 0%, #0b182a 52%, #101c2c 100%)"
  }}>
      <style>{`
        .vp-s1-card-hover { transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
        .vp-s1-card-hover:hover { transform: translateY(-3px); border-color: rgba(34,197,94,0.32) !important; box-shadow: 0 20px 42px rgba(0,0,0,0.32) !important; background: rgba(15,29,50,.92) !important; }
        .vp-s1-btn-hover { transition: all 0.2s ease; }
        .vp-s1-btn-hover:hover { transform: translateY(-1px); filter: brightness(1.06); }
        .vp-s1-input-modern { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(148,163,184,0.18); background: rgba(8,17,31,0.68); color: #fff; font-family: 'DM Sans', sans-serif; font-size: 14px; transition: all 0.2s; box-sizing: border-box; }
        .vp-s1-input-modern:focus { border-color: rgba(34,197,94,.55); outline: none; box-shadow: 0 0 0 3px rgba(34,197,94,0.12); }
        .vp-s1-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; background: rgba(148,163,184,0.15); outline: none; margin: 16px 0; }
        .vp-s1-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #22C55E; cursor: pointer; border: 3px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.4); transition: transform 0.15s; }
        .vp-s1-slider::-webkit-slider-thumb:hover { transform: scale(1.18); }
        .vp-s1-root { overflow-x: clip; }
        .vp-s1-root button:focus-visible, .vp-s1-root input:focus-visible, .vp-s1-root select:focus-visible, .vp-s1-root textarea:focus-visible, .vp-s1-root summary:focus-visible { outline: 3px solid rgba(56,189,248,.72); outline-offset: 3px; }
        .vp-s1-help-wrap { position: relative; display: inline-flex; margin-left: 8px; vertical-align: middle; }
        .vp-s1-help { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(148,163,184,.38); background: rgba(15,29,50,.9); color: #CBD5E1; cursor: help; font: 900 12px/1 'DM Sans',sans-serif; }
        .vp-s1-help-tip { position: absolute; z-index: 20; left: 28px; top: -8px; width: 230px; padding: 10px 12px; border-radius: 10px; background: #16263d; border: 1px solid rgba(148,163,184,.28); color: #E2E8F0; font: 500 12px/1.45 'DM Sans',sans-serif; box-shadow: 0 12px 30px rgba(0,0,0,.35); opacity: 0; pointer-events: none; transform: translateY(4px); transition: .16s ease; }
        .vp-s1-help-wrap:hover .vp-s1-help-tip, .vp-s1-help-wrap:focus-within .vp-s1-help-tip { opacity: 1; transform: translateY(0); }
        .vp-s1-summary { border-radius: 20px; border: 1px solid rgba(34,197,94,.24); background: rgba(15,29,50,.94); box-shadow: 0 20px 48px rgba(0,0,0,.24); padding: 22px; }
        .vp-s1-summary-title { color: #22C55E; font: 900 12px/1 'DM Sans',sans-serif; letter-spacing: .1em; text-transform: uppercase; margin-bottom: 18px; }
        .vp-s1-summary-row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); font: 600 12px/1.35 'DM Sans',sans-serif; }
        .vp-s1-summary-row span:first-child { color: #94A3B8; }
        .vp-s1-summary-row strong { color: #F8FAFC; text-align: right; overflow-wrap: anywhere; }
        .vp-s1-summary-status { margin-top: 16px; padding: 12px; border-radius: 12px; background: rgba(34,197,94,.09); color: #BBF7D0; font: 700 12px/1.45 'DM Sans',sans-serif; }
        .vp-s1-estimate { display: grid; gap: 4px; margin-top: 16px; padding: 13px; border-radius: 12px; background: rgba(255,255,255,.04); }
        .vp-s1-estimate span { color: #94A3B8; font: 800 10px/1.2 'DM Sans',sans-serif; text-transform: uppercase; letter-spacing: .08em; }
        .vp-s1-estimate strong { color: #F8FAFC; font: 900 16px/1.3 'DM Sans',sans-serif; }
        .vp-s1-estimate small { color: #94A3B8; font: 500 10px/1.45 'DM Sans',sans-serif; }
        .vp-s1-summary-next { margin-top: 12px; color: #FCD34D; font: 650 11px/1.45 'DM Sans',sans-serif; }
        .vp-s1-summary-mobile { padding: 0; margin-bottom: 22px; overflow: hidden; }
        .vp-s1-summary-mobile summary { cursor: pointer; padding: 16px 18px; color: #22C55E; font: 900 13px/1.2 'DM Sans',sans-serif; }
        .vp-s1-summary-mobile summary span { float: right; color: #CBD5E1; font-size: 11px; }
        .vp-s1-summary-mobile > div { padding: 0 18px 18px; }
      `}</style>
      {onHome && <NavButton onClick={onHome} style={{
      marginBottom: 24
    }}>
          Home
        </NavButton>}

      {/* Hero & Progress Bar */}
      <div style={{
      marginBottom: 48
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 20,
        marginBottom: 28,
        padding: "20px 24px",
        borderRadius: 20,
        background: "rgba(24,34,53,0.5)",
        border: "1px solid rgba(148,163,184,0.15)",
        backdropFilter: "blur(16px)"
      }}>
          {[{
          step: 1,
          label: "Configurazione campagna",
          active: true
        }, {
          step: 2,
          label: "Zona & Mappa",
          active: false
        }, {
          step: 3,
          label: "Smart Pairing",
          active: false
        }, {
          step: 4,
          label: "Preventivo",
          active: false
        }].map((s, idx) => <div key={s.step} style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: isMobile ? "1 1 100%" : "1 1 0"
        }}>
              <div style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: s.active ? "#22C55E" : "rgba(148,163,184,0.12)",
            color: s.active ? "#000" : "#94A3B8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: F.sans,
            fontSize: 14,
            fontWeight: 900,
            flexShrink: 0,
            boxShadow: s.active ? "0 0 16px rgba(34,197,94,0.4)" : "none"
          }}>
                {s.step}
              </div>
              <div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: ".08em",
              color: s.active ? "#22C55E" : "#64748B"
            }}>
                  Step {s.step}
                </div>
                <div style={{
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: s.active ? 800 : 600,
              color: s.active ? "#F8FAFC" : "#94A3B8"
            }}>
                  {s.label}
                </div>
              </div>
              {idx < 3 && !isMobile && <div style={{
            flex: 1,
            height: 2,
            background: "rgba(148,163,184,0.15)",
            margin: "0 8px"
          }} />}
            </div>)}
        </div>

        <h1 style={{
        fontFamily: F.serif,
        fontSize: isMobile ? 36 : 48,
        lineHeight: 1.08,
        color: "#F8FAFC",
        letterSpacing: "-0.02em",
        margin: "0 0 12px"
      }}>
          Crea la tua campagna
        </h1>
        <p style={{
        fontFamily: F.sans,
        fontSize: 17,
        lineHeight: 1.6,
        color: "#94A3B8",
        margin: 0,
        maxWidth: 640
      }}>
          Scegli servizio, quantità e periodo. Nel passaggio successivo selezionerai la zona sulla mappa e vedrai famiglie e copertura in tempo reale.
        </p>
      </div>

      {/* Main Layout Grid */}
      <div style={{
      display: "grid",
      gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) 310px",
      gap: isMobile ? 0 : 28,
      alignItems: "start"
    }}>
        <aside style={{
        gridColumn: isMobile ? 1 : 2,
        gridRow: 1,
        position: isMobile ? "static" : "sticky",
        top: 22,
        zIndex: 8
      }} aria-label="Riepilogo configurazione">
          <Step1Summary rows={summaryRows} issues={step1Issues} isMobile={isMobile} />
        </aside>
        {/* Left Column: Configuration Sections */}
        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 36,
        gridColumn: 1,
        gridRow: isMobile ? 2 : 1,
        minWidth: 0
      }}>
          
          {/* Section 1: Tipo di distribuzione */}
          <div id="section-servizio" style={s1Panel}>
            <div style={s1EyebrowStyle}>
              1 - Tipo di distribuzione
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 24px"
          }}>
              Come vuoi distribuire i tuoi volantini?
              <Step1Help label="Differenze tra i servizi">La scelta cambia il tipo di area e le attività disponibili nello Step 2. Potrai ancora verificare tutto sulla mappa.</Step1Help>
            </h2>
            <div role="radiogroup" aria-label="Tipo di distribuzione" style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 20,
            alignItems: "stretch"
          }}>
              {distributionTypes.map(t => {
              const active = data.type === t.id;
              const cardCol = active ? s1Green : "rgba(255,255,255,.38)";
              return <button type="button" role="radio" aria-checked={active} key={t.id} onClick={() => updateData({
                type: t.id
              })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                padding: 24,
                borderRadius: 18,
                ...s1Card(active),
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                position: "relative",
                textAlign: "left",
                color: "inherit"
              }}>
                    {active ? <div style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(34,197,94,.14)",
                  border: "1px solid rgba(34,197,94,.36)",
                  color: s1Green,
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 800
                }}>
                        ✓ Selezionato
                      </div> : <div style={{
                  position: "absolute",
                  top: 18,
                  right: 18,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,.055)",
                  border: "1px solid rgba(255,255,255,.1)",
                  color: "rgba(255,255,255,.66)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800
                }}>
                        {t.badge}
                      </div>}
                    <div style={{
                  marginBottom: 16
                }}><Step1Icon name={t.icon} size={36} color={active ? s1Green : "rgba(255,255,255,.82)"} /></div>
                    <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: "#F8FAFC",
                  marginBottom: 8
                }}>{t.name}</div>
                    <p style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "#94A3B8",
                  margin: "0 0 18px",
                  minHeight: 40
                }}>{t.desc}</p>
                    <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(255,255,255,.035)",
                  border: "1px solid rgba(255,255,255,0.065)",
                  marginBottom: 20,
                  flex: 1
                }}>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#CBD5E1"
                  }}><Step1Icon name="lightbulb" size={14} /> <b style={{
                      color: "#F8FAFC"
                    }}>Casi d'uso:</b> {t.useCases}</div>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#CBD5E1"
                  }}><Step1Icon name="target" size={14} /> <b style={{
                      color: "#F8FAFC"
                    }}>Target:</b> {t.target}</div>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#CBD5E1"
                  }}><Step1Icon name="clock" size={14} /> <b style={{
                      color: "#F8FAFC"
                    }}>Tempo medio:</b> {t.time}</div>
                    </div>
                    <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 14,
                  borderTop: `1px solid ${active ? "rgba(34,197,94,.24)" : "rgba(255,255,255,0.08)"}`
                }}>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#64748B",
                    fontStyle: "italic"
                  }}>Prezzo calcolato nel preventivo finale</span>
                      <span style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: active ? s1Green : "transparent",
                    border: `2px solid ${active ? s1Green : cardCol}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: active ? "#06131f" : cardCol,
                    fontSize: 13,
                    fontWeight: 900,
                    transition: "all .2s",
                    flexShrink: 0
                  }}>
                        {active ? "✓" : "+"}
                      </span>
                    </div>
                  </button>;
            })}
            </div>
            {data.type === "d2d" && <label style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 14,
            background: data.puntiVetrina ? `${C.orange}14` : "rgba(255,255,255,.035)",
            border: `1.5px solid ${data.puntiVetrina ? `${C.orange}55` : "rgba(255,255,255,.105)"}`,
            cursor: "pointer",
            transition: "all .2s"
          }}>
                <input type="checkbox" checked={Boolean(data.puntiVetrina)} onChange={e => updateData({
              puntiVetrina: e.target.checked
            })} style={{
              width: 20,
              height: 20,
              marginTop: 2,
              accentColor: C.orange,
              cursor: "pointer",
              flexShrink: 0
            }} />
                <div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 14,
                fontWeight: 800,
                color: data.puntiVetrina ? C.orange : "#F8FAFC",
                marginBottom: 4
              }}>
                    Aggiungi Punti Vetrina (bar/negozi zona) — +€35
                  </div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 12,
                color: "#94A3B8",
                lineHeight: 1.45
              }}>
                    Lasciamo pile di volantini in punti vetrina selezionati dal nostro team, fino a 5 punti inclusi.
                  </div>
                </div>
              </label>}
          </div>

          {/* Section 2: Attività cliente */}
          <div id="section-settore" style={s1Panel}>
            <div style={s1EyebrowStyle}>
              2 - Settore o Attività
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 10px"
          }}>
              Che tipo di attività devi pubblicizzare?
              <Step1Help label="Come viene usato il settore">Per Hand to Hand e Business orienta le attività proposte sulla mappa. Per Door to Door resta un contesto della campagna.</Step1Help>
            </h2>
            <p style={{
            fontFamily: F.sans,
            fontSize: 14,
            color: "#94A3B8",
            margin: "0 0 24px"
          }}>
              Selezionando il tuo settore, l'AI ottimizzerà le zone e le fasce di distribuzione suggerite nello Step 2.
            </p>
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
            gap: 12
          }}>
              {activityButtons.map(btn => {
              const active = data.activityType === btn.value;
              return <button key={btn.value} type="button" onClick={() => updateData({
                activityType: btn.value,
                businessSector: btn.value,
                distributionTargets: [btn.value],
                distributionTargetsExplicit: false
              })} className="vp-s1-btn-hover" style={{
                padding: "14px 12px",
                borderRadius: 14,
                ...s1OptionButton(active),
                fontFamily: F.sans,
                fontSize: 14,
                fontWeight: active ? 800 : 600,
                cursor: "pointer",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8
              }}>
                    <Step1Icon name={btn.icon} size={22} />
                    <span>{btn.label}</span>
                  </button>;
            })}
            </div>
            {data.activityType === "altro" && <input type="text" placeholder="Specifica la tua attività (es. Centro estetico, Palestra, Pizzeria...)" value={data.activityNote || ""} onChange={e => updateData({
            activityNote: e.target.value
          })} className="vp-s1-input-modern" style={{
            marginTop: 16
          }} />}

            {isH2H && <div id="section-distribution-targets" style={{
            marginTop: 24,
            padding: isMobile ? 16 : 20,
            borderRadius: 16,
            background: "rgba(5,12,24,.42)",
            border: "1px solid rgba(34,197,94,.20)"
          }}>
                <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: 14
            }}>
                  <div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 850,
                  color: C.white
                }}>Dove vuoi distribuire?</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.48)",
                  marginTop: 4,
                  lineHeight: 1.45
                }}>Puoi scegliere più categorie. Nello Step 2 vedrai tutti i luoghi realmente disponibili dentro il raggio.</div>
                  </div>
                  <span style={{
                padding: "5px 8px",
                borderRadius: 8,
                background: selectedDistributionTargets.length ? "rgba(34,197,94,.12)" : "rgba(245,158,11,.10)",
                color: selectedDistributionTargets.length ? "#86EFAC" : "#FCD34D",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800
              }}>
                    {selectedDistributionTargets.length ? `${selectedDistributionTargets.length} selezionati` : "Selezione richiesta"}
                  </span>
                </div>
                <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))",
              gap: 9
            }}>
                  {DISTRIBUTION_TARGET_OPTIONS.map(target => {
                const active = selectedDistributionTargets.includes(target.value);
                return <button key={target.value} type="button" onClick={() => toggleDistributionTarget(target.value)} className="vp-s1-btn-hover" style={{
                  minHeight: 44,
                  padding: "9px 10px",
                  borderRadius: 11,
                  border: `1px solid ${active ? "rgba(34,197,94,.65)" : "rgba(255,255,255,.10)"}`,
                  background: active ? "rgba(34,197,94,.13)" : "rgba(255,255,255,.035)",
                  color: active ? "#86EFAC" : "#CBD5E1",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: active ? 800 : 650,
                  cursor: "pointer",
                  textAlign: "center"
                }}>
                        {active ? "✓ " : ""}{target.label}
                      </button>;
              })}
                </div>
              </div>}

            {/* Pannelli dinamici H2H / B2B */}
            <AnimatePresence mode="wait">
            {isH2H && <motion.div id="section-h2h-config" key="panel-h2h" initial={{
              opacity: 0,
              y: -10
            }} animate={{
              opacity: 1,
              y: 0
            }} exit={{
              opacity: 0,
              y: -8
            }} transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1]
            }} style={{
              marginTop: 24,
              padding: isMobile ? 18 : 24,
              borderRadius: 20,
              background: "#122036",
              border: "1px solid rgba(255,255,255,0.08)",
              borderTop: "2px solid #60A5FA"
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 900,
                color: "#60A5FA",
                textTransform: "uppercase",
                letterSpacing: ".1em",
                marginBottom: 18,
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                  <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#60A5FA",
                  flexShrink: 0
                }} />
                  Configurazione Hand to Hand
                </div>
                <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: 16
              }}>
                  <div>
                    <label style={{
                    fontSize: 12,
                    color: "#CBD5E1",
                    display: "block",
                    marginBottom: 6
                  }}>Numero Promoter</label>
                    <select value={data.promoterCount || ""} onChange={e => updatePromoterCount(e.target.value)} className="vp-s1-input-modern">
                      <option value="">Seleziona...</option>
                      {Bv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{
                    fontSize: 12,
                    color: "#CBD5E1",
                    display: "block",
                    marginBottom: 6
                  }}>Fascia Oraria</label>
                    <select value={data.timeSlot || ""} onChange={e => updateTeamSchedule({
                    timeSlot: e.target.value
                  })} className="vp-s1-input-modern">
                      <option value="">Seleziona...</option>
                      {Mv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{
                    fontSize: 12,
                    color: "#CBD5E1",
                    display: "block",
                    marginBottom: 6
                  }}>Durata Servizio</label>
                    <select value={data.serviceDurationHours || ""} onChange={e => updateTeamSchedule({
                    serviceDurationHours: Number(e.target.value)
                  })} className="vp-s1-input-modern">
                      <option value="">Seleziona...</option>
                      {Fv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 12
              }}>
                  <div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 850,
                    color: C.white
                  }}>Area di ricerca</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.45)",
                    marginTop: 3
                  }}>Questo indirizzo definisce solo il centro del raggio. Le postazioni dei promoter saranno le scuole, palestre o attività scelte nello Step 2.</div>
                  </div>
                </div>
                <div style={{
                padding: 14,
                borderRadius: 12,
                background: "rgba(5,12,24,.42)",
                border: "1px solid rgba(96,165,250,.18)",
                marginBottom: 10
              }}>
                  <label style={{
                  fontSize: 11,
                  color: "#CBD5E1",
                  display: "block",
                  marginBottom: 5
                }}>Comune, via o punto centrale del raggio</label>
                  <input type="text" placeholder="es. Varedo oppure Varedo, Via Roma" value={promoterAssignments[0]?.location || ""} onChange={e => updatePromoterAssignment(0, {
                  location: e.target.value
                })} className="vp-s1-input-modern" />
                </div>
                <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                color: "#93C5FD",
                margin: "14px 0 8px"
              }}>Promoter e orari</div>
                <div style={{
                display: "grid",
                gap: 10
              }}>
                  {promoterAssignments.map((assignment, index) => <div key={assignment.id} style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "rgba(5,12,24,.42)",
                  border: "1px solid rgba(96,165,250,.18)"
                }}>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    marginBottom: 10
                  }}>
                        <span style={{
                      width: 25,
                      height: 25,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      background: "#2563EB",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 900
                    }}>{index + 1}</span>
                        <strong style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      color: C.white
                    }}>Promoter {index + 1}</strong>
                        <span style={{
                      marginLeft: "auto",
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: "#4ADE80"
                    }}>Capacità stimata: {(Math.max(1, Number(assignment.serviceDurationHours || serviceDurationHours)) * H2H_FLYERS_PER_PROMOTER_HOUR).toLocaleString("it-IT")} pz.</span>
                      </div>
                      <div style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                    gap: 10
                  }}>
                        <div style={{
                      display: "none"
                    }}>
                          <label style={{
                        fontSize: 11,
                        color: "#CBD5E1",
                        display: "block",
                        marginBottom: 5
                      }}>{index === 0 ? "Comune o punto di partenza" : "Punto già conosciuto (facoltativo)"}</label>
                          <input type="text" placeholder={index === 0 ? "es. Varedo oppure Varedo, Via Roma" : "Puoi assegnarlo nello Step 2"} value={assignment.location || ""} onChange={e => updatePromoterAssignment(index, {
                        location: e.target.value
                      })} className="vp-s1-input-modern" />
                        </div>
                        <div style={{
                      display: "none"
                    }}>
                          <label style={{
                        fontSize: 11,
                        color: "#CBD5E1",
                        display: "block",
                        marginBottom: 5
                      }}>Preferenza punto (facoltativa)</label>
                          <select value={assignment.pointType || ""} onChange={e => updatePromoterAssignment(index, {
                        pointType: e.target.value
                      })} className="vp-s1-input-modern">
                            <option value="">Seleziona...</option>
                            {Nv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{
                        fontSize: 11,
                        color: "#CBD5E1",
                        display: "block",
                        marginBottom: 5
                      }}>Orario Promoter {index + 1}</label>
                          <select value={assignment.timeSlot || data.timeSlot || ""} onChange={e => updatePromoterAssignment(index, {
                        timeSlot: e.target.value
                      })} className="vp-s1-input-modern">
                            <option value="">Seleziona...</option>
                            {Mv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{
                        fontSize: 11,
                        color: "#CBD5E1",
                        display: "block",
                        marginBottom: 5
                      }}>Durata Promoter {index + 1}</label>
                          <select value={assignment.serviceDurationHours || data.serviceDurationHours || ""} onChange={e => updatePromoterAssignment(index, {
                        serviceDurationHours: Number(e.target.value)
                      })} className="vp-s1-input-modern">
                            <option value="">Seleziona...</option>
                            {Fv.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>)}
                </div>
                <div style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: data.qty > estimatedH2HCapacity ? "rgba(251,191,36,.08)" : "rgba(34,197,94,.08)",
                border: `1px solid ${data.qty > estimatedH2HCapacity ? "rgba(251,191,36,.25)" : "rgba(34,197,94,.25)"}`,
                fontFamily: F.sans,
                fontSize: 11,
                color: data.qty > estimatedH2HCapacity ? "#FDE68A" : "#86EFAC",
                lineHeight: 1.45
              }}>
                  Capacità squadra stimata: <b>{estimatedH2HCapacity.toLocaleString("it-IT")} volantini</b> (somma degli orari dei {promoterCount} promoter × {H2H_FLYERS_PER_PROMOTER_HOUR}/ora).
                  {data.qty > estimatedH2HCapacity ? ` Per distribuire ${Number(data.qty || 0).toLocaleString("it-IT")} volantini serviranno più ore, promoter o giornate.` : " La configurazione è coerente con la quantità inserita."}
                </div>
              </motion.div>}

            {isB2B && <BusinessStep1Config data={data} updateData={updateData} isMobile={isMobile} />}
            </AnimatePresence>
          </div>

          {/* Section 3: Quantità volantini */}
          <div id="section-quantita" style={{
          ...s1Panel,
          display: isB2B ? "none" : undefined
        }}>
            <div style={s1EyebrowStyle}>
              3 - Quantità volantini
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 10px"
          }}>
              Quanti volantini desideri distribuire?
            </h2>
            <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 18px",
            borderRadius: 12,
            background: "rgba(34,197,94,.08)",
            border: "1px solid rgba(34,197,94,.22)",
            color: "#A7F3D0",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 24
          }}>
              <Step1Icon name="lightbulb" size={16} style={{
              flexShrink: 0
            }} /> La copertura stimata (famiglie raggiunte e percentuale di zona) verrà calcolata automaticamente nello Step 2 in base all'area sulla mappa.
            </div>

            <div style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 24
          }}>
              {[5000, 10000, 25000, 50000, 100000].map(q => {
              const active = data.qty === q;
              return <button key={q} type="button" onClick={() => updateData({
                qty: q
              })} className="vp-s1-btn-hover" style={{
                flex: "1 1 120px",
                padding: "12px 14px",
                borderRadius: 12,
                ...s1OptionButton(active),
                fontFamily: F.sans,
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer"
              }}>
                    {new Intl.NumberFormat("it-IT", {
                  useGrouping: true
                }).format(q)} pz
                  </button>;
            })}
            </div>

            <input type="range" min={1000} max={100000} step={1000} value={Math.max(1000, Math.min(100000, data.qty || 10000))} onChange={e => updateData({
            qty: Number(e.target.value)
          })} className="vp-s1-slider" />

            <div style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            flexWrap: "wrap",
            gap: 12
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
                <span style={{
                fontSize: 13,
                color: "#94A3B8"
              }}>Inserimento manuale:</span>
                <input type="text" inputMode="numeric" value={data.qty ? new Intl.NumberFormat("it-IT", {
                useGrouping: true
              }).format(data.qty) : ""} onChange={e => {
                const v = e.target.value.replace(/\D/g, "");
                updateData({
                  qty: v ? parseInt(v, 10) : ""
                });
              }} onBlur={e => {
                const v = e.target.value.replace(/\D/g, "");
                updateData({
                  qty: Math.max(1000, Math.min(100000, v ? parseInt(v, 10) : 10000))
                });
              }} className="vp-s1-input-modern" style={{
                width: 130,
                textAlign: "right",
                fontWeight: 800,
                fontSize: 16
              }} />
              </div>
            </div>
            <div role="status" style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(148,163,184,.07)",
            border: `1px solid ${quantityFeedback.color}55`,
            color: quantityFeedback.color,
            fontSize: 13,
            lineHeight: 1.45
          }}>
              <strong>{quantityFeedback.label}:</strong> {quantityFeedback.text}
            </div>
          </div>

          {/* Section 4: Periodo distribuzione */}
          <div id="section-periodo" style={{
          ...s1Panel,
          display: isB2B ? "none" : undefined
        }}>
            <div style={s1EyebrowStyle}>
              4 - Periodo di distribuzione
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 10px"
          }}>
              Quando vuoi far partire la campagna?
            </h2>
            <p style={{
            fontFamily: F.sans,
            fontSize: 14,
            color: "#94A3B8",
            margin: "0 0 24px"
          }}>
              Seleziona una preferenza rapida oppure definisci le date esatte. Potrai confermare o modificare tutto prima dell'avvio.
            </p>

            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 16,
            marginBottom: data.campaignPeriodPreset === "custom" ? 24 : 0
          }}>
              {periodPresets.map(p => {
              const active = (data.campaignPeriodPreset || "custom") === p.id;
              return <button type="button" aria-pressed={active} key={p.id} onClick={() => updateData({
                campaignPeriodPreset: p.id,
                ...(p.id !== "custom" ? {
                  startDate: "",
                  endDate: "",
                  startDateDraft: "",
                  endDateDraft: ""
                } : {})
              })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                padding: 20,
                borderRadius: 16,
                ...s1Card(active),
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 14,
                textAlign: "left"
              }}>
                    <Step1Icon name={p.icon} size={26} color={active ? s1Green : "#F8FAFC"} style={{
                  flexShrink: 0,
                  marginTop: 2
                }} />
                    <div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 16,
                    fontWeight: 800,
                    color: active ? s1Green : "#F8FAFC",
                    marginBottom: 6
                  }}>{p.label}</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: "#94A3B8",
                    lineHeight: 1.4
                  }}>{p.desc}</div>
                    </div>
                  </button>;
            })}
            </div>

            {/* Calendario visualizzato SOLO quando "Scelgo la data" è selezionato */}
            {(data.campaignPeriodPreset === "custom" || !data.campaignPeriodPreset) && <div style={{
            padding: 24,
            borderRadius: 18,
            background: "rgba(9,18,33,.58)",
            border: "1px solid rgba(255,255,255,.105)",
            marginTop: 20
          }}>
                <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 800,
              color: "#CBD5E1",
              marginBottom: 16
            }}><Step1Icon name="target" size={16} /> Seleziona le date desiderate sul calendario:</div>
                <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 16
            }}>
                  {[{
                label: "Data preferita di inizio",
                key: "startDate"
              }, {
                label: "Data fine (opzionale)",
                key: "endDate"
              }].map(field => {
                const val = data[field.key] || "";
                const draftKey = `${field.key}Draft`;
                const draftVal = data[draftKey] ?? formatDateDisplay(val);
                return <div key={field.key}>
                        <label style={{
                    fontSize: 12,
                    color: "#94A3B8",
                    display: "block",
                    marginBottom: 6
                  }}>{field.label}</label>
                        <div style={{
                    position: "relative"
                  }}>
                          <input type="text" inputMode="numeric" placeholder="gg/mm/aaaa" value={draftVal} onChange={e => {
                      const masked = maskDateInput(e.target.value);
                      const parsed = parseDateToIso(masked);
                      updateData({
                        [draftKey]: masked,
                        ...(parsed ? {
                          [field.key]: parsed
                        } : !masked ? {
                          [field.key]: ""
                        } : {})
                      });
                    }} className="vp-s1-input-modern" style={{
                      paddingRight: 44
                    }} />
                          <input type="date" id={`date-picker-${field.key}`} value={val || ""} onChange={e => {
                      const iso = e.target.value;
                      if (!iso) return;
                      updateData({
                        [field.key]: iso,
                        [draftKey]: formatDateDisplay(iso)
                      });
                    }} style={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      opacity: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer"
                    }} />
                          <span onClick={() => {
                      const el = document.getElementById(`date-picker-${field.key}`);
                      if (el) {
                        try {
                          el.showPicker();
                        } catch {
                          el.click();
                        }
                      }
                    }} style={{
                      position: "absolute",
                      right: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      cursor: "pointer",
                      display: "flex",
                      color: "#94A3B8"
                    }}>
                            <Step1Icon name="calendar" size={18} />
                          </span>
                        </div>
                        {val && <div style={{
                    fontSize: 11,
                    color: "#22C55E",
                    marginTop: 4,
                    fontWeight: 700
                  }}>✓ Confermato: {formatDateDisplay(val)}</div>}
                      </div>;
              })}
                </div>
                {dateError && <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(239,68,68,0.15)",
              border: "1px solid #EF4444",
              color: "#EF4444",
              fontSize: 12,
              fontWeight: 700
            }}>
                    <Step1Icon name="warning" size={14} /> La data di fine precede la data di inizio. Per favore correggila.
                  </div>}
              </div>}
          </div>

          {/* Section 5: Materiale e Formato */}
          <div id="section-formato" style={s1Panel}>
            <div style={s1EyebrowStyle}>
              5 - Materiale & Formato
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 24px"
          }}>
              Ti serve anche la stampa dei volantini?
            </h2>

            {/* 2 Card Grandi Materiale */}
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 20,
            marginBottom: 32
          }}>
              {materialOptions.map(m => {
              const active = data.hasFlyers === m.id;
              return <button type="button" aria-pressed={active} key={m.id} onClick={() => updateData({
                hasFlyers: m.id,
                extraServices: m.id === "yes" ? (data.extraServices || []).filter(s => !["stampa", "grafica"].includes(s)) : data.extraServices || [],
                printing: {
                  ...printing,
                  enabled: m.id === "no"
                }
              })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                padding: 24,
                borderRadius: 20,
                ...s1Card(active),
                cursor: "pointer",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
                textAlign: "left",
                color: "inherit"
              }}>
                    <Step1Icon name={m.icon} size={36} color={active ? s1Green : "#F8FAFC"} style={{
                  flexShrink: 0
                }} />
                    <div>
                      <div style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: active ? s1Green : "#F8FAFC",
                    marginBottom: 6
                  }}>{m.label}</div>
                      <div style={{
                    fontSize: 13,
                    color: "#94A3B8",
                    lineHeight: 1.5
                  }}>{m.desc}</div>
                    </div>
                  </button>;
            })}
            </div>

            {/* Modulo stampa — visibile solo se "Sì, voglio anche stampa" */}
            {data.hasFlyers === "no" && <div style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 24,
            marginBottom: 32,
            display: "flex",
            flexDirection: "column",
            gap: 20
          }}>
                <div style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#F8FAFC"
            }}>Dettagli di stampa</div>

                {[{
              key: "format",
              label: "Formato di stampa",
              options: printFormatOptions
            }, {
              key: "paperType",
              label: "Tipo carta",
              options: printPaperTypeOptions
            }, {
              key: "grammage",
              label: "Grammatura",
              options: printGrammageOptions
            }, {
              key: "sides",
              label: "Lati",
              options: printSidesOptions
            }, {
              key: "color",
              label: "Colore",
              options: printColorOptions
            }, {
              key: "folding",
              label: "Piega",
              options: printFoldingOptions
            }, {
              key: "artworkStatus",
              label: "File grafico",
              options: printArtworkOptions
            }].map(field => <div key={field.key}>
                    <div style={{
                fontSize: 12,
                color: "#94A3B8",
                marginBottom: 8,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".05em"
              }}>{field.label}</div>
                    <div style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap"
              }}>
                      {field.options.map(opt => {
                  const active = printing[field.key] === opt.id;
                  return <button key={opt.id} type="button" onClick={() => updatePrinting({
                    [field.key]: opt.id
                  })} className="vp-s1-btn-hover" style={{
                    padding: "8px 16px",
                    borderRadius: 100,
                    ...s1OptionButton(active),
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: active ? 800 : 600,
                    cursor: "pointer"
                  }}>
                            {opt.label}
                          </button>;
                })}
                    </div>
                  </div>)}

                <div>
                  <div style={{
                fontSize: 12,
                color: "#94A3B8",
                marginBottom: 8,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: ".05em"
              }}>Note di stampa (opzionale)</div>
                  <textarea value={printing.notes || ""} onChange={e => updatePrinting({
                notes: e.target.value
              })} placeholder="Indicazioni particolari per la stampa..." rows={3} className="vp-s1-input-modern" style={{
                resize: "vertical"
              }} />
                </div>

                <div style={{
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(148,163,184,0.08)",
              border: "1px solid rgba(148,163,184,0.15)",
              fontSize: 12,
              color: "#94A3B8",
              fontStyle: "italic"
            }}>
                  Il prezzo di stampa verrà calcolato nel preventivo finale.
                </div>
              </div>}

            {/* Formato 4 Card */}
            <div style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 24
          }}>
              <div style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#F8FAFC",
              marginBottom: 14
            }}>
                Seleziona il formato del materiale da distribuire <span style={{
                fontSize: 13,
                color: "#94A3B8",
                fontWeight: 500
              }}>(indipendente dalle opzioni di stampa)</span>
              </div>
              <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: 14
            }}>
                {Uv.map(fmt => {
                const active = data.flyerFormat === fmt.id;
                return <button type="button" aria-pressed={active} key={fmt.id} onClick={() => updateData({
                  flyerFormat: fmt.id
                })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                  padding: 18,
                  borderRadius: 16,
                  ...s1Card(active),
                  cursor: "pointer",
                  textAlign: "center"
                }}>
                      <div style={{
                    fontFamily: F.serif,
                    fontSize: 24,
                    color: active ? s1Green : "#F8FAFC",
                    marginBottom: 4
                  }}>{fmt.label}</div>
                      <div style={{
                    fontSize: 12,
                    color: "#94A3B8"
                  }}>{fmt.size}</div>
                    </button>;
              })}
              </div>
            </div>
          </div>

          {/* Section 7: Priorità */}
          <div id="section-urgenza" style={{
          ...s1Panel,
          display: isB2B ? "none" : undefined
        }}>
            <div style={s1EyebrowStyle}>
              6 - Priorità operativa
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 20px"
          }}>
              Con che urgenza dobbiamo avviare la distribuzione?
            </h2>
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 16
          }}>
              {priorityOptions.map(p => {
              const active = data.urgency === p.id;
              return <button type="button" aria-pressed={active} key={p.id} onClick={() => updateData({
                urgency: p.id
              })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                padding: 22,
                borderRadius: 18,
                ...s1Card(active),
                cursor: "pointer",
                position: "relative"
              }}>
                    {p.badge && <div style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  padding: "3px 8px",
                  borderRadius: 100,
                  background: p.id === "express" ? "rgba(239,68,68,0.13)" : "rgba(255,255,255,.06)",
                  color: p.id === "express" ? "#FCA5A5" : "rgba(255,255,255,.66)",
                  fontSize: 10,
                  fontWeight: 800
                }}>
                        {p.badge}
                      </div>}
                    <div style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: active ? s1Green : "#F8FAFC",
                  marginBottom: 8
                }}>{p.label}</div>
                    <div style={{
                  fontSize: 13,
                  color: "#94A3B8",
                  lineHeight: 1.4
                }}>{p.desc}</div>
                  </button>;
            })}
            </div>
          </div>

          {/* Section 8: Piano */}
          <div id="section-piano" style={s1Panel}>
            <div style={s1EyebrowStyle}>
              7 - Piano promozionale
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 26,
            color: "#F8FAFC",
            margin: "0 0 10px"
          }}>
              Vuoi fare una distribuzione singola o continuativa?
            </h2>
            <p style={{
            fontFamily: F.sans,
            fontSize: 14,
            color: "#94A3B8",
            margin: "0 0 24px"
          }}>
              I piani continuativi ti assicurano priorità nelle squadre operative e sconti automatici sui costi di distribuzione.
            </p>

            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 20
          }}>
              {planOptions.map(pl => {
              const active = data.subscription === pl.id;
              return <button type="button" aria-pressed={active} key={pl.id} onClick={() => updateData({
                subscription: pl.id,
                campaignsPerMonth: pl.id === "single" ? 1 : data.campaignsPerMonth || 1
              })} className={`vp-s1-card-hover${active ? " vp-s1-card-selected" : ""}`} style={{
                padding: 20,
                borderRadius: 18,
                ...s1Card(active),
                cursor: "pointer",
                textAlign: "center",
                position: "relative"
              }}>
                    {pl.disc > 0 && <div style={{
                  position: "absolute",
                  top: -10,
                  right: 10,
                  background: "rgba(34,197,94,.16)",
                  color: s1Green,
                  border: "1px solid rgba(34,197,94,.34)",
                  padding: "2px 8px",
                  borderRadius: 100,
                  fontSize: 11,
                  fontWeight: 900,
                  boxShadow: "0 4px 10px rgba(34,197,94,.12)"
                }}>
                        -{pl.disc}%
                      </div>}
                    <div style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: active ? s1Green : "#F8FAFC",
                  marginBottom: 4
                }}>{pl.label}</div>
                    <div style={{
                  fontSize: 12,
                  color: "#94A3B8",
                  marginBottom: pl.disc > 0 ? 6 : 0
                }}>{pl.subtitle}</div>
                    {pl.disc > 0 && <div style={{
                  fontSize: 11,
                  color: s1Green,
                  fontWeight: 800
                }}>Sconto applicato</div>}
                  </button>;
            })}
            </div>

            {data.subscription && data.subscription !== "single" && <div style={{
            padding: 20,
            borderRadius: 16,
            background: "rgba(9,18,33,.58)",
            border: "1px solid rgba(255,255,255,.105)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16
          }}>
                <div>
                  <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#F8FAFC",
                marginBottom: 4
              }}>Quante uscite/campagne al mese vuoi effettuare?</div>
                  <div style={{
                fontSize: 12,
                color: "#CBD5E1"
              }}>Ottimizzi la pianificazione logistica su {{
                  single: 1,
                  monthly3: 3,
                  monthly6: 6,
                  monthly12: 12
                }[data.subscription]} mesi</div>
                </div>
                <div style={{
              display: "flex",
              gap: 10
            }}>
                  {[1, 2, 4].map(cnt => {
                const active = (data.campaignsPerMonth || 1) === cnt;
                return <button key={cnt} type="button" onClick={() => updateData({
                  campaignsPerMonth: cnt
                })} style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  border: `2px solid ${active ? s1Green : "rgba(255,255,255,0.2)"}`,
                  background: active ? "rgba(34,197,94,.16)" : "transparent",
                  color: active ? s1Green : "#fff",
                  fontSize: 16,
                  fontWeight: 900,
                  cursor: "pointer"
                }}>
                        {cnt}
                      </button>;
              })}
                </div>
              </div>}
          </div>

          {/* NUOVA CARD "PROSSIMO PASSAGGIO" */}
          <div style={{
          ...s1Panel,
          padding: isMobile ? 24 : 36,
          position: "relative",
          overflow: "hidden"
        }}>
            <div style={{
            position: "absolute",
            top: -40,
            right: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(34,197,94,.12) 0%, transparent 70%)",
            pointerEvents: "none"
          }} />
            <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            borderRadius: 100,
            background: "rgba(34,197,94,.12)",
            color: s1Green,
            border: "1px solid rgba(34,197,94,.26)",
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            marginBottom: 16
          }}>
              <Step1Icon name="lightning" size={13} /> Trasparenza Garantita
            </div>
            <h2 style={{
            fontFamily: F.serif,
            fontSize: 30,
            color: "#F8FAFC",
            margin: "0 0 20px"
          }}>
              Prossimo passaggio
            </h2>
            <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 18,
            marginBottom: 28
          }}>
              {(data.quickMode ? ["Riceverai un preventivo immediato senza passare dalla mappa.", "Potrai selezionare servizi extra come tracking GPS.", "Scarica il PDF o richiedi consulenza diretta."] : ["Selezionerai la zona direttamente sulla mappa.", "Vedrai famiglie, popolazione e copertura stimata.", "Riceverai un preventivo automatico basato sulla zona scelta.", "Potrai modificare tutto prima della conferma finale."]).map((pt, idx) => <div key={idx} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12
            }}>
                  <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "rgba(34,197,94,.14)",
                border: "1px solid rgba(34,197,94,.36)",
                color: s1Green,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 900,
                flexShrink: 0,
                marginTop: 2
              }}>
                    ✓
                  </div>
                  <span style={{
                fontSize: 15,
                color: "#E2E8F0",
                lineHeight: 1.5,
                fontWeight: 500
              }}>{pt}</span>
                </div>)}
            </div>

            {/* CTA Button & Note */}
            <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12
          }}>
              {!canContinueStep1 && <div role="status" aria-label="Stato compilazione Step 1" style={{
              width: "100%",
              padding: isMobile ? 16 : 18,
              borderRadius: 14,
              background: "rgba(5,12,24,.42)",
              border: "1px solid rgba(245,158,11,.24)"
            }}>
                  <div style={{
                fontSize: 13,
                fontWeight: 850,
                color: "#F8FAFC",
                marginBottom: 10
              }}>Completa le voci indicate prima di continuare</div>
                  <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))",
                gap: "8px 16px"
              }}>
                    {ctaChecklist.map(item => <div key={item.label} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: item.complete ? "#86EFAC" : "#FCD34D",
                  fontSize: 12,
                  fontWeight: 750
                }}>
                        <span aria-hidden="true">{item.complete ? "✓" : <Step1Icon name="warning" size={12} />}</span>
                        <span>{item.label}</span>
                      </div>)}
                  </div>
                </div>}
              <button type="button" onClick={handleContinue} disabled={resolvingOperationalLocation || !canContinueStep1} className="vp-s1-btn-hover" style={{
              width: "100%",
              padding: "18px 36px",
              borderRadius: 16,
              background: "#E8571A",
              color: "#fff",
              border: "none",
              fontFamily: F.sans,
              fontSize: 18,
              fontWeight: 900,
              cursor: resolvingOperationalLocation ? "wait" : canContinueStep1 ? "pointer" : "not-allowed",
              opacity: resolvingOperationalLocation ? .72 : canContinueStep1 ? 1 : .48,
              boxShadow: "0 12px 32px rgba(232, 87, 26, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12
            }}>
                <span>{resolvingOperationalLocation ? isB2B ? "Localizzo il comune..." : "Localizzo il punto operativo..." : data.quickMode ? "Calcola Preventivo Rapido" : "Continua allo Step 2"}</span>
                <span style={{
                fontSize: 22
              }}>➔</span>
              </button>
              {operationalLocationError && <div role="alert" style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(245,158,11,.1)",
              border: "1px solid rgba(245,158,11,.35)",
              color: "#FCD34D",
              fontSize: 13,
              fontWeight: 700
            }}>
                  {operationalLocationError}
                </div>}
              <div style={{
              fontSize: 13,
              color: "#94A3B8",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}>
                <Step1Icon name="lock" size={14} /> <b>Nessun pagamento richiesto in questa fase.</b> Potrai personalizzare ogni dettaglio.
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Modal Spiegazione Smart Pairing opzionale */}
      {showSmartPairingModal && <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16
    }}>
          <div style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)"
      }} onClick={() => setShowSmartPairingModal(false)} />
          <div style={{
        position: "relative",
        width: "100%",
        maxWidth: 460,
        background: "#0F172A",
        border: "1px solid rgba(148,163,184,0.2)",
        borderRadius: 24,
        padding: 28,
        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        zIndex: 1
      }}>
            <button onClick={() => setShowSmartPairingModal(false)} style={{
          position: "absolute",
          top: 20,
          right: 20,
          background: "none",
          border: "none",
          color: "#94A3B8",
          fontSize: 24,
          cursor: "pointer"
        }}>×</button>
            <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16
        }}>
              <Step1Icon name="sparkles" size={24} color={s1Green} />
              <h3 style={{
            fontFamily: F.serif,
            fontSize: 22,
            color: "#F8FAFC",
            margin: 0
          }}>Smart Pairing AI</h3>
            </div>
            <p style={{
          fontSize: 14,
          color: "#CBD5E1",
          lineHeight: 1.6,
          marginBottom: 14
        }}>
              Lo Smart Pairing non limita le tue date di distribuzione: è un'opportunità di risparmio aggiuntiva fino al <b>-40%</b>.
            </p>
            <p style={{
          fontSize: 14,
          color: "#94A3B8",
          lineHeight: 1.6,
          marginBottom: 24
        }}>
              Nello Step 3 confronteremo automaticamente la tua zona con le squadre operative già attive sul territorio. Se non ci sono abbinamenti, potrai procedere al prezzo standard o attivare l'avviso prioritario.
            </p>
            <button onClick={() => setShowSmartPairingModal(false)} style={{
          width: "100%",
          padding: "14px",
          borderRadius: 12,
          background: "#22C55E",
          color: "#fff",
          border: "none",
          fontWeight: 800,
          fontSize: 15,
          cursor: "pointer"
        }}>
              Perfetto, ho capito
            </button>
          </div>
        </div>}
    </div>;
}

