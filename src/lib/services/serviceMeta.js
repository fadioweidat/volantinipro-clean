import { C } from "../constants.js";

export const LAYERS = {
    d2d: [{
      id: "families",
      label: "Famiglie",
      field: "families",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "nuclei",
      src: "ISTAT",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "pop",
      label: "Popolazione",
      field: "pop",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "ab.",
      src: "ISTAT",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "densita",
      label: "Densit ab.",
      field: "densita",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "ab/km",
      src: "ISTAT",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }, {
      id: "coverage",
      label: "Peso sul totale",
      field: "coverage",
      fmt: n => n + "%",
      unit: "%",
      src: "Dati geografici",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "flyersMin",
      label: "Volantini consigliati",
      field: "flyersMin",
      fmt: n => n.toLocaleString("it-IT") + "+",
      unit: "pz.",
      src: "Analisi interna",
      lo: "#F0F9FF",
      hi: "#075985"
    }, {
      id: "familyIdx",
      label: "Residential relevance",
      field: "familyIdx",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FDF2F8",
      hi: "#701A75"
    }, {
      id: "eta65",
      label: "Et 65+",
      field: "eta65",
      fmt: n => n + "%",
      unit: "over 65",
      src: "ISTAT",
      lo: "#FFFBEB",
      hi: "#78350F"
    }],
    h2h: [{
      id: "flowScore",
      label: "Intensita passaggio",
      field: "flowScore",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "poi",
      label: "POI concentration",
      field: "poi",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "POI",
      src: "Google Places",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "transitStops",
      label: "Transit proximity",
      field: "transitStops",
      fmt: n => n + " fermate",
      unit: "fermate",
      src: "Trasporto pubblico / GTFS",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }, {
      id: "strongPts",
      label: "Hotspot operativi",
      field: "strongPts",
      fmt: n => n + " punti",
      unit: "punti",
      src: "Analisi interna",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "commDens",
      label: "Densit passaggio",
      field: "commDens",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "nearbyBiz",
      label: "Attrattori locali",
      field: "nearbyBiz",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "att.",
      src: "Google Places",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }],
    b2b: [{
      id: "bizTotal",
      label: "Attivit rilevate",
      field: "bizTotal",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "att.",
      src: "Google Places",
      lo: "#FDF2F8",
      hi: "#701A75"
    }, {
      id: "competitors",
      label: "Competitor",
      field: "competitors",
      fmt: n => n.toLocaleString("it-IT"),
      unit: "comp.",
      src: "Google Places",
      lo: "#FFF5F0",
      hi: "#C2410C"
    }, {
      id: "commDensB2B",
      label: "Densit commerciale",
      field: "commDensB2B",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#FFFBEB",
      hi: "#78350F"
    }, {
      id: "clusters",
      label: "Forza cluster",
      field: "clusters",
      fmt: n => n + " cluster",
      unit: "cluster",
      src: "Analisi interna",
      lo: "#EFF6FF",
      hi: "#1E3A8A"
    }, {
      id: "targetBiz",
      label: "Rilevanza target",
      field: "targetBiz",
      fmt: n => n.toLocaleString("it-IT") + " att.",
      unit: "att.",
      src: "Google Places",
      lo: "#ECFDF5",
      hi: "#065F3C"
    }, {
      id: "reddito",
      label: "Reddito medio",
      field: "reddito",
      fmt: n => "EUR " + n.toLocaleString("it-IT"),
      unit: "EUR /anno",
      src: "Dati territoriali",
      lo: "#F0FDF4",
      hi: "#14532D"
    }, {
      id: "cdIdx",
      label: "Commercial Density Index",
      field: "cdIdx",
      fmt: n => n + "/100",
      unit: "/100",
      src: "Analisi interna",
      lo: "#F5F3FF",
      hi: "#4C1D95"
    }]
  };

