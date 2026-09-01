/* Unica fonte dati per i servizi extra (Step4 + Preventivo Rapido).
   Estratta dal corpo di Step4: 3 voci a prezzo dinamico (printing,
   dedicated_supervision) dipendevano da closure locali del componente
   (flyerQty, dedicatedSupervisionPrice, campaignDurationKnown), quindi il
   registro è ora una funzione parametrizzata invece di una costante statica. */

export const SELECTED_EXTRAS_ORDER = [
  "control_pro", "tracking_gps", "gps_plus_report", "photo_proof", "photo_report_advanced", "video_proof", "printing", "graphic_design", "design",
  "quality_control", "operator_support", "account_manager", "qr_analytics", "advanced_report", "urgent_distribution", "puntiVetrina",
  "dedicated_supervision",
];
// gps_plus_report resta nel registry e in SELECTED_EXTRAS_ORDER per non
// perdere preventivi storici che lo hanno gia' selezionato, ma non e' piu'
// proposto come nuovo extra: sovrappone Controllo PRO (GPS + report) senza
// far parte dei 3 gruppi Controllo e Report / Marketing / Assistenza.
export const OPTIONAL_EXTRAS_ORDER = ["control_pro", "tracking_gps", "photo_proof", "photo_report_advanced", "video_proof", "qr_analytics", "advanced_report", "account_manager", "dedicated_supervision"];

// Extra grafica LEGACY: nel NUOVO preventivo la grafica passa SOLO dalla
// sezione "Grafica" dello Step1 (data.printing.artwork.* + graphicPricing.js,
// prezzo €79). `graphic_design` e `design` NON vengono piu' proposti nel
// selettore extra dello Step4 — ma restano nel registry e in
// SELECTED_EXTRAS_ORDER, cosi' i preventivi STORICI che li contengono
// continuano a essere letti e prezzati correttamente da normalizeSelectedExtras.
export const LEGACY_HIDDEN_EXTRA_IDS = Object.freeze(["graphic_design", "design"]);

// Categorie di presentazione per il raggruppamento nello Step4 (sezione
// extra "Servizi inclusi / facoltativi"): CONTROLLO E REPORT, MARKETING,
// ASSISTENZA. Solo etichettatura per la UI, nessun prezzo duplicato qui.
export const EXTRA_CATEGORIES = {
  CONTROLLO_REPORT: "controllo_report",
  MARKETING: "marketing",
  ASSISTENZA: "assistenza",
};

// Id degli extra gia' compresi nel pacchetto Controllo PRO: se selezionato,
// questi extra non devono poter essere ri-acquistati singolarmente (niente
// doppio addebito) e vanno mostrati come "gia' inclusi" nella UI.
export const CONTROL_PRO_INCLUDED_IDS = ["tracking_gps", "photo_proof", "photo_report_advanced"];

import { computePrintEstimate } from "./pricing/printPricing.js";

