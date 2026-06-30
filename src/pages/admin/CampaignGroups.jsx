import { useEffect, useState } from 'react';
import { getCampaignRecord } from '../../lib/services/gps-api.js';
import { getRealGroups, getAdminCoverageCorrections, getAssignedZones, computeCoverageMetrics } from '../../lib/services/admin-api.js';
import { groupShareUrl } from '../../lib/services/group-ops.js';
import { formatDateTime } from '../../lib/services/report-utils.js';

const STATUS = {
  attivo: '#2ecc8a',
  fermo: '#fbbf24',
  completato: 'rgba(255,255,255,.58)',
  problema: '#ef4444',
};

export function CampaignGroups({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, groups: [], campaign: null, corrections: [], zones: [], notice: '' });

  useEffect(() => {
    if (import.meta.env.DEV) console.log('[GPS_MONITOR_OPENED]');
    let cancelled = false;
    async function load() {
      try {
        const [groups, campaign, corrections, zones] = await Promise.all([
          getRealGroups(campaignId),
          getCampaignRecord(campaignId).catch(() => null),
          getAdminCoverageCorrections(campaignId),
          getAssignedZones(campaignId),
        ]);
        if (!cancelled) setState({ loading: false, error: null, groups, campaign, corrections, zones, notice: '' });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento gruppi.' }));
      }
    }
    load();
    const timer = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId]);

  const groups = state.groups || [];
  const totals = groups.reduce((acc, group) => ({
    operators: acc.operators + group.operatorCount,
    online: acc.online + group.online,
    offline: acc.offline + group.offline,
    problems: acc.problems + group.problems.length,
    km: acc.km + group.km,
    points: acc.points + group.points,
  }), { operators: 0, online: 0, offline: 0, problems: 0, km: 0, points: 0 });

  const overallTargetKm = state.zones.reduce((s, z) => s + (Number(z.target_km) || 0), 0) || Math.max(10, totals.km || 10);
  const metrics = computeCoverageMetrics(totals.km, overallTargetKm, state.corrections);

  async function copyGroup(group) {
    const url = groupShareUrl(campaignId, group);
    await navigator.clipboard?.writeText(url);
    setState((prev) => ({ ...prev, notice: `Link copiato: ${url}` }));
  }

  function handleGroupClick(groupId) {
    if (import.meta.env.DEV) console.log('[GPS_GROUP_SELECTED]', groupId);
    if (groupId) {
      window.location.href = `/admin/campaigns/${campaignId}/groups/${encodeURIComponent(groupId)}`;
    }
  }

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href="/admin" style={brandStyle}>VolantiniPro Admin</a>
          <h1 style={titleStyle}>Gruppi operativi</h1>
          <p style={mutedStyle}>{campaignTitle(state.campaign, campaignId)}</p>
        </div>
        <div style={actionsStyle}>
          <a style={buttonStyle} href={`/admin/campaigns/${campaignId}/operations`}>Operazioni</a>
          <a style={buttonStyle} href={`/admin/campaigns/${campaignId}/report`}>Report</a>
          <a style={buttonStyle} href="/admin/live">GPS Live</a>
        </div>
      </header>

      {state.loading && <Notice text="Caricamento gruppi reali..." />}
      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Riepilogo Copertura (GPS Reale + Validazione Admin = Finale Cliente)</p>
          </div>
        </div>
        <div style={kpiGridStyle}>
          <Kpi label="GPS Reale" value={`${metrics.copertura_gps_reale_percent}%`} color="#60a5fa" />
          <Kpi label="Validazione Admin" value={`${metrics.copertura_manual_admin_percent}%`} color="#2ecc8a" />
          <Kpi label="Da Rifare" value={`${metrics.copertura_da_rifare_percent}%`} color="#ef4444" />
          <Kpi label="Finale Cliente" value={`${metrics.copertura_finale_cliente_percent}%`} color="#e8571a" />
        </div>
      </section>

      <section style={{ ...kpiGridStyle, marginTop: 16 }}>
        <Kpi label="Gruppi" value={groups.length} />
        <Kpi label="Operatori" value={totals.operators} />
        <Kpi label="Online" value={totals.online} color="#2ecc8a" />
        <Kpi label="Offline" value={totals.offline} color="#ef4444" />
        <Kpi label="Problemi aperti" value={totals.problems} color={totals.problems ? '#ef4444' : '#2ecc8a'} />
        <Kpi label="Km totali" value={`${totals.km.toFixed(2)} km`} />
        <Kpi label="Punti GPS" value={totals.points} />
      </section>

      <section style={cardStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <p style={eyebrowStyle}>Tabella gruppi</p>
            <span style={mutedStyle}>Gruppi reali da colonne dedicate o metadata delle sessioni.</span>
          </div>
        </div>
        {groups.length ? <div style={tableStyle}>
          <div style={tableHeadStyle}>
            <span>Gruppo</span><span>Capogruppo</span><span>Operatori</span><span>Online/Offline</span><span>Ultimo ping</span><span>Km</span><span>GPS</span><span>Foto</span><span>Stato</span><span></span>
          </div>
          {groups.map((group) => (
            <div key={group.id} style={tableRowStyle}>
              <strong>{group.name}</strong>
              <span>{group.lead}</span>
              <span>{group.operatorCount}</span>
              <span><b style={{ color: '#2ecc8a' }}>{group.online}</b> / <b style={{ color: '#ef4444' }}>{group.offline}</b></span>
              <span>{formatDateTime(group.lastPing)}</span>
              <span>{group.km.toFixed(2)}</span>
              <span>{group.points}</span>
              <span>{group.photos}</span>
              <span style={{ color: STATUS[group.status] || '#fbbf24', fontWeight: 900 }}>{group.status}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <a style={smallButtonStyle} href={`/admin/campaigns/${campaignId}/groups/${encodeURIComponent(group.id)}`}>Apri gruppo</a>
                <button style={smallButtonStyle} type="button" onClick={() => copyGroup(group)}>Copia link</button>
              </span>
            </div>
          ))}
        </div> : <EmptyState text="Nessun dato reale disponibile" />}
      </section>
    </main>
  );
}

