import React, { useState } from 'react';
import { FIELDS, SOURCE_LABELS, normalizeField, scenariosFromHistory, validationErrors } from './feasibilitySchemas.js';
import KpiTooltip from '../../../components/ui/KpiTooltip.jsx';

const groups = [
  ['Attività', ['businessType', 'city', 'businessDescription']],
  ['Campagna', ['campaignCost', 'flyerQuantity', 'campaignArea', 'serviceType']],
  ['Economia cliente e obiettivo', ['averageCustomerRevenue', 'averageCustomerMargin', 'targetNewCustomers']],
  ['Assunzioni di scenario', ['scenarioConversionConservative', 'scenarioConversionRealistic', 'scenarioConversionGrowth']],
  ['Dati facoltativi', ['customerLifetimeValue', 'currentMonthlyCustomers', 'marketingBudget', 'targetRevenue', 'knownConversionRate', 'knownCAC', 'repeatPurchaseRate']]
];

const SECTION_EXPLANATIONS = {
  'Attività': 'Raccontaci in poche parole che attività hai e in quale zona lavori. Queste informazioni ci aiutano ad adattare l’analisi al tuo settore e al territorio.',
  'Campagna': 'Inserisci investimento, quantità e area della distribuzione. I dati già collegati al preventivo restano in sola lettura.',
  'Economia cliente e obiettivo': 'Questi dati servono per capire quanti nuovi clienti sono necessari per recuperare l’investimento della campagna.',
  'Assunzioni di scenario': 'Confrontiamo tre scenari: prudente, realistico e crescita. Le percentuali sono ipotesi di calcolo, non risultati garantiti.',
  'Dati facoltativi': 'Informazioni facoltative utili per dare ulteriore contesto alla tua attività.'
};

const FIELD_HELP = {
  businessType: 'Indica il settore o tipo di attività.',
  city: 'Città o zona operativa dell’attività.',
  businessDescription: 'Descrivi brevemente cosa fai.',
  campaignCost: 'Budget complessivo previsto per la campagna.',
  flyerQuantity: 'Numero totale di volantini da distribuire.',
  campaignArea: 'Aree o quartieri della distribuzione.',
  serviceType: 'Modalità di distribuzione.',
  averageCustomerRevenue: 'Quanto incassi mediamente da un nuovo cliente.',
  averageCustomerMargin: 'Quanto ti resta mediamente dopo i costi.',
  targetNewCustomers: 'Quanti nuovi clienti vorresti ottenere dalla campagna.',
  scenarioConversionConservative: 'Percentuale ipotizzata in uno scenario prudente.',
  scenarioConversionRealistic: 'Percentuale ipotizzata in uno scenario realistico.',
  scenarioConversionGrowth: 'Percentuale ipotizzata in uno scenario di crescita.',
  customerLifetimeValue: 'Ricavo complessivo generato da un cliente nel tempo.',
  currentMonthlyCustomers: 'Numero indicativo di clienti serviti al mese.',
  marketingBudget: 'Budget marketing complessivo.',
  targetRevenue: 'Obiettivo di fatturato complessivo.',
  knownConversionRate: 'Tasso di conversione registrato in campagne passate.',
  knownCAC: 'Costo sostenuto in passato per acquisire un cliente.',
  repeatPurchaseRate: 'Percentuale stimata di clienti che riacquistano.'
};

const FIELD_EMPTY_GUIDANCE = {
  businessType: 'es. Palestra, Ristorante, Studio medico...',
  city: 'Inserisci la città o zona operativa',
  businessDescription: 'Descrivi brevemente cosa fai',
  campaignCost: 'Inserisci il budget previsto',
  flyerQuantity: 'Inserisci il numero di volantini',
  campaignArea: 'es. Milano Centro, Rho, Monza...',
  serviceType: 'es. Door to Door',
  averageCustomerRevenue: 'Se non lo conosci, inserisci una stima',
  averageCustomerMargin: 'Indica quanto ti resta mediamente per cliente',
  targetNewCustomers: 'es. 10'
};