export function buildExtraServicesRegistry({ flyerQty, durationDays, campaignDurationKnown, printConfig }) {
  return [
    {
      id: "tracking_gps", legacyIds: ["gps", "tracking_gps", "gps_default"], addId: "gps",
      commercialIcon: "pin", head: "Tracking GPS Live", col: "#22C55E", badge: "Più scelto",
      bullets: ["Segui in tempo reale gli operatori sulla mappa", "Storico percorso al termine della distribuzione", "Link di condivisione per il tuo team"],
      mappingLabel: "Tracking GPS", mappingDescription: "Monitoraggio operativo della distribuzione con tracciamento delle attività.", mappingIcon: "",
      optionalDescription: "Tracciamento operativo e timeline distributori.", optionalMicro: "Mostra avanzamento e operatori sulla mappa.", optionalIcon: "GPS",
      price: 60, optional: true, category: EXTRA_CATEGORIES.CONTROLLO_REPORT,
    },
    {
      id: "photo_proof", legacyIds: ["foto", "photo_proof", "foto_localizzate"], addId: "photo_proof",
      commercialIcon: "camera", head: "Foto Proof Base", col: "#60A5FA", badge: null,
      bullets: ["Foto geolocalizzate con data e orario", "Conferma visiva zona per zona", "Archivio scaricabile dal portale cliente"],
      mappingLabel: "Foto Proof Base", mappingDescription: "Prove fotografiche di base con data e zona.", mappingIcon: "",
      optionalDescription: "Proof fotografici con data e zona.", optionalMicro: "Foto geolocalizzate con data e ora.", optionalIcon: "PHOTO",
      price: 30, optional: true, category: EXTRA_CATEGORIES.CONTROLLO_REPORT,
    },
    {
      id: "photo_report_advanced", legacyIds: ["photo_report_advanced"], addId: "photo_report_advanced",
      commercialIcon: "camera", head: "Report Fotografico Completo", col: "#3B82F6", badge: "Massima sicurezza",
      bullets: ["Report fotografico dettagliato", "Archivio scaricabile esteso", "Mappatura fotografica avanzata"],
      mappingLabel: "Report Fotografico Completo", mappingDescription: "Prove fotografiche dettagliate con data, zona e riferimento operativo completo.", mappingIcon: "",
      optionalDescription: "Report fotografico dettagliato.", optionalMicro: "Mappatura visiva completa.", optionalIcon: "PHOTO",
      price: 50, optional: true, category: EXTRA_CATEGORIES.CONTROLLO_REPORT,
    },
    {
      id: "gps_plus_report", legacyIds: ["gps_plus_report"], addId: "gps_plus_report",
      commercialIcon: "pin", head: "GPS + Report Finale", col: "#10B981", badge: "Consigliato",
      bullets: ["Tracking GPS in tempo reale", "Report finale dettagliato", "Condivisione con il team"],
      mappingLabel: "GPS + Report Finale", mappingDescription: "Tracciamento GPS live più report finale di recapito.", mappingIcon: "",
      optionalDescription: "GPS e report finale.", optionalMicro: "Copertura tracking e report post-campagna.", optionalIcon: "GPS",
      price: 90, optional: true,
    },
    {
      id: "video_proof", legacyIds: ["video_proof"], addId: "video_proof",
      commercialIcon: "video", head: "Video Proof", col: "#F59E0B", badge: "Premium",
      bullets: ["Clip video delle consegne", "Conferma visiva premium", "File scaricabili"],
      mappingLabel: "Video Proof", mappingDescription: "Registrazioni video localizzate per prova inconfutabile.", mappingIcon: "",
      optionalDescription: "Video delle operazioni in campo.", optionalMicro: "Clip scaricabili con conferma geolocalizzata.", optionalIcon: "VIDEO",
      price: 60, optional: true, category: EXTRA_CATEGORIES.MARKETING,
    },
    {
      id: "control_pro", legacyIds: ["control_pro", "control_pro_99"], addId: "control_pro",
      commercialIcon: "shield", head: "Controllo PRO", col: "#8B5CF6", badge: "Pacchetto consigliato",
      bullets: ["Tracking GPS Live", "Foto proof completi", "Report finale PDF e mappa copertura"],
      mappingLabel: "Controllo PRO", mappingDescription: "Pacchetto sicurezza e controllo completo: GPS, Foto e Report finale in un unico bundle.", mappingIcon: "shield",
      optionalDescription: "Pacchetto sicurezza e controllo: GPS, Foto e Report finale.", optionalMicro: "Massima tranquillità a prezzo fisso.", optionalIcon: "SHIELD",
      bundleIncludesLabel: "Include Tracking GPS Live + Foto Proof + Report Finale",
      bundleIncludesIds: CONTROL_PRO_INCLUDED_IDS,
      price: 99, optional: true, category: EXTRA_CATEGORIES.CONTROLLO_REPORT,
    },
    {
      id: "graphic_design", legacyIds: ["graphic_design", "grafica_progetto"], addId: "graphic_design",
      commercialIcon: "palette", head: "Grafica", col: "#F472B6", badge: null,
      bullets: ["2 bozze incluse", "Consegna in 48h", "File pronto per la stampa"],
      mappingLabel: "Grafica", mappingDescription: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", mappingIcon: "palette",
      optionalDescription: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", optionalMicro: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", optionalIcon: "GRAPHIC",
      price: 79, optional: true, category: EXTRA_CATEGORIES.MARKETING,
    },
    {
      id: "dedicated_supervision", legacyIds: ["dedicated_supervision", "supervisione_dedicata"], addId: "dedicated_supervision",
      commercialIcon: "eye", head: "Supervisione Dedicata", col: "#38BDF8", badge: "Consigliato con GPS Live",
      bullets: ["Monitoraggio attivo GPS e foto", "Intervento diretto sugli operatori in caso di problemi", "Contatto diretto dedicato"],
      mappingLabel: "Supervisione Dedicata", mappingDescription: "Un referente segue la tua campagna e interviene in caso di anomalie. Contattalo direttamente se hai bisogno.", mappingIcon: "eye",
      optionalDescription: "Un referente segue la tua campagna e interviene in caso di anomalie. Contattalo direttamente se hai bisogno.",
      optionalMicro: "€120 / giorno. Le giornate operative esatte verranno definite e confermate.",
      optionalIcon: "SUPERVISION",
      price: 120, priceUnit: "day", optional: true, category: EXTRA_CATEGORIES.ASSISTENZA,
    },
    {
      id: "account_manager", legacyIds: ["account_manager"], addId: "account_manager",
      commercialIcon: "user", head: "Account Manager Dedicato", col: "#14B8A6", badge: null,
      bullets: ["Supporto continuo per l'intera campagna", "Priorità di contatto", "Pianificazione strategica inclusa"],
      mappingLabel: "Account Manager", mappingDescription: "Manager dedicato per tutto il ciclo di vita della campagna.", mappingIcon: "user",
      optionalDescription: "Un referente dedicato sempre a tua disposizione.", optionalMicro: "Consulenza e assistenza prioritaria.", optionalIcon: "USER",
      price: 80, optional: true, category: EXTRA_CATEGORIES.ASSISTENZA,
    },
    {
      id: "qr_analytics", legacyIds: ["qr_analytics", "qr"], addId: "qr_analytics",
      commercialIcon: "chart", head: "QR / Landing Analytics", col: "#EC4899", badge: null,
      bullets: ["Codice QR univoco stampato", "Landing page dedicata", "Tracciamento scansioni in tempo reale"],
      mappingLabel: "QR / Landing Analytics", mappingDescription: "Aggiunta codice QR al volantino con statistiche di conversione online.", mappingIcon: "chart",
      optionalDescription: "Monitora quante persone scansionano il tuo volantino.", optionalMicro: "Report accessi e click.", optionalIcon: "QR",
      price: 50, optional: true, category: EXTRA_CATEGORIES.MARKETING,
    },
    {
      id: "advanced_report", legacyIds: ["advanced_report", "report_avanzato"], addId: "advanced_report",
      commercialIcon: "document", head: "Report Avanzato Copertura", col: "#64748B", badge: null,
      bullets: ["Analisi dettagliata della penetrazione territoriale", "Statistiche di recapito per area", "Esportazione dati in vari formati"],
      mappingLabel: "Report Avanzato", mappingDescription: "Documentazione completa post-campagna con metriche extra.", mappingIcon: "document",
      optionalDescription: "Ricevi un'analisi approfondita al termine della campagna.", optionalMicro: "Ottimo per analisi marketing.", optionalIcon: "DOCUMENT",
      price: 40, optional: true, category: EXTRA_CATEGORIES.MARKETING,
    },
    {
      id: "puntiVetrina", legacyIds: [],
      commercialIcon: "shop", head: "Punti Vetrina", col: "#E8571A", badge: "Door to Door",
      bullets: ["Fino a 5 punti vetrina inclusi (bar/negozi)", "Selezionati e gestiti dal nostro team operativo", "Punto di appoggio extra per i tuoi volantini"],
      mappingLabel: "Punti Vetrina", mappingDescription: "Punti vetrina (bar/negozi) selezionati dal nostro team, fino a 5 punti inclusi.", mappingIcon: "shop",
      price: 35, optional: false,
    },
    {
      id: "printing", legacyIds: ["stampa", "printing"],
      commercialIcon: "printer", head: "Stampa Materiale", col: "#60A5FA", badge: "Miglior rapporto qualità/prezzo",
      bullets: ["Produzione professionale del materiale", "Qualità certificata per distribuzione", "Consegna prima della campagna"],
      mappingLabel: "Stampa materiale", mappingDescription: "Produzione del materiale prima della distribuzione.", mappingIcon: "",
      price: computePrintEstimate({
        quantity: flyerQty || 10000,
        printFormat: printConfig?.format,
        grammage: printConfig?.grammage,
        sides: printConfig?.sides,
        color: printConfig?.color,
        fold: printConfig?.folding ?? printConfig?.fold,
        urgency: printConfig?.urgency,
      }), optional: false,
    },
    {
      id: "design", legacyIds: ["grafica", "design", "preparazione_grafica"],
      commercialIcon: "palette", head: "Preparazione Grafica", col: "#A78BFA", badge: "Premium",
      bullets: ["Adattamento file al formato richiesto", "Verifica qualità prima della stampa", "Supporto creativo dedicato"],
      mappingLabel: "Preparazione grafica", mappingDescription: "Supporto per preparazione o adattamento del file grafico.", mappingIcon: "",
      price: 49, optional: false,
    },
    {
      id: "quality_control", legacyIds: ["quality", "quality_control", "controllo_qualita"],
      commercialIcon: "checkCircle", head: "Controllo Qualità", col: "#2ECC8A", badge: "Consigliato",
      bullets: ["Verifica operativa in campo", "Supervisione distribuzione", "Report anomalie"],
      mappingLabel: "Controllo qualità", mappingDescription: "Verifica aggiuntiva sulla corretta esecuzione della distribuzione.", mappingIcon: "",
      price: 25, optional: false,
    },
    {
      id: "operator_support", legacyIds: ["operator", "operator_support", "supporto_operatore"],
      commercialIcon: "user", head: "Supporto Operatore", col: "#60A5FA", badge: "Consigliato",
      bullets: ["Assistenza diretta alla pianificazione", "Contatto dedicato per la campagna", "Conferma operativa rapida"],
      mappingLabel: "Supporto operatore", mappingDescription: "Assistenza diretta per configurazione, pianificazione o conferma campagna.", mappingIcon: "",
      price: 39, optional: false,
    },
    {
      id: "urgent_distribution", legacyIds: ["urgent", "urgent_distribution", "distribuzione_urgente"],
      commercialIcon: "lightning", head: "Distribuzione Urgente", col: "#FF6666", badge: null,
      bullets: ["Gestione prioritaria della campagna", "Attivazione entro 48h", "Team dedicato"],
      mappingLabel: "Distribuzione urgente", mappingDescription: "Gestione prioritaria della campagna in tempi ridotti.", mappingIcon: "",
      price: 0, optional: false, isUrgent: true,
    },
  ];
}

