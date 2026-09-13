// Driver Assignment AI Module — VolantiniPro
// Sola lettura, zero token leakage, no raw coordinates, grounding deterministico.

export const DRIVER_SOURCE_ALLOWLIST = Object.freeze([
  "operator_assignments",
  "campaign_zones",
  "delivery_sessions",
]);

export const FORBIDDEN_DRIVER_KEYS = Object.freeze([
  "token",
  "access_token",
  "accessToken",
  "password",
  "secret",
  "price",
  "total_amount",
  "customer_amount",
  "billing",
  "revenue",
  "margin",
  "admin_notes",
  "all_drivers",
  "raw_gps",
  "tracking_points",
]);

export interface DriverResult {
  answer: string;
  summary: string;
  priorities: string[];
  warnings: string[];
  sources: string[];
  action?: {
    type: "navigate";
    route: string;
    label: string;
    targetZoneId?: string;
  } | null;
}

export function keysAreDriverSafe(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return true;
  if (Array.isArray(obj)) return obj.every(keysAreDriverSafe);

  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_DRIVER_KEYS.some((fk) => lower === fk.toLowerCase() || lower.includes("secret") || lower.includes("password"))) {
      return false;
    }
    if (typeof val === "object" && val !== null) {
      if (!keysAreDriverSafe(val)) return false;
    }
  }
  return true;
}

export function validateDriverSnapshot(snapshot: any): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (snapshot.scope !== "driver_assignment") return false;
  if (typeof snapshot.assignmentId !== "string" || !snapshot.assignmentId.trim()) return false;
  if (!Array.isArray(snapshot.zones)) return false;

  const json = JSON.stringify(snapshot);
  if (json.length > 35000) return false;

  return keysAreDriverSafe(snapshot);
}

function safeResult(
  answer: string,
  summary: string,
  priorities: string[] = [],
  sources: string[] = ["operator_assignments"],
  action: DriverResult["action"] = null
): DriverResult {
  return { answer, summary, priorities, warnings: [], sources, action };
}

