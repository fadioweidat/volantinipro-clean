import { useEffect, useMemo, useState } from 'react';
import { driverGroupJoin, readDriverGroupJoin } from '../../lib/services/gps-api.js';

// /driver/group/:groupToken — 1 link condiviso per tutto il gruppo.
// Ogni dispositivo che apre questo link fa "join": il server crea (o riusa,
// se stesso device) una identita' PERSONALE (assignment participant +
// access token proprio) e la pagina reindirizza al normale flusso Driver
// personale /driver/assignment/:id?access=:token. Da li' in poi tutto e'
// identico al link personale (programma, mappa, pausa/riprendi/termina),
// con sessione GPS e device ownership isolati per partecipante.

const ERROR_MESSAGES = {
  GROUP_LINK_NON_TROVATO: 'Link di gruppo non valido.',
  GROUP_TOKEN_NON_VALIDO: 'Link di gruppo non valido.',
  GROUP_LINK_REVOCATO: 'Questo link non e’ piu’ attivo. Contatta l’Admin per un nuovo link.',
  GROUP_LINK_SCADUTO: 'Questo link e’ scaduto. Contatta l’Admin.',
  GROUP_LINK_PIENO: 'Numero massimo di operatori raggiunto per questo gruppo.',
  PARTECIPANTE_REVOCATO: 'Il tuo accesso a questo gruppo e’ stato revocato. Contatta l’Admin.',
  NOME_OPERATIVO_OBBLIGATORIO: 'Inserisci un nome operativo.',
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
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(true);

  // Stesso device che riapre lo stesso group link: nessun nuovo join, si
  // riparte dall'identita' gia' ottenuta.
  useEffect(() => {
    const existing = readDriverGroupJoin(token);
    if (existing) { redirectToPersonal(existing); return; }
    setChecking(false);
  }, [token]);

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) { setError(new Error('NOME_OPERATIVO_OBBLIGATORIO')); return; }
    setSubmitting(true);
    setError(null);
    try {
      const join = await driverGroupJoin(token, trimmed);
      if (!join?.assignmentId || !join?.accessToken) throw new Error('join_incompleto');
      redirectToPersonal(join);
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  if (checking) {
    return <main style={shellStyle}><div style={cardStyle}><p style={mutedStyle}>Verifica in corso…</p></div></main>;
  }

  return (
    <main style={shellStyle}>
      <div style={cardStyle}>
        <p style={eyebrowStyle}>VolantiniPro · Gruppo di lavoro</p>
        <h1 style={titleStyle}>Entra nel gruppo di lavoro</h1>
        <p style={mutedStyle}>
          Ogni dispositivo crea una sessione personale separata. Pausa, ripresa e
          fine turno sono individuali; sulla mappa vedrai anche le tracce dei
          compagni di gruppo.
        </p>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          <label htmlFor="group-operative-name" style={labelStyle}>Nome operativo</label>
          <input
            id="group-operative-name"
            name="operative_name"
            type="text"
            value={name}
            onChange={(ev) => { setName(ev.target.value); if (error) setError(null); }}
            placeholder="Es. Ahmed"
            autoComplete="off"
            maxLength={40}
            style={inputStyle}
          />
          {error && <div style={errorStyle}>{messageFor(error)}</div>}
          <button type="submit" disabled={submitting || !name.trim()} style={buttonStyle(submitting || !name.trim())}>
            {submitting ? 'Ingresso…' : 'Entra e inizia'}
          </button>
        </form>
      </div>
    </main>
  );
}

const shellStyle = { minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' };
const cardStyle = { width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.3)' };
const eyebrowStyle = { margin: 0, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#e8571a' };
const titleStyle = { margin: '8px 0 6px', fontSize: 22, color: '#0f172a' };
const mutedStyle = { margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.5 };
const labelStyle = { fontSize: 12, fontWeight: 700, color: '#334155' };
const inputStyle = { padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 15 };
const errorStyle = { fontSize: 12, color: '#b91c1c', fontWeight: 600 };
function buttonStyle(disabled) {
  return { padding: '13px 16px', borderRadius: 10, border: 'none', background: disabled ? '#f1a985' : '#e8571a', color: '#fff', fontSize: 15, fontWeight: 800, cursor: disabled ? 'default' : 'pointer' };
}
