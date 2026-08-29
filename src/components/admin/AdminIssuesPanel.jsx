import { useCallback, useEffect, useState } from 'react';
import { adminListIssues, adminRouteIssue, ISSUE_STATUS_LABELS } from '../../lib/services/customer-issues-api.js';
import { listCampaignAssignments } from '../../lib/services/admin-api.js';

// Admin: tutte le segnalazioni della campagna — responsabile, stato, tempo
// aperto, risoluzione. L'Admin NON e' il passaggio obbligatorio (il routing
// e' automatico), ma vede tutto e puo' instradare le issue in coda.
export function AdminIssuesPanel({ campaignId }) {
  const [issues, setIssues] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [rows, ass] = await Promise.all([
        adminListIssues(campaignId),
        listCampaignAssignments(campaignId).catch(() => []),
      ]);
      setIssues(Array.isArray(rows) ? rows : []);
      setAssignments(Array.isArray(ass) ? ass : []);
    } catch (e) {
      setError(e?.message || 'Segnalazioni non disponibili.');
    }
  }, [campaignId]);

  useEffect(() => { reload(); }, [reload]);

  const route = async (issueId, assignmentId) => {
    if (!assignmentId) return;
    setBusyId(issueId); setError(null);
    try {
      await adminRouteIssue(issueId, assignmentId);
      await reload();
    } catch (e) {
      setError(e?.message || 'Instradamento non riuscito.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section style={cardStyle}>
      <p style={eyebrowStyle}>Segnalazioni cliente ({issues.length})</p>
      {error && <div style={errStyle}>{error}</div>}
      {issues.length === 0 && <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>Nessuna segnalazione.</p>}
      {issues.map((i) => (
        <div key={i.id} style={rowStyle}>
          <div style={{ minWidth: 0 }}>
            <strong>{i.municipality} — {i.street} {i.house_number || ''}</strong>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              {ISSUE_STATUS_LABELS[i.status] || i.status} · {i.routed_to === 'driver' ? 'assegnata' : 'coda Admin'}
              {' · aperta da '}{Math.round((i.open_seconds || 0) / 60)} min
              {i.resolved_at ? ` · risolta ${new Date(i.resolved_at).toLocaleString('it-IT')}` : ''}
            </div>
          </div>
          {i.routed_to !== 'driver' && (i.status === 'new' || i.status === 'assigned') && (
            <select
              defaultValue=""
              disabled={busyId === i.id}
              onChange={(e) => route(i.id, e.target.value)}
              style={selectStyle}
            >
              <option value="" disabled>Instrada a…</option>
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>{a.operator_name || a.participant_label || a.id.slice(0, 8)}</option>
              ))}
            </select>
          )}
        </div>
      ))}
    </section>
  );
}

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 18, marginTop: 14, color: '#fff' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const rowStyle = { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 10, borderTop: '1px solid rgba(255,255,255,.07)', fontSize: 13 };
const errStyle = { padding: 10, borderRadius: 8, color: '#fecaca', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', marginBottom: 8, fontSize: 12 };
const selectStyle = { background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 6, color: '#fff', padding: '6px 8px', fontSize: 12 };
