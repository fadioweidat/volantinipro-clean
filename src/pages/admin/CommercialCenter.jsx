import React, { useEffect, useMemo, useState } from 'react';
import { getRealCampaigns } from '../../lib/services/admin-api.js';
import { buildCommercialSnapshot, buildConsultationWhatsAppMessage } from '../../lib/admin/adminCommercialModel.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

function localDateKey(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }

export function CommercialCenter({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, campaigns: [], availability: { campaigns: false } });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getRealCampaigns({ includeTest: true });
        if (!cancelled) setState({ loading: false, error: null, campaigns: result.allRows, availability: result.availability });
      } catch (error) {
        if (!cancelled) setState({ loading: false, error: error?.message || 'Errore caricamento commerciale.', campaigns: [], availability: { campaigns: false } });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const commercial = useMemo(() => buildCommercialSnapshot({ campaigns: state.campaigns, today: localDateKey(new Date()) }), [state.campaigns]);

  function contactQuoteWhatsApp(quote) {
    if (!quote.phone) { setNotice('Numero WhatsApp non disponibile per questo preventivo.'); return; }
    const text = buildConsultationWhatsAppMessage({ name: quote.name, zone: quote.zone });
    window.open(`https://wa.me/${quote.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setNotice('Bozza WhatsApp preparata. Il preventivo non viene segnato come contattato finché non esiste un evento reale.');
  }

  function contactQuoteEmail(quote) {
    if (!quote.email) { setNotice('Email non disponibile per questo preventivo.'); return; }
    const subject = encodeURIComponent(`Preventivo VolantiniPro · ${quote.zone}`);
    const body = encodeURIComponent(`Buongiorno ${quote.name},\n\nho ricevuto la sua richiesta per la distribuzione volantini a ${quote.zone}.\n\nQuando possiamo sentirci?`);
    window.location.href = `mailto:${quote.email}?subject=${subject}&body=${body}`;
    setNotice('Bozza email aperta. Nessuna email è stata registrata come inviata.');
  }

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Commerciale' }];

  return (
    <AdminLayout onNav={onNav} title="Commerciale" subtitle="Preventivi rapidi, consulenze e traffico sito." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento dati commerciali reali...</p>}
      {state.error && <Notice danger>{state.error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <section id="commerciale" className="admin-home__section" aria-labelledby="commercial-title">
        <SectionHeading id="commercial-title" eyebrow="Commerciale" title="Preventivi rapidi" meta={`${commercial.quotes.length} richieste reali`} />
        <div className="admin-home__commercial-metrics" aria-label="Riepilogo preventivi rapidi">
          <Metric label="Nuovi oggi" value={commercial.metrics.newToday} tone="blue" />
          <Metric label="Da contattare" value={commercial.metrics.toContact} tone="yellow" />
          <Metric label="Convertiti" value={commercial.metrics.converted} tone="green" />
          <Metric label="Chiusi" value={commercial.metrics.closed} tone="red" />
        </div>
        {commercial.latest.length === 0 ? <EmptyState text={state.availability.campaigns ? 'Nessun preventivo rapido reale disponibile.' : 'Fonte preventivi non disponibile.'} /> : (
          <div className="admin-home__lead-list">
            {commercial.latest.map((quote) => (
              <article key={quote.id}>
                <div className="admin-home__lead-main">
                  <div><strong>{quote.name}</strong><span>{quote.zone} · {quote.quantity != null ? `${quote.quantity.toLocaleString('it-IT')} volantini` : 'Quantità non disponibile'}</span></div>
                  <span className={`admin-home__lead-state admin-home__lead-state--${quote.state.key}`}>{quote.state.label}</span>
                </div>
                <div className="admin-home__lead-actions">
                  <a href={`/admin/campaigns/${quote.campaignId}/operations`}>Apri campagna</a>
                  {quote.phone && <a href={`tel:${quote.phone}`}>Chiama</a>}
                  <button type="button" onClick={() => contactQuoteWhatsApp(quote)}>WhatsApp</button>
                  <button type="button" onClick={() => contactQuoteEmail(quote)}>Email</button>
                </div>
                <details className="admin-home__access"><summary>Accessi cliente</summary><div><span>Area Cliente <b>{quote.access.customerArea.label}</b></span><span>Tracking <b>{quote.access.tracking.label}</b></span><span>Report <b>{quote.access.report.label}</b></span><span>Foto <b>{quote.access.photos.label}</b></span></div></details>
              </article>
            ))}
          </div>
        )}
        <div className="admin-home__source-note"><strong>Richieste consulenza</strong><span>Fonte non configurata: il form pubblico attuale non persiste richieste. Nessun conteggio viene inventato.</span></div>
      </section>

      <section id="traffico" className="admin-home__section" aria-labelledby="traffic-title">
        <SectionHeading id="traffic-title" eyebrow="Traffico" title="Traffico sito" meta="Analytics non configurata" />
        <div className="admin-home__traffic-grid">
          {['Visitatori oggi', 'Sessioni oggi', 'Preventivi iniziati', 'Preventivi completati', 'Richieste consulenza', 'Conversioni'].map((label) => <article key={label}><strong>—</strong><span>{label}</span></article>)}
        </div>
        <div className="admin-home__source-note"><strong>Dati non disponibili</strong><span>Nessun provider analytics o event store privacy-safe è attivo. Visitatori, sessioni, funnel, top page e attribution restano distinti e non vengono stimati dai record commerciali.</span></div>
      </section>
    </AdminLayout>
  );
}

function SectionHeading({ id, eyebrow, title, meta }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div></header>; }
function EmptyState({ text }) { return <div className="admin-home__empty"><p>{text}</p></div>; }
function Metric({ label, value, tone }) { return <article className={`admin-home__metric admin-home__metric--${tone}`}><strong>{value}</strong><span>{label}</span></article>; }
function Notice({ children, danger = false }) { return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} role={danger ? 'alert' : 'status'}>{children}</div>; }