const FIELD_TOOLTIPS = {
  averageCustomerMargin: {
    term: 'Margine',
    tip: 'Quanto ti resta mediamente dopo aver sottratto i costi variabili legati al prodotto o servizio.'
  },
  scenarioConversionConservative: {
    term: 'Conversione',
    tip: 'Percentuale stimata di persone raggiunte dai volantini che diventano nuovi clienti.'
  },
  scenarioConversionRealistic: {
    term: 'Conversione',
    tip: 'Percentuale stimata di persone raggiunte dai volantini che diventano nuovi clienti.'
  },
  scenarioConversionGrowth: {
    term: 'Conversione',
    tip: 'Percentuale stimata di persone raggiunte dai volantini che diventano nuovi clienti.'
  }
};

const display = (key, item) => item?.value == null ? '' : String(FIELDS[key].rate ? Number((item.value * 100).toFixed(10)) : item.value);

function getFieldHelper(key, inputItem, isAttempted, error, rawValue) {
  if (isAttempted && error) {
    return error;
  }
  if (inputItem?.source === 'campaign_existing') {
    return 'Preventivo VolantiniPro (sola lettura)';
  }
  const isEmpty = rawValue === '' || rawValue == null;
  if (isEmpty && FIELD_EMPTY_GUIDANCE[key]) {
    return FIELD_EMPTY_GUIDANCE[key];
  }
  if (FIELD_HELP[key]) {
    return FIELD_HELP[key];
  }
  if (inputItem?.source && SOURCE_LABELS[inputItem.source] && inputItem.source !== 'unavailable') {
    return SOURCE_LABELS[inputItem.source];
  }
  return '';
}

