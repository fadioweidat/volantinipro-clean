import React from 'react';
import {
  BUSINESS_COPY_MODES,
  BUSINESS_DEFINITION_MODES,
  BUSINESS_DELIVERY_METHODS,
  BUSINESS_MATERIAL_LOCATIONS,
  BUSINESS_RECIPIENTS,
  BUSINESS_TARGET_OPTIONS,
  businessOptionLabel,
  getBusinessDefaultCopies,
} from '../../lib/business/business-config.js';

const colors = {
  panel: '#122036', inner: 'rgba(5,12,24,.46)', white: '#F8FAFC',
  muted: '#94A3B8', purple: '#A78BFA', green: '#4ADE80', yellow: '#FCD34D',
};

const inputStyle = {
  width: '100%', minHeight: 44, padding: '10px 12px', borderRadius: 11,
  border: '1px solid rgba(255,255,255,.13)', background: '#0B1526',
  color: colors.white, font: 'inherit', boxSizing: 'border-box', outlineOffset: 2,
};

const labelStyle = { display: 'block', marginBottom: 6, color: '#CBD5E1', fontSize: 12, fontWeight: 700 };

const BUSINESS_OBJECTIVE_MACROS = [
  ['information', 'Informare'],
  ['coupons', 'Promuovere'],
  ['service_presentation', 'Vendere'],
  ['b2b_partnership', 'Partnership'],
  ['professional_event', 'Evento'],
  ['catalogues', 'Cataloghi / campioni'],
];

const BUSINESS_TARGET_GROUPS = [
  { label: 'Selezione generale', values: ['all'] },
  { label: 'Commercio e accoglienza', values: ['retail', 'ristorazione', 'hospitality', 'immobiliare', 'automotive'] },
  { label: 'Professionisti e servizi', values: ['business', 'professional_services', 'sanitario', 'fitness'] },
  { label: 'Industria', values: ['industrial'] },
  { label: 'Formazione', values: ['scuole'] },
  { label: 'Altro', values: ['altro'] },
];

const INCLUDED_PROOFS = [
  ['visited_list', 'Elenco attività'],
  ['visit_outcome', 'Esito visita'],
  ['closed_business', 'Attività chiusa'],
  ['refusal', 'Rifiuto'],
];

const PREMIUM_PROOFS = [
  ['gps', 'GPS Live'],
  ['geolocated_photos', 'Foto geolocalizzate'],
  ['delivery_confirmation', 'Firma referente'],
  ['recipient_name', 'Nominativo referente'],
  ['final_report', 'Report avanzato'],
];

function ChoiceGrid({ options, value, onChange, columns = 3, multiple = false, ariaLabel }) {
  const current = multiple ? (Array.isArray(value) ? value : []) : value;
  return (
    <div role={multiple ? 'group' : 'radiogroup'} aria-label={ariaLabel} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 8 }}>
      {options.map(option => {
        const id = Array.isArray(option) ? option[0] : option.value;
        const text = Array.isArray(option) ? option[1] : option.label;
        const active = multiple ? current.includes(id) : current === id;
        return (
          <button
            key={id}
            type="button"
            role={multiple ? undefined : 'radio'}
            aria-checked={multiple ? undefined : active}
            aria-pressed={multiple ? active : undefined}
            onClick={() => onChange(id)}
            style={{
              minHeight: 44, padding: '9px 10px', borderRadius: 11, cursor: 'pointer',
              border: `1px solid ${active ? 'rgba(167,139,250,.72)' : 'rgba(255,255,255,.10)'}`,
              background: active ? 'rgba(167,139,250,.15)' : 'rgba(255,255,255,.035)',
              color: active ? '#DDD6FE' : '#CBD5E1', fontSize: 11, fontWeight: active ? 850 : 650,
              transition: 'background .2s,border-color .2s,transform .15s', outlineOffset: 2,
            }}
          >
            {active ? '✓ ' : ''}{text}
          </button>
        );
      })}
    </div>
  );
}

function FieldGroup({ title, description, children }) {
  return (
    <section style={{ padding: 16, borderRadius: 14, background: colors.inner, border: '1px solid rgba(167,139,250,.16)' }}>
      <div style={{ color: colors.white, fontSize: 13, fontWeight: 850 }}>{title}</div>
      {description && <div style={{ color: 'rgba(255,255,255,.46)', fontSize: 10.5, lineHeight: 1.45, margin: '4px 0 12px' }}>{description}</div>}
      {!description && <div style={{ height: 10 }} />}
      {children}
    </section>
  );
}

