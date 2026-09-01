import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { supplierApply } from '../../lib/services/supplier-api.js';
import { RouteLoadingFallback } from '../../layouts/public/RouteLoadingFallback';
import { F, C } from '../../lib/constants.js';

// Accesso alla Dashboard Fornitore SOLO per supplier_profiles.status =
// 'verified'. Gli altri stati hanno una schermata dedicata, MAI un redirect
// silenzioso verso l'Area Cliente. Il gate reale resta server-side nelle RPC
// (is_verified_supplier), qui e' solo l'ingresso.
//
// Stati distinti (HARDENING "Area Fornitore"):
//   loading             — sessione/ruolo non ancora risolti
//   denied              — nessuna sessione -> login?context=supplier
//   service-unavailable — errore di query/tabella non raggiungibile: NON un
//                         login loop, si offre "Riprova"
//   apply               — utente autenticato senza profilo fornitore -> form
//                         "Richiedi accesso come fornitore" (supplier_apply)
//   pending             — candidatura ricevuta, in attesa di approvazione Admin
//   suspended / rejected— stati dedicati
//   ok                  — supplier verificato -> children
export function SupplierGuard({ children, onNav }) {
  const [state, setState] = useState({ phase: 'loading', session: null, supplierStatus: null });
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (retryTick > 0 && mounted) setState({ phase: 'loading', session: null, supplierStatus: null });
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        // Il client REST leggero (localStorage vp_supabase_session) espone
        // SOLO i token, mai un oggetto `user`: l'utente reale si risolve dal
        // token via /auth/v1/user, come nel resto dell'app.
        const accessToken = s?.accessToken || s?.access_token || null;
        if (!accessToken) {
          if (mounted) { setState({ phase: 'denied', session: null, supplierStatus: null }); onNav('login?context=supplier'); }
          return;
        }
        let userId = s?.user?.id || null;
        if (!userId) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            userId = user?.id || null;
          } catch {
            userId = null;
          }
        }
        if (!userId) {
          if (mounted) { setState({ phase: 'denied', session: null, supplierStatus: null }); onNav('login?context=supplier'); }
          return;
        }

        // Lettura del proprio profilo fornitore. RLS supplier_profiles_own_select
        // (id = auth.uid()) garantisce che un utente autenticato riceva la
        // PROPRIA riga oppure zero righe (nessun errore). Un `spErr` qui e'
        // quindi un guasto reale (tabella non raggiungibile / rete / sessione
        // non valida per la RLS), NON "non sei fornitore".
        const { data: sp, error: spErr } = await supabase
          .from('supplier_profiles').select('status').eq('id', userId).single();
        if (spErr) {
          if (mounted) setState({ phase: 'service-unavailable', session: s, supplierStatus: null });
          return;
        }
        if (!sp) {
          // Autenticato ma senza candidatura fornitore: si offre il percorso
          // di registrazione, NON il pulsante che rimanda al login.
          if (mounted) setState({ phase: 'apply', session: s, supplierStatus: null });
          return;
        }
        if (sp.status === 'verified') {
          if (mounted) setState({ phase: 'ok', session: s, supplierStatus: 'verified' });
          return;
        }
        if (sp.status === 'suspended' || sp.status === 'rejected') {
          if (mounted) setState({ phase: sp.status, session: s, supplierStatus: sp.status });
          return;
        }
        // 'pending' (o qualsiasi valore inatteso): candidatura in valutazione.
        if (mounted) setState({ phase: 'pending', session: s, supplierStatus: sp.status || 'pending' });
      } catch {
        // Errore imprevisto: NON un login loop, si mostra "servizio non
        // disponibile" con possibilita' di riprovare.
        if (mounted) setState({ phase: 'service-unavailable', session: null, supplierStatus: null });
      }
    })();
    return () => { mounted = false; };
  }, [onNav, retryTick]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);

  if (state.phase === 'loading') return <RouteLoadingFallback />;

  if (state.phase === 'service-unavailable') {
    return (
      <Shell icon="⚠️" title="Servizio fornitori non disponibile">
        <p style={pStyle}>Non riusciamo a raggiungere l'anagrafica fornitori in questo momento. Riprova tra qualche istante.</p>
        <div style={rowStyle}>
          <button type="button" onClick={retry} style={primaryBtn}>Riprova</button>
          <button type="button" onClick={() => onNav('home')} style={ghostBtn}>Torna alla home</button>
        </div>
      </Shell>
    );
  }

  if (state.phase === 'apply') {
    return <SupplierApplyForm onNav={onNav} onDone={() => setState((prev) => ({ ...prev, phase: 'pending', supplierStatus: 'pending' }))} />;
  }

  if (state.phase === 'pending') {
    return (
      <Shell icon="⏳" title="Registrazione ricevuta">
        <p style={pStyle}>La tua richiesta di accesso come fornitore è stata registrata ed è in attesa di approvazione da parte del team VolantiniPro. Ti avviseremo appena il tuo account sarà verificato.</p>
        <div style={rowStyle}>
          <button type="button" onClick={retry} style={ghostBtn}>Aggiorna stato</button>
          <button type="button" onClick={() => onNav('home')} style={primaryBtn}>Torna alla home</button>
        </div>
      </Shell>
    );
  }

  if (state.phase === 'suspended' || state.phase === 'rejected') {
    const copy = state.phase === 'suspended'
      ? 'Il tuo account fornitore è attualmente sospeso. Contatta il team VolantiniPro per maggiori informazioni.'
      : 'La tua richiesta di accesso come fornitore non è stata approvata. Se ritieni si tratti di un errore, contatta il team VolantiniPro.';
    return (
      <Shell icon={state.phase === 'suspended' ? '⛔' : '🚫'} title={state.phase === 'suspended' ? 'Account sospeso' : 'Richiesta non approvata'}>
        <p style={pStyle}>{copy}</p>
        <div style={rowStyle}>
          <button type="button" onClick={() => onNav('home')} style={primaryBtn}>Torna alla home</button>
        </div>
      </Shell>
    );
  }

  if (state.phase !== 'ok') return null;
  return typeof children === 'function' ? children({ session: state.session }) : children;
}