export const SERVICE_META = {
    d2d: {
      label: "Door to Door",
      icon: " ",
      color: C.orange,
      mode: "residential",
      src: ["ISTAT", "Mapbox", "OpenStreetMap", "landuse / buildings", "Dati geografici", "Analisi interna"],
      allocationSort: (n, i) => (i.familyIdx || 0) * 1.8 + (i.coverage || 0) * 1.2 + (i.families || 0) * .006 - (i.dist || 0) * 5 - ((n.familyIdx || 0) * 1.8 + (n.coverage || 0) * 1.2 + (n.families || 0) * .006 - (n.dist || 0) * 5),
      mainKpis: n => [{
        l: "Famiglie stimate",
        v: n.families.toLocaleString("it-IT"),
        u: "nuclei",
        src: "ISTAT",
        c: C.orange,
        icon: ""
      }, {
        l: "Popolazione stimata",
        v: n.pop.toLocaleString("it-IT"),
        u: "abitanti",
        src: "ISTAT",
        c: C.orange,
        icon: ""
      }, {
        l: "Superficie coperta",
        v: n.area + " km",
        u: "",
        src: "Dati geografici",
        c: C.blue,
        icon: ""
      }, {
        l: "Copertura stimata",
        v: n.coverage + "%",
        u: "",
        src: "ISTAT+GIS",
        c: C.green,
        icon: ""
      }, {
        l: "Range operativo",
        v: n.flyersMin.toLocaleString("it-IT") + " - " + n.flyersMax.toLocaleString("it-IT"),
        u: "pz.",
        src: "Calc.",
        c: C.green,
        icon: ""
      }, {
        l: "Giorni operativi",
        v: n.operDays + " giorni",
        u: "",
        src: "Operativo",
        c: C.yellow,
        icon: ""
      }, {
        l: "Comuni nel raggio",
        v: "-",
        u: "",
        src: "Dati geografici",
        c: C.blue,
        icon: ""
      }],
      advKpis: n => [{
        l: "Family Index",
        v: n.familyIdx,
        c: C.orange
      }, {
        l: "Reach Score",
        v: n.reachD2D,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiD2D,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confD2D,
        c: C.purple
      }],
      aiCats: [{
        group: "Residential profile",
        l: "Famiglie",
        v: n => n.families.toLocaleString("it-IT") + " nuclei"
      }, {
        group: "Residential profile",
        l: "Popolazione",
        v: n => n.pop.toLocaleString("it-IT") + " ab."
      }, {
        group: "Residential profile",
        l: "Densita residenziale",
        v: n => n.densita.toLocaleString("it-IT") + " ab/km"
      }, {
        group: "Residential profile",
        l: "Tipologia area",
        v: n => n.areaType
      }, {
        group: "Demographic profile",
        l: "Eta 0-14",
        v: n => n.eta14 + "%"
      }, {
        group: "Demographic profile",
        l: "Eta 15-34",
        v: n => n.eta34 + "%"
      }, {
        group: "Demographic profile",
        l: "Eta 35-64",
        v: n => n.eta64 + "%"
      }, {
        group: "Demographic profile",
        l: "Et 65+",
        v: n => n.eta65 + "%"
      }, {
        group: "Demographic profile",
        l: "Genere",
        v: n => "M " + n.genderM + "%  F " + n.genderF + "%"
      }, {
        group: "Demographic profile",
        l: "Indice vecchiaia",
        v: n => n.indVec + "/100"
      }, {
        group: "Demographic profile",
        l: "% Stranieri",
        v: n => n.stranieri + "%"
      }, {
        group: "Economic context",
        l: "Reddito medio",
        v: n => "EUR " + n.reddito.toLocaleString("it-IT"),
        c: "green"
      }, {
        group: "Economic context",
        l: "Tasso occupazione",
        v: n => n.occup + "%",
        c: "green"
      }, {
        group: "Economic context",
        l: "Imprese come contesto",
        v: n => n.imprese.toLocaleString("it-IT")
      }, {
        group: "Operational reading",
        l: "Residential strength",
        v: n => n.familyIdx + "/100"
      }, {
        group: "Operational reading",
        l: "Copertura consigliata",
        v: n => n.coverage >= 88 ? "Copertura piena" : n.coverage >= 75 ? "Copertura selettiva estesa" : "Copertura selettiva"
      }, {
        group: "Operational reading",
        l: "Suitability campagna",
        v: n => n.reachD2D >= 86 ? "Alta" : n.reachD2D >= 76 ? "Buona" : "Mirata"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confD2D + "/100"
      }]
    },
    h2h: {
      label: "Hand to Hand",
      icon: "",
      color: C.blue,
      mode: "movement",
      src: ["Google Places", "Google Places", "OpenStreetMap", "Overpass", "Trasporto pubblico / GTFS", "Mapbox", "Analisi interna", "Dati geografici"],
      allocationSort: (n, i) => (i.flowScore || 0) * 2.4 + (i.strongPts || 0) * 13 + (i.transitStops || 0) * 1.9 + (i.poi || 0) * .18 + (i.commDens || 0) * 1.2 - (i.dist || 0) * 4 - ((n.flowScore || 0) * 2.4 + (n.strongPts || 0) * 13 + (n.transitStops || 0) * 1.9 + (n.poi || 0) * .18 + (n.commDens || 0) * 1.2 - (n.dist || 0) * 4),
      mainKpis: n => {
        const i = n.flowScore,
          r = i < 40 ? "Basso" : i < 60 ? "Medio" : i < 80 ? "Alto" : "Molto Alto",
          l = i < 40 ? C.red : i < 60 ? C.yellow : i < 80 ? C.green : C.purple;
        return [{
          l: "POI rilevanti",
          v: n.poi.toLocaleString("it-IT"),
          u: "POI",
          src: "Google Places",
          c: C.blue,
          icon: ""
        }, {
          l: "Competitor rilevati",
          v: Math.round(n.nearbyBiz * .28),
          u: "comp.",
          src: "Google Places",
          c: C.red,
          icon: ""
        }, {
          l: "Densit passaggio",
          v: n.commDens + "/100",
          u: "",
          src: "Analisi interna",
          c: C.orange,
          icon: " "
        }, {
          l: "Flusso potenziale",
          v: r + "  " + i + "/100",
          u: "",
          src: "Analisi interna",
          c: l,
          icon: ""
        }, {
          l: "Fermate / stazioni",
          v: n.transitStops + " fermate  " + n.trainStations + " staz.",
          u: "",
          src: "Trasporto pubblico / GTFS",
          c: C.purple,
          icon: ""
        }, {
          l: "Hotspot operativi",
          v: n.strongPts + " punti",
          u: "",
          src: "Analisi interna",
          c: C.green,
          icon: ""
        }, {
          l: "Giorni operativi",
          v: n.operDaysH2H + " giorni",
          u: "",
          src: "Operativo",
          c: C.yellow,
          icon: ""
        }];
      },
      advKpis: n => [{
        l: "Reach Score",
        v: n.reachH2H,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiH2H,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confH2H,
        c: C.purple
      }, {
        l: "Reddito medio",
        v: n.reddito,
        c: C.green
      }],
      aiCats: [{
        group: "Movement profile",
        l: "Intensita passaggio",
        v: n => n.flowScore + "/100"
      }, {
        group: "Movement profile",
        l: "Anchor trasporto",
        v: n => n.transitStops + " fermate  " + n.trainStations + " staz."
      }, {
        group: "Movement profile",
        l: "Scuole / eventi",
        v: n => n.strongPts + " punti"
      }, {
        group: "Movement profile",
        l: "Rilevanza pedonale",
        v: n => n.commDens >= 75 ? "Alta" : n.commDens >= 58 ? "Media" : "Locale"
      }, {
        group: "Local attractiveness",
        l: "POI rilevanti",
        v: n => n.poi.toLocaleString("it-IT")
      }, {
        group: "Local attractiveness",
        l: "Attivit vicine",
        v: n => n.nearbyBiz.toLocaleString("it-IT")
      }, {
        group: "Local attractiveness",
        l: "Contesto mixed-use",
        v: n => n.areaType
      }, {
        group: "Operational timing",
        l: "Fasce consigliate",
        v: n => n.timeSlots
      }, {
        group: "Operational timing",
        l: "opportunita mattina",
        v: n => n.timeSlots.includes("08") || n.timeSlots.includes("07") ? "Forte" : "Media"
      }, {
        group: "Operational timing",
        l: "opportunita pranzo",
        v: n => n.timeSlots.includes("12") ? "Forte" : "Da validare"
      }, {
        group: "Operational reading",
        l: "Hotspot principale",
        v: n => n.hotspots
      }, {
        group: "Operational reading",
        l: "Punti operativi",
        v: n => n.strongPts + " suggeriti"
      }, {
        group: "Operational reading",
        l: "Exposure quality",
        v: n => n.flowScore >= 80 ? "Alta" : n.flowScore >= 65 ? "Buona" : "Mirata"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confH2H + "/100"
      }]
    },
    b2b: {
      label: "Business Distribution",
      icon: "",
      color: C.purple,
      mode: "business",
      src: ["Google Places", "Google Places", "OpenStreetMap", "Mapbox", "Analisi interna", "Dati geografici", "Dati territoriali"],
      allocationSort: (n, i) => (i.targetBiz || 0) * 1.9 + (i.commDensB2B || 0) * 2.2 + (i.clusters || 0) * 10 - (i.competitors || 0) * .35 - (i.dist || 0) * 3 - ((n.targetBiz || 0) * 1.9 + (n.commDensB2B || 0) * 2.2 + (n.clusters || 0) * 10 - (n.competitors || 0) * .35 - (n.dist || 0) * 3),
      mainKpis: n => [{
        l: "Attivit rilevate",
        v: n.bizTotal.toLocaleString("it-IT"),
        u: "att.",
        src: "Google Places",
        c: C.purple,
        icon: ""
      }, {
        l: "Competitor rilevati",
        v: n.competitors,
        u: "comp.",
        src: "Google Places",
        c: C.red,
        icon: ""
      }, {
        l: "Densit commerciale",
        v: n.commDensB2B + "/100",
        u: "",
        src: "Analisi interna",
        c: C.orange,
        icon: " "
      }, {
        l: "Reddito medio stimato",
        v: "EUR " + n.reddito.toLocaleString("it-IT"),
        u: "anno",
        src: "Dati territoriali",
        c: C.green,
        icon: ""
      }, {
        l: "Commercial Density Index",
        v: n.cdIdx + "/100",
        u: "",
        src: "Analisi interna",
        c: C.purple,
        icon: "-"
      }, {
        l: "Giorni operativi",
        v: n.operDaysB2B + " giorni",
        u: "",
        src: "Operativo",
        c: C.yellow,
        icon: ""
      }],
      advKpis: n => [{
        l: "Comm. Density",
        v: n.cdIdx,
        c: C.purple
      }, {
        l: "Reach Score",
        v: n.reachB2B,
        c: C.blue
      }, {
        l: "ROI Score",
        v: n.roiB2B,
        c: C.green
      }, {
        l: "Confidence",
        v: n.confB2B,
        c: C.orange
      }],
      aiCats: [{
        group: "Commercial profile",
        l: "Attivit rilevate",
        v: n => n.bizTotal.toLocaleString("it-IT") + " attivita"
      }, {
        group: "Commercial profile",
        l: "Categorie dominanti",
        v: n => n.topCats
      }, {
        group: "Commercial profile",
        l: "Densit commerciale",
        v: n => n.commDensB2B + "/100"
      }, {
        group: "Commercial profile",
        l: "Attivit target",
        v: n => n.targetBiz.toLocaleString("it-IT") + " att."
      }, {
        group: "Economic context",
        l: "Reddito medio stimato",
        v: n => "EUR " + n.reddito.toLocaleString("it-IT"),
        c: "green"
      }, {
        group: "Economic context",
        l: "Tasso occupazione",
        v: n => n.occup + "%"
      }, {
        group: "Economic context",
        l: "Base imprese locale",
        v: n => n.imprese.toLocaleString("it-IT")
      }, {
        group: "Competitive context",
        l: "Competitor rilevati",
        v: n => n.competitors.toLocaleString("it-IT")
      }, {
        group: "Competitive context",
        l: "Livello competizione",
        v: n => n.competitors > 30 ? "Alto" : n.competitors > 12 ? "Medio" : "Contenuto"
      }, {
        group: "Operational reading",
        l: "Cluster commerciali",
        v: n => n.clusters + " cluster"
      }, {
        group: "Operational reading",
        l: "Zona business forte",
        v: n => n.strongZone
      }, {
        group: "Operational reading",
        l: "Attrattivita commerciale",
        v: n => n.commDensB2B >= 78 ? "Alta" : n.commDensB2B >= 62 ? "Media" : "Da validare"
      }, {
        group: "Operational reading",
        l: "Confidence level",
        v: n => n.confB2B + "/100"
      }]
    }
  };