function BusinessSection({ marker, title, description, children }) {
  return (
    <section style={{ padding: 18, borderRadius: 17, background: 'rgba(8,17,31,.34)', border: '1px solid rgba(255,255,255,.08)' }}>
      <header style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, flex: '0 0 28px', borderRadius: 8, background: 'rgba(167,139,250,.14)', color: '#DDD6FE', fontSize: 11, fontWeight: 900 }}>{marker}</span>
        <div>
          <div style={{ color: colors.white, fontSize: 16, fontWeight: 900 }}>{title}</div>
          {description && <div style={{ color: colors.muted, fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{description}</div>}
        </div>
      </header>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>
  );
}

function GroupedTargetGrid({ value, onChange, isMobile }) {
  const optionsByValue = Object.fromEntries(BUSINESS_TARGET_OPTIONS.map(option => [option.value, option]));
  return (
    <div style={{ display: 'grid', gap: 13 }}>
      {BUSINESS_TARGET_GROUPS.map(group => (
        <div key={group.label}>
          <div style={{ color: '#94A3B8', fontSize: 10, fontWeight: 850, letterSpacing: '.05em', marginBottom: 7 }}>{group.label}</div>
          <ChoiceGrid options={group.values.map(key => optionsByValue[key]).filter(Boolean)} value={value} onChange={onChange} columns={isMobile ? 1 : Math.min(3, group.values.length)} multiple ariaLabel={`Categorie Business: ${group.label}`} />
        </div>
      ))}
    </div>
  );
}

