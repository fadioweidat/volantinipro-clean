import React, { useState } from 'react';

// theme='light' (default) mantiene lo stile originale invariato per i
// chiamanti esistenti (es. GpsMonitor.jsx, Admin) — nessuna riga di quella
// pagina cambia aspetto. theme='dark' e' usato SOLO da CampaignTracking.jsx
// (area cliente) per allinearsi al design system scuro di Dashboard/Dettaglio
// Campagna. Nessuna logica di zone/override/refresh e' toccata, solo i
// token di stile.
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
  theme = 'light',
}) {
  const [drafts, setDrafts] = useState({});
  const t = buildTokens(theme === 'dark');

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
    <section style={t.panelStyle} aria-label="Avanzamento zone campagna">
      <div style={t.panelHeaderStyle}>
        <div>
          <p style={t.eyebrowStyle}>Avanzamento per zona</p>
          <h2 style={t.titleStyle}>Copertura corrente</h2>
          <p style={t.subtitleStyle}>
            {isAdmin
              ? 'Valori automatici, override manuali e storico audit.'
              : 'Percentuale effettiva aggiornata per ogni zona della campagna.'}
          </p>
        </div>
        <button
          type="button"
          style={t.secondaryButtonStyle}
          onClick={onRefresh}
          disabled={loading || refreshing || Boolean(mutatingZoneId)}
        >
          {refreshing ? 'Aggiornamento…' : 'Aggiorna'}
        </button>
      </div>

      {error ? (
        <div role="alert" style={t.errorStyle}>{error.message || 'Avanzamento zone non disponibile.'}</div>
      ) : null}
      {notice ? <div role="status" style={t.successStyle}>{notice}</div> : null}

      {loading ? (
        <div aria-busy="true" style={t.emptyStyle}>Caricamento avanzamento zone…</div>
      ) : zones.length === 0 ? (
        <div style={t.emptyStyle}>Nessuna zona configurata per questa campagna.</div>
      ) : (
        <div style={t.zoneGridStyle}>
          {zones.map((zone) => {
            const draft = drafts[zone.campaign_zone_id] || { percent: '', reason: '' };
            const busy = mutatingZoneId === zone.campaign_zone_id;
            const mutationBusy = Boolean(mutatingZoneId);
            return (
              <article key={zone.campaign_zone_id} style={t.zoneCardStyle}>
                <div style={t.zoneHeaderStyle}>
                  <div>
                    <strong style={t.zoneTitleStyle}>{zone.zone_name || 'Zona campagna'}</strong>
                    {zone.address_label ? <p style={t.addressStyle}>{zone.address_label}</p> : null}
                  </div>
                  <span style={t.percentBadgeStyle}>{formatPercent(zone.effective_percent)}</span>
                </div>

                <div
                  role="progressbar"
                  aria-label={`Avanzamento ${zone.zone_name || 'zona'}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={clampPercent(zone.effective_percent)}
                  style={t.trackStyle}
                >
                  <span style={{ ...t.fillStyle, width: `${clampPercent(zone.effective_percent)}%` }} />
                </div>

                <div style={t.metadataStyle}>
                  {isAdmin && zone.automatic_percent != null ? (
                    <span>Automatico: {formatPercent(zone.automatic_percent)}</span>
                  ) : null}
                  {isAdmin && zone.manual_override_enabled ? (
                    <span style={t.overrideStyle}>Override: {formatPercent(zone.manual_percent)}</span>
                  ) : null}
                  <span>Aggiornato: {formatDateTime(zone.updated_at)}</span>
                </div>

                {isAdmin ? (
                  <div style={t.adminFormStyle}>
                    <label style={t.labelStyle}>
                      Percentuale manuale
                      <input
                        aria-label={`Percentuale manuale ${zone.zone_name || 'zona'}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={draft.percent}
                        onChange={(event) => updateDraft(zone.campaign_zone_id, { percent: event.target.value })}
                        style={t.inputStyle}
                        disabled={busy}
                      />
                    </label>
                    <label style={t.reasonLabelStyle}>
                      Motivo obbligatorio
                      <input
                        aria-label={`Motivo override ${zone.zone_name || 'zona'}`}
                        type="text"
                        value={draft.reason}
                        onChange={(event) => updateDraft(zone.campaign_zone_id, { reason: event.target.value })}
                        style={t.inputStyle}
                        disabled={busy}
                      />
                    </label>
                    <div style={t.buttonGroupStyle}>
                      <button
                        type="button"
                        style={t.primaryButtonStyle}
                        onClick={() => submitManual(zone)}
                        disabled={mutationBusy || draft.percent === '' || !draft.reason.trim()}
                      >
                        {busy ? 'Salvataggio…' : 'Imposta override'}
                      </button>
                      <button
                        type="button"
                        style={t.secondaryButtonStyle}
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
        <div style={t.historyStyle}>
          <h3 style={t.historyTitleStyle}>Storico modifiche</h3>
          {loading ? null : history.length ? history.map((entry) => (
            <div key={entry.id} style={t.historyRowStyle}>
              <div>
                <strong>{entry.zone_name_snapshot || 'Zona campagna'}</strong>
                <p style={t.historyReasonStyle}>{entry.reason}</p>
              </div>
              <div style={t.historyValuesStyle}>
                <span>{eventLabel(entry.event_type)}</span>
                <span>{formatNullablePercent(entry.old_effective_percent)} → {formatNullablePercent(entry.new_effective_percent)}</span>
                <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
              </div>
            </div>
          )) : <div style={t.emptyStyle}>Nessuna modifica manuale registrata.</div>}
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

function buildTokens(isDark) {
  if (!isDark) {
    return {
      panelStyle: { display: 'grid', gap: 16, background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' },
      panelHeaderStyle: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
      eyebrowStyle: { margin: '0 0 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 },
      titleStyle: { margin: 0, color: '#17211f', fontSize: 24 },
      subtitleStyle: { margin: '6px 0 0', color: '#64748b' },
      zoneGridStyle: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 },
      zoneCardStyle: { display: 'grid', gap: 12, border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fbfdfc' },
      zoneHeaderStyle: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
      zoneTitleStyle: { color: '#17211f', fontSize: 16 },
      addressStyle: { margin: '4px 0 0', color: '#64748b', fontSize: 13 },
      percentBadgeStyle: { padding: '6px 9px', borderRadius: 999, color: '#0f766e', background: '#ccfbf1', fontWeight: 900, whiteSpace: 'nowrap' },
      trackStyle: { height: 10, overflow: 'hidden', borderRadius: 999, background: '#e2e8f0' },
      fillStyle: { display: 'block', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#0f766e,#14b8a6)' },
      metadataStyle: { display: 'flex', gap: 10, flexWrap: 'wrap', color: '#64748b', fontSize: 12 },
      overrideStyle: { color: '#b45309', fontWeight: 800 },
      adminFormStyle: { display: 'grid', gridTemplateColumns: 'minmax(120px,.45fr) minmax(180px,1fr)', gap: 10, paddingTop: 4 },
      labelStyle: { display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 800 },
      reasonLabelStyle: { display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 800 },
      inputStyle: { minWidth: 0, border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 10px', color: '#17211f', background: '#fff' },
      buttonGroupStyle: { gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' },
      primaryButtonStyle: { border: 'none', borderRadius: 9, padding: '9px 12px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' },
      secondaryButtonStyle: { border: '1px solid #cbd5e1', borderRadius: 9, padding: '9px 12px', background: '#fff', color: '#17211f', fontWeight: 800, cursor: 'pointer' },
      emptyStyle: { padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' },
      errorStyle: { padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca' },
      successStyle: { padding: 12, borderRadius: 10, color: '#166534', background: '#dcfce7', border: '1px solid #bbf7d0' },
      historyStyle: { display: 'grid', gap: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 },
      historyTitleStyle: { margin: 0, color: '#17211f', fontSize: 17 },
      historyRowStyle: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 12, borderRadius: 10, background: '#f8fafc', flexWrap: 'wrap' },
      historyReasonStyle: { margin: '4px 0 0', color: '#64748b', fontSize: 13 },
      historyValuesStyle: { display: 'flex', gap: 10, flexWrap: 'wrap', color: '#64748b', fontSize: 12 },
    };
  }
  // Dark variant — stessi token della Dashboard/Dettaglio Campagna Cliente
  // (rgba(255,255,255,.045) su navy, bordi rgba(255,255,255,.08-.09), verde
  // #2ECC8A come accent primario). Usato solo quando theme='dark'.
  return {
    panelStyle: { display: 'grid', gap: 16, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 14, padding: 18 },
    panelHeaderStyle: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
    eyebrowStyle: { margin: '0 0 6px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.12em', color: '#2ECC8A', fontWeight: 800 },
    titleStyle: { margin: 0, color: '#FFFFFF', fontSize: 22, fontFamily: "'Playfair Display', Georgia, serif" },
    subtitleStyle: { margin: '6px 0 0', color: 'rgba(255,255,255,.48)', fontSize: 12 },
    zoneGridStyle: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 },
    zoneCardStyle: { display: 'grid', gap: 12, border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, background: 'rgba(255,255,255,.035)' },
    zoneHeaderStyle: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
    zoneTitleStyle: { color: '#FFFFFF', fontSize: 15 },
    addressStyle: { margin: '4px 0 0', color: 'rgba(255,255,255,.45)', fontSize: 13 },
    percentBadgeStyle: { padding: '6px 9px', borderRadius: 999, color: '#2ECC8A', background: 'rgba(46,204,138,.14)', fontWeight: 900, whiteSpace: 'nowrap' },
    trackStyle: { height: 8, overflow: 'hidden', borderRadius: 999, background: 'rgba(255,255,255,.08)' },
    fillStyle: { display: 'block', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#2ECC8A,#60A5FA)' },
    metadataStyle: { display: 'flex', gap: 10, flexWrap: 'wrap', color: 'rgba(255,255,255,.45)', fontSize: 12 },
    overrideStyle: { color: '#FBBF24', fontWeight: 800 },
    adminFormStyle: { display: 'grid', gridTemplateColumns: 'minmax(120px,.45fr) minmax(180px,1fr)', gap: 10, paddingTop: 4 },
    labelStyle: { display: 'grid', gap: 5, color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800 },
    reasonLabelStyle: { display: 'grid', gap: 5, color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 800 },
    inputStyle: { minWidth: 0, border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, padding: '9px 10px', color: '#FFFFFF', background: 'rgba(255,255,255,.05)' },
    buttonGroupStyle: { gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' },
    primaryButtonStyle: { border: 'none', borderRadius: 9, padding: '9px 12px', background: '#E8571A', color: '#FFFFFF', fontWeight: 900, cursor: 'pointer' },
    secondaryButtonStyle: { border: '1px solid rgba(255,255,255,.14)', borderRadius: 9, padding: '9px 12px', background: 'rgba(255,255,255,.05)', color: '#FFFFFF', fontWeight: 800, cursor: 'pointer' },
    emptyStyle: { padding: 16, border: '1px dashed rgba(255,255,255,.16)', borderRadius: 10, color: 'rgba(255,255,255,.5)', textAlign: 'center', background: 'rgba(255,255,255,.02)' },
    errorStyle: { padding: 12, borderRadius: 10, color: '#F87171', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.25)' },
    successStyle: { padding: 12, borderRadius: 10, color: '#2ECC8A', background: 'rgba(46,204,138,.1)', border: '1px solid rgba(46,204,138,.24)' },
    historyStyle: { display: 'grid', gap: 8, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 16 },
    historyTitleStyle: { margin: 0, color: '#FFFFFF', fontSize: 17 },
    historyRowStyle: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.03)', flexWrap: 'wrap' },
    historyReasonStyle: { margin: '4px 0 0', color: 'rgba(255,255,255,.45)', fontSize: 13 },
    historyValuesStyle: { display: 'flex', gap: 10, flexWrap: 'wrap', color: 'rgba(255,255,255,.45)', fontSize: 12 },
  };
}
