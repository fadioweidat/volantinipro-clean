import { useEffect, useState } from 'react';
import { FinalDistributionReportView } from '../../components/reports/FinalDistributionReportView.jsx';
import { downloadFinalDistributionPdf } from '../../lib/pdf/generateFinalDistributionPdf.js';
import { getFinalDistributionReport } from '../../lib/services/final-report-api.js';

export function ClientCampaignReport({ campaignId }) {
  const [state, setState] = useState({ loading: true, report: null, error: null, notice: '' });

  useEffect(() => {
    let cancelled = false;
    getFinalDistributionReport(campaignId, { customerOwned: true })
      .then((report) => { if (!cancelled) setState({ loading: false, report, error: null, notice: '' }); })
      .catch((error) => { if (!cancelled) setState({ loading: false, report: null, error: error?.message || 'Report campagna non disponibile.', notice: '' }); });
    return () => { cancelled = true; };
  }, [campaignId]);

  async function downloadPdf() {
    if (!state.report) return;
    try {
      setState((previous) => ({ ...previous, notice: 'Generazione PDF in corso...' }));
      await downloadFinalDistributionPdf(state.report, 'certificazione-distribuzione-volantinipro.pdf', {
        onProgress: (message) => setState((previous) => ({ ...previous, notice: message })),
      });
      setState((previous) => ({ ...previous, notice: 'PDF scaricato.' }));
    } catch (error) {
      setState((previous) => ({ ...previous, notice: '', error: error?.message || 'Impossibile generare il PDF.' }));
    }
  }

  const campaignTitle = state.report?.campaign_name || state.report?.campaign_title || state.report?.title || 'Campagna';
  const campaignHref = `/campagna/${campaignId}`;

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <nav aria-label="Breadcrumbs" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6, fontSize: 13 }}>
            <a href="/dashboard" style={breadcrumbLinkStyle}>Dashboard Cliente</a>
            <span style={{ color: '#94a3b8' }}>›</span>
            <a href={campaignHref} style={breadcrumbLinkStyle}>Campagna {campaignTitle}</a>
            <span style={{ color: '#94a3b8' }}>›</span>
            <span style={{ color: '#0f172a', fontWeight: 700 }}>Report Certificato</span>
          </nav>
          <a href="/dashboard" style={brandStyle}>VolantiniPro</a>
          <p style={subtitleStyle}>Report cliente finale basato sui dati operativi registrati.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <a href={campaignHref} style={secondaryNavBtnStyle}>← Torna alla campagna</a>
          <a href="/dashboard" style={secondaryNavBtnStyle}>⌂ Dashboard</a>
          <button style={buttonStyle} type="button" onClick={downloadPdf} disabled={!state.report || state.loading}>
            Scarica certificazione PDF
          </button>
        </div>
      </header>
      {state.error && <div style={errorStyle}>{state.error}</div>}
      {state.notice && <div style={noticeStyle}>{state.notice}</div>}
      <FinalDistributionReportView report={state.report} loading={state.loading} />
    </main>
  );
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#eef2ef', color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 };
const brandStyle = { color: '#e8571a', fontSize: 20, fontWeight: 900, textDecoration: 'none' };
const breadcrumbLinkStyle = { color: '#64748b', textDecoration: 'none', fontWeight: 600 };
const subtitleStyle = { margin: '5px 0 0', color: '#64748b' };
const buttonStyle = { border: 0, borderRadius: 10, padding: '11px 15px', background: '#17211f', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryNavBtnStyle = { display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff', color: '#1e293b', fontWeight: 700, textDecoration: 'none', fontSize: 13 };
const noticeStyle = { padding: 12, marginBottom: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 10, fontWeight: 800 };
const errorStyle = { ...noticeStyle, borderColor: '#fecaca', background: '#fee2e2', color: '#991b1b' };