// ── UI helpers ─────────────────────────────────────────────────────────────

const cardStyle = { maxWidth: 520, margin: '80px auto', padding: 28, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontFamily: F.sans, textAlign: 'center' };
const pStyle = { color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.6 };
const rowStyle = { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 };
const primaryBtn = { minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontFamily: F.sans, fontWeight: 800, cursor: 'pointer' };
const ghostBtn = { minHeight: 42, padding: '0 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: '#fff', fontFamily: F.sans, fontWeight: 700, cursor: 'pointer' };
const inputStyle = { width: '100%', minHeight: 42, padding: '0 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(0,0,0,.2)', color: '#fff', fontFamily: F.sans, fontSize: 14, marginTop: 8, boxSizing: 'border-box' };

function Shell({ icon, title, children }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 34, marginBottom: 8 }}>{icon}</div>
      <h2 style={{ fontFamily: F.serif, fontSize: 24, margin: '0 0 8px' }}>{title}</h2>
      {children}
    </div>
  );
}

function SupplierApplyForm({ onNav, onDone }) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const company = companyName.trim();
    if (company.length < 2) { setError('Inserisci la ragione sociale.'); return; }
    setBusy(true);
    setError('');
    try {
      await supplierApply({
        companyName: company,
        contactName: contactName.trim() || null,
        phone: phone.trim() || null,
        vatNumber: vatNumber.trim() || null,
      });
      onDone();
    } catch (err) {
      const msg = err?.message || '';
      setError(
        msg === 'RAGIONE_SOCIALE_OBBLIGATORIA' ? 'Inserisci la ragione sociale.'
        : msg === 'NON_AUTENTICATO' ? 'Sessione non valida. Accedi di nuovo.'
        : 'Non è stato possibile inviare la richiesta. Riprova.'
      );
      setBusy(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 34, marginBottom: 8 }}>🤝</div>
      <h2 style={{ fontFamily: F.serif, fontSize: 24, margin: '0 0 8px' }}>Richiedi accesso come fornitore</h2>
      <p style={pStyle}>Questo account non è ancora registrato come fornitore. Compila i dati della tua azienda: la richiesta sarà valutata dal team VolantiniPro.</p>
      <form onSubmit={submit} style={{ marginTop: 14, textAlign: 'left' }}>
        <input style={inputStyle} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Ragione sociale *" maxLength={200} autoComplete="organization" />
        <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Referente (opzionale)" maxLength={120} autoComplete="name" />
        <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefono (opzionale)" maxLength={40} autoComplete="tel" />
        <input style={inputStyle} value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="Partita IVA (opzionale)" maxLength={40} />
        {error && <p style={{ color: '#fca5a5', fontSize: 12.5, marginTop: 10 }}>{error}</p>}
        <div style={rowStyle}>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? 'Invio…' : 'Invia richiesta'}</button>
          <button type="button" onClick={() => onNav('home')} style={ghostBtn}>Annulla</button>
        </div>
      </form>
    </div>
  );
}
