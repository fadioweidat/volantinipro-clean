import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../../lib/constants.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import TerritorialReport from "../../TerritorialReport.jsx";
import TerritorialStep2AiBoundary from "../../../ai-foundation/integrations/territorial-step2/TerritorialStep2AiBoundary.jsx";
import { ACTIVITY_TARGET_LABELS } from "../../../lib/step2/activityTargets.js";
import { ADDRESS_INTENT_RE, detectSearchIntent, extractOfficialNilCode, getMunicipalityDedupKey, getVerifiedBusinessMetrics, getZoneVerdict, isAddressLikePlaceType, isGeocoderResultInMilanoComune, isNilLikePlaceType, logAddressVsMunicipalityDebug, looksLikeAddressResult, normalizeCoverageDecision, normalizeMunicipalityName, normalizeTerritoryName } from "../../../lib/step2/addressIntent.js";
import { apiToZones, capToZone, getZoneCoords, haversineKm, pickRealComuneGeometry } from "../../../lib/step2/zoneGeoHelpers.js";
import { bizCategoryChart, businessRows, businessZoneScore, getComuneColor, getH2HMetrics, getTargetBizMeta, H2H_HOTSPOT_META, h2hHotspotRows, h2hHotspotStrength, residentialRows, residentialStrength } from "../../../lib/step2/businessZoneHelpers.js";
import { buildOperationalAdvice, D2D_DAILY_CAPACITY, estimateOperationalDays, H2H_FLYERS_PER_PROMOTER_HOUR, resolveAssignedQuantity } from "../../../lib/step2/operationalMetrics.js";
import { buildPromoterAssignments } from "../../../lib/step1/promoterAssignments.js";
import { buildStep2ToStep3Payload, buildStep2TruthModel } from "../../../lib/step2/buildStep2TruthModel.js";
import { buildStep2ViewModel, getCoverageStatus } from "../../../lib/step2/buildStep2ViewModel.js";
import { BUSINESS_DELIVERY_METHODS, BUSINESS_RECIPIENTS, businessCategoryLabel, businessOptionLabel, calculateBusinessMaterials, calculateBusinessOperationalPlan, getBusinessCopiesForPoi, resolveVerifiedCompetitorCount } from "../../../lib/business/business-config.js";
import { CAP_LOMBARDIA } from "../../../lib/step2/capLombardia.js";
import { checkMilanoTerritory } from "../../../lib/step2/milanoTerritoryHelper.js";
import { computeDoorToDoorCoverage, getZoneFullCoverageFlyers } from "../../../lib/doorToDoorCoverage.js";
import { confirmedSourcesOrFallback, defaultLayerState, normalizeDataSourceLabel, sourceIsConfirmed } from "../../../lib/dataSources.js";
import { debugStep2Log, debugStep2Warn, isStep2DebugEnabled } from "../../../lib/step2/debugStep2.js";
import { filterPoisForCampaignTarget } from "../../../lib/step2/poiFiltering.js";
import { formatAreaIT, formatIntegerIT, formatNumber, formatPercentIT, formatRadiusLabel } from "../../../lib/utils/format.js";
import { GEO_DATA } from "../../../lib/geoData.js";
import { geoJsonApproxCentroid, geoJsonContainsPoint } from "../../../lib/geo/pointInPolygon.js";
import { getServiceAccent } from "../../../lib/services/service-config.js";
import { GRANDE_CITTA_ZONE_THRESHOLD, isZonaRilevante } from "../../../lib/services/zone-list-config.js";
import { InteractiveRadiusSlider } from "../../../components/InteractiveRadiusSlider.jsx";
import { isTerritorialStep2AiEnabled } from "../../../lib/runtimeFlags.js";
import { kmToPx, MH, MW, s2proj, SCALE_X, SCALE_Y, thColor } from "../../../lib/step2/miniMapProjection.js";
import { kpiLabel } from "../../../lib/services/kpi-definitions.js";
import { LAYERS, SERVICE_META } from "../../../lib/services/serviceMeta.js";
import { normalizeNominatimGeocodeResult, normalizeNominatimH2HBootstrapPoint } from "../../../lib/geocoding/canonicalizeItalianMunicipalityName.js";
import { printTerritorialReportPdf } from "../../../lib/pdf/printTerritorialReportPdf.js";
import { PROMOTER_COUNT_OPTIONS, PROMOTER_SHIFT_DURATION_OPTIONS, PROMOTER_TIME_SLOT_OPTIONS } from "../../../lib/step1/step1OptionLists.js";
import { QUOTE_PRICES } from "../../../lib/appConstants.js";
import { S2_RADII } from "../../../lib/step2/s2Constants.js";
import { Step1Icon } from "../../../components/Step1Icon.jsx";
import { Step2Map } from "../../../components/Step2Map.jsx";
import { supabase } from "../../../lib/supabaseClient.js";
import { truthfulSourceLabel } from "../../../lib/step2/truthfulSourceLabel.js";
import { useAddressPoints } from "../../../hooks/useAddressPoints.js";
import { useDemographicIndicators } from "../../../hooks/useDemographicIndicators.js";
import { usePoi } from "../../../hooks/usePoi.js";
import { useSectors } from "../../../hooks/useSectors.js";
import { useServiceAnalysis } from "../../../hooks/useServiceAnalysis.js";
import { applyConfiguratorServiceChange } from "../../../lib/configuratorServiceTransition.js";
import { useTransportStops } from "../../../hooks/useTransportStops.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function Step2({
  data,
  setData,
  onNext,
  onBack,
  aiIdentity,
  aiContextId
}) {
  const isMobile = useIsMobile();
  const svcRaw = data.selectedService || data.activeService || data.type || "d2d";
  const svcType = {
    door_to_door: "d2d",
    "door-to-door": "d2d",
    door: "d2d",
    hand_to_hand: "h2h",
    "hand-to-hand": "h2h",
    business: "b2b",
    "business-distribution": "b2b",
    business_b2b: "b2b"
  }[svcRaw] || svcRaw;
  const serviceMeta = SERVICE_META[svcType] || SERVICE_META.d2d;
  const col = getServiceAccent(svcType);
  const layers = LAYERS[svcType] || LAYERS.d2d;
  const isResidentialStep2 = serviceMeta.mode === "residential";
  const isBusinessStep2 = serviceMeta.mode === "business";
  const isFitnessSector = isBusinessStep2 && ((data.distributionTargets || []).includes('fitness') || data.businessCategory === 'fitness' || data.activityType === 'fitness' || data.targetBusiness === 'fitness');
  const showTerritoryData = isResidentialStep2 || isFitnessSector;
  const isMovementStep2 = serviceMeta.mode === "movement";
  const normalizeSavedH2HPoint = point => {
    if (!isMovementStep2 || !point) return point;
    const countryCode = point.countryCode || point.country_code || (point.source === "step1_promoter_assignment" ? "it" : null);
    return normalizeNominatimH2HBootstrapPoint(point, {
      countryCode
    });
  };
  const hydratedH2HSearchPoint = normalizeSavedH2HPoint(data.selectedSearchPoint || null);
  const hydratedH2HMunicipalityName = hydratedH2HSearchPoint?.parentComune || null;
  const hydratedH2HCity = hydratedH2HMunicipalityName ? {
    ...(data.city || {}),
    name: hydratedH2HMunicipalityName,
    label: hydratedH2HMunicipalityName,
    lat: Number(data.city?.lat ?? hydratedH2HSearchPoint.lat),
    lng: Number(data.city?.lng ?? hydratedH2HSearchPoint.lng)
  } : null;
  const hydratedH2HSelectedComuni = hydratedH2HCity ? [hydratedH2HCity] : data.selectedComuni;
  const flyerQuantityFromStep1 = isBusinessStep2 ? Number(data.businessMaterialQuantity ?? data.insertedFlyersOriginal ?? data.originalFlyerQuantity ?? data.flyerQuantity ?? data.qty ?? 0) : Number(data.insertedFlyersOriginal || data.originalFlyerQuantity || data.flyerQuantity || data.qty || 10000);
  const targetBusinessMeta = isBusinessStep2 ? getTargetBizMeta(data) : null;
  const step1OperationalLocation = isMovementStep2 ? String(data.distributionLocation || "").trim() : "";
  const step1OperationalPointType = isMovementStep2 ? String(data.distributionPointType || "").trim() : "";
  const step1OperationalPoints = isMovementStep2 ? (Array.isArray(data.operationalPoints) && data.operationalPoints.length > 0 ? data.operationalPoints : Array.isArray(data.promoterAssignments) && data.promoterAssignments.length > 0 ? data.promoterAssignments : data.selectedSearchPoint ? [data.selectedSearchPoint] : []).map(normalizeSavedH2HPoint).filter(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng))).map((point, index) => ({
    ...point,
    promoterNumber: Number(point.promoterNumber || index + 1),
    label: point.label || point.location || `Punto operativo ${index + 1}`,
    pointType: point.pointType || point.distributionPointType || step1OperationalPointType,
    timeSlot: point.timeSlot || data.timeSlot || null,
    serviceDurationHours: Number(point.serviceDurationHours || data.serviceDurationHours || 4)
  })) : [];
  const promoterCountForStep2 = isMovementStep2 ? Math.max(1, Number(data.promoterCount || step1OperationalPoints.length || 1)) : 0;
  const serviceDurationForStep2 = isMovementStep2 ? Math.max(1, Number(data.serviceDurationHours || 4)) : 0;
  const configuredH2HCapacity = isMovementStep2 ? Math.max(0, Number(data.h2hEstimatedCapacity || 0), step1OperationalPoints.reduce((total, point) => total + Number(point.assignedQuantity || 0), 0), promoterCountForStep2 * serviceDurationForStep2 * H2H_FLYERS_PER_PROMOTER_HOUR) : 0;
  const step1PointTypeSearchTerm = {
    stazione: "stazione",
    piazza: "piazza",
    centro_commerciale: "centro commerciale",
    universita: "università scuola",
    fiera_evento: "fiera evento"
  }[step1OperationalPointType] || "";
  const step1OperationalQuery = step1PointTypeSearchTerm && !normalizeTerritoryName(step1OperationalLocation).includes(normalizeTerritoryName(step1PointTypeSearchTerm)) ? `${step1OperationalLocation} ${step1PointTypeSearchTerm}`.trim() : step1OperationalLocation;
  const hasSavedStep2Point = Boolean(hydratedH2HSearchPoint);
  const shouldUseStep1OperationalLocation = Boolean(step1OperationalLocation && !hasSavedStep2Point);
  const [viewMode, setViewMode] = useState("distribuzione");
  const [thLayerId, setThLayerId] = useState(layers[0]?.id || null);
  const resolveStep2City = value => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const sIntent = detectSearchIntent(raw);
    if (sIntent.intent === "address") {
      if (sIntent.parentComune === "Milano" || /\bmilano\b/i.test(raw)) {
        const milanoObj = {
          id: "milano",
          name: "Milano",
          label: "Milano",
          lat: 45.4642,
          lng: 9.19
        };
        logAddressVsMunicipalityDebug(raw, null, milanoObj, null, true, "resolve_step2_city_milano_address", raw, "address", "Milano");
        return milanoObj;
      }
      logAddressVsMunicipalityDebug(raw, null, null, null, true, "resolve_step2_city_non_milano_address_blocked", raw, "address", null);
      return null;
    }
    const normalizedRaw = normalizeTerritoryName(normalizeMunicipalityName(raw));
    if (!normalizedRaw) return null;
    if (normalizedRaw === "milano") {
      const milanoObj = {
        id: "milano",
        name: "Milano",
        label: "Milano",
        lat: 45.4642,
        lng: 9.19
      };
      logAddressVsMunicipalityDebug(raw, null, milanoObj, null, false, "resolve_step2_city_exact_milano", raw, "municipality", "Milano");
      return milanoObj;
    }
    const exactKnownCity = GEO_DATA.find(g => {
      const name = normalizeTerritoryName(normalizeMunicipalityName(g.name || g.label || ""));
      return name && name === normalizedRaw;
    });
    if (exactKnownCity) {
      logAddressVsMunicipalityDebug(raw, null, exactKnownCity, null, false, "resolve_step2_city_exact_match", exactKnownCity.name, "municipality", exactKnownCity.name);
      return exactKnownCity;
    }
    const fuzzyCity = GEO_DATA.find(g => {
      const name = normalizeTerritoryName(normalizeMunicipalityName(g.name || g.label || ""));
      return name && normalizedRaw.length >= 4 && (normalizedRaw.includes(name) || name.includes(normalizedRaw));
    }) || null;
    if (fuzzyCity) {
      logAddressVsMunicipalityDebug(raw, null, fuzzyCity, null, false, "resolve_step2_city_fuzzy_match", fuzzyCity.name, "municipality", fuzzyCity.name);
    }
    return fuzzyCity;
  };
  const initialCity = hydratedH2HCity || data.city || resolveStep2City(data.cityName) || null;
  const [search, setSearch] = useState(hydratedH2HSearchPoint?.label || (shouldUseStep1OperationalLocation ? step1OperationalLocation : data.cityName) || "");
  const [city, setCity] = useState(initialCity);
  const [radius, setRadius] = useState(data.radius || 3);
  const [selected, setSelected] = useState(data.zones || []);
  const [dropOpen, setDropOpen] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showAdv, setShowAdv] = useState(false);
  const [omiExpanded, setOmiExpanded] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [zoneListSort, setZoneListSort] = useState("relevance");
  const [showClientZoneDetails, setShowClientZoneDetails] = useState(false);
  const [expandedZoneRows, setExpandedZoneRows] = useState(() => new Set());
  const toggleZoneRowDetail = rowKey => setExpandedZoneRows(prev => {
    const next = new Set(prev);
    if (next.has(rowKey)) next.delete(rowKey);else next.add(rowKey);
    return next;
  });
  const [showMarginalZones, setShowMarginalZones] = useState(false);
  // Comune Milano vista principale: 88 card NIL sono un dettaglio tecnico, non
  // la vista di default — collassate dietro un bottone. In Raggio (dove la
  // lista NIL è parte diretta del calcolo del raggio) e in NIL manuale (dove
  // l'utente sta scegliendo proprio le NIL) la lista resta sempre visibile.
  const [showMilanoNilList, setShowMilanoNilList] = useState(false);
  // Nome NIL da pre-selezionare non appena la modalità NIL manuale carica le
  // 88 zone di Milano — usato dal flusso "Brera non è un comune → seleziona
  // come NIL" (bottone nel dropdown ricerca Comune).
  const [pendingNilPreselectName, setPendingNilPreselectName] = useState(null);
  // Punto cercato PIÙ PRECISO del centroide comune ({label, lat, lng, type:
  // "nil"|"address", parentComune}). Quando presente, la modalità Raggio centra
  // cerchio/marker/query su questo punto invece che sul centroide del comune
  // (es. "Milano via Brera" → raggio da Brera, non dal Duomo). Azzerato quando
  // l'utente seleziona un nuovo comune dalla ricerca.
  const [selectedSearchPoint, setSelectedSearchPoint] = useState(hydratedH2HSearchPoint || null);
  // Un indirizzo/punto (type "address") NON deve far calcolare in automatico
  // il comune completo (88 NIL/744.299 famiglie) — solo un click esplicito su
  // "Usa Milano comune completo" lo abilita. Azzerato ogni volta che cambia il
  // punto cercato (vedi selectAddressPointInMilano), così il prossimo indirizzo
  // richiede una nuova conferma esplicita.
  const [addressFullCoverageConfirmed, setAddressFullCoverageConfirmed] = useState(false);
  const [radiusSelectionConfirmed, setRadiusSelectionConfirmed] = useState(Boolean(data.radiusSelectionConfirmed || data.searchMode === "address" && ((data.zones || []).length > 0 || (data.zonesAllocation || []).length > 0)));
  const [activeMapLayers, setActiveMapLayers] = useState(() => defaultLayerState(svcType));
  const [dismissedAdvisoryRadius, setDismissedAdvisoryRadius] = useState(null);
  useEffect(() => {
    if (!data.selectedService && !data.activeService && !data.type) {
      setData(d => ({
        ...d,
        type: "d2d",
        selectedService: "d2d",
        activeService: "d2d"
      }));
    }
  }, [data.selectedService, data.activeService, data.type, setData]);
  const [isAdminView, setIsAdminView] = useState(false);
  // Toolbar GIS a icone su Step2Map (Confini/DUSAF/Densità/OMI/POI/Satellite)
  // — solo controlli di visualizzazione, nessun impatto su KPI/formule/backend.
  // ON/OFF, popup e stile vivono in Step2Map; qui restano solo i due stati
  // che riflettono dati/logica di proprietà di Step2 (confine e basemap).
  const [mapConfiniOn, setMapConfiniOn] = useState(true);
  const [mapBasemap, setMapBasemap] = useState("standard");
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [partialCoverageConfirmed, setPartialCoverageConfirmed] = useState(false);
  const [coverageDecision, setCoverageDecision] = useState(normalizeCoverageDecision(data.coverageDecision));
  const [availableFlyers, setAvailableFlyers] = useState(() => isBusinessStep2 ? Number(data.businessMaterialQuantity ?? data.availableFlyers ?? data.flyerQuantity ?? data.qty ?? 0) : Number(data.availableFlyers || data.flyerQuantity || data.qty || 10000));
  const [manualFlyers, setManualFlyers] = useState(Number(data.manualFlyers || 0) || "");
  // Surplus decision (quantity > recommendedFlyers with 100% municipality coverage):
  // "reduce_to_recommended" | "extra_frequency" | "expand_area". Independent of
  // coverageDecision, which handles the shortage (partial coverage) case.
  const [coverageStrategy, setCoverageStrategy] = useState(data.coverageStrategy || null);
  const [geocodeSuggestions, setGeocodeSuggestions] = useState([]);
  const [addressSearchError, setAddressSearchError] = useState("");
  const [manualPinMode, setManualPinMode] = useState(false);
  const [allocationMode, setAllocationMode] = useState(data.allocationMode || "auto");
  const [manualAssignments, setManualAssignments] = useState(data.manualAssignments || {});
  // Ordine di priorità per la modalità "Priorità" (solo modalità Comuni):
  // array di zone id nell'ordine scelto dall'utente. Non usato/non mostrato
  // in modalità Raggio.
  const [comuniPriorityOrder, setComuniPriorityOrder] = useState(data.comuniPriorityOrder || []);
  const initialSearchMode = shouldUseStep1OperationalLocation ? "address" : data.searchMode || "municipality";
  const [searchMode, setSearchMode] = useState(initialSearchMode);
  // Reset difensivo: "Priorità" esiste solo in modalità Comuni. Se l'utente
  // passa a Raggio/CAP mentre era attiva, si torna ad "auto" — Raggio non
  // deve mai vedere/usare questa modalità.
  useEffect(() => {
    if (searchMode !== "municipality" && allocationMode === "priority") setAllocationMode("auto");
  }, [searchMode, allocationMode]);
  // Tracks user-INTENDED mode (only updated via tab clicks or zone switch).
  // Used as the gate in zonesInRadius to block stale "address" results from
  // overriding a municipality session when the user never clicked the Raggio tab.
  const userModeRef = useRef(initialSearchMode);
  const step1LocationBootstrapRef = useRef("");
  // Timestamp of the last municipality (city) change. React commits the new
  // `city`/`selectedMunicipality` synchronously during render, but the API
  // hook's `loading` flag only flips to true in a *subsequent* effect pass —
  // for one or more renders in between, `apiZones` still reflects the OLD
  // city while the selected name is already the NEW one. This grace window
  // lets zonesInRadius treat that gap as "waiting", not a real mismatch.
  const municipalitySwitchAtRef = useRef(0);
  const [municipalityBoundary, setMunicipalityBoundary] = useState(null);
  // Cache dei confini già scaricati da Nominatim, per nome comune normalizzato:
  // evita di ripetere la fetch di rete ogni volta che si torna alla modalità
  // Comune dopo essere passati per Raggio (vedi effect sotto).
  const municipalityBoundaryCacheRef = useRef(new Map());
  const [hiddenBoundaries, setHiddenBoundaries] = useState([]);
  const [selectedComuni, setSelectedComuni] = useState(hydratedH2HSelectedComuni || (initialCity ? [initialCity] : []));
  useEffect(() => {
    if (isStep2DebugEnabled()) {
      debugStep2Log("[MULTI_ZONE_STATE]", {
        selectedComuni: selectedComuni.map(z => ({
          id: z.id,
          name: z.label || z.name
        }))
      });
    }
  }, [selectedComuni]);
  const [pendingAddMunicipality, setPendingAddMunicipality] = useState(false);
  const [duplicateComuneNotice, setDuplicateComuneNotice] = useState("");
  const selectedMunicipalityItems = useMemo(() => {
    const rawItems = Array.isArray(selectedComuni) && selectedComuni.length > 0 ? selectedComuni : city ? [city] : [];
    const byKey = new Map();
    rawItems.forEach(item => {
      if (!item) return;
      const obj = typeof item === "string" ? {
        name: item
      } : item;
      const label = obj.label || obj.name || obj.comune_name || obj.municipality_name || "";
      const norm = normalizeMunicipalityName(label);
      const key = getMunicipalityDedupKey(obj) || norm;
      if (key && norm && !byKey.has(key)) byKey.set(key, obj);
    });
    return Array.from(byKey.values());
  }, [selectedComuni, city]);
  const selectedMunicipalityNames = useMemo(() => selectedMunicipalityItems.map(item => item?.label || item?.name || item?.comune_name || item?.municipality_name || "").filter(Boolean), [selectedMunicipalityItems]);
  const selectedMunicipalitySummary = useMemo(() => selectedMunicipalityItems.map(item => ({
    id: item?.id || item?.placeId || item?.place_id || null,
    name: item?.label || item?.name || item?.comune_name || item?.municipality_name || "",
    lat: Number.isFinite(Number(item?.lat)) ? Number(item.lat) : null,
    lng: Number.isFinite(Number(item?.lng)) ? Number(item.lng) : null,
    istat_code: item?.istat_code || item?.municipalityCode || item?.municipality_code || null,
    province: item?.prov || item?.province || item?.county || null
  })).filter(item => item.name), [selectedMunicipalityItems]);
  const selectedMunicipalityDisplayLabel = selectedMunicipalityNames.length > 1 ? `${selectedMunicipalityNames.length} comuni completi` : selectedMunicipalityNames[0] || "";
  const searchedLocation = data.searchedLocation || "";
  const selectPrimaryMunicipality = useCallback(comune => {
    if (!comune) return;
    if (isStep2DebugEnabled()) {
      debugStep2Log("[STEP2_MULTI_COMUNE_STATE_DEBUG]", {
        action: "selectPrimaryMunicipality",
        target: comune.label || comune.name
      });
    }
    setCity(comune);
    setSelectedComuni([comune]);
    setSearch(comune.label || comune.name || "");
    setDropOpen(false);
    setSelected([]);
    setSelectedSearchPoint(null);
    setAddressFullCoverageConfirmed(false);
    setRadiusSelectionConfirmed(false);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setAddressSearchError("");
    setPendingAddMunicipality(false);
    if (userModeRef.current !== "municipality") {
      userModeRef.current = "municipality";
      setSearchMode("municipality");
    }
  }, []);
  const selectMunicipalityAsRadiusCenter = useCallback(comune => {
    if (!comune) return;
    userModeRef.current = "address";
    setSearchMode("address");
    setCity(comune);
    setSelectedComuni([comune]);
    setSearch(comune.label || comune.name || "");
    setDropOpen(false);
    setSelected([]);
    setSelectedSearchPoint(null);
    setAddressFullCoverageConfirmed(false);
    setRadiusSelectionConfirmed(true);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setAddressSearchError("");
    setPendingAddMunicipality(false);
  }, []);
  const selectOperationalPoint = useCallback((pointLabel, point, source = "step2_search") => {
    if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) return false;
    const fullText = `${point.city || point.comune || point.municipality || ""} ${point.fullName || point.name || ""} ${pointLabel || ""}`;
    const parentName = point.city || point.comune || point.municipality || GEO_DATA.find(known => {
      const normalizedKnown = normalizeMunicipalityName(known.name || known.label || "");
      return normalizedKnown && normalizeMunicipalityName(fullText).includes(normalizedKnown);
    })?.name || null;
    const knownParent = resolveStep2City(parentName);
    const parentCity = knownParent || (parentName ? {
      id: `operational_${normalizeMunicipalityName(parentName).replace(/\s+/g, "_")}`,
      name: parentName,
      label: parentName,
      lat: Number(point.lat),
      lng: Number(point.lng)
    } : null);
    if (!parentCity) return false;
    const operationalPoint = {
      label: pointLabel || point.label || point.name || "Punto operativo",
      lat: Number(point.lat),
      lng: Number(point.lng),
      type: "operational_point",
      parentComune: parentCity.label || parentCity.name,
      city: parentCity.label || parentCity.name,
      postcode: point.postcode || null,
      province: point.province || null,
      providerPlaceId: point.providerPlaceId || point.id || null,
      precision: point.placeType || point.type || "poi",
      source
    };
    userModeRef.current = "address";
    setSearchMode("address");
    setCity(parentCity);
    setSelectedComuni([parentCity]);
    setSearch(operationalPoint.label);
    setSelectedSearchPoint(operationalPoint);
    setSelected([]);
    setDropOpen(false);
    setAddressFullCoverageConfirmed(false);
    setRadiusSelectionConfirmed(true);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setAddressSearchError("");
    setPendingAddMunicipality(false);
    return true;
  }, []);
  useEffect(() => {
    if (!isMovementStep2 || !step1OperationalLocation || hasSavedStep2Point) return undefined;
    const bootstrapKey = normalizeMunicipalityName(step1OperationalQuery);
    if (!bootstrapKey || step1LocationBootstrapRef.current === bootstrapKey) return undefined;
    step1LocationBootstrapRef.current = bootstrapKey;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const params = new URLSearchParams({
          q: step1OperationalQuery,
          countrycodes: "it",
          format: "json",
          addressdetails: "1",
          limit: "6"
        });
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
          signal: controller.signal
        });
        const rows = await response.json();
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const wantsStation = /\b(stazione|station|fermata|metro)\b/i.test(step1OperationalQuery) || step1OperationalPointType === "stazione";
        const ranked = [...rows].sort((a, b) => {
          const score = row => {
            const typeText = `${row.type || ""} ${row.addresstype || ""} ${row.class || ""} ${row.display_name || ""}`;
            return (wantsStation && /station|railway|halt|stop|stazione/i.test(typeText) ? 10 : 0) + (row.importance || 0);
          };
          return score(b) - score(a);
        });
        const best = normalizeNominatimH2HBootstrapPoint(ranked[0]);
        const label = best.name || step1OperationalQuery;
        selectOperationalPoint(label, best, "step1_distribution_location");
      } catch (error) {
        if (error?.name !== "AbortError") {
          step1LocationBootstrapRef.current = "";
          debugStep2Warn("[STEP1_OPERATIONAL_LOCATION_GEOCODE_FAILED]", {
            location: step1OperationalLocation,
            pointType: step1OperationalPointType,
            query: step1OperationalQuery,
            error: error?.message
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isMovementStep2, step1OperationalLocation, step1OperationalPointType, step1OperationalQuery, hasSavedStep2Point, selectOperationalPoint]);
  const appendMunicipalityToActiveZone = useCallback(comune => {
    if (!comune) return;
    const newKey = getMunicipalityDedupKey(comune);
    if (!newKey) return;
    setSelectedComuni(prev => {
      const existingKeys = new Set((prev || []).map(c => getMunicipalityDedupKey(c)).filter(Boolean));
      if (existingKeys.has(newKey)) {
        if (isStep2DebugEnabled()) {
          debugStep2Log("[STEP2_MULTI_COMUNE_STATE_DEBUG]", {
            action: "appendMunicipality_duplicate_prevented",
            target: comune.label || comune.name,
            existingKeys: Array.from(existingKeys)
          });
        }
        setDuplicateComuneNotice(`Il comune "${comune.label || comune.name}" è già presente nella selezione.`);
        setTimeout(() => setDuplicateComuneNotice(""), 4000);
        return prev;
      }
      const next = [...(prev || []), comune];
      if (isStep2DebugEnabled()) {
        debugStep2Log("[STEP2_MULTI_COMUNE_STATE_DEBUG]", {
          action: "appendMunicipality_success",
          added: comune.label || comune.name,
          total: next.length
        });
      }
      return next;
    });
    if (!city) {
      setCity(comune);
    }
    setSearch("");
    setDropOpen(false);
    setPendingAddMunicipality(false);
    setSelectedSearchPoint(null);
    setRadiusSelectionConfirmed(false);
  }, [city]);
  const removeMunicipalityFromActiveZone = useCallback(targetNormOrId => {
    if (!targetNormOrId) return;
    setSelectedComuni(prev => {
      const next = (prev || []).filter(c => {
        const norm = normalizeMunicipalityName(c.label || c.name || "");
        const id = String(c.id || "");
        const code = String(c.istat_code || c.municipalityCode || c.municipality_code || "");
        return norm !== targetNormOrId && id !== targetNormOrId && code !== targetNormOrId;
      });
      if (isStep2DebugEnabled()) {
        debugStep2Log("[STEP2_MULTI_COMUNE_STATE_DEBUG]", {
          action: "removeMunicipality",
          target: targetNormOrId,
          remaining: next.length
        });
      }
      if (next.length === 0) {
        setCity(null);
        setMunicipalityBoundary(null);
        setSelectedSearchPoint(null);
      } else if (city && normalizeMunicipalityName(city.label || city.name || "") === targetNormOrId) {
        setCity(next[0] || null);
      }
      return next;
    });
  }, [city]);
  const [capSuggestions, setCapSuggestions] = useState([]);
  const [capSearchLoading, setCapSearchLoading] = useState(false);
  const [selectedCaps, setSelectedCaps] = useState(data.selectedCaps || []);
  const [capDataMap, setCapDataMap] = useState(data.capDataMap || {});
  const [techAccordion, setTechAccordion] = useState({
    zonaAttiva: true,
    telemetria: false,
    omi: false,
    demografia: false,
    score: false,
    fonti: false
  });
  const toggleTechAccordion = key => setTechAccordion(prev => ({
    ...prev,
    [key]: !prev[key]
  }));
  const [openOutputPopover, setOpenOutputPopover] = useState(null);
  const activeZoneForRadius = data.campaignZones?.find(z => z.id === data.activeZoneId) || null;
  const activeAreaTab = searchMode === "municipality" ? "comune" : searchMode === "address" ? "raggio" : "cap";
  const selectionMode = activeAreaTab;
  const territoryMode = searchMode === "municipality" ? "full_municipality" : searchMode === "address" ? "radius" : "cap";
  const isComuneMode = activeAreaTab === "comune";
  const isRadiusMode = activeAreaTab === "raggio";
  const isCapMode = activeAreaTab === "cap";
  // Modalità "NIL / Quartieri" manuale (solo Milano, tab Comune): quando attiva,
  // le NIL scelte manualmente diventano l'area principale (areaMode "custom_zone").
  // Quando spenta, Comune Milano = comune completo (aggregato di TUTTE le NIL),
  // mai la prima NIL (es. DUOMO) come fallback silenzioso.
  const [nilManualMode, setNilManualMode] = useState(false);
  // Indirizzo/punto selezionato (Corso Como, Via Brera-come-indirizzo, ecc.)
  // mentre si è sul tab Comune: NON deve calcolare automaticamente il comune
  // completo (88 NIL/744.299 famiglie) finché l'utente non conferma
  // esplicitamente "Usa Milano comune completo" — vedi box dedicato in JSX.
  // nilManualMode ESCLUSO apposta: cliccando "Seleziona NIL/quartiere vicino"
  // si passa a quella modalità, che ha già la sua UI di selezione dedicata.
  // Safety net indipendente dal placeType del geocoder (inaffidabile per
  // luoghi ambigui, es. "Corso Como" taggato come area/locality invece che
  // indirizzo): se il testo cercato contiene ancora un odonimo + "milano" ED
  // è stato selezionato proprio il comune Milano, tratta comunque come
  // indirizzo non confermato — anche se selectedSearchPoint non fosse stato
  // valorizzato per qualche motivo lato geocoder.
  const searchLooksLikeMilanoAddress = ADDRESS_INTENT_RE.test(search) && /\bmilano\b/i.test(search) && normalizeMunicipalityName(city?.label || city?.name) === "milano";
  const hasUnconfirmedAddressPoint = isComuneMode && !addressFullCoverageConfirmed && !nilManualMode && !addressSearchError && Boolean(selectedSearchPoint?.type === "address" && Number.isFinite(Number(selectedSearchPoint?.lat)) && Number.isFinite(Number(selectedSearchPoint?.lng)));
  const usingMunicipalityFullCoverage = isComuneMode && !hasUnconfirmedAddressPoint;
  const selectedComune = city || selectedComuni && selectedComuni[0] || null;
  // Centro del raggio, con priorità: punto/indirizzo/NIL cercato → centroide
  // comune. Usato SOLO in modalità Raggio: Comune resta sul confine comunale,
  // e la query tecnica NIL Milano resta sul centroide (sweep 15km completo).
  const hasSearchPoint = Boolean(selectedSearchPoint && Number.isFinite(Number(selectedSearchPoint.lat)) && Number.isFinite(Number(selectedSearchPoint.lng)));
  const radiusCenterSource = isRadiusMode ? hasSearchPoint ? selectedSearchPoint.type || "address" : "municipality" : null;
  const radiusCenter = isRadiusMode && hasSearchPoint ? {
    lat: Number(selectedSearchPoint.lat),
    lng: Number(selectedSearchPoint.lng),
    label: selectedSearchPoint.label || null
  } : city ? {
    lat: city.lat,
    lng: city.lng,
    label: city.label || city.name || null
  } : null;
  // "city" per la mappa: in Raggio col punto cercato, marker e cerchio si
  // centrano sul punto (Via Brera / NIL Brera); in Comune con indirizzo NON
  // ancora confermato, il marker resta sul punto cercato invece che sul
  // centroide Milano — evita di mostrare il confine comunale come "scelta
  // finale" mentre l'utente non ha ancora deciso comune/raggio/NIL.
  const mapCenterOverride = isRadiusMode ? hasSearchPoint ? radiusCenter : null : hasUnconfirmedAddressPoint && hasSearchPoint ? {
    lat: Number(selectedSearchPoint.lat),
    lng: Number(selectedSearchPoint.lng),
    label: selectedSearchPoint.label || null
  } : null;
  const mapCityForStep2 = mapCenterOverride && city ? {
    ...city,
    lat: mapCenterOverride.lat,
    lng: mapCenterOverride.lng,
    label: mapCenterOverride.label || city.label,
    name: mapCenterOverride.label || city.name
  } : city;
  const rawRadiusKm = Number(radius ?? activeZoneForRadius?.radiusKm ?? activeZoneForRadius?.radius ?? data.radiusKm ?? data.radius ?? 3);
  const radiusKm = isComuneMode ? null : rawRadiusKm || 3;
  const selectedRadius = radiusKm;
  const radiusMeters = radiusKm != null ? radiusKm * 1000 : null;
  const quantityForAnalysis = Number(activeZoneForRadius?.assigned_flyers || data.qty || 10000);
  const prevActiveZoneIdRef = useRef(null);

  // Mount Prefill / Initialization effect
  useEffect(() => {
    if (!data.campaignZones || data.campaignZones.length === 0) {
      const defaultZoneId = "zone_" + Date.now();
      const flyerQuantityFromStep1 = data.qty || 10000;
      const initialZoneCount = data.zoneCountIntent === "few" ? 2 : data.zoneCountIntent === "multi" ? 3 : 1;
      const makeInitialZone = index => ({
        id: defaultZoneId,
        zone_label: `Zona ${index + 1}`,
        store_name: data.storeName || "",
        service_type: svcType,
        service_variant: data.flyerFormat || "a5",
        assigned_flyers: flyerQuantityFromStep1,
        assigned_budget: flyerQuantityFromStep1 * ((QUOTE_PRICES[svcType] || 18.5) / 1000),
        coverage_percent: 100,
        recommended_flyers: flyerQuantityFromStep1,
        searchMode: index === 0 ? data.searchMode || "municipality" : "municipality",
        city: index === 0 ? data.city || initialCity || null : null,
        cityName: index === 0 ? data.cityName || initialCity?.label || initialCity?.name || "" : "",
        radius: index === 0 ? data.radiusKm || data.radius || 3 : 3,
        radiusKm: index === 0 ? data.radiusKm || data.radius || 3 : 3,
        selected: index === 0 ? data.zones || [] : [],
        selectedCaps: index === 0 ? data.selectedCaps || [] : [],
        capDataMap: index === 0 ? data.capDataMap || {} : {},
        manualAssignments: index === 0 ? data.manualAssignments || {} : {},
        allocationMode: data.allocationMode || "auto",
        coverageMode: null,
        availableFlyers: flyerQuantityFromStep1,
        manualFlyers: null,
        finalFlyers: flyerQuantityFromStep1,
        calculationStatus: "idle",
        startDate: data.startDate || "",
        endDate: data.endDate || "",
        activeMapLayers: defaultLayerState(svcType)
      });
      const initZone = makeInitialZone(0);
      const initialZones = Array.from({
        length: initialZoneCount
      }, (_, index) => index === 0 ? initZone : {
        ...makeInitialZone(index),
        id: `zone_${Date.now()}_${index}`
      });
      setData(prev => ({
        ...prev,
        campaignZones: initialZones,
        activeZoneId: defaultZoneId,
        selectedService: svcType,
        activeService: svcType,
        type: svcType,
        flyerQuantityFromStep1: flyerQuantityFromStep1,
        qty: flyerQuantityFromStep1,
        flyerQuantity: flyerQuantityFromStep1
      }));
      prevActiveZoneIdRef.current = defaultZoneId;
    } else if (!data.activeZoneId && data.campaignZones.length > 0) {
      const activeZone = data.campaignZones[0];
      setData(prev => ({
        ...prev,
        activeZoneId: activeZone.id,
        selectedService: activeZone.service_type || "d2d",
        activeService: activeZone.service_type || "d2d",
        type: activeZone.service_type || "d2d",
        flyerQuantityFromStep1: activeZone.assigned_flyers || 10000,
        qty: activeZone.assigned_flyers || 10000,
        flyerQuantity: activeZone.assigned_flyers || 10000,
        flyerFormat: activeZone.service_variant || "a5"
      }));
      prevActiveZoneIdRef.current = activeZone.id;
    } else {
      prevActiveZoneIdRef.current = data.activeZoneId;
    }
  }, []);

  // Load active zone to local states when activeZoneId changes
  useEffect(() => {
    if (!data.activeZoneId || !data.campaignZones || data.campaignZones.length === 0) return;
    const activeZone = data.campaignZones.find(z => z.id === data.activeZoneId);
    if (!activeZone) return;
    const resolvedCity = activeZone.city || resolveStep2City(activeZone.cityName || activeZone.zone_label) || null;

    // Load only if activeZoneId actually changed to avoid overwriting typed input
    if (prevActiveZoneIdRef.current !== data.activeZoneId || !city && resolvedCity) {
      const isZoneSwitch = prevActiveZoneIdRef.current !== data.activeZoneId;
      prevActiveZoneIdRef.current = data.activeZoneId;
      const inferredRadiusConfirmed = Boolean(activeZone.radiusSelectionConfirmed || activeZone.searchMode === "address" && ((activeZone.selected || []).length > 0 || (activeZone.zonesAllocation || []).length > 0));

      // Update local states
      if (isZoneSwitch) {
        setSearch(activeZone.cityName || resolvedCity?.name || "");
      }
      setCity(resolvedCity);
      setSelectedComuni(prev => isZoneSwitch ? activeZone.selectedComuni || (resolvedCity ? [resolvedCity] : []) : prev && prev.length > 0 ? prev : activeZone.selectedComuni || (resolvedCity ? [resolvedCity] : []));
      setPendingAddMunicipality(false);
      setRadius(activeZone.radiusKm || activeZone.radius || 3);
      setSelected(activeZone.selected || []);
      setSelectedCaps(activeZone.selectedCaps || []);
      setCapDataMap(activeZone.capDataMap || {});
      setManualAssignments(activeZone.manualAssignments || {});
      setAllocationMode(activeZone.allocationMode || "auto");
      setCoverageDecision(normalizeCoverageDecision(activeZone.coverageDecision));
      setCoverageStrategy(activeZone.coverageStrategy || null);
      setAvailableFlyers(Number(activeZone.availableFlyers || activeZone.assigned_flyers || data.availableFlyers || data.qty || 10000));
      setManualFlyers(Number(activeZone.manualFlyers || 0) || "");
      setRadiusSelectionConfirmed(inferredRadiusConfirmed);
      setSelectedSearchPoint(activeZone.selectedSearchPoint || data.selectedSearchPoint || null);
      // Only restore searchMode on an actual zone switch — not on the city-resolution
      // fallback path (!city && resolvedCity), which would overwrite the user's current tab
      // with a stale "address" value saved from a previous session.
      if (isZoneSwitch) {
        const zoneMode = activeZone.searchMode || "municipality";
        userModeRef.current = zoneMode;
        setSearchMode(zoneMode);
      }
      if (activeZone.activeMapLayers) {
        setActiveMapLayers(activeZone.activeMapLayers);
      }

      // Sync active zone parameters back to global data for compatibility with other modules and hooks
      const zSvc = activeZone.service_type || "d2d";
      setData(prev => ({
        ...prev,
        selectedService: zSvc,
        activeService: zSvc,
        type: zSvc,
        flyerFormat: activeZone.service_variant || "a5",
        qty: activeZone.assigned_flyers || 10000,
        flyerQuantity: activeZone.assigned_flyers || 10000,
        flyerQuantityFromStep1: activeZone.assigned_flyers || 10000,
        cityName: activeZone.cityName || resolvedCity?.label || resolvedCity?.name || "",
        city: resolvedCity,
        selectedComuni: activeZone.selectedComuni || (resolvedCity ? [resolvedCity] : []),
        radius: activeZone.radiusKm || activeZone.radius || 3,
        radiusKm: activeZone.radiusKm || activeZone.radius || 3,
        zones: activeZone.selected || [],
        selectedSearchPoint: activeZone.selectedSearchPoint || prev.selectedSearchPoint || null,
        selectedCaps: activeZone.selectedCaps || [],
        capDataMap: activeZone.capDataMap || {},
        manualAssignments: activeZone.manualAssignments || {},
        allocationMode: activeZone.allocationMode || "auto",
        coverageDecision: normalizeCoverageDecision(activeZone.coverageDecision),
        coverageStrategy: activeZone.coverageStrategy || null,
        availableFlyers: Number(activeZone.availableFlyers || activeZone.assigned_flyers || prev.availableFlyers || prev.qty || 10000),
        manualFlyers: Number(activeZone.manualFlyers || 0) || null,
        finalFlyers: Number(activeZone.finalFlyers || activeZone.assigned_flyers || prev.qty || 10000),
        radiusSelectionConfirmed: inferredRadiusConfirmed,
        startDate: activeZone.startDate || "",
        endDate: activeZone.endDate || ""
      }));
    }
  }, [data.activeZoneId, data.campaignZones]);

  // Reciprocally update data.campaignZones when local states change
  useEffect(() => {
    if (!data.activeZoneId || !data.campaignZones || data.campaignZones.length === 0) return;
    setData(prev => {
      if (!prev.campaignZones || !prev.activeZoneId) return prev;
      const zoneIndex = prev.campaignZones.findIndex(z => z.id === prev.activeZoneId);
      if (zoneIndex === -1) return prev;
      const currentZone = prev.campaignZones[zoneIndex];
      const confirmedCityName = searchMode === "municipality" && selectedMunicipalityDisplayLabel ? selectedMunicipalityDisplayLabel : city?.label || city?.name || currentZone.cityName || "";
      const changed = currentZone.cityName !== confirmedCityName || JSON.stringify(currentZone.city) !== JSON.stringify(city) || JSON.stringify(currentZone.selectedComuni) !== JSON.stringify(selectedComuni) || JSON.stringify(currentZone.selectedMunicipalities) !== JSON.stringify(selectedMunicipalitySummary) || Number(currentZone.radiusKm ?? currentZone.radius) !== Number(radiusKm) || JSON.stringify(currentZone.selected) !== JSON.stringify(selected) || JSON.stringify(currentZone.selectedCaps) !== JSON.stringify(selectedCaps) || JSON.stringify(currentZone.selectedSearchPoint || null) !== JSON.stringify(selectedSearchPoint || null) || JSON.stringify(currentZone.capDataMap) !== JSON.stringify(capDataMap) || JSON.stringify(currentZone.manualAssignments) !== JSON.stringify(manualAssignments) || currentZone.allocationMode !== allocationMode || currentZone.coverageDecision !== coverageDecision || currentZone.coverageStrategy !== coverageStrategy || currentZone.radiusSelectionConfirmed !== radiusSelectionConfirmed || currentZone.searchMode !== searchMode || JSON.stringify(currentZone.activeMapLayers) !== JSON.stringify(activeMapLayers);
      if (!changed) return prev;
      const updatedZones = [...prev.campaignZones];
      updatedZones[zoneIndex] = {
        ...currentZone,
        cityName: confirmedCityName,
        city: city,
        selectedComuni: selectedComuni,
        selectedMunicipalities: selectedMunicipalitySummary,
        radius: radiusKm,
        radiusKm: radiusKm,
        selected: selected,
        selectedSearchPoint: selectedSearchPoint,
        selectedCaps: selectedCaps,
        capDataMap: capDataMap,
        manualAssignments: manualAssignments,
        allocationMode: allocationMode,
        coverageDecision: coverageDecision,
        coverageStrategy: coverageStrategy,
        radiusSelectionConfirmed: radiusSelectionConfirmed,
        searchMode: searchMode,
        activeMapLayers: activeMapLayers
      };
      return {
        ...prev,
        campaignZones: updatedZones,
        cityName: confirmedCityName || prev.cityName || "",
        city: city,
        selectedComuni: selectedComuni,
        selectedMunicipalities: selectedMunicipalitySummary,
        radius: radiusKm,
        radiusKm: radiusKm,
        selectedRadius: radiusKm,
        zones: selected,
        selectedSearchPoint: selectedSearchPoint,
        selectedCaps: selectedCaps,
        capDataMap: capDataMap,
        manualAssignments: manualAssignments,
        allocationMode: allocationMode,
        coverageDecision: coverageDecision,
        coverageStrategy: coverageStrategy,
        radiusSelectionConfirmed: radiusSelectionConfirmed,
        searchMode: searchMode
      };
    });
  }, [city, radiusKm, selected, selectedCaps, selectedSearchPoint, selectedComuni, selectedMunicipalityDisplayLabel, selectedMunicipalitySummary, capDataMap, manualAssignments, allocationMode, coverageDecision, coverageStrategy, radiusSelectionConfirmed, searchMode, activeMapLayers, data.activeZoneId]);
  const switchToRadiusMode = () => {
    userModeRef.current = "address";
    setSearchMode("address");
    setDropOpen(false);
    setAddressSearchError("");
    if (!city && (!selectedComuni || selectedComuni.length === 0) && !selectedSearchPoint) {
      setSearch("");
      setGeocodeSuggestions([]);
    }
    const nextRad = radius || 3;
    const centerPoint = selectedSearchPoint || city;
    const shouldConfirmRadius = Boolean(centerPoint && Number.isFinite(Number(centerPoint.lat)) && Number.isFinite(Number(centerPoint.lng)) && Number(nextRad) > 0);
    setRadius(nextRad);
    setSelected([]);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setRadiusSelectionConfirmed(shouldConfirmRadius);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => {
        if (zone.id === prev.activeZoneId) {
          return {
            ...zone,
            searchMode: "address",
            mode: "radius",
            territoryMode: "radius",
            areaMode: "radius",
            radius: nextRad,
            radiusKm: nextRad,
            selected: [],
            coverageDecision: null,
            coverageStrategy: null,
            radiusSelectionConfirmed: shouldConfirmRadius
          };
        }
        return zone;
      });
      return {
        ...prev,
        searchMode: "address",
        radius: nextRad,
        radiusKm: nextRad,
        selectedRadius: nextRad,
        zones: [],
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: shouldConfirmRadius,
        campaignZones: updatedZones
      };
    });
  };
  const switchToComuneMode = () => {
    userModeRef.current = "municipality";
    setSearchMode("municipality");
    setDropOpen(false);
    setSelectedSearchPoint(null);
    setAddressFullCoverageConfirmed(true);
    setRadiusSelectionConfirmed(false);
    setSelected([]);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => {
        if (zone.id === prev.activeZoneId) {
          return {
            ...zone,
            searchMode: "municipality",
            mode: "comune",
            territoryMode: "full_municipality",
            areaMode: "full_municipality",
            radius: null,
            radiusKm: null,
            selected: [],
            coverageDecision: null,
            coverageStrategy: null,
            radiusSelectionConfirmed: false
          };
        }
        return zone;
      });
      return {
        ...prev,
        searchMode: "municipality",
        zones: [],
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: false,
        campaignZones: updatedZones
      };
    });
  };
  const switchToCapMode = () => {
    userModeRef.current = "cap";
    setSearchMode("cap");
    setDropOpen(false);
    setSelectedSearchPoint(null);
    setRadiusSelectionConfirmed(false);
    setSelected([]);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => {
        if (zone.id === prev.activeZoneId) {
          return {
            ...zone,
            searchMode: "cap",
            mode: "cap",
            territoryMode: "cap",
            areaMode: "cap",
            selected: [],
            coverageDecision: null,
            coverageStrategy: null,
            radiusSelectionConfirmed: false
          };
        }
        return zone;
      });
      return {
        ...prev,
        searchMode: "cap",
        zones: [],
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: false,
        campaignZones: updatedZones
      };
    });
  };
  const updateActiveRadius = nextRadiusKm => {
    setPartialCoverageConfirmed(false);
    setDismissedAdvisoryRadius(null);
    const normalizedRadius = Number(nextRadiusKm);
    setRadiusSelectionConfirmed(Number.isFinite(normalizedRadius) && normalizedRadius > 0);
    setRadius(normalizedRadius);
    setSelected([]);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => zone.id === prev.activeZoneId ? {
        ...zone,
        radius: normalizedRadius,
        radiusKm: normalizedRadius,
        selected: [],
        searchMode: "address",
        mode: "radius",
        territoryMode: "radius",
        areaMode: "radius",
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: Number.isFinite(normalizedRadius) && normalizedRadius > 0
      } : zone);
      return {
        ...prev,
        radius: normalizedRadius,
        radiusKm: normalizedRadius,
        selectedRadius: normalizedRadius,
        zones: [],
        searchMode: "address",
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: Number.isFinite(normalizedRadius) && normalizedRadius > 0,
        campaignZones: updatedZones
      };
    });
  };
  const resetActiveZone = () => {
    setSearch("");
    setCity(null);
    setSelectedComuni([]);
    setSelectedSearchPoint(null);
    setAddressFullCoverageConfirmed(false);
    setRadiusSelectionConfirmed(false);
    setPendingAddMunicipality(false);
    setRadius(3);
    setSelected([]);
    setSelectedCaps([]);
    setCapDataMap({});
    setManualAssignments({});
    setGeocodeSuggestions([]);
    setCapSuggestions([]);
    setDropOpen(false);
    setSearchMode("municipality");
    setNilManualMode(false);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    setPartialCoverageConfirmed(false);
    setData(prev => {
      const updatedZones = (prev.campaignZones || []).map(zone => zone.id === prev.activeZoneId ? {
        ...zone,
        city: null,
        selectedComuni: [],
        cityName: "",
        radius: null,
        radiusKm: null,
        selected: [],
        selectedCaps: [],
        capDataMap: {},
        manualAssignments: {},
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: false,
        searchMode: "municipality",
        nilManualMode: false,
        selectedSearchPoint: null,
        addressFullCoverageConfirmed: false
      } : zone);
      return {
        ...prev,
        searchedLocation: "",
        comune: "",
        cityName: "",
        city: null,
        selectedComuni: [],
        radius: 3,
        radiusKm: 3,
        selectedRadius: 3,
        zones: [],
        selectedZones: [],
        selectedCaps: [],
        capDataMap: {},
        manualAssignments: {},
        coverageDecision: null,
        coverageStrategy: null,
        radiusSelectionConfirmed: false,
        searchMode: "municipality",
        nilManualMode: false,
        selectedSearchPoint: null,
        addressFullCoverageConfirmed: false,
        campaignZones: updatedZones
      };
    });
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("comune");
      url.searchParams.delete("municipality");
      url.searchParams.set("step", "2");
      const qs = url.searchParams.toString();
      window.history.replaceState(null, "", qs ? `${url.pathname}?${qs}` : url.pathname);
    }
  };
  const handleDuplicateZone = (zoneToClone, e) => {
    if (e) e.stopPropagation();
    const newId = "zone_" + Date.now();
    const clonedZone = {
      ...zoneToClone,
      id: newId,
      zone_label: `${zoneToClone.zone_label} (Copia)`
    };
    setData(prev => ({
      ...prev,
      campaignZones: [...prev.campaignZones, clonedZone],
      activeZoneId: newId
    }));
  };
  const handleDeleteZone = (zoneId, e) => {
    if (e) e.stopPropagation();
    if (data.campaignZones.length <= 1) return;
    setData(prev => {
      const newZones = prev.campaignZones.filter(z => z.id !== zoneId);
      const newActiveId = prev.activeZoneId === zoneId ? newZones[0].id : prev.activeZoneId;
      return {
        ...prev,
        campaignZones: newZones,
        activeZoneId: newActiveId
      };
    });
  };
  const handleMoveZone = (idx, direction, e) => {
    if (e) e.stopPropagation();
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === data.campaignZones.length - 1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    setData(prev => {
      const newZones = [...prev.campaignZones];
      const temp = newZones[idx];
      newZones[idx] = newZones[targetIdx];
      newZones[targetIdx] = temp;
      return {
        ...prev,
        campaignZones: newZones
      };
    });
  };
  const handleAddZone = () => {
    const newId = "zone_" + Date.now();
    const nextSvc = svcType || data.type || "d2d";
    const newZone = {
      id: newId,
      zone_label: `Zona ${(data.campaignZones || []).length + 1}`,
      store_name: "",
      service_type: nextSvc,
      service_variant: data.flyerFormat || "a5",
      assigned_flyers: data.qty || 10000,
      assigned_budget: (data.qty || 10000) * ((QUOTE_PRICES[nextSvc] || 18.5) / 1000),
      coverage_percent: 100,
      recommended_flyers: data.qty || 10000,
      searchMode: "municipality",
      city: null,
      selectedComuni: [],
      cityName: "",
      radius: 3,
      selected: [],
      selectedCaps: [],
      capDataMap: {},
      manualAssignments: {},
      allocationMode: "auto",
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      activeMapLayers: defaultLayerState(nextSvc)
    };
    setData(prev => ({
      ...prev,
      campaignZones: [...prev.campaignZones, newZone],
      activeZoneId: newId
    }));
  };
  const updateZoneField = (zoneId, field, val) => {
    setData(prev => {
      if (!prev.campaignZones) return prev;
      const updated = prev.campaignZones.map(z => {
        if (z.id !== zoneId) return z;
        const newZ = {
          ...z,
          [field]: val
        };
        if (field === "assigned_flyers" || field === "service_type") {
          const qty = parseInt(newZ.assigned_flyers || 0);
          const svc = newZ.service_type || "d2d";
          newZ.assigned_budget = qty * ((QUOTE_PRICES[svc] || 18.5) / 1000);
        }
        return newZ;
      });
      if (prev.activeZoneId === zoneId) {
        const activeZ = updated.find(z => z.id === zoneId);
        const zSvc = activeZ.service_type || "d2d";
        return {
          ...prev,
          campaignZones: updated,
          qty: activeZ.assigned_flyers,
          flyerQuantity: activeZ.assigned_flyers,
          flyerQuantityFromStep1: activeZ.assigned_flyers,
          selectedService: zSvc,
          activeService: zSvc,
          type: zSvc,
          flyerFormat: activeZ.service_variant || "a5"
        };
      }
      return {
        ...prev,
        campaignZones: updated
      };
    });
  };
  const hasMilanoTerritory = useMemo(() => checkMilanoTerritory({
    city,
    selectedComuni,
    selectedSearchPoint,
    searchMode
  }), [city, selectedComuni, selectedSearchPoint, searchMode]);
  const selectedMunicipality = useMemo(() => {
    if (searchMode === "cap") return null;
    const raw = city?.label || city?.name || selectedComuni?.[0]?.label || selectedComuni?.[0]?.name || null;
    if (isResidentialStep2 && hasMilanoTerritory) return "Milano";
    return raw;
  }, [searchMode, city?.label, city?.name, selectedComuni, isResidentialStep2, hasMilanoTerritory]);
  const requestedAnalysisLevel = useMemo(() => isResidentialStep2 && hasMilanoTerritory ? "nil" : "comune", [isResidentialStep2, hasMilanoTerritory]);
  const analysisScope = useMemo(() => data.activeZoneId || "zone", [data.activeZoneId]);
  // Fix effective radius
  const numericRadiusKm = Number(rawRadiusKm) || 3;
  // Raggio tecnico di QUERY al backend (punto+raggio): mai null/0, anche in
  // modalità Comune — il backend non capisce "comune intero", solo punto+
  // raggio. Allargato per sweepare abbastanza comuni_breakdown/nil_breakdown
  // dal centroide del comune scelto (soglia più ampia con più comuni scelti
  // manualmente). Diverso da `radiusKm` (sopra), che è solo per la UI e resta
  // null in modalità Comune perché lì non va mostrato alcun raggio.
  const effectiveRadiusKm = isComuneMode ? selectedComuni && selectedComuni.length > 1 ? Math.max(25, numericRadiusKm)
  // Milano comune completo (analisi NIL): il clamp 3-8km sweepava solo le
  // NIL intorno al centroide (di fatto DUOMO e poco altro) — servono ~15km
  // dal centroide per coprire l'intero territorio comunale e recuperare
  // tutte le NIL dal nil_breakdown.
  : requestedAnalysisLevel === "nil" ? Math.max(15, numericRadiusKm) : Math.min(Math.max(numericRadiusKm, 3), 8) : numericRadiusKm;
  debugStep2Log("[STEP2_EFFECTIVE_RADIUS]", {
    searchMode,
    radiusKm,
    effectiveRadiusKm
  });

  // Centro delle query backend/GIS: in Raggio col punto cercato usa il punto
  // (via/NIL), altrimenti il centroide comune — stessa priorità di radiusCenter.
  const queryCenterLat = isRadiusMode && hasSearchPoint ? radiusCenter.lat : city?.lat ?? null;
  const queryCenterLng = isRadiusMode && hasSearchPoint ? radiusCenter.lng : city?.lng ?? null;
  const computedSelectionScope = useMemo(() => {
    if (searchMode === "cap") return "cap";
    if (isComuneMode && selectedComuni && selectedComuni.length > 1) return "multi";
    if (isComuneMode || searchMode === "municipality") return "municipality";
    if (selectedSearchPoint && radiusCenterSource === "address") return "address";
    return "radius";
  }, [searchMode, isComuneMode, selectedComuni, selectedSearchPoint, radiusCenterSource]);
  const selectedMunicipalityCodes = useMemo(() => {
    if (computedSelectionScope !== "multi" && computedSelectionScope !== "municipality") return null;
    const sourceList = Array.isArray(selectedComuni) && selectedComuni.length > 0 ? selectedComuni : city ? [city] : [];
    const codes = sourceList.map(item => item.municipality_code || item.istat_code || item.comune_code || (item.label === "Milano" || item.name === "Milano" ? "015146" : null)).filter(Boolean).map(String).map(s => s.trim()).filter(s => /^[0-9A-Za-z_-]+$/.test(s));
    if (codes.length > 0) return Array.from(new Set(codes)).sort().join(",");
    return null;
  }, [computedSelectionScope, selectedComuni, city]);
  const savedDistributionTargets = Array.isArray(data.distributionTargets) ? data.distributionTargets.filter(Boolean) : [];
  const shouldMigrateLegacyAllTarget = savedDistributionTargets.includes("all") && Boolean(data.activityType);
  const distributionTargetSelection = shouldMigrateLegacyAllTarget ? [data.activityType] : savedDistributionTargets.length > 0 ? savedDistributionTargets : [data.activityType].filter(Boolean);
  const analysisParams = useMemo(() => ({
    lat: queryCenterLat,
    lng: queryCenterLng,
    radiusKm: effectiveRadiusKm,
    serviceType: svcType,
    municipality: selectedMunicipality,
    analysisLevel: requestedAnalysisLevel,
    quantity: quantityForAnalysis,
    scope: analysisScope,
    selectionScope: computedSelectionScope,
    selectedMunicipalityCodes: selectedMunicipalityCodes,
    targetSelection: distributionTargetSelection
  }), [queryCenterLat, queryCenterLng, effectiveRadiusKm, svcType, selectedMunicipality, requestedAnalysisLevel, quantityForAnalysis, analysisScope, computedSelectionScope, selectedMunicipalityCodes, distributionTargetSelection]);
  const {
    data: apiData,
    loading: apiLoading,
    error: apiError
  } = useServiceAnalysis(analysisParams.lat, analysisParams.lng, analysisParams.radiusKm, analysisParams.serviceType, analysisParams.municipality, analysisParams.quantity, analysisParams.scope, analysisParams.analysisLevel, analysisParams.selectionScope, analysisParams.selectedMunicipalityCodes, analysisParams.targetSelection);
  const omiInfo = apiData?.metadata?.omi ?? null;
  const {
    sectors,
    loading: sectorsLoading
  } = useSectors(queryCenterLat, queryCenterLng, effectiveRadiusKm, svcType);
  // Il settore Step1 (data.activityType/businessSector) filtra i marker POI
  // mostrati sulla mappa per tutti i servizi, incluso D2D: la mappa D2D non
  // assegna cassette/promoter sui POI (quello resta un contesto di campagna),
  // ma i marker visibili devono comunque restare coerenti col settore scelto
  // invece di mostrare categorie estranee.
  const {
    pois: fetchedPois,
    loading: poiLoading,
    error: poiError
  } = usePoi(queryCenterLat, queryCenterLng, effectiveRadiusKm, svcType, distributionTargetSelection);
  const backendPois = useMemo(() => {
    if (!['d2d', 'h2h', 'b2b'].includes(svcType)) return [];
    const arr = apiData?.metadata?.nearby_activities;
    if (!Array.isArray(arr) || arr.length === 0) return [];
    return arr.map((a, idx) => ({
      id: `backend_poi_${idx}`,
      lat: Number(a.lat ?? 0),
      lng: Number(a.lng ?? 0),
      name: a.name || a.category || 'POI',
      category: a.category || 'Altro',
      color: '#7B9EC5',
      priority: 5,
      address: a.address || a.vicinity || null,
      source: a.source || 'Analisi territoriale collegata',
      dataCompleteness: a.name && (a.address || a.vicinity) ? 'name_address' : a.name ? 'name_only' : 'category_only'
    })).filter(p => Number.isFinite(p.lat) && p.lat !== 0 && Number.isFinite(p.lng) && p.lng !== 0);
  }, [svcType, apiData]);
  const pois = useMemo(() => {
    if (poiLoading) return [];
    const liveMatches = filterPoisForCampaignTarget(fetchedPois, distributionTargetSelection, data.activityNote);
    const backendMatches = filterPoisForCampaignTarget(backendPois, distributionTargetSelection, data.activityNote);
    const seenNames = new Set();
    const seenCoordinates = new Set();
    return [...liveMatches, ...backendMatches].filter(poi => {
      const normalizedName = normalizeTerritoryName(poi?.name || "");
      const normalizedCategory = normalizeTerritoryName(poi?.category || "");
      const hasSpecificName = normalizedName && normalizedName !== normalizedCategory;
      if (isBusinessStep2 && !hasSpecificName) return false;
      const coordinateKey = Number.isFinite(Number(poi?.lat)) && Number.isFinite(Number(poi?.lng)) ? `${Number(poi.lat).toFixed(4)},${Number(poi.lng).toFixed(4)},${normalizedCategory}` : "";
      if (hasSpecificName && seenNames.has(normalizedName) || coordinateKey && seenCoordinates.has(coordinateKey)) return false;
      if (hasSpecificName) seenNames.add(normalizedName);
      if (coordinateKey) seenCoordinates.add(coordinateKey);
      return true;
    });
  }, [poiLoading, fetchedPois, backendPois, distributionTargetSelection.join("|"), data.activityNote, isBusinessStep2]);
  // Solo per D2D: h2h/b2b hanno gia' un proprio messaggio dedicato nel
  // pannello attivita' quando la selezione filtrata risulta vuota. Il layer
  // POI sulla mappa D2D non ha un pannello equivalente, quindi qui evitiamo
  // di lasciare la mappa silenziosa (che sembrerebbe un errore) quando un
  // settore reale e' selezionato ma non produce risultati nell'area.
  const poiEmptySectorLabel = svcType === "d2d" && !poiLoading && city && pois.length === 0 && distributionTargetSelection.length > 0 && !distributionTargetSelection.includes("all")
    ? distributionTargetSelection.map(target => ACTIVITY_TARGET_LABELS[target] || target).join(", ")
    : null;
  const [poiListSearch, setPoiListSearch] = useState("");
  const [businessPoiFilter, setBusinessPoiFilter] = useState("all");
  const [h2hPoiFilter, setH2hPoiFilter] = useState("all");
  const [poiAssignments, setPoiAssignments] = useState(() => data.poiAssignments || {});
  const [focusedPoiId, setFocusedPoiId] = useState(null);
  const [focusedPoiNonce, setFocusedPoiNonce] = useState(0);
  const focusPoiRow = useCallback(poiId => {
    setFocusedPoiId(poiId);
    setFocusedPoiNonce(n => n + 1);
  }, []);
  const BUSINESS_POI_CATEGORY_TERMS = {
    shops: ["negozio", "retail", "shop"],
    food: ["ristor", "bar", "cafe", "food"],
    offices: ["ufficio", "azienda", "profession"],
    health: ["farmac", "medic", "clinic", "dent"],
    automotive: ["auto", "officina", "concession"],
    industry: ["industrial", "capannone", "warehouse"],
    other: []
  };
  const H2H_POI_CATEGORY_TERMS = {
    scuole: ["scuola"],
    universita: ["universita"],
    palestre: ["palestra", "centro sportivo"],
    stazioni: ["stazione", "metro"],
    commerciale: ["centro comm", "supermercato", "bar", "ristorante", "parrucchiere", "centro estetico", "farmacia", "clinica", "mercato"],
    altro: []
  };
  const h2hPoiCategoryCounts = useMemo(() => {
    if (!isMovementStep2) return {};
    const counts = {};
    const knownTerms = Object.entries(H2H_POI_CATEGORY_TERMS).filter(([key]) => key !== "altro").flatMap(([, terms]) => terms);
    pois.forEach(poi => {
      const haystack = normalizeTerritoryName(`${poi.name || ""} ${poi.category || ""}`);
      const bucket = Object.entries(H2H_POI_CATEGORY_TERMS).find(([key, terms]) => key !== "altro" && terms.some(term => haystack.includes(term)));
      const key = bucket ? bucket[0] : knownTerms.some(term => haystack.includes(term)) ? null : "altro";
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [pois, isMovementStep2]);
  const businessPoiCategoryCounts = useMemo(() => {
    if (!isBusinessStep2) return {};
    const counts = {};
    const knownTerms = Object.entries(BUSINESS_POI_CATEGORY_TERMS).filter(([key]) => key !== "other").flatMap(([, terms]) => terms);
    pois.forEach(poi => {
      const haystack = normalizeTerritoryName(`${poi.name || ""} ${poi.category || ""} ${poi.address || ""}`);
      const bucket = Object.entries(BUSINESS_POI_CATEGORY_TERMS).find(([key, terms]) => key !== "other" && terms.some(term => haystack.includes(term)));
      const key = bucket ? bucket[0] : knownTerms.some(term => haystack.includes(term)) ? null : "other";
      if (key) counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [pois, isBusinessStep2]);
  const poiComuneResolver = useMemo(() => {
    const boundaries = Array.isArray(municipalityBoundary) ? municipalityBoundary.filter(b => b?.geometry) : municipalityBoundary?.geometry ? [municipalityBoundary] : [];
    const singleComuneLabel = isComuneMode && (city?.label || city?.name) || (boundaries.length === 1 ? boundaries[0]?.name : null) || null;
    return poi => {
      if (boundaries.length > 1 && Number.isFinite(Number(poi?.lat)) && Number.isFinite(Number(poi?.lng))) {
        const match = boundaries.find(b => geoJsonContainsPoint(b.geometry, Number(poi.lat), Number(poi.lng)));
        if (match?.name) return match.name;
      }
      return singleComuneLabel;
    };
  }, [municipalityBoundary, isComuneMode, city]);
  const visiblePoisForAssignment = useMemo(() => {
    const query = normalizeTerritoryName(poiListSearch);
    return pois.filter(poi => {
      const haystack = normalizeTerritoryName(`${poi.name || ""} ${poi.category || ""} ${poi.address || ""}`);
      if (query && !haystack.includes(query)) return false;
      if (isBusinessStep2 && businessPoiFilter !== "all") {
        if (businessPoiFilter === "selected") return Boolean(poiAssignments[poi.id]);
        if (businessPoiFilter === "priority") return Number(poi.priority || 0) >= 8;
        if (businessPoiFilter === "other") {
          const knownTerms = Object.entries(BUSINESS_POI_CATEGORY_TERMS).filter(([key]) => key !== "other").flatMap(([, terms]) => terms);
          return !knownTerms.some(term => haystack.includes(term));
        }
        return (BUSINESS_POI_CATEGORY_TERMS[businessPoiFilter] || []).some(term => haystack.includes(term));
      }
      if (isMovementStep2 && h2hPoiFilter !== "all") {
        if (h2hPoiFilter === "altro") {
          const knownTerms = Object.entries(H2H_POI_CATEGORY_TERMS).filter(([key]) => key !== "altro").flatMap(([, terms]) => terms);
          return !knownTerms.some(term => haystack.includes(term));
        }
        return (H2H_POI_CATEGORY_TERMS[h2hPoiFilter] || []).some(term => haystack.includes(term));
      }
      return true;
    });
  }, [pois, poiListSearch, isBusinessStep2, businessPoiFilter, isMovementStep2, h2hPoiFilter, poiAssignments]);
  const [operatorCountForPoiAssignment, setOperatorCountForPoiAssignment] = useState(() => Math.max(1, Number(data.promoterCount || data.businessOperatorCount || 1)));
  const [operatorSchedules, setOperatorSchedules] = useState(() => buildPromoterAssignments(data, Math.max(1, Number(data.promoterCount || data.businessOperatorCount || 1))));
  const selectedOperationalPois = useMemo(() => pois.filter(poi => poiAssignments[poi.id]).map(poi => {
    const assignment = poiAssignments[poi.id] || {};
    const operatorNumber = assignment.operatorNumber ? Number(assignment.operatorNumber) : null;
    const schedule = operatorNumber ? operatorSchedules[Math.max(0, operatorNumber - 1)] : null;
    return {
      ...poi,
      operatorNumber: isBusinessStep2 ? operatorNumber : Number(operatorNumber || 1),
      copies: isBusinessStep2 ? getBusinessCopiesForPoi(poi, data, assignment) : Math.max(1, Number(assignment.copies || 1)),
      timeSlot: schedule?.timeSlot || (isBusinessStep2 ? null : data.timeSlot || null),
      serviceDurationHours: schedule?.serviceDurationHours ? Number(schedule.serviceDurationHours) : isBusinessStep2 ? null : Number(data.serviceDurationHours || 4)
    };
  }), [pois, poiAssignments, operatorSchedules, data, isBusinessStep2]);
  const businessMaterialPlan = useMemo(() => isBusinessStep2 ? calculateBusinessMaterials(selectedOperationalPois, poiAssignments, data) : null, [isBusinessStep2, selectedOperationalPois, poiAssignments, data]);
  const businessOperationalPlan = useMemo(() => isBusinessStep2 ? calculateBusinessOperationalPlan(selectedOperationalPois.length, data) : null, [isBusinessStep2, selectedOperationalPois.length, data]);
  const togglePoiAssignment = useCallback(poi => {
    setPoiAssignments(current => {
      if (current[poi.id]) {
        const next = {
          ...current
        };
        delete next[poi.id];
        return next;
      }
      if (isBusinessStep2) {
        return {
          ...current,
          [poi.id]: {
            selected: true,
            copies: getBusinessCopiesForPoi(poi, data, null)
          }
        };
      }
      const counts = Array.from({
        length: operatorCountForPoiAssignment
      }, () => 0);
      Object.values(current).forEach(assignment => {
        const idx = Math.max(0, Math.min(counts.length - 1, Number(assignment?.operatorNumber || 1) - 1));
        counts[idx] += 1;
      });
      const leastLoadedIndex = counts.indexOf(Math.min(...counts));
      return {
        ...current,
        [poi.id]: {
          operatorNumber: leastLoadedIndex + 1,
          copies: 1
        }
      };
    });
  }, [operatorCountForPoiAssignment, isBusinessStep2, data]);
  const assignPoiToOperator = useCallback((poiId, operatorNumber) => {
    setPoiAssignments(current => ({
      ...current,
      [poiId]: {
        ...(current[poiId] || {
          copies: 1
        }),
        operatorNumber: Number(operatorNumber)
      }
    }));
  }, []);
  const updatePoiCopies = useCallback((poiId, copies) => {
    setPoiAssignments(current => current[poiId] ? {
      ...current,
      [poiId]: {
        ...current[poiId],
        copies: Math.max(1, Number(copies) || 1)
      }
    } : current);
  }, []);
  const selectAndBalanceAllPois = useCallback(() => {
    const next = {};
    if (isBusinessStep2) {
      const materialLimit = Math.max(0, Number(data.businessMaterialQuantity ?? data.qty ?? 0) || 0);
      const activityLimit = Math.max(0, Number(data.businessTargetCount || 0) || 0);
      let usedMaterials = 0;
      [...pois].sort((a, b) => {
        const addressDelta = Number(Boolean(b.address)) - Number(Boolean(a.address));
        if (addressDelta) return addressDelta;
        const priorityDelta = Number(b.priority || 0) - Number(a.priority || 0);
        if (priorityDelta) return priorityDelta;
        return Number(a.distanceKm ?? Infinity) - Number(b.distanceKm ?? Infinity);
      }).some(poi => {
        if (activityLimit > 0 && Object.keys(next).length >= activityLimit) return true;
        const copies = getBusinessCopiesForPoi(poi, data, null);
        if (materialLimit > 0 && copies != null && usedMaterials + copies > materialLimit) return false;
        if (materialLimit > 0 && copies == null) return true;
        next[poi.id] = {
          selected: true,
          copies
        };
        if (copies != null) usedMaterials += copies;
        return false;
      });
    } else {
      pois.forEach((poi, index) => {
        next[poi.id] = {
          operatorNumber: index % operatorCountForPoiAssignment + 1,
          copies: 1
        };
      });
    }
    setPoiAssignments(next);
  }, [pois, operatorCountForPoiAssignment, isBusinessStep2, data]);
  const rebalanceSelectedPois = useCallback(() => {
    setPoiAssignments(current => {
      const next = {};
      Object.keys(current).filter(poiId => pois.some(poi => poi.id === poiId)).forEach((poiId, index) => {
        next[poiId] = {
          ...current[poiId],
          operatorNumber: index % operatorCountForPoiAssignment + 1
        };
      });
      return next;
    });
  }, [pois, operatorCountForPoiAssignment]);
  const clearPoiAssignments = useCallback(() => setPoiAssignments({}), []);
  const changeOperatorCountInStep2 = useCallback(value => {
    const nextCount = Math.max(1, Math.min(5, Number(value) || 1));
    setOperatorCountForPoiAssignment(nextCount);
    setOperatorSchedules(current => Array.from({
      length: nextCount
    }, (_, index) => current[index] || {
      id: `promoter_${index + 1}`,
      promoterNumber: index + 1,
      timeSlot: data.timeSlot || "",
      serviceDurationHours: Number(data.serviceDurationHours || 4)
    }));
    setPoiAssignments(current => Object.fromEntries(Object.entries(current).map(([poiId, assignment]) => [poiId, {
      ...assignment,
      operatorNumber: Math.min(nextCount, Number(assignment.operatorNumber || 1))
    }])));
    setData(prev => ({
      ...prev,
      promoterCount: nextCount,
      businessOperatorCount: isBusinessStep2 ? nextCount : prev.businessOperatorCount
    }));
  }, [data.timeSlot, data.serviceDurationHours, isBusinessStep2, setData]);
  const updateOperatorScheduleInStep2 = useCallback((index, patch) => {
    setOperatorSchedules(current => current.map((schedule, scheduleIndex) => scheduleIndex === index ? {
      ...schedule,
      ...patch
    } : schedule));
  }, []);
  const {
    transportState,
    loading: transportLoading,
    error: transportError
  } = useTransportStops(queryCenterLat, queryCenterLng, effectiveRadiusKm, svcType);
  // backendPois: POI individuali già estratti dal backend (analysis-poi-search → metadata.nearby_activities).
  // Usati come fallback quando usePoi (Overpass frontend) restituisce array vuoto per H2H/B2B.
  const addressPointParams = useMemo(() => ({
    lat: queryCenterLat,
    lng: queryCenterLng,
    radiusKm: effectiveRadiusKm,
    serviceType: svcType
  }), [queryCenterLat, queryCenterLng, effectiveRadiusKm, svcType]);
  const civiciFetchEnabled = svcType === "d2d" && activeMapLayers?.civici === true && Boolean(city?.lat && city?.lng && effectiveRadiusKm);
  const {
    civiciState,
    loading: civiciLoading
  } = useAddressPoints(addressPointParams.lat, addressPointParams.lng, addressPointParams.radiusKm, addressPointParams.serviceType, civiciFetchEnabled);
  const analysisLoading = apiLoading;
  const gisLoading = Boolean(city && (apiLoading || sectorsLoading || poiLoading || civiciLoading || transportLoading));
  const [gisTimedOut, setGisTimedOut] = useState(false);
  useEffect(() => {
    setGisTimedOut(false);
    if (!gisLoading) return undefined;
    const timeoutId = window.setTimeout(() => setGisTimedOut(true), 12000);
    return () => window.clearTimeout(timeoutId);
  }, [gisLoading, data.activeZoneId, city?.lat, city?.lng, radiusKm, svcType]);
  const primaryMunicipalityCode = useMemo(() => apiData?.comuni_breakdown?.[0]?.municipality_code ?? apiData?.comuni_breakdown?.[0]?.comune_code ?? null, [apiData]);
  const demographicsParams = useMemo(() => {
    const lat = Number(city?.lat);
    const lng = Number(city?.lng);
    const canLoadDemographics = Number.isFinite(lat) && Number.isFinite(lng) && primaryMunicipalityCode != null;
    if (!canLoadDemographics) return null;
    return {
      geographyRef: primaryMunicipalityCode,
      year: 2025
    };
  }, [city?.lat, city?.lng, primaryMunicipalityCode]);
  const {
    data: demoData,
    loading: demoLoading,
    error: demoError
  } = useDemographicIndicators(demographicsParams);
  // useTerritorialIndicators era fuori scope (file rimosso) — fallback neutro,
  // la UI già gestisce "Dato non disponibile" quando territorialData è null.
  const territorialData = null;
  const analysisError = apiError;
  const confirmedSources = confirmedSourcesOrFallback(apiData, apiError);
  const confirmedStep2Sources = confirmedSources;
  const dataSourceLabel = src => sourceIsConfirmed(src, confirmedSources) ? normalizeDataSourceLabel(src) : apiError || apiData?.error ? "Dati non disponibili" : "Stima interna";
  const responseBreakdownRows = Array.isArray(apiData?.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : apiData?.comuni_breakdown || [];
  const responseTerritoryLevel = responseBreakdownRows.find(row => row?.territory_level)?.territory_level;
  const activeAnalysisLevel = apiData?.metadata?.analysis_level || apiData?.values?.analysis_level || responseTerritoryLevel || "comune";
  const isNilAnalysis = isResidentialStep2 && activeAnalysisLevel === "nil";
  const nilUnavailable = isResidentialStep2 && requestedAnalysisLevel === "nil" && apiData?.metadata?.nil_unavailable;
  const territoryPluralLabel = isNilAnalysis ? "Zone NIL" : "Comuni";
  const territorySingularLabel = isNilAnalysis ? "NIL" : "Comune";
  const formatTerritoryCount = count => `${count} ${count === 1 ? territorySingularLabel : territoryPluralLabel}`;
  // areaMode — concetto unico per distinguere cosa rappresentano davvero i
  // numeri mostrati (non solo il tab attivo):
  // - "radius": modalità Raggio, punto+raggio scelto dall'utente.
  // - "custom_zone": SOLO modalità NIL manuale (toggle "NIL / Quartieri" attivo
  //   su Milano): l'utente ha scelto esplicitamente una o più NIL come area.
  // - "full_municipality": modalità Comune, comune intero. Per Milano i numeri
  //   sono l'aggregato di TUTTE le NIL (selZones = tutte le NIL) — l'analisi
  //   NIL è dettaglio, MAI la fonte dell'area principale (niente fallback DUOMO).
  const isNilManualMode = isComuneMode && isNilAnalysis && nilManualMode;
  // Comune Milano "vista principale" (non Raggio, non NIL manuale): qui la
  // lista card NIL va collassata di default dietro un bottone.
  const isMilanoComuneCollapsible = isComuneMode && isNilAnalysis && !nilManualMode && !hasUnconfirmedAddressPoint && !addressSearchError;
  const areaMode = hasUnconfirmedAddressPoint ? "unconfirmed_address" : isRadiusMode ? "radius" : isCapMode ? "cap" : isNilManualMode ? "custom_zone" : "full_municipality";
  const coverageMode = areaMode === "radius" ? "radius" : areaMode === "cap" ? "cap" : areaMode === "custom_zone" ? "nil" : "municipality";
  useEffect(() => {
    if (isStep2DebugEnabled()) {
      debugStep2Log("[AREA_MODE_SWITCH]", {
        activeAreaTab,
        areaMode,
        selectionMode,
        territoryMode,
        selectedComune: selectedComune?.name || selectedComune?.label || null,
        activeZoneId: data.activeZoneId,
        radiusKm,
        selectedZones: data.campaignZones?.map(z => ({
          id: z.id,
          name: z.cityName || z.zone_label || z.name || "",
          mode: z.mode || (z.searchMode === "address" ? "radius" : z.searchMode === "cap" ? "cap" : "comune"),
          radiusKm: z.radiusKm ?? z.radius ?? null
        }))
      });
    }
  }, [activeAreaTab, areaMode, selectionMode, territoryMode, selectedComune?.name, selectedComune?.label, radiusKm, data.activeZoneId, data.campaignZones]);
  const areaContextLabel = areaMode === "radius" ? "nel raggio selezionato" : areaMode === "custom_zone" ? "nell'area selezionata" : "nel comune selezionato";
  const civiciCount = Number(civiciState?.count || 0) || Number(civiciState?.bboxCount || 0);
  const civiciAvailable = Boolean(civiciState?.available) || civiciCount > 0;
  useEffect(() => {
    setThLayerId(layers[0]?.id || null);
  }, [svcType]);
  useEffect(() => {
    setActiveMapLayers(defaultLayerState(svcType));
  }, [svcType]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // address_points (civici layer) can fail (e.g. Supabase 500/timeout) —
    // this must never block Step 2. Degrade to "Civici: dato non disponibile"
    // and keep the rest of the analysis (comune/settori/famiglie) running.
    if (!civiciLoading && !civiciAvailable) {
      if (isStep2DebugEnabled()) console.warn("[ADDRESS_POINTS_LAYER_UNAVAILABLE]", {
        reason: "civici layer unavailable or failed to load"
      });
      setActiveMapLayers(prev => prev?.civici ? {
        ...prev,
        civici: false
      } : prev);
    }
  }, [civiciLoading, civiciAvailable]);
  useEffect(() => {
    if (!search || search.length < 2) {
      setGeocodeSuggestions([]);
      setCapSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      if (searchMode === "cap") {
        if (/^\d{1,5}$/.test(search)) {
          setCapSearchLoading(true);
          // Prima prova dal DB Supabase
          const {
            data: caps,
            error
          } = await supabase.from('geo_postal_areas').select('postal_code, municipality_name').ilike('postal_code', `${search}%`).limit(8);
          setCapSearchLoading(false);
          // Se il DB e vuoto, usa il dataset statico locale
          const results = !error && caps && caps.length > 0 ? caps : CAP_LOMBARDIA.filter(c => c.postal_code.startsWith(search)).slice(0, 8);
          setCapSuggestions(results.map(c => ({
            id: c.postal_code,
            name: `${c.postal_code} - ${c.municipality_name}`,
            postalCode: c.postal_code
          })));
        } else {
          setCapSuggestions([]);
        }
        return;
      }
      // Intent indirizzo ("milano via como"): chiedi al geocoder ANCHE gli
      // indirizzi/POI, altrimenti Mapbox fuzzy-matcha solo nomi di comuni e
      // "via como" diventa Cormano/Como — la causa esatta del bug.
      const searchIntent = detectSearchIntent(search);
      const pointSearchIntent = searchMode === "address" && isMovementStep2;
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      if (mapboxToken) {
        try {
          const mapboxTypes = searchIntent.intent === "address" || pointSearchIntent ? "address,poi,place,locality,neighborhood" : "place,locality,neighborhood";
          const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json?access_token=${mapboxToken}&country=IT&types=${mapboxTypes}&language=it&limit=8`);
          const d = await r.json();
          if (d.features?.length) {
            // placeType conservato per la validazione tab Comune (vedi
            // NIL_LIKE_PLACE_TYPES): "neighborhood" per Brera/Duomo/ecc. NON
            // va rimosso dal filtro `types` sopra — la modalità Raggio usa
            // la STESSA ricerca e lì un quartiere è un centro valido.
            // fullName: il place_name completo del geocoder, usato per il
            // check "dentro Milano" nel dropdown (c.fullName || c.name) —
            // in precedenza solo Nominatim lo valorizzava, quindi Mapbox
            // mancava il fallback e indirizzi di confine sfuggivano.
            const mapboxSuggestions = d.features.map(f => {
              const context = Array.isArray(f.context) ? f.context : [];
              const postcode = context.find(x => String(x.id || "").startsWith("postcode"))?.text || null;
              const place = context.find(x => String(x.id || "").startsWith("place"))?.text || null;
              const province = context.find(x => String(x.id || "").startsWith("region"))?.short_code || null;
              const houseNumber = f.address || null;
              const street = f.text || null;
              const fullLabel = f.place_name_it || f.place_name || f.text;
              return {
                id: f.id,
                name: fullLabel,
                fullName: fullLabel,
                label: [street, houseNumber].filter(Boolean).join(" ") || street || fullLabel,
                street,
                houseNumber,
                postcode,
                city: place,
                province,
                lat: f.center[1],
                lng: f.center[0],
                placeType: f.place_type?.[0] || null,
                providerPlaceId: f.id,
                precision: f.place_type?.[0] || null
              };
            });
            // §3 ticket: quando l'intent è indirizzo-in-Milano ma Mapbox
            // non ha restituito nessuna riga indirizzo, prova anche
            // Nominatim e unisci i risultati — Via Antonio Oroboni potrebbe
            // non essere nel dataset Mapbox ma Nominatim la trova.
            if ((searchIntent.intent === "address" || pointSearchIntent) && !mapboxSuggestions.some(s => looksLikeAddressResult(s) || s.placeType === "poi")) {
              try {
                const nr = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&countrycodes=it&format=json&addressdetails=1&limit=4`);
                const nd = await nr.json();
                const nomAddresses = nd.filter(f => isAddressLikePlaceType(f.addresstype || f.type || f.class)).map(f => {
                  return normalizeNominatimGeocodeResult(f, {
                    addressLike: true
                  });
                });
                if (nomAddresses.length > 0) {
                  setGeocodeSuggestions([...nomAddresses, ...mapboxSuggestions]);
                  return;
                }
              } catch {}
            }
            setGeocodeSuggestions(mapboxSuggestions);
            return;
          }
        } catch {}
      }
      try {
        const nominatimFeatureType = searchIntent.intent === "address" || pointSearchIntent ? "" : "&featuretype=city";
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search)}&countrycodes=it&format=json&addressdetails=1&limit=6${nominatimFeatureType}`);
        const d = await r.json();
        // addresstype è il campo Nominatim affidabile per il tipo di luogo
        // (per "Brera, Milano" type/class valgono "census"/"boundary" — non
        // identificano nulla — mentre addresstype vale correttamente
        // "quarter"). type/class restano come fallback se addresstype manca.
        setGeocodeSuggestions(d.map(f => {
          const pt = f.addresstype || f.type || f.class || null;
          return normalizeNominatimGeocodeResult(f, {
            addressLike: isAddressLikePlaceType(pt)
          });
        }));
      } catch {
        setGeocodeSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchMode, isMovementStep2]);

  // Fetch municipality boundary from OSM Nominatim when city is selected in "municipality" mode
  const targetComuniList = useMemo(() => {
    if (searchMode !== "municipality") return [];
    if (selectedComuni && selectedComuni.length > 0) return selectedComuni;
    if (city) return [city];
    return [];
  }, [searchMode, selectedComuni, city]);
  useEffect(() => {
    if (searchMode !== "municipality" || targetComuniList.length === 0) {
      // Non azzerare municipalityBoundary qui: la mappa lo mostra solo quando
      // isMunicipalityMode è true, quindi lasciarlo valorizzato mentre si è in
      // Raggio non disegna nulla di sbagliato — ma azzerarlo forzava un nuovo
      // giro completo su Nominatim (rete esterna, senza cache) ogni volta che
      // si tornava su Comune, e se quella singola richiesta falliva/andava in
      // rate-limit il confine restava vuoto finché non si ricambiava comune.
      return;
    }
    const cacheKey = targetComuniList.map(c => normalizeMunicipalityName(c.label || c.name)).filter(Boolean).sort().join('|');
    const cached = cacheKey ? municipalityBoundaryCacheRef.current.get(cacheKey) : null;
    if (cached) {
      setMunicipalityBoundary(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(targetComuniList.map(async c => {
          const name = c.label || c.name;
          if (!name) return null;
          const cLat = Number(c.lat),
            cLng = Number(c.lng);
          const hasCenter = Number.isFinite(cLat) && Number.isFinite(cLng) && (cLat !== 0 || cLng !== 0);
          // 1) Nominatim, multi-risultato + VALIDAZIONE: il poligono deve
          // (a) essere Polygon/MultiPolygon, (b) non essere provincia/regione,
          // (c) contenere il centroide del comune. Senza questa validazione
          // per "Milano" veniva disegnata la località Milano di Rodano.
          try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name + ', Italy')}&format=geojson&polygon_geojson=1&limit=10&dedupe=0`;
            const res = await fetch(url, {
              headers: {
                'User-Agent': 'VolantiniPro/1.0'
              }
            });
            const json = await res.json();
            const candidates = (json.features || []).filter(f => {
              const g = f?.geometry;
              if (!g || g.type !== 'Polygon' && g.type !== 'MultiPolygon') return false;
              const at = f?.properties?.addresstype;
              if (['county', 'state', 'region', 'province'].includes(at)) return false;
              return true;
            });
            const valid = hasCenter ? candidates.find(f => geoJsonContainsPoint(f.geometry, cLat, cLng)) : candidates[0];
            if (valid) {
              return {
                name,
                geometry: valid.geometry
              };
            }
            debugStep2Warn('[MUNICIPALITY_BOUNDARY_REJECTED]', {
              name,
              reason: candidates.length ? 'nessun poligono contiene il centroide' : 'nessun poligono valido da Nominatim',
              candidates: (json.features || []).map(f => f?.properties?.display_name).slice(0, 5)
            });
          } catch (e) {
            debugStep2Warn('[MUNICIPALITY_BOUNDARY_ERROR]', name, e);
          }
          // 2) Fallback: geometria comunale REALE dal nostro backend
          // (analysis-istat, analysisLevel=comune — stessa fonte ISTAT dei KPI).
          // Nessun fallback silenzioso alla prima NIL: se anche questo
          // fallisce, il confine resta assente e viene loggato.
          try {
            if (hasCenter) {
              const baseUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SUPABASE_URL;
              const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
              const apiUrl = import.meta.env.VITE_ANALYSIS_ISTAT_URL || (baseUrl ? `${baseUrl}/functions/v1/analysis-istat` : null);
              if (apiUrl) {
                const headers = {};
                if (anonKey && apiUrl.includes('/functions/v1/')) {
                  headers.Authorization = `Bearer ${anonKey}`;
                  headers.apikey = anonKey;
                }
                const r = await fetch(`${apiUrl}?lat=${encodeURIComponent(cLat)}&lng=${encodeURIComponent(cLng)}&radius=3&service=d2d&municipality=${encodeURIComponent(name)}&analysisLevel=comune`, {
                  headers
                });
                const j = await r.json();
                const row = (j?.comuni_breakdown || []).find(x => normalizeMunicipalityName(x?.comune_name || x?.municipality_name) === normalizeMunicipalityName(name) && x?.geometry_geojson);
                if (row) {
                  const geom = typeof row.geometry_geojson === 'string' ? JSON.parse(row.geometry_geojson) : row.geometry_geojson;
                  if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
                    debugStep2Log('[MUNICIPALITY_BOUNDARY_FALLBACK_BACKEND]', name);
                    return {
                      name,
                      geometry: geom
                    };
                  }
                }
              }
            }
          } catch (e) {
            debugStep2Warn('[MUNICIPALITY_BOUNDARY_FALLBACK_ERROR]', name, e);
          }
          debugStep2Warn('[MUNICIPALITY_BOUNDARY_UNAVAILABLE]', {
            name,
            note: 'nessuna geometria comunale valida — confine non mostrato (nessuna sostituzione con NIL)'
          });
          return null;
        }));
        if (!cancelled) {
          const valid = results.filter(Boolean);
          const resolved = valid.length > 0 ? valid : null;
          if (resolved && cacheKey) municipalityBoundaryCacheRef.current.set(cacheKey, resolved);
          setMunicipalityBoundary(resolved);
          if (resolved) {
            debugStep2Log('[MUNICIPALITY_BOUNDARIES_LOADED]', resolved.map(x => x.name));
          }
        }
      } catch (e) {
        debugStep2Warn('[MUNICIPALITY_BOUNDARY_ERROR]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetComuniList, searchMode]);
  useEffect(() => {
    municipalitySwitchAtRef.current = Date.now();
  }, [city?.lat, city?.lng]);
  const activeLay = layers.find(l => l.id === thLayerId) || layers[0];
  const apiZones = useMemo(() => apiData && !apiData.error && apiData.values ? apiToZones(apiData, city, requestedAnalysisLevel, svcType, effectiveRadiusKm) : null, [apiData, city, requestedAnalysisLevel, svcType, effectiveRadiusKm]);
  const hasUsefulApiZones = useMemo(() => Array.isArray(apiZones) && apiZones.length > 0 && apiZones.some(z => {
    if (svcType === "h2h") return Number(z.poi || 0) > 0;
    if (svcType === "b2b") return Number(z.bizTotal || 0) > 0;
    return Number(z.families || z.familiesInRadius || z.flyersMin || 0) > 0;
  }), [apiZones, svcType]);
  const apiZonesByName = useMemo(() => new Map((apiZones || []).map(z => [String(z.name || "").trim().toLowerCase(), z])), [apiZones]);
  const zonesInRadius = useMemo(() => {
    if (!hasUsefulApiZones || !apiZones) return [];
    const hasCityCoords = Boolean(city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lng)));
    if (addressSearchError || isRadiusMode && !hasSearchPoint && !hasCityCoords && userModeRef.current === "address") {
      return [];
    }
    let filtered = [...apiZones];

    // userModeRef.current is the user-INTENDED mode (only set via tab click or zone switch).
    // If React state drifts to "address" due to an effect timing issue while the user is
    // on the Comune tab, gateMode stays "municipality" and the correct filter is applied.
    const gateMode = userModeRef.current;
    if (isStep2DebugEnabled()) {
      debugStep2Log("[STEP2_AGGREGATION_MODE]", gateMode);
      if (gateMode !== searchMode) {
        debugStep2Warn("[STEP2_ADDRESS_RESULT_IGNORED_IN_MUNICIPALITY_MODE]", {
          intended: gateMode,
          actual: searchMode,
          communes: filtered.length
        });
      }
      debugStep2Log("[STEP2_RADIUS_FILTER_INPUT]", "Radius:", radiusKm, "Total zones from API:", filtered.length);
    }
    if (gateMode === "municipality") {
      // Indirizzo/punto non confermato (es. "Corso Como, Milano"): NON
      // calcolare il comune completo finché l'utente non clicca esplicitamente
      // "Usa Milano comune completo" — vedi hasUnconfirmedAddressPoint e il box
      // dedicato in JSX. Azzera qui, a monte di ogni calcolo NIL/comune, così
      // nessun pannello (KPI, lista zone, mappa) mostra dati del comune intero.
      if (hasUnconfirmedAddressPoint) {
        if (isStep2DebugEnabled()) debugStep2Log("[STEP2_ADDRESS_POINT_UNCONFIRMED_MUNICIPALITY_BLOCKED]", {
          selectedSearchPoint
        });
        filtered = [];
        // §2 ticket — GUARDIA parentComune Milano: se selectedSearchPoint dice
        // parentComune === "Milano" ma il comune matchato dalla lista API è un
        // comune diverso (Cormano, Como, ecc.), blocca l'override — il comune
        // deve restare Milano. Causa originale: reverse geocoding/coordinate di
        // confine risolvono a Cormano, sovrascrivendo Milano silenziosamente.
      } else if (selectedSearchPoint?.type === "address" && selectedSearchPoint?.parentComune === "Milano" && filtered.length > 0) {
        const milanoZone = filtered.find(z => normalizeMunicipalityName(z.name) === "milano");
        const nonMilanoZones = filtered.filter(z => normalizeMunicipalityName(z.name) !== "milano");
        if (nonMilanoZones.length > 0 && (!milanoZone || filtered.length === nonMilanoZones.length)) {
          // L'API ha restituito zone non-Milano per un indirizzo che è dichiaratamente
          // dentro Milano. Log e blocco.
          if (isStep2DebugEnabled()) {
            debugStep2Log("[STEP2_ADDRESS_PARENT_GUARD]", {
              inputValue: search,
              selectedResultLabel: selectedSearchPoint?.label,
              selectedResultType: selectedSearchPoint?.type,
              selectedResultLat: selectedSearchPoint?.lat,
              selectedResultLng: selectedSearchPoint?.lng,
              detectedSearchIntent: "address",
              parentComune: "Milano",
              selectedComuneBefore: selectedMunicipality,
              attemptedComuneOverride: nonMilanoZones.map(z => z.name).join(", "),
              selectedComuneAfter: "Milano",
              selectedSearchPoint,
              hasUnconfirmedAddressPoint,
              blockedReason: "address_parent_milano_prevents_comune_override"
            });
          }
          // Tiene solo la zona Milano se esiste, altrimenti svuota (l'utente
          // vedrà il box decisionale address-point come fallback).
          filtered = milanoZone ? [milanoZone] : [];
        }
      } else {
        // Match SOLO il comune selezionato: nome normalizzato (lowercase, trim,
        // niente "comune di", niente suffisso provincia/regione dopo la virgola),
        // oppure codice ISTAT identico e non vuoto su entrambi i lati. Nessun
        // fallback al primo elemento del raggio: se non trova match esatto,
        // blocca con warning invece di usare un comune vicino (es. Paderno Dugnano
        // al posto di Varedo).
        const selectedMunicipalityName = normalizeMunicipalityName(selectedMunicipality);
        debugStep2Log("[STEP2_SELECTED_MUNICIPALITY_NAME]", selectedMunicipalityName);
        debugStep2Log("[STEP2_MUNICIPALITY_MATCH_CANDIDATES]", filtered.map(z => ({
          name: z.name,
          normalized: normalizeMunicipalityName(z.name),
          municipality_code: z.municipality_code
        })));
        if (isResidentialStep2 && requestedAnalysisLevel === "nil") {
          const nilAreas = filtered.filter(z => z.isNil || z.territoryLevel === "nil" || z.nilCode);
          filtered = nilAreas.length ? nilAreas : filtered;
        } else {
          const currComuni = selectedComuni && selectedComuni.length > 0 ? selectedComuni : city ? [city] : [];
          // Build both space-normalized and hyphen-normalized name sets for fuzzy matching:
          // the API may return "Bovisio-Masciago" (hyphen) while the user selected "Bovisio Masciago" (space).
          // normalizeMunicipalityName already normalizes hyphens to spaces, so a single set is enough.
          const targetNames = new Set(currComuni.map(c => normalizeMunicipalityName(c.label || c.name)).filter(Boolean));
          const targetCodes = new Set(currComuni.map(c => c.municipalityCode || c.municipality_code || null).filter(Boolean).map(String));
          let matched = filtered.filter(z => {
            const nameMatch = targetNames.has(normalizeMunicipalityName(z.name));
            const codeMatch = Boolean(z.municipality_code) && targetCodes.has(String(z.municipality_code));
            return nameMatch || codeMatch;
          });
          const withinSwitchGracePeriod = Date.now() - municipalitySwitchAtRef.current < 800;
          if (targetNames.size > 0 && matched.length === 0) {
            debugStep2Log("[STEP2_MUNICIPALITY_WAITING_FOR_AREAS]", {
              targetNames: Array.from(targetNames),
              apiLoading,
              filteredCount: filtered.length,
              withinSwitchGracePeriod
            });
          }

          // BUG FIX – Multi-comune: ensure every selected comune appears in the result
          // even if the API returned no matching zone (no data yet, or name mismatch
          // not covered by normalization). Create a minimal "dati parziali" stub so
          // the comune still shows in cards/riepilogo without disappearing silently.
          if (currComuni.length > 1 && !apiLoading && !withinSwitchGracePeriod) {
            const matchedNames = new Set(matched.map(z => normalizeMunicipalityName(z.name)));
            const matchedCodes = new Set(matched.map(z => z.municipality_code).filter(Boolean).map(String));
            const unmatched = currComuni.filter(c => {
              const normalizedName = normalizeMunicipalityName(c.label || c.name);
              const code = String(c.municipalityCode || c.municipality_code || "");
              return !matchedNames.has(normalizedName) && !(code && matchedCodes.has(code));
            });
            if (unmatched.length > 0) {
              debugStep2Log("[STEP2_MULTI_COMUNE_UNMATCHED]", unmatched.map(c => c.label || c.name));
              // Build synthetic fallback zones for unmatched comuni so they appear in UI
              const fallbackZones = unmatched.map((c, fi) => {
                const name = c.label || c.name || `Comune ${fi + 1}`;
                return {
                  id: `fallback_comune_${normalizeMunicipalityName(name).replace(/\s+/g, '_')}_${fi}`,
                  name,
                  municipality_code: c.municipalityCode || c.municipality_code || null,
                  area: 0,
                  pop: 0,
                  families: 0,
                  mailboxes: 0,
                  coverage: 0,
                  volantiniNelRaggio: 0,
                  familiesInRadius: 0,
                  flyersMin: 0,
                  flyersMax: 0,
                  operDays: 1,
                  familyIdx: 0,
                  reachD2D: 0,
                  roiD2D: 0,
                  confD2D: 0,
                  eta14: null,
                  eta34: null,
                  eta64: null,
                  eta65: null,
                  genderM: 49,
                  genderF: 51,
                  stranieri: null,
                  indVec: null,
                  densita: 0,
                  reddito: null,
                  occup: null,
                  imprese: null,
                  areaType: 'Dati parziali',
                  poi: 0,
                  nearbyBiz: 0,
                  commDens: 0,
                  flowScore: 0,
                  transitStops: 0,
                  trainStations: 0,
                  operDaysH2H: 1,
                  reachH2H: 0,
                  roiH2H: 0,
                  confH2H: 0,
                  hotspots: name,
                  timeSlots: null,
                  strongPts: 0,
                  bizTotal: 0,
                  competitors: 0,
                  commDensB2B: 0,
                  operDaysB2B: 1,
                  cdIdx: 0,
                  reachB2B: 0,
                  roiB2B: 0,
                  confB2B: 0,
                  clusters: 0,
                  topCats: null,
                  targetBiz: 0,
                  strongZone: name,
                  dist: {},
                  geometry: null,
                  geometry_geojson: null,
                  lat: c.lat || null,
                  lng: c.lng || null,
                  isFallback: true,
                  source_flags: ['Comune selezionato — dati non ancora disponibili']
                };
              });
              matched = [...matched, ...fallbackZones];
              debugStep2Log("[STEP2_MULTI_COMUNE_FALLBACK_STUBS]", fallbackZones.map(z => z.name));
            }
          }
          debugStep2Log("[STEP2_FINAL_MUNICIPALITY_AREA]", matched.map(z => z.name));
          filtered = matched;
        }
      }
    } else if (gateMode === "address" || gateMode === "radius") {
      // Hard guard anti-regressione: un raggio piccolo non può coinvolgere
      // decine di COMUNI interi. MA le NIL sono micro-zone (~1-3 km²) e non vanno mai troncate.
      const nilRows = filtered.filter(z => z?.isNil || z?.territoryLevel === "nil" || z?.nilCode);
      const comuneRows = filtered.filter(z => !z?.isNil && z?.territoryLevel !== "nil" && !z?.nilCode);
      const numRadius = Number(radiusKm) || 3;
      if (nilRows.length > 0) {
        const maxComuni = numRadius <= 3 ? 8 : numRadius <= 5 ? 12 : 20;
        filtered = [...comuneRows.slice(0, maxComuni), ...nilRows];
        if (isStep2DebugEnabled()) {
          debugStep2Log("[STEP2_RADIUS_GUARD_WITH_NIL]", {
            nilRows: nilRows.length,
            comuneRows: Math.min(comuneRows.length, maxComuni)
          });
        }
      } else {
        if (numRadius <= 3 && filtered.length > 8) {
          debugStep2Warn("[STEP2_RADIUS_GUARD_TRIGGERED] radius <= 3 but got", filtered.length, "communes. Truncating to 8.");
          filtered = filtered.slice(0, 8);
        } else if (numRadius <= 5 && filtered.length > 12) {
          debugStep2Warn("[STEP2_RADIUS_GUARD_TRIGGERED] radius <= 5 but got", filtered.length, "communes. Truncating to 12.");
          filtered = filtered.slice(0, 12);
        }
      }
    }

    // Guardia anti-duplicati: se il backend restituisce due righe per lo stesso
    // comune/NIL (es. join geografico che duplica un confine), sommare
    // famiglie/popolazione/volantini due volte falserebbe ogni KPI a valle
    // (serviceKpis, mappa, riepilogo). Tiene solo la prima occorrenza.
    // ATTENZIONE: per le NIL la chiave deve essere il nil_code, MAI il
    // municipality_code — tutte le 88 NIL di Milano condividono lo stesso
    // municipality_code (015146): usarlo come chiave scartava tutte le NIL
    // tranne la prima (DUOMO), riducendo il comune completo a una sola NIL.
    const seenZoneKeys = new Set();
    const dedupedFiltered = filtered.filter(z => {
      const isNilRow = Boolean(z?.isNil || z?.territoryLevel === "nil" || extractOfficialNilCode(z) !== null);
      const officialCode = extractOfficialNilCode(z);
      const key = isNilRow ? officialCode !== null ? `nil_code_${officialCode}` : `nil_${normalizeMunicipalityName(z?.name || "")}` : z?.municipality_code || normalizeMunicipalityName(z?.name || "");
      if (!key) return true; // nessuna chiave stabile disponibile: non si può giudicare duplicato, si mantiene
      if (seenZoneKeys.has(key)) {
        if (isStep2DebugEnabled()) debugStep2Warn("[STEP2_DUPLICATE_ZONE_DROPPED]", {
          key,
          name: z?.name
        });
        return false;
      }
      seenZoneKeys.add(key);
      return true;
    });
    if (isStep2DebugEnabled()) {
      debugStep2Log("[STEP2_INCLUDED_COMMUNES]", dedupedFiltered.length, dedupedFiltered.map(z => z.name));
      const totalFam = dedupedFiltered.reduce((a, b) => a + (b.families || 0), 0);
      debugStep2Log("[STEP2_FAMILIES_CALC_OUTPUT]", totalFam);
      debugStep2Log("[STEP2_FINAL_SOURCE_LOCKED]", {
        gateMode,
        communes: dedupedFiltered.length,
        families: totalFam
      });
    }
    return dedupedFiltered;
  }, [hasUsefulApiZones, apiZones, searchMode, selectedMunicipality, selectedComuni, primaryMunicipalityCode, radiusKm, apiLoading, isResidentialStep2, requestedAnalysisLevel, hasUnconfirmedAddressPoint]);
  // Blocco di sicurezza Comune Milano: è VIETATO usare una sola NIL come
  // "comune completo". Se l'analisi NIL in modalità Comune (toggle manuale
  // spento) produce 0-1 NIL a caricamento finito, i dati comune completo NON
  // sono disponibili: niente DUOMO/9.589/10.548 come totali comunali — la UI
  // mostra il messaggio esplicito e i KPI degradano a "dato non disponibile".
  const milanoComuneNilInsufficient = isComuneMode && isNilAnalysis && !nilManualMode && !hasUnconfirmedAddressPoint && !apiLoading && zonesInRadius.length <= 1;
  // Comuni realmente coinvolti nella selezione corrente — derivato da
  // zonesInRadius (già filtrato SOLO sui comuni scelti manualmente in modalità
  // Comune, o sui comuni nel raggio con i guard anti-regressione in modalità
  // Raggio), MAI dal dump grezzo apiData.comuni_breakdown (che in modalità
  // Comune multi-selezione può contenere centinaia di comuni per via
  // dell'allargamento tecnico del raggio di query — effectiveRadiusKm —
  // usato solo per recuperare i dati dall'API, non per definire la selezione).
  const allMunicipalityCodesInSelection = useMemo(() => {
    const rows = zonesInRadius || [];
    const codes = rows.map(z => z?.municipality_code || z?.comune_code).filter(Boolean);
    return Array.from(new Set(codes));
  }, [zonesInRadius]);
  // useDusafLanduse e useDemographicIndicatorsForMunicipalities erano fuori
  // scope (file rimossi) — fallback neutri derivati dai dati già esistenti:
  // dusafLanduse resta "non disponibile" (la UI già gestisce `?.available`
  // ovunque), effectiveDemoData usa demoData (comune singolo, hook ancora
  // presente) invece dell'aggregazione multi-comune rimossa.
  const dusafLanduse = null;
  const dusafLoading = false;
  const dusafError = null;
  const municipalityDemoAgg = null;
  const municipalityDemoLoading = false;
  const effectiveDemoData = demoData;
  useEffect(() => {
    if (!apiData) return;
    const nilRows = Array.isArray(apiData.nil_breakdown) && apiData.nil_breakdown.length ? apiData.nil_breakdown : (apiData.comuni_breakdown || []).filter(row => row?.territory_level === "nil");
    const territoryLevel = nilRows.length ? "nil" : activeAnalysisLevel;
  }, [apiData, requestedAnalysisLevel, activeAnalysisLevel, zonesInRadius]);
  const territorialDataUnavailable = Boolean(city && !apiLoading && !hasUsefulApiZones);
  const capZones = useMemo(() => selectedCaps.map(cap => capDataMap[cap]).filter(zone => zone && !zone.unavailable), [selectedCaps, capDataMap]);
  const allZones = useMemo(() => [...zonesInRadius, ...capZones], [zonesInRadius, capZones]);
  useEffect(() => {
    if (hasUsefulApiZones) {
      setSelected(zonesInRadius.map(z => z.id));
    } else {
      setSelected([]);
    }
  }, [city?.id, radius, hasUsefulApiZones, zonesInRadius]);

  // Anteprima NIL per indirizzo Milano non ancora confermato (es. Via Brera):
  // calcolata prima di selZones per consentire al calcolo coperture/KPI e alla
  // mappa di agganciare istantaneamente la zona corrispondente all'indirizzo o alla scelta manuale.
  const addressPreviewNilZones = useMemo(() => {
    if (!hasUnconfirmedAddressPoint || !selectedSearchPoint || !Number.isFinite(Number(selectedSearchPoint.lat)) || !Number.isFinite(Number(selectedSearchPoint.lng))) {
      return null;
    }
    const ptLat = Number(selectedSearchPoint.lat);
    const ptLng = Number(selectedSearchPoint.lng);
    const pool = new Map();
    const addCandidates = arr => {
      if (!Array.isArray(arr)) return;
      arr.forEach(z => {
        if (z && (z.isNil || z.territoryLevel === "nil" || extractOfficialNilCode(z) !== null)) {
          const code = extractOfficialNilCode(z);
          const name = z.name ?? z.nil_name ?? z.comune_name;
          const key = code !== null ? `nil_code_${code}` : z.id ? `id_${String(z.id).toLowerCase()}` : normalizeMunicipalityName(name || "");
          const hasReadableNilIdentity = Boolean(name || code || z.id);
          if (key && hasReadableNilIdentity && !pool.has(key)) {
            const fam = Number(z.families ?? z.households ?? z.households_in_radius ?? z.households_total ?? z.famiglie ?? 0);
            const pop = Number(z.pop ?? z.population ?? z.population_in_radius ?? z.population_total ?? 0);
            const area = Number(z.area ?? z.area_km2 ?? 1);
            const coverage = Number(z.coverage ?? z.pct_copertura ?? 100);
            const vol = Number(z.volantiniNelRaggio ?? z.volantini_nel_raggio ?? z.volantini_consigliati ?? z.flyersMin ?? 0);
            pool.set(key, {
              ...z,
              id: z.id ?? (code ? `nil_${String(code).toLowerCase().replace(/\s+/g, '_')}` : `nil_${String(name).toLowerCase().replace(/\s+/g, '_')}`),
              name: name ?? "NIL",
              nilCode: code ?? null,
              isNil: true,
              territoryLevel: "nil",
              families: fam,
              pop: pop,
              area: area,
              coverage: coverage,
              volantiniNelRaggio: vol,
              flyersMin: Number(z.flyersMin ?? vol),
              flyersMax: Number(z.flyersMax ?? vol * 1.1)
            });
          }
        }
      });
    };
    addCandidates(apiZones);
    addCandidates(allZones);
    addCandidates(apiData?.nil_breakdown);
    const candidates = Array.from(pool.values()).filter(z => Boolean(z?.name || extractOfficialNilCode(z) !== null || z?.id));
    if (candidates.length === 0) return {
      main: null,
      nearby: [],
      all: []
    };
    const withDist = candidates.map(z => {
      const geom = pickRealComuneGeometry(z);
      const contains = geoJsonContainsPoint(geom, ptLat, ptLng);
      let dist = contains ? 0 : null;
      if (dist === null) {
        if (Number.isFinite(Number(z.lat)) && Number.isFinite(Number(z.lng))) {
          dist = haversineKm(ptLat, ptLng, Number(z.lat), Number(z.lng));
        } else {
          const c = geoJsonApproxCentroid(geom);
          if (c) dist = haversineKm(ptLat, ptLng, c.lat, c.lng);
        }
      }
      return {
        z,
        geom,
        contains,
        dist: dist != null ? dist : 9999
      };
    });
    const containing = withDist.filter(item => item.contains);
    const seenContainingCodes = new Set();
    const containingCandidates = [];
    containing.forEach(item => {
      if (!item?.z) return;
      const code = extractOfficialNilCode(item.z);
      const dedupKey = code !== null ? `nil_code_${code}` : item.z.id ? `id_${String(item.z.id).toLowerCase()}` : normalizeMunicipalityName(item.z.name || "");
      if (!seenContainingCodes.has(dedupKey)) {
        seenContainingCodes.add(dedupKey);
        containingCandidates.push(item.z);
      }
    });
    let mainNil = null;
    if (containingCandidates.length > 0) {
      mainNil = containingCandidates.length === 1 ? containingCandidates[0] : null;
    } else {
      withDist.sort((a, b) => a.dist - b.dist);
      if (withDist[0] && withDist[0].dist <= 3) {
        mainNil = withDist[0].z;
      }
    }
    withDist.sort((a, b) => a.dist - b.dist);
    const seenNearbyCodes = new Set(containingCandidates.map(z => {
      const c = extractOfficialNilCode(z);
      return c !== null ? `nil_code_${c}` : z.id ? `id_${String(z.id).toLowerCase()}` : normalizeMunicipalityName(z.name || "");
    }));
    const nearby = [];
    withDist.forEach(item => {
      if (!item?.z || item.dist > 2.5) return;
      const c = extractOfficialNilCode(item.z);
      const dedupKey = c !== null ? `nil_code_${c}` : item.z.id ? `id_${String(item.z.id).toLowerCase()}` : normalizeMunicipalityName(item.z.name || "");
      if (!seenNearbyCodes.has(dedupKey)) {
        seenNearbyCodes.add(dedupKey);
        nearby.push(item.z);
      }
    });
    const seenAllCodes = new Set();
    const all = [];
    [...(containingCandidates.length > 1 ? containingCandidates : [mainNil]), ...nearby].filter(Boolean).forEach(z => {
      const code = extractOfficialNilCode(z);
      const dedupKey = code !== null ? `nil_code_${code}` : z.id ? `id_${String(z.id).toLowerCase()}` : normalizeMunicipalityName(z.name || "");
      if (!seenAllCodes.has(dedupKey)) {
        seenAllCodes.add(dedupKey);
        all.push(z);
      }
    });
    if (isStep2DebugEnabled()) {
      debugStep2Log("[STEP2_ADDRESS_PREVIEW_NILS]", {
        ptLat,
        ptLng,
        main: mainNil?.name || null,
        containingCandidates: containingCandidates.map(z => ({
          id: z.id,
          code: extractOfficialNilCode(z),
          name: z.name
        })),
        nearby: nearby.map(z => z.name)
      });
    }
    return {
      main: mainNil,
      containingCandidates,
      requiresExplicitNilChoice: containingCandidates.length > 1,
      nearby,
      all
    };
  }, [hasUnconfirmedAddressPoint, selectedSearchPoint, apiData, apiZones, allZones]);

  // getFinalAreasForMode: in municipality mode, bypass stale `selected` state and use
  // zonesInRadius directly (already gated to 1 zone by userModeRef). In radius/address
  // mode, filter allZones by `selected` to preserve per-zone toggle behaviour.
  const selZones = useMemo(() => {
    if (searchMode === "cap") {
      return selectedCaps.map(cap => capDataMap[cap]).filter(zone => zone && !zone.unavailable);
    }
    const gateMode = userModeRef.current;
    debugStep2Log("[STEP2_ACTIVE_TAB]", searchMode);
    debugStep2Log("[STEP2_FINAL_MODE]", gateMode);
    let areas;
    if (gateMode === "municipality") {
      areas = zonesInRadius; // already filtered to target zones; bypasses stale `selected`
      // Modalità NIL manuale o selezione esplicita NIL:
      if ((isNilAnalysis || nilManualMode || requestedAnalysisLevel === "nil") && selected.length > 0) {
        const picked = areas.filter(z => selected.includes(z.id) || selected.includes(String(z.nilCode || z.nil_code)));
        if (picked.length > 0) areas = picked;
      } else if (hasUnconfirmedAddressPoint && !addressFullCoverageConfirmed && !nilManualMode) {
        // Se l'utente ha selezionato un indirizzo all'interno di Milano (es. Via Brera 5) e non ha confermato
        // "Usa Milano comune completo", mostriamo le famiglie e i KPI del NIL intersecato (es. BRERA: 6.705)
        // anziché l'aggregato dell'intero comune di Milano (744.299).
        const targetNil = addressPreviewNilZones?.main || addressPreviewNilZones?.containingCandidates?.[0] || addressPreviewNilZones?.all?.[0];
        if (targetNil) {
          const targetCode = targetNil.nilCode ?? targetNil.nil_code;
          const targetName = targetNil.name ?? targetNil.nil_name ?? targetNil.comune_name;
          const matched = areas.find(z => targetCode != null && (String(z.nilCode ?? z.nil_code) === String(targetCode) || String(z.id) === `nil_${String(targetCode).toLowerCase().replace(/\s+/g, '_')}`) || targetName && normalizeMunicipalityName(z.name ?? "") === normalizeMunicipalityName(targetName)) || {
            ...targetNil,
            id: targetNil.id ?? (targetCode ? `nil_${String(targetCode).toLowerCase().replace(/\s+/g, '_')}` : `nil_${String(targetName).toLowerCase().replace(/\s+/g, '_')}`),
            name: targetName ?? "NIL selezionato",
            nilCode: targetCode ?? null,
            isNil: true,
            families: Number(targetNil.families ?? targetNil.households ?? targetNil.households_in_radius ?? targetNil.households_total ?? 0),
            pop: Number(targetNil.pop ?? targetNil.population ?? targetNil.population_in_radius ?? targetNil.population_total ?? 0),
            area: Number(targetNil.area ?? targetNil.area_km2 ?? 1),
            coverage: Number(targetNil.coverage ?? targetNil.pct_copertura ?? 100),
            volantiniNelRaggio: Number(targetNil.volantiniNelRaggio ?? targetNil.volantini_nel_raggio ?? targetNil.volantini_consigliati ?? 0),
            flyersMin: Number(targetNil.flyersMin ?? targetNil.volantiniNelRaggio ?? targetNil.volantini_consigliati ?? 0)
          };
          areas = [matched];
        }
      }
      // Blocco di sicurezza: 0-1 NIL non è un comune completo — degrada a
      // "dati non disponibili" invece di mostrare DUOMO come totale Milano.
      if (milanoComuneNilInsufficient) {
        debugStep2Warn("[STEP2_MILANO_COMUNE_NIL_INSUFFICIENT]", {
          nilCount: areas.length
        });
        areas = [];
      }
      // Guard: block multi-zone result ONLY when the user is in genuine single-comune mode
      // (no selectedComuni, or exactly 1 comune). With 2+ comuni selected, the multi-zone
      // result is intentional — do NOT cap to [areas[0]].
      const multiComuneSelected = selectedComuni && selectedComuni.length > 1;
      const isMilanoTarget = Boolean(selectedMunicipality && normalizeMunicipalityName(selectedMunicipality) === "milano" || city && normalizeMunicipalityName(city.name || city.label) === "milano");
      if (areas.length > 1 && !isNilAnalysis && !multiComuneSelected && !isMilanoTarget) {
        debugStep2Warn("[STEP2_MUNICIPALITY_MULTI_AREA_BLOCKED]", areas.length, "→ forcing to 1 (single-comune mode)");
        areas = [areas[0]];
      }
    } else {
      areas = allZones.filter(z => selected.includes(z.id));
    }

    // [STEP2_MULTI_COMUNE_DEBUG] — behind debug flag to avoid console noise
    if (isStep2DebugEnabled() && gateMode === "municipality") {
      const distributionZones = areas;
      debugStep2Log("[STEP2_MULTI_COMUNE_DEBUG]", {
        selectedComuni: (selectedComuni || []).map(c => ({
          id: c.id,
          name: c.name || c.label,
          istatCode: c.municipalityCode || c.municipality_code || null,
          hasBoundary: Boolean(c.boundary || c.geometry),
          families: c.families || c.households || c.householdsTotal || 0
        })),
        distributionZones: distributionZones.map(z => ({
          id: z.id,
          name: z.name,
          hasBoundary: Boolean(z.geometry || z.geometry_geojson),
          families: z.families || z.households || z.householdsTotal || 0,
          isFallback: Boolean(z.isFallback),
          reasonIncluded: z.isFallback ? 'fallback_stub_comune_selezionato_senza_dati_api' : 'matched_api_zone'
        })),
        selectedCount: (selectedComuni || []).length,
        distributionCount: distributionZones.length,
        multiComuneSelected: Boolean(selectedComuni && selectedComuni.length > 1),
        isNilAnalysis
      });
    }
    debugStep2Log("[STEP2_FINAL_AREAS_FOR_COVERAGE]", areas.length, areas.map(z => z.name));
    return areas;
  }, [searchMode, selectedCaps, capDataMap, zonesInRadius, allZones, selected, isNilAnalysis, selectedComuni, nilManualMode, milanoComuneNilInsufficient, hasUnconfirmedAddressPoint, addressFullCoverageConfirmed, addressPreviewNilZones, requestedAnalysisLevel]);

  // Risolve pendingNilPreselectName (vedi selectMilanoAsNil) non appena le
  // 88 NIL di Milano sono caricate: seleziona SOLO quella cliccata dal
  // dropdown ("Brera" ecc.), non tutte.
  useEffect(() => {
    if (!pendingNilPreselectName || !nilManualMode) return;
    const target = normalizeMunicipalityName(pendingNilPreselectName);
    const match = zonesInRadius.find(z => normalizeMunicipalityName(z.name) === target);
    if (match) {
      setSelected([match.id]);
      setPendingNilPreselectName(null);
      debugStep2Log("[NIL_SUGGESTION_PRESELECT_APPLIED]", {
        name: match.name,
        id: match.id
      });
    }
  }, [pendingNilPreselectName, nilManualMode, zonesInRadius]);
  async function handleCapSelect(capSuggestion) {
    setSearch("");
    setDropOpen(false);
    if (selectedCaps.includes(capSuggestion.postalCode)) return;
    const localEntry = CAP_LOMBARDIA.find(c => c.postal_code === capSuggestion.postalCode);
    const unavailableCap = {
      id: `cap_${capSuggestion.postalCode}`,
      name: `CAP ${capSuggestion.postalCode}`,
      postalCode: capSuggestion.postalCode,
      municipalityName: localEntry?.municipality_name || capSuggestion.name,
      isCap: true,
      unavailable: true,
      unavailableMessage: "Dati CAP non disponibili. Usa Comune o Indirizzo + raggio."
    };
    try {
      const {
        data: analysis,
        error
      } = await supabase.rpc('get_postal_areas_analysis', {
        postal_codes: [capSuggestion.postalCode]
      });
      if (!error && analysis && analysis[0]) {
        const zone = capToZone(analysis[0], selectedCaps.length);
        setCapDataMap(prev => ({
          ...prev,
          [capSuggestion.postalCode]: zone
        }));
      } else {
        setCapDataMap(prev => ({
          ...prev,
          [capSuggestion.postalCode]: unavailableCap
        }));
      }
    } catch {
      setCapDataMap(prev => ({
        ...prev,
        [capSuggestion.postalCode]: unavailableCap
      }));
    }
    setSelectedCaps(prev => [...prev, capSuggestion.postalCode]);
  }
  function zCap(z) {
    return svcType === "d2d" ? z.families : svcType === "h2h" ? z.poi * 2 : z.bizTotal * 3;
  }
  function toggleZone(id) {
    setPartialCoverageConfirmed(false);
    setCoverageDecision(null);
    setCoverageStrategy(null);
    if (id.startsWith("cap_")) {
      const cp = id.replace("cap_", "");
      setSelectedCaps(prev => prev.includes(cp) ? prev.filter(x => x !== cp) : [...prev, cp]);
    } else {
      setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  }

  // "Brera non è un comune, è una NIL di Milano" → seleziona Milano come
  // comune (unico comune con dataset NIL) e attiva la modalità NIL manuale,
  // pre-selezionando la NIL cliccata non appena la lista delle 88 NIL carica.
  // Geocoding dedicato a "Milano" (stessi endpoint già usati dalla ricerca
  // sopra) invece di riusare le coordinate del quartiere cliccato: servono
  // le coordinate del COMUNE per il raggio tecnico ≥15km che recupera tutte
  // le NIL, non quelle di un singolo quartiere.
  async function resolveMilanoCity() {
    let milano = null;
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (mapboxToken) {
      const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/Milano.json?access_token=${mapboxToken}&country=IT&types=place&language=it&limit=1`);
      const d = await r.json();
      const f = d.features?.[0];
      if (f) milano = {
        id: f.id,
        name: "Milano",
        label: "Milano",
        lat: f.center[1],
        lng: f.center[0]
      };
    }
    if (!milano) {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent("Milano, Italy")}&countrycodes=it&format=json&limit=1&featuretype=city`);
      const d = await r.json();
      const f = d[0];
      if (f) milano = {
        id: f.place_id,
        name: "Milano",
        label: "Milano",
        lat: parseFloat(f.lat),
        lng: parseFloat(f.lon)
      };
    }
    return milano;
  }

  // Indirizzo/punto dentro Milano ("Milano via Como", "Piazza Duomo Milano"):
  // il comune resta Milano (comune completo), ma il punto cercato diventa il
  // centro preferito della modalità Raggio (radiusCenterSource = "address").
  function startManualPinSelection() {
    setManualPinMode(true);
    setAddressSearchError("");
    setDropOpen(false);
  }
  function handleManualMapClick(coords) {
    if (!coords || !Number.isFinite(Number(coords?.lat)) || !Number.isFinite(Number(coords?.lng))) return;
    setManualPinMode(false);
    setSelectedSearchPoint({
      type: "manual_point",
      label: "Punto selezionato sulla mappa",
      lat: Number(coords.lat),
      lng: Number(coords.lng),
      parentComune: normalizeMunicipalityName(city?.label || city?.name) === "milano" ? "Milano" : city?.label || city?.name || "Milano"
    });
    setAddressSearchError("");
    switchToRadiusMode();
  }
  async function selectAddressPointInMilano(pointLabel, point) {
    try {
      const milano = await resolveMilanoCity();
      if (!milano) {
        debugStep2Warn("[ADDRESS_POINT_MILANO_RESOLVE_FAILED]", {
          pointLabel
        });
        return;
      }
      const hasValidCoordinates = point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
      const isParentMilano = point?.parentComune === "Milano" || isGeocoderResultInMilanoComune(point);
      const isComuneDiverso = point?.placeType === "place" || point && normalizeMunicipalityName(point.city || point.comune || "") && normalizeMunicipalityName(point.city || point.comune || "") !== "milano";
      if (!hasValidCoordinates || !isParentMilano || isComuneDiverso) {
        setAddressSearchError("Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa.");
        setSelectedSearchPoint(null);
        logAddressVsMunicipalityDebug(pointLabel || search, city, null, null, true, !hasValidCoordinates ? "invalid_coordinates" : !isParentMilano ? "not_in_milano" : "different_municipality", pointLabel, "address", null);
        if (import.meta.env.DEV) {
          console.log("[STEP2_ADDRESS_VALIDATION]", {
            inputValue: pointLabel || search,
            searchIntent: detectSearchIntent(pointLabel || search),
            rawResultsCount: geocodeSuggestions.length,
            validMilanoAddressResultsCount: 0,
            rejectedResults: geocodeSuggestions.map(r => ({
              name: r.name,
              fullName: r.fullName,
              type: r.placeType || r.type,
              lat: r.lat,
              lng: r.lng,
              reason: !hasValidCoordinates ? "invalid_coordinates" : !isParentMilano ? "not_in_milano" : "different_municipality"
            })),
            selectedSearchPoint: null,
            addressSearchError: "Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa."
          });
        }
        return;
      }
      setCity(milano);
      setSelectedComuni([milano]);
      setSearch(pointLabel);
      setDropOpen(false);
      setPendingAddMunicipality(false);
      setSelected([]);
      setCoverageDecision(null);
      setCoverageStrategy(null);
      setPartialCoverageConfirmed(false);
      setRadiusSelectionConfirmed(false);
      setNilManualMode(false);
      setPendingNilPreselectName(null);
      setAddressFullCoverageConfirmed(false);
      setAddressSearchError("");
      const sp = {
        label: pointLabel,
        lat: Number(point.lat),
        lng: Number(point.lng),
        type: "address",
        parentComune: "Milano",
        street: point.street || point.address?.road || null,
        houseNumber: point.houseNumber || point.address?.house_number || null,
        postcode: point.postcode || point.address?.postcode || null,
        city: "Milano",
        province: point.province || null,
        providerPlaceId: point.id || null,
        precision: point.placeType || point.type || "address"
      };
      setSelectedSearchPoint(sp);
      logAddressVsMunicipalityDebug(pointLabel || search, city, milano, sp, true, "selected_milano_address_point", pointLabel, "address", "Milano");
      if (import.meta.env.DEV) {
        console.log("[STEP2_ADDRESS_VALIDATION]", {
          inputValue: pointLabel || search,
          searchIntent: detectSearchIntent(pointLabel || search),
          rawResultsCount: geocodeSuggestions.length,
          validMilanoAddressResultsCount: 1,
          rejectedResults: [],
          selectedSearchPoint: {
            label: pointLabel,
            lat: Number(point.lat),
            lng: Number(point.lng),
            type: "address",
            parentComune: "Milano"
          },
          addressSearchError: ""
        });
        console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
          inputValue: search,
          detectedSearchIntent: "address",
          selectedResultName: pointLabel,
          selectedResultType: "address",
          parentComune: "Milano",
          selectedComune: "Milano",
          selectedAddressPoint: point,
          radiusCenterSource: "address",
          blockedReason: null
        });
      }
    } catch (e) {
      debugStep2Warn("[ADDRESS_POINT_MILANO_RESOLVE_ERROR]", e);
    }
  }
  async function selectMilanoAsNil(nilName, nilPoint = null) {
    try {
      const milano = await resolveMilanoCity();
      if (!milano) {
        debugStep2Warn("[NIL_SUGGESTION_MILANO_RESOLVE_FAILED]", {
          nilName
        });
        return;
      }
      setCity(milano);
      setSelectedComuni([milano]);
      setSearch("Milano");
      setDropOpen(false);
      setPendingAddMunicipality(false);
      setSelected([]);
      setCoverageDecision(null);
      setCoverageStrategy(null);
      setPartialCoverageConfirmed(false);
      setRadiusSelectionConfirmed(false);
      setNilManualMode(true);
      setAddressSearchError("");
      setPendingNilPreselectName(nilName);
      // Il punto cercato (coordinate del quartiere dal geocoder) diventa il
      // centro preferito della modalità Raggio: "Milano via Brera" → il
      // cerchio parte da Brera, non dal centroide di Milano.
      if (nilPoint && Number.isFinite(Number(nilPoint.lat)) && Number.isFinite(Number(nilPoint.lng))) {
        setSelectedSearchPoint({
          label: `${nilName}, Milano`,
          lat: Number(nilPoint.lat),
          lng: Number(nilPoint.lng),
          type: "nil",
          parentComune: "Milano"
        });
      }
      debugStep2Log("[NIL_SUGGESTION_SELECTED_AS_NIL]", {
        nilName,
        nilPoint
      });
    } catch (e) {
      debugStep2Warn("[NIL_SUGGESTION_MILANO_RESOLVE_ERROR]", e);
    }
  }
  const thVals = activeLay ? zonesInRadius.map(z => z[activeLay.field]).filter(v => v != null) : [];
  const thMin = thVals.length ? Math.min(...thVals) : 0;
  const thMax = thVals.length ? Math.max(...thVals) : 1;
  function zoneColor(z) {
    return activeLay ? thColor(z[activeLay.field], thMin, thMax, activeLay.lo, activeLay.hi) : col + "88";
  }
  const localProj = city ? (lat, lng) => ({
    x: MW / 2 + (lng - city.lng) * SCALE_X,
    y: MH / 2 - (lat - city.lat) * SCALE_Y
  }) : s2proj;
  const center = city ? localProj(city.lat, city.lng) : {
    x: MW / 2,
    y: MH / 2
  };
  const rPx = kmToPx(radius);
  const businessMapZones = isBusinessStep2 ? zonesInRadius.map(z => ({
    ...z,
    businessScore: businessZoneScore(z),
    clusterRows: businessRows([z], targetBusinessMeta)
  })).sort((a, b) => businessZoneScore(b) - businessZoneScore(a)) : [];
  const liveNonResidentialRequirement = svcType === "h2h" && configuredH2HCapacity > 0 ? configuredH2HCapacity : svcType === "h2h" && selectedOperationalPois.length > 0 ? selectedOperationalPois.reduce((total, point) => total + Math.round(Math.max(1, Number(point.serviceDurationHours || serviceDurationForStep2)) * H2H_FLYERS_PER_PROMOTER_HOUR), 0) : svcType === "h2h" && step1OperationalPoints.length > 0 ? step1OperationalPoints.every(point => Number.isFinite(Number(point.assignedQuantity))) ? step1OperationalPoints.reduce((total, point) => total + Number(point.assignedQuantity), 0) : null : svcType === "b2b" ? businessMaterialPlan?.materialsRequired ?? null : null;
  const recommendedFlyersForSelection = isResidentialStep2 ? selZones.reduce((a, z) => a + getZoneFullCoverageFlyers(z), 0) : liveNonResidentialRequirement;
  const availableNils = isNilAnalysis ? (Array.isArray(apiData?.nil_breakdown) && apiData.nil_breakdown.length > 0 ? apiData.nil_breakdown : (Array.isArray(allZones) ? allZones : []).filter(z => z.isNil || z.territoryLevel === "nil" || isNilAnalysis)).map(z => ({
    code: z.nilCode || z.nil_code || z.id,
    name: z.name
  })) : [];
  const containingNil = addressPreviewNilZones?.main ? {
    code: addressPreviewNilZones.main.id || addressPreviewNilZones.main.nilCode,
    name: addressPreviewNilZones.main.name
  } : hasUnconfirmedAddressPoint && Array.isArray(zonesInRadius) && zonesInRadius.length === 1 ? {
    code: zonesInRadius[0].nilCode || zonesInRadius[0].nil_code || zonesInRadius[0].id,
    name: zonesInRadius[0].name
  } : null;
  const intersectedNils = isNilAnalysis && areaMode === "radius" ? (zonesInRadius || []).filter(z => z.isNil || z.territoryLevel === "nil" || isNilAnalysis).map(z => ({
    code: z.nilCode || z.nil_code || z.id,
    name: z.name
  })) : [];
  const selectedNils = isNilAnalysis ? hasUnconfirmedAddressPoint ? [] : areaMode === "custom_zone" || nilManualMode ? (selZones || []).filter(z => z.isNil || z.territoryLevel === "nil" || isNilAnalysis).map(z => ({
    code: z.nilCode || z.nil_code || z.id,
    name: z.name
  })) : areaMode === "radius" ? intersectedNils : isComuneMode && !hasUnconfirmedAddressPoint ? availableNils : [] : [];
  const manualFlyersNumber = Number(manualFlyers);
  const finalFlyers = resolveAssignedQuantity({
    insertedQuantity: availableFlyers || flyerQuantityFromStep1,
    recommendedQuantity: recommendedFlyersForSelection,
    manualQuantity: manualFlyersNumber,
    decision: coverageDecision
  });
  const allocationFlyers = Math.max(0, Math.round(Number(finalFlyers || availableFlyers || flyerQuantityFromStep1 || 0)));
  const doorCoverage = isResidentialStep2 ? computeDoorToDoorCoverage({
    insertedFlyers: allocationFlyers,
    selectedZones: selZones
  }) : null;
  const totalCapacity = recommendedFlyersForSelection;
  const requiredFlyers = recommendedFlyersForSelection;
  const isPartial = isResidentialStep2 ? allocationFlyers < requiredFlyers : allocationFlyers < requiredFlyers;

  // Surplus (business/UX layer only — does not touch families/coverage calc):
  // quantity > recommendedFlyers with 100% municipality coverage. !isPartial already
  // implies flyerQuantityFromStep1 >= requiredFlyers, so this only adds the ">" case.
  const hasSurplus = isResidentialStep2 && searchMode === "municipality" && !isPartial && requiredFlyers > 0 && flyerQuantityFromStep1 > requiredFlyers;
  const surplusFlyers = hasSurplus ? flyerQuantityFromStep1 - requiredFlyers : 0;
  useEffect(() => {
    if (hasSurplus) {
      debugStep2Log("[STEP2_SURPLUS_DETECTED]", {
        city: city?.name,
        inserted: flyerQuantityFromStep1,
        recommended: requiredFlyers
      });
      debugStep2Log("[STEP2_SURPLUS_AMOUNT]", surplusFlyers);
    }
  }, [hasSurplus, surplusFlyers, city?.name, flyerQuantityFromStep1, requiredFlyers]);
  let remainingForAuto = allocationFlyers;
  // Modalità "Priorità" (solo Comuni): stesso algoritmo greedy di "auto",
  // applicato all'ordine scelto dall'utente (comuniPriorityOrder) invece
  // dell'ordine naturale di selZones. Le zone non ancora ordinate vanno in
  // coda, nell'ordine originale.
  let priorityAssignedById = null;
  if (allocationMode === "priority") {
    const orderIndex = new Map(comuniPriorityOrder.map((id, i) => [id, i]));
    const priorityOrderedZones = [...selZones].sort((a, b) => {
      const ia = orderIndex.has(a.id) ? orderIndex.get(a.id) : Infinity;
      const ib = orderIndex.has(b.id) ? orderIndex.get(b.id) : Infinity;
      return ia - ib;
    });
    priorityAssignedById = new Map();
    let remainingForPriority = allocationFlyers;
    for (const z of priorityOrderedZones) {
      const req = isResidentialStep2 ? getZoneFullCoverageFlyers(z) : selZones.length === 1 ? requiredFlyers : zCap(z);
      const assigned = Math.min(req, remainingForPriority);
      remainingForPriority -= assigned;
      priorityAssignedById.set(z.id, assigned);
    }
  }
  let zonesAllocation = selZones.map((z, index) => {
    const req = isResidentialStep2 ? getZoneFullCoverageFlyers(z) : selZones.length === 1 ? requiredFlyers : zCap(z);
    let assigned = 0;
    if (allocationMode === "auto") {
      assigned = Math.min(req, remainingForAuto);
      remainingForAuto -= assigned;
    } else if (allocationMode === "priority") {
      assigned = priorityAssignedById.get(z.id) || 0;
    } else {
      assigned = manualAssignments[z.id] || 0;
    }
    return {
      id: z.id,
      name: z.name,
      requiredFlyers: req,
      assignedFlyers: assigned,
      coveragePercent: req > 0 ? Math.round(assigned / req * 100) : 0,
      allocationStatus: assigned >= req ? "full" : assigned > 0 ? "partial" : "none",
      priorityRank: index + 1
    };
  });
  // Keep the scenario quantity reconcilable with the zone allocation. When all
  // requirements are already full, the extra copies stay assigned to the first
  // priority zone as explicit operational surplus; coverage remains capped at 100%.
  if ((allocationMode === "auto" || allocationMode === "priority") && zonesAllocation.length > 0) {
    const allocated = zonesAllocation.reduce((sum, zone) => sum + zone.assignedFlyers, 0);
    const surplusToAssign = Math.max(0, allocationFlyers - allocated);
    if (surplusToAssign > 0) {
      zonesAllocation = zonesAllocation.map((zone, index) => index === 0 ? {
        ...zone,
        assignedFlyers: zone.assignedFlyers + surplusToAssign,
        coveragePercent: zone.requiredFlyers > 0 ? 100 : 0,
        allocationStatus: zone.requiredFlyers > 0 ? "full" : zone.allocationStatus,
        surplusFlyers: surplusToAssign
      } : zone);
    }
  }
  // Stato copertura per comune/NIL, stessa soglia della legenda (getCoverageStatus,
  // ≥90% coperto / >0% parziale / 0% non_coperto) — passato alla mappa così i
  // poligoni usano ESATTAMENTE gli stessi colori della legenda sotto la mappa.
  // zonesAllocation è ricreato a ogni render (const inline): per non far
  // ridisegnare i layer Leaflet ad ogni render React, i memo derivati usano
  // una chiave serializzata stabile invece dell'identità dell'array.
  const zonesAllocationKey = JSON.stringify(zonesAllocation);
  // Dati allocazione per i tooltip mappa (famiglie/volantini assegnati/
  // consigliati/stato per zona) — stessa fonte di zoneCoverageById.
  const zoneAllocationById = useMemo(() => {
    const map = {};
    zonesAllocation.forEach(a => {
      map[a.id] = {
        assignedFlyers: a.assignedFlyers,
        requiredFlyers: a.requiredFlyers,
        coveragePercent: a.coveragePercent,
        status: getCoverageStatus(a.coveragePercent),
        priorityRank: a.priorityRank
      };
    });
    return map;
  }, [zonesAllocationKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoneCoverageById = useMemo(() => {
    const map = {};
    zonesAllocation.forEach(a => {
      map[a.id] = getCoverageStatus(a.coveragePercent);
    });
    return map;
  }, [zonesAllocation]);
  const totalAssigned = zonesAllocation.reduce((a, v) => a + v.assignedFlyers, 0);
  const assignedFlyersTotal = Math.round(Number(totalAssigned || 0));
  const finalFlyersRounded = Math.round(Number(finalFlyers || 0));
  const hasUsableAllocationData = isResidentialStep2 ? selZones.some(zone => !zone?.isFallback && Number(zone?.families || 0) > 0 && getZoneFullCoverageFlyers(zone) > 0) : isMovementStep2 ? selectedOperationalPois.length > 0 || step1OperationalPoints.length > 0 : selectedOperationalPois.length > 0;
  const allocationStatus = hasUsableAllocationData && assignedFlyersTotal === finalFlyersRounded ? "success" : "pending";
  const isInvalid = allocationMode === "manual" && totalAssigned > allocationFlyers;
  const isCoverageDecisionValid = coverageDecision === "keepCurrent" ? Number(availableFlyers) > 0 && finalFlyersRounded === Math.round(Number(availableFlyers)) : coverageDecision === "useRecommended" ? Number(requiredFlyers) > 0 && finalFlyersRounded === Math.round(Number(requiredFlyers)) : coverageDecision === "manual" ? Number.isFinite(manualFlyersNumber) && manualFlyersNumber > 0 && assignedFlyersTotal === finalFlyersRounded : false;
  useEffect(() => {
    if (!data.activeZoneId || !Array.isArray(data.campaignZones)) return;
    setData(prev => {
      const zones = Array.isArray(prev.campaignZones) ? prev.campaignZones : [];
      const zoneIndex = zones.findIndex(z => z.id === prev.activeZoneId);
      if (zoneIndex === -1) return prev;
      const currentZone = zones[zoneIndex];
      const nextCalculationStatus = !hasUsableAllocationData && (selZones.length > 0 || Boolean(city)) ? "unavailable" : allocationStatus === "success" ? "success" : "pending";
      const changed = currentZone.coverageMode !== coverageMode || currentZone.coverageDecision !== coverageDecision || Number(currentZone.availableFlyers || 0) !== Number(availableFlyers || 0) || Number(currentZone.recommendedFlyers || currentZone.recommended_flyers || 0) !== Number(requiredFlyers || 0) || Number(currentZone.manualFlyers || 0) !== Number(manualFlyersNumber || 0) || Number(currentZone.finalFlyers || 0) !== Number(finalFlyersRounded || 0) || currentZone.calculationStatus !== nextCalculationStatus || JSON.stringify(currentZone.allocation || currentZone.zonesAllocation || []) !== JSON.stringify(zonesAllocation);
      if (!changed) return prev;
      const nextZones = [...zones];
      nextZones[zoneIndex] = {
        ...currentZone,
        assigned_flyers: finalFlyersRounded,
        recommended_flyers: requiredFlyers,
        coverageMode,
        coverageDecision,
        availableFlyers,
        recommendedFlyers: requiredFlyers,
        manualFlyers: coverageDecision === "manual" ? manualFlyersNumber : null,
        finalFlyers: finalFlyersRounded,
        allocation: zonesAllocation,
        zonesAllocation,
        calculationStatus: nextCalculationStatus
      };
      return {
        ...prev,
        campaignZones: nextZones,
        coverageMode,
        coverageDecision,
        availableFlyers,
        recommendedFlyers: requiredFlyers,
        manualFlyers: coverageDecision === "manual" ? manualFlyersNumber : null,
        finalFlyers: finalFlyersRounded,
        calculationStatus: nextCalculationStatus
      };
    });
  }, [data.activeZoneId, coverageMode, coverageDecision, availableFlyers, requiredFlyers, manualFlyersNumber, finalFlyersRounded, allocationStatus, hasUsableAllocationData, zonesAllocationKey]);
  function updateManual(id, val) {
    const num = parseInt(val) || 0;
    setAllocationMode("manual");
    setCoverageDecision("manual");
    setManualAssignments(prev => {
      const next = {
        ...prev,
        [id]: num
      };
      const nextTotal = Object.values(next).reduce((sum, value) => sum + (parseInt(value) || 0), 0);
      setManualFlyers(nextTotal || "");
      return next;
    });
  }
  function buildAutoAssignmentsForQuantity(quantity) {
    let remaining = Math.max(0, Math.round(Number(quantity) || 0));
    const next = {};
    selZones.forEach(z => {
      const req = isResidentialStep2 ? getZoneFullCoverageFlyers(z) : zCap(z);
      const assigned = Math.min(req, remaining);
      remaining -= assigned;
      next[z.id] = assigned;
    });
    return next;
  }
  function selectCoverageQuantityDecision(nextDecision) {
    const normalized = normalizeCoverageDecision(nextDecision);
    setCoverageDecision(normalized);
    setPartialCoverageConfirmed(normalized === "keepCurrent");
    if (normalized === "keepCurrent" || normalized === "useRecommended") {
      setAllocationMode("auto");
      setManualFlyers("");
      setManualAssignments({});
      return;
    }
    if (normalized === "manual") {
      const initialManualFlyers = Number(manualFlyers || allocationFlyers || availableFlyers || flyerQuantityFromStep1 || 0);
      setAllocationMode("auto");
      setManualFlyers(initialManualFlyers > 0 ? initialManualFlyers : "");
      setManualAssignments({});
    }
  }
  function updateManualFlyersQuantity(value) {
    const num = parseInt(value, 10);
    setCoverageDecision("manual");
    setAllocationMode("auto");
    if (!Number.isFinite(num) || num <= 0) {
      setManualFlyers(value);
      setManualAssignments({});
      return;
    }
    setManualFlyers(num);
    setManualAssignments({});
  }

  // Riordina un comune nella modalità "Priorità" (solo modalità Comuni).
  // Se comuniPriorityOrder è ancora vuoto, lo inizializza dall'ordine
  // corrente delle zone selezionate al primo utilizzo.
  function movePriorityZone(id, direction) {
    setComuniPriorityOrder(prev => {
      const order = prev.length ? [...prev] : selZones.map(z => z.id);
      const idx = order.indexOf(id);
      if (idx < 0) return order;
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= order.length) return order;
      [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
      return order;
    });
  }
  function handleNext() {
    if (!canContinueCalendar) {
      debugStep2Warn("[STEP2_CONTINUE_BLOCKED_INVALID_COVERAGE]", {
        isCoverageConfigurationValid,
        isCoverageDecisionValid,
        allocationStatus,
        assignedFlyersTotal,
        finalFlyers: finalFlyersRounded,
        coverageStatusReason: step2ViewModel?.coverageStatusReason,
        areaMode,
        coverageMode,
        searchMode,
        families: serviceKpis?.families,
        recommendedFlyers: requiredFlyers,
        radiusSelectionConfirmed
      });
      return;
    }
    const isCapMode = searchMode === "cap";
    const canonicalPayload = buildStep2ToStep3Payload(step2TruthModel);
    const finalFlyerQuantity = step2TruthModel.quantity.current;
    const finalZonesAllocation = step2TruthModel.allocation.rows;
    const finalServiceKpis = canonicalPayload.serviceKpis;
    // Difensivo: non propagare a Step 4 un coverageStrategy residuo di una
    // configurazione precedente (es. "expand_area" scelto per un altro
    // comune). Valido solo se la situazione di surplus è ancora quella
    // corrente per il comune/raggio appena confermato.
    const finalCoverageStrategy = hasSurplus ? coverageStrategy : null;
    setData(prev => ({
      ...prev,
      ...canonicalPayload,
      campaignZones: Array.isArray(prev.campaignZones) ? prev.campaignZones.map(zone => zone.id === prev.activeZoneId ? {
        ...zone,
        assigned_flyers: finalFlyerQuantity,
        recommended_flyers: requiredFlyers,
        coverageMode,
        coverageDecision,
        coverageStrategy: finalCoverageStrategy,
        availableFlyers,
        manualFlyers: coverageDecision === "manual" ? manualFlyersNumber : null,
        finalFlyers: finalFlyerQuantity,
        allocation: finalZonesAllocation,
        calculationStatus: "success",
        selected: isCapMode ? [] : selZones.map(z => z.id),
        selectedComuni: isCapMode ? [] : selectedMunicipalitySummary,
        selectedMunicipalities: isCapMode ? [] : selectedMunicipalitySummary,
        selectedSearchPoint,
        addressLabel: selectedSearchPoint?.label || null,
        coordinates: selectedSearchPoint ? {
          lat: selectedSearchPoint.lat,
          lng: selectedSearchPoint.lng
        } : city ? {
          lat: city.lat,
          lng: city.lng
        } : null,
        radiusKm,
        intersectedNils,
        selectedNils,
        selectedNil: selectedNils,
        zonesAllocation: finalZonesAllocation,
        serviceKpis: finalServiceKpis,
        operationalPoints: step1OperationalPoints,
        promoterAssignments: isBusinessStep2 ? [] : operatorSchedules,
        promoterCount: isBusinessStep2 ? null : operatorCountForPoiAssignment,
        serviceDurationHours: serviceDurationForStep2,
        h2hEstimatedCapacity: operatorSchedules.reduce((total, schedule) => total + Math.max(1, Number(schedule.serviceDurationHours || serviceDurationForStep2)) * H2H_FLYERS_PER_PROMOTER_HOUR, 0),
        poiAssignments,
        selectedOperationalPois,
        totalAssigned: step2TruthModel.quantity.allocatedQuantity,
        coverageStatus: step2TruthModel.quantity.shortage > 0 ? "partial" : "sufficient"
      } : zone) : prev.campaignZones,
      qty: finalFlyerQuantity,
      flyerQuantity: finalFlyerQuantity,
      flyerQuantityFromStep1: flyerQuantityFromStep1,
      insertedFlyersOriginal: flyerQuantityFromStep1,
      originalFlyerQuantity: flyerQuantityFromStep1,
      assignedFlyers: finalFlyerQuantity,
      zones: isCapMode ? [] : selZones.map(z => z.id),
      selectedCaps,
      capDataMap,
      searchMode,
      areaMode: isCapMode ? "cap" : areaMode,
      analysisLevel: isCapMode ? "cap" : activeAnalysisLevel,
      capAnalysis: isCapMode ? selectedCaps.map(cap => capDataMap[cap]).filter(Boolean) : [],
      nearbyAreasExplicitlyAdded: false,
      coverageMode,
      availableFlyers,
      manualFlyers: coverageDecision === "manual" ? manualFlyersNumber : null,
      finalFlyers: finalFlyerQuantity,
      calculationStatus: "success",
      selectedComuni: isCapMode ? [] : selectedMunicipalitySummary,
      selectedSearchPoint,
      addressLabel: selectedSearchPoint?.label || null,
      coordinates: selectedSearchPoint ? {
        lat: selectedSearchPoint.lat,
        lng: selectedSearchPoint.lng
      } : city ? {
        lat: city.lat,
        lng: city.lng
      } : null,
      radiusKm,
      intersectedNils,
      selectedNils,
      selectedNil: selectedNils,
      selectedMunicipalities: isCapMode ? [] : selectedMunicipalitySummary,
      cityName: isCapMode ? selectedCaps.length === 1 ? `CAP ${selectedCaps[0]}` : `${selectedCaps.length} CAP selezionati` : isMultiMunicipalitySelection ? selectedMunicipalityDisplayLabel : city?.label || city?.name || "",
      allocationMode,
      comuniPriorityOrder,
      coverageDecision,
      coverageStrategy: finalCoverageStrategy,
      surplusFlyers: step2TruthModel.quantity.surplus,
      manualAssignments,
      totalAssigned: step2TruthModel.quantity.allocatedQuantity,
      totalCapacity,
      isPartial: step2TruthModel.quantity.shortage > 0,
      requiredFlyers: canonicalPayload.requiredFlyers,
      operationalWaypoints,
      gpsPlannedPoints: operationalWaypoints,
      requiredTotalFlyers: canonicalPayload.requiredFlyers,
      fullCoverageFlyers: canonicalPayload.requiredFlyers,
      missingFlyers: canonicalPayload.missingFlyers,
      remainingFlyers: canonicalPayload.remainingFlyers,
      coverageStatus: step2TruthModel.quantity.shortage > 0 ? "partial" : "sufficient",
      zonesAllocation: finalZonesAllocation,
      serviceKpis: finalServiceKpis,
      operationalPoints: step1OperationalPoints,
      promoterAssignments: isBusinessStep2 ? [] : operatorSchedules,
      promoterCount: isBusinessStep2 ? null : operatorCountForPoiAssignment,
      businessOperatorCount: isBusinessStep2 ? businessOperationalPlan?.recommendedOperators : data.businessOperatorCount,
      businessMaterialPlan: canonicalPayload.businessMaterialPlan,
      businessOperationalPlan: isBusinessStep2 ? businessOperationalPlan : data.businessOperationalPlan,
      serviceDurationHours: serviceDurationForStep2,
      h2hEstimatedCapacity: operatorSchedules.reduce((total, schedule) => total + Math.max(1, Number(schedule.serviceDurationHours || serviceDurationForStep2)) * H2H_FLYERS_PER_PROMOTER_HOUR, 0),
      poiAssignments,
      selectedOperationalPois,
      radius,
      city,
      sources: confirmedStep2Sources,
      activeService: svcType,
      selectedService: svcType,
      comuniNelRaggio: zonesInRadius.length,
      metadata: {
        omi: omiInfo,
        operational_waypoints: operationalWaypoints,
        analysis_level: activeAnalysisLevel,
        nil_unavailable: nilUnavailable
      }
    }));
    debugStep2Log("[STEP2_TO_STEP3_PAYLOAD]", canonicalPayload);
    onNext();
  }
  const coverageStatus = selZones.length === 0 && !isMovementStep2 && !isBusinessStep2 ? "empty" : isPartial ? "partial" : "sufficient";
  const remainingFlyers = isResidentialStep2 && doorCoverage ? doorCoverage.remainingFlyers : coverageStatus === "sufficient" ? flyerQuantityFromStep1 - requiredFlyers : 0;
  const canGo = searchMode === "cap" ? selectedCaps.length > 0 : isMovementStep2 ? pois.length > 0 ? selectedOperationalPois.length > 0 : step1OperationalPoints.length > 0 : isBusinessStep2 ? selectedOperationalPois.length > 0 : selZones.length > 0;
  const h2hMetrics = useMemo(() => {
    // Preferisce i POI real-time (Overpass via usePoi); usa i POI del backend come fallback.
    const poisForCalc = pois.length > 0 ? pois : backendPois;
    const m = getH2HMetrics(poisForCalc, transportState, radiusKm);
    // Se i POI vengono dal backend, integra i KPI scalari già aggregati lato server.
    if (isMovementStep2 && poisForCalc === backendPois && backendPois.length > 0 && apiData?.values) {
      const v = apiData.values;
      return {
        ...m,
        poi: v.poi_count ?? v.poi_rilevati ?? m.poi,
        tplStops: v.transit_points ?? v.transit_stops ?? m.tplStops,
        stations: v.transit_points ?? m.stations,
        metro: m.metro,
        universities: v.schools_events_count ?? v.schools_events ?? m.universities,
        localAttractors: m.localAttractors,
        transitTotal: v.transit_points ?? m.transitTotal,
        flowScore: v.potential_flow ?? v.flow_score ?? m.flowScore,
        hotspots: v.hotspot_count ?? m.hotspots,
        zones: m.clusters.length || v.hotspot_count || 0
      };
    }
    return m;
  }, [pois, backendPois, transportState, radiusKm, isMovementStep2, apiData]);
  const businessMetrics = useMemo(() => {
    const poisForCalc = pois.length > 0 ? pois : backendPois;
    const m = getVerifiedBusinessMetrics(poisForCalc, targetBusinessMeta, radiusKm);
    if (isBusinessStep2 && poisForCalc === backendPois && backendPois.length > 0 && apiData?.values) {
      const v = apiData.values;
      return {
        ...m,
        businesses: v.detected_activities ?? v.businesses ?? m.businesses,
        competitors: resolveVerifiedCompetitorCount(v),
        commercialDensity: v.commercial_density ?? m.commercialDensity,
        cdIdx: v.commercial_density_index ?? v.cdIdx ?? m.cdIdx,
        targetBusinesses: v.target_activities_count ?? v.target_businesses ?? m.targetBusinesses,
        clusters: m.clusterRows.length || v.cluster_count || 0
      };
    }
    return m;
  }, [pois, backendPois, targetBusinessMeta, radiusKm, isBusinessStep2, apiData]);
  const operationalWaypoints = useMemo(() => {
    if (isMovementStep2) {
      return h2hMetrics.clusters.slice(0, 24).map(point => ({
        id: point.id,
        type: "h2h_hotspot",
        label: point.name,
        category: point.zoneName,
        lat: point.lat,
        lng: point.lng,
        score: point.strength,
        poiCount: point.poi,
        source: "POI/TPL cluster"
      })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    }
    if (isBusinessStep2) {
      return businessMetrics.clusterRows.slice(0, 24).map(point => ({
        id: point.id,
        type: "b2b_cluster",
        label: point.name,
        category: point.dominant || point.zoneName,
        lat: point.lat,
        lng: point.lng,
        score: point.score,
        poiCount: point.activities,
        source: "POI business cluster"
      })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    }
    return (civiciState?.points || []).slice(0, 50).map(point => ({
      id: point.id,
      type: "d2d_address_sample",
      label: [point.via, point.numeroCivico].filter(Boolean).join(" ") || "Civico OSM",
      category: point.comune || "Civico",
      lat: point.lat,
      lng: point.lng,
      score: null,
      poiCount: null,
      source: "OSM address sample"
    })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
  }, [isMovementStep2, isBusinessStep2, h2hMetrics.clusters, businessMetrics.clusterRows, civiciState?.points]);
  const dedupedSelZonesForCalc = useMemo(() => {
    const seen = new Set();
    const res = [];
    for (const z of selZones) {
      if (!z) continue;
      const k = String(z.name || z.id).trim().toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        res.push(z);
      }
    }
    return res;
  }, [selZones]);
  const step2FamiliesCalc = useMemo(() => {
    if (!isResidentialStep2 || dedupedSelZonesForCalc.length === 0) return {
      families: 0,
      pop: 0,
      recFlyers: 0
    };
    const rawFam = dedupedSelZonesForCalc.reduce((a, z) => a + (Number(z.families) || 0), 0);
    const rawPop = dedupedSelZonesForCalc.reduce((a, z) => a + (Number(z.pop || z.population) || 0), 0);
    const rawRec = dedupedSelZonesForCalc.reduce((a, z) => a + (Number(z.flyersMin) || 0), 0);
    const rawArea = dedupedSelZonesForCalc.reduce((a, z) => a + (Number(z.area) || 0), 0);
    debugStep2Log("[STEP2_SELECTED_AREAS_COUNT]", selZones.length);
    debugStep2Log("[STEP2_DEDUPED_AREAS_COUNT]", dedupedSelZonesForCalc.length);
    debugStep2Log("[STEP2_FAMILIES_CALC_INPUT]", {
      rawFam,
      rawPop,
      rawRec,
      rawArea,
      radiusKm
    });
    const maxPlausibleRadiusFam = Math.max(120000, Math.round(Math.PI * Number(radiusKm || 3) * Number(radiusKm || 3) * 5500));
    // Modalità Comuni: comuni scelti manualmente possono legittimamente superare
    // il tetto pensato per un'area a raggio — si mantiene solo il controllo di
    // coerenza col recommended, non il tetto ad area-raggio (che qui non ha
    // senso). Modalità Raggio/CAP: espressione invariata.
    const isOutOfScale = searchMode === "municipality" ? rawRec > 0 && rawFam > rawRec * 1.6 : searchMode !== "cap" && Number(radiusKm) > 0 && rawFam > maxPlausibleRadiusFam || rawRec > 0 && rawFam > rawRec * 1.6;
    const finalFam = isOutOfScale ? Math.round((rawRec || flyerQuantityFromStep1 || 20000) / 1.08) : rawFam;
    const finalPop = isOutOfScale || rawPop > finalFam * 4 ? Math.round(finalFam * 2.3) : rawPop;
    debugStep2Log("[STEP2_FAMILIES_CALC_OUTPUT]", {
      finalFam,
      finalPop,
      wasAdjusted: finalFam !== rawFam
    });
    return {
      families: finalFam,
      pop: finalPop,
      recFlyers: rawRec
    };
  }, [isResidentialStep2, dedupedSelZonesForCalc, radiusKm, searchMode, flyerQuantityFromStep1]);
  const serviceKpis = selZones.length > 0 ? {
    area: selZones.reduce((a, z) => a + (Number(z.area) || 0), 0).toFixed(1),
    hotspotStrength: isMovementStep2 ? h2hMetrics.zones : Math.round(selZones.reduce((a, z) => a + (h2hHotspotStrength(z) || 0), 0) / selZones.length),
    families: isResidentialStep2 ? step2FamiliesCalc.families : 0,
    pop: isResidentialStep2 ? step2FamiliesCalc.pop : 0,
    population: isResidentialStep2 ? step2FamiliesCalc.pop : 0,
    coverage: isResidentialStep2 ? requiredFlyers > 0 ? Math.min(100, Math.round(allocationFlyers / requiredFlyers * 100)) : Math.round(selZones.reduce((a, z) => a + (Number(z.coverage) || 0), 0) / selZones.length) : null,
    recommendedFlyers: isResidentialStep2 ? selZones.reduce((a, z) => a + (Number(z.flyersMin) || 0), 0) : 0,
    selectedComuni: selZones.map(z => z.name),
    intersectedNils,
    selectedNil: selectedNils,
    selectedNils,
    analysisLevel: activeAnalysisLevel,
    comuniCount: selZones.length,
    poi: isMovementStep2 ? h2hMetrics.poi : selZones.reduce((a, z) => a + (Number(z.poi) || 0), 0),
    operationalZones: isMovementStep2 ? h2hMetrics.zones : selZones.length,
    hotspotCount: isMovementStep2 ? h2hMetrics.zones : 0,
    tplStops: isMovementStep2 ? h2hMetrics.tplStops : 0,
    stations: isMovementStep2 ? h2hMetrics.stations : 0,
    metro: isMovementStep2 ? h2hMetrics.metro : 0,
    universities: isMovementStep2 ? h2hMetrics.universities : 0,
    localAttractors: isMovementStep2 ? h2hMetrics.localAttractors : 0,
    gpsWaypoints: operationalWaypoints.length,
    transitStops: isMovementStep2 ? h2hMetrics.transitTotal : selZones.reduce((a, z) => a + (Number(z.transitStops) || 0) + (Number(z.trainStations) || 0), 0),
    flowScore: isMovementStep2 ? h2hMetrics.flowScore : selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.flowScore) || 0), 0) / selZones.length) : 0,
    businesses: isBusinessStep2 ? businessMetrics.businesses : selZones.reduce((a, z) => a + (Number(z.bizTotal) || 0), 0),
    competitors: isBusinessStep2 ? businessMetrics.competitors : selZones.reduce((a, z) => a + (Number(z.competitors) || 0), 0),
    commercialDensity: isBusinessStep2 ? businessMetrics.commercialDensity : selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.commDensB2B) || 0), 0) / selZones.length) : 0,
    clusters: isBusinessStep2 ? businessMetrics.clusters : selZones.reduce((a, z) => a + (Number(z.clusters) || 0), 0),
    targetBusinesses: isBusinessStep2 ? businessMetrics.targetBusinesses : selZones.reduce((a, z) => a + (Number(z.targetBiz) || 0), 0),
    cdIdx: isBusinessStep2 ? businessMetrics.cdIdx : selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.cdIdx) || 0), 0) / selZones.length) : 0,
    familyIndex: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.familyIdx) || 0), 0) / selZones.length) : null,
    reachScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.reachD2D) || 0), 0) / selZones.length) : null,
    roiScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.roiD2D) || 0), 0) / selZones.length) : null,
    confidenceScore: isResidentialStep2 && selZones.length ? Math.round(selZones.reduce((a, z) => a + (Number(z.confD2D) || 0), 0) / selZones.length) : null
  } : {
    area: "0",
    hotspotStrength: isMovementStep2 ? h2hMetrics.zones : 0,
    families: 0,
    pop: 0,
    population: 0,
    coverage: 0,
    recommendedFlyers: 0,
    selectedComuni: [],
    intersectedNils: [],
    selectedNil: [],
    selectedNils: [],
    analysisLevel: activeAnalysisLevel,
    comuniCount: 0,
    poi: isMovementStep2 ? h2hMetrics.poi : 0,
    operationalZones: isMovementStep2 ? h2hMetrics.zones : isBusinessStep2 ? businessMetrics.clusters : 0,
    hotspotCount: isMovementStep2 ? h2hMetrics.zones : 0,
    tplStops: isMovementStep2 ? h2hMetrics.tplStops : 0,
    stations: isMovementStep2 ? h2hMetrics.stations : 0,
    metro: isMovementStep2 ? h2hMetrics.metro : 0,
    universities: isMovementStep2 ? h2hMetrics.universities : 0,
    localAttractors: isMovementStep2 ? h2hMetrics.localAttractors : 0,
    gpsWaypoints: operationalWaypoints.length,
    transitStops: isMovementStep2 ? h2hMetrics.transitTotal : 0,
    flowScore: isMovementStep2 ? h2hMetrics.flowScore : 0,
    businesses: isBusinessStep2 ? businessMetrics.businesses : 0,
    competitors: isBusinessStep2 ? businessMetrics.competitors : 0,
    commercialDensity: isBusinessStep2 ? businessMetrics.commercialDensity : 0,
    clusters: isBusinessStep2 ? businessMetrics.clusters : 0,
    targetBusinesses: isBusinessStep2 ? businessMetrics.targetBusinesses : 0,
    cdIdx: isBusinessStep2 ? businessMetrics.cdIdx : 0,
    familyIndex: null,
    reachScore: null,
    roiScore: null,
    confidenceScore: null
  };
  // Somma su SOLO i comuni realmente selezionati (selZones, già filtrato
  // sui chip scelti manualmente) — non un singolo comune "principale":
  // con 1 comune coincide col totale di quel comune, con N comuni è la
  // somma dei loro totali reali.
  // Box "Copertura stimata": DEVE leggere la stessa fonte primaria del
  // pannello destro/viewModel (serviceKpis.families → step2FamiliesCalc, somma
  // su tutte le zone selezionate), mai un valore ricalcolato a parte o la
  // prima riga (DUOMO/9.589) — quella era la causa esatta del box sbagliato.
  const municipalityTotalFamilies = (() => {
    if (!isResidentialStep2) return null;
    const areaFam = Number(serviceKpis?.families) || 0;
    return areaFam > 0 ? Math.round(areaFam) : null;
  })();
  const municipalityTotalFamiliesLabel = municipalityTotalFamilies != null ? municipalityTotalFamilies.toLocaleString("it-IT", {
    useGrouping: true
  }) : searchMode === "municipality" && selectedComuni.length > 1 ? "Totale territorio non disponibile" : "Totale Comune non disponibile";
  const municipalityTotalFamiliesRowLabel = !isComuneMode ? "Totale stimato area selezionata" : hasUnconfirmedAddressPoint ? "Totale stimato Indirizzo / NIL" : (nilManualMode || isNilAnalysis || areaMode === "custom_zone") && selZones.length < allZones.length ? "Totale stimato NIL selezionate" : selectedComuni.length > 1 ? "Totale territorio selezionato" : "Totale stimato Comune";
  // Rete di sicurezza (§5): una zona accettata in modalità Comune con dati
  // interamente a zero non deve passare per "comune valido" — copre sia il
  // caso residuo di un risultato non-comune sfuggito al filtro tipo (es.
  // quartiere geocodificato con tipo inatteso: zonesInRadius resta VUOTO
  // perché nessun comune ha quel nome — per questo NON si richiede
  // zonesInRadius.length > 0), sia un vero comune ISTAT senza dati.
  const activeComuneZeroData = isComuneMode && isResidentialStep2 && Boolean(city) && !apiLoading && !milanoComuneNilInsufficient && !hasUnconfirmedAddressPoint && Date.now() - municipalitySwitchAtRef.current >= 800 && (Number(serviceKpis?.families) || 0) === 0 && (Number(requiredFlyers) || 0) === 0;
  // Incidenza sul comune (custom_zone/Milano): peso geografico reale delle
  // zone NIL selezionate sul totale del comune — dato secondario, mai
  // mostrato come "copertura" principale (che resta il budget volantini).
  const zoneCoveragePctForBox = isNilAnalysis && selZones.length > 0 ? Math.round(selZones.reduce((a, z) => a + (Number(z.coverage) || 0), 0)) : null;
  const selectedAreaFamiliesLabel = serviceKpis?.families > 0 ? serviceKpis.families.toLocaleString("it-IT", {
    useGrouping: true
  }) : "Dato non disponibile";
  // KPI per il tooltip del confine comune attivo sulla mappa — memoizzato su
  // primitivi per non far ri-renderizzare i layer Leaflet a ogni render React.
  const boundaryKpisForMap = useMemo(() => ({
    families: Number(serviceKpis?.families) || 0,
    coveragePercent: Number(serviceKpis?.coverage) || 0,
    insertedFlyers: Number(flyerQuantityFromStep1) || 0,
    recommendedFlyers: Number(requiredFlyers) || 0
  }), [serviceKpis?.families, serviceKpis?.coverage, flyerQuantityFromStep1, requiredFlyers]);
  const recommendedFlyersValue = Number(requiredFlyers) > 0 ? Math.round(Number(requiredFlyers)) : Number(serviceKpis?.recommendedFlyers) > 0 ? Math.round(Number(serviceKpis.recommendedFlyers)) : null;
  const formattedRecommendedFlyers = recommendedFlyersValue != null ? recommendedFlyersValue.toLocaleString("it-IT", {
    useGrouping: true
  }) : "N.D.";
  useEffect(() => {
    setDismissedAdvisoryRadius(null);
  }, [flyerQuantityFromStep1, city?.id, city?.lat, city?.lng, selectedSearchPoint?.label]);
  const recommendedRadiusForSlider = useMemo(() => {
    if (!isRadiusMode || !S2_RADII || S2_RADII.length === 0) return null;
    const currentRadius = Number(radiusKm) || Number(radius) || 3;
    const currReq = Number(requiredFlyers > 0 ? requiredFlyers : serviceKpis?.recommendedFlyers || 0);
    const currQty = Number(flyerQuantityFromStep1 || allocationFlyers || 0);
    if (currReq <= 0 || currQty <= 0 || !Number.isFinite(currentRadius) || currentRadius <= 0) {
      return currentRadius;
    }
    const idealRadius = currentRadius * Math.sqrt(currQty / currReq);
    return S2_RADII.reduce((closest, option) => Math.abs(option - idealRadius) < Math.abs(closest - idealRadius) ? option : closest);
  }, [isRadiusMode, radiusKm, radius, requiredFlyers, serviceKpis?.recommendedFlyers, flyerQuantityFromStep1, allocationFlyers]);
  const radiusAdvisoryData = useMemo(() => {
    if (!isRadiusMode || !city && selectedComuni.length === 0 && !searchedLocation || apiLoading) return null;
    const currentRadius = Number(radiusKm) || Number(radius) || 3;
    if (!Number.isFinite(currentRadius) || currentRadius <= 0) return null;
    const currReq = Number(requiredFlyers > 0 ? requiredFlyers : serviceKpis?.recommendedFlyers || 0);
    const currQty = Number(flyerQuantityFromStep1 || allocationFlyers || 0);
    const covPct = Number(serviceKpis?.coverage ?? (currReq > 0 ? Math.min(100, Math.round(currQty / currReq * 100)) : 100));
    const status = getCoverageStatus(covPct);
    const recRadius = recommendedRadiusForSlider || currentRadius;
    const isDismissed = dismissedAdvisoryRadius === currentRadius;
    return {
      currentRadius,
      recRadius,
      currReq,
      currQty,
      covPct,
      status,
      isDismissed
    };
  }, [isRadiusMode, city, selectedComuni.length, searchedLocation, apiLoading, radiusKm, radius, requiredFlyers, serviceKpis?.recommendedFlyers, serviceKpis?.coverage, flyerQuantityFromStep1, allocationFlyers, recommendedRadiusForSlider, dismissedAdvisoryRadius]);
  const radiusInsightRows = zonesInRadius.map(z => ({
    id: z.id,
    name: z.name,
    selected: selected.includes(z.id),
    pct: z.pct,
    score: isResidentialStep2 ? residentialStrength(z) : isMovementStep2 ? h2hHotspotStrength(z) : isBusinessStep2 ? businessZoneScore(z) : z.pct,
    detail: isResidentialStep2 ? `${z.families.toLocaleString("it-IT", {
      useGrouping: true
    })} famiglie` : isMovementStep2 ? `${z.poi} POI – ${z.transitStops} fermate` : isBusinessStep2 ? `${z.targetBiz} target – ${z.competitors} competitor` : `${zCap(z).toLocaleString("it-IT", {
      useGrouping: true
    })} volantini`
  }));
  const addBestUnselectedZone = () => {
    const next = radiusInsightRows.find(z => !selected.includes(z.id));
    if (next) setSelected(prev => [...new Set([...prev, next.id])]);
  };
  const zoneSortValue = (zone, sortId) => {
    if (sortId === "coverage") return Number(zone.coverage ?? zone.pct ?? zone.percent_nel_raggio ?? 0);
    if (sortId === "families") return Number(zone.families ?? zone.famiglie ?? 0);
    if (sortId === "assigned") {
      const alloc = zonesAllocation.find(a => a.id === zone.id);
      return Math.max(0, Number(alloc?.assignedFlyers || alloc?.assigned || alloc?.allocated || alloc?.volantini_assegnati || 0));
    }
    return Number(zone.families ?? zone.famiglie ?? zCap(zone) ?? 0);
  };
  const zoneCoverageSortGroup = zone => {
    const alloc = zonesAllocation.find(a => a.id === zone.id);
    const assigned = Math.max(0, Number(alloc?.assignedFlyers || alloc?.assigned || alloc?.allocated || alloc?.volantini_assegnati || 0));
    const required = Math.max(0, Number(alloc?.requiredFlyers || alloc?.needed || alloc?.volantini_necessari || zCap(zone) || 0));
    if (assigned <= 0) return 2;
    if (assigned >= required) return 0;
    return 1;
  };
  const effectiveZonesForResidentialList = useMemo(() => {
    if (selZones.length > 0 && selZones.length !== allZones.length && (hasUnconfirmedAddressPoint || isNilAnalysis || nilManualMode || requestedAnalysisLevel === "nil" || selectedComuni && selectedComuni.length > 1 || areaMode === "custom_zone" || areaMode === "unconfirmed_address")) {
      return selZones;
    }
    return allZones;
  }, [allZones, selZones, hasUnconfirmedAddressPoint, isNilAnalysis, nilManualMode, requestedAnalysisLevel, selectedComuni, areaMode]);
  const sortedResidentialZones = useMemo(() => [...effectiveZonesForResidentialList].sort((a, b) => {
    if (zoneListSort === "relevance") {
      const groupDiff = zoneCoverageSortGroup(a) - zoneCoverageSortGroup(b);
      if (groupDiff) return groupDiff;
    }
    const diff = zoneSortValue(b, zoneListSort) - zoneSortValue(a, zoneListSort);
    return diff || String(a.name || "").localeCompare(String(b.name || ""), "it");
  }), [effectiveZonesForResidentialList, zoneListSort, zonesAllocation]);
  const shouldGroupMarginalZones = isResidentialStep2 && searchMode !== "cap" && sortedResidentialZones.length > GRANDE_CITTA_ZONE_THRESHOLD;
  const relevantResidentialZones = useMemo(() => {
    if (!shouldGroupMarginalZones) return sortedResidentialZones;
    const relevant = sortedResidentialZones.filter(z => isZonaRilevante(z));
    return relevant.length || !sortedResidentialZones.length ? relevant : [sortedResidentialZones[0]];
  }, [shouldGroupMarginalZones, sortedResidentialZones]);
  const relevantResidentialZoneIds = useMemo(() => new Set(relevantResidentialZones.map(z => z.id)), [relevantResidentialZones]);
  const marginalResidentialZones = useMemo(() => shouldGroupMarginalZones ? sortedResidentialZones.filter(z => !relevantResidentialZoneIds.has(z.id)) : [], [shouldGroupMarginalZones, sortedResidentialZones, relevantResidentialZoneIds]);
  const marginalZoneFamilies = marginalResidentialZones.reduce((sum, z) => sum + Number(z.families ?? z.famiglie ?? 0), 0);
  const marginalZoneCoverage = Math.min(100, Math.round(marginalResidentialZones.reduce((sum, z) => sum + Number(z.coverage ?? z.pct ?? z.percent_nel_raggio ?? 0), 0)));
  const zoneRowsForList = useMemo(() => {
    if (isMovementStep2) return h2hMetrics.clusters.map(z => ({
      type: "zone",
      zone: z
    }));
    if (isBusinessStep2 && businessMetrics.clusterRows.length) return businessMetrics.clusterRows.map(z => ({
      type: "zone",
      zone: z
    }));
    const rows = relevantResidentialZones.map(z => ({
      type: "zone",
      zone: z
    }));
    if (marginalResidentialZones.length) {
      rows.push({
        type: "marginal-summary"
      });
      if (showMarginalZones) rows.push(...marginalResidentialZones.map(z => ({
        type: "zone",
        zone: z,
        marginal: true
      })));
    }
    return rows;
  }, [isMovementStep2, isBusinessStep2, h2hMetrics.clusters, businessMetrics.clusterRows, relevantResidentialZones, marginalResidentialZones, showMarginalZones]);
  const zoneListSourceCount = isMovementStep2 ? h2hMetrics.clusters.length : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows.length : sortedResidentialZones.length;
  const primaryCoveredZones = zonesAllocation.filter(z => Number(z.assignedFlyers || 0) > 0).sort((a, b) => Number(b.assignedFlyers || 0) - Number(a.assignedFlyers || 0)).slice(0, 3).map(z => z.name).filter(Boolean);
  const summaryComuniStats = useMemo(() => {
    // Fonte: TUTTE le zone realmente coinvolte (stessa sorgente di
    // zoneListSourceCount), MAI zoneRowsForList — quella esclude le zone
    // "marginali" quando la lista card è collassata/raggruppata (soglia
    // isZonaRilevante), il che faceva mostrare "27 NIL coinvolte" invece
    // delle 37 reali intersecate dal raggio 3km (bug segnalato nel ticket).
    const zoneRows = (isMovementStep2 ? h2hMetrics.clusters : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows : sortedResidentialZones).map(z => ({
      zone: z
    }));
    let coperti = 0;
    let parziali = 0;
    let esclusi = 0;
    zoneRows.forEach(row => {
      const z = row.zone;
      const alloc = zonesAllocation.find(a => a.id === z.id) || {
        requiredFlyers: zCap(z),
        assignedFlyers: 0
      };
      const assigned = Math.max(0, Math.round(Number(alloc.assignedFlyers || alloc.assigned || alloc.allocated || alloc.volantini_assegnati || 0)));
      const required = Math.max(0, Math.round(Number(alloc.requiredFlyers || alloc.needed || alloc.volantini_necessari || zCap(z) || 0)));
      const pct = required > 0 ? assigned / required * 100 : assigned > 0 ? 100 : 0;
      const status = getCoverageStatus(pct);
      if (status === "coperto") coperti++;else if (status === "parziale") parziali++;else esclusi++;
    });
    return {
      total: zoneRows.length,
      coperti,
      parziali,
      esclusi
    };
  }, [isMovementStep2, isBusinessStep2, h2hMetrics.clusters, businessMetrics.clusterRows, sortedResidentialZones, zonesAllocation]);
  const aiAgg = selZones.length > 0 ? {
    pop: selZones.reduce((a, z) => a + (z.pop || 0), 0),
    families: selZones.reduce((a, z) => a + (z.families || 0), 0),
    bizTotal: selZones.reduce((a, z) => a + (z.bizTotal || 0), 0),
    commDensB2B: Math.round(selZones.reduce((a, z) => a + (z.commDensB2B || 0), 0) / selZones.length),
    areaType: selZones.length === 1 ? selZones[0].areaType || "-" : "Mista (" + selZones.length + " zone)",
    poi: selZones.reduce((a, z) => a + (z.poi || 0), 0),
    reddito: Math.round(selZones.reduce((a, z) => a + (z.reddito || 0), 0) / selZones.length),
    densita: Math.round(selZones.reduce((a, z) => a + (z.densita || 0), 0) / selZones.length),
    occup: Math.round(selZones.reduce((a, z) => a + (z.occup || 0), 0) / selZones.length),
    stranieri: Math.round(selZones.reduce((a, z) => a + (z.stranieri || 0), 0) / selZones.length * 10) / 10,
    imprese: selZones.reduce((a, z) => a + (z.imprese || 0), 0),
    indVec: Math.round(selZones.reduce((a, z) => a + (z.indVec || 0), 0) / selZones.length),
    eta14: (() => {
      const v = selZones.map(z => z.eta14).filter(n => n != null);
      return v.length ? Math.round(v.reduce((a, n) => a + n, 0) / v.length * 10) / 10 : null;
    })(),
    eta34: (() => {
      const v = selZones.map(z => z.eta34).filter(n => n != null);
      return v.length ? Math.round(v.reduce((a, n) => a + n, 0) / v.length * 10) / 10 : null;
    })(),
    eta64: (() => {
      const v = selZones.map(z => z.eta64).filter(n => n != null);
      return v.length ? Math.round(v.reduce((a, n) => a + n, 0) / v.length * 10) / 10 : null;
    })(),
    eta65: (() => {
      const v = selZones.map(z => z.eta65).filter(n => n != null);
      return v.length ? Math.round(v.reduce((a, n) => a + n, 0) / v.length * 10) / 10 : null;
    })(),
    genderM: Math.round(selZones.reduce((a, z) => a + (z.genderM || 49), 0) / selZones.length),
    genderF: Math.round(selZones.reduce((a, z) => a + (z.genderF || 51), 0) / selZones.length),
    hotspots: selZones.map(z => z.hotspots).filter(Boolean).join(" – ") || null,
    timeSlots: selZones[0]?.timeSlots || "-",
    strongPts: selZones.reduce((a, z) => a + (z.strongPts || 0), 0),
    flowScore: Math.round(selZones.reduce((a, z) => a + (z.flowScore || 0), 0) / selZones.length),
    commDens: Math.round(selZones.reduce((a, z) => a + (z.commDens || 0), 0) / selZones.length),
    familyIdx: Math.round(selZones.reduce((a, z) => a + (z.familyIdx || 0), 0) / selZones.length),
    reachD2D: Math.round(selZones.reduce((a, z) => a + (z.reachD2D || 0), 0) / selZones.length),
    roiD2D: Math.round(selZones.reduce((a, z) => a + (z.roiD2D || 0), 0) / selZones.length),
    confD2D: Math.round(selZones.reduce((a, z) => a + (z.confD2D || 0), 0) / selZones.length),
    transitStops: selZones.reduce((a, z) => a + (z.transitStops || 0), 0),
    trainStations: selZones.reduce((a, z) => a + (z.trainStations || 0), 0),
    nearbyBiz: selZones.reduce((a, z) => a + (z.nearbyBiz || 0), 0),
    reachH2H: Math.round(selZones.reduce((a, z) => a + (z.reachH2H || 0), 0) / selZones.length),
    roiH2H: Math.round(selZones.reduce((a, z) => a + (z.roiH2H || 0), 0) / selZones.length),
    confH2H: Math.round(selZones.reduce((a, z) => a + (z.confH2H || 0), 0) / selZones.length),
    topCats: selZones[0]?.topCats || "-",
    clusters: selZones.reduce((a, z) => a + (z.clusters || 0), 0),
    targetBiz: selZones.reduce((a, z) => a + (z.targetBiz || 0), 0),
    strongZone: selZones.map(z => z.strongZone).filter(Boolean).join(" – ") || null,
    cdIdx: Math.round(selZones.reduce((a, z) => a + (z.cdIdx || 0), 0) / selZones.length),
    reachB2B: Math.round(selZones.reduce((a, z) => a + (z.reachB2B || 0), 0) / selZones.length),
    roiB2B: Math.round(selZones.reduce((a, z) => a + (z.roiB2B || 0), 0) / selZones.length),
    confB2B: Math.round(selZones.reduce((a, z) => a + (z.confB2B || 0), 0) / selZones.length)
  } : null;
  // Pill button style helper
  const pill = (active, c) => ({
    padding: "6px 14px",
    borderRadius: 100,
    cursor: "pointer",
    fontFamily: F.sans,
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    border: `1px solid ${active ? c : "rgba(255,255,255,.1)"}`,
    background: active ? `${c}18` : "rgba(255,255,255,.04)",
    color: active ? c : "rgba(255,255,255,.48)",
    transition: "all.15s",
    whiteSpace: "nowrap"
  });
  // Riga controllo mappa nel pannello "Vista avanzata" (solo visualizzazione, no KPI).
  const MAP_H_PX = 420;
  const _totalFamiliesInRadius = zonesInRadius.reduce((a, z) => a + (z.families || 0), 0);
  const zonesWithCoords = zonesInRadius.map((z, i) => {
    const coords = getZoneCoords(z, city, i, zonesInRadius.length);
    if (!coords) return null;
    const weightPct = _totalFamiliesInRadius > 0 ? Math.round((z.families || 0) / _totalFamiliesInRadius * 100) : 0;
    const metricRaw = activeLay ? z[activeLay.field] : null;
    const hasMetric = metricRaw != null && !Number.isNaN(Number(metricRaw));
    if (activeLay && !hasMetric) {
      debugStep2Log('[LAYER_DATA_MISSING]', {
        zone: z.name,
        field: activeLay.field,
        value: metricRaw
      });
    }
    return {
      id: z.id,
      name: z.name,
      lat: coords.lat,
      lng: coords.lng,
      territoryLevel: z.territoryLevel,
      isNil: z.isNil,
      families: z.families || 0,
      coverage: z.coverage || 0,
      area: z.area || 1,
      color: getComuneColor(z.id),
      geometry: pickRealComuneGeometry(z),
      weightPct,
      pop: z.pop || 0,
      volantiniNelRaggio: z.volantiniNelRaggio || z.volantini_nel_raggio || z.flyersMin || 0,
      flyersMin: z.flyersMin || 0,
      flyersMax: z.flyersMax || 0,
      metricColor: hasMetric ? zoneColor(z) : null,
      metricLabel: activeLay ? activeLay.label : null,
      metricFmt: hasMetric ? activeLay.fmt(Number(metricRaw)) : null
    };
  }).filter(Boolean);
  if (activeLay && zonesWithCoords.length > 0) {
    debugStep2Log('[LAYER_DATA_LOADED]', {
      layer: activeLay.id,
      label: activeLay.label,
      zones: zonesWithCoords.length,
      hasData: zonesWithCoords.filter(z => z.metricColor).length
    });
  }

  // addressPreviewNilZones calcolato prima di selZones per consentire al calcolo coperture di risolvere direttamente la zona.

  // Territori realmente usati nel calcolo Raggio (comuni o NIL, secondo
  // zonesInRadius/zonesWithCoords) — SOLO dati già calcolati, nessuna nuova
  // formula. Passati a Step2Map come prop dedicata (coveragePolygons) per non
  // confondere il confine comunale (municipalityBoundary, singola area di
  // contesto) con i poligoni multipli realmente coinvolti nel raggio.
  const mapCoverageZones = useMemo(() => {
    if (hasUnconfirmedAddressPoint && addressPreviewNilZones && Array.isArray(addressPreviewNilZones.all) && addressPreviewNilZones.all.length > 0) {
      return addressPreviewNilZones.all.map(z => ({
        id: z.id,
        name: z.name,
        type: 'nil',
        status: z === addressPreviewNilZones.main || addressPreviewNilZones.containingCandidates?.some(c => c === z) ? 'preview_main' : 'preview_nearby',
        geometry: pickRealComuneGeometry(z) || null,
        lat: z.lat,
        lng: z.lng,
        families: z.families || 0,
        assignedFlyers: 0,
        recommendedFlyers: 0,
        coveragePct: 0
      }));
    }
    if (!isRadiusMode) return [];
    return zonesWithCoords.map(z => {
      const alloc = zoneAllocationById?.[z.id] || null;
      return {
        id: z.id,
        name: z.name,
        type: z.isNil || z.territoryLevel === 'nil' ? 'nil' : 'municipality',
        status: zoneCoverageById?.[z.id] || 'non_coperto',
        geometry: z.geometry || null,
        lat: z.lat,
        lng: z.lng,
        families: z.families || 0,
        assignedFlyers: alloc?.assignedFlyers || 0,
        recommendedFlyers: alloc?.requiredFlyers || z.volantiniNelRaggio || 0,
        coveragePct: alloc?.coveragePercent || 0
      };
    });
  }, [isRadiusMode, zonesWithCoords, zoneAllocationById, zoneCoverageById]);
  if (isStep2DebugEnabled() && isRadiusMode) {
    console.log('[STEP2_RADIUS_POLYGONS_DEBUG]', {
      activeAreaTab,
      areaMode,
      radiusKm,
      radiusCenterSource,
      zonesInRadiusLength: zonesInRadius?.length ?? 0,
      mapCoverageZonesLength: mapCoverageZones?.length ?? 0,
      polygonsWithGeometry: mapCoverageZones.filter(z => z.geometry).length,
      polygonsMissingGeometry: mapCoverageZones.filter(z => !z.geometry).map(z => z.name),
      renderedLayerMode: mapCoverageZones.length > 0 ? 'radius_coverage_polygons' : 'radius_circle_only'
    });
  }
  const targetTotal = serviceKpis ? isResidentialStep2 ? serviceKpis.families : isMovementStep2 ? serviceKpis.poi : serviceKpis.businesses : 0;
  const mainTargetLabel = isResidentialStep2 ? "Famiglie stim." : isMovementStep2 ? "POI rilevanti" : "Attività tot.";
  const hasAtLeastOne = totalAssigned > 0 || selZones.length > 0;
  const flyerSurplus = remainingFlyers;
  const missingFlyers = isResidentialStep2 && doorCoverage ? doorCoverage.missingFlyers : Math.max(0, requiredFlyers - flyerQuantityFromStep1);
  if (import.meta.env.DEV && isResidentialStep2 && doorCoverage) {
    const _legacyMissing = Math.max(0, requiredFlyers - flyerQuantityFromStep1);
    if (_legacyMissing !== doorCoverage.missingFlyers) {
      console.warn("[Phase5] missingFlyers divergence", {
        canonical: doorCoverage.missingFlyers,
        legacy: _legacyMissing
      });
    }
  }
  const firstZ = selZones[0] || null;
  const cfg = serviceMeta;
  const d2dKpiZone = selZones.length > 0 ? {
    ...selZones[0],
    families: selZones.reduce((a, z) => a + (z.families || 0), 0),
    pop: selZones.reduce((a, z) => a + (z.pop || 0), 0),
    area: parseFloat(serviceKpis.area || 0),
    coverage: serviceKpis.coverage,
    flyersMin: serviceKpis.recommendedFlyers,
    flyersMax: selZones.reduce((a, z) => a + (z.flyersMax || 0), 0),
    operDays: selZones.reduce((a, z) => a + (z.operDays || 0), 0)
  } : null;
  const safeMainKpis = (meta, zone) => {
    try {
      return zone && meta?.mainKpis ? meta.mainKpis(zone) : [];
    } catch {
      return [];
    }
  };
  const h2hPassageDensity = selZones.length ? Math.round(selZones.reduce((sum, zone) => sum + (Number(zone.commDens) || 0), 0) / selZones.length) : 0;
  // Use the same live POI/GTFS aggregate in the map, summary and report.
  // Territorial fallback rows may contain older synthetic H2H values.
  const h2hKpiZone = isMovementStep2 ? {
    ...(selZones[0] || firstZ || {}),
    poi: Number(serviceKpis?.poi || 0),
    nearbyBiz: Number(serviceKpis?.localAttractors || 0),
    commDens: h2hPassageDensity,
    flowScore: Number(serviceKpis?.flowScore || 0),
    transitStops: Number(serviceKpis?.tplStops || 0),
    trainStations: Number(serviceKpis?.stations || 0),
    strongPts: Number(serviceKpis?.hotspotCount || 0),
    operDaysH2H: selZones.reduce((a, z) => a + (z.operDaysH2H || 2), 0) || firstZ?.operDaysH2H || 2
  } : firstZ;
  const b2bKpiZone = selZones.length > 0 ? {
    ...selZones[0],
    ...(aiAgg || {}),
    bizTotal: selZones.reduce((a, z) => a + (z.bizTotal || 0), 0) || aiAgg?.bizTotal || firstZ?.bizTotal || 0,
    competitors: serviceKpis?.competitors ?? null,
    commDensB2B: aiAgg?.commDensB2B || firstZ?.commDensB2B || 0,
    reddito: aiAgg?.reddito || firstZ?.reddito || 0,
    cdIdx: aiAgg?.cdIdx || firstZ?.cdIdx || 0,
    operDaysB2B: selZones.reduce((a, z) => a + (z.operDaysB2B || 2), 0) || firstZ?.operDaysB2B || 2
  } : firstZ;
  const residentialMainOutputs = d2dKpiZone ? safeMainKpis(SERVICE_META.d2d, d2dKpiZone).map(k => {
    if (k.l === "Comuni nel raggio") return {
      ...k,
      l: isComuneMode ? territoryPluralLabel : k.l,
      v: String(zonesInRadius.length)
    };
    if (k.l === "Superficie coperta") return {
      ...k,
      v: formatAreaIT(d2dKpiZone.area),
      u: ""
    };
    if (k.l === "Range operativo") return {
      ...k,
      v: `${formatIntegerIT(d2dKpiZone.flyersMin)} – ${formatIntegerIT(d2dKpiZone.flyersMax)}`,
      u: "pz."
    };
    return k;
  }).filter(k => k.l !== "Giorni operativi") : [];
  const h2hMainOutputs = isMovementStep2 && (h2hKpiZone || firstZ) ? safeMainKpis(SERVICE_META.h2h, h2hKpiZone || firstZ).filter(k => k.l !== "Giorni operativi") : [];
  const businessMainOutputs = isBusinessStep2 && (b2bKpiZone || firstZ) ? safeMainKpis(SERVICE_META.b2b, b2bKpiZone || firstZ).filter(k => k.l !== "Giorni operativi") : [];
  const serviceOutputRows = firstZ ? safeMainKpis(serviceMeta, firstZ) : [];
  const residentialMainOutputsNormalized = residentialMainOutputs.map(k => k.l === "Comuni nel raggio" || k.l === territoryPluralLabel ? {
    ...k,
    l: isComuneMode ? territoryPluralLabel : `${territoryPluralLabel} nel raggio`,
    v: String(zonesInRadius.length)
  } : k);
  const residentialScores = aiAgg ? SERVICE_META.d2d.advKpis(aiAgg) : [];
  const h2hScores = aiAgg ? SERVICE_META.h2h.advKpis(aiAgg) : [];
  const businessScores = aiAgg ? SERVICE_META.b2b.advKpis(aiAgg) : [];
  const baseScoreRows = isResidentialStep2 ? residentialScores : isMovementStep2 ? [{
    l: "Hotspot Score",
    v: aiAgg?.reachH2H,
    c: "#22C55E"
  }, {
    l: kpiLabel("reachScore"),
    v: aiAgg?.reachH2H,
    c: C.blue
  }, {
    l: kpiLabel("roiScore"),
    v: aiAgg?.roiH2H,
    c: C.green
  }, {
    l: kpiLabel("confidence"),
    v: aiAgg?.confH2H,
    c: C.purple
  }] : isBusinessStep2 ? [{
    l: "Cluster Score",
    v: aiAgg?.cdIdx,
    c: "#22C55E"
  }, {
    l: kpiLabel("reachScore"),
    v: aiAgg?.reachB2B,
    c: C.blue
  }, {
    l: kpiLabel("roiScore"),
    v: aiAgg?.roiB2B,
    c: C.green
  }, {
    l: kpiLabel("confidence"),
    v: aiAgg?.confB2B,
    c: C.purple
  }] : [];
  const advancedScoreRows = [...baseScoreRows, ...(isResidentialStep2 ? [{
    l: "Densità media",
    v: serviceKpis.area && serviceKpis.population ? Math.round(serviceKpis.population / Number(serviceKpis.area)) : null,
    c: C.blue
  }, {
    l: "Indice vecchiaia",
    v: aiAgg?.indVec,
    c: C.yellow
  }, {
    l: "Occupazione",
    v: aiAgg?.occup,
    c: C.green
  }, {
    l: "Stranieri",
    v: aiAgg?.stranieri,
    c: C.teal
  }] : []), ...(isMovementStep2 ? [{
    l: "Foot Traffic",
    v: serviceKpis.flowScore,
    c: C.blue
  }, {
    l: "Hotspot Strength",
    v: serviceKpis.hotspotStrength,
    c: C.green
  }, {
    l: "Transit Index",
    v: serviceKpis.transitStops,
    c: C.purple
  }, {
    l: "Attrattori locali",
    v: serviceKpis.nearbyBiz,
    c: "#22C55E"
  }] : []), ...(isBusinessStep2 ? [{
    l: "Competition Index",
    v: serviceKpis.competitors,
    c: C.red
  }, {
    l: "Commercial Density",
    v: serviceKpis.cdIdx,
    c: C.purple
  }, {
    l: "Cluster Strength",
    v: serviceKpis.clusters,
    c: C.blue
  }, {
    l: "Target Businesses",
    v: serviceKpis.targetBusinesses,
    c: C.green
  }] : [])];
  const residentialRadiusRows = residentialRows(zonesInRadius);
  const businessCategorySummary = isBusinessStep2 && targetBusinessMeta ? businessMetrics.categories.length ? businessMetrics.categories : bizCategoryChart(selZones, targetBusinessMeta) : [];
  const businessClusterSummary = isBusinessStep2 && targetBusinessMeta ? businessMetrics.clusterRows.length ? businessMetrics.clusterRows : businessRows(selZones, targetBusinessMeta) : [];
  const h2hAttractionSummary = isMovementStep2 ? [{
    label: "POI rilevanti",
    value: h2hMetrics.poi,
    color: "#3B82F6"
  }, {
    label: "Fermate TPL",
    value: h2hMetrics.tplStops,
    color: "#10B981"
  }, {
    label: "Metro",
    value: h2hMetrics.metro,
    color: "#8B5CF6"
  }, {
    label: "Attrattori locali",
    value: h2hMetrics.localAttractors,
    color: "#F59E0B"
  }] : [];
  const h2hHotspotSummary = isMovementStep2 ? h2hMetrics.clusters.slice(0, 6) : [];
  const businessRadiusRows = isBusinessStep2 && targetBusinessMeta ? businessRows(zonesInRadius, targetBusinessMeta).map(row => ({
    ...row,
    competitors: serviceKpis?.competitors ?? null
  })) : [];
  const h2hHotspotRadiusRows = isMovementStep2 ? h2hHotspotRows(zonesInRadius) : [];
  const campaignZones = data.campaignZones || [];
  const totalCampaignFlyers = campaignZones.reduce((sum, z) => sum + Number(z.assigned_flyers || 0), 0);
  const totalCampaignBudget = campaignZones.reduce((sum, z) => sum + Number(z.assigned_budget || 0), 0);
  const uniqueCampaignComuni = new Set(campaignZones.reduce((acc, z) => {
    if (z.selected) acc.push(...z.selected);
    return acc;
  }, [])).size;
  const activeCampaignZone = useMemo(() => campaignZones.find(z => z.id === data.activeZoneId) || campaignZones[0] || null, [campaignZones, data.activeZoneId]);
  const zoneDensity = serviceKpis.area && serviceKpis.population ? Math.round(serviceKpis.population / Number(serviceKpis.area)) : 0;
  const operationalCoveragePercent = requiredFlyers > 0 ? Math.min(100, Math.round(finalFlyersRounded / requiredFlyers * 100)) : 0;
  const serviceScoreInput = isMovementStep2 ? {
    flowScore: serviceKpis.flowScore,
    commDens: h2hPassageDensity,
    transitStops: serviceKpis.transitStops,
    strongPts: serviceKpis.hotspotCount,
    poi: serviceKpis.poi
  } : isBusinessStep2 ? {
    commDensB2B: serviceKpis.commercialDensity,
    reachB2B: serviceKpis.cdIdx,
    roiB2B: serviceKpis.cdIdx,
    targetBiz: serviceKpis.targetBusinesses,
    bizTotal: serviceKpis.businesses,
    clusters: serviceKpis.clusters
  } : null;
  const serviceScore = isMovementStep2 ? h2hHotspotStrength(serviceScoreInput) : isBusinessStep2 ? businessZoneScore(serviceScoreInput) : null;
  const serviceScoreComponents = isMovementStep2 ? ["Flusso potenziale", "Densità di passaggio", "Trasporto pubblico", "Hotspot operativi", "POI rilevanti"] : ["Densità commerciale", "Reach business", "ROI business", "Attività target", "Cluster commerciali"];
  const zoneVerdict = isResidentialStep2 ? getZoneVerdict({
    families: serviceKpis.families,
    density: zoneDensity,
    coverage: serviceKpis.coverage || 0,
    comuniCount: zonesInRadius.length
  }) : {
    score: serviceScore,
    classification: serviceScore >= 78 ? "high" : serviceScore >= 58 ? "medium" : "low",
    components: serviceScoreComponents.map(name => ({
      name
    }))
  };
  const operationalEstimate = estimateOperationalDays(finalFlyersRounded, D2D_DAILY_CAPACITY);
  const operationalAdvice = buildOperationalAdvice({
    score: zoneVerdict.score,
    coverage: isResidentialStep2 ? doorCoverage?.coveragePercent ?? serviceKpis.coverage ?? 0 : operationalCoveragePercent,
    assignedQuantity: finalFlyersRounded,
    recommendedQuantity: requiredFlyers,
    density: zoneDensity || null,
    territoryCount: zonesInRadius.length,
    hasPartialTerritorialData: selZones.some(zone => zone?.isFallback)
  });
  const zoneHumanTitle = city?.label || city?.name || activeCampaignZone?.cityName || search || "Zona selezionata";
  const resolveCampaignZoneCity = useCallback(zone => zone?.city || resolveStep2City(zone?.cityName || zone?.zone_label) || null, []);
  const getCampaignZoneLabel = useCallback((zone, index) => {
    const isZUnconfirmed = zone?.searchMode === "municipality" && !zone?.addressFullCoverageConfirmed && !zone?.nilManualMode && !zone?.addressSearchError && zone?.selectedSearchPoint?.type === "address";
    if (isZUnconfirmed) {
      return `Zona ${index + 1} · Modalità da scegliere`;
    }
    const zoneMunicipalities = Array.isArray(zone?.selectedMunicipalities) && zone.selectedMunicipalities.length ? zone.selectedMunicipalities : Array.isArray(zone?.selectedComuni) ? zone.selectedComuni : [];
    const municipalityNames = zoneMunicipalities.map(item => typeof item === "string" ? item : item?.label || item?.name || item?.comune_name || item?.municipality_name || "").filter(Boolean);
    if (zone?.searchMode === "municipality" && municipalityNames.length > 1) {
      return `Zona ${index + 1} · ${municipalityNames.length} comuni completi`;
    }
    const cityLabel = zone?.cityName || zone?.city?.name || zone?.city?.label || "";
    if (cityLabel) return `Zona ${index + 1} · ${cityLabel}`;
    return zone?.zone_label || `Zona ${index + 1}`;
  }, []);
  const selectCampaignZone = useCallback(zoneId => {
    const zone = campaignZones.find(z => z.id === zoneId);
    if (!zone) return;
    const resolvedCity = resolveCampaignZoneCity(zone);
    const zSvc = zone.service_type || svcType;
    setData(prev => ({
      ...prev,
      activeZoneId: zone.id,
      selectedService: zSvc,
      activeService: zSvc,
      type: zSvc,
      flyerFormat: zone.service_variant || prev.flyerFormat || "a5",
      qty: zone.assigned_flyers || prev.qty || 10000,
      flyerQuantity: zone.assigned_flyers || prev.qty || 10000,
      flyerQuantityFromStep1: zone.assigned_flyers || prev.qty || 10000,
      cityName: zone.cityName || resolvedCity?.name || "",
      city: resolvedCity,
      radius: zone.radiusKm || zone.radius || 3,
      radiusKm: zone.radiusKm || zone.radius || 3,
      selectedRadius: zone.radiusKm || zone.radius || 3,
      zones: zone.selected || [],
      selectedCaps: zone.selectedCaps || [],
      capDataMap: zone.capDataMap || {},
      manualAssignments: zone.manualAssignments || {},
      allocationMode: zone.allocationMode || "auto",
      coverageDecision: normalizeCoverageDecision(zone.coverageDecision),
      availableFlyers: Number(zone.availableFlyers || zone.assigned_flyers || prev.availableFlyers || prev.qty || 10000),
      manualFlyers: Number(zone.manualFlyers || 0) || null,
      finalFlyers: Number(zone.finalFlyers || zone.assigned_flyers || prev.qty || 10000),
      searchMode: zone.searchMode || "municipality"
    }));
  }, [campaignZones, resolveCampaignZoneCity, setData, svcType]);
  const gisSkeleton = (width = 54) => <span aria-hidden="true" style={{
    display: "inline-block",
    width,
    height: 11,
    borderRadius: 999,
    background: "linear-gradient(90deg, rgba(255,255,255,.08), rgba(255,255,255,.18), rgba(255,255,255,.08))",
    boxShadow: "0 0 18px rgba(255,255,255,.04)"
  }} />;
  const gisKpi = (value, width) => gisLoading ? gisSkeleton(width) : value;
  const isMultiMunicipalitySelection = searchMode === "municipality" && areaMode === "full_municipality" && selectedMunicipalityItems.length > 1;
  const hasConfirmedZoneForActiveSelection = searchMode === "cap" ? selectedCaps.length > 0 : searchMode === "municipality" ? Boolean(city || selectedMunicipalityItems.length > 0) : Boolean(city && (selectedComuni.length > 0 || selectedComune));
  const hasConfirmedCoverageMode = areaMode === "radius" ? radiusSelectionConfirmed : areaMode === "custom_zone" ? selected.length > 0 || selZones.length > 0 : areaMode === "cap" ? selectedCaps.length > 0 : usingMunicipalityFullCoverage;
  const hasValidCoverageGeometry = areaMode === "radius" ? Boolean(radiusSelectionConfirmed && radiusCenter && Number.isFinite(Number(radiusCenter.lat)) && Number.isFinite(Number(radiusCenter.lng)) && Number(radiusKm) > 0) : areaMode === "custom_zone" ? selZones.some(z => z.geometry || z.geometry_geojson || pickRealComuneGeometry(z)) : areaMode === "cap" ? selectedCaps.length > 0 : Boolean(municipalityBoundary || selZones.some(z => z.geometry || z.geometry_geojson || pickRealComuneGeometry(z)));
  const isCoverageCalculationComplete = hasConfirmedCoverageMode && !gisLoading && !apiLoading && !gisTimedOut;
  const hasCoverageCalculationError = Boolean(apiError || activeComuneZeroData || milanoComuneNilInsufficient || addressSearchError);
  const primaryReachForGeometry = isResidentialStep2 ? Number(serviceKpis?.families || 0) : isMovementStep2 ? Number(serviceKpis?.poi || 0) : Number(serviceKpis?.businesses || 0);
  const isRadiusGeometryValid = areaMode !== "radius" || Boolean(radiusSelectionConfirmed && radiusCenter && Number.isFinite(Number(radiusCenter.lat)) && Number.isFinite(Number(radiusCenter.lng)) && Number(radiusKm) > 0 && hasValidCoverageGeometry && isCoverageCalculationComplete && primaryReachForGeometry > 0 && Number(requiredFlyers || 0) > 0 && !hasCoverageCalculationError);
  const step2ZonesReady = (data.campaignZones || []).length > 0 && (data.campaignZones || []).every(z => {
    if (z.id === data.activeZoneId) {
      const activeTerritoryReady = searchMode === "cap" ? selectedCaps.length > 0 : Boolean(city);
      return activeTerritoryReady && (isBusinessStep2 ? selectedOperationalPois.length > 0 : finalFlyersRounded > 0);
    }
    const savedTerritoryReady = z.searchMode === "cap" ? Boolean(z.selectedCaps?.length) : Boolean(z.city);
    return savedTerritoryReady && (isBusinessStep2 ? selectedOperationalPois.length > 0 : Number(z.assigned_flyers || z.finalFlyers || 0) > 0);
  });
  const isAvailableQuantityPartial = Number(availableFlyers) > 0 && Number(requiredFlyers) > 0 && Number(availableFlyers) < Number(requiredFlyers);
  const coverageDecisionRequired = isAvailableQuantityPartial && !isMultiMunicipalitySelection;
  const coverageDecisionReady = !coverageDecisionRequired || isCoverageDecisionValid;
  const canonicalOmiRows = omiInfo?.available && Array.isArray(omiInfo?.values) ? omiInfo.values.filter(row => row?.typology && (row.min_value != null || row.max_value != null)) : [];
  const demographicReference = effectiveDemoData?.referenceYear ?? effectiveDemoData?.reference_year ?? null;
  const omiReference = canonicalOmiRows.find(row => row?.reference_period || row?.reference_year || row?.semester);
  const canonicalSourceRegistry = [{
    name: "Popolazione e famiglie residenti",
    source: effectiveDemoData?.source || "ISTAT / demographic_indicators",
    level: "Comune",
    year: demographicReference || "Non restituito",
    kind: "Dato ufficiale aggregato",
    method: "Lettura del record comunale più recente restituito dal dataset",
    reliability: effectiveDemoData ? "Alta" : "Non valutabile",
    limitation: "Non descrive il singolo NIL, civico o edificio.",
    connected: Boolean(effectiveDemoData)
  }, {
    name: "Famiglie/cassette distributibili",
    source: "Modello operativo VolantiniPro",
    level: isNilAnalysis ? "NIL/zona selezionata" : "Area selezionata",
    year: "Non applicabile",
    kind: "Stima interna",
    method: "Somma dei fabbisogni delle zone selezionate",
    reliability: requiredFlyers > 0 ? "Media" : "Non valutabile",
    limitation: "Stima operativa, non censimento di cassette postali.",
    connected: requiredFlyers > 0
  }, {
    name: "Edifici e destinazione d'uso",
    source: "Nessun dataset collegato",
    level: "—",
    year: "—",
    kind: "Non disponibile",
    method: "Nessun calcolo eseguito",
    reliability: "Non valutabile",
    limitation: "Non sono supportate affermazioni su condomini, villette, uffici o capannoni.",
    connected: false
  }, {
    name: "Quotazioni immobiliari OMI",
    source: "Agenzia delle Entrate — OMI",
    level: "Zona OMI",
    year: omiReference?.reference_period || omiReference?.reference_year || omiReference?.semester || "Non restituito",
    kind: "Dato ufficiale aggregato",
    method: "Valori distinti per ciascuna zona e tipologia restituita",
    reliability: canonicalOmiRows.length ? "Alta" : "Non valutabile",
    limitation: "Una zona OMI non rappresenta automaticamente l'intero comune.",
    connected: canonicalOmiRows.length > 0
  }, {
    name: "POI",
    source: "OpenStreetMap / Overpass",
    level: "Raggio/area interrogata",
    year: "Non restituito",
    kind: "Community data",
    method: "Conteggio dei POI restituiti dalla query corrente",
    reliability: pois.length > 0 ? "Media" : "Non valutabile",
    limitation: "I POI indicano attrazione potenziale, non flussi pedonali misurati.",
    connected: (isMovementStep2 || isBusinessStep2) && pois.length > 0
  }, {
    name: "Fermate e linee TPL",
    source: transportState?.sources?.length ? `GTFS programmato — ${transportState.sources.join(", ")}` : "Nessun feed GTFS restituito",
    level: "Raggio/area interrogata",
    year: "Non restituito",
    kind: "Orario programmato",
    method: "Fermate e linee restituite dal dataset GTFS configurato",
    reliability: transportState?.available ? "Alta" : "Non valutabile",
    limitation: "Non è un feed real-time e non misura presenze o ritardi.",
    connected: isMovementStep2 && Boolean(transportState?.available)
  }, {
    name: "Attività e aree produttive",
    source: isBusinessStep2 && pois.length > 0 ? "OpenStreetMap / Overpass (tag POI)" : "Nessun censimento imprese/ATECO collegato",
    level: "Raggio/area interrogata",
    year: "Non restituito",
    kind: isBusinessStep2 && pois.length > 0 ? "Stima da POI" : "Non disponibile",
    method: isBusinessStep2 && pois.length > 0 ? "Conteggio tag commerciali restituiti" : "Nessun calcolo eseguito",
    reliability: isBusinessStep2 && pois.length > 0 ? "Bassa" : "Non valutabile",
    limitation: "Non è un censimento ATECO e non identifica in modo completo uffici, aree industriali o punti di consegna.",
    connected: isBusinessStep2 && pois.length > 0
  }, {
    name: "Score operativo",
    source: "Algoritmo interno VolantiniPro",
    level: "Configurazione corrente",
    year: "Non applicabile",
    kind: "Indicatore interno",
    method: "Somma pesata di componenti esplicitate nella sezione Score",
    reliability: Number.isFinite(Number(zoneVerdict?.score)) ? "Media" : "Non valutabile",
    limitation: "Non è un dato ufficiale né una previsione certa di risultato.",
    connected: Number.isFinite(Number(zoneVerdict?.score))
  }];
  const canonicalCityName = isRadiusMode && hasSearchPoint && selectedSearchPoint?.label ? selectedSearchPoint.label.trim() : isMultiMunicipalitySelection ? selectedMunicipalityDisplayLabel : city?.label || city?.name || selectedComuni?.[0]?.label || selectedComuni?.[0]?.name || selZones?.[0]?.name || activeCampaignZone?.cityName || null;
  const canonicalTerritoryLabel = areaMode === "radius" ? `Raggio ${radiusKm || radius} km${canonicalCityName ? ` da ${canonicalCityName}` : ""}` : areaMode === "custom_zone" ? canonicalCityName ? `${canonicalCityName} - ${selZones.map(zone => zone.name).filter(Boolean).join(", ")}` : "NIL / quartiere" : areaMode === "cap" ? "CAP selezionati" : isMultiMunicipalitySelection ? selectedMunicipalityDisplayLabel : canonicalCityName ? `${canonicalCityName} · comune completo` : "Comune completo";
  const canonicalCoverageContext = areaMode === "radius" ? "fabbisogno operativo del raggio" : areaMode === "full_municipality" && !isMultiMunicipalitySelection ? "fabbisogno operativo del Comune" : "fabbisogno operativo delle zone selezionate";
  const canonicalAllocationRows = isResidentialStep2 ? zonesAllocation : isMovementStep2 ? selectedOperationalPois.length > 0 ? selectedOperationalPois.map((point, index) => {
    const sameOperatorPoints = selectedOperationalPois.filter(item => item.operatorNumber === point.operatorNumber).length || 1;
    const assignedQuantity = Math.round(Math.max(1, Number(point.serviceDurationHours || serviceDurationForStep2)) * H2H_FLYERS_PER_PROMOTER_HOUR / sameOperatorPoints);
    return {
      ...point,
      id: point.id,
      name: `Promoter ${point.operatorNumber} · ${point.name}`,
      priorityRank: index + 1,
      requiredQuantity: assignedQuantity,
      assignedQuantity
    };
  }) : step1OperationalPoints.map((point, index) => ({
    ...point,
    id: point.id || `promoter_${index + 1}`,
    name: `Promoter ${point.promoterNumber || index + 1} · ${point.label || point.location || "Punto operativo"}`,
    priorityRank: point.promoterNumber || index + 1,
    requiredQuantity: Number.isFinite(Number(point.assignedQuantity)) ? Number(point.assignedQuantity) : null,
    assignedQuantity: Number.isFinite(Number(point.assignedQuantity)) ? Number(point.assignedQuantity) : null
  })) : (businessMaterialPlan?.rows || []).map((activity, index) => ({
    ...activity,
    id: activity.id || `activity_${index + 1}`,
    name: activity.name || activity.label || `Attività ${index + 1}`,
    priorityRank: index + 1,
    requiredQuantity: activity.copies,
    assignedQuantity: activity.copies
  }));
  const canonicalServiceData = {
    available: isResidentialStep2 ? Number(serviceKpis?.families) > 0 : isMovementStep2 ? canonicalAllocationRows.length > 0 : selectedOperationalPois.length > 0,
    kpis: {
      ...serviceKpis,
      coverage: operationalCoveragePercent,
      recommendedFlyers: requiredFlyers,
      operatorCount: isBusinessStep2 ? businessOperationalPlan?.recommendedOperators ?? null : isMovementStep2 ? operatorCountForPoiAssignment : null,
      selectedPointCount: selectedOperationalPois.length,
      selectedOperationalPois,
      poiAssignments,
      distributionTargets: distributionTargetSelection,
      operationalPoints: isMovementStep2 ? step1OperationalPoints : [],
      operatorSchedules: isMovementStep2 ? operatorSchedules : [],
      businessMaterialPlan: isBusinessStep2 ? businessMaterialPlan : null,
      businessOperationalPlan: isBusinessStep2 ? businessOperationalPlan : null,
      materialsRequired: isBusinessStep2 ? businessMaterialPlan?.materialsRequired ?? null : null,
      materialsRemaining: isBusinessStep2 ? businessMaterialPlan?.materialsRemaining ?? null : null,
      materialsMissing: isBusinessStep2 ? businessMaterialPlan?.materialsMissing ?? null : null
    },
    operationalPoints: isMovementStep2 ? step1OperationalPoints : [],
    operatorSchedules: isMovementStep2 ? operatorSchedules : [],
    selectedPois: isMovementStep2 ? selectedOperationalPois : [],
    materialPlan: isBusinessStep2 ? businessMaterialPlan : null,
    operationalPlan: isBusinessStep2 ? businessOperationalPlan : null,
    competitorCount: isBusinessStep2 ? serviceKpis?.competitors ?? null : null
  };
  const step2TruthModel = buildStep2TruthModel({
    rawData: {
      territorialAnalysis: apiData || null,
      demographics: effectiveDemoData || null,
      omi: canonicalOmiRows,
      pois: isMovementStep2 || isBusinessStep2 ? pois : [],
      transport: isMovementStep2 ? transportState : null
    },
    userSelections: {
      areaMode,
      searchMode,
      radiusKm: radiusKm || radius || null,
      coverageDecision: coverageDecision || "keepCurrent",
      manualFlyers: coverageDecision === "manual" ? manualFlyersNumber : null,
      selectedMunicipalities: selectedMunicipalitySummary,
      selectedNils,
      selectedCaps,
      selectedPoiIds: selectedOperationalPois.map(point => point.id)
    },
    availability: {
      territorialData: hasUsableAllocationData,
      demographics: Boolean(effectiveDemoData),
      economy: canonicalOmiRows.length > 0,
      mobility: isMovementStep2 && Boolean(pois.length > 0 || transportState?.available),
      business: isBusinessStep2 && selectedOperationalPois.length > 0,
      nil: isResidentialStep2 && selectedNils.length > 0,
      pois: (isMovementStep2 || isBusinessStep2) && pois.length > 0
    },
    sourceMetadata: canonicalSourceRegistry,
    territory: {
      label: canonicalTerritoryLabel,
      modeLabel: canonicalCoverageContext,
      areaMode
    },
    territories: selectedMunicipalitySummary,
    service: {
      key: isResidentialStep2 ? "d2d" : isMovementStep2 ? "h2h" : "b2b",
      title: isResidentialStep2 ? "Door to Door" : isMovementStep2 ? "Hand to Hand" : "Distribuzione presso attività e aziende"
    },
    serviceData: canonicalServiceData,
    insertedQuantity: Number.isFinite(Number(flyerQuantityFromStep1)) ? Number(flyerQuantityFromStep1) : null,
    currentQuantity: Number.isFinite(Number(finalFlyers)) ? Number(finalFlyers) : null,
    baseRequirement: isResidentialStep2 ? Number.isFinite(Number(serviceKpis?.families)) ? Number(serviceKpis.families) : null : requiredFlyers,
    recommendedRequirement: requiredFlyers,
    allocation: canonicalAllocationRows,
    zones: selZones,
    nils: selectedNils,
    pois: isMovementStep2 ? selectedOperationalPois : [],
    activities: isBusinessStep2 ? selectedOperationalPois : [],
    availableZoneCount: isResidentialStep2 ? availableNils.length || summaryComuniStats?.total || canonicalAllocationRows.length || null : canonicalAllocationRows.length || null,
    dailyCapacity: isResidentialStep2 ? D2D_DAILY_CAPACITY : null,
    operatorCount: isBusinessStep2 ? businessOperationalPlan?.recommendedOperators ?? null : null,
    operatorDays: isBusinessStep2 ? businessOperationalPlan?.operatorDays ?? null : null,
    calendarDays: isBusinessStep2 ? businessOperationalPlan?.calendarDuration ?? null : null,
    calculationStatus: isCoverageCalculationComplete && !hasCoverageCalculationError && hasUsableAllocationData && requiredFlyers != null ? "ready" : "unavailable",
    unavailableReason: !hasUsableAllocationData ? "Dati territoriali o selezione operativa non disponibili." : hasCoverageCalculationError ? "Calcolo territoriale non disponibile." : null,
    score: zoneVerdict?.score,
    confidenceInputs: {
      coverage: {
        available: requiredFlyers > 0 && zonesAllocation.length > 0 ? 3 : 0,
        total: 3,
        limitation: requiredFlyers > 0 ? null : "Fabbisogno o allocazione non disponibili."
      },
      demographics: {
        available: effectiveDemoData ? 1 : 0,
        total: 1
      },
      buildings: {
        available: 0,
        total: 1,
        limitation: "Dataset edifici e DUSAF non collegati."
      },
      economy: {
        available: canonicalOmiRows.length > 0 ? 1 : 0,
        total: 2,
        limitation: "La copertura economica dipende dai dati OMI effettivamente restituiti; reddito e OMI hanno livelli distinti."
      },
      mobility: {
        available: (pois.length > 0 ? 1 : 0) + (transportState?.available ? 1 : 0),
        total: 2,
        limitation: "POI e GTFS programmato non equivalgono a flussi pedonali misurati."
      },
      business: {
        available: isBusinessStep2 && pois.length > 0 ? 1 : 0,
        total: 3,
        limitation: "Censimento ATECO, aree produttive e punti di consegna non sono collegati."
      },
      recommendation: {
        available: canonicalSourceRegistry.filter(source => source.connected).length,
        total: canonicalSourceRegistry.length
      }
    }
  });
  const step2ViewModel = buildStep2ViewModel({
    truthModel: step2TruthModel,
    areaMode,
    cityName: canonicalCityName,
    radiusKm: radiusKm || radius || null,
    isNilAnalysis,
    territoryPluralLabel,
    selectedComuniCount: Math.max((selectedComuni || []).length, searchMode === "municipality" && !isNilAnalysis ? selZones.length : 0, (targetComuniList || []).length),
    selectedMunicipalities: selectedMunicipalitySummary,
    selectedNilNames: areaMode === "custom_zone" ? selZones.map(z => z.name) : [],
    radiusCenterSource,
    usingMunicipalityFullCoverage,
    hasConfirmedZone: hasConfirmedZoneForActiveSelection,
    hasValidGeometry: areaMode === "radius" ? isRadiusGeometryValid : hasValidCoverageGeometry,
    isCalculationComplete: isCoverageCalculationComplete,
    hasCalculationError: hasCoverageCalculationError,
    hasConfirmedCoverageMode,
    hasConfirmedRadius: radiusSelectionConfirmed,
    selectedSearchPoint: selectedSearchPoint || null,
    coverageDecision: coverageDecision || "keepCurrent",
    manualFlyers: manualFlyersNumber || allocationFlyers || null,
    assignedFlyersTotal: assignedFlyersTotal || allocationFlyers || null,
    step2ZonesReady,
    coverageDecisionReady,
    coverageDecisionRequired,
    allocationStatus,
    gisTimedOut,
    gisLoading,
    availableNilCount: step2TruthModel.zones.available,
    containingNil: containingNil || addressPreviewNilZones?.main || null,
    containingNilCandidates: addressPreviewNilZones?.containingCandidates || [],
    intersectedNilCount: intersectedNils.length,
    selectedNilCount: selectedNils.length
  });
  const step2CoveragePctLabel = step2TruthModel.coverage.operationalPct == null ? null : formatPercentIT(step2TruthModel.coverage.operationalPct, Number.isInteger(step2TruthModel.coverage.operationalPct) ? 0 : 1);
  const step2CoverageFullLabel = step2CoveragePctLabel ? `${step2CoveragePctLabel} del fabbisogno operativo` : null;
  // Shared, single-decimal, formatPercentIT-formatted coverage percentage —
  // every banner/sentence in Step 2 reads this instead of re-deriving its own
  // (previously mismatched, e.g. "22%" here vs "21,6%" in the sidebar).
  const sharedCoveragePctText = step2CoveragePctLabel || (radiusAdvisoryData ? formatPercentIT(radiusAdvisoryData.covPct, Number.isInteger(radiusAdvisoryData.covPct) ? 0 : 1) : null) || formatPercentIT(serviceKpis?.coverage || 0, Number.isInteger(serviceKpis?.coverage || 0) ? 0 : 1);
  const step2RequirementContextLabel = step2TruthModel.territory.modeLabel || "fabbisogno operativo delle zone selezionate";
  const isCoverageConfigurationValid = step2ViewModel.isCoverageConfigurationValid;
  const operationalSelectionReady = isResidentialStep2 || isMovementStep2 && (pois.length > 0 ? selectedOperationalPois.length > 0 : step1OperationalPoints.length > 0) || isBusinessStep2 && selectedOperationalPois.length > 0;
  const canContinueCalendar = isBusinessStep2 ? step2ZonesReady && operationalSelectionReady && !gisLoading && !gisTimedOut : !step2ViewModel.ctaDisabled && step2ZonesReady && operationalSelectionReady && coverageDecisionReady && (!coverageDecisionRequired || allocationStatus === "success");
  const continueLabel = step2ViewModel.ctaLabel || "Continua allo Step 3";
  if (isStep2DebugEnabled() && typeof window !== "undefined") {
    const apiNils = Array.isArray(apiData?.nil_breakdown) ? apiData.nil_breakdown : [];
    const apiNilsWithGeometry = apiNils.filter(z => Boolean(z?.geometry_geojson || z?.geometry || z?.geojson));
    window.__VOLANTINIPRO_STEP2_STATE__ = {
      url: window.location.href,
      areaMode,
      searchMode,
      activeAreaTab,
      radiusKm: radiusKm || radius || null,
      selectedSearchPoint: selectedSearchPoint || null,
      addressLabel: selectedSearchPoint?.label || selectedSearchPoint?.display_name || null,
      coordinates: selectedSearchPoint ? {
        lat: selectedSearchPoint.lat,
        lng: selectedSearchPoint.lng
      } : null,
      coverageDecision,
      finalFlyers: finalFlyersRounded,
      availableFlyers,
      requiredFlyers,
      allocation: zonesAllocation,
      truthModel: step2TruthModel,
      availableNils,
      intersectedNils,
      selectedNils,
      selectedNil: selectedNils,
      containingNil: containingNil || addressPreviewNilZones?.main || null,
      containingNilCandidates: addressPreviewNilZones?.containingCandidates || [],
      requiresExplicitNilChoice: Boolean(addressPreviewNilZones?.requiresExplicitNilChoice),
      apiNilCount: apiNils.length,
      apiNilWithGeometryCount: apiNilsWithGeometry.length,
      step2MapZonesCount: Array.isArray(mapCoverageZones) ? mapCoverageZones.length : 0,
      step2MapNilZonesCount: Array.isArray(mapCoverageZones) ? mapCoverageZones.filter(z => z?.isNil || z?.territoryLevel === "nil").length : 0,
      zonesInRadiusCount: Array.isArray(zonesInRadius) ? zonesInRadius.length : 0,
      selZonesCount: Array.isArray(selZones) ? selZones.length : 0,
      cityReady: Boolean(city),
      activeZoneId: data.activeZoneId,
      campaignZones: (data.campaignZones || []).map(zone => ({
        id: zone.id,
        cityReady: Boolean(zone.city),
        assigned: zone.assigned_flyers,
        finalFlyers: zone.finalFlyers
      })),
      step2ZonesReady,
      hasConfirmedZoneForActiveSelection,
      hasConfirmedCoverageMode,
      hasValidCoverageGeometry,
      isCoverageCalculationComplete,
      hasCoverageCalculationError,
      viewModelCoverageReason: step2ViewModel.coverageStatusReason,
      canContinueCalendar,
      ctaDisabled: step2ViewModel.ctaDisabled,
      ctaLabel: continueLabel,
      coverageDecisionReady,
      coverageDecisionRequired,
      allocationStatus
    };
  }
  if (import.meta.env.DEV && isResidentialStep2 && normalizeMunicipalityName(selectedMunicipality) === "milano") {
    const nilCards = isNilAnalysis ? selZones : [];
    console.log("[STEP2_MILANO_AREA_MODE]", {
      activeAreaTab,
      areaMode,
      selectedComune: selectedComune?.name || selectedComune?.label || null,
      radiusKm,
      isLargeCity: requestedAnalysisLevel === "nil",
      isNilAnalysis,
      primarySource: step2ViewModel.primarySource,
      primaryAreaLabel: step2ViewModel.primaryAreaLabel,
      nilCount: nilCards.length,
      nilNames: nilCards.map(n => n.name),
      firstNilName: nilCards[0]?.name || null,
      firstNilFamilies: nilCards[0]?.families ?? null,
      firstNilRecommendedFlyers: nilCards[0]?.flyersMin ?? null
    });
    console.log("[MILANO_COMUNE_COMPLETE_CHECK]", {
      activeAreaTab,
      areaMode,
      selectedComune: selectedComune?.name || selectedComune?.label || null,
      requestedAnalysisLevel,
      effectiveRadiusKm,
      nilBreakdownLength: Array.isArray(apiData?.nil_breakdown) ? apiData.nil_breakdown.length : null,
      selZonesLength: selZones?.length ?? 0,
      nilNames: (apiData?.nil_breakdown || []).slice(0, 20).map(z => z.nil_name || z.comune_name),
      primarySource: step2ViewModel.primarySource,
      primaryFamiliesValue: step2ViewModel.primaryFamiliesValue,
      recommendedFlyersValue: step2ViewModel.recommendedFlyersValue,
      milanoComuneNilInsufficient
    });
    console.log("[MILANO_MODE_SOURCE_DEBUG]", {
      activeAreaTab,
      areaMode,
      radiusKm,
      effectiveRadiusKm,
      selectedComune: selectedComune?.name || selectedComune?.label || null,
      nilBreakdownLength: Array.isArray(apiData?.nil_breakdown) ? apiData.nil_breakdown.length : null,
      selZonesLength: selZones?.length ?? 0,
      primarySource: step2ViewModel.primarySource,
      primaryFamiliesValue: step2ViewModel.primaryFamiliesValue,
      recommendedFlyersValue: step2ViewModel.recommendedFlyersValue,
      coverageBoxTotalValue: municipalityTotalFamilies,
      nilNames: (selZones || []).slice(0, 10).map(z => z.name)
    });
    if (isRadiusMode) {
      const distances = (selZones || []).map(z => {
        const centroid = geoJsonApproxCentroid(z.geometry);
        return centroid && radiusCenter ? haversineKm(radiusCenter.lat, radiusCenter.lng, centroid.lat, centroid.lng) : null;
      }).filter(Number.isFinite);
      console.log("[STEP2_RADIUS_NIL_CHECK]", {
        radiusKm,
        nilCount: selZones?.length ?? 0,
        totalFamilies: serviceKpis?.families ?? 0,
        recommendedFlyers: step2ViewModel.recommendedFlyersValue,
        nilNames: (selZones || []).slice(0, 20).map(z => z.name),
        maxDistanceKm: distances.length ? Math.round(Math.max(...distances) * 10) / 10 : null,
        source: "radius"
      });
      console.log("[STEP2_RADIUS_CENTER_DEBUG]", {
        inputValue: search,
        activeAreaTab,
        areaMode,
        selectedComune: selectedComune?.name || selectedComune?.label || null,
        selectedSearchPoint,
        selectedComuneCenter: city ? {
          lat: city.lat,
          lng: city.lng
        } : null,
        resolvedRadiusCenter: radiusCenter,
        radiusCenterSource,
        radiusKm
      });
    }
    if (selectedSearchPoint) {
      console.log("[STEP2_ADDRESS_MODE_DEBUG]", {
        activeAreaTab,
        selectedComune: selectedComune?.name || selectedComune?.label || null,
        selectedSearchPoint,
        selectedSearchPointType: selectedSearchPoint?.type || null,
        radiusKm,
        radiusCenterSource,
        primarySource: step2ViewModel.primarySource,
        primaryAreaLabel: step2ViewModel.primaryAreaLabel,
        usingMunicipalityFullCoverage
      });
    }
    if (isComuneMode) {
      console.log("[STEP2_ADDRESS_GATE_CHECK]", {
        activeAreaTab,
        selectedSearchPoint,
        selectedSearchPointType: selectedSearchPoint?.type || null,
        addressFullCoverageConfirmed,
        nilMode: nilManualMode,
        hasUnconfirmedAddressPoint,
        zonesInRadiusLength: zonesInRadius?.length ?? 0,
        primarySource: step2ViewModel.primarySource,
        shouldShowAddressDecisionBox: hasUnconfirmedAddressPoint
      });
    }
  }
  return <div style={{
    maxWidth: 1280,
    margin: "0 auto",
    padding: "34px clamp(16px, 4vw, 32px) 160px",
    background: C.navyMid,
    minHeight: "100vh",
    overflow: "visible"
  }}>

      {!isAdminView && <>
      {/* Section */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 14,
        flexWrap: "wrap"
      }}>
        <button type="button" onClick={onBack} aria-label="Torna allo Step 1" style={{
          minHeight: 38,
          padding: "0 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,.18)",
          background: "rgba(255,255,255,.06)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13,
          fontWeight: 800,
          cursor: "pointer",
          flexShrink: 0
        }}>
          ← Torna allo Step 1
        </button>

        {/* Titolo */}
        <div style={{
          flexShrink: 0
        }}>
          <div style={{
            fontFamily: F.serif,
            fontSize: 22,
            color: C.white,
            letterSpacing: "-.5px"
          }}>{isBusinessStep2 ? "Seleziona le attività e le aziende da raggiungere" : "Scegli la zona di distribuzione"}</div>
          <div style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.55)",
            marginTop: 4
          }}>{isBusinessStep2 ? "Definisci l’area, verifica le attività reali disponibili e costruisci il piano di visita Business." : "Cerca un comune o CAP, scegli il raggio e verifica la copertura stimata dei tuoi volantini."}</div>
        </div>

        <div style={{
          width: 1,
          height: 28,
          background: "rgba(255,255,255,.1)",
          flexShrink: 0
        }} />

        {/* SERVICE PILLS - cambiano il servizio */}
        <div style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap"
        }}>
          {[{
            id: "d2d",
            icon: " ",
            l: "Door to Door"
          }, {
            id: "h2h",
            icon: "",
            l: "Hand to Hand"
          }, {
            id: "b2b",
            icon: "",
            l: "Business"
          }].map(({
            id,
            icon,
            l
          }) => <button key={id} onClick={() => setData(d => applyConfiguratorServiceChange(d, id))} style={pill(svcType === id, getServiceAccent(id))}>
              {icon} {l}
            </button>)}
        </div>

        {/* VIEW PILLS (Distribuzione/Heatmap/Demografia) rimossi: erano
            controlli dei layer MAPPA in vista tecnica, ma in 📊 Analisi
            Avanzata la mappa non viene più mostrata (è un report dati, non
            una vista GIS) — sarebbero rimasti comandi senza effetto. */}

      </div>

      {/* Section */}
      <div style={{
        display: "flex",
        gap: 10,
        marginBottom: 12,
        alignItems: "flex-start",
        flexWrap: "wrap"
      }}>
        {/* Search */}
        <div style={{
          position: "relative",
          flex: "0 0 340px"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            padding: 0,
            borderRadius: 10,
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)",
            overflow: "hidden"
          }}>
            <div style={{
              display: "flex",
              background: "rgba(255,255,255,.03)",
              borderRight: "1px solid rgba(255,255,255,.12)"
            }}>
              <button onClick={switchToComuneMode} style={{
                padding: "9px 10px",
                background: activeAreaTab === "comune" ? col : "transparent",
                border: "none",
                color: C.white,
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all.2s"
              }}>Comune</button>
              <button onClick={switchToCapMode} style={{
                padding: "9px 10px",
                background: activeAreaTab === "cap" ? col : "transparent",
                border: "none",
                color: C.white,
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all.2s"
              }}>CAP</button>
            </div>
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px"
            }}>
              <span style={{
                fontSize: 13
              }}>{searchMode === "cap" ? "" : ""} </span>
              <input value={search} onChange={e => {
                setSearch(e.target.value);
                setDropOpen(true);
                setAddressSearchError("");
              }} onFocus={() => setDropOpen(true)} onKeyDown={e => {
                if (e.key === "Enter" && searchMode !== "cap") {
                  const sIntent = detectSearchIntent(search);
                  if (sIntent.intent === "address" && sIntent.parentComune === "Milano") {
                    const topValid = geocodeSuggestions.find(c => {
                      const textLooksLikeAddr = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                      const inMil = isGeocoderResultInMilanoComune(c);
                      const hasCoords = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                      return (looksLikeAddressResult(c) || textLooksLikeAddr) && inMil && hasCoords;
                    });
                    if (topValid) {
                      selectAddressPointInMilano(topValid.name, topValid);
                    } else {
                      setAddressSearchError("Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa.");
                      setSelectedSearchPoint(null);
                      setDropOpen(false);
                      logAddressVsMunicipalityDebug(search, city, city, null, true, "invalid_milano_address_blocked_auto_select", search, "unknown", null);
                      if (import.meta.env.DEV) {
                        console.log("[STEP2_ADDRESS_VALIDATION]", {
                          inputValue: search,
                          searchIntent: sIntent,
                          rawResultsCount: geocodeSuggestions.length,
                          validMilanoAddressResultsCount: 0,
                          rejectedResults: geocodeSuggestions.map(r => ({
                            name: r.name,
                            fullName: r.fullName,
                            type: r.placeType || r.type,
                            lat: r.lat,
                            lng: r.lng,
                            reason: !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)) ? "invalid_coordinates" : "not_valid_milano_address"
                          })),
                          selectedSearchPoint: null,
                          addressSearchError: "Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa."
                        });
                      }
                    }
                  }
                }
              }} placeholder={searchMode === "cap" ? "Inserisci CAP (es. 20121)..." : searchMode === "municipality" ? pendingAddMunicipality ? "Aggiungi comune (es. Meda, Cesano...)" : "Cerca comune" : "Cerca comune o CAP"} style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: C.white,
                fontFamily: F.sans,
                fontSize: 13,
                height: 38
              }} />
              {search && <button onClick={() => {
                setSearch("");
                setDropOpen(false);
              }} style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,.4)",
                cursor: "pointer",
                fontSize: 16
              }}>-</button>}
            </div>
          </div>
          {duplicateComuneNotice && <div style={{
            marginTop: 6,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(251,191,36,.1)",
            border: "1px solid rgba(251,191,36,.3)",
            fontFamily: F.sans,
            fontSize: 11,
            color: "#FBBF24"
          }}>
              {duplicateComuneNotice}
            </div>}
          {dropOpen && search.length > 0 && <div style={{
            position: "static",
            marginTop: 4,
            background: "#1a2a40",
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 10,
            zIndex: 80,
            overflowY: "auto",
            overflowX: "hidden",
            maxHeight: 260,
            boxShadow: "0 14px 36px rgba(0,0,0,.55)"
          }}>
              {searchMode !== "cap" ? (() => {
              if (geocodeSuggestions.length === 0 && search.length >= 2) {
                return <div style={{
                  padding: "9px 14px",
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.35)"
                }}>Nessun risultato...</div>;
              }
              const searchIntent = detectSearchIntent(search);
              const addressIntentInMilano = searchIntent.intent === "address" && searchIntent.parentComune === "Milano";
              // Ordine (§ticket): indirizzi/punti → Milano → altri comuni
              // (solo come alternativa esplicita, mai scelta principale).
              const rankSuggestion = s => {
                if (!addressIntentInMilano) return 1;
                if (looksLikeAddressResult(s)) return 0;
                if (normalizeMunicipalityName(s.label || s.name) === "milano") return 1;
                return 2;
              };
              const validMilanoAddresses = geocodeSuggestions.filter(c => {
                const textLooksLikeAddr = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                const inMil = isGeocoderResultInMilanoComune(c);
                const hasCoords = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                return (looksLikeAddressResult(c) || textLooksLikeAddr) && inMil && hasCoords;
              });
              const hasValidMilanoAddress = validMilanoAddresses.length > 0;
              const orderedSuggestions = addressIntentInMilano ? [...geocodeSuggestions].sort((a, b) => rankSuggestion(a) - rankSuggestion(b)) : geocodeSuggestions;
              return <>
                {addressIntentInMilano && !hasValidMilanoAddress && <div style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(251,191,36,.08)",
                  fontFamily: F.sans
                }}>
                    <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#FBBF24",
                    marginBottom: 8
                  }}>
                      Indirizzo non trovato a Milano. Controlla il nome della via.
                    </div>
                    <div style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap"
                  }}>
                      <button onClick={() => {
                      resolveMilanoCity().then(milano => {
                        if (milano) {
                          setCity(milano);
                          setSelectedComuni([milano]);
                          setSearch("Milano");
                          setDropOpen(false);
                          setSelected([]);
                          setCoverageDecision(null);
                          setCoverageStrategy(null);
                          setPartialCoverageConfirmed(false);
                          setAddressFullCoverageConfirmed(true);
                          setAddressSearchError("");
                          setSelectedSearchPoint(null);
                        }
                      });
                    }} style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: "1px solid rgba(255,255,255,.2)",
                      background: "rgba(255,255,255,.1)",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}>
                        Usa Milano comune completo
                      </button>
                      <button onClick={() => {
                      startManualPinSelection();
                    }} style={{
                      padding: "6px 12px",
                      borderRadius: 7,
                      border: "1px solid rgba(59,130,246,.4)",
                      background: "rgba(59,130,246,.15)",
                      color: "#60A5FA",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}>
                        Scegli punto manuale sulla mappa
                      </button>
                    </div>
                  </div>}
                {orderedSuggestions.map(c => {
                  // Intent indirizzo-in-Milano: righe indirizzo/POI cliccabili
                  // come PUNTO dentro Milano; i comuni fuzzy (Cormano, Como)
                  // restano solo alternative esplicite, mai auto-selezione.
                  // Check robusto: looksLikeAddressResult (placeType) OPPURE
                  // il testo del suggerimento contiene un odonimo (via/corso/
                  // piazza…) — il geocoder potrebbe taggare l'indirizzo come
                  // poi/place/locality anziché address, ma se il nome contiene
                  // un odonimo È un indirizzo a prescindere dal tag.
                  const textLooksLikeAddress = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                  const hasPointCoordinates = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                  const isOperationalPointResult = searchMode === "address" && isMovementStep2 && hasPointCoordinates && c?.placeType !== "place";
                  if (isOperationalPointResult) {
                    return <div key={c.id} onClick={() => selectOperationalPoint(c.label || c.name, c)} style={{
                      padding: "9px 14px",
                      cursor: "pointer",
                      fontFamily: F.sans,
                      fontSize: 13,
                      color: C.white,
                      borderBottom: "1px solid rgba(255,255,255,.05)"
                    }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <Step1Icon name="pin" size={12} style={{
                        verticalAlign: -1,
                        marginRight: 4
                      }} />{c.label || c.name} <span style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)",
                        marginLeft: 6
                      }}>punto operativo</span>
                      </div>;
                  }
                  if (addressIntentInMilano && (looksLikeAddressResult(c) || textLooksLikeAddress)) {
                    const inMilano = isGeocoderResultInMilanoComune(c);
                    if (!inMilano) return null;
                    return <div key={c.id} onClick={() => selectAddressPointInMilano(c.name, c)} style={{
                      padding: "9px 14px",
                      cursor: "pointer",
                      fontFamily: F.sans,
                      fontSize: 13,
                      color: C.white,
                      borderBottom: "1px solid rgba(255,255,255,.05)"
                    }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <Step1Icon name="pin" size={12} style={{
                        verticalAlign: -1,
                        marginRight: 4
                      }} />{c.name} <span style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)",
                        marginLeft: 6
                      }}>indirizzo/punto · Milano</span>
                      </div>;
                  }
                  if (addressIntentInMilano && !isNilLikePlaceType(c.placeType) && normalizeMunicipalityName(c.label || c.name) !== "milano") {
                    // §5: comune diverso da Milano con intent indirizzo — non
                    // è la scelta principale; selezione solo esplicita.
                    return <div key={c.id} style={{
                      padding: "8px 14px",
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8
                    }}>
                        <span style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(255,255,255,.45)"
                      }}>
                          {c.label || c.name} <span style={{
                          color: "#FBBF24"
                        }}>— Risultato fuori Milano — seleziona comunque</span>
                        </span>
                        <button onClick={() => {
                        setAddressSearchError("");
                        logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_override_municipality", c.label || c.name, "municipality_explicit", c.label || c.name);
                        if (import.meta.env.DEV) console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                          inputValue: search,
                          detectedSearchIntent: "address",
                          selectedResultName: c.label || c.name,
                          selectedResultType: "municipality_explicit",
                          parentComune: "Milano",
                          selectedComune: c.label || c.name,
                          selectedAddressPoint: null,
                          radiusCenterSource: "municipality",
                          blockedReason: "explicit_override"
                        });
                        if (pendingAddMunicipality) {
                          appendMunicipalityToActiveZone(c);
                        } else if (searchMode === "address") {
                          selectMunicipalityAsRadiusCenter(c);
                        } else {
                          selectPrimaryMunicipality(c);
                          setSelectedSearchPoint(null);
                        }
                      }} style={{
                        padding: "4px 9px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,.15)",
                        background: "rgba(255,255,255,.05)",
                        color: "rgba(255,255,255,.6)",
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}>
                          Seleziona comunque
                        </button>
                      </div>;
                  }
                  // Tab Comune accetta solo risultati amministrativi comunali.
                  // "Brera"/"Duomo"/ecc. arrivano dal geocoder taggati come
                  // locality/neighborhood/suburb/quarter — MAI creati come
                  // comune. La CTA "Seleziona come NIL" appare solo se il
                  // quartiere appartiene a Milano (il dataset NIL esiste solo
                  // lì); per frazioni di altri comuni si invita a cercare il
                  // comune di appartenenza.
                  if (isNilLikePlaceType(c.placeType)) {
                    const nilName = c.label || c.name;
                    const isMilanoArea = String(c.name || "").toLowerCase().includes("milano");
                    return <div key={c.id} style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid rgba(255,255,255,.05)",
                      background: "rgba(251,191,36,.05)"
                    }}>
                        <div style={{
                        fontFamily: F.sans,
                        fontSize: 13,
                        color: C.white,
                        marginBottom: 3
                      }}>{nilName}</div>
                        <div style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "#FBBF24",
                        marginBottom: isMilanoArea ? 6 : 0
                      }}>
                          {isMilanoArea ? `${nilName} non è un comune. È una zona/quartiere di Milano.` : `${nilName} non è un comune. È una zona/frazione: cerca il comune di appartenenza.`}
                        </div>
                        {isMilanoArea && <button onClick={() => {
                        selectMilanoAsNil(nilName, {
                          lat: c.lat,
                          lng: c.lng
                        });
                      }} style={{
                        padding: "5px 10px",
                        borderRadius: 7,
                        border: "1px solid rgba(34,197,94,.4)",
                        background: "rgba(34,197,94,.14)",
                        color: "#22C55E",
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                            Seleziona {nilName} come NIL
                          </button>}
                      </div>;
                  }
                  return <div key={c.id} onClick={() => {
                    if (searchMode === "municipality" && pendingAddMunicipality) {
                      appendMunicipalityToActiveZone(c);
                    } else if (searchMode === "address") {
                      setAddressSearchError("");
                      logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_radius_municipality_selection", c.label || c.name, c.placeType || "municipality", c.label || c.name);
                      selectMunicipalityAsRadiusCenter(c);
                      setSelectedSearchPoint(null);
                      if (import.meta.env.DEV) {
                        console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                          inputValue: search,
                          detectedSearchIntent: detectSearchIntent(search).intent,
                          selectedResultName: c.label || c.name,
                          selectedResultType: c.placeType || "municipality",
                          parentComune: null,
                          selectedComune: c.label || c.name,
                          selectedAddressPoint: null,
                          radiusCenterSource: "municipality_radius_center",
                          blockedReason: null
                        });
                      }
                    } else {
                      setAddressSearchError("");
                      logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_municipality_selection", c.label || c.name, c.placeType || "municipality", c.label || c.name);
                      selectPrimaryMunicipality(c);
                      setSelectedSearchPoint(null);
                      if (import.meta.env.DEV) {
                        console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                          inputValue: search,
                          detectedSearchIntent: detectSearchIntent(search).intent,
                          selectedResultName: c.label || c.name,
                          selectedResultType: c.placeType || "municipality",
                          parentComune: null,
                          selectedComune: c.label || c.name,
                          selectedAddressPoint: null,
                          radiusCenterSource: "municipality",
                          blockedReason: null
                        });
                      }
                    }
                  }} style={{
                    padding: "9px 14px",
                    cursor: "pointer",
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: C.white,
                    borderBottom: "1px solid rgba(255,255,255,.05)"
                  }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                     {c.label || c.name}
                  </div>;
                })}
                </>;
            })() : capSearchLoading ? <div style={{
              padding: "9px 14px",
              fontFamily: F.sans,
              fontSize: 12,
              color: "rgba(255,255,255,.35)"
            }}>Ricerca CAP in corso––</div> : capSuggestions.length === 0 && search.length >= 2 ? <div style={{
              padding: "9px 14px",
              fontFamily: F.sans,
              fontSize: 12,
              color: "rgba(255,255,255,.35)"
            }}>Nessun CAP trovato</div> : capSuggestions.map(c => <div key={c.id} onClick={() => handleCapSelect(c)} style={{
              padding: "9px 14px",
              cursor: "pointer",
              fontFamily: F.sans,
              fontSize: 13,
              color: C.white,
              borderBottom: "1px solid rgba(255,255,255,.05)"
            }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                     {c.name}
                  </div>)}
            </div>}
        </div>

        {/* Comune selezionato badge / lista — in modalità comune */}
        {searchMode === "municipality" && (selectedComuni.length > 0 || city) && <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          marginBottom: 4
        }}>
            {selectedComuni.length > 1 && <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            color: "rgba(255,255,255,.7)",
            textTransform: "uppercase",
            letterSpacing: ".04em"
          }}>
                Territorio selezionato
              </div>}
            <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap"
          }}>
              <span style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.55)"
            }}>
                {isMovementStep2 ? selectedComuni.length > 1 ? `${selectedComuni.length} zone operative:` : 'Zona operativa:' : isBusinessStep2 ? selectedComuni.length > 1 ? `${selectedComuni.length} cluster attività:` : 'Cluster attività:' : selectedComuni.length > 1 ? `${selectedComuni.length} Comuni selezionati:` : 'Comune selezionato:'}
              </span>
              {(selectedComuni.length > 0 ? selectedComuni : [city]).filter(Boolean).map((c, idx) => {
              const normName = normalizeMunicipalityName(c.label || c.name);
              const zoneData = (zonesInRadius || []).find(z => normalizeMunicipalityName(z.name) === normName);
              const fam = zoneData?.families || zoneData?.householdsTotal || 0;
              const pop = zoneData?.pop || zoneData?.population || zoneData?.populationTotal || 0;
              const rec = zoneData?.flyersMin || zoneData?.recommendedFlyers || 0;
              const cov = zoneData?.coverage || 100;
              // In analisi NIL (Milano), z.coverage è il peso della singola
              // zona NIL sul totale comune (es. 1%) — NON una copertura
              // geografica parziale del confine. Usarlo qui creerebbe un
              // falso badge "Parziale (1%)" fuori contesto: il badge resta
              // sul solo stato di caricamento del confine.
              const isPart = !isNilAnalysis && cov < 95;
              const hasBound = municipalityBoundary && (Array.isArray(municipalityBoundary) ? municipalityBoundary.some(b => normalizeMunicipalityName(b.name) === normName) : true);
              const isHidden = hiddenBoundaries.includes(normName);
              return <div key={c.id || idx} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 10,
                background: isHidden ? "rgba(255,255,255,.03)" : "rgba(34,197,94,.09)",
                border: isHidden ? "1px dashed rgba(255,255,255,.18)" : "1px solid rgba(34,197,94,.22)",
                fontFamily: F.sans,
                fontSize: 12,
                flexWrap: "wrap",
                opacity: isHidden ? 0.65 : 1,
                transition: "all 0.2s ease"
              }}>
                    <span style={{
                  color: isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                  fontWeight: 900
                }}>✓ {c.label || c.name}</span>
                    {hasBound && <span style={{
                  color: isHidden ? "rgba(255,255,255,.45)" : "#22C55E",
                  fontSize: 10,
                  fontWeight: 800
                }}>✓ confine</span>}
                    {fam > 0 && <span style={{
                  color: "rgba(255,255,255,.7)",
                  fontSize: 11
                }}><b>{formatNumber(fam)}</b> fam.</span>}
                    {pop > 0 && <span style={{
                  color: "rgba(255,255,255,.6)",
                  fontSize: 11
                }}>({formatNumber(pop)} ab.)</span>}
                    {rec > 0 && <span style={{
                  color: col,
                  fontSize: 11,
                  fontWeight: 700
                }}>{formatNumber(rec)} vol.</span>}
                    <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: isPart ? "rgba(234,179,8,.15)" : isHidden ? "rgba(255,255,255,.08)" : "rgba(34,197,94,.15)",
                  color: isPart ? "#FACC15" : isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                  border: `1px solid ${isPart ? "rgba(234,179,8,.3)" : isHidden ? "rgba(255,255,255,.15)" : "rgba(34,197,94,.3)"}`
                }}>
                      {isPart ? `Parziale (${cov}%)` : "Confine OK/Caricato"}
                    </span>
                    {/* Toggle Visibilità Confine ON/OFF (Solo Visivo - NON RIMUOVI IL COMUNE NE' I KPI) */}
                    {hasBound && <button type="button" onClick={e => {
                  e.stopPropagation();
                  setHiddenBoundaries(prev => prev.includes(normName) ? prev.filter(n => n !== normName) : [...prev, normName]);
                }} title={isHidden ? "Mostra confine sulla mappa (i KPI restano invariati)" : "Nascondi confine dalla mappa (solo visivo, i KPI restano invariati)"} style={{
                  background: isHidden ? "rgba(255,255,255,.08)" : "rgba(34,197,94,.18)",
                  border: `1px solid ${isHidden ? "rgba(255,255,255,.18)" : "rgba(34,197,94,.35)"}`,
                  borderRadius: 6,
                  color: isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                  cursor: "pointer",
                  padding: "3px 7px",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  marginLeft: 4,
                  transition: "all 0.15s ease"
                }}>
                        <span style={{
                    display: "inline-flex"
                  }}><Step1Icon name={isHidden ? "eyeOff" : "eye"} size={13} /></span>
                        <span>{isHidden ? "Confine OFF" : "Confine ON"}</span>
                      </button>}
                    <button onClick={e => {
                  e.stopPropagation();
                  removeMunicipalityFromActiveZone(normName);
                }} title="Rimuovi comune dalla selezione (cambia i KPI)" style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,.5)",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 800,
                  padding: "0 4px",
                  marginLeft: 2
                }}>
                      ✕
                    </button>
                  </div>;
            })}
            </div>
          </div>}

        {/* Radius pills & info - in modalità raggio */}
        {activeAreaTab === "raggio" && <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          marginBottom: 6
        }}>
            {selectedComuni.length > 0 || city || searchedLocation ? <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap"
          }}>
                <span style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.55)"
            }}>Comune/punto di riferimento:</span>
                <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,.06)",
              border: "1px solid rgba(255,255,255,.15)",
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 700,
              color: C.white
            }}>
                  <Step1Icon name="pin" size={12} /> {hasSearchPoint ? selectedSearchPoint.label : city?.label || city?.name || selectedComuni[0]?.label || selectedComuni[0]?.name || searchedLocation}
                </div>
                <div style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(34,197,94,.12)",
              border: "1px solid rgba(34,197,94,.3)",
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 700,
              color: "#22C55E"
            }}>
                  Raggio selezionato: {radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`}
                </div>
                <div style={{
              padding: "6px 12px",
              borderRadius: 8,
              background: "rgba(59,130,246,.12)",
              border: "1px solid rgba(59,130,246,.3)",
              fontFamily: F.sans,
              fontSize: 12,
              fontWeight: 700,
              color: "#60A5FA"
            }}>
                  Area operativa: raggio {radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`} da {hasSearchPoint ? (selectedSearchPoint.label || "punto cercato").split(",")[0] : city?.label || city?.name ? `${city.label || city.name} centro` : searchedLocation || "centro selezionato"}
                </div>
              </div> : <div style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(234,179,8,.12)",
            border: "1px solid rgba(234,179,8,.3)",
            fontFamily: F.sans,
            fontSize: 12,
            color: "#FACC15"
          }}>
                Seleziona un comune o un punto di partenza per applicare il raggio.
              </div>}
            <div style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            marginTop: 8
          }}>
              <InteractiveRadiusSlider value={radiusKm} options={S2_RADII} disabled={!city && selectedComuni.length === 0 && !searchedLocation || apiLoading} onCommit={updateActiveRadius} recommendedValue={recommendedRadiusForSlider} accent={col} />
            </div>
            <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.55)"
          }}>Aumentando il raggio aumentano copertura, comuni coinvolti e quantità consigliata.</div>
          </div>}
        {searchMode === "cap" && selectedCaps.length > 0 && <div style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap"
        }}>
            <span style={{
            fontFamily: F.sans,
            fontSize: 10,
            color: "rgba(255,255,255,.35)",
            whiteSpace: "nowrap"
          }}>CAP selezionati:</span>
            {selectedCaps.map(cap => <span key={cap} style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 9px",
            borderRadius: 100,
            background: `${col}18`,
            border: `1px solid ${col}35`,
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 700,
            color: col
          }}>
                 {cap}
                <button onClick={() => {
              setSelectedCaps(prev => prev.filter(c => c !== cap));
              setCapDataMap(prev => {
                const n = {
                  ...prev
                };
                delete n[cap];
                return n;
              });
            }} style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,.4)",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
              marginLeft: 2
            }}>-</button>
              </span>)}
          </div>}

        {/* Dropdown "Layer mappa" (heatmap tematica) rimosso: era visibile
            solo in Analisi Avanzata, dove ora la mappa non viene più mostrata
            — un selettore di layer mappa senza mappa sarebbe un comando morto. */}
      </div>

      {/* BARRA COMPATTA DI CONSIGLIO SUL RAGGIO */}
      {radiusAdvisoryData && <div style={{
        margin: "0 0 16px",
        padding: "12px 16px",
        borderRadius: 12,
        background: radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "rgba(34, 197, 94, 0.08)" : "rgba(234, 179, 8, 0.1)",
        border: `1px solid ${radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "rgba(34, 197, 94, 0.28)" : "rgba(234, 179, 8, 0.35)"}`,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: 12,
        transition: "all .2s ease"
      }}>
          <div style={{
          flex: 1
        }}>
            <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            fontFamily: F.sans,
            fontSize: 12,
            fontWeight: 800,
            color: radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "#22C55E" : "#FACC15"
          }}>
              <span style={{
              display: "inline-flex"
            }}>{radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "✓" : <Step1Icon name="warning" size={13} />}</span>
              <span>
                {radiusAdvisoryData.isDismissed ? `Raggio confermato (${formatRadiusLabel(radiusAdvisoryData.currentRadius)})` : radiusAdvisoryData.status === "coperto" ? "Raggio coerente con la quantità" : radiusAdvisoryData.covPct < 25 || radiusAdvisoryData.status === "non_coperto" ? "Raggio ampio rispetto alla quantità" : "Copertura parziale dell'area"}
              </span>
            </div>
            <div style={{
            fontFamily: F.sans,
            fontSize: 11,
            color: "rgba(255,255,255,.76)",
            lineHeight: 1.45
          }}>
              {radiusAdvisoryData.isDismissed ? `Raggio di ${formatRadiusLabel(radiusAdvisoryData.currentRadius)} mantenuto per la distribuzione (${formatIntegerIT(radiusAdvisoryData.currQty)} volantini per una copertura stimata del ${sharedCoveragePctText}).` : radiusAdvisoryData.status === "coperto" ? `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato (${formatRadiusLabel(radiusAdvisoryData.currentRadius)}) è coerente con il fabbisogno stimato dell'area (copertura al ${sharedCoveragePctText}).` : radiusAdvisoryData.covPct < 25 || radiusAdvisoryData.status === "non_coperto" ? `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato copre circa il ${sharedCoveragePctText} del fabbisogno stimato dell'area. Per una distribuzione più concentrata puoi usare il raggio consigliato.` : `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato copre circa il ${sharedCoveragePctText} del fabbisogno stimato dell'area (${formatIntegerIT(radiusAdvisoryData.currReq)} volantini per copertura completa). Puoi mantenere la selezione o concentrare la distribuzione sul raggio consigliato.`}
            </div>
          </div>

          {!radiusAdvisoryData.isDismissed && radiusAdvisoryData.status !== "coperto" && radiusAdvisoryData.recRadius !== radiusAdvisoryData.currentRadius && <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          width: isMobile ? "100%" : "auto",
          justifyContent: isMobile ? "flex-start" : "flex-end"
        }}>
              <button type="button" onClick={() => updateActiveRadius(radiusAdvisoryData.recRadius)} style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "1px solid #22C55E",
            background: "#22C55E",
            color: "#000",
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(34,197,94,.35)",
            transition: "all .15s ease"
          }}>
                Usa raggio consigliato ({formatRadiusLabel(radiusAdvisoryData.recRadius)})
              </button>
              <button type="button" onClick={() => setDismissedAdvisoryRadius(radiusAdvisoryData.currentRadius)} style={{
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.22)",
            background: "rgba(255,255,255,.06)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all .15s ease"
          }}>
                Mantieni {formatRadiusLabel(radiusAdvisoryData.currentRadius)}
              </button>
            </div>}
        </div>}

      {/* Section */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        margin: "-4px 0 12px",
        overflowX: "auto",
        paddingBottom: 2
      }}>
        {campaignZones.map((z, idx) => {
          const isActive = z.id === data.activeZoneId;
          const zoneSvcColor = "#22C55E";
          const zUnconfirmed = z.searchMode === "municipality" && !z.addressFullCoverageConfirmed && !z.nilManualMode && !z.addressSearchError && z.selectedSearchPoint?.type === "address";
          const configured = zUnconfirmed ? false : z.searchMode === "cap" ? (z.selectedCaps || []).length > 0 : z.selectedComuni && z.selectedComuni.length > 0 || !!z.city;
          return <button key={z.id} onClick={() => selectCampaignZone(z.id)} style={{
            minHeight: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: `1px solid ${isActive ? zoneSvcColor : "rgba(255,255,255,.09)"}`,
            background: isActive ? `${zoneSvcColor}18` : "rgba(255,255,255,.035)",
            color: isActive ? C.white : "rgba(255,255,255,.58)",
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
            flexShrink: 0
          }}>
              <span>{getCampaignZoneLabel(z, idx)}</span>
              <span style={{
              fontSize: 9,
              color: zUnconfirmed ? "#FBBF24" : configured ? C.green : C.yellow
            }}>{zUnconfirmed ? "Anteprima" : configured ? "OK" : "Da configurare"}</span>
            </button>;
        })}
        <button type="button" onClick={() => setDropOpen(true)} style={{
          minHeight: 32,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,.1)",
          background: "rgba(255,255,255,.04)",
          color: "rgba(255,255,255,.72)",
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0
        }}>
          Modifica zona
        </button>
        {!isRadiusMode && (() => {
          const hasValidSearchPoint = Boolean(selectedSearchPoint && Number.isFinite(Number(selectedSearchPoint.lat)) && Number.isFinite(Number(selectedSearchPoint.lng)));
          const hasValidCityPoint = Boolean(!hasValidSearchPoint && city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lng)));
          if (!hasValidSearchPoint && !hasValidCityPoint) return null;
          if (hasUnconfirmedAddressPoint) return null;
          let ctaLabel = "Usa raggio da questo punto";
          if (hasValidSearchPoint) {
            const rawAddr = String(selectedSearchPoint.name || selectedSearchPoint.label || selectedSearchPoint.fullName || "").split(',')[0].trim();
            if (rawAddr && rawAddr.length <= 28) {
              ctaLabel = `Usa raggio da ${rawAddr}`;
            }
          } else if (hasValidCityPoint) {
            const rawCity = String(city.name || city.label || "").split(',')[0].trim();
            if (rawCity) {
              ctaLabel = `Usa raggio dal centro di ${rawCity}`;
            }
          }
          return <button type="button" onClick={switchToRadiusMode} style={{
            minHeight: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.1)",
            background: "rgba(255,255,255,.04)",
            color: "rgba(255,255,255,.82)",
            fontFamily: F.sans,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 5
          }}>
              <Step1Icon name="pin" size={12} />
              <span>{ctaLabel}</span>
            </button>;
        })()}
        <button type="button" onClick={resetActiveZone} style={{
          minHeight: 32,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,.1)",
          background: "rgba(255,255,255,.03)",
          color: "rgba(255,255,255,.58)",
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0
        }}>
          Reset zona
        </button>
        <button onClick={() => {
          if (searchMode === "municipality") {
            setPendingAddMunicipality(true);
            setDropOpen(true);
            setSearch("");
          } else {
            handleAddZone();
          }
        }} style={{
          minHeight: 32,
          padding: "0 10px",
          borderRadius: 8,
          border: `1px dashed ${col}`,
          background: `${col}0f`,
          color: col,
          fontFamily: F.sans,
          fontSize: 11,
          fontWeight: 900,
          cursor: "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0
        }}>
          + Aggiungi un'altra zona / comune
        </button>
      </div>
      </>}

      {/* ========================================================= */}
      {/* REPORT TERRITORIALE AVANZATO — dashboard modulare, service-adaptive */}
      {/* Vedi src/pages/TerritorialReport.jsx per l'implementazione UI.       */}
      {/* ========================================================= */}
      {isAdminView && (() => {
      const svcKey = isResidentialStep2 ? "d2d" : isMovementStep2 ? "h2h" : "b2b";
      const activeServiceTitle = isResidentialStep2 ? "Door to Door" : isMovementStep2 ? "Hand to Hand" : "Distribuzione presso attività e aziende";
      const totalHouseholds = effectiveDemoData?.householdsTotal > 0 ? effectiveDemoData.householdsTotal : serviceKpis?.families || 0;
      const totalPopulation = effectiveDemoData?.populationTotal > 0 ? effectiveDemoData.populationTotal : serviceKpis?.population || 0;
      const profileDens = zoneDensity > 0 ? zoneDensity : aiAgg?.densita > 0 ? aiAgg.densita : summaryComuniStats?.densita > 0 ? summaryComuniStats.densita : 0;
      const ageRows = effectiveDemoData ? [{
        l: "0-14",
        v: effectiveDemoData.age_0_14_pct,
        c: "#A78BFA"
      }, {
        l: "15-34",
        v: effectiveDemoData.age_15_34_pct,
        c: "#38BDF8"
      }, {
        l: "35-64",
        v: effectiveDemoData.age_35_64_pct,
        c: "#4ADE80"
      }, {
        l: "65+",
        v: effectiveDemoData.age_65_plus_pct,
        c: "#FBBF24"
      }].filter(row => Number.isFinite(Number(row.v))) : [];
      const hasRealNilBreakdown = Boolean(isNilAnalysis && selZones.some(zone => zone?.isNil || zone?.territoryLevel === "nil"));
      const hasSectorBreakdown = Boolean(!hasRealNilBreakdown && selZones.length > 1 && selZones.some(zone => zone?.territoryLevel === "sector" || zone?.isSector));
      const hasMunicipalityBreakdown = Boolean(selectedComuni?.length > 1 && selZones.length > 1);
      const familyBreakdownTitle = hasRealNilBreakdown ? "Ripartizione famiglie per NIL" : hasSectorBreakdown ? "Ripartizione famiglie per settore" : hasMunicipalityBreakdown ? "Ripartizione famiglie per comune" : "Comune analizzato come territorio unico";
      const familyBreakdownItems = hasRealNilBreakdown || hasSectorBreakdown || hasMunicipalityBreakdown ? selZones : [];
      const omiRows = omiInfo?.available && Array.isArray(omiInfo?.values) ? omiInfo.values.filter(row => row?.typology && (row.min_value != null || row.max_value != null)) : [];
      const omiZones = Array.isArray(omiInfo?.zones) ? omiInfo.zones : [];
      const omiZoneNames = omiZones.map(zone => zone?.codice_zona || zone?.zone_code || zone?.name || zone?.description).filter(Boolean);
      const omiMeta = {
        zoneCount: Number.isFinite(Number(omiInfo?.values?.omi_zone_count)) ? Number(omiInfo.values.omi_zone_count) : omiZones.length || null,
        zoneNames: omiZoneNames.length ? omiZoneNames.slice(0, 8).join(", ") : null,
        aggregationLabel: (Number(omiInfo?.values?.omi_zone_count) || omiZones.length || 0) > 1 ? "Valori aggregati da piu zone OMI; min/max derivano dagli estremi restituiti dal backend" : "Valori single-zone quando una sola zona OMI e restituita",
        period: omiReference?.reference_period || omiReference?.reference_year || omiReference?.semester || null
      };
      const operationalRequirementExplanation = isResidentialStep2 ? `Le famiglie residenti (${formatIntegerIT(totalHouseholds)}) provengono dal record comunale ISTAT/demographic_indicators al livello geografico Comune. Il fabbisogno operativo (${formatIntegerIT(step2TruthModel.quantity.baseRequirement)} pz.) proviene dal modello operativo VolantiniPro al livello ${step2TruthModel.territory.modeLabel}: somma i fabbisogni delle zone selezionate e viene poi trasformato nel consigliato (${formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.) aggiungendo il margine operativo (${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.). I due valori differiscono perche il primo e un dato demografico residente, il secondo e una quantita operativa per cassette/fabbisogno distributivo, non un censimento ufficiale di famiglie.` : null;
      const operationalRecommended = Math.round(Number(step2ViewModel.recommendedFlyersValue || 0));
      const operationalMaximum = isResidentialStep2 ? Math.round(Number(d2dKpiZone?.flyersMax || 0)) : 0;
      const operationalDays = isResidentialStep2 ? operationalEstimate.days : null;
      const operationalQuantity = isResidentialStep2 ? operationalEstimate.quantity : 0;
      const modeLabelMap = {
        municipality: "Comune completo",
        multi_municipality: "Multi-comune",
        radius: "Raggio da indirizzo",
        custom_zone: "Multi-zona",
        cap: "Selezione per CAP"
      };
      const modeLabel = modeLabelMap[step2ViewModel.primarySource] || "Territorio selezionato";
      const zoneCount = step2TruthModel.zones.involved;

      // Zone e priorità — righe normalizzate per servizio (nessun dato inventato: usa solo le funzioni di ranking già esistenti)
      const zoneEyebrow = isResidentialStep2 ? "Allocazione NIL / zone" : isMovementStep2 ? "Assegnazione promoter e punti" : "Attività selezionate e materiali";
      const zoneColumns = [{
        key: "priorityRank",
        label: "Priorità",
        align: "right",
        render: r => `#${r.priorityRank}`
      }, {
        key: "name",
        label: "Zona"
      }, {
        key: "assignedFlyers",
        label: "Assegnati",
        align: "right",
        render: r => `${formatIntegerIT(r.assignedFlyers)} pz.`
      }, {
        key: "requiredFlyers",
        label: "Fabbisogno zona",
        align: "right",
        render: r => `${formatIntegerIT(r.requiredFlyers)} pz.`
      }, {
        key: "coveragePct",
        label: "Copertura fabbisogno zona",
        align: "right",
        render: r => r.coveragePct == null ? "Dato non disponibile" : formatPercentIT(r.coveragePct, Number.isInteger(r.coveragePct) ? 0 : 1)
      }, {
        key: "status",
        label: "Stato",
        render: r => r.status === "full" ? "Completa" : r.status === "partial" ? "Parziale" : "Esclusa"
      }];
      const zoneRows = step2TruthModel.allocation.rows.map(row => ({
        ...row,
        priorityValue: Math.max(1, step2TruthModel.allocation.rows.length - row.priorityRank + 1),
        priorityLabel: `Priorità #${row.priorityRank}`
      }));
      const priorityMax = Math.max(...zoneRows.map(r => r.priorityValue || 0), 1);

      // Panoramica — max 6 KPI per servizio, mai valori inventati (unavailable quando manca una vera fonte)
      let overviewKpis = [];
      if (isResidentialStep2) {
        const territorialFamiliesLabel = areaMode === "radius" ? "Famiglie/cassette stimate nel raggio" : "Famiglie/cassette stimate nel territorio";
        overviewKpis = [{
          label: `${territoryPluralLabel} coinvolti`,
          value: step2TruthModel.zones.involved,
          color: "#60A5FA",
          unavailable: !(step2TruthModel.zones.involved > 0)
        }, {
          label: territorialFamiliesLabel,
          value: formatIntegerIT(step2ViewModel.primaryFamiliesValue),
          color: "#4ADE80",
          unavailable: !(step2ViewModel.primaryFamiliesValue > 0),
          source: areaMode === "radius" ? "Modello operativo VolantiniPro — raggio selezionato" : "Modello operativo VolantiniPro"
        }, {
          label: "Quantità inserita",
          value: step2TruthModel.quantity.inserted == null ? null : formatIntegerIT(step2TruthModel.quantity.inserted),
          unit: "pz.",
          color: "#38BDF8",
          unavailable: step2TruthModel.quantity.inserted == null
        }, {
          label: "Quantità consigliata",
          value: formatIntegerIT(step2TruthModel.quantity.recommendedRequirement),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: !(step2TruthModel.quantity.recommendedRequirement > 0)
        }, {
          label: "Copertura scenario corrente",
          value: step2CoverageFullLabel,
          color: "#38BDF8",
          unavailable: step2CoverageFullLabel == null
        }, {
          label: "Score D2D",
          value: `${Math.round(Number(zoneVerdict?.score || 0))}/100`,
          color: "#4ADE80"
        }];
      } else if (isMovementStep2) {
        overviewKpis = [{
          label: "POI rilevati",
          value: fetchedPois.length,
          color: "#38BDF8",
          unavailable: !(fetchedPois.length > 0)
        }, {
          label: "POI utilizzabili",
          value: pois.length,
          color: "#38BDF8",
          unavailable: !(pois.length > 0)
        }, {
          label: "POI selezionati",
          value: selectedOperationalPois.length,
          color: "#A855F7",
          unavailable: selectedOperationalPois.length < 1
        }, {
          label: "Quantità inserita",
          value: step2TruthModel.quantity.inserted == null ? null : formatIntegerIT(step2TruthModel.quantity.inserted),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: step2TruthModel.quantity.inserted == null
        }, {
          label: "Fabbisogno operativo",
          value: formatIntegerIT(operationalRecommended),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: !(operationalRecommended > 0)
        }, {
          label: "Score H2H",
          value: `${Math.round(Number(zoneVerdict?.score || 0))}/100`,
          color: "#38BDF8"
        }];
      } else {
        overviewKpis = [{
          label: "Attività disponibili",
          value: formatIntegerIT(serviceKpis?.businesses || pois.length || 0),
          color: "#FB923C",
          unavailable: !(serviceKpis?.businesses > 0 || pois.length > 0)
        }, {
          label: "Attività selezionate",
          value: selectedOperationalPois.length,
          color: "#A78BFA",
          unavailable: selectedOperationalPois.length < 1
        }, {
          label: "Materiali necessari",
          value: businessMaterialPlan?.materialsRequired == null ? null : formatIntegerIT(businessMaterialPlan.materialsRequired),
          unit: businessMaterialPlan?.materialsRequired == null ? "" : "pz.",
          color: "#4ADE80",
          unavailable: businessMaterialPlan?.materialsRequired == null
        }, {
          label: "Materiali residui",
          value: businessMaterialPlan?.materialsRemaining == null ? null : formatIntegerIT(businessMaterialPlan.materialsRemaining),
          unit: businessMaterialPlan?.materialsRemaining == null ? "" : "pz.",
          color: "#38BDF8",
          unavailable: businessMaterialPlan?.materialsRemaining == null
        }, {
          label: "Materiali mancanti",
          value: businessMaterialPlan?.materialsMissing == null ? null : formatIntegerIT(businessMaterialPlan.materialsMissing),
          unit: businessMaterialPlan?.materialsMissing == null ? "" : "pz.",
          color: "#FCA5A5",
          unavailable: businessMaterialPlan?.materialsMissing == null
        }, {
          label: "Addetti consigliati",
          value: businessOperationalPlan?.recommendedOperators ?? null,
          color: "#A78BFA",
          unavailable: businessOperationalPlan?.recommendedOperators == null
        }];
      }
      const topZonesPreview = zoneRows.slice(0, 3).map(r => ({
        id: r.id,
        name: r.name,
        value: r.priorityValue,
        valueLabel: r.priorityLabel
      }));
      const recommendationConfidence = step2TruthModel.confidence.recommendation;
      const reliability = {
        label: recommendationConfidence.label,
        detail: `${recommendationConfidence.available}/${recommendationConfidence.total} fonti e modelli disponibili. ${recommendationConfidence.limitation || ""}`.trim()
      };

      // Mobilità e POI (H2H)
      const poiCounts = {};
      (pois || []).forEach(poi => {
        const key = poi.category || "Altro";
        poiCounts[key] = (poiCounts[key] || 0) + 1;
      });
      const poiByCategory = Object.entries(poiCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({
        label,
        value
      }));
      const poiMax = Math.max(...poiByCategory.map(c => c.value), 1);

      // Imprese e aree produttive (Business) — topCatsReal: FIX del bug SEZIONE 2 originale (nessun fallback hardcoded)
      const topCatsReal = Array.isArray(b2bKpiZone?.topCats) ? b2bKpiZone.topCats.map(c => ({
        label: c.label || c.name,
        pct: c.pct || 0
      })) : [];
      const sourceRegistry = step2TruthModel.sources;
      const connectedSources = sourceRegistry.filter(s => s.connected).length;
      const recommendation = {
        strategy: requiredFlyers <= 0 || selZones.length === 0 ? "Selezione area non ancora finalizzata." : isResidentialStep2 ? "Seguire l'ordine di priorità dell'allocazione corrente, basato sul fabbisogno stimato delle zone selezionate." : isMovementStep2 ? pois.length > 0 || transportState?.available ? "Valutare per prime le zone con POI o nodi TPL effettivamente restituiti; il dato indica attrazione potenziale, non flusso pedonale misurato." : "Analisi parziale: POI e trasporto non sono collegati, quindi non viene proposta una priorità di attrazione." : pois.length > 0 ? "Valutare per prime le zone con attività POI effettivamente restituite; aree produttive, ATECO e punti di consegna non sono disponibili." : "Analisi parziale: non è collegato un censimento imprese, ATECO o aree produttive; non viene simulata una priorità B2B completa.",
        priorityZones: zoneRows.slice(0, 2).map(r => r.name).join(", ") || "Nessuna zona prioritaria disponibile.",
        criticalities: operationalAdvice.shortage > 0 ? `Quantità insufficiente per copertura completa (mancano ${formatIntegerIT(operationalAdvice.shortage)} pz.).` : operationalAdvice.factors.length ? operationalAdvice.factors.join("; ") : "Nessuna criticità operativa rilevata.",
        alternative: coverageDecision === "manual" && manualFlyers ? `Scenario personalizzato: ${formatIntegerIT(Number(manualFlyers))} pz.` : `Scenario consigliato: ${formatIntegerIT(step2ViewModel.recommendedFlyersValue)} pz.`
      };
      const scoreComponentNames = Array.isArray(zoneVerdict?.components) ? zoneVerdict.components.map(component => component?.name).filter(Boolean) : [];
      const scoreDescription = scoreComponentNames.length ? `Indicatore interno calcolato da: ${scoreComponentNames.join(", ")}. Non e un dato ufficiale ISTAT.` : "Indicatore interno calcolato dalle componenti effettivamente disponibili per questa configurazione. Non e un dato ufficiale ISTAT.";
      const reportProps = {
        truthModel: step2TruthModel,
        service: {
          key: svcKey,
          title: activeServiceTitle
        },
        territory: {
          label: step2TruthModel.territory.label,
          modeLabel,
          zoneCount,
          zoneStats: step2TruthModel.zones
        },
        dataStatusLabel: `${connectedSources}/${sourceRegistry.length} fonti e modelli disponibili`,
        lastUpdateLabel: "riferimenti restituiti indicati nella sezione Fonti",
        onBack: () => setIsAdminView(false),
        quantity: {
          available: !isResidentialStep2 || step2ViewModel.hasUsableCoverageData,
          inserted: step2TruthModel.quantity.current,
          originalInserted: step2TruthModel.quantity.inserted,
          baseRequirement: step2TruthModel.quantity.baseRequirement,
          operationalMargin: step2TruthModel.quantity.operationalMargin,
          recommended: step2TruthModel.quantity.recommendedRequirement,
          manual: manualFlyers,
          decision: coverageDecision,
          onSelectDecision: selectCoverageQuantityDecision,
          onManualChange: updateManualFlyersQuantity,
          maximum: operationalMaximum,
          days: step2TruthModel.duration.days,
          operatorCount: step2TruthModel.duration.operatorCount,
          showOperators: isResidentialStep2,
          dailyCapacity: D2D_DAILY_CAPACITY,
          showDailyCapacity: isResidentialStep2,
          quantityForDays: step2TruthModel.duration.scenarioQuantity,
          quotient: step2TruthModel.duration.operatorDays,
          coveragePctLabel: step2CoverageFullLabel,
          coverageFormula: step2TruthModel.coverage.formula,
          shortage: step2TruthModel.quantity.missing,
          surplus: step2TruthModel.quantity.surplus
        },
        coverage: {
          value: step2TruthModel.coverage.operationalPct,
          label: step2CoverageFullLabel,
          denominator: step2TruthModel.coverage.denominator
        },
        overviewKpis,
        topZonesPreview,
        topZonesMax: Math.max(...topZonesPreview.map(z => z.value || 0), 1),
        advice: operationalAdvice,
        reliability,
        confidence: step2TruthModel.confidence,
        zoneRows,
        zoneColumns,
        zoneEyebrow,
        priorityMax,
        isMilanoNil: isNilAnalysis && step2ViewModel.availableNilCount > 0,
        nilShowCount: 10,
        nilTotal: step2ViewModel.availableNilCount,
        demographics: {
          totalPopulation,
          totalHouseholds,
          profileDens,
          ageRows,
          familyBreakdownTitle,
          familyBreakdownItems,
          operationalRequirementExplanation
        },
        economy: {
          reddito: aiAgg?.reddito ?? null,
          omiRows,
          omiMeta
        },
        mobility: {
          poiByCategory,
          poiMax,
          transport: transportState,
          hotspotRows: h2hHotspotRadiusRows
        },
        business: {
          bizTotal: serviceKpis?.businesses ?? aiAgg?.bizTotal ?? null,
          competitors: serviceKpis?.competitors ?? null,
          cdIdx: serviceKpis?.cdIdx ?? null,
          topCatsReal,
          rankedRows: businessRadiusRows.map(r => ({
            ...r,
            zoneName: r.zoneName || r.name
          }))
        },
        score: {
          pct: Math.max(0, Math.min(100, Math.round(Number(zoneVerdict?.score || 0)))),
          label: zoneVerdict?.score >= 78 ? "ALTA" : zoneVerdict?.score >= 58 ? "MEDIA" : "BASSA",
          color: zoneVerdict?.score >= 78 ? "#4ADE80" : zoneVerdict?.score >= 58 ? "#60A5FA" : "#FBBF24",
          components: Array.isArray(zoneVerdict?.components) ? zoneVerdict.components : [],
          description: scoreDescription
        },
        recommendation,
        sourceRegistry,
        pdf: {
          busy: false,
          onExport: () => printTerritorialReportPdf({
            generatedAt: Date.now(),
            service: activeServiceTitle,
            territoryLabel: step2TruthModel.territory.label || step2ViewModel.primaryAreaLabel || "Territorio selezionato",
            modeLabel,
            overviewKpis: overviewKpis.map(k => ({
              label: k.label,
              value: k.unavailable ? "Dato non disponibile" : k.value,
              unit: k.unavailable ? "" : k.unit
            })),
            quantity: {
              subtitle: "Bilancio operativo",
              bars: [{
                label: "Quantità scenario corrente",
                value: step2TruthModel.quantity.current,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.current)} pz.`
              }, {
                label: "Fabbisogno base",
                value: step2TruthModel.quantity.baseRequirement,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.baseRequirement)} pz.`
              }, {
                label: "Margine operativo",
                value: step2TruthModel.quantity.operationalMargin,
                valueLabel: `+${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.`
              }, {
                label: "Fabbisogno operativo consigliato",
                value: step2TruthModel.quantity.recommendedRequirement,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.`
              }]
            },
            topZones: zoneRows.length ? {
              columns: zoneColumns.map(c => ({
                key: c.key,
                label: c.label,
                render: c.render
              })),
              rows: zoneRows.slice(0, 10)
            } : null,
            demographics: {
              totalPopulation,
              totalHouseholds,
              profileDens,
              operationalRequirementExplanation
            },
            economy: {
              omiRows,
              omiMeta
            },
            score: {
              pct: Math.round(Number(zoneVerdict?.score || 0)),
              serviceTitle: activeServiceTitle,
              note: scoreDescription
            },
            recommendation,
            sources: sourceRegistry.map(s => ({
              ...s,
              status: s.connected ? "Collegato" : "Non collegato"
            }))
          })
        }
      };
      return <TerritorialReport p={reportProps} truthModel={step2TruthModel} isMobile={isMobile} />;
    })()}
      {/* Section */}
      <div style={{
      display: "grid",
      gridTemplateColumns: isAdminView ? "1fr" : isMobile ? "1fr" : "minmax(0, 1fr) clamp(300px, 22vw, 340px)",
      gap: 16
    }}>
        {isAdminView ? null : <>

        {/* Section */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}>

          {/* MAPPA GRANDE — solo Vista Cliente. */}
          <div style={{
            borderRadius: 14,
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(135deg,#081610 0%,#080f1e 60%,#100819 100%)",
            border: "1px solid rgba(255,255,255,.08)"
          }}>
            {manualPinMode && <div style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              padding: "10px 18px",
              borderRadius: 30,
              background: "#1E3A8A",
              border: "2px solid #60A5FA",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,.6)",
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
                <span style={{
                display: "flex",
                alignItems: "center",
                gap: 6
              }}><Step1Icon name="pin" size={14} /> Clicca su un punto qualsiasi della mappa per calcolare il raggio</span>
                <button onClick={() => setManualPinMode(false)} style={{
                padding: "4px 10px",
                borderRadius: 14,
                border: "none",
                background: "rgba(255,255,255,.2)",
                color: C.white,
                fontSize: 11,
                cursor: "pointer"
              }}>
                  Annulla
                </button>
              </div>}
            {isRadiusMode && radiusKm > 0 && serviceKpis?.coverage != null && <div style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 999,
              pointerEvents: "none",
              padding: "6px 12px",
              borderRadius: 20,
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: C.white
            }}>
                <span style={{
                color: "#38BDF8"
              }}>{formatRadiusLabel(radiusKm)}</span>
                <span style={{
                color: "rgba(255,255,255,0.4)"
              }}>·</span>
                <span style={{
                color: getCoverageStatus(serviceKpis.coverage) === "coperto" ? "#22C55E" : getCoverageStatus(serviceKpis.coverage) === "parziale" ? "#FACC15" : "#F87171"
              }}>
                  {sharedCoveragePctText} copertura
                </span>
              </div>}
            <Step2Map city={mapCityForStep2} radius={isRadiusMode ? Number(radiusKm) || Number(radius) || 3 : radiusKm} svcType={svcType} serviceColor={col} zonesWithCoords={zonesWithCoords} selected={selected} onToggleZone={toggleZone} apiData={apiData} targetColor={targetBusinessMeta?.color || '#a78bfa'} activeLayers={activeMapLayers} settori={sectors} pois={pois} loadingPois={poiLoading} poiEmptySectorLabel={poiEmptySectorLabel} operationalPoints={step1OperationalPoints} poiAssignments={poiAssignments} onTogglePoi={togglePoiAssignment} focusPoiId={focusedPoiId} focusPoiNonce={focusedPoiNonce} businessConfig={isBusinessStep2 ? {
              deliveryLabel: businessOptionLabel(BUSINESS_DELIVERY_METHODS, data.businessDeliveryMethod),
              recipientLabel: businessOptionLabel(BUSINESS_RECIPIENTS, data.businessPreferredRecipient)
            } : null} civiciState={civiciState} onLayerToggle={id => {
              if (id === "civici" && !civiciAvailable) return;
              if (id === "settori" && !sectors) return;
              setActiveMapLayers(prev => ({
                ...prev,
                [id]: !prev[id]
              }));
            }} campaignZones={data.campaignZones} activeZoneId={data.activeZoneId} onSelectZone={selectCampaignZone} municipalityBoundary={
            // In Comune mode (isComuneMode): always pass the boundary — it is the territory itself.
            // mapConfiniOn does NOT gate the Comune polygon; it only gates the boundary in Raggio/address mode.
            // hiddenBoundaries (per-comune toggle from the UI) still applies.
            // Indirizzo non confermato: il confine comune viene passato come contesto leggero tratteggiato.
            (isComuneMode || mapConfiniOn && searchMode === "address") && municipalityBoundary ? Array.isArray(municipalityBoundary) ? municipalityBoundary.filter(b => !hiddenBoundaries.includes(normalizeMunicipalityName(b?.name || ""))) : hiddenBoundaries.includes(normalizeMunicipalityName(municipalityBoundary?.name || city?.label || city?.name || "")) ? null : municipalityBoundary : null} isMunicipalityMode={isComuneMode && !hasUnconfirmedAddressPoint} unconfirmedAddressMode={hasUnconfirmedAddressPoint} nilMode={isNilManualMode} coveragePolygons={mapCoverageZones} zoneAllocationById={zoneAllocationById} boundaryKpis={boundaryKpisForMap} themeMode={viewMode !== "distribuzione"} activeLayerId={activeLay?.id || null} zoneCoverageById={zoneCoverageById} basemap={mapBasemap} mapConfiniOn={mapConfiniOn} onToggleConfini={() => setMapConfiniOn(v => !v)} dusafLanduse={dusafLanduse} omiInfo={omiInfo} onBasemapToggle={() => setMapBasemap(b => b === "standard" ? "satellite" : "standard")} onMapClick={manualPinMode ? handleManualMapClick : null} />
            {showTerritoryData && (gisLoading || gisTimedOut) && <div style={{
              position: "absolute",
              inset: 0,
              zIndex: 760,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: gisTimedOut ? "rgba(8,15,30,.18)" : "rgba(8,15,30,.08)"
            }}>
                <div style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(8,15,30,.88)",
                border: `1px solid ${gisTimedOut ? "rgba(239,68,68,.26)" : "rgba(255,255,255,.12)"}`,
                color: gisTimedOut ? "#FCA5A5" : C.white,
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                boxShadow: "0 10px 28px rgba(0,0,0,.34)",
                backdropFilter: "blur(10px)"
              }}>
                  {gisTimedOut ? "Dati non disponibili, riprova o cambia raggio." : "Analisi GIS in corso..."}
                </div>
              </div>}

            {/* Map overlays */}
            <div style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              display: "flex",
              gap: 6
            }}>
              <div style={{
                background: "rgba(8,15,30,.9)",
                backdropFilter: "blur(8px)",
                borderRadius: 6,
                padding: "4px 9px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.5)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                CartoDB – OSM
              </div>
              {isAdminView && activeLay && viewMode !== "distribuzione" && <div style={{
                background: "rgba(8,15,30,.88)",
                borderRadius: 6,
                padding: "4px 9px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.55)",
                border: "1px solid rgba(255,255,255,.06)"
              }}>
                  Layer: <b style={{
                  color: col
                }}>{activeLay.label}</b>
                </div>}
            </div>
            {city && selZones.length > 0 && searchMode !== "municipality" && <div style={{
              position: "absolute",
              top: 58,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,15,30,.82)",
              border: `1px solid ${col}55`,
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: F.sans,
              fontSize: 9,
              fontWeight: 700,
              color: C.white
            }}>
                {selZones.length} {selZones.length === 1 ? "zona" : "zone"} selezionate
              </div>}
            {/* Badge "Intero comune" — visibile solo in modalità comune, e
                solo dopo conferma: mentre un indirizzo non è confermato non
                è ancora vero che la distribuzione è "limitata al confine
                comunale" (potrebbe diventare un raggio o una NIL). */}
            {searchMode === "municipality" && city && !hasUnconfirmedAddressPoint && <div style={{
              position: "absolute",
              top: 10,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,22,12,.92)",
              border: "1px solid rgba(34,197,94,.45)",
              borderRadius: 8,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7
            }}>
                <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22C55E",
                flexShrink: 0
              }} />
                <div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#22C55E"
                }}>Intero comune: {city.label || city.name}</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.5)",
                  marginTop: 1
                }}>Distribuzione limitata al confine comunale</div>
                </div>
              </div>}
            {hasUnconfirmedAddressPoint && <div style={{
              position: "absolute",
              top: 10,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,15,30,.92)",
              border: "1px solid rgba(59,130,246,.45)",
              borderRadius: 8,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7
            }}>
                <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#60A5FA",
                flexShrink: 0
              }} />
                <div>
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#60A5FA"
                }}><Step1Icon name="pin" size={11} /> Indirizzo selezionato</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.5)",
                  marginTop: 1
                }}>{selectedSearchPoint?.label || "Scegli raggio o comune completo"}</div>
                </div>
              </div>}
            {showTerritoryData && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 230
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: "#22C55E",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>{isNilAnalysis ? "NIL Milano" : "Residential territory"}</div>
                {residentialRadiusRows.slice(0, 4).map(r => <div key={r.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: getComuneColor(r.id),
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)",
                  flex: 1
                }}>{r.name}</span>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800,
                  color: C.white
                }}>{r.strength}/100</span>
                  </div>)}
              </div>}
            {isBusinessStep2 && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 220
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: targetBusinessMeta.color,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>Commercial intelligence</div>
                {[{
                c: targetBusinessMeta.color,
                l: "attività target / categoria"
              }, {
                c: C.red,
                l: "competitor rilevati"
              }, {
                c: C.purple,
                l: "pocket commerciali forti"
              }].map(({
                c,
                l
              }) => <div key={l} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c,
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)"
                }}>{l}</span>
                  </div>)}
              </div>}
            {isMovementStep2 && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 230
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: C.blue,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>Movement intelligence</div>
                {[{
                c: H2H_HOTSPOT_META.transit.color,
                l: "transit / stazioni"
              }, {
                c: H2H_HOTSPOT_META.school.color,
                l: "scuole, eventi, anchor"
              }, {
                c: H2H_HOTSPOT_META.retail.color,
                l: "POI e strade attive"
              }, {
                c: C.blue,
                l: "flusso e pass-through"
              }].map(({
                c,
                l
              }) => <div key={l} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c,
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)"
                }}>{l}</span>
                  </div>)}
              </div>}
            {/* Legend tematica overlay */}
            {viewMode === "tematica" && activeLay && zonesInRadius.length > 0 && <div style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              background: "rgba(8,15,30,.9)",
              backdropFilter: "blur(8px)",
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid rgba(255,255,255,.10)",
              minWidth: 130
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: col,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: ".06em"
              }}>Layer attivo: {activeLay.label}</div>
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: F.sans,
                fontSize: 8,
                color: "rgba(255,255,255,.4)",
                marginBottom: 3
              }}>
                  <span>{thMin > 0 ? activeLay.fmt(Math.round(thMin)) : "Basso"}</span><span>{thMax > 0 ? activeLay.fmt(Math.round(thMax)) : "Alto"}</span>
                </div>
                <div style={{
                width: "100%",
                height: 6,
                borderRadius: 3,
                background: `linear-gradient(to right,${activeLay.lo},${activeLay.hi})`
              }} />
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(255,255,255,.28)",
                marginTop: 2
              }}>
                  <span>basso</span><span>medio</span><span>alto</span>
                </div>
                {zonesWithCoords.filter(z => !z.metricColor).length > 0 && <div style={{
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(248,113,113,.7)",
                marginTop: 3
              }}>
                    {zonesWithCoords.filter(z => !z.metricColor).length} zone: dato non disponibile
                  </div>}
                <div style={{
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(255,255,255,.22)",
                marginTop: 2
              }}>Fonte: {truthfulSourceLabel(activeLay.src)}</div>
              </div>}

          </div>

          {(isMovementStep2 || isBusinessStep2) && city && <div style={{
            marginTop: 12,
            background: "rgba(255,255,255,.035)",
            border: `1px solid ${isBusinessStep2 ? "rgba(167,139,250,.24)" : "rgba(56,189,248,.24)"}`,
            borderRadius: 12,
            overflow: "hidden"
          }}>
              <div style={{
              padding: "12px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                <div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 850,
                  color: C.white
                }}>{isBusinessStep2 ? "Attività e aziende da visitare" : "POI da presidiare"}</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.45)",
                  marginTop: 3
                }}>
                    Target: {distributionTargetSelection.map(target => isBusinessStep2 ? businessCategoryLabel(target) : ACTIVITY_TARGET_LABELS[target] || target).join(", ") || "Tutte le categorie compatibili"}. Clicca un pin oppure usa la selezione automatica.
                  </div>
                </div>
                <div style={{
                display: "flex",
                gap: 8
              }}>
                  <span style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.05)",
                  color: "rgba(255,255,255,.62)",
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 750
                }}>{pois.length} trovati</span>
                  <span style={{
                  padding: "5px 8px",
                  borderRadius: 8,
                  background: isBusinessStep2 ? "rgba(167,139,250,.12)" : "rgba(56,189,248,.12)",
                  color: isBusinessStep2 ? "#C4B5FD" : "#7DD3FC",
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800
                }}>{selectedOperationalPois.length} selezionati</span>
                </div>
              </div>
              <div style={{
              padding: "10px 14px",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              borderBottom: "1px solid rgba(255,255,255,.07)",
              background: "rgba(5,12,24,.25)"
            }}>
                {!isBusinessStep2 && <label style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.55)"
              }}>
                  Promoter
                  <select value={operatorCountForPoiAssignment} onChange={event => changeOperatorCountInStep2(event.target.value)} style={{
                  padding: "7px 9px",
                  borderRadius: 8,
                  background: "#0B1526",
                  border: "1px solid rgba(255,255,255,.14)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 9
                }}>
                    {PROMOTER_COUNT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
                  </select>
                </label>}
                <button type="button" onClick={selectAndBalanceAllPois} disabled={pois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(34,197,94,.28)",
                background: "rgba(34,197,94,.10)",
                color: "#86EFAC",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 800,
                cursor: pois.length ? "pointer" : "not-allowed",
                opacity: pois.length ? 1 : .45
              }}>{isBusinessStep2 ? "Seleziona automaticamente" : "Seleziona tutti e assegna"}</button>
                {!isBusinessStep2 && <button type="button" onClick={rebalanceSelectedPois} disabled={selectedOperationalPois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(96,165,250,.25)",
                background: "rgba(96,165,250,.08)",
                color: "#93C5FD",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 750,
                cursor: selectedOperationalPois.length ? "pointer" : "not-allowed",
                opacity: selectedOperationalPois.length ? 1 : .45
              }}>Bilancia tra operatori</button>}
                <button type="button" onClick={clearPoiAssignments} disabled={selectedOperationalPois.length === 0} style={{
                padding: "7px 10px",
                borderRadius: 8,
                border: "1px solid rgba(248,113,113,.20)",
                background: "rgba(248,113,113,.07)",
                color: "#FCA5A5",
                fontFamily: F.sans,
                fontSize: 9,
                fontWeight: 750,
                cursor: selectedOperationalPois.length ? "pointer" : "not-allowed",
                opacity: selectedOperationalPois.length ? 1 : .45
              }}>Rimuovi tutti</button>
              </div>
              {!isBusinessStep2 && <div style={{
              padding: "10px 14px",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit,minmax(210px,1fr))",
              gap: 8,
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                {operatorSchedules.slice(0, operatorCountForPoiAssignment).map((schedule, index) => <div key={schedule.id || index} style={{
                padding: 9,
                borderRadius: 9,
                background: "rgba(255,255,255,.025)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800,
                  color: C.white,
                  marginBottom: 7
                }}>{isBusinessStep2 ? "Addetto" : "Promoter"} {index + 1}</div>
                    <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 82px",
                  gap: 6
                }}>
                      <select value={schedule.timeSlot || ""} onChange={event => updateOperatorScheduleInStep2(index, {
                    timeSlot: event.target.value
                  })} style={{
                    minWidth: 0,
                    padding: "7px 6px",
                    borderRadius: 7,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.10)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 8
                  }}>
                        {PROMOTER_TIME_SLOT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select value={schedule.serviceDurationHours || 4} onChange={event => updateOperatorScheduleInStep2(index, {
                    serviceDurationHours: Number(event.target.value)
                  })} style={{
                    padding: "7px 6px",
                    borderRadius: 7,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.10)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 8
                  }}>
                        {PROMOTER_SHIFT_DURATION_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.value} ore</option>)}
                      </select>
                    </div>
                  </div>)}
              </div>}
              <div style={{
              borderBottom: "1px solid rgba(255,255,255,.07)"
            }}>
                <div style={{
                padding: "10px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap"
              }}>
                  <div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 850,
                    color: C.white
                  }}>{isBusinessStep2 ? "Attività trovate nell'area" : "Luoghi trovati dentro il raggio"}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 8,
                    color: "rgba(255,255,255,.42)",
                    marginTop: 2
                  }}>{isBusinessStep2 ? "Seleziona le attività da includere. Gli addetti saranno stimati nel piano operativo." : "Scegli il promoter direttamente accanto al nome del luogo."}</div>
                  </div>
                  <input aria-label={isBusinessStep2 ? "Cerca attività, indirizzo o categoria" : "Cerca nome, via o categoria"} value={poiListSearch} onChange={event => setPoiListSearch(event.target.value)} placeholder={isBusinessStep2 ? "Cerca attività, indirizzo o categoria" : "Cerca nome, via o categoria"} style={{
                  width: isMobile ? "100%" : 240,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#0B1526",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 9
                }} />
                </div>
                {isBusinessStep2 && <div role="group" aria-label="Filtri attività Business" style={{
                padding: "0 14px 10px",
                display: "flex",
                gap: 6,
                flexWrap: "wrap"
              }}>
                    {[["all", "Tutte", pois.length], ["selected", "Selezionate", selectedOperationalPois.length], ["priority", "Prioritarie", pois.filter(p => Number(p.priority || 0) >= 8).length], ["shops", "Negozi", businessPoiCategoryCounts.shops || 0], ["food", "Ristorazione", businessPoiCategoryCounts.food || 0], ["offices", "Uffici", businessPoiCategoryCounts.offices || 0], ["health", "Sanitario", businessPoiCategoryCounts.health || 0], ["automotive", "Automotive", businessPoiCategoryCounts.automotive || 0], ["industry", "Industria", businessPoiCategoryCounts.industry || 0], ["other", "Altro", businessPoiCategoryCounts.other || 0]].filter(([value,, count]) => value === "all" || value === "selected" || value === "priority" || count > 0).map(([value, label, count]) => {
                  const active = businessPoiFilter === value;
                  return <button key={value} type="button" aria-pressed={active} onClick={() => setBusinessPoiFilter(value)} style={{
                    padding: "6px 9px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "rgba(167,139,250,.58)" : "rgba(255,255,255,.10)"}`,
                    background: active ? "rgba(167,139,250,.14)" : "rgba(255,255,255,.025)",
                    color: active ? "#DDD6FE" : "#94A3B8",
                    fontFamily: F.sans,
                    fontSize: 8.5,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>{label}{value !== "all" && value !== "selected" && value !== "priority" ? ` (${count})` : ""}</button>;
                })}
                  </div>}
                {isMovementStep2 && <div role="group" aria-label="Filtri categoria POI" style={{
                padding: "0 14px 10px",
                display: "flex",
                gap: 6,
                flexWrap: "wrap"
              }}>
                    {[["all", "Tutti", pois.length], ["scuole", "Scuole", h2hPoiCategoryCounts.scuole || 0], ["universita", "Università", h2hPoiCategoryCounts.universita || 0], ["palestre", "Palestre e sport", h2hPoiCategoryCounts.palestre || 0], ["stazioni", "Stazioni e fermate", h2hPoiCategoryCounts.stazioni || 0], ["commerciale", "Commerciale", h2hPoiCategoryCounts.commerciale || 0], ["altro", "Altro", h2hPoiCategoryCounts.altro || 0]].filter(([value,, count]) => value === "all" || count > 0).map(([value, label, count]) => {
                  const active = h2hPoiFilter === value;
                  return <button key={value} type="button" aria-pressed={active} onClick={() => setH2hPoiFilter(value)} style={{
                    padding: "6px 9px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "rgba(56,189,248,.58)" : "rgba(255,255,255,.10)"}`,
                    background: active ? "rgba(56,189,248,.14)" : "rgba(255,255,255,.025)",
                    color: active ? "#BAE6FD" : "#94A3B8",
                    fontFamily: F.sans,
                    fontSize: 8.5,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>{label}{value !== "all" ? ` (${count})` : ""}</button>;
                })}
                  </div>}
                {visiblePoisForAssignment.length === 0 ? <div role="status" style={{
                padding: "12px 14px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "#FCD34D",
                background: "rgba(245,158,11,.05)"
              }}>{isBusinessStep2 ? "Nessuna attività compatibile trovata nel raggio selezionato. Riduci i filtri o amplia l'area." : "Nessun luogo compatibile trovato. Controlla il target scelto oppure aumenta il raggio."}</div> : <div style={{
                maxHeight: 320,
                overflowY: "auto"
              }}>
                    {visiblePoisForAssignment.map((poi, index) => {
                  const assignment = poiAssignments[poi.id] || null;
                  const comuneLabel = poiComuneResolver(poi);
                  const isFocused = focusedPoiId === poi.id;
                  return <div key={poi.id} role="button" tabIndex={0} aria-pressed={isFocused} onClick={() => focusPoiRow(poi.id)} onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusPoiRow(poi.id);
                    }
                  }} style={{
                    padding: "9px 14px",
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 155px",
                    gap: 10,
                    alignItems: "center",
                    borderTop: index ? "1px solid rgba(255,255,255,.05)" : "none",
                    background: assignment ? "rgba(34,197,94,.045)" : "transparent",
                    outline: isFocused ? "1px solid rgba(125,211,252,.55)" : "none",
                    cursor: "pointer"
                  }}>
                          <div style={{
                      minWidth: 0
                    }}>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 780,
                        color: C.white
                      }}>{poi.name || "Luogo senza nome"}</div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 8,
                        color: "rgba(255,255,255,.43)",
                        marginTop: 3
                      }}>{poi.category || "Categoria non indicata"}{poi.address ? ` · ${poi.address}` : " · indirizzo non disponibile"} · {comuneLabel || "Comune non determinato"}</div>
                            {isBusinessStep2 && <div style={{
                        fontFamily: F.sans,
                        fontSize: 7.5,
                        color: "rgba(167,139,250,.72)",
                        marginTop: 3
                      }}>Fonte: {poi.source || "Fonte territoriale collegata"}{poi.openingHours ? ` · Orari: ${poi.openingHours}` : ""}</div>}
                          </div>
                          {isBusinessStep2 ? <button type="button" onClick={event => {
                      event.stopPropagation();
                      togglePoiAssignment(poi);
                    }} aria-pressed={Boolean(assignment)} style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: 8,
                      background: assignment ? "rgba(34,197,94,.10)" : "#0B1526",
                      border: `1px solid ${assignment ? "rgba(34,197,94,.30)" : "rgba(255,255,255,.12)"}`,
                      color: assignment ? "#86EFAC" : C.white,
                      fontFamily: F.sans,
                      fontSize: 9,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}>{assignment ? "✓ Selezionata" : "Seleziona attività"}</button> : <select value={assignment?.operatorNumber || ""} onClick={event => event.stopPropagation()} onChange={event => event.target.value ? assignPoiToOperator(poi.id, event.target.value) : togglePoiAssignment(poi)} style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: 8,
                      background: assignment ? "rgba(34,197,94,.10)" : "#0B1526",
                      border: `1px solid ${assignment ? "rgba(34,197,94,.30)" : "rgba(255,255,255,.12)"}`,
                      color: assignment ? "#86EFAC" : C.white,
                      fontFamily: F.sans,
                      fontSize: 9
                    }}>
                              <option value="">{assignment ? "Rimuovi assegnazione" : "Assegna a..."}</option>
                              {Array.from({
                        length: operatorCountForPoiAssignment
                      }, (_, operatorIndex) => <option key={operatorIndex + 1} value={operatorIndex + 1}>Promoter {operatorIndex + 1}</option>)}
                            </select>}
                        </div>;
                })}
                  </div>}
              </div>
              {isBusinessStep2 && (selectedOperationalPois.length === 0 ? <div style={{
              padding: "14px",
              fontFamily: F.sans,
              fontSize: 10,
              color: "rgba(255,255,255,.48)"
            }}>
                  Nessuna attività selezionata. Seleziona i marker sulla mappa oppure usa “Seleziona automaticamente”.
                </div> : <div style={{
              maxHeight: 230,
              overflowY: "auto"
            }}>
                  {selectedOperationalPois.map((poi, index) => <div key={poi.id} style={{
                padding: "10px 14px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 110px 74px",
                gap: 10,
                alignItems: "center",
                borderTop: index ? "1px solid rgba(255,255,255,.055)" : "none"
              }}>
                      <div style={{
                  minWidth: 0
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 750,
                    color: C.white,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}>{poi.name}</div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 8,
                    color: "rgba(255,255,255,.42)",
                    marginTop: 2
                  }}>{poi.category}{poi.address ? ` · ${poi.address}` : ""}</div>
                      </div>
                      <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  color: "rgba(255,255,255,.45)",
                  fontFamily: F.sans,
                  fontSize: 8
                }}>
                          Copie
                          <input type="number" min="1" value={poi.copies ?? ""} placeholder="Da definire" onChange={event => updatePoiCopies(poi.id, event.target.value)} style={{
                    width: 58,
                    padding: "7px 5px",
                    borderRadius: 8,
                    background: "#0B1526",
                    border: "1px solid rgba(255,255,255,.12)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 9
                  }} />
                      </label>
                      <button type="button" onClick={() => togglePoiAssignment(poi)} style={{
                  padding: "7px 8px",
                  borderRadius: 8,
                  background: "rgba(248,113,113,.08)",
                  border: "1px solid rgba(248,113,113,.2)",
                  color: "#FCA5A5",
                  fontFamily: F.sans,
                  fontSize: 8,
                  fontWeight: 750,
                  cursor: "pointer"
                }}>Rimuovi</button>
                    </div>)}
                </div>)}
              {isBusinessStep2 && selectedOperationalPois.length > 0 && <div style={{
              padding: 14,
              borderTop: "1px solid rgba(167,139,250,.18)",
              background: "rgba(76,29,149,.08)"
            }}>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 900,
                color: "#DDD6FE",
                marginBottom: 10
              }}>Riepilogo materiali e piano operativo</div>
                  <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,minmax(0,1fr))",
                gap: 8
              }}>
                    {[["Attività selezionate", businessMaterialPlan?.selectedActivities ?? 0], ["Materiali necessari", businessMaterialPlan?.materialsRequired == null ? "Da definire" : `${businessMaterialPlan.materialsRequired.toLocaleString("it-IT")} pz.`], ["Materiali residui", businessMaterialPlan?.materialsRemaining == null ? "Da definire" : `${businessMaterialPlan.materialsRemaining.toLocaleString("it-IT")} pz.`], ["Materiali mancanti", businessMaterialPlan?.materialsMissing == null ? "Da definire" : `${businessMaterialPlan.materialsMissing.toLocaleString("it-IT")} pz.`]].map(([label, value]) => <div key={label} style={{
                  padding: 10,
                  borderRadius: 9,
                  background: "rgba(5,12,24,.45)",
                  border: "1px solid rgba(255,255,255,.07)"
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 7.5,
                    color: "rgba(255,255,255,.42)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em"
                  }}>{label}</div>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 13,
                    fontWeight: 900,
                    color: label === "Materiali mancanti" && Number(businessMaterialPlan?.materialsMissing) > 0 ? "#FCA5A5" : "#F8FAFC",
                    marginTop: 4
                  }}>{value}</div>
                      </div>)}
                  </div>
                  <div style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 9,
                background: "rgba(5,12,24,.38)",
                color: "#CBD5E1",
                fontFamily: F.sans,
                fontSize: 9,
                lineHeight: 1.55
              }}>
                    {businessOperationalPlan?.calculable ? <>Stima: <b>{businessOperationalPlan.minutesPerVisit} min/visita</b>, <b>{businessOperationalPlan.visitsPerOperatorDay} visite per addetto/giorno</b>, <b>{businessOperationalPlan.operatorDays} giornate-addetto</b>{businessOperationalPlan.recommendedOperators ? ` e ${businessOperationalPlan.recommendedOperators} addetti consigliati nel periodo indicato` : ". Indica un periodo completo per stimare gli addetti."}</> : "Il piano operativo sarà calcolato appena la modalità di consegna e le attività selezionate consentono una stima attendibile."}
                  </div>
                </div>}
            </div>}

          {/* CAP MODE: CAP selezionati */}
          {searchMode === "cap" && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            border: `1px solid ${col}28`,
            overflow: "hidden"
          }}>
              <div style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12
            }}>
                <div>
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                }}>
                    <span style={{
                    fontSize: 14
                  }}></span>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.white
                  }}>CAP selezionati</div>
                    <span style={{
                    padding: "2px 7px",
                    borderRadius: 100,
                    background: `${col}18`,
                    fontFamily: F.sans,
                    fontSize: 10,
                    fontWeight: 700,
                    color: col
                  }}>Modalità CAP</span>
                  </div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)",
                  marginTop: 3
                }}>
                    Solo i CAP selezionati - nessun comune aggiunto automaticamente
                  </div>
                </div>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.35)"
              }}>
                  Budget: <b style={{
                  color: col
                }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                    useGrouping: true
                  })}</b> vol.
                </div>
              </div>
              {selectedCaps.length === 0 ? <div style={{
              padding: "28px",
              textAlign: "center"
            }}>
                  <div style={{
                fontSize: 28,
                marginBottom: 10
              }}></div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 13,
                color: "rgba(255,255,255,.45)",
                marginBottom: 6
              }}>Nessun CAP selezionato</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 11,
                color: "rgba(255,255,255,.28)"
              }}>Digita un codice postale nella barra di ricerca qui sopra</div>
                </div> : <div style={{
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: 6
            }}>
                  {selectedCaps.map(cap => {
                const zone = capDataMap[cap];
                const required = zone ? zCap(zone) : 0;
                const assigned = Math.min(required, flyerQuantityFromStep1);
                return <div key={cap} style={{
                  borderRadius: 10,
                  border: `1px solid ${col}35`,
                  background: `${col}08`,
                  padding: "10px 12px"
                }}>
                        <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start"
                  }}>
                          <div>
                            <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4
                      }}>
                              <span style={{
                          fontSize: 16
                        }}></span>
                              <span style={{
                          fontFamily: F.sans,
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.white
                        }}>CAP {cap}</span>
                              <span style={{
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(251,191,36,.12)",
                          border: "1px solid rgba(251,191,36,.25)",
                          fontFamily: F.sans,
                          fontSize: 9,
                          fontWeight: 700,
                          color: C.yellow
                        }}>Stima</span>
                            </div>
                            {zone && <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.45)",
                        paddingLeft: 24
                      }}>
                                {zone.municipalityName} – ~{zone.families?.toLocaleString("it-IT", {
                          useGrouping: true
                        })} famiglie – {zone.area} km²
                              </div>}
                          </div>
                          <div style={{
                      textAlign: "right"
                    }}>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.white
                      }}>{assigned.toLocaleString("it-IT", {
                          useGrouping: true
                        })} pz.</div>
                            <div style={{
                        fontFamily: F.sans,
                        fontSize: 9,
                        color: "rgba(255,255,255,.3)"
                      }}>consigliati {required.toLocaleString("it-IT", {
                          useGrouping: true
                        })}</div>
                          </div>
                        </div>
                        <div style={{
                    marginTop: 8,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    paddingLeft: 24
                  }}>
                          <span style={{
                      fontFamily: F.sans,
                      fontSize: 9,
                      color: "rgba(255,255,255,.35)"
                    }}>Modalit : Solo CAP – Nessun comune aggiunto</span>
                        </div>
                        <div style={{
                    marginTop: 8,
                    display: "flex",
                    justifyContent: "flex-end"
                  }}>
                          <button onClick={() => {
                      setSelectedCaps(prev => prev.filter(c => c !== cap));
                      setCapDataMap(prev => {
                        const n = {
                          ...prev
                        };
                        delete n[cap];
                        return n;
                      });
                    }} style={{
                      padding: "4px 10px",
                      borderRadius: 7,
                      border: "1px solid rgba(248,113,113,.3)",
                      background: "rgba(34, 197, 94,.08)",
                      color: C.red,
                      fontFamily: F.sans,
                      fontSize: 10,
                      cursor: "pointer"
                    }}>
                            Rimuovi CAP
                          </button>
                        </div>
                      </div>;
              })}
                </div>}
              {selectedCaps.length > 0 && <div style={{
              padding: "12px 14px",
              borderTop: "1px solid rgba(255,255,255,.05)",
              background: "rgba(46,204,138,.04)"
            }}>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: C.green,
                fontWeight: 700,
                marginBottom: 4
              }}> Campagna limitata ai CAP selezionati</div>
                  <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.4)"
              }}>I dati mostrati sono stime. Per aggiungere aree vicine usa i pulsanti qui sotto.</div>
                  <div style={{
                display: "flex",
                gap: 8,
                marginTop: 8
              }}>
                    <button disabled style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.3)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  cursor: "not-allowed"
                }}>+ Aggiungi CAP vicino</button>
                    <button disabled style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.3)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  cursor: "not-allowed"
                }}>+ Aggiungi comune vicino</button>
                  </div>
                </div>}
            </div>}

          {showTerritoryData && (selZones.length > 0 || zonesInRadius.length > 0) && <section className="vp-step2-zone-details" aria-labelledby="vp-step2-zone-details-title">
              <button type="button" className="vp-step2-zone-details__trigger" onClick={() => setShowClientZoneDetails(value => !value)} aria-expanded={showClientZoneDetails} aria-controls="vp-step2-zone-details-panel">
                <span>
                  <strong id="vp-step2-zone-details-title">{showClientZoneDetails ? "Nascondi dettagli zone" : "Mostra dettagli zone"}</strong>
                  <small>{zoneListSourceCount} {isNilAnalysis ? "NIL" : territoryPluralLabel.toLowerCase()} · dati della configurazione corrente</small>
                </span>
                <span aria-hidden="true">{showClientZoneDetails ? "−" : "+"}</span>
              </button>
              {showClientZoneDetails && (() => {
              const detailZones = isMovementStep2 ? h2hMetrics.clusters : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows : sortedResidentialZones;
              
              let sumTarget = 0;
              let sumAssigned = 0;
              let countComplete = 0;
              let countPartial = 0;
              let countExcluded = 0;
              
              const tableRows = detailZones.map((zone, index) => {
                const allocation = zoneAllocationById?.[zone.id] || null;
                const assigned = Math.max(0, Number(allocation?.assignedFlyers || 0));
                const target = isResidentialStep2 ? Number(zone.families || zone.famiglie || zone.households || 0) : isMovementStep2 ? Number(zone.poi || zone.points || zone.transitStops || 0) : Number(zone.targetBiz || zone.businesses || zone.value || 0);
                const coverage = target > 0 ? Math.min(100, (assigned / target) * 100) : 0;
                const missing = Math.max(0, target - assigned);
                const status = assigned <= 0 ? "Escluso" : assigned >= target ? "Completo" : "Parziale";
                
                sumTarget += target;
                sumAssigned += assigned;
                if (status === "Completo") countComplete++;
                else if (status === "Parziale") countPartial++;
                else countExcluded++;
                
                return { zone, index, assigned, target, coverage, missing, status, allocation };
              });
              
              const overallCoverage = sumTarget > 0 ? Math.min(100, (sumAssigned / sumTarget) * 100) : 0;

              return <div id="vp-step2-zone-details-panel" className="vp-step2-zone-details__panel">
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, padding: 12, 
                      background: "rgba(255,255,255,.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,.06)"
                    }}>
                      <div style={{flex: "1 1 45%", display: "flex", flexDirection: "column", gap: 2}}>
                        <span style={{fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase"}}>Comuni nel raggio</span>
                        <strong style={{fontSize: 14, color: C.white}}>{detailZones.length}</strong>
                      </div>
                      <div style={{flex: "1 1 45%", display: "flex", flexDirection: "column", gap: 2}}>
                        <span style={{fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase"}}>Copertura complessiva del fabbisogno</span>
                        <strong style={{fontSize: 14, color: col}}>{formatPercentIT(overallCoverage, 1)}</strong>
                      </div>
                      <div style={{flex: "1 1 100%", display: "flex", gap: 16, marginTop: 4, fontSize: 12}}>
                        <span style={{color: "#86EFAC"}}>• {countComplete} completi</span>
                        <span style={{color: "#FCD34D"}}>• {countPartial} parziali</span>
                        <span style={{color: "#FCA5A5"}}>• {countExcluded} esclusi</span>
                      </div>
                    </div>

                    {showTerritoryData && <div className="vp-step2-zone-details__sort" aria-label="Ordina dettaglio zone">
                        <span>Ordina per</span>
                        {[["relevance", "Priorità"], ["families", "Target"], ["coverage", "Copertura"], ["assigned", "Quantità assegnata"]].map(([id, label]) => <button type="button" key={id} aria-pressed={zoneListSort === id} onClick={() => setZoneListSort(id)}>{label}</button>)}
                      </div>}
                    
                    {!isMobile ? (
                      <table className="vp-step2-zone-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ minWidth: 140, whiteSpace: "nowrap", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Zona / NIL</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>{isResidentialStep2 ? "Famiglie stimate" : isMovementStep2 ? "Pubblico / punti" : "Attività / target"}</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Assegnati</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Mancanti</th>
                            <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Copertura del fabbisogno cassette</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Priorità</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Stato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row) => {
                            const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                            const rowKey = zone.id || zone.name || index;
                            const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;
                            
                            let statusColor = "#FCA5A5";
                            let statusBg = "rgba(248,113,113,.1)";
                            if (status === "Completo") {
                              statusColor = "#86EFAC";
                              statusBg = "rgba(34,197,94,.1)";
                            } else if (status === "Parziale") {
                              statusColor = "#FCD34D";
                              statusBg = "rgba(250,204,21,.1)";
                            }

                            return <tr key={rowKey} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                <th scope="row" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, padding: "8px 12px", textAlign: "left", fontWeight: "normal" }} title={zone.name || zone.label || `Zona ${index + 1}`}>
                                  {zone.name || zone.label || `Zona ${index + 1}`}
                                </th>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px" }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</td>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px" }}>{formatIntegerIT(assigned)}</td>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px", color: missing > 0 ? "rgba(255,255,255,.6)" : "inherit" }}>{formatIntegerIT(missing)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="vp-data-number" style={{ minWidth: 45 }}>{formatPercentIT(coverage, 1)}</span>
                                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden" }}>
                                      <div style={{ width: `${coverage}%`, height: "100%", background: statusColor, borderRadius: 2 }} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{ textAlign: "center", padding: "8px 12px" }}>{priorityLabel}</td>
                                <td style={{ textAlign: "center", padding: "8px 12px" }}>
                                  <span style={{
                                    display: "inline-block", padding: "2px 8px", borderRadius: 12,
                                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                                    color: statusColor, background: statusBg
                                  }}>
                                    {status}
                                  </span>
                                </td>
                              </tr>;
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {tableRows.map((row) => {
                          const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                          const rowKey = zone.id || zone.name || index;
                          const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;
                          
                          let statusColor = "#FCA5A5";
                          let statusBg = "rgba(248,113,113,.1)";
                          if (status === "Completo") {
                            statusColor = "#86EFAC";
                            statusBg = "rgba(34,197,94,.1)";
                          } else if (status === "Parziale") {
                            statusColor = "#FCD34D";
                            statusBg = "rgba(250,204,21,.1)";
                          }

                          return <div key={rowKey} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <strong style={{ fontSize: 14, color: C.white }}>{zone.name || zone.label || `Zona ${index + 1}`}</strong>
                              <span style={{
                                padding: "2px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                                color: statusColor, background: statusBg
                              }}>{status}</span>
                            </div>
                            
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.1)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${coverage}%`, height: "100%", background: statusColor, borderRadius: 3 }} />
                              </div>
                              <span className="vp-data-number" style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{formatPercentIT(coverage, 1)}</span>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>{isResidentialStep2 ? "Famiglie stimate" : "Target"}</div>
                                <div className="vp-data-number" style={{ fontSize: 13 }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Assegnati</div>
                                <div className="vp-data-number" style={{ fontSize: 13 }}>{formatIntegerIT(assigned)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Mancanti</div>
                                <div className="vp-data-number" style={{ fontSize: 13, color: missing > 0 ? "rgba(255,255,255,.7)" : "inherit" }}>{formatIntegerIT(missing)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Priorità</div>
                                <div style={{ fontSize: 13 }}>{priorityLabel}</div>
                              </div>
                            </div>
                          </div>;
                        })}
                      </div>
                    )}

                    {showTerritoryData && <div style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.07)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.5
                }}>
                        L'allocazione automatica parte dalle zone a maggiore densità di target. Puoi coprire il tuo comune aumentando la quantità o passando alla modalità Manuale.
                      </div>}
                  </div>;
            })()}
            </section>}

          {/* COMUNE MODE: Zone di distribuzione */}
          {showTerritoryData && searchMode !== "cap" && city && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.07)",
            overflow: "hidden"
          }}>
              {/* Header */}
              <div style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12
            }}>
                <div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.white,
                  marginBottom: 2
                }}>{isNilAnalysis ? isComuneMode ? nilManualMode ? `NIL selezionate: ${selZones.length} di ${zonesInRadius.length}` : `NIL disponibili ${city?.label || city?.name || ""}: ${zoneListSourceCount}` : `NIL intersecate dal raggio: ${summaryComuniStats.total}` : isMovementStep2 ? `Cluster operativi rilevati: ${zoneListSourceCount}` : isBusinessStep2 ? `Cluster commerciali rilevati: ${zoneListSourceCount}` : `Zone di distribuzione: ${zoneListSourceCount}`}</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)"
                }}>
                    Quantità inserita: <b style={{
                    color: col
                  }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                      useGrouping: true
                    })}</b> volantini
                  </div>
                </div>
                {isComuneMode && isNilAnalysis && <button onClick={() => {
                setNilManualMode(v => {
                  const next = !v;
                  // Uscendo dalla modalità manuale si torna al comune completo:
                  // tutte le NIL rientrano nell'aggregato.
                  if (!next) setSelected(zonesInRadius.map(z => z.id));
                  return next;
                });
              }} title={nilManualMode ? "Torna al comune completo (tutte le NIL)" : "Seleziona manualmente una o più NIL / quartieri"} style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${nilManualMode ? `${col}66` : "rgba(255,255,255,.12)"}`,
                background: nilManualMode ? `${col}1e` : "rgba(255,255,255,.04)",
                color: nilManualMode ? col : "rgba(255,255,255,.55)",
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer"
              }}>
	                    {hasUnconfirmedAddressPoint ? `NIL selezionati: ${selectedNils.length} · Anteprima: ${containingNil?.name || addressPreviewNilZones?.main?.name || "zona vicina"}` : `NIL / Quartieri: ${nilManualMode ? "selezione manuale" : "comune completo"}`}
                  </button>}
                <div style={{
                display: "flex",
                background: "rgba(0,0,0,.2)",
                padding: 3,
                borderRadius: 9,
                border: "1px solid rgba(255,255,255,.05)"
              }}>
                  {[{
                  id: "auto",
                  l: "Auto",
                  icon: ""
                }, ...(searchMode === "municipality" ? [{
                  id: "priority",
                  l: "Priorità",
                  icon: ""
                }] : []), {
                  id: "manual",
                  l: "Manuale",
                  icon: ""
                }].map(m => <button key={m.id} onClick={() => setAllocationMode(m.id)} style={{
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: "none",
                  background: allocationMode === m.id ? col : "transparent",
                  color: allocationMode === m.id ? C.white : "rgba(255,255,255,.4)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: allocationMode === m.id ? 700 : 400,
                  cursor: "pointer",
                  transition: "all.15s",
                  display: "flex",
                  alignItems: "center",
                  gap: 5
                }}>
                      <span>{m.icon}</span> {m.l}
                    </button>)}
                </div>
              </div>

              {/* Microcopy & Manual Summary */}
              <div style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,.02)",
              borderBottom: "1px solid rgba(255,255,255,.05)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                color: "rgba(255,255,255,.45)",
                lineHeight: 1.4,
                maxWidth: 400
              }}>
                  {allocationMode === "auto" ? `Con ${formatIntegerIT(flyerQuantityFromStep1)} volantini il sistema copre prima le zone con priorità più alta. Le zone non coperte verranno incluse aumentando la quantità o modificando la distribuzione manuale.` : allocationMode === "priority" ? "Scegli l'ordine dei comuni con le frecce: il sistema distribuisce i volantini seguendo quell'ordine." : `Modalità manuale: scegli tu quanti volantini assegnare a ogni ${territorySingularLabel.toLowerCase()}.`}
                </div>
                {showTerritoryData && <div style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexWrap: "wrap",
                marginLeft: "auto"
              }}>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.38)"
                }}>Ordina per:</span>
                    {[{
                  id: "relevance",
                  l: "Rilevanza"
                }, {
                  id: "families",
                  l: "Famiglie"
                }, {
                  id: "coverage",
                  l: "Copertura"
                }].map(opt => <button key={opt.id} onClick={() => setZoneListSort(opt.id)} style={{
                  padding: "5px 8px",
                  borderRadius: 7,
                  border: `1px solid ${zoneListSort === opt.id ? `${col}55` : "rgba(255,255,255,.08)"}`,
                  background: zoneListSort === opt.id ? `${col}18` : "rgba(255,255,255,.035)",
                  color: zoneListSort === opt.id ? col : "rgba(255,255,255,.45)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer"
                }}>
                        {opt.l}
                      </button>)}
                  </div>}
                {(allocationMode === "manual" || allocationMode === "priority") && <div style={{
                textAlign: "right"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)",
                  marginBottom: 2
                }}>Riepilogo assegnazione</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: isInvalid ? C.red : C.green
                }}>
                      {totalAssigned.toLocaleString("it-IT", {
                    useGrouping: true
                  })} / {flyerQuantityFromStep1.toLocaleString("it-IT", {
                    useGrouping: true
                  })}
                    </div>
                  </div>}
              </div>

              {/* Lista zone */}
              <div style={{
              padding: "14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}>
                {analysisLoading && <div style={{
                padding: 20,
                textAlign: "center",
                color: "rgba(255,255,255,.4)",
                fontFamily: F.sans,
                fontSize: 12
              }}>Caricamento analisi territoriale...</div>}
                {analysisError === "TERRITORIAL_DATA_NOT_AVAILABLE" && <div style={{
                padding: 24,
                textAlign: "center",
                color: C.red,
                background: "rgba(34, 197, 94,.08)",
                border: `1px solid ${C.red}33`,
                borderRadius: 12,
                fontFamily: F.sans,
                fontSize: 13
              }}>
                    <div style={{
                  fontWeight: 700,
                  marginBottom: 6
                }}>Dati territoriali non disponibili per questo comune.</div>
                    <div style={{
                  opacity: 0.8,
                  fontSize: 12
                }}>La copertura dati reale e attualmente attiva per la Lombardia.</div>
                  </div>}
                {(addressSearchError || isRadiusMode && !hasSearchPoint && (!city || !Number.isFinite(Number(city?.lat)) || !Number.isFinite(Number(city?.lng)))) && <div style={{
                padding: 16,
                borderRadius: 10,
                background: "rgba(251,191,36,.08)",
                border: "1px solid rgba(251,191,36,.3)"
              }}>
                    <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#FBBF24",
                  marginBottom: 6
                }}>
                      <Step1Icon name="pin" size={14} /> {addressSearchError ? "Indirizzo non trovato a Milano" : "Coordinate necessarie per il raggio"}
                    </div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.65)",
                  lineHeight: 1.45,
                  marginBottom: 12
                }}>
                      {addressSearchError || "Seleziona prima un indirizzo valido o un punto sulla mappa per calcolare il raggio di copertura."}
                    </div>
                    <div style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap"
                }}>
                      <button onClick={() => {
                    resolveMilanoCity().then(milano => {
                      if (milano) {
                        setCity(milano);
                        setSelectedComuni([milano]);
                        setSearch("Milano");
                        setDropOpen(false);
                        setSelected([]);
                        setCoverageDecision(null);
                        setCoverageStrategy(null);
                        setPartialCoverageConfirmed(false);
                        setAddressFullCoverageConfirmed(true);
                        setAddressSearchError("");
                        setSelectedSearchPoint(null);
                        switchToComuneMode();
                      }
                    });
                  }} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.2)",
                    background: "rgba(255,255,255,.1)",
                    color: C.white,
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                        Usa Milano comune completo
                      </button>
                      <button onClick={() => {
                    setAddressSearchError("");
                    setDropOpen(true);
                  }} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.05)",
                    color: "rgba(255,255,255,.8)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                        Cerca di nuovo
                      </button>
                      <button onClick={() => {
                    startManualPinSelection();
                  }} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(59,130,246,.4)",
                    background: "rgba(59,130,246,.14)",
                    color: "#60A5FA",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                        Scegli punto sulla mappa
                      </button>
                    </div>
                  </div>}
                {hasUnconfirmedAddressPoint && <div style={{
                padding: 16,
                borderRadius: 10,
                background: "rgba(59,130,246,.08)",
                border: "1px solid rgba(59,130,246,.3)"
              }}>
                    <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: F.sans,
                  fontSize: 13,
                  fontWeight: 800,
                  color: "#60A5FA",
                  marginBottom: 6
                }}><Step1Icon name="pin" size={14} /> Hai selezionato un indirizzo dentro Milano</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "rgba(255,255,255,.65)",
                  lineHeight: 1.45,
                  marginBottom: 10
                }}>
                      <b style={{
                    color: C.white
                  }}>{selectedSearchPoint?.label}</b>. Per calcolare la copertura puoi usare un raggio dal punto oppure selezionare Milano comune completo.
                    </div>
                    {addressPreviewNilZones?.requiresExplicitNilChoice ? <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#FBBF24",
                  marginBottom: 12,
                  padding: "8px 10px",
                  background: "rgba(251,191,36,.08)",
                  borderRadius: 8
                }}>
                        <div style={{
                    marginBottom: 6
                  }}>Punto sul confine di piu NIL: scegli esplicitamente il quartiere.</div>
                        <div style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap"
                  }}>
                          {(addressPreviewNilZones.containingCandidates || []).map(candidate => <button key={candidate.id || candidate.nilCode || candidate.nil_code || candidate.name} onClick={() => {
                      setNilManualMode(true);
                      setRequestedAnalysisLevel("nil");
                      setAddressFullCoverageConfirmed(true);
                      if (candidate.id) setSelected([candidate.id]);
                    }} style={{
                      padding: "5px 9px",
                      borderRadius: 7,
                      border: "1px solid rgba(251,191,36,.35)",
                      background: "rgba(251,191,36,.12)",
                      color: "#FBBF24",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer"
                    }}>
                              {candidate.name}
                            </button>)}
                        </div>
                      </div> : addressPreviewNilZones?.main?.name ? <div style={{
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#93C5FD",
                  marginBottom: 12,
                  padding: "8px 10px",
                  background: "rgba(59,130,246,.12)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6
                }}>
                        <Step1Icon name="compass" size={14} />
                        <span>Quartiere/NIL più vicino: <b style={{
                      color: C.white
                    }}>{addressPreviewNilZones.main.name}</b></span>
                      </div> : <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(251,191,36,.85)",
                  marginBottom: 12,
                  padding: "8px 10px",
                  background: "rgba(251,191,36,.08)",
                  borderRadius: 8
                }}>
                        Quartiere/NIL più vicino: dato non disponibile
                      </div>}
                    <div style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap"
                }}>
                      <button onClick={switchToRadiusMode} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(34,197,94,.4)",
                    background: "rgba(34,197,94,.14)",
                    color: "#22C55E",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                        Usa raggio da {(selectedSearchPoint?.label || "").split(",")[0]}
                      </button>
                      <button onClick={() => setAddressFullCoverageConfirmed(true)} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.05)",
                    color: "rgba(255,255,255,.8)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer"
                  }}>
                        Usa Milano comune completo
                      </button>
                      <button onClick={() => {
                    if (addressPreviewNilZones?.requiresExplicitNilChoice) return;
                    setNilManualMode(true);
                    setRequestedAnalysisLevel("nil");
                    setAddressFullCoverageConfirmed(true);
                    if (addressPreviewNilZones?.main?.id) {
                      setSelected([addressPreviewNilZones.main.id]);
                    }
                  }} disabled={Boolean(addressPreviewNilZones?.requiresExplicitNilChoice)} style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(255,255,255,.05)",
                    color: "rgba(255,255,255,.8)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: addressPreviewNilZones?.requiresExplicitNilChoice ? "not-allowed" : "pointer",
                    opacity: addressPreviewNilZones?.requiresExplicitNilChoice ? 0.55 : 1
                  }}>
                        Seleziona NIL/quartiere vicino
                      </button>
                    </div>
                  </div>}
                {milanoComuneNilInsufficient && !nilUnavailable && <div style={{
                padding: 14,
                textAlign: "center",
                color: C.yellow,
                background: "rgba(251,191,36,.08)",
                border: `1px solid ${C.yellow}33`,
                borderRadius: 10,
                fontFamily: F.sans,
                fontSize: 12
              }}>
                    <div style={{
                  fontWeight: 800,
                  marginBottom: 4
                }}>Dati comune completo non disponibili</div>
                    <div style={{
                  opacity: 0.82
                }}>Seleziona raggio o NIL specifica.</div>
                  </div>}
                {activeComuneZeroData && <div style={{
                padding: 14,
                textAlign: "center",
                color: C.yellow,
                background: "rgba(251,191,36,.08)",
                border: `1px solid ${C.yellow}33`,
                borderRadius: 10,
                fontFamily: F.sans,
                fontSize: 12
              }}>
                    <div style={{
                  fontWeight: 800,
                  marginBottom: 4
                }}>Dati non disponibili o area non valida per la modalità Comune</div>
                    <div style={{
                  opacity: 0.82
                }}>Prova un altro comune, oppure usa Raggio o NIL/Quartieri se disponibile.</div>
                  </div>}
                {nilUnavailable && <div style={{
                padding: 14,
                textAlign: "center",
                color: C.yellow,
                background: "rgba(251,191,36,.08)",
                border: `1px solid ${C.yellow}33`,
                borderRadius: 10,
                fontFamily: F.sans,
                fontSize: 12
              }}>
                    <div style={{
                  fontWeight: 800,
                  marginBottom: 4
                }}>Dati NIL non disponibili</div>
                    <div style={{
                  opacity: 0.82
                }}>
                      {isComuneMode ? "Dati comune completo non disponibili. Seleziona raggio o NIL specifica." : `Milano viene usata come centro di riferimento. L'analisi è calcolata sul raggio selezionato di ${radiusKm}km.`}
                    </div>
                  </div>}
                {territorialDataUnavailable && analysisError !== "TERRITORIAL_DATA_NOT_AVAILABLE" && <div style={{
                padding: 24,
                textAlign: "center",
                color: C.red,
                background: "rgba(34, 197, 94,.08)",
                border: `1px solid ${C.red}33`,
                borderRadius: 12,
                fontFamily: F.sans,
                fontSize: 13
              }}>
                    <div style={{
                  fontWeight: 700,
                  marginBottom: 6
                }}>Dati territoriali non disponibili per questa zona.</div>
                    <div style={{
                  opacity: 0.8,
                  fontSize: 12
                }}>I POI reali restano visibili dove disponibili, ma non vengono creati comuni o zone territoriali da dati locali.</div>
                  </div>}
                {analysisError === "POI_DATA_NOT_AVAILABLE" && <div style={{
                padding: 20,
                textAlign: "center",
                color: "#22C55E",
                background: "rgba(34, 197, 94,.08)",
                borderRadius: 8,
                fontFamily: F.sans,
                fontSize: 12
              }}>Dati POI non disponibili per questa zona.</div>}
                {shouldGroupMarginalZones && <div style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(34, 197, 94,.08)",
                border: "1px solid rgba(34, 197, 94,.22)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.62)",
                  lineHeight: 1.45
                }}>
                      {isComuneMode ? <>
                          <b style={{
                      color: C.white
                    }}>{city.label || city.name || "Il comune selezionato"}:</b> con {formatIntegerIT(flyerQuantityFromStep1)} volantini coprirai principalmente {primaryCoveredZones.length > 0 ? <b style={{
                      color: col
                    }}>{primaryCoveredZones.join(", ")}</b> : "alcune zone del comune"}. Per copertura completa del comune servono circa {formatIntegerIT(requiredFlyers)} volantini.
                        </> : <>
                          <><b style={{
                        color: C.white
                      }}>Con un raggio di {radiusKm || radius} km la campagna copre circa il {sharedCoveragePctText} dell’area selezionata.</b> Per una campagna più mirata puoi ridurre il raggio.</>
                          {primaryCoveredZones.length > 0 && <> Con {formatIntegerIT(flyerQuantityFromStep1)} volantini coprirai principalmente: <b style={{
                        color: col
                      }}>{primaryCoveredZones.join(", ")}</b>.</>}
                        </>}
                    </div>
                    {searchMode !== "municipality" && <button onClick={() => updateActiveRadius(Math.max(1, Math.round((radiusKm || radius) > 3 ? 3 : 1)))} style={{
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: `1px solid ${col}55`,
                  background: `${col}16`,
                  color: col,
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: "pointer"
                }}>
                        Riduci raggio
                      </button>}
                  </div>}
                
                {allocationMode !== "auto" && (isMilanoComuneCollapsible && !showMilanoNilList ? <button onClick={() => setShowMilanoNilList(true)} style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px dashed rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.025)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                cursor: "pointer",
                textAlign: "left"
              }}>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 900,
                  color: "rgba(255,255,255,.72)"
                }}>
                      + Mostra dettagli NIL / quartieri <span style={{
                    color: "rgba(255,255,255,.38)",
                    fontWeight: 700
                  }}>({zoneListSourceCount} zone)</span>
                    </span>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.42)"
                }}>espandi</span>
                  </button> : <div style={{
                maxHeight: "560px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                paddingRight: 4
              }}>
                {isMilanoComuneCollapsible && <button onClick={() => setShowMilanoNilList(false)} style={{
                  alignSelf: "flex-start",
                  padding: "5px 10px",
                  borderRadius: 7,
                  border: "1px solid rgba(255,255,255,.12)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.55)",
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: "pointer"
                }}>
                    − Nascondi dettagli NIL / quartieri
                  </button>}
                {zoneRowsForList.map(row => {
                  if (row.type === "marginal-summary") {
                    return <div key="marginal-summary" style={{
                      borderRadius: 10,
                      border: "1px dashed rgba(255,255,255,.13)",
                      background: "rgba(255,255,255,.025)",
                      padding: "9px 10px"
                    }}>
                        <button onClick={() => setShowMarginalZones(v => !v)} style={{
                        width: "100%",
                        padding: 0,
                        border: "none",
                        background: "transparent",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        textAlign: "left"
                      }}>
                          <span style={{
                          fontFamily: F.sans,
                          fontSize: 11,
                          fontWeight: 900,
                          color: "rgba(255,255,255,.72)"
                        }}>
                            {showMarginalZones ? "-" : "+"} Altre {marginalResidentialZones.length} zone marginali <span style={{
                            color: "rgba(255,255,255,.38)",
                            fontWeight: 700
                          }}>(basso impatto)</span>
                          </span>
                          <span style={{
                          fontFamily: F.sans,
                          fontSize: 10,
                          color: "rgba(255,255,255,.42)"
                        }}>{showMarginalZones ? "nascondi" : "espandi"}</span>
                        </button>
                        <div style={{
                        marginTop: 5,
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.42)"
                      }}>
                          totale aggregato: <b style={{
                          color: C.white
                        }}>{Number(marginalZoneFamilies || 0).toLocaleString("it-IT", {
                            useGrouping: true
                          })}</b> famiglie · <b style={{
                          color: C.white
                        }}>{marginalZoneCoverage}%</b> del raggio
                        </div>
                      </div>;
                  }
                  const z = row.zone;
                  const sel = isMovementStep2 || isBusinessStep2 && businessMetrics.clusterRows.length ? true : z.isCap ? selectedCaps.includes(z.postalCode) : selected.includes(z.id);
                  const alloc = zonesAllocation.find(a => a.id === z.id) || {
                    requiredFlyers: zCap(z),
                    assignedFlyers: 0,
                    coveragePercent: 0,
                    allocationStatus: "none"
                  };
                  const isManual = allocationMode === "manual";
                  const assignedFlyers = Math.max(0, Math.round(Number(alloc.assignedFlyers || alloc.assigned || alloc.allocated || alloc.volantini_assegnati || 0)));
                  const requiredFlyers = Math.max(0, Math.round(Number(alloc.requiredFlyers || alloc.needed || alloc.volantini_necessari || zCap(z) || 0)));
                  const coveragePercent = assignedFlyers <= 0 ? 0 : assignedFlyers >= requiredFlyers ? 100 : Math.max(1, Math.min(99, Math.round(assignedFlyers / Math.max(1, requiredFlyers) * 100)));
                  const statusCalc = getCoverageStatus(coveragePercent);
                  const coverageState = assignedFlyers <= 0 ? "none" : statusCalc === "coperto" ? "full" : "partial";
                  const coverageLabel = coverageState === "none" ? "Copertura 0% - fuori budget attuale" : z.isNil ? "Copertura fabbisogno zona" : isRadiusMode ? "Copertura del fabbisogno della zona" : coverageState === "full" ? "Copertura totale" : "Copertura selettiva";
                  const zoneTotalFamilies = Number(z.householdsTotal || z.households_total || z.totalFamilies || 0);
                  const zoneAreaFamilies = Number(z.families || z.famiglie || z.householdsInRadius || z.households_in_radius || 0);
                  const zoneCoveragePct = Number.isFinite(Number(z.coverage ?? z.pct ?? z.percent_nel_raggio)) ? Math.round(Number(z.coverage ?? z.pct ?? z.percent_nel_raggio)) : null;
                  const rowMetric = (label, value, tone = "neutral") => <div key={label} style={{
                    minWidth: 118,
                    padding: "7px 8px",
                    borderRadius: 8,
                    background: tone === "accent" ? `${col}12` : "rgba(255,255,255,.032)",
                    border: `1px solid ${tone === "accent" ? `${col}28` : "rgba(255,255,255,.055)"}`
                  }}>
                      <div style={{
                      fontFamily: F.sans,
                      fontSize: 8,
                      color: "rgba(255,255,255,.34)",
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      marginBottom: 3
                    }}>{label}</div>
                      <div style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: tone === "accent" ? col : "rgba(255,255,255,.74)",
                      fontWeight: 800,
                      lineHeight: 1.15
                    }}>{value}</div>
                    </div>;
                  return <div key={z.id} className="town-list-item" style={{
                    borderRadius: 12,
                    border: `1px solid ${sel ? `${col}45` : "rgba(255,255,255,.035)"}`,
                    background: sel ? `${col}0a` : "rgba(255,255,255,.012)",
                    padding: "12px 14px",
                    transition: "all .2s ease"
                  }}>
                      <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "24px minmax(160px,1fr)" : "24px 1fr 180px 120px",
                      gap: 12,
                      alignItems: "center"
                    }}>
                        {/* Checkbox */}
                        <div onClick={() => {
                        if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id);
                      }} style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        cursor: "pointer",
                        border: `2px solid ${coverageState !== "none" ? col : "rgba(255,255,255,.2)"}`,
                        background: coverageState === "full" ? col : coverageState === "partial" ? `${col}33` : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}>
                          {coverageState === "full" && <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>}
                          {coverageState === "partial" && <div style={{
                          width: 6,
                          height: 2,
                          background: col,
                          borderRadius: 1
                        }} />}
                        </div>

                        {/* Nome & Info */}
                        <div onClick={() => {
                        if (!isMovementStep2 && !(isBusinessStep2 && businessMetrics.clusterRows.length)) toggleZone(z.id);
                      }} style={{
                        cursor: isMovementStep2 || isBusinessStep2 && businessMetrics.clusterRows.length ? "default" : "pointer",
                        flex: 1
                      }}>
                          <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6
                        }}>
                            {allocationMode === "priority" && searchMode === "municipality" && (() => {
                            const order = comuniPriorityOrder.length ? comuniPriorityOrder : selZones.map(zz => zz.id);
                            const pos = order.indexOf(z.id);
                            return <div onClick={e => e.stopPropagation()} style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 1,
                              marginRight: 2
                            }}>
                                  <button onClick={() => movePriorityZone(z.id, -1)} disabled={pos <= 0} style={{
                                padding: 0,
                                width: 16,
                                height: 12,
                                lineHeight: "10px",
                                fontSize: 9,
                                border: "1px solid rgba(255,255,255,.15)",
                                borderRadius: 3,
                                background: "rgba(255,255,255,.05)",
                                color: pos <= 0 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
                                cursor: pos <= 0 ? "default" : "pointer"
                              }} title="Sposta su">▲</button>
                                  <button onClick={() => movePriorityZone(z.id, 1)} disabled={pos < 0 || pos >= order.length - 1} style={{
                                padding: 0,
                                width: 16,
                                height: 12,
                                lineHeight: "10px",
                                fontSize: 9,
                                border: "1px solid rgba(255,255,255,.15)",
                                borderRadius: 3,
                                background: "rgba(255,255,255,.05)",
                                color: pos < 0 || pos >= order.length - 1 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.7)",
                                cursor: pos < 0 || pos >= order.length - 1 ? "default" : "pointer"
                              }} title="Sposta giù">▼</button>
                                </div>;
                          })()}
                            {allocationMode === "priority" && searchMode === "municipality" && <span style={{
                            fontFamily: F.sans,
                            fontSize: 9,
                            fontWeight: 800,
                            color: col,
                            minWidth: 14
                          }}>
                                {(comuniPriorityOrder.length ? comuniPriorityOrder : selZones.map(zz => zz.id)).indexOf(z.id) + 1}
                              </span>}
                            <div style={{
                            fontFamily: F.sans,
                            fontSize: 13,
                            fontWeight: coverageState !== "none" ? 700 : 400,
                            color: coverageState !== "none" ? C.white : "rgba(255,255,255,.45)"
                          }}>{z.name}</div>
                            {coverageState === "full" && <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(34,197,94,.15)",
                            border: "1px solid rgba(34,197,94,.35)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "#22C55E",
                            fontWeight: 800
                          }}><span style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#22C55E",
                              flexShrink: 0
                            }} /> COPERTO</span>}
                            {coverageState === "partial" && <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(250,204,21,.15)",
                            border: "1px solid rgba(250,204,21,.35)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "#FACC15",
                            fontWeight: 800
                          }}><span style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#FACC15",
                              flexShrink: 0
                            }} /> PARZIALE</span>}
                            {coverageState === "none" && <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(248,113,113,.15)",
                            border: "1px solid rgba(248,113,113,.35)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "#F87171",
                            fontWeight: 800
                          }}><span style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#F87171",
                              flexShrink: 0
                            }} /> NON COPERTO</span>}
                            {z.isNil && <span style={{
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: `${getComuneColor(z.id)}22`,
                            border: `1px solid ${getComuneColor(z.id)}55`,
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: getComuneColor(z.id),
                            fontWeight: 800
                          }}>NIL</span>}
                            {z.isCap && <span style={{
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: "rgba(255,255,255,.1)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "rgba(255,255,255,.4)",
                            fontWeight: 700
                          }}>CAP</span>}
                            {z.source_flags?.includes('Stima territoriale') && <span style={{
                            padding: "1px 5px",
                            borderRadius: 4,
                            background: "rgba(251,191,36,.15)",
                            border: "1px solid rgba(251,191,36,.3)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: C.yellow,
                            fontWeight: 700
                          }}>Stima territoriale</span>}
                            {z.isFallback && <span style={{
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(251,191,36,.18)",
                            border: "1px solid rgba(251,191,36,.4)",
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "#FACC15",
                            fontWeight: 800
                          }}>⏳ Dati parziali</span>}
                          </div>
                          <div style={{
                          fontFamily: F.sans,
                          fontSize: 9,
                          color: "rgba(255,255,255,.25)",
                          marginTop: 2
                        }}>
                            {z.isFallback ? "Dati non disponibili — comune selezionato, in attesa dei dati API" : isResidentialStep2 ? `${Number(z.families ?? z.households ?? 0).toLocaleString("it-IT", {
                            useGrouping: true
                          })} famiglie – ${Number(z.pop ?? z.population ?? 0).toLocaleString("it-IT", {
                            useGrouping: true
                          })} ab. – ${Number(z.area ?? z.area_km2 ?? 0)} km² – ${Number(z.coverage ?? z.pct_copertura ?? 0)}% ${searchMode === "municipality" ? "di copertura" : "nel raggio"}` : isBusinessStep2 ? `${Number(z.targetBiz ?? 0)} target – ${Number(z.competitors ?? 0)} competitor – ${Number(z.clusters ?? 0)} cluster – ${z.topCats ?? ""}` : isMovementStep2 ? `${Number(z.poi ?? 0)} POI reali - ${Number(z.transit || 0)} nodi TPL/metro - score ${Number(z.strength ?? 0)}/100` : z.dist ? `${Number(z.dist).toFixed(1)} km dal centro` : "Zona nel raggio"}
                          </div>
                          {showTerritoryData && <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit,minmax(112px,1fr))",
                          gap: 6,
                          marginTop: 8
                        }}>
                              {rowMetric(z.isNil ? `Famiglie comune ${city?.label || city?.name || ""} (contesto)` : isRadiusMode ? `Famiglie comune ${z.name} (contesto)` : isComuneMode ? "Totale stimato Comune" : `Dati comune ${city?.label || city?.name || ""} (contesto)`, zoneTotalFamilies > 0 ? formatIntegerIT(zoneTotalFamilies) : "N.D.")}
                              {rowMetric(z.isNil ? "Famiglie coperte" : isRadiusMode ? "Famiglie nel raggio" : "Copertura stimata area selezionata", zoneAreaFamilies > 0 ? formatIntegerIT(z.isNil && assignedFlyers > 0 ? Math.min(zoneAreaFamilies, Math.round(zoneAreaFamilies * (coveragePercent / 100))) : zoneAreaFamilies) : "N.D.")}
                              {rowMetric(z.isNil ? "Copertura fabbisogno zona" : isRadiusMode ? "Copertura del fabbisogno della zona" : "Copertura comune", `${coveragePercent}%`)}
                              {rowMetric(z.isNil ? "Peso sull'area" : isRadiusMode ? "Peso sul raggio" : "Peso sul comune", zoneCoveragePct != null ? `${zoneCoveragePct}%` : "N.D.")}
                              {rowMetric("Volantini assegnati", formatIntegerIT(assignedFlyers))}
                              {rowMetric(z.isNil ? "Quantità consigliata zona" : "Quantità consigliata", requiredFlyers > 0 ? formatIntegerIT(requiredFlyers) : "N.D.", "accent")}
                            </div>}
                        </div>

                        {/* Barra e Copertura */}
                        {sel ? <div>
                            <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4
                        }}>
                              <span style={{
                            fontFamily: F.sans,
                            fontSize: 9,
                            fontWeight: 700,
                            color: coverageState === "full" ? C.green : coverageState === "partial" ? "#22C55E" : "rgba(255,255,255,.38)",
                            textTransform: "uppercase",
                            letterSpacing: ".04em"
                          }}>
                                {coverageLabel}
                              </span>
                              <span style={{
                            fontFamily: F.sans,
                            fontSize: 10,
                            fontWeight: 700,
                            color: coverageState === "none" ? "rgba(255,255,255,.42)" : C.white
                          }}>{coveragePercent}%</span>
                            </div>
                            <div style={{
                          height: 5,
                          borderRadius: 3,
                          background: "rgba(255,255,255,.08)",
                          overflow: "hidden"
                        }}>
                              <div style={{
                            width: `${coveragePercent}%`,
                            height: "100%",
                            background: coverageState === "full" ? C.green : coverageState === "partial" ? "#22C55E" : "rgba(248,113,113,.35)",
                            borderRadius: 3
                          }} />
                            </div>
                          </div> : <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.2)",
                        fontStyle: "italic"
                      }}>Non selezionata</div>}

                        {/* Input/Valore Volantini */}
                        <div style={{
                        textAlign: "right"
                      }}>
                          {sel ? isManual ? <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end"
                        }}>
                                <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4
                          }}>
                                  <input type="number" value={manualAssignments[z.id] || 0} onChange={e => updateManual(z.id, e.target.value)} style={{
                              width: 70,
                              background: "rgba(0,0,0,.3)",
                              border: `1px solid ${col}40`,
                              borderRadius: 5,
                              color: C.white,
                              fontFamily: F.sans,
                              fontSize: 12,
                              padding: "4px 6px",
                              textAlign: "right"
                            }} />
                                  <span style={{
                              fontFamily: F.sans,
                              fontSize: 9,
                              color: "rgba(255,255,255,.3)"
                            }}>pz</span>
                                </div>
                                <div style={{
                            fontFamily: F.sans,
                            fontSize: 8,
                            color: "rgba(255,255,255,.3)",
                            marginTop: 2
                          }}>di {alloc.requiredFlyers.toLocaleString("it-IT", {
                              useGrouping: true
                            })}</div>
                              </div> : <div>
                                {assignedFlyers === 0 ? <div style={{
                            fontFamily: F.sans,
                            fontSize: 9,
                            color: "rgba(255,255,255,.32)",
                            fontStyle: "italic",
                            lineHeight: 1.4,
                            textAlign: "right"
                          }}>
                                    Non coperto dal budget attuale
                                  </div> : <>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>
                                      {assignedFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })}
                                    </div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 8,
                              color: "rgba(255,255,255,.3)"
                            }}>di {requiredFlyers.toLocaleString("it-IT", {
                                useGrouping: true
                              })} necessari</div>
                                  </>}
                              </div> : <div style={{
                          fontFamily: F.sans,
                          fontSize: 11,
                          color: "rgba(255,255,255,.15)"
                        }}>{alloc.requiredFlyers.toLocaleString("it-IT", {
                            useGrouping: true
                          })} pz</div>}
                        </div>
                      </div>
                    </div>;
                })}
                </div>)}
              </div>

              {/* Footer Avvisi */}
              {selZones.length > 0 && (() => {
              const formulaFamilies = Math.max(0, Math.round(Number(step2ViewModel.primaryFamiliesValue || 0)));
              const formulaRecommended = Math.max(0, Math.round(Number(step2ViewModel.recommendedFlyersValue || 0)));
              const formulaMarginFlyers = Math.max(0, formulaRecommended - formulaFamilies);
              const formulaMarginPct = formulaFamilies > 0 ? formulaMarginFlyers / formulaFamilies * 100 : null;
              const DASHBOARD_PREVIEW_CARDS = [{
                icon: "pin",
                title: "Monitoraggio live",
                color: "#38BDF8"
              }, {
                icon: "chart",
                title: "KPI e copertura",
                color: "#4ADE80"
              }, {
                icon: "camera",
                title: "Foto e report",
                color: "#F87171"
              }, {
                icon: "map",
                title: "Analisi territoriale",
                color: "#FBBF24"
              }];
              const dashboardPreviewBox = <div style={{
                background: "linear-gradient(180deg, rgba(56,189,248,.07) 0%, rgba(255,255,255,.02) 100%)",
                borderRadius: 14,
                padding: isMobile ? "14px" : "16px 18px",
                border: "1px solid rgba(56,189,248,.35)",
                boxShadow: "0 10px 30px rgba(0,0,0,.3)"
              }}>
                    <div style={{
                  marginBottom: 16
                }}>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8
                  }}>
                        <div style={{
                      fontFamily: F.sans,
                      fontSize: 15,
                      fontWeight: 900,
                      color: C.white,
                      display: "flex",
                      alignItems: "center",
                      gap: 8
                    }}>
                          <Step1Icon name="chart" size={18} />
                          <span>Dashboard Campagna inclusa dopo la conferma</span>
                        </div>
                        <span style={{
                      padding: "3px 10px",
                      borderRadius: 100,
                      background: "rgba(56, 189, 248, .18)",
                      color: "#38BDF8",
                      border: "1px solid rgba(56, 189, 248, .35)",
                      fontFamily: F.sans,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: ".06em",
                      textTransform: "uppercase"
                    }}>
                          Preview
                        </span>
                      </div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    color: "rgba(255,255,255,.68)",
                    lineHeight: 1.5
                  }}>
                        Monitora avanzamento, GPS, foto, KPI e report della distribuzione.
                      </div>
                    </div>

                    <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                  gap: 8
                }}>
                      {DASHBOARD_PREVIEW_CARDS.map(card => <div key={card.title} style={{
                    background: "rgba(255,255,255,.03)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    border: "1px solid rgba(255,255,255,.07)",
                    display: "flex",
                    gap: 7,
                    alignItems: "center"
                  }}>
                          <Step1Icon name={card.icon} size={15} color={card.color} />
                          <span style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 800,
                      color: card.color
                    }}>{card.title}</span>
                        </div>)}
                    </div>
                  </div>;
              return <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
                padding: "12px",
                background: "rgba(0,0,0,.15)",
                borderTop: "1px solid rgba(255,255,255,.05)"
              }}>
                    {allocationMode === "auto" ? <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                }}>
                        <div style={{
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 800,
                    color: C.white,
                    letterSpacing: ".05em",
                    textTransform: "uppercase"
                  }}>Copertura e scelta quantità</div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,minmax(0,1fr))", gap: 10 }}>
                          <article style={{ padding: 14, border: "1px solid rgba(255,255,255,.09)", borderRadius: 12, background: "rgba(255,255,255,.025)" }}>
                            <span style={{ display: "block", marginBottom: 5, color: "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Scenario attuale</span>
                            <strong className="vp-data-number" style={{ display: "block", color: C.white, fontFamily: F.sans, fontSize: 19, fontWeight: 900 }}>{formatIntegerIT(step2TruthModel.quantity.current)} volantini</strong>
                            <dl style={{ display: "grid", gap: 7, margin: "13px 0 0", padding: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Copertura scenario corrente</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2CoverageFullLabel || "Dato non disponibile"}</dd></div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Zone coinvolte / disponibili</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.zones.involved} / {step2TruthModel.zones.available}</dd></div>
                            </dl>
                          </article>
                          <article style={{ padding: 14, border: "1px solid rgba(34,197,94,.25)", borderRadius: 12, background: "rgba(34,197,94,.055)" }}>
                            <span style={{ display: "block", marginBottom: 5, color: "rgba(255,255,255,.48)", fontFamily: F.sans, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>Scenario consigliato</span>
                            <strong className="vp-data-number" style={{ display: "block", color: "#4ADE80", fontFamily: F.sans, fontSize: 19, fontWeight: 900 }}>{formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} volantini</strong>
                            <dl style={{ display: "grid", gap: 7, margin: "13px 0 0", padding: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Margine operativo</dt><dd className="vp-data-number" style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.quantity.operationalMargin > 0 ? `+${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.` : "Nessun margine aggiuntivo"}</dd></div>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,.06)" }}><dt style={{ margin: 0, color: "rgba(255,255,255,.47)", fontSize: 10, fontWeight: 400 }}>Copertura prevista</dt><dd style={{ margin: 0, color: "rgba(255,255,255,.86)", fontSize: 10, fontWeight: 800, textAlign: "right" }}>{step2TruthModel.quantity.recommendedRequirement > 0 ? "100% del fabbisogno operativo" : "Dato non disponibile"}</dd></div>
                            </dl>
                          </article>
                        </div>
                        <div hidden>
                        <div style={{
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid rgba(255,255,255,.08)",
                      borderRadius: 12,
                      padding: 14
                    }}>
                          {showTerritoryData && formulaFamilies > 0 && formulaRecommended > 0 && <div style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        background: `${col}10`,
                        border: `1px solid ${col}2f`,
                        marginBottom: 14
                      }}>
                              <div style={{
                          fontFamily: F.sans,
                          fontSize: 12,
                          color: "rgba(255,255,255,.88)",
                          lineHeight: 1.55
                        }}>
                                <strong className="vp-data-number">{formatIntegerIT(formulaFamilies)}</strong> famiglie
                                {formulaMarginPct != null && formulaMarginFlyers > 0 && <> + <strong>{formatPercentIT(formulaMarginPct, Math.abs(formulaMarginPct - Math.round(formulaMarginPct)) < 0.05 ? 0 : 1)}</strong> margine operativo (<strong className="vp-data-number">+{formatIntegerIT(formulaMarginFlyers)}</strong>)</>}
                                {formulaMarginFlyers === 0 && <> + nessun margine aggiuntivo</>}
                                {' = '}<strong className="vp-data-number" style={{
                            color: col
                          }}>{formatIntegerIT(formulaRecommended)} volantini consigliati</strong>
                              </div>
                              <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                          gap: 8,
                          marginTop: 10
                        }}>
                                {[["Famiglie stimate", formatIntegerIT(formulaFamilies)], ["Margine operativo", `+${formatIntegerIT(formulaMarginFlyers)}`], ["Quantità consigliata", formatIntegerIT(formulaRecommended)]].map(([label, value]) => <div key={label} style={{
                            padding: "8px 9px",
                            borderRadius: 8,
                            background: "rgba(255,255,255,.04)"
                          }}>
                                    <div style={{
                              fontSize: 9,
                              color: "rgba(255,255,255,.45)",
                              marginBottom: 3
                            }}>{label}</div>
                                    <div className="vp-data-number" style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: C.white
                            }}>{value}</div>
                                  </div>)}
                              </div>
                            </div>}
                          <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 10,
                        marginBottom: 14
                      }}>
                            {isRadiusMode ? <>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Area selezionata</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{city ? city.name : activeCampaignZone?.cityName || "Area"} · raggio {radiusKm || radius} km</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>{isNilAnalysis ? `Famiglie nell'area ${radiusKm || radius} km` : `Famiglie totali area ${radiusKm || radius} km`}</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{formatIntegerIT(serviceKpis?.families || 0)}</div>
                                </div>
                                {isNilAnalysis && <div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>NIL intersecate</div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{summaryComuniStats.total}</div>
                                  </div>}
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Quantità inserita</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{formatIntegerIT(flyerQuantityFromStep1)}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Quantità consigliata area {radiusKm || radius} km</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{formatIntegerIT(requiredFlyers > 0 ? requiredFlyers : serviceKpis?.recommendedFlyers || 0)}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Copertura complessiva del raggio</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: isPartial ? "#22C55E" : C.green
                            }}>{sharedCoveragePctText}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Quantità mancante</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#22C55E"
                            }}>{formatIntegerIT(missingFlyers > 0 ? missingFlyers : Math.max(0, (requiredFlyers || serviceKpis?.recommendedFlyers || 0) - flyerQuantityFromStep1))}</div>
                                </div>
                              </> : <>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>{municipalityTotalFamiliesRowLabel}</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: municipalityTotalFamilies != null ? C.white : "rgba(255,255,255,.55)"
                            }}>{municipalityTotalFamiliesLabel}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Copertura stimata area selezionata</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{selectedAreaFamiliesLabel}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Zona</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{step2ViewModel.primaryAreaLabel || (city ? city.name : activeCampaignZone?.cityName || "Area")}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>{isNilAnalysis ? "Zone NIL coinvolte" : "Comuni coinvolti"}</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{selZones.length || zonesInRadius.length}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Quantità inserita</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.white
                            }}>{formatIntegerIT(flyerQuantityFromStep1)}</div>
                                </div>
                                <div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>{step2ViewModel.primaryCoverageLabel || (areaMode === "full_municipality" ? "Copertura comune" : "Copertura area selezionata")}</div>
                                  <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: isPartial ? "#22C55E" : C.green
                            }}>{sharedCoveragePctText}</div>
                                </div>
                                {areaMode === "custom_zone" && zoneCoveragePctForBox != null && <div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)"
                            }}>Incidenza sul comune</div>
                                    <div style={{
                              fontFamily: F.sans,
                              fontSize: 13,
                              fontWeight: 700,
                              color: "rgba(255,255,255,.6)"
                            }}>{zoneCoveragePctForBox}%</div>
                                  </div>}
                                {isPartial && <>
                                    <div>
                                      <div style={{
                                fontFamily: F.sans,
                                fontSize: 10,
                                color: "rgba(255,255,255,.45)"
                              }}>Quantità consigliata</div>
                                      <div style={{
                                fontFamily: F.sans,
                                fontSize: 13,
                                fontWeight: 700,
                                color: C.white
                              }}>{formatIntegerIT(requiredFlyers)}</div>
                                    </div>
                                    <div>
                                      <div style={{
                                fontFamily: F.sans,
                                fontSize: 10,
                                color: "rgba(255,255,255,.45)"
                              }}>Quantità mancante</div>
                                      <div style={{
                                fontFamily: F.sans,
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#22C55E"
                              }}>{formatIntegerIT(missingFlyers)}</div>
                                    </div>
                                  </>}
                              </>}
                          </div>
                        </div>
                        </div>

                          {isPartial ? <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                  }}>
                              <div style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(34, 197, 94,.08)",
                      border: "1px solid rgba(34, 197, 94,.28)",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10
                    }}>
                                <span style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: `${"#22C55E"}22`,
                        color: "#22C55E",
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase"
                      }}>Copertura parziale</span>
                                <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: "rgba(255,255,255,.8)",
                        lineHeight: 1.4
                      }}>
                                  Con {Number(availableFlyers || 0).toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini puoi coprire {step2CoverageFullLabel || "una quota non calcolabile del fabbisogno operativo"}. Denominatore: {step2RequirementContextLabel}. Per copertura completa stimiamo {requiredFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini. Scegli la quantita finale da portare al preventivo.
                                </div>
                              </div>

                              {coverageDecision === "keepCurrent" && <div style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(46,204,138,.08)",
                      border: "1px solid rgba(46,204,138,.28)",
                      fontFamily: F.sans,
                      fontSize: 12,
                      color: C.green,
                      fontWeight: 700,
                      textAlign: "center"
                    }}>
                                  Quantita disponibile confermata. Puoi modificare la scelta qui sotto.
                                </div>}
                              <div style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      gap: 8
                    }}>
                                <button onClick={() => selectCoverageQuantityDecision("keepCurrent")} aria-pressed={coverageDecision === "keepCurrent"} data-selected={coverageDecision === "keepCurrent" ? "true" : "false"} aria-label={`Mantieni ${Number(availableFlyers || 0).toLocaleString("it-IT", {
                        useGrouping: true
                      })} volantini`} style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageDecision === "keepCurrent" ? "rgba(46,204,138,.16)" : "transparent",
                        color: C.white,
                        border: `1px solid ${coverageDecision === "keepCurrent" ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.3)"}`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  {coverageDecision === "keepCurrent" ? "[x] " : ""}Mantieni {Number(availableFlyers || 0).toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini
                                </button>
                                <button onClick={() => selectCoverageQuantityDecision("useRecommended")} aria-pressed={coverageDecision === "useRecommended"} data-selected={coverageDecision === "useRecommended" ? "true" : "false"} aria-label={`Aumenta a ${requiredFlyers.toLocaleString("it-IT", {
                        useGrouping: true
                      })} volantini`} style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageDecision === "useRecommended" ? col : `${col}22`,
                        color: C.white,
                        border: `1px solid ${coverageDecision === "useRecommended" ? col : `${col}66`}`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  {coverageDecision === "useRecommended" ? "[x] " : ""}Aumenta a {requiredFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini
                                </button>
                                <button onClick={() => selectCoverageQuantityDecision("manual")} aria-pressed={coverageDecision === "manual"} data-selected={coverageDecision === "manual" ? "true" : "false"} aria-label="Modifica manualmente la quantita" style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageDecision === "manual" ? `${col}22` : "transparent",
                        color: col,
                        border: `1px solid ${coverageDecision === "manual" ? col : `${col}45`}`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  {coverageDecision === "manual" ? "[x] " : ""}Modifica manualmente
                                </button>
                              </div>
                              {coverageDecision === "manual" && <div style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6
                    }}>
                                  <input type="number" min="1" value={manualFlyers} onChange={e => updateManualFlyersQuantity(e.target.value)} placeholder="Quantita manuale" aria-label="Quantita manuale volantini" style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: `1px solid ${isCoverageDecisionValid ? "rgba(46,204,138,.45)" : "rgba(248,113,113,.45)"}`,
                        background: "rgba(255,255,255,.05)",
                        color: C.white,
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700
                      }} />
                                  {!isCoverageDecisionValid && <div style={{
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(248,113,113,.92)"
                      }}>
                                      Inserisci una quantita maggiore di 0 e attendi la ripartizione coerente.
                                    </div>}
                                </div>}
                            </div> : hasSurplus ? <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                  }}>
                              <div style={{
                      padding: "10px 14px",
                      background: "rgba(46,204,138,.08)",
                      border: "1px solid rgba(46,204,138,.2)",
                      borderRadius: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10
                    }}>
                                <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10
                      }}>
                                  <span style={{
                          padding: "4px 8px",
                          borderRadius: 6,
                          background: `${C.green}22`,
                          color: C.green,
                          fontFamily: F.sans,
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: "uppercase"
                        }}>Copertura completa raggiunta</span>
                                </div>
                                <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "rgba(255,255,255,.8)",
                        lineHeight: 1.5
                      }}>
                                  Hai inserito {flyerQuantityFromStep1.toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini. Per coprire {city?.name || "l'area selezionata"} la quantità consigliata è circa {requiredFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })}. I volantini residui sono {surplusFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })}.
                                </div>
                                <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3,1fr)",
                        gap: 8
                      }}>
                                  <div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 10,
                            color: "rgba(255,255,255,.45)"
                          }}>Quantità inserita</div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.white
                          }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                              useGrouping: true
                            })}</div>
                                  </div>
                                  <div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 10,
                            color: "rgba(255,255,255,.45)"
                          }}>Quantità consigliata</div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.white
                          }}>{requiredFlyers.toLocaleString("it-IT", {
                              useGrouping: true
                            })}</div>
                                  </div>
                                  <div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 10,
                            color: "rgba(255,255,255,.45)"
                          }}>Volantini residui</div>
                                    <div style={{
                            fontFamily: F.sans,
                            fontSize: 13,
                            fontWeight: 700,
                            color: C.orange
                          }}>{surplusFlyers.toLocaleString("it-IT", {
                              useGrouping: true
                            })}</div>
                                  </div>
                                </div>
                              </div>

                              {coverageStrategy && <div style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(46,204,138,.08)",
                      border: "1px solid rgba(46,204,138,.28)",
                      fontFamily: F.sans,
                      fontSize: 12,
                      color: C.green,
                      fontWeight: 700
                    }}>
                                  {coverageStrategy === "reduce_to_recommended" && `Quantità ridotta a ${requiredFlyers.toLocaleString("it-IT", {
                        useGrouping: true
                      })} volantini.`}
                                  {coverageStrategy === "extra_frequency" && "Useremo i volantini extra per rinforzare le zone migliori / secondo passaggio dove utile."}
                                  {coverageStrategy === "expand_area" && "Espansione area richiesta — passa a modalità Raggio o aggiungi comuni vicini per usare tutti i volantini."}
                                </div>}

                              <div style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      gap: 8
                    }}>
                                  <button onClick={() => {
                        selectCoverageQuantityDecision("useRecommended");
                        setCoverageStrategy("reduce_to_recommended");
                        debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "reduce_to_recommended");
                      }} aria-pressed={coverageStrategy === "reduce_to_recommended"} data-selected={coverageStrategy === "reduce_to_recommended" ? "true" : "false"} style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageStrategy === "reduce_to_recommended" ? col : `${col}22`,
                        color: C.white,
                        border: `1px solid ${col}66`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  Adatta a {requiredFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })} volantini
                                </button>
                                  <button onClick={() => {
                        setCoverageStrategy("extra_frequency");
                        selectCoverageQuantityDecision("keepCurrent");
                        debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "extra_frequency");
                      }} aria-pressed={coverageStrategy === "extra_frequency"} data-selected={coverageStrategy === "extra_frequency" ? "true" : "false"} style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageStrategy === "extra_frequency" ? "rgba(46,204,138,.16)" : "transparent",
                        color: C.white,
                        border: `1px solid ${coverageStrategy === "extra_frequency" ? "rgba(46,204,138,.45)" : "rgba(255,255,255,.3)"}`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  Mantieni {flyerQuantityFromStep1.toLocaleString("it-IT", {
                          useGrouping: true
                        })}
                                </button>
                                  <button onClick={() => {
                        setCoverageStrategy("expand_area");
                        selectCoverageQuantityDecision("keepCurrent");
                        debugStep2Log("[STEP2_COVERAGE_STRATEGY_SELECTED]", "expand_area");
                      }} aria-pressed={coverageStrategy === "expand_area"} data-selected={coverageStrategy === "expand_area" ? "true" : "false"} style={{
                        flex: 1,
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: coverageStrategy === "expand_area" ? `${col}22` : "transparent",
                        color: col,
                        border: `1px solid ${col}45`,
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer"
                      }}>
                                  Espandi area
                                </button>
                              </div>

                              {coverageStrategy === "expand_area" && <div style={{
                      display: "flex",
                      flexDirection: isMobile ? "column" : "row",
                      gap: 8,
                      alignItems: isMobile ? "stretch" : "center",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,.03)",
                      border: "1px solid rgba(255,255,255,.08)"
                    }}>
                                  <div style={{
                        flex: 1,
                        fontFamily: F.sans,
                        fontSize: 11,
                        color: "rgba(255,255,255,.6)"
                      }}>
                                    Passa a modalità Raggio per includere i comuni vicini, oppure resta su Comune.
                                  </div>
                                  <button onClick={switchToRadiusMode} style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        background: col,
                        color: C.white,
                        border: "none",
                        fontFamily: F.sans,
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap"
                      }}>
                                    Passa a modalità Raggio
                                  </button>
                                </div>}
                            </div> : <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12
                  }}>
                              <div style={{
                      padding: "10px 14px",
                      background: "rgba(46,204,138,.08)",
                      border: "1px solid rgba(46,204,138,.2)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 10
                    }}>
                                <span style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        background: `${C.green}22`,
                        color: C.green,
                        fontFamily: F.sans,
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase"
                      }}>Copertura completa</span>
                                <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "rgba(255,255,255,.8)"
                      }}>La quantità inserita è sufficiente per coprire l’area selezionata.</div>
                              </div>
                            </div>}
                        </div> : (/* Manual Mode Footer */
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                }}>
                        {isInvalid ? <div style={{
                    background: "rgba(248,113,113,.1)",
                    border: "1px solid rgba(248,113,113,.3)",
                    borderRadius: 10,
                    padding: "10px 14px"
                  }}>
                            <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 700,
                      color: C.red,
                      marginBottom: 4
                    }}>Errore assegnazione</div>
                            <div style={{
                      fontFamily: F.sans,
                      fontSize: 11,
                      color: "rgba(255,255,255,.7)"
                    }}>
                              Hai assegnato <b style={{
                        color: C.white
                      }}>{totalAssigned.toLocaleString("it-IT", {
                          useGrouping: true
                        })}</b> volantini, ma ne hai disponibili solo <b style={{
                        color: C.white
                      }}>{flyerQuantityFromStep1.toLocaleString("it-IT", {
                          useGrouping: true
                        })}</b>.
                              Riduci una zona o aumenta la quantità.
                            </div>
                          </div> : <div style={{
                    background: "rgba(46,204,138,.08)",
                    border: "1px solid rgba(46,204,138,.2)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                            <div>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 12,
                        fontWeight: 700,
                        color: C.green
                      }}>Assegnazione manuale valida.</div>
                              <div style={{
                        fontFamily: F.sans,
                        fontSize: 10,
                        color: "rgba(255,255,255,.4)",
                        marginTop: 2
                      }}>
                                {remainingFlyers > 0 ? `Volantini residui: ${remainingFlyers.toLocaleString("it-IT", {
                          useGrouping: true
                        })}` : "Tutti i volantini sono stati assegnati."}
                              </div>
                            </div>
                          </div>}
                        <div style={{
                    display: "flex",
                    gap: 8
                  }}>
                          {isInvalid && <button onClick={() => setData(d => ({
                      ...d,
                      qty: totalAssigned,
                      flyerQuantity: totalAssigned
                    }))} style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: col,
                      color: C.white,
                      border: "none",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}>
                              Aumenta quantità a {totalAssigned.toLocaleString("it-IT", {
                        useGrouping: true
                      })}
                            </button>}
                          <button onClick={() => setAllocationMode("auto")} style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,.08)",
                      color: "rgba(255,255,255,.6)",
                      border: "1px solid rgba(255,255,255,.1)",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}>
                            Ripristina automatico
                          </button>
                          {!isInvalid && hasAtLeastOne && <button onClick={handleNext} style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      background: col,
                      color: C.white,
                      border: "none",
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginLeft: "auto"
                    }}>
                              Continua con distribuzione manuale
                            </button>}
                        </div>
                      </div>)}

                  </div>;
            })()}
            </div>}
        </div>

        {/* RIGHT COLUMN - ACTIVE ZONE SUMMARY */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          position: isMobile ? "static" : "sticky",
          top: 20,
          alignSelf: "start"
        }}>
          {activeCampaignZone && <div style={{
            background: "rgba(255,255,255,.025)",
            borderRadius: 10,
            padding: "10px 12px",
            border: `1px solid rgba(255,255,255,.06)`
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 900,
                color: col,
                letterSpacing: ".08em",
                textTransform: "uppercase"
              }}>Zona attiva</div>
                
              </div>
              <div style={{
              fontFamily: F.serif,
              fontSize: 22,
              color: C.white,
              lineHeight: 1,
              marginBottom: 4
            }}>{activeCampaignZone.zone_label || "Zona"}</div>
              <div style={{
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.46)",
              lineHeight: 1.45
            }}>
                {step2ViewModel.primaryAreaLabel} · {isBusinessStep2 ? `${selectedOperationalPois.length} attività selezionate` : `Quantità assegnata: ${formatIntegerIT(finalFlyersRounded)} volantini`}
              </div>
            </div>}
          {/* GRUPPO A: RISULTATI DELLA CONFIGURAZIONE */}
          {(selZones.length > 0 || zonesInRadius.length > 0 || activeCampaignZone) && <div style={{
            background: "rgba(255,255,255,.04)",
            borderRadius: 12,
            padding: "18px 20px",
            border: `1px solid ${col}30`
          }}>
              <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 14
            }}>
                <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                color: col,
                letterSpacing: ".06em",
                textTransform: "uppercase"
              }}>{hasUnconfirmedAddressPoint ? "Anteprima del NIL vicino" : "Risultato della configurazione"}</span>
              </div>
              <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 14
            }}>

                {/* Famiglie / POI / Aziende — da step2ViewModel (fonte unica) */}
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                paddingBottom: 10,
                borderBottom: "1px solid rgba(255,255,255,.05)"
              }}>
                  <div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.5)",
                    marginBottom: 2
                  }}>{step2ViewModel.primaryFamiliesLabel}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: step2ViewModel.hasUsableCoverageData || !isResidentialStep2 ? 28 : 14,
                    fontWeight: 800,
                    color: C.white,
                    lineHeight: 1.2
                  }}>
                      {showTerritoryData && !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : formatIntegerIT(step2ViewModel.primaryFamiliesValue)}
                    </div>
                  </div>
                  <span style={{
                  opacity: .65
                }}><Step1Icon name={isResidentialStep2 ? "family" : isMovementStep2 ? "pin" : "building"} size={24} /></span>
                </div>

                {/* Copertura */}
                {!isBusinessStep2 && step2TruthModel.coverage.operationalPct != null && <div style={{
                paddingBottom: 12,
                borderBottom: "1px solid rgba(255,255,255,.05)"
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.5)",
                  marginBottom: 4
                }}>Copertura operativa dello scenario corrente</div>
                    <div style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8
                }}>
                      <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: 26,
                    fontWeight: 800,
                    color: C.green,
                    lineHeight: 1
                  }}>{step2CoveragePctLabel}</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.62)",
                    lineHeight: 1.35
                  }}>del fabbisogno operativo</div>
                      <div style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.45)",
                    lineHeight: 1.35
                  }}>{formatIntegerIT(step2TruthModel.quantity.current)} ÷ {formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.</div>
                    </div>
                    <div style={{
                  marginTop: 5,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.38)"
                }}>Denominatore: {step2RequirementContextLabel}.</div>
                  </div>}

                {showTerritoryData && <div style={{
                padding: 13,
                borderRadius: 11,
                background: `${col}12`,
                border: `1px solid ${col}30`,
                boxShadow: `0 12px 30px ${col}10`
              }}>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: col,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  marginBottom: 5
                }}>{step2ViewModel.recommendedFlyersLabel}</div>
                    <div style={{
                  fontFamily: F.sans,
                  fontSize: step2ViewModel.hasUsableCoverageData ? 27 : 14,
                  fontWeight: 900,
                  color: C.white,
                  lineHeight: 1.2
                }}>{step2ViewModel.hasUsableCoverageData ? formatIntegerIT(step2ViewModel.recommendedFlyersValue) : "Dato non disponibile"}</div>
                    {step2ViewModel.hasUsableCoverageData ? <>
                        <div style={{
                    marginTop: 6,
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.56)",
                    lineHeight: 1.35
                  }}>Per copertura completa {areaMode === "radius" ? `dell'area ${radiusKm || radius} km` : areaMode === "full_municipality" ? "del comune" : "dell'area selezionata"}</div>
                        <div style={{
                    marginTop: 5,
                    fontFamily: F.sans,
                    fontSize: 10,
                    color: "rgba(255,255,255,.42)",
                    lineHeight: 1.35
                  }}>Il fabbisogno consigliato include il margine operativo previsto dai dati territoriali disponibili.</div>
                      </> : <div style={{
                  marginTop: 6,
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.5)",
                  lineHeight: 1.35
                }}>Il fabbisogno non può essere calcolato senza dati territoriali validi.</div>}
                  </div>}

                {/* Comuni, volantini, raggio su 3 colonne */}
                <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8
              }}>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? "Attività selezionate" : step2ViewModel.availableNilCount > 0 ? "Zone coinvolte / disponibili" : step2ViewModel.zoneCountLabel}</div>
                    <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: showTerritoryData && !step2ViewModel.hasUsableCoverageData ? 12 : 18,
                    fontWeight: 800,
                    color: C.white
                  }}>{isBusinessStep2 ? selectedOperationalPois.length : showTerritoryData && !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : `${step2TruthModel.zones.involved} / ${step2TruthModel.zones.available}`}</div>
                  </div>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? "Materiali necessari" : "Quantità inserita"}</div>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 15,
                    fontWeight: 800,
                    color: C.blue,
                    lineHeight: 1.1
                  }}>{isBusinessStep2 ? businessMaterialPlan?.materialsRequired == null ? "Da definire" : formatIntegerIT(businessMaterialPlan.materialsRequired) : formatIntegerIT(step2TruthModel.quantity.current)}</div>
                  </div>
                  <div style={{
                  background: "rgba(255,255,255,.05)",
                  borderRadius: 9,
                  padding: "10px 12px"
                }}>
                    <div style={{
                    fontFamily: F.sans,
                    fontSize: 9,
                    color: "rgba(255,255,255,.4)",
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                    marginBottom: 5
                  }}>{isBusinessStep2 ? Number(businessMaterialPlan?.materialsMissing) > 0 ? "Materiali mancanti" : "Materiali residui" : !step2ViewModel.hasUsableCoverageData ? "Bilancio quantità" : step2TruthModel.quantity.missing > 0 ? "Quantità mancante" : "Quantità oltre fabbisogno"}</div>
                    <div className="vp-data-number" style={{
                    fontFamily: F.sans,
                    fontSize: 15,
                    fontWeight: 800,
                    color: (isBusinessStep2 ? Number(businessMaterialPlan?.materialsMissing) > 0 : step2ViewModel.hasUsableCoverageData && step2TruthModel.quantity.missing > 0) ? "#FBBF24" : C.green
                  }}>{isBusinessStep2 ? businessMaterialPlan?.materialsRequired == null ? "Da definire" : `${formatIntegerIT(Number(businessMaterialPlan.materialsMissing) > 0 ? businessMaterialPlan.materialsMissing : businessMaterialPlan.materialsRemaining)} pz.` : !step2ViewModel.hasUsableCoverageData ? "Dato non disponibile" : `${formatIntegerIT(step2TruthModel.quantity.missing > 0 ? step2TruthModel.quantity.missing : step2TruthModel.quantity.surplus)} pz.`}</div>
                  </div>
                </div>

                {/* 7. Messaggio umano di sintesi (Fase 1) */}
                {(() => {
                const insQty = step2TruthModel.quantity.current;
                const recQty = step2TruthModel.quantity.recommendedRequirement;
                const covPct = step2TruthModel.coverage.operationalPct || 0;
                const insFmt = formatIntegerIT(insQty);
                const areaLbl = step2ViewModel.primaryAreaLabel || "questa zona";
                let summaryMsg = "";
                if (isResidentialStep2) {
                  if (!step2ViewModel.hasUsableCoverageData) {
                    summaryMsg = `I dati territoriali necessari non sono disponibili per ${areaLbl}. Copertura, fabbisogno e quantità residua non vengono calcolati.`;
                  } else if (missingFlyers > 0) {
                    summaryMsg = `Con ${insFmt} volantini il sistema concentrera la distribuzione nelle zone con maggiore priorita e coprira ${step2CoverageFullLabel || "una quota non calcolabile del fabbisogno operativo"}. Denominatore: ${step2RequirementContextLabel}. Per una copertura completa del territorio sono stimati ${formatIntegerIT(recQty)} volantini.`;
                  } else if (insQty > recQty && recQty > 0) {
                    const surplus = insQty - recQty;
                    summaryMsg = `Con ${insFmt} volantini copri interamente ${areaLbl}. Restano ${formatIntegerIT(surplus)} volantini che puoi utilizzare per ampliare l'area.`;
                  } else {
                    summaryMsg = `Con ${insFmt} volantini copri interamente ${areaLbl}.`;
                  }
                } else if (isMovementStep2) {
                  summaryMsg = pois.length > 0 || transportState?.available ? `Lo scenario da ${insFmt} volantini considera i POI e i nodi TPL effettivamente restituiti in ${areaLbl}; non rappresenta un conteggio di passanti.` : `Lo scenario da ${insFmt} volantini è parziale: POI e trasporto non sono disponibili per ${areaLbl}.`;
                } else {
                  summaryMsg = pois.length > 0 ? `Lo scenario da ${insFmt} volantini usa le attività POI restituite per ${areaLbl}; non equivale a un censimento completo di imprese o uffici.` : `Lo scenario da ${insFmt} volantini è parziale: censimento imprese, uffici e aree produttive non disponibile.`;
                }
                return <div style={{
                  marginTop: 14,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "rgba(56,189,248,.08)",
                  border: "1px solid rgba(56,189,248,.22)",
                  fontFamily: F.sans,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,.88)",
                  lineHeight: 1.45
                }}>
                      <div>{summaryMsg}</div>
                      {step2TruthModel.zones.firstPriority && <div style={{
                    marginTop: 7,
                    color: "rgba(255,255,255,.62)"
                  }}>
                          Prima priorità: <b style={{
                      color: C.white
                    }}>{step2TruthModel.zones.firstPriority.name}</b>. Criterio: ordine di allocazione corrente condiviso con il Report Avanzato.
                        </div>}
                    </div>;
              })()}

              </div>
            </div>}

          {/* GRUPPO B: OUTPUT DEL SERVIZIO SELEZIONATO (SINTETICO MAX 4 KPI) */}
          {(selZones.length > 0 || zonesInRadius.length > 0 || activeCampaignZone) && (() => {
            const activeServiceOutputs = isResidentialStep2 ? residentialMainOutputsNormalized : isMovementStep2 ? h2hMainOutputs : [{
              l: "Attività disponibili",
              v: formatIntegerIT(pois.length),
              u: "att.",
              src: "OpenStreetMap / fonti collegate",
              c: "#A78BFA"
            }, {
              l: "Attività selezionate",
              v: formatIntegerIT(selectedOperationalPois.length),
              u: "att.",
              src: "Selezione cliente",
              c: "#4ADE80"
            }, businessMaterialPlan?.materialsRequired != null ? {
              l: "Materiali necessari",
              v: formatIntegerIT(businessMaterialPlan.materialsRequired),
              u: "pz.",
              src: "Copie per attività",
              c: "#38BDF8"
            } : null, businessOperationalPlan?.calculable ? {
              l: "Giornate-addetto",
              v: businessOperationalPlan.operatorDays,
              u: "",
              src: "Tempo medio per visita",
              c: "#FBBF24"
            } : null].filter(Boolean);
            const activeServiceTitle = isResidentialStep2 ? "Output Door to Door" : isMovementStep2 ? "Output Hand to Hand" : "Output Business Distribution";
            const baseDisplayOutputs = Array.isArray(activeServiceOutputs) ? activeServiceOutputs : [];
            const displayOutputs = [...baseDisplayOutputs.map(item => item.l === "Copertura stimata" ? {
              ...item,
              l: "Copertura operativa",
              v: step2CoverageFullLabel || item.v,
              u: "",
              src: "Fabbisogno operativo"
            } : item), ...(isResidentialStep2 && step2TruthModel.duration.calculable ? [{
              l: "Durata calendario",
              v: step2TruthModel.duration.days,
              u: "giorni",
              src: null
            }] : [])];
            return <div style={{
              background: "rgba(255,255,255,.04)",
              borderRadius: 12,
              padding: "18px 20px",
              border: `1px solid ${col}30`
            }}>
                <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 14
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: col,
                  letterSpacing: ".06em",
                  textTransform: "uppercase"
                }}>Report Territoriale Avanzato</span>
                </div>
                <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 10
              }}>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,.62)",
                  lineHeight: 1.45
                }}>
                    Approfondisci demografia, NIL, mobilità, attività, mercato immobiliare, score e fonti realmente disponibili per la zona selezionata.
                  </div>
                  {displayOutputs.map((item, idx) => <div key={idx} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingBottom: idx < displayOutputs.length - 1 ? 8 : 0,
                  borderBottom: idx < displayOutputs.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none"
                }}>
                      <div>
                        <div style={{
                      fontFamily: F.sans,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "rgba(255,255,255,.82)"
                    }}>{item.l}</div>
                        {item.src && <div style={{
                      fontFamily: F.sans,
                      fontSize: 10,
                      color: "rgba(255,255,255,.4)"
                    }}>Fonte: {item.src}</div>}
                      </div>
                      <div style={{
                    textAlign: "right"
                  }}>
                        <div style={{
                      fontFamily: F.sans,
                      fontSize: 14,
                      fontWeight: 800,
                      color: item.c || C.white
                    }}>{item.v != null && item.v !== "" ? `${item.v}${item.u && item.u !== "" && !String(item.v).includes(item.u) ? ` ${item.u}` : ""}` : "—"}</div>
                      </div>
                    </div>)}
                </div>
                <button onClick={() => setIsAdminView(true)} style={{
                marginTop: 14,
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                background: `${col}1F`,
                border: `1px solid ${col}59`,
                color: col,
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all .2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8
              }}>
                  <Step1Icon name="chart" size={14} /> Apri Analisi Avanzata
                </button>
              </div>;
          })()}

          {/* Bottom actions container (Sempre visibile in fondo al rail) */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: "auto"
          }}>

            {step2ZonesReady && !coverageDecisionReady && <div style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(251,191,36,.08)",
              border: "1px solid rgba(251,191,36,.22)",
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.7)",
              lineHeight: 1.5,
              textAlign: "center"
            }}>
                Scegli come gestire la copertura parziale.
              </div>}
            {step2ZonesReady && <div style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(34,197,94,.07)",
              border: "1px solid rgba(34,197,94,.18)",
              fontFamily: F.sans,
              fontSize: 11,
              color: "rgba(255,255,255,.65)",
              lineHeight: 1.5,
              textAlign: "center"
            }}>
                La quantità selezionata verrà utilizzata nel preventivo. Potrai ancora modificarla prima della conferma.
              </div>}
            <button className="btn" onClick={handleNext} disabled={!canContinueCalendar} style={{
              width: "100%",
              minHeight: 52,
              padding: "0 16px",
              borderRadius: 12,
              border: canContinueCalendar ? "1px solid rgba(255,255,255,0.18)" : "none",
              background: canContinueCalendar ? col : "rgba(255,255,255,.08)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: 900,
              cursor: canContinueCalendar ? "pointer" : "not-allowed",
              boxShadow: canContinueCalendar ? `0 4px 16px ${col}66` : "none",
              textAlign: "center",
              transition: "all .2s ease"
            }}>
              {continueLabel}
            </button>
            {step2ZonesReady && !operationalSelectionReady && (isMovementStep2 || isBusinessStep2) && <div style={{
              padding: "9px 11px",
              borderRadius: 9,
              background: "rgba(245,158,11,.08)",
              border: "1px solid rgba(245,158,11,.22)",
              fontFamily: F.sans,
              fontSize: 10,
              color: "#FCD34D",
              lineHeight: 1.45,
              textAlign: "center"
            }}>
                {isBusinessStep2 ? "Seleziona almeno un’attività sulla mappa e assegnala a un addetto." : "Seleziona almeno un punto sulla mappa e assegnalo a un promoter."}
              </div>}
            {!step2ZonesReady && <div style={{
              fontFamily: F.sans,
              fontSize: 10,
              color: "rgba(255,255,255,.35)",
              textAlign: "center",
              lineHeight: 1.5,
              padding: "0 4px"
            }}>
                Assicurati che tutte le zone abbiano un'area geografica e una quantità di volantini valida.
              </div>}
          </div>
        </div>
        </>}
      </div>
      {!isAdminView && isTerritorialStep2AiEnabled && <React.Suspense fallback={<div style={{
      marginTop: 16,
      padding: 14,
      borderRadius: 12,
      background: "rgba(56,189,248,.07)",
      color: "rgba(255,255,255,.62)",
      fontFamily: F.sans,
      fontSize: 11
    }}>Inizializzazione Assistente Territoriale...</div>}>
          <TerritorialStep2AiBoundary truthModel={step2TruthModel} viewModel={step2ViewModel} loading={Boolean(apiLoading || gisLoading)} error={Boolean(apiError || gisTimedOut || hasCoverageCalculationError)} identity={aiIdentity} contextId={aiContextId} activeCampaignRef={data.campaignId || null} activeQuoteRef={data.quoteId || data.quoteRequestId || null} />
        </React.Suspense>}
    </div>;
}