export function buildExtraServicesById(registry) {
  return Object.fromEntries(registry.map((s) => [s.id, s]));
}

export function buildSvcCommercial(registry) {
  return Object.fromEntries(registry.map((s) => [s.id, { icon: s.commercialIcon, head: s.head, col: s.col, badge: s.badge, bullets: s.bullets }]));
}

export function normalizeSelectedExtras(data, registryById) {
  const currentServices = [
    ...(data.extraServices || []),
    ...(data.printServices || []),
    ...(data.urgency === "urgent" ? ["urgent"] : []),
  ];

  let rawList = SELECTED_EXTRAS_ORDER.map((id) => registryById[id]).filter((ext) =>
    ext.legacyIds.some((oid) => currentServices.includes(oid)) ||
    data[ext.id] === true
  );

  // Control Pro Deduplication — evita il doppio addebito: se Controllo PRO
  // e' selezionato, gli extra gia' compresi nel bundle (CONTROL_PRO_INCLUDED_IDS)
  // non compaiono come voci separate ne' nel totale.
  const hasControlPro = rawList.some(e => e.id === "control_pro");
  if (hasControlPro) {
    rawList = rawList.filter(e => !CONTROL_PRO_INCLUDED_IDS.includes(e.id));
  }

  return rawList.map((ext) => ({
    id: ext.id,
    label: ext.mappingLabel,
    description: ext.mappingDescription,
    price: ext.price,
    priceUnit: ext.priceUnit || null,
    icon: ext.mappingIcon,
    status: ext.isUrgent ? "selected" : (ext.price === 0 ? "included" : "selected"),
    isUrgent: ext.isUrgent,
  }));
}

export function buildOptionalExtras(registryById) {
  // Difesa in profondita': anche se un id legacy rientrasse nell'ordine, non
  // viene mai proposto nel selettore extra del nuovo Step4.
  return OPTIONAL_EXTRAS_ORDER
    .filter((id) => !LEGACY_HIDDEN_EXTRA_IDS.includes(id))
    .map((id) => registryById[id])
    .map((ext) => ({
    id: ext.id,
    addId: ext.addId,
    removeIds: ext.legacyIds,
    category: ext.category || null,
    priceUnit: ext.priceUnit || null,
    bundleIncludesLabel: ext.bundleIncludesLabel || null,
    bundleIncludesIds: ext.bundleIncludesIds || null,
    label: ext.head,
    description: ext.optionalDescription,
    micro: ext.optionalMicro,
    icon: ext.optionalIcon,
    price: ext.price,
  }));
}
