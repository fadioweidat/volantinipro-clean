import React, { useState } from 'react';
import { FIELDS, SOURCE_LABELS, normalizeField, scenariosFromHistory, validationErrors } from './feasibilitySchemas.js';
const groups = [['Attività', ['businessType', 'city', 'businessDescription']], ['Campagna', ['campaignCost', 'flyerQuantity', 'campaignArea', 'serviceType']], ['Economia cliente e obiettivo', ['averageCustomerRevenue', 'averageCustomerMargin', 'targetNewCustomers']], ['Assunzioni di scenario', ['scenarioConversionConservative', 'scenarioConversionRealistic', 'scenarioConversionGrowth']], ['Dati facoltativi', ['customerLifetimeValue', 'currentMonthlyCustomers', 'marketingBudget', 'targetRevenue', 'knownConversionRate', 'knownCAC', 'repeatPurchaseRate']]];
const display = (key, item) => item?.value == null ? '' : String(FIELDS[key].rate ? Number((item.value * 100).toFixed(10)) : item.value);
export default function FeasibilitySummary({ inputs, unusualMargin, onChange, onUnusualMargin, onGenerate, onBack }) {
  const [raw, setRaw] = useState(() => Object.fromEntries(Object.keys(FIELDS).map(key => [key, display(key, inputs[key])])));
  const [attempted, setAttempted] = useState(false);
  const errors = validationErrors(inputs, unusualMargin);
  function edit(key, value) {
    let next = { ...inputs, [key]: normalizeField(key, value) };
    if (key === 'knownConversionRate' && next[key].value != null && !validationErrors(next, true)[key]) {
      next = scenariosFromHistory(next);
      setRaw(previous => ({ ...previous, [key]: value, ...Object.fromEntries(Object.keys(FIELDS).filter(name => name.startsWith('scenarioConversion')).map(name => [name, display(name, next[name])])) }));
    } else setRaw(previous => ({ ...previous, [key]: value }));
    onChange(next);
    if (key === 'averageCustomerRevenue' || key === 'averageCustomerMargin') onUnusualMargin(false);
  }
  function useHistory() { const next = scenariosFromHistory(inputs); onChange(next); setRaw(Object.fromEntries(Object.keys(FIELDS).map(key => [key, display(key, next[key])]))); }
  return <form className="vf-panel" onSubmit={event => { event.preventDefault(); setAttempted(true); if (!Object.keys(errors).length) onGenerate(); }} noValidate>
    <span className="vf-eyebrow">Verifica prima di calcolare</span><h2>Riepilogo dei dati</h2><p>I valori collegati al preventivo sono in sola lettura. Le altre informazioni e le ipotesi si possono modificare qui.</p>
    {groups.map(([title, keys], index) => {
      const content = <div className="vf-form-grid">{keys.map(key => <div key={key} className="vf-field"><label htmlFor={`vf-${key}`}>{FIELDS[key].label}{FIELDS[key].required ? ' *' : ''}</label><input id={`vf-${key}`} value={raw[key]} onChange={event => edit(key, event.target.value)} readOnly={inputs[key]?.source === 'campaign_existing'} inputMode={FIELDS[key].text ? 'text' : 'decimal'} maxLength={FIELDS[key].text ? 600 : 40} aria-invalid={attempted && !!errors[key]} aria-describedby={`vf-help-${key}`} /><small id={`vf-help-${key}`}>{attempted && errors[key] ? errors[key] : SOURCE_LABELS[inputs[key]?.source]}</small></div>)}</div>;
      return index === 4 ? <details key={title}><summary>{title}</summary>{content}<button type="button" onClick={useHistory} disabled={inputs.knownConversionRate.value == null || !!errors.knownConversionRate}>Applica scenari dallo storico</button><p className="vf-small">Regola: prudente = storico × 0,6; realistico = storico; crescita = storico × 2, massimo 100%.</p><p className="vf-small">LTV indica ricavi nel tempo, non margine: il tetto CAC basato su LTV è solo teorico. Gli altri dati facoltativi sono contesto e non modificano le formule.</p></details> : <fieldset key={title}><legend>{title}</legend>{index === 3 && <p className="vf-small">Ipotesi iniziali configurabili: 0,03% / 0,05% / 0,10%. Non sono benchmark verificati né previsioni garantite.</p>}{content}</fieldset>;
    })}
    {inputs.averageCustomerMargin.value > inputs.averageCustomerRevenue.value && <label className="vf-check"><input type="checkbox" checked={unusualMargin} onChange={event => onUnusualMargin(event.target.checked)} />Confermo il caso insolito: il margine supera il ricavo e voglio simulare questi dati.</label>}
    {attempted && Object.keys(errors).length > 0 && <p role="alert">Correggi i campi indicati prima di generare l’analisi.</p>}
    <div className="vf-actions"><button type="button" onClick={onBack}>Torna alla conversazione</button><button className="vf-primary">Genera analisi</button></div>
  </form>;
}
