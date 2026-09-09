import React, { useEffect, useMemo, useState } from 'react';
import { C, F } from '../../../../lib/constants.js';
import { loadMilanoMunicipi } from '../../../../lib/geo/territories/municipioMilano.js';
import { resolveMilanoCivicCap } from '../../../../lib/geo/territories/milanoCivicCap.js';
import { loadMilanoCapEstimates, resolveMilanoCapEstimate } from '../../../../lib/geo/territories/milanoCapEstimates.js';
import { buildMilanoAddressContext, resolveMilanoMunicipio } from '../../../../lib/geo/territories/milanoAddressContext.js';

const rowStyle = { display: 'grid', gridTemplateColumns: 'minmax(90px, .7fr) minmax(0, 1.3fr)', gap: 10, alignItems: 'baseline' };
const actionStyle = { padding: '7px 11px', borderRadius: 999, border: '1px solid rgba(255,255,255,.2)', background: 'transparent', color: C.white, cursor: 'pointer', font: `700 11px ${F.sans}` };
const intLabel = val => new Intl.NumberFormat('it-IT').format(Math.round(val));

export default function MilanoAddressContextCard({ addressPoint, coverageAddress, containingNil, onUseNil, onPreviewMunicipio, onUseRadius, onKeepMilanoComplete }) {
  const [derived, setDerived] = useState({ municipio: null, cap: null, capEstimate: null, loading: false });
  const identity = addressPoint ? `${addressPoint.label || ''}|${addressPoint.lat}|${addressPoint.lng}|${addressPoint.street || ''}|${addressPoint.houseNumber || ''}|${addressPoint.postcode || ''}` : '';

  useEffect(() => {
    if (!addressPoint || !Number.isFinite(Number(addressPoint.lat)) || !Number.isFinite(Number(addressPoint.lng))) {
      setDerived({ municipio: null, cap: null, capEstimate: null, loading: false });
      return undefined;
    }
    const controller = new AbortController();
    let current = true;
    setDerived({ municipio: null, cap: null, capEstimate: null, loading: true });

    Promise.allSettled([
      loadMilanoMunicipi({ signal: controller.signal }).then(items => resolveMilanoMunicipio(items, addressPoint.lat, addressPoint.lng)),
      resolveMilanoCivicCap({ street: addressPoint.street, houseNumber: addressPoint.houseNumber, postcode: addressPoint.postcode, signal: controller.signal }),
      loadMilanoCapEstimates({ signal: controller.signal }),
    ]).then(([municipioResult, capResult, capEstimatesResult]) => {
      if (!current) return;
      const capResolved = capResult.status === 'fulfilled' ? capResult.value : null;
      const allCapEstimates = capEstimatesResult.status === 'fulfilled' ? capEstimatesResult.value : null;
      const capEstimate = (capResolved?.cap && allCapEstimates)
        ? resolveMilanoCapEstimate(allCapEstimates, capResolved.cap)
        : null;

      setDerived({
        municipio: municipioResult.status === 'fulfilled' ? municipioResult.value : null,
        cap: capResolved,
        capEstimate,
        loading: false,
      });
    });
    return () => { current = false; controller.abort(); };
  }, [identity]);

  const context = useMemo(() => buildMilanoAddressContext({
    addressPoint,
    coverageAddress,
    nil: containingNil,
    municipio: derived.municipio,
    cap: derived.cap,
  }), [addressPoint, coverageAddress, containingNil, derived]);

  if (!addressPoint) return null;

  const capDisplayValue = derived.cap?.cap
    ? (derived.capEstimate?.available
        ? `${derived.cap.cap} (Stima: ~${intLabel(derived.capEstimate.estimatedFamilies)} fam. · Affidabilità: ${derived.capEstimate.confidenceLabel})`
        : derived.cap.cap)
    : (derived.loading ? 'Rilevamento…' : 'Non disponibile');

  const values = [
    ['Comune', `${context.comune.name} (${context.comune.province})`],
    ['NIL / quartiere', context.nil.name || 'NIL non rilevato'],
    ['Municipio', context.municipio.name || (derived.loading ? 'Rilevamento…' : 'Municipio non rilevato')],
    ['CAP', capDisplayValue],
    ['Coordinate', context.lat === null || context.lng === null ? 'Non disponibili' : `${context.lat.toFixed(6)}, ${context.lng.toFixed(6)}`],
  ];

  return (
    <section data-testid="milano-address-context" aria-label="Contesto territoriale dell'indirizzo" style={{ background: 'rgba(232,87,26,.07)', border: '1px solid rgba(232,87,26,.3)', borderRadius: 12, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: F.sans }}>
      <div><div style={{ color: C.orange, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Indirizzo rilevato</div><div style={{ color: C.white, fontSize: 13, fontWeight: 750, lineHeight: 1.4, marginTop: 4 }}>{context.addressLabel}</div></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {values.map(([label, value]) => <div key={label} style={rowStyle}><span style={{ color: 'rgba(255,255,255,.55)', fontSize: 10.5 }}>{label}</span><strong style={{ color: C.white, fontSize: 11.5, overflowWrap: 'anywhere' }}>{value}</strong></div>)}
      </div>
      {derived.capEstimate?.available ? (
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.58)', lineHeight: 1.35, background: 'rgba(0,0,0,0.15)', padding: '6px 8px', borderRadius: 6 }}>
          <strong style={{ color: '#fb923c' }}>Stima territoriale CAP {derived.cap.cap}:</strong> ~{intLabel(derived.capEstimate.estimatedFamilies)} famiglie stimate · Quantità indicativa: ~{intLabel(derived.capEstimate.recommendedQuantity)} vol. (Affidabilità: {derived.capEstimate.confidenceLabel})
          <div style={{ marginTop: 2, fontSize: 8.5, opacity: 0.8 }}>Stima VolantiniPro ottenuta dalla distribuzione dei civici CAP all'interno dei NIL e dai dati territoriali disponibili.</div>
        </div>
      ) : (
        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.48)' }}>{context.cap.available ? context.cap.label : 'CAP non disponibile per questo civico'}</div>
      )}
      <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 10.5, fontWeight: 750 }}>Come vuoi definire la zona di distribuzione?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {context.nil.available && onUseNil ? <button type="button" style={actionStyle} onClick={onUseNil}>Usa NIL {context.nil.name}</button> : null}
        {context.municipio.available && onPreviewMunicipio ? <button type="button" style={actionStyle} onClick={() => onPreviewMunicipio(context.municipio.number)}>Apri {context.municipio.name}</button> : null}
        {onUseRadius ? <button type="button" style={actionStyle} onClick={onUseRadius}>Usa Raggio</button> : null}
        {onKeepMilanoComplete ? <button type="button" style={actionStyle} onClick={onKeepMilanoComplete}>Milano completo</button> : null}
      </div>
      <p style={{ margin: 0, color: 'rgba(255,255,255,.46)', fontSize: 9.5, lineHeight: 1.4 }}>
        Il CAP è utilizzato come area operativa stimata. Non rappresenta un confine postale ufficiale.
      </p>
    </section>
  );
}