export function deterministicDriverResponse(snapshot: Record<string, any>, question: string): DriverResult | null {
  const normalized = question.trim().toLowerCase();

  // 1. Rifiuto categorico mutazioni / scritture
  if (
    /\b(avvia|inizia|attiva|start)\b.*\b(gps|sessione|turno)\b/i.test(normalized) ||
    /\b(ferma|stop|termina|chiudi|pausa)\b.*\b(gps|sessione|turno|lavoro|incarico)\b/i.test(normalized) ||
    /\b(completa|segna completat|chiudi)\b.*\b(zona|lavoro)\b/i.test(normalized) ||
    /\b(carica|invia|upload)\b.*\b(foto|prova|pod)\b/i.test(normalized) ||
    /\b(modifica|cambia)\b.*\b(quantit[àa]|quantita|quantità|zona|orario|orari)\b/i.test(normalized)
  ) {
    return {
      answer: "L'Assistente VolantiniPro è in sola lettura (read-only): non può avviare/fermare il GPS, completare zone o caricare foto. Puoi eseguire queste operazioni usando i pulsanti dedicati nella schermata.",
      summary: "Azione non consentita: assistente in sola lettura.",
      priorities: [],
      warnings: ["READ_ONLY"],
      sources: [],
      action: {
        type: "preview_mutation",
        action: "driver_shift_action",
        entityId: snapshot?.assignmentId || "current",
        summary: "Operazione di turno sul campo",
        consequences: [
          "L'operazione deve essere avviata direttamente dai comandi dedicati",
          "Nessuna modifica viene applicata in automatico dall'assistente",
        ],
      },
    };
  }

  const zones = Array.isArray(snapshot.zones) ? snapshot.zones : [];
  const activeZone = snapshot.activeZone || zones.find((z: any) => z.status === "In corso") || zones.find((z: any) => z.status !== "Completata") || null;
  const remainingZones = zones.filter((z: any) => z.status !== "Completata");
  const completedZones = zones.filter((z: any) => z.status === "Completata");
  const totalQty = Number(snapshot.quantityAssigned || 0);

  // 2. "Qual è la mia zona?" / "zona adesso" / "Quale zona è attiva?" / "prossima zona"
  if (
    /qual\s*(?:[eè]|é)?\s*(?:la\s+)?(?:mia\s+)?zona/i.test(normalized) ||
    /\bzona\s+(?:attiva|adesso|corrente|attuale)\b/i.test(normalized) ||
    /\bprossima\s+zona\b/i.test(normalized) ||
    /dove\s+devo\s+distribuire/i.test(normalized)
  ) {
    if (!activeZone) {
      if (zones.length === 0) {
        return safeResult("Non ci sono zone registrate per questa assegnazione.", "Nessuna zona presente.");
      }
      return safeResult(
        `Tutte le ${zones.length} zone assegnate risultano già completate. Ottimo lavoro!`,
        "Tutte le zone sono completate.",
        [],
        ["campaign_zones"],
        { type: "navigate", route: "driver-assignment", label: "Apri Incarico" }
      );
    }
    const zoneName = activeZone.zone_name || activeZone.name || "Zona assegnata";
    const zoneQty = activeZone.quantity ? ` (quantità: ${activeZone.quantity} volantini)` : "";
    const priorityTxt = activeZone.priority ? ` [Priorità ${activeZone.priority}]` : "";

    return safeResult(
      `La tua zona attiva è "${zoneName}"${zoneQty}${priorityTxt}. Puoi visualizzarla direttamente sulla mappa interattiva.`,
      `Zona attiva: ${zoneName}.`,
      [`Zona attiva: ${zoneName}`],
      ["campaign_zones"],
      { type: "navigate", route: "driver-map", label: "Apri Mappa", targetZoneId: activeZone.id }
    );
  }

  // 3. "Quanti volantini devo distribuire?" / "quanti volantini"
  if (
    /quant[io]\s+volantin/i.test(normalized) ||
    /quantit[àa]\s+(?:totale|assegnata|da\s+distribuire)/i.test(normalized)
  ) {
    if (totalQty > 0) {
      const breakdown = zones
        .filter((z: any) => z.quantity)
        .map((z: any) => `- ${z.zone_name}: ${z.quantity} pz`)
        .join("\n");
      const answer = breakdown
        ? `Devi distribuire un totale di ${totalQty} volantini, suddivisi tra le zone:\n${breakdown}`
        : `La quantità totale assegnata per questo lavoro è di ${totalQty} volantini.`;
      return safeResult(answer, `Quantità totale assegnata: ${totalQty} volantini.`, [], ["operator_assignments", "campaign_zones"]);
    }
    return safeResult("La quantità assegnata non è specificata per questo incarico.", "Quantità non specificata.");
  }

  // 4. "Il GPS sta funzionando?" / "gps ok?" / "gps attivo"
  if (
    /gps\s*(?:ok|attivo|funziona|sta\s+funzionando)/i.test(normalized) ||
    /il\s+gps\s+[eèé]\s+attivo/i.test(normalized) ||
    /stato\s+gps/i.test(normalized)
  ) {
    const isLive = snapshot.isGpsSessionActive === true || snapshot.gpsStatus === "started";
    const isPaused = snapshot.gpsStatus === "paused";
    if (isLive) {
      const dist = Number.isFinite(Number(snapshot.verifiedDistanceMeters)) && Number(snapshot.verifiedDistanceMeters) > 0
        ? ` Percorsi finora: ${(Number(snapshot.verifiedDistanceMeters) / 1000).toFixed(1)} km.`
        : "";
      return safeResult(
        `Il GPS è attivo e la sessione di tracciamento è regolarmente in corso.${dist}`,
        "GPS attivo e operativo.",
        [],
        ["delivery_sessions"]
      );
    }
    if (isPaused) {
      return safeResult(
        "La sessione GPS è attualmente in pausa. Puoi riprendere la distribuzione usando il pulsante 'Riprendi' nella schermata principale.",
        "GPS in pausa.",
        [],
        ["delivery_sessions"]
      );
    }
    return safeResult(
      "La sessione GPS non è attiva al momento. Ricordati di avviare il turno prima di iniziare la distribuzione.",
      "GPS non attivo.",
      [],
      ["delivery_sessions"]
    );
  }

  // 5. "Sono dentro la zona?"
  if (/dentro\s+(?:la\s+)?zona/i.test(normalized) || /sono\s+in\s+zona/i.test(normalized)) {
    if (snapshot.isInsideZone === true) {
      return safeResult("Sì, risulti all'interno dei confini dell'area assegnata.", "Dentro l'area assegnata.", [], ["delivery_sessions"]);
    }
    if (snapshot.isInsideZone === false) {
      return safeResult("Attenzione: la tua posizione attuale risulta esterna all'area assegnata.", "Fuori dall'area assegnata.", ["POSIZIONE_ESTERNA"], ["delivery_sessions"]);
    }
    return safeResult("Questo dato non è disponibile. Controlla la tua posizione sulla mappa interattiva.", "Posizione geofence non disponibile.", [], ["delivery_sessions"], { type: "navigate", route: "driver-map", label: "Apri Mappa" });
  }

  // 6. "Cosa devo fare per chiudere il lavoro?" / "cosa manca" / "prossimo passaggio"
  if (
    /cosa\s+devo\s+fare\s+per\s+chiudere/i.test(normalized) ||
    /come\s+chiudo\s+il\s+lavoro/i.test(normalized) ||
    /cosa\s+manca/i.test(normalized) ||
    /prossimo\s+passaggio/i.test(normalized)
  ) {
    const remainingCount = remainingZones.length;
    return safeResult(
      `Per completare il turno:\n1. Distribuisci i volantini nelle zone assegnate (${remainingCount} zone ancora da completare).\n2. Carica almeno una foto di prova (POD) tramite il pulsante 'Carica Prova / Foto'.\n3. Premi 'Termina Turno' per salvare i dati operativi.`,
      "Procedura di chiusura turno.",
      [],
      ["operator_assignments"],
      { type: "navigate", route: "driver-pod", label: "Apri POD / Prove" }
    );
  }

  // 7. "Come carico la prova?" / "Devo fare foto?"
  if (
    /caric(?:o|are)\s+la\s+prova/i.test(normalized) ||
    /devo\s+fare\s+foto/i.test(normalized) ||
    /\bpod\b/i.test(normalized) ||
    /come\s+faccio\s+le\s+foto/i.test(normalized)
  ) {
    return safeResult(
      "Sì, è richiesta almeno una foto di prova (POD) per attestare la regolare distribuzione. Puoi scattare o caricare la foto premendo il pulsante 'Carica Prova / Foto' in basso.",
      "Caricamento prova foto POD richiesto.",
      [],
      ["operator_assignments"],
      { type: "navigate", route: "driver-pod", label: "Apri POD / Prove" }
    );
  }

  // 8. "Quante zone mi restano?"
  if (/quant[ee]\s+zone\s+(?:mi\s+)?restano/i.test(normalized) || /zone\s+rimaste/i.test(normalized)) {
    const count = remainingZones.length;
    if (count === 0) {
      return safeResult("Non ci sono zone residue: hai completato tutte le zone assegnate.", "Nessuna zona residua.", [], ["campaign_zones"]);
    }
    const list = remainingZones.map((z: any) => `- ${z.zone_name}`).join("\n");
    return safeResult(
      `Ti restano ${count} zone da completare:\n${list}`,
      `Zone rimanenti: ${count}.`,
      [],
      ["campaign_zones"],
      { type: "navigate", route: "driver-map", label: "Apri Mappa" }
    );
  }

  return null;
}

