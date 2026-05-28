import { useState } from 'react';
import { createCampaign } from '../../lib/services/campaigns-api.js';

const initialForm = {
  client_name: '',
  client_phone: '',
  client_email: '',
  service_type: 'd2d',
  campaign_name: '',
  zone_name: '',
  city: '',
  address: '',
  lat: '',
  lng: '',
  radius_km: '',
  quantity: '',
  start_date: '',
  end_date: '',
  total_amount: '',
  status: 'draft',
  is_test: false,
};

export function NewCampaign() {
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState({ loading: false, error: null, campaign: null });

  async function submit(event) {
    event.preventDefault();
    setState({ loading: true, error: null, campaign: null });
    try {
      const campaign = await createCampaign({
        ...form,
        metadata: {
          created_from: 'admin_campaign_form',
          created_at_browser: new Date().toISOString(),
        },
      });
      setState({ loading: false, error: null, campaign });
    } catch (err) {
      setState({ loading: false, error: err?.message || 'Creazione campagna non riuscita.', campaign: null });
    }
  }

  function patch(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const campaignId = state.campaign?.id;

  return (
    <main style={shellStyle}>
      <header style={headerStyle}>
        <div>
          <a href="/admin" style={brandStyle}>VolantiniPro Admin</a>
          <h1 style={titleStyle}>Nuova campagna reale</h1>
          <p style={mutedStyle}>Inserimento manuale su tabella campaigns. Nessun dato demo o placeholder.</p>
        </div>
        <a href="/admin" style={buttonStyle}>Dashboard</a>
      </header>

      {state.error && <Notice danger text={state.error} />}
      {state.campaign && <Notice text="Campagna reale creata correttamente." />}

      <section style={layoutStyle}>
        <form onSubmit={submit} style={cardStyle}>
          <p style={eyebrowStyle}>Dati cliente</p>
          <div style={gridStyle}>
            <Field label="Nome cliente" required value={form.client_name} onChange={(value) => patch('client_name', value)} />
            <Field label="Telefono" value={form.client_phone} onChange={(value) => patch('client_phone', value)} />
            <Field label="Email" type="email" value={form.client_email} onChange={(value) => patch('client_email', value)} />
          </div>

          <p style={eyebrowBlockStyle}>Campagna</p>
          <div style={gridStyle}>
            <label style={labelStyle}>Servizio
              <select required value={form.service_type} onChange={(event) => patch('service_type', event.target.value)} style={inputStyle}>
                <option value="d2d">D2D</option>
                <option value="h2h">H2H</option>
                <option value="b2b">B2B</option>
              </select>
            </label>
            <Field label="Nome campagna" value={form.campaign_name} onChange={(value) => patch('campaign_name', value)} />
            <Field label="Zona/comune" required value={form.zone_name} onChange={(value) => patch('zone_name', value)} />
            <Field label="Comune" value={form.city} onChange={(value) => patch('city', value)} />
            <Field label="Indirizzo" value={form.address} onChange={(value) => patch('address', value)} />
            <Field label="Quantita volantini" required type="number" value={form.quantity} onChange={(value) => patch('quantity', value)} />
          </div>

          <p style={eyebrowBlockStyle}>Area e pianificazione</p>
          <div style={gridStyle}>
            <Field label="Latitudine" type="number" step="any" value={form.lat} onChange={(value) => patch('lat', value)} />
            <Field label="Longitudine" type="number" step="any" value={form.lng} onChange={(value) => patch('lng', value)} />
            <Field label="Raggio km" type="number" step="0.1" value={form.radius_km} onChange={(value) => patch('radius_km', value)} />
            <Field label="Data inizio" type="date" value={form.start_date} onChange={(value) => patch('start_date', value)} />
            <Field label="Data fine" type="date" value={form.end_date} onChange={(value) => patch('end_date', value)} />
            <Field label="Importo totale" type="number" step="0.01" value={form.total_amount} onChange={(value) => patch('total_amount', value)} />
          </div>

          <p style={eyebrowBlockStyle}>Stato</p>
          <div style={gridStyle}>
            <label style={labelStyle}>Status
              <select value={form.status} onChange={(event) => patch('status', event.target.value)} style={inputStyle}>
                <option value="draft">Pending</option>
                <option value="pending_review">Confirmed</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="problem">Problem</option>
              </select>
            </label>
            <label style={toggleStyle}>
              <input type="checkbox" checked={form.is_test} onChange={(event) => patch('is_test', event.target.checked)} />
              Marca come test
            </label>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={primaryButtonStyle} type="submit" disabled={state.loading}>{state.loading ? 'Creazione...' : 'Crea campagna reale'}</button>
            <button style={buttonStyle} type="button" onClick={() => setForm(initialForm)}>Reset</button>
          </div>
        </form>

        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Link operativi</p>
          {campaignId ? (
            <div style={{ display: 'grid', gap: 10 }}>
              <LinkRow label="Tracking driver" href={`/driver/tracking/${campaignId}`} />
              <LinkRow label="Gruppi" href={`/admin/campaigns/${campaignId}/groups`} />
              <LinkRow label="Operations" href={`/admin/campaigns/${campaignId}/operations`} />
              <LinkRow label="Report cliente" href={`/client/campaigns/${campaignId}/report`} />
            </div>
          ) : (
            <EmptyState text="I link saranno disponibili dopo la creazione della campagna." />
          )}
        </aside>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, step }) {
  return (
    <label style={labelStyle}>{label}
      <input required={required} type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

function LinkRow({ label, href }) {
  const absolute = `${window.location.origin}${href}`;
  async function copy() {
    await navigator.clipboard?.writeText(absolute);
  }
  return (
    <div style={linkRowStyle}>
      <div>
        <strong>{label}</strong>
        <br />
        <a href={href} style={linkStyle}>{absolute}</a>
      </div>
      <button type="button" style={smallButtonStyle} onClick={copy}>Copia</button>
    </div>
  );
}

function Notice({ text, danger }) {
  return <div style={{ ...noticeStyle, borderColor: danger ? '#ef4444' : 'rgba(46,204,138,.24)', color: danger ? '#fecaca' : '#d1fae5' }}>{text}</div>;
}

function EmptyState({ text }) {
  return <div style={emptyStyle}>{text}</div>;
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#07100d', color: 'rgba(255,255,255,.72)', fontFamily: 'Inter, system-ui, sans-serif' };
const headerStyle = { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 };
const brandStyle = { color: '#e8571a', fontWeight: 900, textDecoration: 'none' };
const titleStyle = { margin: '8px 0 4px', fontSize: 34, color: '#fff' };
const mutedStyle = { margin: 0, color: 'rgba(255,255,255,.55)' };
const layoutStyle = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' };
const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, boxShadow: '0 16px 42px rgba(0,0,0,.24)' };
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const eyebrowBlockStyle = { ...eyebrowStyle, marginTop: 18 };
const labelStyle = { display: 'grid', gap: 7, fontSize: 12, fontWeight: 900, color: 'rgba(255,255,255,.58)' };
const inputStyle = { border: '1px solid rgba(255,255,255,.1)', background: 'rgba(0,0,0,.25)', color: '#fff', borderRadius: 9, padding: '10px 11px', font: 'inherit', boxSizing: 'border-box', width: '100%' };
const toggleStyle = { ...labelStyle, display: 'flex', alignItems: 'center', alignSelf: 'end', minHeight: 40 };
const buttonStyle = { border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 13px', color: '#fff', background: 'rgba(255,255,255,.04)', textDecoration: 'none', fontWeight: 900, cursor: 'pointer' };
const primaryButtonStyle = { ...buttonStyle, borderColor: '#e8571a', background: '#e8571a' };
const smallButtonStyle = { ...buttonStyle, padding: '7px 9px', fontSize: 12 };
const noticeStyle = { padding: 12, border: '1px solid', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontWeight: 800, marginBottom: 12 };
const emptyStyle = { padding: 16, border: '1px dashed rgba(255,255,255,.14)', borderRadius: 10, color: 'rgba(255,255,255,.48)' };
const linkRowStyle = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: 12, border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, background: 'rgba(0,0,0,.16)', fontSize: 12 };
const linkStyle = { color: '#e8571a', wordBreak: 'break-all', textDecoration: 'none' };
