import React, { useState } from 'react';

export function ZoneProgressPanel({
  zones = [],
  history = [],
  loading = false,
  refreshing = false,
  error = null,
  notice = '',
  isAdmin = false,
  mutatingZoneId = null,
  onRefresh,
  onSetManual,
  onClearManual,
}) {
  const [drafts, setDrafts] = useState({});

  function updateDraft(zoneId, patch) {
    setDrafts((current) => ({
      ...current,
      [zoneId]: { percent: '', reason: '', ...(current[zoneId] || {}), ...patch },
    }));
  }

  async function submitManual(zone) {
    const draft = drafts[zone.campaign_zone_id] || {};
    const saved = await onSetManual?.(
      zone.campaign_zone_id,
      draft.percent,
      draft.reason,
    );
    if (saved) updateDraft(zone.campaign_zone_id, { reason: '' });
  }

  async function clearManual(zone) {
    const draft = drafts[zone.campaign_zone_id] || {};
    const cleared = await onClearManual?.(zone.campaign_zone_id, draft.reason);
    if (cleared) updateDraft(zone.campaign_zone_id, { percent: '', reason: '' });
  }

  return (
    <section style={panelStyle} aria-label="Avanzamento zone campagna">
      <div style={panelHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>Avanzamento per zona</p>
          <h2 style={titleStyle}>Copertura corrente</h2>
          <p style={subtitleStyle}>
            {isAdmin
              ? 'Valori automatici, override manuali e storico audit.'
              : 'Percentuale effettiva aggiornata per ogni zona della campagna.'}
          </p>
        </div>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={onRefresh}
          disabled={loading || refreshing || Boolean(mutatingZoneId)}
        >
          {refreshing ? 'Aggiornamento…' : 'Aggiorna'}
        </button>
      </div>

      {error ? (
        <div role="alert" style={errorStyle}>{error.message || 'Avanzamento zone non disponibile.'}</div>
      ) : null}
      {notice ? <div role="status" style={successStyle}>{notice}</div> : null}

      {loading ? (
        <div aria-busy="true" style={emptyStyle}>Caricamento avanzamento zone…</div>
      ) : zones.length === 0 ? (
        <div style={emptyStyle}>Nessuna zona configurata per questa campagna.</div>
      ) : (
        <div style={zoneGridStyle}>
          {zones.map((zone) => {
            const draft = drafts[zone.campaign_zone_id] || { percent: '', reason: '' };
            const busy = mutatingZoneId === zone.campaign_zone_id;
            const mutationBusy = Boolean(mutatingZoneId);
            return (
              <article key={zone.campaign_zone_id} style={zoneCardStyle}>
                <div style={zoneHeaderStyle}>
                  <div>
                    <strong style={zoneTitleStyle}>{zone.zone_name || 'Zona campagna'}</strong>
                    {zone.address_label ? <p style={addressStyle}>{zone.address_label}</p> : null}
                  </div>
                  <span style={percentBadgeStyle}>{formatPercent(zone.effective_percent)}</span>
                </div>

                <div
                  role="progressbar"
                  aria-label={`Avanzamento ${zone.zone_name || 'zona'}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={clampPercent(zone.effective_percent)}
                  style={trackStyle}
                >
                  <span style={{ ...fillStyle, width: `${clampPercent(zone.effective_percent)}%` }} />
                </div>

                <div style={metadataStyle}>
                  {isAdmin && zone.automatic_percent != null ? (
                    <span>Automatico: {formatPercent(zone.automatic_percent)}</span>
                  ) : null}
                  {isAdmin && zone.manual_override_enabled ? (
                    <span style={overrideStyle}>Override: {formatPercent(zone.manual_percent)}</span>
                  ) : null}
                  <span>Aggiornato: {formatDateTime(zone.updated_at)}</span>
                </div>

                {isAdmin ? (
                  <div style={adminFormStyle}>
                    <label style={labelStyle}>
                      Percentuale manuale
                      <input
                        aria-label={`Percentuale manuale ${zone.zone_name || 'zona'}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={draft.percent}
                        onChange={(event) => updateDraft(zone.campaign_zone_id, { percent: event.target.value })}
                        style={inputStyle}
                        disabled={busy}
                      />
                    </label>
                    <label style={reasonLabelStyle}>
                      Motivo obbligatorio
                      <input
                        aria-label={`Motivo override ${zone.zone_name || 'zona'}`}
                        type="text"
                        value={draft.reason}
                        onChange={(event) => updateDraft(zone.campaign_zone_id, { reason: event.target.value })}
                        style={inputStyle}
                        disabled={busy}
                      />
                    </label>
                    <div style={buttonGroupStyle}>
                      <button
                        type="button"
                        style={primaryButtonStyle}
                        onClick={() => submitManual(zone)}
                        disabled={mutationBusy || draft.percent === '' || !draft.reason.trim()}
                      >
                        {busy ? 'Salvataggio…' : 'Imposta override'}
                      </button>
                      <button
                        type="button"
                        style={secondaryButtonStyle}
                        onClick={() => clearManual(zone)}
                        disabled={mutationBusy || !zone.manual_override_enabled || !draft.reason.trim()}
                      >
                        Rimuovi override
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {isAdmin ? (
        <div style={historyStyle}>
          <h3 style={historyTitleStyle}>Storico modifiche</h3>
          {loading ? null : history.length ? history.map((entry) => (
            <div key={entry.id} style={historyRowStyle}>
              <div>
                <strong>{entry.zone_name_snapshot || 'Zona campagna'}</strong>
                <p style={historyReasonStyle}>{entry.reason}</p>
              </div>
              <div style={historyValuesStyle}>
                <span>{eventLabel(entry.event_type)}</span>
                <span>{formatNullablePercent(entry.old_effective_percent)} → {formatNullablePercent(entry.new_effective_percent)}</span>
                <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
              </div>
            </div>
          )) : <div style={emptyStyle}>Nessuna modifica manuale registrata.</div>}
        </div>
      ) : null}
    </section>
  );
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

function formatPercent(value) {
  return `${clampPercent(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
}

function formatNullablePercent(value) {
  return value == null ? '—' : formatPercent(value);
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'non disponibile';
}

function eventLabel(value) {
  if (value === 'manual_override') return 'Override manuale';
  if (value === 'manual_clear') return 'Override rimosso';
  return 'Ricalcolo automatico';
}

const panelStyle = { display: 'grid', gap: 16, background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const panelHeaderStyle = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' };
const eyebrowStyle = { margin: '0 0 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const titleStyle = { margin: 0, color: '#17211f', fontSize: 24 };
const subtitleStyle = { margin: '6px 0 0', color: '#64748b' };
const zoneGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 };
const zoneCardStyle = { display: 'grid', gap: 12, border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fbfdfc' };
const zoneHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' };
const zoneTitleStyle = { color: '#17211f', fontSize: 16 };
const addressStyle = { margin: '4px 0 0', color: '#64748b', fontSize: 13 };
const percentBadgeStyle = { padding: '6px 9px', borderRadius: 999, color: '#0f766e', background: '#ccfbf1', fontWeight: 900, whiteSpace: 'nowrap' };
const trackStyle = { height: 10, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0' };
const fillStyle = { display: 'block', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#0f766e,#14b8a6)' };
const metadataStyle = { display: 'flex', gap: 10, flexWrap: 'wrap', color: '#64748b', fontSize: 12 };
const overrideStyle = { color: '#b45309', fontWeight: 800 };
const adminFormStyle = { display: 'grid', gridTemplateColumns: 'minmax(120px,.45fr) minmax(180px,1fr)', gap: 10, paddingTop: 4 };
const labelStyle = { display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 800 };
const reasonLabelStyle = { ...labelStyle };
const inputStyle = { minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 10px', color: '#17211f', background: '#fff' };
const buttonGroupStyle = { gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' };
const primaryButtonStyle = { border: 'none', borderRadius: 9, padding: '9px 12px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#17211f', fontWeight: 800, cursor: 'pointer' };
const emptyStyle = { padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' };
const errorStyle = { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca' };
const successStyle = { padding: 12, borderRadius: 10, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0' };
const historyStyle = { display: 'grid', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 };
const historyTitleStyle = { margin: 0, color: '#17211f', fontSize: 17 };
const historyRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 12, borderRadius: 10, background: '#f8fafc', flexWrap: 'wrap' };
const historyReasonStyle = { margin: '4px 0 0', color: '#64748b', fontSize: 13 };
const historyValuesStyle = { display: 'grid', gap: 3, textAlign: 'right', color: '#64748b', fontSize: 12 };
