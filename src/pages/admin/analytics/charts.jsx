// Analytics Visitatori — grafici SVG/CSS nativi (nessuna chart library).

const AXIS = 'rgba(255,255,255,.14)';
const INK = 'rgba(255,255,255,.82)';
const MUTED = 'rgba(255,255,255,.45)';

export function KpiTile({ label, value, sub, tone = 'default' }) {
  const color = tone === 'good' ? '#4ade80' : tone === 'warn' ? '#fbbf24' : '#fff';
  return (
    <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2, color }}>{value}</div>
      {sub != null && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// serie giornaliera → barre verticali. data: [{ day, value }]
export function BarChart({ data, height = 120, label = 'valore', color = '#60a5fa' }) {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return <Empty />;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const W = Math.max(rows.length * 26, 200);
  const barW = Math.max(6, Math.min(22, (W / rows.length) - 6));
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={height + 26} role="img" aria-label={`${label} per giorno`}>
        <line x1="0" y1={height} x2={W} y2={height} stroke={AXIS} />
        {rows.map((r, i) => {
          const h = (r.value / max) * (height - 8);
          const x = i * (W / rows.length) + ((W / rows.length) - barW) / 2;
          return (
            <g key={r.day || i}>
              <rect x={x} y={height - h} width={barW} height={h} rx="2" fill={color} opacity="0.9">
                <title>{`${r.day}: ${r.value} ${label}`}</title>
              </rect>
              <text x={x + barW / 2} y={height + 14} fontSize="8" fill={MUTED} textAnchor="middle">
                {String(r.day || '').slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// lista a barre orizzontali. items: [{ label, count, pct }]
export function HBarList({ items, unit = '', color = '#818cf8', max = 12, emptyText = 'Nessun dato' }) {
  const rows = (Array.isArray(items) ? items : []).slice(0, max);
  if (rows.length === 0) return <Empty text={emptyText} />;
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map((r, i) => (
        <div key={r.key || r.label || i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 84px', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>{r.label}</span>
          <span style={{ background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 14, position: 'relative' }}>
            <span style={{ position: 'absolute', inset: 0, width: `${(r.count / top) * 100}%`, background: color, borderRadius: 4 }} />
          </span>
          <span style={{ color: MUTED, textAlign: 'right' }}>{r.count.toLocaleString('it-IT')}{unit} · {r.pct}%</span>
        </div>
      ))}
    </div>
  );
}

// funnel: stages [{ label, sessions, ofTotalPct, dropoffPct }]
export function FunnelChart({ stages }) {
  const rows = Array.isArray(stages) ? stages : [];
  if (rows.length === 0) return <Empty />;
  const top = Math.max(1, rows[0].sessions);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {rows.map((s, i) => (
        <div key={s.key || s.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 150px', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: INK }}>{s.label}</span>
          <span style={{ background: 'rgba(255,255,255,.06)', borderRadius: 4, height: 20, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${(s.sessions / top) * 100}%`, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 4 }} />
            <span style={{ position: 'absolute', left: 8, top: 2, fontWeight: 800, color: '#fff' }}>{s.sessions.toLocaleString('it-IT')}</span>
          </span>
          <span style={{ color: MUTED, textAlign: 'right' }}>
            {s.ofTotalPct}% del top
            {i > 0 && s.dropoffPct > 0 && <span style={{ color: '#f87171' }}> · −{s.dropoffPct}%</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ text = 'Nessun dato nel periodo selezionato.' }) {
  return <p style={{ fontSize: 12, color: MUTED, margin: '6px 0' }}>{text}</p>;
}

export const analyticsPanelStyle = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 12,
  padding: 14,
  color: '#fff',
};
export const analyticsHeadingStyle = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.5)',
};
