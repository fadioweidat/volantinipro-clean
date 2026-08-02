/**
 * Helper territoriale centralizzato per l'identificazione del territorio di Milano.
 * Source of truth prioritario: municipality_code = "015146" o parentComune = "Milano" o nome comune "Milano".
 * Fallback CAP: range 20121-20162 per le ricerche per solo codice postale (quando il CAP non è ancora arricchito dai dati ISTAT/Comune).
 */

export function isMilanoPostalCode(cap) {
  if (!cap) return false;
  const num = Number(cap);
  return Number.isInteger(num) && num >= 20121 && num <= 20162;
}

export function checkMilanoTerritory({ city, selectedComuni, selectedSearchPoint, searchMode }) {
  const checkStringMilano = (s) => {
    if (!s) return false;
    const str = String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    if (str === "milano" || str === "comune di milano") return true;
    if (str.startsWith("milano,") || str.startsWith("milano ")) return true;
    return false;
  };

  // 1. Source of truth principale: codice ISTAT comune 015146 o parentComune Milano
  if (String(city?.istat_code || city?.municipality_code || "") === "015146") return true;
  if (checkStringMilano(city?.parentComune) || checkStringMilano(city?.comune) || checkStringMilano(city?.city) || checkStringMilano(city?.name) || checkStringMilano(city?.label)) return true;

  // 2. Controllo su comuni selezionati nello sweep
  if (Array.isArray(selectedComuni) && selectedComuni.some(c => 
    String(c?.istat_code || c?.municipality_code || "") === "015146" ||
    checkStringMilano(c?.comune_name) || checkStringMilano(c?.name) || checkStringMilano(c?.label)
  )) {
    return true;
  }

  // 3. Controllo sul punto geografico o indirizzo selezionato
  if (selectedSearchPoint && (
    String(selectedSearchPoint?.municipality_code || "") === "015146" ||
    checkStringMilano(selectedSearchPoint?.parentComune) ||
    checkStringMilano(selectedSearchPoint?.comune) ||
    checkStringMilano(selectedSearchPoint?.city) ||
    checkStringMilano(selectedSearchPoint?.display_name) ||
    checkStringMilano(selectedSearchPoint?.label)
  )) {
    return true;
  }

  // 4. Fallback per ricerca esclusivamente per CAP (se il dato comunale non è ancora joinato)
  if (searchMode === "cap" && (isMilanoPostalCode(city?.cap) || isMilanoPostalCode(city?.label) || isMilanoPostalCode(city?.name))) {
    return true;
  }

  return false;
}