function campaignTitle(campaign, campaignId) {
  return campaign?.title || campaign?.name || campaign?.campaign_name || campaign?.zone_label || `Campagna ${campaignId}`;
}

function Kpi({ label, value, color = '#e8571a' }) {
  return <div style={cardStyle}><p style={eyebrowStyle}>{label}</p><strong style={{ color, fontSize: 26 }}>{value}</strong></div>;
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#ef4444' : 'rgba(255,255,255,.1)', color: danger ? '#fecaca' : '#d1fae5' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#07100d', color: 'rgba(255,255,255,.72)', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 };
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none' };
const titleStyle = { margin: '8px 0 4px', fontSize: 34, color: '#fff' };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.55)', fontSize: 12 };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const actionsStyle = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' };
const buttonStyle = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', color: '#fff', background: 'rgba(255,255,255,.04)', textDecoration: 'none', fontWeight: 900, cursor: 'pointer' };
const smallButtonStyle = { ...buttonStyle, padding: '7px 9px', fontSize: 12 };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800, marginBottom: 12 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const sectionHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 };
const tableStyle = { display: 'grid', overflowX: 'auto' };
const tableHeadStyle = { display: 'grid', gridTemplateColumns: '1.3fr 1fr .7fr .9fr 1.1fr .6fr .6fr .6fr .7fr 1.3fr', gap: 10, padding: '10px 12px', color: 'rgba(255,255,255,.42)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', minWidth: 1040 };
const tableRowStyle = { display: 'grid', gridTemplateColumns: tableHeadStyle.gridTemplateColumns, gap: 10, alignItems: 'center', padding: 12, borderTop: '1px solid rgba(255,255,255,.07)', minWidth: 1040, fontSize: 12 };
