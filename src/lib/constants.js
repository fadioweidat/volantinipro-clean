export const C = {
  orange: "#E8571A",
  orangeGlow: "rgba(232,87,26,.35)",
  navy: "#1A2744",
  navyDeep: "#0F1A30",
  navyMid: "#162238",
  cream: "#FAF9F7",
  steelDark: "#E2E6EC",
  green: "#2ECC8A",
  blue: "#60A5FA",
  purple: "#A78BFA",
  yellow: "#FBBF24",
  red: "#F87171",
  teal: "#2DD4BF",
  text: "#1A1A1A",
  muted: "#6B7280",
  white: "#FFFFFF",
};

export const F = {
  sans: "'DM Sans', Inter, system-ui, sans-serif",
  serif: "'Playfair Display', Georgia, serif",
};

export const x=[{value:"Famiglie",l:"Abitazioni stimate",src:"Fonti territoriali",term:"Famiglie"},{value:"Zone",l:"Aree coperte",src:"Mappa e raggio",term:"Zone"},{value:"GPS",l:"Monitoraggio stradale",src:"Verifica campo",term:"GPS"},{value:"Report",l:"Documento finale",src:"Output verificabile",term:"Report PDF"}];
export const w=["Dati ISTAT ufficiali","GPS certificato","No vincoli mensili"];
export const j=["Retail locale","Food locale","Casa e servizi","Fitness locale","Attività locale"];
export const T=[{n:"01",t:"Configura campagna",d:"Scegli servizio, quantità, formato, stampa e frequenza della distribuzione.",b:"Servizio + quantità",c:"#E8571A"},{n:"02",t:"Zona e mappa",d:"Imposta comune e raggio, poi verifica famiglie ISTAT, comuni coinvolti, copertura e volantini consigliati.",b:"Analisi territoriale",c:"#E8571A"},{n:"03",t:"Pianificazione",d:"Scegli il periodo desiderato. Smart Pairing resta opzionale quando esistono campagne compatibili.",b:"Date + opzioni",c:"#E8571A"},{n:"04",t:"Preventivo completo",d:"Controlla il preventivo finale e avvia la campagna. Include tracking GPS live degli operatori e report finale con foto.",b:"Riepilogo + prezzo",c:"#E8571A"}];
export const z=[{name:"Door to Door",icon:"D2D",desc:"Distribuzione nelle cassette postali di condomini, palazzi, villette e zone residenziali.",features:["attività locali","promozioni zona","grande copertura territoriale"],c:C.orange},{name:"Hand to Hand",icon:"H2H",desc:"Distribuzione a mano in punti ad alto passaggio.",features:["POI rilevanti","Fermate metro/bus/treno","Scuole, università, eventi","Flusso potenziale","Smart Pairing"],c:C.orange},{name:"Business Distribution",icon:"B2B",desc:"Distribuzione mirata ad attività commerciali, uffici e zone business.",features:["B2B","fornitori","servizi professionali","attività locali"],c:C.orange}];
export const R=[{n:"01",t:"Preventivo Guidato",d:"Analisi completa e configurazione step-by-step.",benefits:["Analisi ISTAT zona","Mappa e copertura","GPS e report verificabili","Smart Pairing opzionale"],cta:"Preventivo Guidato",c:C.orange,fn:()=>n("step1")},{n:"02",t:"Preventivo Rapido",d:"Configurazione base e stima costi immediata.",benefits:["3 campi essenziali","Prezzo personalizzato","Nessun account richiesto"],cta:"Preventivo Rapido",c:C.orange,fn:()=>n("step1", { quickMode: true }),quick:!1},{n:"03",t:"Parla con un Consulente",d:"Preferisci supporto diretto? Invia una richiesta e ti ricontattiamo.",benefits:["Brief gratuito","Scelta servizio guidata","Richiamo operativo","Tempo: immediato"],cta:"Parla con un Consulente",c:C.orange,fn:()=>n("consultant")}];