export default function BusinessStep1Config({ data, updateData, isMobile }) {
  const targets = Array.isArray(data.distributionTargets) ? data.distributionTargets : [];
  const proofs = Array.isArray(data.businessProofs) ? data.businessProofs : [];
  const definitionMode = data.businessDefinitionMode || 'materials';
  const copiesMode = data.businessCopiesMode || 'fixed_1';
  const categoryCopies = data.businessCopiesByCategory || {};
  const gridColumns = isMobile ? 1 : 3;
  const macroObjectiveValue = { display_material: 'coupons', other: 'information' }[data.businessCampaignObjective] || data.businessCampaignObjective || '';

  const toggleTarget = (target) => {
    if (target === 'all') {
      updateData({ distributionTargets: targets.includes('all') ? [] : ['all'], distributionTargetsExplicit: true });
      return;
    }
    const withoutAll = targets.filter(item => item !== 'all');
    updateData({
      distributionTargets: withoutAll.includes(target) ? withoutAll.filter(item => item !== target) : [...withoutAll, target],
      distributionTargetsExplicit: true,
    });
  };

  const toggleProof = (proof) => updateData({ businessProofs: proofs.includes(proof) ? proofs.filter(item => item !== proof) : [...proofs, proof] });
  const updatePickup = (patch) => updateData({ businessPickup: { ...(data.businessPickup || {}), ...patch } });

  const materialQty = Math.max(0, Number(data.businessMaterialQuantity ?? data.qty ?? 0) || 0);
  const defaultCopies = getBusinessDefaultCopies(data);
  const estimatedReach = defaultCopies && materialQty ? Math.floor(materialQty / defaultCopies) : null;
  const selectedCategoryTargets = targets.filter(target => !['all', 'altro'].includes(target));

  return (
    <div id="section-business-config" style={{ marginTop: 24, padding: isMobile ? 17 : 24, borderRadius: 20, background: colors.panel, border: '1px solid rgba(255,255,255,.08)', borderTop: `2px solid ${colors.purple}` }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ color: colors.purple, fontSize: 11, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase' }}>Configurazione distribuzione presso attività e aziende</div>
        <div style={{ color: 'rgba(255,255,255,.53)', fontSize: 11, lineHeight: 1.5, marginTop: 6, maxWidth: 760 }}>
          Definisci il target commerciale, i materiali e le regole di consegna. Area, attività reali e piano operativo saranno calcolati nello Step 2.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <BusinessSection marker="A" title="Configurazione iniziale" description="Definisci il punto di partenza, le attività da raggiungere e l'obiettivo.">
        <FieldGroup
          title="Da quale comune vuoi partire?"
          description="Il comune iniziale centra la mappa dello Step 2. Da lì potrai ampliare l’area, aggiungere altri comuni e scegliere le attività reali da visitare."
        >
          <label style={labelStyle} htmlFor="business-starting-area">Comune o zona di partenza *</label>
          <input
            id="business-starting-area"
            aria-label="Comune o zona di partenza Business"
            autoComplete="address-level2"
            required
            value={data.businessZone || ''}
            onChange={event => updateData({ businessZone: event.target.value })}
            placeholder="es. Varedo, Milano, Monza…"
            style={inputStyle}
          />
        </FieldGroup>
        <FieldGroup title="Quali attività vuoi raggiungere?" description="Selezione multipla. La mappa mostrerà soltanto categorie compatibili realmente restituite dalle fonti.">
          <GroupedTargetGrid value={targets} onChange={toggleTarget} isMobile={isMobile} />
          {targets.includes('altro') && <input aria-label="Specifica altro target Business" value={data.businessOtherTarget || ''} onChange={event => updateData({ businessOtherTarget: event.target.value })} placeholder="Specifica il tipo di attività" style={{ ...inputStyle, marginTop: 10 }} />}
        </FieldGroup>

        <FieldGroup title="Qual è il tuo obiettivo?">
          <ChoiceGrid options={BUSINESS_OBJECTIVE_MACROS} value={macroObjectiveValue} onChange={value => updateData({ businessCampaignObjective: value })} columns={gridColumns} ariaLabel="Obiettivo campagna Business" />
          <div style={{ marginTop: 9, color: colors.muted, fontSize: 10.5 }}>I dettagli dell'obiettivo verranno affinati nello Step 2.</div>
        </FieldGroup>
        </BusinessSection>

        <BusinessSection marker="B" title="Distribuzione" description="Definisci quantità, copie per attività e modalità operativa.">
        <FieldGroup title="Come vuoi definire la campagna?" description="Materiali e attività sono grandezze distinte: una visita può prevedere più copie.">
          <ChoiceGrid options={BUSINESS_DEFINITION_MODES} value={definitionMode} onChange={value => updateData({ businessDefinitionMode: value })} columns={gridColumns} ariaLabel="Definizione campagna Business" />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginTop: 12 }}>
            {['materials', 'both'].includes(definitionMode) && (
              <div>
                <label style={labelStyle} htmlFor="business-material-quantity">Quantità di brochure/materiali disponibili</label>
                <input id="business-material-quantity" type="number" min="1" inputMode="numeric" value={data.businessMaterialQuantity ?? data.qty ?? ''} onChange={event => updateData({ businessMaterialQuantity: Number(event.target.value) || '', qty: Number(event.target.value) || '' })} style={inputStyle} />
              </div>
            )}
            {['activities', 'both'].includes(definitionMode) && (
              <div>
                <label style={labelStyle} htmlFor="business-target-count">Numero desiderato di attività da visitare</label>
                <input id="business-target-count" type="number" min="1" inputMode="numeric" value={data.businessTargetCount || ''} onChange={event => updateData({ businessTargetCount: Number(event.target.value) || '' })} style={inputStyle} />
              </div>
            )}
          </div>
          {['materials', 'both'].includes(definitionMode) && materialQty > 0 && (
            <div role="status" style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9, background: 'rgba(74,222,128,.07)', color: '#A7F3D0', fontSize: 11, lineHeight: 1.45 }}>
              <strong>Quantità valida per procedere.</strong> La copertura reale verrà calcolata automaticamente nello Step 2.
            </div>
          )}
        </FieldGroup>

        <FieldGroup title="Quante copie vuoi lasciare per attività?">
          <ChoiceGrid options={BUSINESS_COPY_MODES} value={copiesMode} onChange={value => updateData({ businessCopiesMode: value })} columns={gridColumns} ariaLabel="Copie per attività" />
          {copiesMode === 'range_3_5' && (
            <div style={{ marginTop: 12 }}><label style={labelStyle} htmlFor="business-range-copies">Valore medio operativo (3–5)</label><input id="business-range-copies" type="number" min="3" max="5" value={data.businessDefaultCopies || 3} onChange={event => updateData({ businessDefaultCopies: Math.max(3, Math.min(5, Number(event.target.value) || 3)) })} style={{ ...inputStyle, maxWidth: 220 }} /></div>
          )}
          {copiesMode === 'custom' && (
            <div style={{ marginTop: 12 }}><label style={labelStyle} htmlFor="business-custom-copies">Copie per attività</label><input id="business-custom-copies" type="number" min="1" value={data.businessCustomCopies || ''} onChange={event => updateData({ businessCustomCopies: Math.max(1, Number(event.target.value) || 1) })} style={{ ...inputStyle, maxWidth: 220 }} /></div>
          )}
          {copiesMode === 'by_category' && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 9, marginTop: 12 }}>
              {selectedCategoryTargets.length ? selectedCategoryTargets.map(target => (
                <label key={target} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px', gap: 8, alignItems: 'center', color: '#CBD5E1', fontSize: 11 }}>
                  <span>{BUSINESS_TARGET_OPTIONS.find(item => item.value === target)?.label || target}</span>
                  <input aria-label={`Copie per ${target}`} type="number" min="1" value={categoryCopies[target] || ''} onChange={event => updateData({ businessCopiesByCategory: { ...categoryCopies, [target]: Math.max(1, Number(event.target.value) || 1) } })} style={inputStyle} />
                </label>
              )) : <div style={{ color: colors.yellow, fontSize: 11 }}>Seleziona prima almeno una categoria specifica.</div>}
            </div>
          )}
          {estimatedReach != null && <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 9, background: 'rgba(148,163,184,.07)', color: '#CBD5E1', fontSize: 11, lineHeight: 1.45 }}><strong>Capacità teorica: {estimatedReach.toLocaleString('it-IT')} attività.</strong> Il numero reale di attività disponibili verrà verificato nello Step 2.</div>}
        </FieldGroup>

        <FieldGroup title="Come deve essere consegnato il materiale?" description="La modalità scelta determina il tempo medio stimato per visita e il piano operativo.">
          <ChoiceGrid options={BUSINESS_DELIVERY_METHODS} value={data.businessDeliveryMethod || ''} onChange={value => updateData({ businessDeliveryMethod: value, deliveryType: value })} columns={gridColumns} ariaLabel="Modalità di consegna Business" />
          {data.businessDeliveryMethod === 'other' && <input aria-label="Specifica modalità di consegna" value={data.businessOtherDeliveryMethod || ''} onChange={event => updateData({ businessOtherDeliveryMethod: event.target.value })} placeholder="Descrivi la modalità" style={{ ...inputStyle, marginTop: 10 }} />}
        </FieldGroup>

        <FieldGroup title="Dove si trova il materiale?">
          <ChoiceGrid options={BUSINESS_MATERIAL_LOCATIONS} value={data.businessMaterialLocation || ''} onChange={value => updateData({ businessMaterialLocation: value, ...(value === 'to_print' ? { hasFlyers: 'no', printing: { ...(data.printing || {}), enabled: true } } : { hasFlyers: 'yes' }) })} columns={isMobile ? 1 : 2} ariaLabel="Posizione materiale" />
          {data.businessMaterialLocation === 'pickup_client' && (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
              <div style={{ gridColumn: isMobile ? 'auto' : '1 / -1' }}><label style={labelStyle} htmlFor="business-pickup-address">Indirizzo di ritiro</label><input id="business-pickup-address" value={data.businessPickup?.address || ''} onChange={event => updatePickup({ address: event.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle} htmlFor="business-pickup-date">Data di disponibilità</label><input id="business-pickup-date" type="date" value={data.businessPickup?.availableDate || ''} onChange={event => updatePickup({ availableDate: event.target.value })} style={inputStyle} /></div>
              <div><label style={labelStyle} htmlFor="business-pickup-boxes">Numero colli/scatole</label><input id="business-pickup-boxes" type="number" min="1" value={data.businessPickup?.boxes || ''} onChange={event => updatePickup({ boxes: Number(event.target.value) || '' })} style={inputStyle} /></div>
              <div><label style={labelStyle} htmlFor="business-pickup-weight">Peso indicativo (kg)</label><input id="business-pickup-weight" type="number" min="0" step="0.1" value={data.businessPickup?.weightKg || ''} onChange={event => updatePickup({ weightKg: Number(event.target.value) || '' })} style={inputStyle} /></div>
              <div><label style={labelStyle} htmlFor="business-pickup-notes">Note ritiro</label><input id="business-pickup-notes" value={data.businessPickup?.notes || ''} onChange={event => updatePickup({ notes: event.target.value })} style={inputStyle} /></div>
            </div>
          )}
        </FieldGroup>
        </BusinessSection>

        <BusinessSection marker="C" title="Organizzazione" description="Imposta referente, periodo, orario e urgenza.">
        <FieldGroup title="Chi dovrebbe ricevere il materiale?" description="Campo facoltativo.">
          <select aria-label="Referente preferito" value={data.businessPreferredRecipient || 'any'} onChange={event => updateData({ businessPreferredRecipient: event.target.value })} style={inputStyle}>
            {BUSINESS_RECIPIENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {data.businessPreferredRecipient === 'other' && <input aria-label="Specifica referente" value={data.businessOtherRecipient || ''} onChange={event => updateData({ businessOtherRecipient: event.target.value })} placeholder="Indica il referente" style={{ ...inputStyle, marginTop: 10 }} />}
        </FieldGroup>

        <FieldGroup title="Periodo e urgenza" description="L’orario di visita è una preferenza, non una postazione obbligatoria.">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <div><label style={labelStyle} htmlFor="business-start-date">Data di inizio preferita</label><input id="business-start-date" type="date" value={data.businessPreferredStartDate || data.startDate || ''} onChange={event => updateData({ businessPreferredStartDate: event.target.value, startDate: event.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="business-complete-by">Data entro cui completare</label><input id="business-complete-by" type="date" value={data.businessCompleteBy || data.endDate || ''} onChange={event => updateData({ businessCompleteBy: event.target.value, endDate: event.target.value })} style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="business-urgency">Urgenza</label><select id="business-urgency" value={data.urgency || 'normal'} onChange={event => updateData({ urgency: event.target.value })} style={inputStyle}><option value="normal">Standard</option><option value="urgent">Rapida</option><option value="express">Espressa</option></select></div>
            <div><label style={labelStyle} htmlFor="business-preferred-time">Orario preferito per visitare le attività (facoltativo)</label><input id="business-preferred-time" value={data.businessPreferredVisitTime || ''} onChange={event => updateData({ businessPreferredVisitTime: event.target.value })} placeholder="es. 09:30–12:30, evitare pausa pranzo" style={inputStyle} /></div>
          </div>
        </FieldGroup>
        </BusinessSection>

        <details style={{ borderRadius: 17, background: 'rgba(8,17,31,.34)', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
          <summary style={{ cursor: 'pointer', padding: 18, color: colors.white, fontSize: 15, fontWeight: 900, listStylePosition: 'inside' }}>
            D · Dettagli avanzati
            <span style={{ display: 'block', margin: '5px 0 0 22px', color: colors.muted, fontSize: 10.5, fontWeight: 550 }}>Prove di consegna, tracciamento e istruzioni opzionali</span>
          </summary>
          <div style={{ display: 'grid', gap: 12, padding: '0 18px 18px' }}>
            <FieldGroup title="Prove di consegna" description="Le opzioni mantengono gli stessi valori operativi; sono separate per livello di servizio.">
              <div style={{ marginBottom: 14 }}>
                <div style={{ color: colors.green, fontSize: 11, fontWeight: 900, marginBottom: 8 }}>Incluse</div>
                <ChoiceGrid options={INCLUDED_PROOFS} value={proofs} onChange={toggleProof} columns={isMobile ? 1 : 2} multiple ariaLabel="Prove di consegna incluse" />
                <div style={{ marginTop: 7, color: '#A7F3D0', fontSize: 10.5 }}>✓ Riepilogo base incluso</div>
              </div>
              <div>
                <div style={{ color: colors.purple, fontSize: 11, fontWeight: 900, marginBottom: 8 }}>Premium</div>
                <ChoiceGrid options={PREMIUM_PROOFS} value={proofs} onChange={toggleProof} columns={isMobile ? 1 : 2} multiple ariaLabel="Prove di consegna premium" />
              </div>
            </FieldGroup>

            <FieldGroup title="Note e istruzioni">
              <label style={{ ...labelStyle, position: 'absolute', left: -10000 }} htmlFor="business-notes">Note e istruzioni Business</label>
              <textarea id="business-notes" rows={4} value={data.businessNotes || ''} onChange={event => updateData({ businessNotes: event.target.value, operationalNotes: event.target.value })} placeholder="Indica attività da escludere, nominativo da chiedere, messaggio da comunicare o altre istruzioni." style={{ ...inputStyle, resize: 'vertical' }} />
            </FieldGroup>
          </div>
        </details>
      </div>

      <div style={{ marginTop: 12, color: 'rgba(255,255,255,.42)', fontSize: 10.5, lineHeight: 1.5 }}>
        Riepilogo: {targets.length || 0} target · {businessOptionLabel(BUSINESS_OBJECTIVE_MACROS, macroObjectiveValue)} · {businessOptionLabel(BUSINESS_DELIVERY_METHODS, data.businessDeliveryMethod)}. Operatori e durata saranno stimati dopo la selezione delle attività.
      </div>
    </div>
  );
}
