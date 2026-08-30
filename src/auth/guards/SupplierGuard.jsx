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
        if (!s || !s.user) {
          if (mounted) { setState({ phase: 'denied', session: null, supplierStatus: null }); onNav('login?context=supplier'); }
          return;
        }
        const { data: profile, error: pErr } = await supabase
          .from('profiles').select('role').eq('id', s.user.id).single();
        if (pErr || profile?.role !== 'supplier') {
          if (mounted) { setState({ phase: 'denied', session: s, supplierStatus: null }); onNav('dashboard'); }
          return;
        }
        const { data: sp, error: spErr } = await supabase
          .from('supplier_profiles').select('status').eq('id', s.user.id).single();
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
        if (mounted) { setState({ phase: 'denied', session: null, supplierStatus: null }); onNav('login'); }
      }
    })();
    return () => { mounted = false; };
  }, [onNav]);

  if (state.phase === 'loading') return <RouteLoadingFallback />;

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
