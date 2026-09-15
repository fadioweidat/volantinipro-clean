import React, { useMemo, useState } from 'react';
import { FINANCIAL_FIELDS, financialValidationErrors } from './feasibilityBusinessFinancialSchemas.js';
import { businessUnitProfile } from './feasibilityBusinessFinancialSchemas.js';

// §11 (ticket "UPGRADE FATTIBILITÀ..."): fino a 2-4 chiarimenti leggeri,
// calcolati deterministicamente dai valori già inseriti — MAI una chat
// infinita. Ogni prompt propone un'azione ("Usa stima prudente") che scrive
// un valore ESPLICITAMENTE etichettabile come stima nel report (il motore
// economico marca comunque `estimated: true` per i campi lasciati vuoti,
// quindi anche ignorando questi suggerimenti il dato non finge di essere
// "fornito da te").
function buildClarifications(inputs) {
  const prompts = [];
  const investment = Number(inputs.initialInvestment);
  const staff = Number(inputs.staffCount);
  if (investment > 0 && staff > 0 && !String(inputs.monthlyStaffCost || '').trim()) {
    prompts.push({
      id: 'staffCost',
      text: `Hai indicato ${staff} addetti ma nessun costo personale mensile: vuoi stimarlo prudenzialmente (€1.800/mese per addetto = €${(staff * 1800).toLocaleString('it-IT')}/mese)?`,
      apply: patch => patch({ monthlyStaffCost: String(staff * 1800) }),
    });
  }
  const launch = Number(inputs.launchCustomers);
  const target12 = Number(inputs.targetCustomers12mo);
  if (Number.isFinite(launch) && Number.isFinite(target12) && launch > 0 && target12 > launch * 3) {
    prompts.push({
      id: 'growth',
      text: `Hai indicato ${launch} clienti al lancio e ${target12} dopo 12 mesi (crescita oltre 3×): vuoi mantenere questa ipotesi o usare una stima più prudente (2×)?`,
      apply: patch => patch({ targetCustomers12mo: String(Math.round(launch * 2)) }),
      applyLabel: 'Usa stima prudente (2×)',
      keepLabel: 'Mantieni la mia stima',
    });
  }
  if (!String(inputs.grossMarginPct || '').trim() && !String(inputs.variableCostPct || '').trim()) {
    prompts.push({
      id: 'margin',
      text: 'Non hai indicato margine lordo né costi variabili: vuoi usare una stima prudente del 60% di margine lordo?',
      apply: patch => patch({ grossMarginPct: '60' }),
    });
  }
  if (!String(inputs.averageCustomerRevenue || '').trim() && String(inputs.averagePrice || '').trim()) {
    prompts.push({
      id: 'revenue',
      text: `Non hai indicato un ricavo medio mensile per cliente separato: verrà usato il prezzo medio (€${inputs.averagePrice}) come ricavo mensile per cliente. Va bene?`,
      apply: patch => patch({ averageCustomerRevenue: inputs.averagePrice }),
    });
  }
  return prompts.slice(0, 4);
}

export function FeasibilityBusinessFinancialInputs({ inputs, businessType, onChange, onNext, onBack }) {
  const [attempted, setAttempted] = useState(false);
  const [dismissed, setDismissed] = useState({});
  const errors = financialValidationErrors(inputs);
  const profile = useMemo(() => businessUnitProfile(businessType), [businessType]);
  const clarifications = useMemo(() => buildClarifications(inputs).filter(c => !dismissed[c.id]), [inputs, dismissed]);

  function submit(event) {
    event.preventDefault();
    setAttempted(true);
    if (Object.keys(errors).length === 0) onNext();
  }

  function field(key, label, opts = {}) {
    return (
      <div className="vf-field">
        <label htmlFor={`vfbf-${key}`}>{label}{FINANCIAL_FIELDS[key]?.required ? ' *' : ''}</label>
        <input
          id={`vfbf-${key}`}
          inputMode="decimal"
          placeholder={opts.placeholder || '0'}
          value={inputs[key]}
          onChange={event => onChange({ [key]: event.target.value })}
          aria-invalid={attempted && !!errors[key]}
        />
        {attempted && errors[key] && <small role="alert">{errors[key]}</small>}
        {!FINANCIAL_FIELDS[key]?.required && !opts.noEstimateHint && (
          <small>Lascia vuoto per una stima prudente del modello.</small>
        )}
      </div>
    );
  }

  return (
    <form className="vf-panel" onSubmit={submit} noValidate>
      <span className="vf-eyebrow">Passo 3 di 5</span>
      <h2>Dati economici</h2>
      <p>Questi dati permettono di calcolare pareggio, ROI e proiezioni economiche — oltre all'analisi territoriale già svolta. I campi lasciati vuoti vengono stimati prudenzialmente e segnalati come "Stima del modello", mai come dato fornito da te.</p>

      <div className="vf-form-grid">
        {field('initialInvestment', 'Investimento iniziale (€)')}
        {field('monthlyRent', 'Affitto mensile (€)')}
        {field('staffCount', 'Personale / numero addetti', { noEstimateHint: true })}
        {field('monthlyStaffCost', 'Costo mensile personale (€)')}
        {field('otherFixedCostsMonthly', 'Altri costi fissi mensili (€)')}
        {field('variableCostPct', 'Costi variabili medi (% del ricavo)')}
        {field(
          'averagePrice',
          profile.priceLabel,
        )}
        {field('averageCustomerRevenue', 'Ricavo medio mensile per cliente (€)')}
        {field('grossMarginPct', 'Margine lordo medio per cliente (%)')}
        {field('launchCustomers', profile.launchLabel)}
        {field('targetCustomers12mo', profile.target12moLabel)}
        {field('monthlyGrowthPct', 'Crescita mensile prevista (%)')}
        {field('otherMonthlyRevenue', 'Altri ricavi mensili (€)', { placeholder: 'es. personal training, corsi' })}
        {field('availableCapital', 'Capitale disponibile (€)')}
      </div>

      {clarifications.length > 0 && (
        <div className="vf-notice vf-clarifications">
          <strong>Un attimo — un paio di conferme prima di calcolare:</strong>
          {clarifications.map(c => (
            <div key={c.id} className="vf-clarification-row">
              <p>{c.text}</p>
              <div className="vf-actions">
                <button type="button" onClick={() => { c.apply(patch => onChange(patch)); setDismissed(d => ({ ...d, [c.id]: true })); }}>
                  {c.applyLabel || 'Usa stima prudente'}
                </button>
                <button type="button" onClick={() => setDismissed(d => ({ ...d, [c.id]: true }))}>
                  {c.keepLabel || 'Va bene così'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {attempted && Object.keys(errors).length > 0 && <p role="alert">Correggi i campi indicati prima di continuare.</p>}
      <div className="vf-actions">
        <button type="button" onClick={onBack}>Torna indietro</button>
        <button className="vf-primary" type="submit">Continua</button>
      </div>
    </form>
  );
}
