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

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href="/dashboard" style={brandStyle}>VolantiniPro</a>
          <p style={subtitleStyle}>Report cliente finale basato sui dati operativi registrati.</p>
        </div>
        <button style={buttonStyle} type="button" onClick={downloadPdf} disabled={!state.report || state.loading}>Scarica certificazione PDF</button>
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
const subtitleStyle = { margin: '5px 0 0', color: '#64748b' };
const buttonStyle = { border: 0, borderRadius: 10, padding: '11px 15px', background: '#17211f', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const noticeStyle = { padding: 12, marginBottom: 12, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 10, fontWeight: 800 };
const errorStyle = { ...noticeStyle, borderColor: '#fecaca', background: '#fee2e2', color: '#991b1b' };