export function buildDriverSystemPrompt() {
  return [
    "Sei l'Assistente VolantiniPro per gli Operatori di Distribuzione (Driver).",
    "Rispondi SOLO ed ESCLUSIVAMENTE usando i dati reali forniti nello snapshot operativo autorizzato.",
    "Se un dato non è presente o non è disponibile (es. GPS non avviato, distanza non calcolata, geofence non verificato), rispondi chiaramente 'Questo dato non è disponibile'. NON inventare numeri, posizioni, zone o stati.",
    "Sei rigorosamente di sola lettura (read-only): non dichiarare mai di aver avviato o terminato il GPS, completato zone o caricato foto. Indica all'operatore quale pulsante usare.",
    "Non rivelare mai coordinate GPS grezze (lat/lng decimali), credenziali, token o informazioni su altri operatori o prezzi pagati dal cliente.",
    "Puoi suggerire un'azione di navigazione sicura nel campo 'action': {\"type\": \"navigate\", \"route\": \"driver-map\"|\"driver-assignment\"|\"driver-pod\", \"label\": \"Testo Bottone\", \"targetZoneId\": null|string}.",
    `Le sources possono contenere solo: ${DRIVER_SOURCE_ALLOWLIST.join(", ")}. Non inventare URL.`,
    "Restituisci JSON valido nel formato: {\"answer\":string,\"summary\":string,\"priorities\":string[],\"warnings\":string[],\"sources\":string[],\"action\":null|object}.",
  ].join(" ");
}

