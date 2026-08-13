function formatDate(value, dateOnly = false) {
  if (!value) return 'Dato non disponibile';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Dato non disponibile';
  return dateOnly ? date.toLocaleDateString('it-IT') : date.toLocaleString('it-IT');
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('it-IT');
}

function formatDuration(ms) {
  const minutes = Math.round(Number(ms || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export function FinalDistributionReportView({ report, loading = false }) {
  if (loading) return <div style={emptyStyle}>Caricamento certificazione distribuzione...</div>;
  if (!report) return <div style={emptyStyle}>Report non disponibile.</div>;
  return (
    <div style={shellStyle} data-report-mode="cliente-finale">
      <section style={heroStyle}>
        <div>
          <p style={eyebrowStyle}>Certificazione distribuzione</p>
          <h1 style={titleStyle}>{report.title}</h1>
          <p style={subtitleStyle}>Periodo di lavoro: {formatDate(report.periodStart, true)} – {formatDate(report.periodEnd, true)}</p>
        </div>
        <div style={{ ...statusStyle, ...(report.provisional ? provisionalStyle : completedStyle) }}>
          {report.status}{report.provisional ? ' · Provvisorio' : ''}
        </div>
      </section>

      {report.provisional && <div style={provisionalBannerStyle}>Report provvisorio: la campagna presenta attività o zone non ancora completate.</div>}

      <section style={kpiGridStyle}>
        <Kpi label="Quantità assegnata" value={`${formatNumber(report.totals.quantityAssigned)} volantini`} />
        <Kpi label="Zone completate" value={`${report.totals.zonesCompleted}/${report.totals.zonesTotal}`} />
        <Kpi label="Sessioni" value={report.totals.sessionCount} />
        <Kpi label="Punti GPS registrati" value={formatNumber(report.totals.gpsCount)} />
        <Kpi label="Foto approvate" value={report.totals.photoCount} />
        <Kpi label="Durata registrata" value={formatDuration(report.totals.durationMs)} />
        <Kpi label="Primo avvio" value={formatDate(report.totals.firstStartAt)} />
        <Kpi label="Ultima chiusura" value={formatDate(report.totals.lastClosureAt)} />
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Zone e comuni</p>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead><tr><Th>Zona / comune</Th><Th>Quantità assegnata</Th><Th>Stato</Th><Th>Sessioni</Th><Th>GPS</Th><Th>Periodo operativo</Th></tr></thead>
            <tbody>{report.zones.map((zone, index) => (
              <tr key={`${zone.name}-${index}`}>
                <Td strong>{zone.name}</Td>
                <Td>{formatNumber(zone.quantityAssigned)}</Td>
                <Td><span style={zoneStatusStyle(zone.status)}>{zone.status}</span></Td>
                <Td>{zone.sessionCount}</Td>
                <Td>{formatNumber(zone.gpsCount)}</Td>
                <Td>{formatDate(zone.firstActivityAt)}<br />{formatDate(zone.lastActivityAt)}</Td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section style={twoColumnStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Timeline operativa</p>
          {report.timeline.map((item, index) => <div key={`${item.label}-${index}`} style={timelineStyle}><strong>{item.label}</strong><span>{formatDate(item.at)}</span></div>)}
        </div>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Evidenze per il cliente</p>
          {report.anomalies.length ? report.anomalies.map((item, index) => <div key={index} style={noticeStyle}>{item}</div>) : <div style={successStyle}>Nessuna anomalia utile al cliente rilevata.</div>}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Prove fotografiche approvate</p>
        {report.zones.some((zone) => zone.photos.length) ? report.zones.map((zone, zoneIndex) => zone.photos.length ? (
          <div key={`${zone.name}-${zoneIndex}`} style={photoSectionStyle}>
            <div style={photoHeaderStyle}><strong>{zone.name}</strong><span>{zone.totalPhotoCount} foto</span></div>
            <div style={photoGridStyle}>{zone.photos.map((photo, index) => photo.signedUrl ? (
              <a key={index} href={photo.signedUrl} target="_blank" rel="noreferrer" style={photoLinkStyle}>
                <img src={photo.signedUrl} alt={`Prova distribuzione ${zone.name}`} style={photoStyle} />
                <span>{formatDate(photo.takenAt)}</span>
              </a>
            ) : null)}</div>
            {zone.totalPhotoCount > zone.photos.length && <small style={mutedStyle}>Mostrate 6 anteprime; aprire le immagini per consultare le prove disponibili.</small>}
          </div>
        ) : null) : <div style={emptyStyle}>Nessuna foto approvata disponibile.</div>}
      </section>

      <footer style={footerStyle}>Report generato il {formatDate(report.generatedAt)} · dati operativi VolantiniPro</footer>
    </div>
  );
}

function Kpi({ label, value }) { return <div style={kpiStyle}><span>{label}</span><strong>{value}</strong></div>; }
function Th({ children }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong }) { return <td style={{ ...tdStyle, fontWeight: strong ? 800 : 500 }}>{children}</td>; }
function zoneStatusStyle(status) {
  const color = status === 'Completata' ? ['#dcfce7', '#166534'] : status === 'Parziale' ? ['#ffedd5', '#9a3412'] : ['#e0f2fe', '#075985'];
  return { display: 'inline-block', padding: '5px 9px', borderRadius: 999, background: color[0], color: color[1], fontWeight: 900, whiteSpace: 'nowrap' };
}

const shellStyle = { color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const heroStyle = { display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'start', flexWrap: 'wrap', padding: 22, background: '#fff', border: '1px solid #d7ded9', borderRadius: 14 };
const eyebrowStyle = { margin: '0 0 8px', color: '#e8571a', fontSize: 11, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' };
const titleStyle = { margin: 0, fontSize: 30, lineHeight: 1.15, color: '#17211f' };
const subtitleStyle = { margin: '8px 0 0', color: '#64748b' };
const statusStyle = { padding: '8px 12px', borderRadius: 999, fontWeight: 900 };
const provisionalStyle = { color: '#9a3412', background: '#ffedd5' };
const completedStyle = { color: '#166534', background: '#dcfce7' };
const provisionalBannerStyle = { marginTop: 12, padding: 13, border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412', borderRadius: 10, fontWeight: 800 };
const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 14 };
const kpiStyle = { display: 'grid', gap: 7, minHeight: 74, padding: 14, background: '#fff', border: '1px solid #d7ded9', borderRadius: 10 };
const cardStyle = { padding: 18, marginTop: 14, background: '#fff', border: '1px solid #d7ded9', borderRadius: 12 };
const tableWrapStyle = { overflowX: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', minWidth: 820 };
const thStyle = { padding: '10px 8px', textAlign: 'left', color: '#64748b', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #d7ded9' };
const tdStyle = { padding: '12px 8px', verticalAlign: 'top', borderBottom: '1px solid #edf1ee', color: '#334155', fontSize: 13 };
const twoColumnStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 };
const timelineStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid #edf1ee', color: '#475569' };
const noticeStyle = { padding: 11, marginBottom: 8, borderRadius: 8, background: '#fff7ed', color: '#9a3412' };
const successStyle = { padding: 11, borderRadius: 8, background: '#f0fdf4', color: '#166534' };
const photoSectionStyle = { marginTop: 16 };
const photoHeaderStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: 9, color: '#334155' };
const photoGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 };
const photoLinkStyle = { display: 'grid', gap: 6, color: '#475569', textDecoration: 'none', fontSize: 12 };
const photoStyle = { width: '100%', height: 145, objectFit: 'cover', borderRadius: 9, border: '1px solid #d7ded9' };
const mutedStyle = { display: 'block', marginTop: 8, color: '#64748b' };
const emptyStyle = { padding: 18, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' };
const footerStyle = { padding: '20px 4px', color: '#64748b', fontSize: 12, textAlign: 'center' };
