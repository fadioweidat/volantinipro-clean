import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";

// Ingresso guidato di Step 2 per i comuni FUORI Milano: due sole modalità.
// Presentation only, gemello di MilanoCoverageModeChooser (stesse classi CSS):
// le card attivano esclusivamente gli handler canonici di Step2
// (switchToComuneMode / switchToRadiusMode). Nessuno state, nessun calcolo,
// nessun modello territoriale qui. "Tutto il comune" non è una terza card:
// è già il comportamento della modalità Comuni.
// Quando mostrare l'ingresso guidato: stesso perimetro della UX Milano
// (servizio residenziale, vista cliente, non tab CAP), ma per territori NON
// Milano e solo con un comune già riconosciuto. Funzione pura.
export function isOutsideMilanoGuidedView({ isResidentialStep2, hasMilanoTerritory, isAdminView, isCapMode, hasCity }) {
  return Boolean(isResidentialStep2 && !hasMilanoTerritory && !isAdminView && !isCapMode && hasCity);
}

// Modalità DERIVATA da stati canonici di Step2 (nessuno state dedicato):
//  - "radius": tab/modalità Raggio attiva;
//  - "comuni": comune completo confermato, oppure più comuni selezionati,
//    oppure decisione quantità già presa (rientro da uno step successivo);
//  - null: nessuna scelta ancora -> si mostrano solo le due card.
export function deriveOutsideMilanoMode({ isRadiusMode, addressFullCoverageConfirmed, selectedComuniCount = 0, coverageDecision = null }) {
  if (isRadiusMode) return "radius";
  if (addressFullCoverageConfirmed || Number(selectedComuniCount) > 1 || coverageDecision != null) return "comuni";
  return null;
}

export function OutsideMilanoCoverageModeChooser({ mode, comuneLabel, onChooseComuni, onChooseRadius }) {
  return <section className="vp-milano-mode" aria-labelledby="outside-milano-mode-title" data-testid="outside-milano-mode-chooser">
    <div className="vp-milano-eyebrow">02 · Modalità di distribuzione</div>
    <h2 id="outside-milano-mode-title">{comuneLabel ? `Come vuoi distribuire a ${comuneLabel}?` : "Come vuoi distribuire?"}</h2>
    <p>Scegli uno o più comuni oppure un raggio intorno al tuo punto di partenza.</p>
    <div className="vp-milano-mode-options">
      <button type="button" className="vp-milano-mode-card is-nil" aria-pressed={mode === "comuni"} onClick={onChooseComuni} data-testid="outside-milano-mode-comuni">
        <Step1Icon name="building" size={28} /><strong>Scegli uno o più comuni</strong>
        <span>Seleziona uno o più comuni da coprire completamente o in sequenza.</span>
        <small>Esempio: Seveso, Meda, Seregno</small><b>{mode === "comuni" ? "✓ Comuni selezionato" : "Scegli comuni →"}</b>
      </button>
      <button type="button" className="vp-milano-mode-card is-radius" aria-pressed={mode === "radius"} onClick={onChooseRadius} data-testid="outside-milano-mode-radius">
        <Step1Icon name="target" size={28} /><strong>Distribuisci intorno a un punto</strong>
        <span>Partiamo dall'indirizzo scelto e copriamo l'area entro una distanza selezionata.</span>
        <small>500 m · 1 km · 2 km · 3 km</small><b>{mode === "radius" ? "✓ Raggio selezionato" : "Usa un raggio →"}</b>
      </button>
    </div>
  </section>;
}
