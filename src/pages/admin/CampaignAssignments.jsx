import { useEffect, useState, useCallback } from 'react';
import {
  listCampaignAssignments,
  revokeOperatorAssignment,
  updateOperatorAssignment,
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
  getAssignedZones,
} from '../../lib/services/admin-api.js';
import { getCampaignRecord } from '../../lib/services/gps-api.js';

// ─── CampaignAssignments ──────────────────────────────────────────────────────
// Lista tutte le assegnazioni di una campagna con azioni admin:
// revoca, modifica scadenza, copia link, invio WhatsApp.
// Navigazione da: /admin/campaigns/{id}/assignments

export function CampaignAssignments({ campaignId }) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    assignments: [],
    campaign: null,
    notice: '',
  });
  const [editingId, setEditingId] = useState(null);
  const [editEndsAt, setEditEndsAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async (cancelledRef = { current: false }) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const [assignments, campaign] = await Promise.all([
        listCampaignAssignments(campaignId).catch(() => []),
        getCampaignRecord(campaignId).catch(() => null),
      ]);
      if (!cancelledRef.current) {
        setState(prev => ({ ...prev, loading: false, assignments, campaign, notice: '' }));
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setState(prev => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento assegnazioni.' }));
      }
    }
  }, [campaignId]);

  useEffect(() => {
    const ref = { current: false };
    load(ref);
    const timer = window.setInterval(() => load(ref), 30000);
    return () => {
      ref.current = true;
      window.clearInterval(timer);
    };
  }, [load]);

  const { assignments, campaign } = state;
  const campaignTitle = campaign?.title || campaign?.campaign_name || campaign?.nome || `Campagna ${String(campaignId).slice(0, 8)}`;

  const filteredAssignments = statusFilter === 'all'
    ? assignments
    : assignments.filter(a => a.status === statusFilter);

  const statusCounts = assignments.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  async function handleRevoke(id) {
    if (!window.confirm('Revocare questa assegnazione? Il driver non potrà più avviare sessioni GPS.')) return;
    setSaving(true);
    try {
      await revokeOperatorAssignment(id);
      setState(prev => ({
        ...prev,
        notice: 'Assegnazione revocata con successo.',
        assignments: prev.assignments.map(a =>
          a.id === id ? { ...a, status: 'revoked' } : a
        ),
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: err?.message || 'Errore revoca.' }));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateEndsAt(id) {
    if (!editEndsAt) return;
    setSaving(true);
    try {
      await updateOperatorAssignment(id, { ends_at: new Date(editEndsAt).toISOString() });
      setState(prev => ({
        ...prev,
        notice: 'Scadenza aggiornata.',
        assignments: prev.assignments.map(a =>
          a.id === id ? { ...a, ends_at: new Date(editEndsAt).toISOString() } : a
        ),
      }));
      setEditingId(null);
      setEditEndsAt('');
    } catch (err) {
      setState(prev => ({ ...prev, error: err?.message || 'Errore aggiornamento scadenza.' }));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink(assignment) {
    const link = generateDriverAssignmentLink(assignment.id);
    await navigator.clipboard?.writeText(link);
    setCopiedId(assignment.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleWhatsApp(assignment) {
    const meta = safeJson(assignment.metadata);
    const link = generateDriverAssignmentLink(assignment.id);
    const phone = assignment.operator_phone?.replace(/[^\d+]/g, '') || '';
    const msg = buildDriverWhatsAppMessage({
      operatorName: assignment.operator_name || 'Operatore',
      campaignTitle,
      date: assignment.starts_at
        ? new Date(assignment.starts_at).toLocaleDateString('it-IT')
        : 'Da definire',
      comuni: meta.comuni || [],
      zone: meta.zone_labels || [],
      qty: meta.qty || null,
      link,
    });
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <main style={shellStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <div>
          <a href="/admin" style={brandStyle}>VolantiniPro Admin</a>
          <h1 style={titleStyle}>Assegnazioni lavoro</h1>
          <p style={mutedStyle}>{campaignTitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
          <a style={primaryBtnStyle} href={`/admin/campaigns/${campaignId}/assignments/new`}>
            + Assegna lavoro
          </a>
          <a style={secondaryBtnStyle} href={`/admin/campaigns/${campaignId}/groups`}>Gruppi</a>
          <a style={secondaryBtnStyle} href={`/admin/campaigns/${campaignId}/operations`}>Operazioni</a>
          <a style={secondaryBtnStyle} href={`/admin/campaigns/${campaignId}/report`}>Report</a>
        </div>
      </header>

      {state.loading && <Notice text="Caricamento assegnazioni..." />}
      {state.error && <Notice danger text={state.error} />}
      {state.notice && <Notice text={state.notice} />}

      {/* KPI strip */}
      <section style={kpiGridStyle}>
        <Kpi label="Totale" value={assignments.length} />
        <Kpi label="Attive" value={statusCounts.active || 0} color="#2ecc8a" />
        <Kpi label="Revocate" value={statusCounts.revoked || 0} color="#ef4444" />
        <Kpi label="Completate" value={statusCounts.completed || 0} color="#60a5fa" />
      </section>

      {/* Filter bar */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtra per stato</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', 'active', 'revoked', 'completed'].map(s => (
            <button
              key={s}
              type="button"
              style={statusFilter === s ? activeChipStyle : chipStyle}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Tutti' : s}
              {s !== 'all' && statusCounts[s] ? ` (${statusCounts[s]})` : ''}
            </button>
          ))}
        </div>
      </section>

      {/* Assignments list */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Assegnazioni ({filteredAssignments.length})</p>

        {filteredAssignments.length === 0 ? (
          <EmptyState text={
            assignments.length === 0
              ? 'Nessuna assegnazione per questa campagna. Usa "+ Assegna lavoro" per iniziare.'
              : 'Nessuna assegnazione corrisponde al filtro selezionato.'
          } />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredAssignments.map(a => {
              const meta = safeJson(a.metadata);
              const link = generateDriverAssignmentLink(a.id);
              const isExpired = a.ends_at && new Date(a.ends_at) < new Date();
              const effectiveStatus = a.status === 'active' && isExpired ? 'expired' : a.status;

              return (
                <div key={a.id} style={{
                  ...assignmentCardStyle,
                  borderLeftColor: statusColor(effectiveStatus),
                }}>
                  {/* Row 1: name + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ color: '#fff', fontSize: 15 }}>
                        {a.operator_name || `Operatore ${String(a.operator_id || '').slice(0, 8)}`}
                      </strong>
                      {a.operator_phone && (
                        <span style={{ marginLeft: 10, color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
                          {a.operator_phone}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={effectiveStatus} />
                  </div>

                  {/* Row 2: comuni, zone, qty */}
                  <div style={metaRowStyle}>
                    {meta.comuni?.length > 0 && (
                      <MetaChip icon="📍" label={meta.comuni.join(', ')} />
                    )}
                    {meta.zone_labels?.length > 0 && (
                      <MetaChip icon="🗂" label={meta.zone_labels.join(', ')} />
                    )}
                    {meta.qty && (
                      <MetaChip icon="📦" label={`${Number(meta.qty).toLocaleString('it-IT')} volantini`} />
                    )}
                  </div>

                  {/* Row 3: date */}
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span>Inizio: {a.starts_at ? new Date(a.starts_at).toLocaleString('it-IT') : 'Immediato'}</span>
                    {editingId === a.id ? (
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        Scadenza:
                        <input
                          type="datetime-local"
                          value={editEndsAt}
                          onChange={e => setEditEndsAt(e.target.value)}
                          style={{ ...inputStyle, fontSize: 11, padding: '4px 8px', minWidth: 200 }}
                        />
                        <button
                          type="button"
                          style={{ ...smallBtnStyle, background: '#2ecc8a', border: 'none', color: '#fff' }}
                          disabled={saving}
                          onClick={() => handleUpdateEndsAt(a.id)}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          style={smallBtnStyle}
                          onClick={() => { setEditingId(null); setEditEndsAt(''); }}
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <span style={{ cursor: 'pointer' }} onClick={() => {
                        setEditingId(a.id);
                        setEditEndsAt(a.ends_at ? new Date(a.ends_at).toISOString().slice(0, 16) : '');
                      }}>
                        Scadenza: {a.ends_at
                          ? <>{new Date(a.ends_at).toLocaleString('it-IT')} <span style={{ color: '#e8571a' }}>✎</span></>
                          : <span style={{ color: '#e8571a' }}>Nessuna — clicca per aggiungere</span>
                        }
                      </span>
                    )}
                    <span>Creata: {new Date(a.created_at).toLocaleDateString('it-IT')}</span>
                  </div>

                  {/* Row 4: link box */}
                  <div style={linkMiniBoxStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,.5)', wordBreak: 'break-all' }}>
                      {link}
                    </span>
                  </div>

                  {/* Row 5: actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                    <button
                      type="button"
                      style={smallBtnStyle}
                      onClick={() => handleCopyLink(a)}
                    >
                      {copiedId === a.id ? '✓ Copiato!' : '📋 Copia link'}
                    </button>
                    <button
                      type="button"
                      style={{ ...smallBtnStyle, background: 'rgba(37,211,102,.12)', borderColor: 'rgba(37,211,102,.35)' }}
                      onClick={() => handleWhatsApp(a)}
                    >
                      📱 WhatsApp
                    </button>
                    <a
                      style={smallBtnStyle}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      👁 Anteprima driver
                    </a>
                    {meta.notes && (
                      <span style={{ ...smallBtnStyle, cursor: 'default', color: 'rgba(255,255,255,.5)' }}>
                        📝 {meta.notes.slice(0, 40)}{meta.notes.length > 40 ? '…' : ''}
                      </span>
                    )}
                    {a.status === 'active' && (
                      <button
                        type="button"
                        style={{ ...smallBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,.35)' }}
                        disabled={saving}
                        onClick={() => handleRevoke(a.id)}
                      >
                        🚫 Revoca
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active:    { label: 'Attiva',    color: '#2ecc8a' },
    revoked:   { label: 'Revocata',  color: '#ef4444' },
    completed: { label: 'Completata', color: '#60a5fa' },
    expired:   { label: 'Scaduta',   color: '#fbbf24' },
    draft:     { label: 'Bozza',     color: 'rgba(255,255,255,.45)' },
  };
  const cfg = map[status] || { label: status, color: 'rgba(255,255,255,.45)' };
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 900,
      color: cfg.color,
      border: `1px solid ${cfg.color}55`,
      borderRadius: 999,
      padding: '3px 10px',
    }}>
      {cfg.label}
    </span>
  );
}

function MetaChip({ icon, label }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      color: 'rgba(255,255,255,.7)',
      background: 'rgba(255,255,255,.06)',
      border: '1px solid rgba(255,255,255,.1)',
      borderRadius: 999,
      padding: '3px 10px',
    }}>
      {icon} {label}
    </span>
  );
}

function Kpi({ label, value, color = '#e8571a' }) {
  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>{label}</p>
      <strong style={{ color, fontSize: 26 }}>{value}</strong>
    </div>
  );
}

function Notice({ text, danger }) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 12,
      border: `1px solid ${danger ? 'rgba(239,68,68,.35)' : 'rgba(46,204,138,.28)'}`,
      background: danger ? 'rgba(239,68,68,.06)' : 'rgba(46,204,138,.05)',
      color: danger ? '#fca5a5' : '#86efac',
      fontWeight: 750,
      fontSize: 13,
      marginBottom: 12,
    }}>
      {text}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{
      padding: 24,
      border: '1px dashed rgba(255,255,255,.14)',
      borderRadius: 12,
      color: 'rgba(255,255,255,.48)',
      textAlign: 'center',
      fontSize: 13,
    }}>
      {text}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s) {
  if (s === 'active')    return '#2ecc8a';
  if (s === 'revoked')   return '#ef4444';
  if (s === 'completed') return '#60a5fa';
  if (s === 'expired')   return '#fbbf24';
  return 'rgba(255,255,255,.2)';
}

function safeJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shellStyle = {
  minHeight: '100vh',
  padding: 24,
  background: '#0B192C',
  color: 'rgba(255,255,255,.85)',
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
};
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 22,
};
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none', fontSize: 13 };
const titleStyle = {
  margin: '8px 0 4px',
  fontSize: 28,
  color: '#fff',
  fontFamily: "'DM Serif Display', Georgia, serif",
};
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.45)', fontSize: 12 };
const cardStyle = {
  background: 'rgba(18, 32, 54, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 16,
  padding: 20,
  marginBottom: 16,
  boxShadow: '0 16px 42px rgba(0,0,0,.24)',
};
const kpiGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
  marginBottom: 16,
};
const eyebrowStyle = {
  margin: '0 0 8px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.12em',
  color: 'rgba(255,255,255,.45)',
  fontWeight: 900,
};
const assignmentCardStyle = {
  display: 'grid',
  gap: 8,
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,.09)',
  borderLeft: '4px solid',
  background: 'rgba(255,255,255,.03)',
};
const metaRowStyle = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
};
const linkMiniBoxStyle = {
  padding: '8px 10px',
  background: 'rgba(232,87,26,.06)',
  borderRadius: 8,
  border: '1px solid rgba(232,87,26,.2)',
};
const inputStyle = {
  background: '#0d1e30',
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 8,
  padding: '8px 11px',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
};
const primaryBtnStyle = {
  minHeight: 42,
  border: 'none',
  borderRadius: 10,
  padding: '0 18px',
  background: '#e8571a',
  color: '#fff',
  fontWeight: 900,
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};
const secondaryBtnStyle = {
  minHeight: 40,
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 10,
  padding: '0 14px',
  background: 'rgba(255,255,255,.05)',
  color: '#fff',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};
const smallBtnStyle = {
  border: '1px solid rgba(255,255,255,.12)',
  borderRadius: 8,
  padding: '5px 11px',
  background: 'rgba(255,255,255,.04)',
  color: 'rgba(255,255,255,.8)',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};
const chipStyle = {
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 999,
  padding: '5px 14px',
  background: 'rgba(255,255,255,.04)',
  color: 'rgba(255,255,255,.7)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};
const activeChipStyle = {
  ...chipStyle,
  background: 'rgba(232,87,26,.14)',
  border: '1px solid rgba(232,87,26,.6)',
  color: '#e8571a',
};
