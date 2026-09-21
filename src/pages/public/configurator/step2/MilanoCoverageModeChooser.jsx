import React from "react";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { InteractiveRadiusSlider } from "../../../../components/InteractiveRadiusSlider.jsx";
import { S2_RADII } from "../../../../lib/step2/s2Constants.js";
import { formatRadiusLabel } from "../../../../lib/utils/format.js";

// Presentation only: all choices and radius updates use Step2's canonical handlers.
export function MilanoCoverageModeChooser({ mode, address, containingNil, onChooseNil, onChooseRadius, onChooseComune, radiusKm, onRadiusChange, radiusDisabled, recommendedRadius, children }) {
  return <section className="vp-milano-mode" aria-labelledby="milano-mode-title" data-testid="milano-mode-chooser">
    <div className="vp-milano-eyebrow">02 · Modalità di distribuzione</div>
    <h2 id="milano-mode-title">Come vuoi distribuire a Milano?</h2>
    <p>Scegli i quartieri oppure un raggio intorno al tuo punto di partenza.</p>
    {address?.label && <div className="vp-milano-context" data-testid="milano-address-context">
      <Step1Icon name="pin" size={19} /><div><strong>{address.label}</strong>
      {containingNil?.name && <span>Questo indirizzo si trova nel quartiere/NIL {containingNil.name}. Questo riferimento non seleziona automaticamente una zona.</span>}</div>
    </div>}
    <div className="vp-milano-mode-options">
      <button type="button" className="vp-milano-mode-card is-nil" aria-pressed={mode === "nil"} onClick={onChooseNil}>
        <Step1Icon name="building" size={28} /><strong>Scegli uno o più quartieri</strong>
        <span>Milano è suddivisa in quartieri/NIL. Scegli questa modalità per distribuire solo in zone precise della città.</span>
        <small>Esempio: Bruzzano, Comasina, Affori</small><b>{mode === "nil" ? "✓ Quartieri selezionato" : "Scegli quartieri →"}</b>
      </button>
      <button type="button" className="vp-milano-mode-card is-radius" aria-pressed={mode === "radius"} onClick={onChooseRadius}>
        <Step1Icon name="target" size={28} /><strong>Distribuisci intorno a un punto</strong>
        <span>Partiamo dall’indirizzo cercato e copriamo l’area entro una distanza scelta.</span>
        <small>500 m · 1 km · 2 km · 3 km</small><b>{mode === "radius" ? "✓ Raggio selezionato" : "Usa un raggio →"}</b>
      </button>
    </div>
    <button className="vp-milano-complete" type="button" aria-pressed={mode === "municipality"} onClick={onChooseComune}>{mode === "municipality" ? "✓ Distribuzione in tutto Milano" : "Distribuisci in tutto Milano"}</button>
    {mode === "nil" && <div className="vp-milano-mode-controls">{children}</div>}
    {mode === "radius" && <div className="vp-milano-mode-controls" data-testid="milano-radius-controls">
      <h3>Distanza dal punto di partenza</h3>
      <p>{address?.label || "Centro del Comune di Milano"} · <strong>{formatRadiusLabel(radiusKm)}</strong></p>
      <div className="vp-milano-radius-presets">{[0.5, 1, 2, 3].map(km => <button key={km} type="button" disabled={radiusDisabled} aria-pressed={Number(radiusKm) === km} onClick={() => onRadiusChange(km)}>{formatRadiusLabel(km)}</button>)}</div>
      <InteractiveRadiusSlider value={radiusKm} options={S2_RADII} disabled={radiusDisabled} onCommit={onRadiusChange} recommendedValue={recommendedRadius} accent="#38BDF8" />
    </div>}
  </section>;
}
