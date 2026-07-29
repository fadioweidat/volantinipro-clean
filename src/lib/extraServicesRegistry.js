/* Unica fonte dati per i servizi extra (Step4 + Preventivo Rapido).
   Estratta dal corpo di Step4: 3 voci a prezzo dinamico (printing,
   dedicated_supervision) dipendevano da closure locali del componente
   (flyerQty, dedicatedSupervisionPrice, campaignDurationKnown), quindi il
   registro è ora una funzione parametrizzata invece di una costante statica. */

export const SELECTED_EXTRAS_ORDER = [
  "tracking_gps", "photo_proof", "printing", "graphic_design", "design",
  "quality_control", "operator_support", "urgent_distribution", "puntiVetrina",
  "dedicated_supervision",
];
export const OPTIONAL_EXTRAS_ORDER = ["graphic_design", "tracking_gps", "photo_proof", "dedicated_supervision"];

export function buildExtraServicesRegistry({ flyerQty, dedicatedSupervisionPrice, campaignDurationKnown }) {
  return [
    {
      id: "tracking_gps", legacyIds: ["gps", "tracking_gps", "gps_default"], addId: "gps",
      commercialIcon: "pin", head: "Tracking GPS Live", col: "#22C55E", badge: "Più scelto",
      bullets: ["Segui in tempo reale gli operatori sulla mappa", "Storico percorso al termine della distribuzione", "Link di condivisione per il tuo team"],
      mappingLabel: "Tracking GPS", mappingDescription: "Monitoraggio operativo della distribuzione con tracciamento delle attività.", mappingIcon: "",
      optionalDescription: "Tracciamento operativo e timeline distributori.", optionalMicro: "Mostra avanzamento e operatori sulla mappa.", optionalIcon: "GPS",
      price: 25, optional: true,
    },
    {
      id: "photo_proof", legacyIds: ["foto", "photo_proof", "foto_localizzate", "photo_report_advanced"], addId: "photo_report_advanced",
      commercialIcon: "camera", head: "Report Fotografico", col: "#60A5FA", badge: "Massima sicurezza",
      bullets: ["30 foto geolocalizzate con data e orario", "Conferma visiva zona per zona", "Archivio scaricabile dal portale cliente"],
      mappingLabel: "Foto localizzate", mappingDescription: "Prove fotografiche con data, zona e riferimento operativo.", mappingIcon: "",
      optionalDescription: "Proof fotografici con data e zona.", optionalMicro: "Foto geolocalizzate con data e ora.", optionalIcon: "PHOTO",
      price: 35, optional: true,
    },
    {
      id: "graphic_design", legacyIds: ["graphic_design", "grafica_progetto"], addId: "graphic_design",
      commercialIcon: "palette", head: "Grafica", col: "#F472B6", badge: null,
      bullets: ["2 bozze incluse", "Consegna in 48h", "File pronto per la stampa"],
      mappingLabel: "Grafica", mappingDescription: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", mappingIcon: "palette",
      optionalDescription: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", optionalMicro: "Non hai ancora il volantino? Progettiamo noi la grafica per te.", optionalIcon: "GRAPHIC",
      price: 79, optional: true,
    },
    {
      id: "dedicated_supervision", legacyIds: ["dedicated_supervision", "supervisione_dedicata"], addId: "dedicated_supervision",
      commercialIcon: "eye", head: "Supervisione Dedicata", col: "#38BDF8", badge: "Consigliato con GPS Live",
      bullets: ["Monitoraggio attivo GPS e foto", "Intervento diretto sugli operatori in caso di problemi", "Contatto diretto dedicato"],
      mappingLabel: "Supervisione Dedicata", mappingDescription: "Un referente segue la tua campagna e interviene in caso di anomalie. Contattalo direttamente se hai bisogno.", mappingIcon: "eye",
      optionalDescription: "Un referente segue la tua campagna e interviene in caso di anomalie. Contattalo direttamente se hai bisogno.",
      optionalMicro: campaignDurationKnown ? "Consigliato se attivi anche Tracking GPS Live." : "Consigliato se attivi anche Tracking GPS Live. Prezzo indicativo, confermato in base alla durata effettiva.",
      optionalIcon: "SUPERVISION",
      price: dedicatedSupervisionPrice, optional: true,
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
      price: Math.ceil((flyerQty || 10000) / 1000) * 12, optional: false,
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

  return SELECTED_EXTRAS_ORDER.map((id) => registryById[id]).filter((ext) =>
    ext.legacyIds.some((oid) => currentServices.includes(oid)) ||
    data[ext.id] === true
  ).map((ext) => ({
    id: ext.id,
    label: ext.mappingLabel,
    description: ext.mappingDescription,
    price: ext.price,
    icon: ext.mappingIcon,
    status: ext.isUrgent ? "selected" : (ext.price === 0 ? "included" : "selected"),
    isUrgent: ext.isUrgent,
  }));
}

export function buildOptionalExtras(registryById) {
  return OPTIONAL_EXTRAS_ORDER.map((id) => registryById[id]).map((ext) => ({
    id: ext.id,
    addId: ext.addId,
    removeIds: ext.legacyIds,
    label: ext.head,
    description: ext.optionalDescription,
    micro: ext.optionalMicro,
    icon: ext.optionalIcon,
    price: ext.price,
  }));
}
