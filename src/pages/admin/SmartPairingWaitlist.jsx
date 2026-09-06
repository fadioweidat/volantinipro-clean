import React, { useEffect, useMemo, useState } from 'react';
import {
  adminGetSmartPairingRequests,
  adminUpdateSmartPairingStatus,
} from '../../lib/services/admin-api.js';
import { AdminLayout } from './AdminLayout.jsx';
import './admin-dashboard.css';

const EMPTY = 'Dato non disponibile';

const SERVICE_LABELS = {
  d2d: 'Door to Door',
  h2h: 'Hand to Hand',
  b2b: 'Business Distribution',
  enterprise: 'Enterprise',
};

const SERVICE_COLORS = {
  d2d: { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', text: '#93c5fd' },
  h2h: { bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)', text: '#d8b4fe' },
  b2b: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: '#6ee7b7' },
  enterprise: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: '#fcd34d' },
};

const STATUS_CONFIG = {
  open: { label: 'Da gestire', tone: 'yellow', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.3)', text: '#fde68a' },
  reviewing: { label: 'In valutazione', tone: 'blue', bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.3)', text: '#bfdbfe' },
  proposal_sent: { label: 'Proposta inviata', tone: 'cyan', bg: 'rgba(34, 211, 238, 0.12)', border: 'rgba(34, 211, 238, 0.3)', text: '#a5f3fc' },
  accepted: { label: 'Accettata / Abbinata', tone: 'green', bg: 'rgba(46, 204, 138, 0.12)', border: 'rgba(46, 204, 138, 0.3)', text: '#86efac' },
  rejected: { label: 'Rifiutata / Non comp.', tone: 'red', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: '#fca5a5' },
  closed: { label: 'Chiusa', tone: 'gray', bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.16)', text: 'rgba(255, 255, 255, 0.6)' },
};

