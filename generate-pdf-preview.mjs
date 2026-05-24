import { writeFileSync } from "fs";
import { generateQuotePdfBytes } from "./src/lib/pdf/generateQuotePdf.js";

// Keep this script using the old generator for file-based preview.
// The app now uses printQuotePdf (HTML window) instead.

const data = {
  quoteId: "VP-20260517-001",
  generatedAt: new Date().toISOString(),
  status: "Preventivo stimato",
  service: "Distribuzione Porta a Porta",
  campaign: {
    variant: "Copertura residenziale",
    quantity: 5000,
    format: "A5",
    grammage: "135 g/m²",
    materialStatus: "Da produrre",
    graphicStatus: "File disponibile",
    plan: "Piano singolo",
    campaignsPerMonth: null,
    duration: null,
    areaMode: "comune",
  },
  area: {
    mainArea: "Milano - Porta Romana",
    areaMode: "comune",
    selectedCaps: ["20135", "20136"],
    radiusKm: 2.5,
    coveredAreaKm2: 4.8,
    selectedMunicipalities: ["Milano"],
    selectionMode: "Auto",
  },
  outputs: {
    estimatedFamilies: 8200,
    estimatedPopulation: 19500,
    estimatedCoverage: 87,
    recommendedFlyers: 4800,
    fullCoverageFlyers: 4800,
    insertedFlyers: 5000,
    remainingFlyers: 200,
    missingFlyers: 0,
    coverageStatus: "sufficient",
  },
  municipalities: [
    { name: "Milano", status: "Selezionato · copertura completa", estimatedFlyers: 4800, coveragePct: 96, contributionPct: 100 },
    { name: "Sesto San Giovanni", status: "Nel raggio, non selezionato", estimatedFlyers: null, coveragePct: null, contributionPct: null },
    { name: "Corsico", status: "Nel raggio, non selezionato", estimatedFlyers: null, coveragePct: null, contributionPct: null },
  ],
  scores: [
    { label: "Family Index", value: 78, description: "Densità famiglie residenziali" },
    { label: "Reach Score", value: 84, description: "Copertura potenziale stimata" },
    { label: "Confidence Score", value: 91, description: "Affidabilità dell'analisi" },
  ],
  adminInfo: [
    { label: "Reddito medio zona", value: "€ 28.400" },
    { label: "Densità abitativa", value: "7.200 ab/km²" },
    { label: "Età media", value: "42 anni" },
    { label: "Famiglie con figli", value: "31%" },
  ],
  aiAnalysis: { enabled: true, serviceType: "d2d", mainArea: "Milano - Porta Romana" },
  planning: {
    selectedDates: ["15 giu", "22 giu"],
    availabilityLabel: "Smart Pairing confermato dal backend",
    smartPairingApplied: true,
    smartPairingDiscountPct: 8,
    compatibleZone: "Navigli · zona vicina",
  },
  pricing: {
    lines: [{ label: "Distribuzione Porta a Porta", quantity: 5000, unitPrice: 0.034, total: 170 }],
    subtotal: 170,
    extras: [{ label: "Analisi AI avanzata", amount: 29, status: "Selezionato" }],
    discounts: [{ label: "Smart Pairing -8%", amount: 13.60, percentage: 8 }],
    total: 185.40,
  },
  sources: ["Dati geografici / PostGIS", "ISTAT 2024", "Agenzia Entrate - OMI", "Google Places"],
};

const bytes = generateQuotePdfBytes(data);
const outPath = `C:\\Users\\fady\\OneDrive\\Desktop\\preventivo-volantinipro-preview.pdf`;
writeFileSync(outPath, bytes);
console.log(`PDF salvato in: ${outPath}`);