export default function FeasibilitySummary({ inputs, unusualMargin, onChange, onUnusualMargin, onGenerate, onBack }) {
  const [raw, setRaw] = useState(() => Object.fromEntries(Object.keys(FIELDS).map(key => [key, display(key, inputs[key])])));
  const [attempted, setAttempted] = useState(false);
  const errors = validationErrors(inputs, unusualMargin);

  function edit(key, value) {
    let next = { ...inputs, [key]: normalizeField(key, value) };
    if (key === 'knownConversionRate' && next[key].value != null && !validationErrors(next, true)[key]) {
      next = scenariosFromHistory(next);
      setRaw(previous => ({ ...previous, [key]: value, ...Object.fromEntries(Object.keys(FIELDS).filter(name => name.startsWith('scenarioConversion')).map(name => [name, display(name, next[name])])) }));
    } else {
      setRaw(previous => ({ ...previous, [key]: value }));
    }
    onChange(next);
    if (key === 'averageCustomerRevenue' || key === 'averageCustomerMargin') {
      onUnusualMargin(false);
    }
  }

  function useHistory() {
    const next = scenariosFromHistory(inputs);
    onChange(next);
    setRaw(Object.fromEntries(Object.keys(FIELDS).map(key => [key, display(key, next[key])])));
  }

  return (
    <form className="vf-panel" onSubmit={event => { event.preventDefault(); setAttempted(true); if (!Object.keys(errors).length) onGenerate(); }} noValidate>
      <span className="vf-eyebrow">Verifica prima di calcolare</span>
      <h2>Riepilogo dei dati</h2>
      <p>I valori collegati al preventivo sono in sola lettura. Le altre informazioni e le ipotesi si possono modificare qui.</p>

      {groups.map(([title, keys], index) => {
        const isOptionalDetails = index === 4;
        const explanation = SECTION_EXPLANATIONS[title];

        const content = (
          <div className="vf-form-grid">
            {keys.map(key => {
              const tooltip = FIELD_TOOLTIPS[key];
              const isReadOnly = inputs[key]?.source === 'campaign_existing';
              const helperText = getFieldHelper(key, inputs[key], attempted, errors[key], raw[key]);
              const placeholderText = !isReadOnly && FIELD_EMPTY_GUIDANCE[key] ? FIELD_EMPTY_GUIDANCE[key] : '';

              return (
                <div key={key} className="vf-field">
                  <label htmlFor={`vf-${key}`} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px' }}>
                    <span>{FIELDS[key].label}{FIELDS[key].required ? ' *' : ''}</span>
                    {tooltip && (
                      <KpiTooltip term={tooltip.term} tip={tooltip.tip} />
                    )}
                  </label>
                  <input
                    id={`vf-${key}`}
                    value={raw[key]}
                    placeholder={placeholderText}
                    onChange={event => edit(key, event.target.value)}
                    readOnly={isReadOnly}
                    inputMode={FIELDS[key].text ? 'text' : 'decimal'}
                    maxLength={FIELDS[key].text ? 600 : 40}
                    aria-invalid={attempted && !!errors[key]}
                    aria-describedby={`vf-help-${key}`}
                  />
                  <small id={`vf-help-${key}`} style={attempted && errors[key] ? { color: '#b32828', fontWeight: 600 } : undefined}>
                    {helperText}
                  </small>
                </div>
              );
            })}
          </div>
        );

        if (isOptionalDetails) {
          return (
            <details key={title}>
              <summary>{title}</summary>
              {explanation && <p className="vf-small" style={{ margin: '6px 0 14px', color: '#4c6072' }}>{explanation}</p>}
              {content}
              <button type="button" onClick={useHistory} disabled={inputs.knownConversionRate.value == null || !!errors.knownConversionRate} style={{ marginTop: 14 }}>
                Applica scenari dallo storico
              </button>
              <p className="vf-small">Regola: prudente = storico × 0,6; realistico = storico; crescita = storico × 2, massimo 100%.</p>
              <p className="vf-small">LTV indica ricavi nel tempo, non margine: il tetto CAC basato su LTV è solo teorico. Gli altri dati facoltativi sono contesto e non modificano le formule.</p>
            </details>
          );
        }

        return (
          <fieldset key={title}>
            <legend>{title}</legend>
            {explanation && <p className="vf-small" style={{ margin: '4px 0 14px', color: '#4c6072' }}>{explanation}</p>}
            {index === 3 && (
              <p className="vf-small" style={{ margin: '0 0 12px', color: '#4c6072' }}>
                Ipotesi iniziali configurabili: 0,03% / 0,05% / 0,10%. Non sono benchmark verificati né previsioni garantite.
              </p>
            )}
            {content}
          </fieldset>
        );
      })}

      {inputs.averageCustomerMargin.value > inputs.averageCustomerRevenue.value && (
        <label className="vf-check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={unusualMargin} onChange={event => onUnusualMargin(event.target.checked)} />
          Confermo il caso insolito: il margine supera il ricavo e voglio simulare questi dati.
        </label>
      )}

      {attempted && Object.keys(errors).length > 0 && (
        <p role="alert" style={{ color: '#b32828', fontWeight: 700, margin: '14px 0 6px' }}>
          Correggi i campi indicati prima di generare l’analisi.
        </p>
      )}

      <div style={{ marginTop: 22, padding: '12px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <p className="vf-small" style={{ color: '#334155', margin: 0, fontSize: 13, lineHeight: 1.5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <span>Con questi dati confronteremo investimento, margine, punto di pareggio</span>
          <KpiTooltip term="Punto di pareggio" tip="Il numero minimo di nuovi clienti necessari affinché il margine generato copra interamente il costo della campagna." />
          <span>e possibili risultati della campagna.</span>
        </p>
      </div>

      <div className="vf-actions">
        <button type="button" onClick={onBack}>Torna alla conversazione</button>
        <button className="vf-primary" type="submit">Genera analisi</button>
      </div>
    </form>
  );
}
