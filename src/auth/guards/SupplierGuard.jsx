import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { RouteLoadingFallback } from '../../layouts/public/RouteLoadingFallback';
import { F, C } from '../../lib/constants.js';

// Accesso alla Dashboard Fornitore SOLO per: profiles.role = 'supplier' E
// supplier_profiles.status = 'verified'. pending/suspended/rejected -> UI
// chiara di accesso negato (nessuna navigazione silenziosa). Il gate reale
// resta comunque server-side nelle RPC (verified_supplier), qui e' solo
// l'ingresso.
export function SupplierGuard({ children, onNav }) {
  const [state, setState] = useState({ phase: 'loading', session: null, supplierStatus: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        // La sessione del sito vive nel client REST leggero (localStorage
        // vp_supabase_session): il suo getSession() restituisce SOLO i token,
        // MAI un oggetto `user` (consumeSupabaseAuthHash/toStoredSession non lo
        // popolano). Subito dopo un Magic Link il blob ha quindi l'access_token
        // ma non `user`: il vecchio `if (!s || !s.user)` rimbalzava sempre a
        // /login?context=supplier — il Fornitore non entrava mai in dashboard
        // arrivando qui direttamente, senza prima passare dalla Dashboard
        // Cliente che idratava `user` nel blob (bug reale del Magic Link).
        // L'utente reale si risolve dal token via /auth/v1/user, come fa gia'
        // il resto dell'app (getCurrentSupabaseUser).
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
        const { data: profile, error: pErr } = await supabase
          .from('profiles').select('role').eq('id', userId).single();
        if (pErr || profile?.role !== 'supplier') {
          // Utente autenticato ma NON fornitore (tipicamente un cliente, o un
          // profilo appena creato senza role). BUG STORICO: qui si navigava
          // automaticamente alla Dashboard Cliente, quindi cliccare "Area
          // Fornitore" cadeva nel portale cliente. L'Area Fornitore deve avere
          // il suo flusso separato: si mostra un accesso negato DEDICATO, con
          // navigazione ESPLICITA (nessun redirect automatico verso l'Area
          // Cliente).
          if (mounted) setState({ phase: 'not-supplier', session: s, supplierStatus: null });
          return;
        }
        const { data: sp, error: spErr } = await supabase
          .from('supplier_profiles').select('status').eq('id', userId).single();
        if (spErr || !sp) {
          if (mounted) setState({ phase: 'not-verified', session: s, supplierStatus: 'pending' });
          return;
        }
        if (sp.status !== 'verified') {
          if (mounted) setState({ phase: 'not-verified', session: s, supplierStatus: sp.status });
          return;
        }
        if (mounted) setState({ phase: 'ok', session: s, supplierStatus: 'verified' });
      } catch {
        // Errore imprevisto: si resta nel flusso Fornitore (login?context=supplier),
        // mai nel login generico che poi ricade sul Cliente.
        if (mounted) { setState({ phase: 'denied', session: null, supplierStatus: null }); onNav('login?context=supplier'); }
      }
    })();
    return () => { mounted = false; };
  }, [onNav]);

  if (state.phase === 'loading') return <RouteLoadingFallback />;

  if (state.phase === 'not-supplier') {
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', padding: 28, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontFamily: F.sans, textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>🔒</div>
        <h2 style={{ fontFamily: F.serif, fontSize: 24, margin: '0 0 8px' }}>Area Fornitore</h2>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.6 }}>Questo account non è registrato come fornitore. Accedi con le credenziali dell'Area Fornitore per continuare.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          <button type="button" onClick={() => onNav('login?context=supplier')} style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontFamily: F.sans, fontWeight: 800, cursor: 'pointer' }}>Accedi come fornitore</button>
          <button type="button" onClick={() => onNav('home')} style={{ minHeight: 42, padding: '0 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,.18)', background: 'transparent', color: '#fff', fontFamily: F.sans, fontWeight: 700, cursor: 'pointer' }}>Torna alla home</button>
        </div>
        <button type="button" onClick={() => onNav('dashboard')} style={{ marginTop: 14, background: 'transparent', border: 'none', color: 'rgba(255,255,255,.45)', fontFamily: F.sans, fontSize: 12.5, textDecoration: 'underline', cursor: 'pointer' }}>Sei un cliente? Vai all'Area Cliente</button>
      </div>
    );
  }

  if (state.phase === 'not-verified') {
    const label = {
      pending: 'Il tuo account fornitore è in attesa di verifica.',
      suspended: 'Il tuo account fornitore è sospeso.',
      rejected: 'La tua richiesta come fornitore non è stata approvata.',
    }[state.supplierStatus] || 'Account fornitore non ancora verificato.';
    return (
      <div style={{ maxWidth: 520, margin: '80px auto', padding: 28, borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontFamily: F.sans, textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 8 }}>⏳</div>
        <h2 style={{ fontFamily: F.serif, fontSize: 24, margin: '0 0 8px' }}>Accesso non disponibile</h2>
        <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.6 }}>{label}</p>
        <button type="button" onClick={() => onNav('home')} style={{ marginTop: 16, minHeight: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontFamily: F.sans, fontWeight: 800, cursor: 'pointer' }}>Torna alla home</button>
      </div>
    );
  }

  if (state.phase !== 'ok') return null;
  return typeof children === 'function' ? children({ session: state.session }) : children;
}
