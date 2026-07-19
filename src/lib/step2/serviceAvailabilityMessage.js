const SERVICE_COPY = {
  poi: "Non siamo riusciti ad aggiornare i punti di interesse. I dati territoriali principali restano disponibili.",
  transport: "Non siamo riusciti ad aggiornare le fermate di trasporto. Puoi riprovare senza perdere la selezione.",
};

function availabilityDetail(error) {
  const value = String(error || "").toUpperCase();
  if (value.includes("TIMEOUT") || value.includes("504")) return "Il servizio ha superato il tempo massimo di risposta.";
  if (value.includes("429") || value.includes("RATE_LIMIT")) return "Il servizio sta limitando temporaneamente le richieste.";
  return "Il servizio è temporaneamente non disponibile.";
}

export function getStep2ServiceAvailabilityMessage(service, error) {
  if (!error || !SERVICE_COPY[service]) return null;
  return `${SERVICE_COPY[service]} ${availabilityDetail(error)}`;
}
