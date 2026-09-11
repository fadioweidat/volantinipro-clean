import React, { useState } from 'react';
import { BUSINESS_STATUS_OPTIONS, BUSINESS_GOAL_OPTIONS, businessValidationErrors } from './feasibilityBusinessSchemas.js';

// STEP 1 (§14): intento/attività/località/stato.
export function FeasibilityBusinessStep1({ inputs, onChange, onNext }) {
  const [attempted, setAttempted] = useState(false);
  const errors = businessValidationErrors({ ...inputs, targetCustomer: 'x', averagePrice: '1', businessGoal: BUSINESS_GOAL_OPTIONS[0].value });
  const relevant = ['businessType', 'location', 'businessStatus'].filter(key => errors[key]);
  function submit(event) {
    event.preventDefault();
    setAttempted(true);
    if (relevant.length === 0) onNext();
  }
  return (
    <form className="vf-panel" onSubmit={submit} noValidate>
      <span className="vf-eyebrow">Passo 1 di 4</span>
      <h2>La tua attività</h2>
      <p>Nessuna quantità di volantini né costo campagna richiesti in questa modalità.</p>
      <div className="vf-form-grid">
        <div className="vf-field">
          <label htmlFor="vfb-businessType">Tipo di attività *</label>
          <input
            id="vfb-businessType"
            placeholder="es. palestra, supermercato, ristorante, negozio, studio professionale, centro estetico…"
            value={inputs.businessType}
            onChange={event => onChange({ businessType: event.target.value })}
            aria-invalid={attempted && !!errors.businessType}
            maxLength={120}
          />
          {attempted && errors.businessType && <small role="alert">{errors.businessType}</small>}
        </div>
        <div className="vf-field">
          <label htmlFor="vfb-location">Località *</label>
          <input
            id="vfb-location"
            placeholder="città, indirizzo o zona (es. Cormano)"
            value={inputs.location}
            onChange={event => onChange({ location: event.target.value })}
            aria-invalid={attempted && !!errors.location}
            maxLength={200}
          />
          {attempted && errors.location && <small role="alert">{errors.location}</small>}
        </div>
        <fieldset className="vf-field">
          <legend>Stato attività *</legend>
          {BUSINESS_STATUS_OPTIONS.map(option => (
            <label key={option.value} className="vf-check">
              <input
                type="radio"
                name="businessStatus"
                value={option.value}
                checked={inputs.businessStatus === option.value}
                onChange={() => onChange({ businessStatus: option.value })}
              />
              {option.label}
            </label>
          ))}
          {attempted && errors.businessStatus && <small role="alert">{errors.businessStatus}</small>}
        </fieldset>
      </div>
      <div className="vf-actions">
        <button className="vf-primary" type="submit">Continua</button>
      </div>
    </form>
  );
}

// STEP 2 (§14): input rilevanti (cliente target, prezzo medio, obiettivo +
// campi opzionali). Nessun campo relativo a quantità/costo di una campagna.
export function FeasibilityBusinessStep2({ inputs, onChange, onNext, onBack }) {
  const [attempted, setAttempted] = useState(false);
  const errors = businessValidationErrors(inputs);
  function submit(event) {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length === 0) onNext();
  }
  return (
    <form className="vf-panel" onSubmit={submit} noValidate>
      <span className="vf-eyebrow">Passo 2 di 4</span>
      <h2>Pubblico e obiettivo</h2>
      <div className="vf-form-grid">
        <div className="vf-field">
          <label htmlFor="vfb-targetCustomer">Cliente target *</label>
          <input
            id="vfb-targetCustomer"
            placeholder="es. famiglie, studenti, aziende, sportivi, over 50, giovani…"
            value={inputs.targetCustomer}
            onChange={event => onChange({ targetCustomer: event.target.value })}
            aria-invalid={attempted && !!errors.targetCustomer}
            maxLength={200}
          />
          {attempted && errors.targetCustomer && <small role="alert">{errors.targetCustomer}</small>}
        </div>
        <div className="vf-field">
          <label htmlFor="vfb-averagePrice">Prezzo medio prodotto/servizio (€) *</label>
          <input
            id="vfb-averagePrice"
            inputMode="decimal"
            placeholder="es. 45"
            value={inputs.averagePrice}
            onChange={event => onChange({ averagePrice: event.target.value })}
            aria-invalid={attempted && !!errors.averagePrice}
          />
          {attempted && errors.averagePrice && <small role="alert">{errors.averagePrice}</small>}
        </div>
        <fieldset className="vf-field">
          <legend>Obiettivo principale *</legend>
          <select
            id="vfb-businessGoal"
            value={inputs.businessGoal}
            onChange={event => onChange({ businessGoal: event.target.value })}
            aria-invalid={attempted && !!errors.businessGoal}
          >
            <option value="">Seleziona…</option>
            {BUSINESS_GOAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          {attempted && errors.businessGoal && <small role="alert">{errors.businessGoal}</small>}
        </fieldset>
      </div>
      <details>
        <summary>Dati facoltativi (raggio, concorrenti conosciuti, fascia di prezzo, note)</summary>
        <div className="vf-form-grid">
          <div className="vf-field">
            <label htmlFor="vfb-radiusKm">Raggio di analisi (km)</label>
            <input id="vfb-radiusKm" inputMode="decimal" placeholder="3" value={inputs.radiusKm} onChange={event => onChange({ radiusKm: event.target.value })} aria-invalid={attempted && !!errors.radiusKm} />
            {attempted && errors.radiusKm && <small role="alert">{errors.radiusKm}</small>}
          </div>
          <div className="vf-field">
            <label htmlFor="vfb-knownCompetitors">Concorrenti conosciuti</label>
            <input id="vfb-knownCompetitors" placeholder="es. 2 palestre in centro" value={inputs.knownCompetitors} onChange={event => onChange({ knownCompetitors: event.target.value })} maxLength={300} />
          </div>
          <div className="vf-field">
            <label htmlFor="vfb-priceRange">Fascia di prezzo</label>
            <input id="vfb-priceRange" placeholder="es. economico / medio / premium" value={inputs.priceRange} onChange={event => onChange({ priceRange: event.target.value })} maxLength={80} />
          </div>
          <div className="vf-field">
            <label htmlFor="vfb-notes">Note aggiuntive</label>
            <textarea id="vfb-notes" rows={3} value={inputs.notes} onChange={event => onChange({ notes: event.target.value })} maxLength={600} />
          </div>
        </div>
      </details>
      {attempted && Object.keys(errors).length > 0 && <p role="alert">Correggi i campi indicati prima di continuare.</p>}
      <div className="vf-actions">
        <button type="button" onClick={onBack}>Torna indietro</button>
        <button className="vf-primary" type="submit">Continua</button>
      </div>
    </form>
  );
}
