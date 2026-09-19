import { useEffect, useMemo, useState } from 'react';
import { driverGroupJoin, readDriverGroupJoin } from '../../lib/services/gps-api.js';

// /driver/group/:groupToken — 1 link condiviso per tutto il gruppo.
// Ogni dispositivo riceve automaticamente una identita' operativa stabile
// (OP 1, OP 2, OP 3...) legata al device. Nessun nome da inserire.

const ERROR_MESSAGES = {
  GROUP_LINK_NON_TROVATO: 'Link di gruppo non valido.',
  GROUP_TOKEN_NON_VALIDO: 'Link di gruppo non valido.',
  GROUP_LINK_REVOCATO: 'Questo link non e’ piu’ attivo. Contatta l’Admin per un nuovo link.',
  GROUP_LINK_SCADUTO: 'Questo link e’ scaduto. Contatta l’Admin.',
  GROUP_LINK_PIENO: 'Numero massimo di operatori raggiunto per questo gruppo.',
  PARTECIPANTE_REVOCATO: 'Il tuo accesso a questo gruppo e’ stato revocato. Contatta l’Admin.',
};

function messageFor(err) {
  const raw = String(err?.message || '');
  const key = Object.keys(ERROR_MESSAGES).find((k) => raw.includes(k));
  return key ? ERROR_MESSAGES[key] : 'Accesso al gruppo non riuscito. Riprova o contatta l’Admin.';
}

function redirectToPersonal(join) {
  const url = `/driver/assignment/${join.assignmentId}?access=${encodeURIComponent(join.accessToken)}`;
  window.location.replace(url);
}

export function DriverGroupJoinPage({ groupToken }) {
  const token = useMemo(() => String(groupToken || '').trim(), [groupToken]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    async function enterGroup() {
      const existing = readDriverGroupJoin(token);
      if (existing) {
        redirectToPersonal(existing);
        return;
      }

      setStatus('joining');
      setError(null);

      try {
        // displayName lasciato vuoto intenzionalmente: il server assegna
        // automaticamente OP 1 / OP 2 / OP 3... in modo concorrente-safe.
        const joined = await driverGroupJoin(token, '');
        if (cancelled) return;
        if (!joined?.assignmentId || !joined?.accessToken) throw new Error('join_incompleto');
        redirectToPersonal(joined);
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setStatus('error');
      }
    }

    enterGroup();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <main style={shellStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>VolantiniPro · Gruppo di lavoro</p>
        <h1 style={titleStyle}>Accesso operatore</h1>
        {status !== 'error' ? (
          <>
            <p style={mutedStyle}>
              Sto identificando questo dispositivo e assegnando il codice operatore.
            </p>
            <div style={loadingStyle}>Accesso in corso…</div>
          </>
        ) : (
          <>
            <div style={errorStyle}>{messageFor(error)}</div>
            <button type="button" style={buttonStyle} onClick={() => window.location.reload()}>
              Riprova
            </button>
          </>
        )}
      </div>
    </main>
  );
}

const shellStyle = { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' };
const cardStyle = { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' };
const eyebrowStyle = { margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8571a' };
const titleStyle = { margin: '8px 0 6px', fontSize: 22, color: '#0f172a' };
const mutedStyle = { margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 };
const loadingStyle = { marginTop: 18, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', color: '#334155', fontSize: 14, fontWeight: 700 };
const errorStyle = { marginTop: 14, fontSize: 13, color: '#b91c1c', fontWeight: 700 };
const buttonStyle = { marginTop: 14, width: '100%', minHeight: 44, borderRadius: 10, border: 'none', background: '#e8571a', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' };