export function buildDriverUserPrompt(snapshot: Record<string, unknown>, question: string) {
  return `Snapshot operativo reale dell'operatore:\n${JSON.stringify(snapshot, null, 2)}\n\nDomanda del Driver: "${question}"`;
}

export function validateDriverAiResult(value: any): value is DriverResult {
  if (!value || typeof value !== "object") return false;
  if (typeof value.answer !== "string" || !value.answer.trim() || typeof value.summary !== "string" || !value.summary.trim()) return false;
  if (![value.priorities, value.warnings, value.sources].every(Array.isArray)) return false;
  if (value.priorities.length > 8 || value.warnings.length > 8 || value.sources.length > DRIVER_SOURCE_ALLOWLIST.length) return false;
  return value.sources.every((s: string) => DRIVER_SOURCE_ALLOWLIST.includes(s));
}

export function driverNumbersAreGrounded(result: DriverResult, snapshot: Record<string, any>): boolean {
  const text = `${result.answer} ${result.summary}`;
  const extracted = text.match(/\b\d+(?:[.,]\d+)?\b/g);
  if (!extracted) return true;

  const allowed = new Set<number>();
  const addNum = (n: any) => {
    const num = Number(n);
    if (Number.isFinite(num)) allowed.add(num);
  };

  addNum(snapshot.quantityAssigned);
  if (snapshot.verifiedDistanceMeters) {
    addNum(snapshot.verifiedDistanceMeters);
    addNum(Math.round(snapshot.verifiedDistanceMeters / 1000));
    addNum(Number((snapshot.verifiedDistanceMeters / 1000).toFixed(1)));
  }

  const zones = Array.isArray(snapshot.zones) ? snapshot.zones : [];
  addNum(zones.length);
  const remainingCount = zones.filter((z: any) => z.status !== "Completata").length;
  addNum(remainingCount);
  const completedCount = zones.filter((z: any) => z.status === "Completata").length;
  addNum(completedCount);

  for (const z of zones) {
    addNum(z.quantity);
    addNum(z.priority);
  }

  // Costanti consentite (numeri guida 1, 2, 3)
  allowed.add(1);
  allowed.add(2);
  allowed.add(3);

  for (const token of extracted) {
    const num = Number(token.replace(",", "."));
    if (!Number.isFinite(num)) continue;
    if (!allowed.has(num)) {
      return false;
    }
  }
  return true;
}