export function SmartPairingWaitlist({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, rows: [], available: false });
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [actionNotice, setActionNotice] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [confirmCloseRequest, setConfirmCloseRequest] = useState(null);
  const [editNote, setEditNote] = useState('');

  async function loadRequests() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await adminGetSmartPairingRequests();
      setState({
        loading: false,
        error: null,
        rows: result.rows || [],
        available: result.available,
      });
    } catch (error) {
      setState({
        loading: false,
        error: error?.message || 'Errore caricamento richieste Smart Pairing.',
        rows: [],
        available: false,
      });
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  const counts = useMemo(() => {
    const rows = state.rows;
    return {
      open: rows.filter((r) => r.status === 'open' || !r.gestita).length,
      in_progress: rows.filter((r) => ['reviewing', 'proposal_sent'].includes(r.status)).length,
      closed: rows.filter((r) => ['accepted', 'rejected', 'closed'].includes(r.status) || r.gestita).length,
      all: rows.length,
      withMatches: rows.filter((r) => r.matchingCampaigns && r.matchingCampaigns.length > 0).length,
    };
  }, [state.rows]);

  const filtered = useMemo(() => {
    let list = state.rows;
    if (filter === 'open') {
      list = list.filter((r) => r.status === 'open' || !r.gestita);
    } else if (filter === 'in_progress') {
      list = list.filter((r) => ['reviewing', 'proposal_sent'].includes(r.status));
    } else if (filter === 'closed') {
      list = list.filter((r) => ['accepted', 'rejected', 'closed'].includes(r.status) || r.gestita);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => {
        return (
          (r.nome && r.nome.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          (r.comune && r.comune.toLowerCase().includes(q)) ||
          (r.note && r.note.toLowerCase().includes(q)) ||
          (r.quoteId && r.quoteId.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [state.rows, filter, search]);

  async function handleStatusChange(rowId, newStatus) {
    setUpdatingId(rowId);
    setActionNotice(null);
    try {
      await adminUpdateSmartPairingStatus(rowId, { status: newStatus });
      setActionNotice({ type: 'success', text: `Stato aggiornato a "${STATUS_CONFIG[newStatus]?.label || newStatus}".` });
      // Aggiorna stato locale ottimistico
      setState((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => {
          if (r.id === rowId) {
            const isClosed = ['accepted', 'rejected', 'closed'].includes(newStatus);
            return {
              ...r,
              status: newStatus,
              gestita: isClosed,
              gestitaAt: isClosed ? new Date().toISOString() : r.gestitaAt,
            };
          }
          return r;
        }),
      }));
    } catch (err) {
      setActionNotice({ type: 'danger', text: err?.message || 'Aggiornamento stato non riuscito.' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleSaveModal() {
    if (!selectedRequest) return;
    setUpdatingId(selectedRequest.id);
    try {
      await adminUpdateSmartPairingStatus(selectedRequest.id, {
        note: editNote,
        status: selectedRequest.status,
      });
      setActionNotice({ type: 'success', text: 'Dettagli e note aggiornati.' });
      setState((prev) => ({
        ...prev,
        rows: prev.rows.map((r) => (r.id === selectedRequest.id ? { ...r, note: editNote } : r)),
      }));
      setSelectedRequest(null);
    } catch (err) {
      setActionNotice({ type: 'danger', text: err?.message || 'Salvataggio note non riuscito.' });
    } finally {
      setUpdatingId(null);
    }
  }

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Smart Pairing' }];

  return (
    <AdminLayout
      onNav={onNav}
      title="Smart Pairing"
      subtitle="Richieste reali di abbinamento, verifica compatibilità territoriale e gestione contatti."
      breadcrumbs={breadcrumbs}
    >
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)', marginBottom: 16 }}>Caricamento richieste Smart Pairing...</p>}
      {state.error && <Notice danger>{state.error}</Notice>}
      {actionNotice && <Notice danger={actionNotice.type === 'danger'}>{actionNotice.text}</Notice>}

      {/* KPI METRICS BANNER */}
      <div className="admin-home__metrics" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <article className="admin-home__metric">
          <strong>{counts.all}</strong>
          <span>Richieste Totali</span>
        </article>
        <article className="admin-home__metric admin-home__metric--yellow">
          <strong>{counts.open}</strong>
          <span>Da Gestire</span>
        </article>
        <article className="admin-home__metric admin-home__metric--blue">
          <strong>{counts.withMatches}</strong>
          <span>Con Campagne Compatibili</span>
        </article>
        <article className="admin-home__metric admin-home__metric--green">
          <strong>{counts.closed}</strong>
          <span>Gestite</span>
        </article>
      </div>

      {/* FILTER TABS & SEARCH */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="admin-home__quick" role="tablist" aria-label="Filtro richieste" style={{ margin: 0 }}>
          {[
            ['open', `Da gestire (${counts.open})`],
            ['in_progress', `In valutazione (${counts.in_progress})`],
            ['closed', `Gestite (${counts.closed})`],
            ['all', `Tutte (${counts.all})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'admin-home__primary' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '1 1 280px', maxWidth: 420 }}>
          <input
            type="text"
            placeholder="Cerca per nome, email, telefono, comune..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              minHeight: 40,
              padding: '0 12px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(5, 14, 22, 0.6)',
              color: '#fff',
              fontSize: 13,
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                minHeight: 40,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={loadRequests}
            title="Ricarica richieste"
            style={{
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* REQUESTS LIST */}
      <section className="admin-home__section" aria-labelledby="pairing-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 id="pairing-title" style={{ margin: 0, color: '#fff', font: '500 22px "DM Serif Display",Georgia,serif' }}>
            {filtered.length} {filtered.length === 1 ? 'richiesta' : 'richieste'}
          </h2>
          {search && (
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              Filtro ricerca: &ldquo;{search}&rdquo;
            </span>
          )}
        </div>

        {!state.available ? (
          <EmptyState text="Tabella smart_pairing_waitlist non disponibile." />
        ) : filtered.length === 0 ? (
          <EmptyState
            text={
              search
                ? `Nessuna richiesta trovata per "${search}".`
                : filter === 'open'
                ? 'Nessuna richiesta in attesa da gestire.'
                : 'Nessuna richiesta presente in questa vista.'
            }
          />
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {filtered.map((req) => {
              const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.open;
              const serviceCfg = SERVICE_COLORS[req.service] || SERVICE_COLORS.d2d;
              const serviceLabel = SERVICE_LABELS[req.service] || req.service?.toUpperCase();
              const formattedDate = req.createdAt
                ? new Date(req.createdAt).toLocaleString('it-IT', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : EMPTY;

              const cleanPhone = req.phone ? String(req.phone).replace(/[^\d+]/g, '') : null;
              const waText = encodeURIComponent(
                `Gentile ${req.nome || 'Cliente'}, la contattiamo da VolantiniPro in merito alla sua richiesta di distribuzione Smart Pairing per la zona di ${req.comune} (${serviceLabel}). Abbiamo novità e disponibilità per la sua campagna.`
              );
              const mailSubject = encodeURIComponent(`VolantiniPro - Richiesta Smart Pairing a ${req.comune}`);
              const mailBody = encodeURIComponent(
                `Gentile ${req.nome || 'Cliente'},\n\nLa contattiamo da VolantiniPro in merito alla sua richiesta di abbinamento Smart Pairing per il servizio ${serviceLabel} nella zona di ${req.comune}.\n\nPeriodo richiesto: ${req.datePreferite}\n\nRestiamo a disposizione per concordare i dettagli operativi.\n\nCordiali saluti,\nTeam VolantiniPro`
              );

              return (
                <article
                  key={req.id}
                  style={{
                    padding: 18,
                    borderRadius: 14,
                    background: 'rgba(5, 14, 22, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.09)',
                    display: 'grid',
                    gap: 12,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  }}
                >
                  {/* CARD HEADER */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ color: '#fff', fontSize: 17, fontWeight: 700 }}>
                          {req.nome || 'Utente senza nome'}
                        </strong>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: serviceCfg.bg,
                            border: `1px solid ${serviceCfg.border}`,
                            color: serviceCfg.text,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {serviceLabel}
                        </span>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                        Ricevuta il {formattedDate}
                        {req.quoteId && ` · Preventivo: ${req.quoteId}`}
                      </div>
                    </div>

                    {/* STATUS BADGE & SELECT */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: statusCfg.bg,
                          border: `1px solid ${statusCfg.border}`,
                          color: statusCfg.text,
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: statusCfg.text,
                          }}
                        />
                        {statusCfg.label}
                      </span>

                      <select
                        value={req.status}
                        disabled={updatingId === req.id}
                        onChange={(e) => handleStatusChange(req.id, e.target.value)}
                        style={{
                          minHeight: 32,
                          padding: '0 8px',
                          borderRadius: 7,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: '#0a151f',
                          color: '#fff',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="open">Da gestire</option>
                        <option value="reviewing">In valutazione</option>
                        <option value="proposal_sent">Proposta inviata</option>
                        <option value="accepted">Accettata</option>
                        <option value="rejected">Rifiutata</option>
                        <option value="closed">Chiusa</option>
                      </select>
                    </div>
                  </div>

                  {/* DATA GRID */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                      gap: 10,
                      padding: 12,
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div>
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Città / Comune
                      </span>
                      <strong style={{ color: '#fff', fontSize: 13 }}>
                        📍 {req.comune || EMPTY}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Periodo Richiesto
                      </span>
                      <strong style={{ color: '#fff', fontSize: 13 }}>
                        📅 {req.datePreferite || 'Periodo non specificato'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Quantità Volantini
                      </span>
                      <strong style={{ color: '#fff', fontSize: 13 }}>
                        📦 {req.quantity ? `${req.quantity.toLocaleString('it-IT')} pz` : 'Da concordare'}
                      </strong>
                    </div>

                    <div>
                      <span style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Contatti
                      </span>
                      <div style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>
                        {req.email ? <div>✉️ {req.email}</div> : null}
                        {req.phone ? <div>📞 {req.phone}</div> : null}
                      </div>
                    </div>
                  </div>

                  {/* COMPATIBILITY BANNER */}
                  {req.matchingCampaigns && req.matchingCampaigns.length > 0 ? (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 9,
                        background: 'rgba(46, 204, 138, 0.08)',
                        border: '1px solid rgba(46, 204, 138, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ color: '#a7f3d0', fontSize: 12 }}>
                        <strong>✨ {req.matchingCampaigns.length} campagna compatibile rilevata:</strong>{' '}
                        {req.matchingCampaigns.map((c) => `${c.title} (${c.zone}${c.date ? ` · ${c.date}` : ''})`).join(', ')}
                      </div>
                      <span style={{ color: '#86efac', fontSize: 11, fontWeight: 700 }}>
                        Abbinamento pronto
                      </span>
                    </div>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                      Nessuna campagna attiva contemporanea rilevata per &ldquo;{req.comune}&rdquo;.
                    </div>
                  )}

                  {/* NOTE UTENTE */}
                  {req.note && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px dashed rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginRight: 6 }}>Note:</span>
                      {req.note}
                    </div>
                  )}

                  {/* ACTION BUTTONS */}
                  <div className="admin-home__lead-actions" style={{ marginTop: 4 }}>
                    {cleanPhone && (
                      <a href={`tel:${cleanPhone}`} style={{ background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)', color: '#93c5fd' }}>
                        📞 Chiama
                      </a>
                    )}
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/${cleanPhone.replace('+', '')}?text=${waText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: 'rgba(46,204,138,0.1)', borderColor: 'rgba(46,204,138,0.25)', color: '#86efac' }}
                      >
                        💬 WhatsApp
                      </a>
                    )}
                    {req.email && (
                      <a
                        href={`mailto:${req.email}?subject=${mailSubject}&body=${mailBody}`}
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        ✉️ Email
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequest(req);
                        setEditNote(req.note || '');
                      }}
                      style={{ marginLeft: 'auto', background: 'rgba(232,87,26,0.1)', borderColor: 'rgba(232,87,26,0.3)', color: '#ff9d70' }}
                    >
                      📝 Modifica / Note interne
                    </button>
                    {req.status !== 'closed' && (
                      <button
                        type="button"
                        onClick={() => setConfirmCloseRequest(req)}
                        style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', color: '#fca5a5' }}
                      >
                        🗑 Chiudi / Archivia
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL CONFERMA CHIUSURA / RIMOZIONE */}
      {confirmCloseRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setConfirmCloseRequest(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              background: '#0b1420',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', color: '#fff', fontSize: 18 }}>
              Chiudere e archiviare questa richiesta?
            </h3>
            <p style={{ margin: '0 0 16px', color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.4 }}>
              La richiesta di <strong>{confirmCloseRequest.nome || 'Cliente'}</strong> per la zona di <strong>{confirmCloseRequest.comune || 'Comune'}</strong> verrà segnata come <em>Chiusa</em>.
            </p>
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(46,204,138,0.08)', border: '1px solid rgba(46,204,138,0.2)', marginBottom: 18, fontSize: 12, color: '#86efac' }}>
              ✓ I contatti, le note e lo storico della richiesta rimarranno consultabili nella scheda &ldquo;Gestite&rdquo;.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
                onClick={() => setConfirmCloseRequest(null)}
              >
                Annulla
              </button>
              <button
                type="button"
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                onClick={() => {
                  handleStatusChange(confirmCloseRequest.id, 'closed');
                  setConfirmCloseRequest(null);
                }}
              >
                Conferma chiusura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER MODIFICA NOTE */}
      {selectedRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setSelectedRequest(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 540,
              background: '#0b1420',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 16,
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              display: 'grid',
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#fff', font: '600 20px "DM Serif Display",Georgia,serif' }}>
                Gestione Richiesta · {selectedRequest.nome}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'grid', gap: 4 }}>
              <div><strong>Comune:</strong> {selectedRequest.comune}</div>
              <div><strong>Servizio:</strong> {SERVICE_LABELS[selectedRequest.service] || selectedRequest.service}</div>
              <div><strong>Periodo:</strong> {selectedRequest.datePreferite}</div>
              <div><strong>Email:</strong> {selectedRequest.email || EMPTY}</div>
              <div><strong>Telefono:</strong> {selectedRequest.phone || EMPTY}</div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Note Operative Interne:
              </label>
              <textarea
                rows={4}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Inserisci note sull'abbinamento, esito contatto o preventivo concordato..."
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  fontSize: 13,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={updatingId === selectedRequest.id}
                onClick={handleSaveModal}
                style={{
                  padding: '10px 20px',
                  borderRadius: 9,
                  border: 'none',
                  background: '#e8571a',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {updatingId === selectedRequest.id ? 'Salvataggio...' : 'Salva Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function EmptyState({ text }) {
  return (
    <div className="admin-home__empty">
      <p>{text}</p>
    </div>
  );
}

function Notice({ children, danger = false }) {
  return (
    <div
      className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`}
      role={danger ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
