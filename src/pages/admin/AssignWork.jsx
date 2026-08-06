import { useEffect, useState, useCallback } from 'react';
import {
  listAssignableOperators,
  createOperatorAssignment,
  updateOperatorAssignment,
  revokeOperatorAssignment,
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
  getAssignedZones,
} from '../../lib/services/admin-api.js';
import { getCampaignRecord } from '../../lib/services/gps-api.js';

// ─── AssignWork ───────────────────────────────────────────────────────────────
// Form a step per assegnare lavoro a un operatore e generare il link GPS personale.
// Può essere usato come pagina completa o come modale controllato dall'esterno.
//
// Props:
//   campaignId   — UUID campagna
//   onSaved      — callback({ assignment, link }) dopo salvataggio
//   onClose      — callback per chiudere (se usato come modale)
//   existingAssignment — se passato, entra in modalità "modifica"

export function AssignWork({ campaignId, onSaved, onClose, existingAssignment = null }) {
  const isEdit = Boolean(existingAssignment);

  // Step 1=operatore, 2=gruppo/zone, 3=dettagli, 4=preview
  const [step, setStep] = useState(1);
  const [operators, setOperators] = useState([]);
  const [zones, setZones] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Form state
  const [selectedOperatorId, setSelectedOperatorId] = useState(existingAssignment?.operator_id || '');
  const [selectedGroupId, setSelectedGroupId] = useState(existingAssignment?.group_id || '');
  const [selectedComuni, setSelectedComuni] = useState(
    () => existingAssignment?.metadata?.comuni || []
  );
  const [selectedZoneLabels, setSelectedZoneLabels] = useState(
    () => existingAssignment?.metadata?.zone_labels || []
  );
  const [customComune, setCustomComune] = useState('');
  const [qty, setQty] = useState(existingAssignment?.metadata?.qty || '');
  const [startsAt, setStartsAt] = useState(
    existingAssignment?.starts_at
      ? existingAssignment.starts_at.slice(0, 16)
      : todayIso()
  );
  const [endsAt, setEndsAt] = useState(
    existingAssignment?.ends_at ? existingAssignment.ends_at.slice(0, 16) : ''
  );
  const [notes, setNotes] = useState(existingAssignment?.metadata?.notes || '');

  // Result state
  const [savedAssignment, setSavedAssignment] = useState(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Load data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ops, zns, camp] = await Promise.all([
          listAssignableOperators().catch(() => []),
          getAssignedZones(campaignId).catch(() => []),
          getCampaignRecord(campaignId).catch(() => null),
        ]);
        if (!cancelled) {
          setOperators(ops);
          setZones(zns);
          setCampaign(camp);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Errore caricamento dati.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [campaignId]);

  const selectedOperator = operators.find(op => op.id === selectedOperatorId) || null;
  const campaignTitle = campaign?.title || campaign?.campaign_name || campaign?.nome || `Campagna ${String(campaignId).slice(0, 8)}`;

  // Comuni unici dalle zone in DB + eventuali custom
  const dbComuni = Array.from(new Set(
    zones.map(z => z.municipality_name || z.comune || z.label).filter(Boolean)
  )).sort();

  function toggleComune(c) {
    setSelectedComuni(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  }

  function addCustomComune() {
    const c = customComune.trim();
    if (!c || selectedComuni.includes(c)) { setCustomComune(''); return; }
    setSelectedComuni(prev => [...prev, c]);
    setCustomComune('');
  }

  function toggleZone(label) {
    setSelectedZoneLabels(prev =>
      prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]
    );
  }

  const canGoNext = useCallback(() => {
    if (step === 1) return Boolean(selectedOperatorId);
    if (step === 2) return true; // gruppo e zone opzionali
    if (step === 3) return Boolean(startsAt);
    return true;
  }, [step, selectedOperatorId, startsAt]);

  async function handleSave() {
    if (saving) return; // guard doppio click
    setSaving(true);
    setError(null);
    try {
      const metadata = {
        comuni: selectedComuni,
        zone_labels: selectedZoneLabels,
        qty: qty && Number(qty) > 0 ? Number(qty) : null,
        notes,
        campaign_title: campaignTitle,
        operator_display_name: selectedOperator?.display_name || null,
      };

      // Validate ends_at > starts_at
      if (endsAt && startsAt && new Date(endsAt) <= new Date(startsAt)) {
        setError('La scadenza deve essere successiva alla data di inizio.');
        setSaving(false);
        return;
      }

      let result;
      if (isEdit) {
        result = await updateOperatorAssignment(existingAssignment.id, {
          group_id: selectedGroupId || null,
          starts_at: startsAt || null,
          ends_at: endsAt || null,
          metadata: { metadata },
        });
      } else {
        result = await createOperatorAssignment({
          campaignId,
          operatorId: selectedOperatorId,
          groupId: selectedGroupId || null,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          metadata,
          notes,
        });
      }

      const link = generateDriverAssignmentLink(result.id);
      setSavedAssignment(result);
      setGeneratedLink(link);
      setStep(5); // step finale: card risultato

      if (onSaved) onSaved({ assignment: result, link });
    } catch (err) {
      setError(err?.message || 'Errore salvataggio assegnazione.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    if (!savedAssignment?.id && !existingAssignment?.id) return;
    const id = savedAssignment?.id || existingAssignment.id;
    if (!window.confirm('Revocare questa assegnazione? Il driver non potrà più avviare il GPS.')) return;
    setSaving(true);
    try {
      await revokeOperatorAssignment(id);
      setNotice('Assegnazione revocata. Il link non è più utilizzabile.');
      setSavedAssignment(prev => prev ? { ...prev, status: 'revoked' } : prev);
    } catch (err) {
      setError(err?.message || 'Errore revoca.');
    } finally {
      setSaving(false);
    }
  }

  function buildWhatsAppMsg() {
    const op = selectedOperator || { display_name: existingAssignment?.operator_name };
    return buildDriverWhatsAppMessage({
      operatorName: op?.display_name || 'Operatore',
      campaignTitle,
      date: startsAt ? new Date(startsAt).toLocaleDateString('it-IT') : 'Da definire',
      comuni: selectedComuni,
      zone: selectedZoneLabels,
      qty: qty ? Number(qty) : null,
      link: generatedLink,
    });
  }

  async function handleCopyLink() {
    if (!generatedLink) return;
    await navigator.clipboard?.writeText(generatedLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function handleCopyMsg() {
    const msg = buildWhatsAppMsg();
    await navigator.clipboard?.writeText(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  }

  function handleWhatsApp() {
    const phone = selectedOperator?.phone?.replace(/[^\d+]/g, '') || '';
    const msg = buildWhatsAppMsg();
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return (
      <div style={shellStyle}>
        <ShellHeader campaignTitle={campaignTitle} campaignId={campaignId} onClose={onClose} />
        <Notice text="Caricamento operatori e zone..." />
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <ShellHeader campaignTitle={campaignTitle} campaignId={campaignId} onClose={onClose} />

      {error && <Notice danger text={error} />}
      {notice && <Notice text={notice} />}

      {/* ── Step indicator ── */}
      {step < 5 && (
        <div style={stepBarStyle}>
          {['Operatore', 'Zone', 'Dettagli', 'Anteprima'].map((label, idx) => (
            <div key={label} style={{
              ...stepItemStyle,
              color: step === idx + 1 ? '#e8571a' : step > idx + 1 ? '#2ecc8a' : 'rgba(255,255,255,.4)',
              fontWeight: step === idx + 1 ? 900 : 700,
            }}>
              <span style={{
                ...stepDotStyle,
                background: step > idx + 1 ? '#2ecc8a' : step === idx + 1 ? '#e8571a' : 'rgba(255,255,255,.12)',
              }}>
                {step > idx + 1 ? '✓' : idx + 1}
              </span>
              {label}
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 1: Scegli operatore ── */}
      {step === 1 && (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 1 — Scegli operatore</p>
          <h2 style={sectionTitleStyle}>Chi esegue questo lavoro?</h2>
          {operators.length === 0 ? (
            <Notice danger text="Nessun operatore attivo trovato in operator_profiles. Crea prima il profilo operatore." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {operators.map(op => (
                <button
                  key={op.id}
                  type="button"
                  style={{
                    ...operatorCardStyle,
                    border: selectedOperatorId === op.id
                      ? '2px solid #e8571a'
                      : '1px solid rgba(255,255,255,.1)',
                    background: selectedOperatorId === op.id
                      ? 'rgba(232,87,26,.1)'
                      : 'rgba(255,255,255,.03)',
                  }}
                  onClick={() => setSelectedOperatorId(op.id)}
                >
                  <div style={operatorAvatarStyle}>
                    {(op.display_name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <strong style={{ color: '#fff', fontSize: 15 }}>
                      {op.display_name || `Operatore ${op.id.slice(0, 8)}`}
                    </strong>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                      {op.phone || 'Telefono non inserito'} · {op.status}
                    </p>
                  </div>
                  {selectedOperatorId === op.id && (
                    <span style={checkStyle}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div style={footerRowStyle}>
            <span />
            <button
              style={canGoNext() ? primaryBtnStyle : disabledBtnStyle}
              type="button"
              disabled={!canGoNext()}
              onClick={() => setStep(2)}
            >
              Avanti →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Comuni e zone ── */}
      {step === 2 && (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 2 — Comuni e zone</p>
          <h2 style={sectionTitleStyle}>Dove lavora?</h2>

          <p style={{ ...labelStyle, marginBottom: 6 }}>Comuni assegnati</p>
          {dbComuni.length > 0 && (
            <div style={chipGridStyle}>
              {dbComuni.map(c => (
                <button
                  key={c}
                  type="button"
                  style={selectedComuni.includes(c) ? activeChipStyle : chipStyle}
                  onClick={() => toggleComune(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <input
              value={customComune}
              onChange={e => setCustomComune(e.target.value)}
              placeholder="Aggiungi comune personalizzato..."
              style={inputStyle}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomComune())}
            />
            <button type="button" style={secondaryBtnStyle} onClick={addCustomComune}>+ Aggiungi</button>
          </div>
          {selectedComuni.filter(c => !dbComuni.includes(c)).length > 0 && (
            <div style={chipGridStyle}>
              {selectedComuni.filter(c => !dbComuni.includes(c)).map(c => (
                <button
                  key={c}
                  type="button"
                  style={activeChipStyle}
                  onClick={() => toggleComune(c)}
                >
                  {c} ✕
                </button>
              ))}
            </div>
          )}

          {zones.length > 0 && (
            <>
              <p style={{ ...labelStyle, marginTop: 18, marginBottom: 6 }}>Zone specifiche (da campagna)</p>
              <div style={chipGridStyle}>
                {zones.map((z, idx) => {
                  const label = z.label || z.zone_name || z.municipality_name || `Zona ${idx + 1}`;
                  return (
                    <button
                      key={z.id || idx}
                      type="button"
                      style={selectedZoneLabels.includes(label) ? activeChipStyle : chipStyle}
                      onClick={() => toggleZone(label)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={footerRowStyle}>
            <button type="button" style={secondaryBtnStyle} onClick={() => setStep(1)}>← Indietro</button>
            <button type="button" style={primaryBtnStyle} onClick={() => setStep(3)}>Avanti →</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Dettagli ── */}
      {step === 3 && (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 3 — Dettagli lavoro</p>
          <h2 style={sectionTitleStyle}>Quantità, date e note</h2>

          <div style={formGridStyle}>
            <label style={labelStyle}>
              Quantità volantini
              <input
                type="number"
                min="0"
                value={qty}
                onChange={e => setQty(e.target.value)}
                placeholder="es. 5000"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Data e ora inizio *
              <input
                type="datetime-local"
                value={startsAt}
                onChange={e => setStartsAt(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Scadenza (facoltativa)
              <input
                type="datetime-local"
                value={endsAt}
                onChange={e => setEndsAt(e.target.value)}
                style={inputStyle}
                min={startsAt || undefined}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Gruppo operativo (facoltativo)
              <input
                value={selectedGroupId}
                onChange={e => setSelectedGroupId(e.target.value)}
                placeholder="UUID gruppo o nome..."
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
              Note operative (visibili al driver)
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Istruzioni specifiche, accessi, contatti..."
                rows={3}
                style={textareaStyle}
              />
            </label>
          </div>

          <div style={footerRowStyle}>
            <button type="button" style={secondaryBtnStyle} onClick={() => setStep(2)}>← Indietro</button>
            <button
              type="button"
              style={canGoNext() ? primaryBtnStyle : disabledBtnStyle}
              disabled={!canGoNext()}
              onClick={() => setStep(4)}
            >
              Anteprima →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Anteprima ── */}
      {step === 4 && (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 4 — Anteprima assegnazione</p>
          <h2 style={sectionTitleStyle}>Conferma i dati</h2>

          <div style={previewGridStyle}>
            <PreviewRow label="Operatore" value={selectedOperator?.display_name || selectedOperatorId} />
            <PreviewRow label="Campagna" value={campaignTitle} />
            <PreviewRow label="Comuni" value={selectedComuni.join(', ') || 'Tutti'} />
            <PreviewRow label="Zone" value={selectedZoneLabels.join(', ') || 'Nessuna specifica'} />
            <PreviewRow label="Quantità" value={qty ? `${Number(qty).toLocaleString('it-IT')} volantini` : 'Non specificata'} />
            <PreviewRow label="Data inizio" value={startsAt ? new Date(startsAt).toLocaleString('it-IT') : 'Immediata'} />
            <PreviewRow label="Scadenza" value={endsAt ? new Date(endsAt).toLocaleString('it-IT') : 'Nessuna'} />
            {notes && <PreviewRow label="Note" value={notes} />}
          </div>

          <div style={{ ...footerRowStyle, marginTop: 20 }}>
            <button type="button" style={secondaryBtnStyle} onClick={() => setStep(3)}>← Modifica</button>
            <button
              type="button"
              style={saving ? disabledBtnStyle : primaryBtnStyle}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Salvataggio...' : isEdit ? 'Aggiorna assegnazione' : '✓ Salva e genera link'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Risultato ── */}
      {step === 5 && savedAssignment && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 32 }}>🎉</span>
            <div>
              <p style={eyebrowStyle}>Assegnazione creata</p>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Link personale generato</h2>
            </div>
          </div>

          {savedAssignment.status === 'revoked' && (
            <Notice danger text="Assegnazione revocata. Il link non è più utilizzabile." />
          )}

          <div style={previewGridStyle}>
            <PreviewRow label="Operatore" value={selectedOperator?.display_name || savedAssignment.operator_id} />
            <PreviewRow label="Campagna" value={campaignTitle} />
            <PreviewRow label="Comuni" value={selectedComuni.join(', ') || 'Tutti'} />
            <PreviewRow label="Quantità" value={qty ? `${Number(qty).toLocaleString('it-IT')} volantini` : 'Non specificata'} />
            <PreviewRow label="Stato" value={savedAssignment.status} />
            {endsAt && <PreviewRow label="Scadenza" value={new Date(endsAt).toLocaleString('it-IT')} />}
          </div>

          {/* Link box */}
          <div style={linkBoxStyle}>
            <p style={eyebrowStyle}>Link personale driver (non condivisibile con altri)</p>
            <div style={linkTextStyle}>{generatedLink}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" style={primaryBtnStyle} onClick={handleCopyLink}>
                {copiedLink ? '✓ Copiato!' : '📋 Copia link'}
              </button>
              <button type="button" style={whatsappBtnStyle} onClick={handleWhatsApp}>
                📱 Invia WhatsApp
              </button>
              <button type="button" style={secondaryBtnStyle} onClick={handleCopyMsg}>
                {copiedMsg ? '✓ Messaggio copiato!' : '📝 Copia messaggio completo'}
              </button>
            </div>
          </div>

          {/* Messaggio anteprima */}
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 700 }}>
              Anteprima messaggio WhatsApp
            </summary>
            <pre style={msgPreviewStyle}>{buildWhatsAppMsg()}</pre>
          </details>

          {/* Azioni secondarie */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14 }}>
            <button
              type="button"
              style={secondaryBtnStyle}
              onClick={() => { setStep(3); setSavedAssignment(null); }}
            >
              Modifica scadenza
            </button>
            {savedAssignment.status !== 'revoked' && (
              <button
                type="button"
                style={{ ...secondaryBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,.35)' }}
                disabled={saving}
                onClick={handleRevoke}
              >
                🚫 Revoca assegnazione
              </button>
            )}
            {onClose && (
              <button type="button" style={secondaryBtnStyle} onClick={onClose}>Chiudi</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShellHeader({ campaignTitle, campaignId, onClose }) {
  return (
    <header style={headerStyle}>
      <div>
        <a href="/admin" style={brandStyle}>VolantiniPro Admin</a>
        <h1 style={titleStyle}>Assegna lavoro</h1>
        <p style={mutedStyle}>{campaignTitle}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
        <a style={secondaryBtnStyle} href={`/admin/campaigns/${campaignId}/assignments`}>
          Lista assegnazioni
        </a>
        {onClose && (
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>✕ Chiudi</button>
        )}
      </div>
    </header>
  );
}

function PreviewRow({ label, value }) {
  return (
    <div style={previewRowStyle}>
      <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 700 }}>{label}</span>
      <span style={{ color: '#fff', fontSize: 13 }}>{value}</span>
    </div>
  );
}

function Notice({ text, danger }) {
  return (
    <div style={{
      padding: 12,
      borderRadius: 12,
      border: `1px solid ${danger ? 'rgba(239,68,68,.35)' : 'rgba(46,204,138,.28)'}`,
      background: danger ? 'rgba(239,68,68,.06)' : 'rgba(46,204,138,.05)',
      color: danger ? '#fca5a5' : '#86efac',
      fontWeight: 750,
      fontSize: 13,
      marginBottom: 12,
    }}>
      {text}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const shellStyle = {
  minHeight: '100vh',
  padding: 24,
  background: '#0B192C',
  color: 'rgba(255,255,255,.85)',
  fontFamily: "'DM Sans', Inter, system-ui, sans-serif",
};
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 22,
};
const brandStyle = {
  color: '#e8571a',
  fontWeight: 900,
  textDecoration: 'none',
  fontSize: 13,
};
const titleStyle = {
  margin: '8px 0 4px',
  fontSize: 28,
  color: '#fff',
  fontFamily: "'DM Serif Display', Georgia, serif",
};
const mutedStyle = {
  margin: 0,
  color: 'rgba(255,255,255,.45)',
  fontSize: 12,
};
const cardStyle = {
  background: 'rgba(18, 32, 54, 0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 16,
  padding: 24,
  marginBottom: 16,
  boxShadow: '0 16px 42px rgba(0,0,0,.24)',
};
const stepBarStyle = {
  display: 'flex',
  gap: 12,
  marginBottom: 20,
  flexWrap: 'wrap',
};
const stepItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  cursor: 'default',
};
const stepDotStyle = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 900,
  color: '#fff',
  flexShrink: 0,
};
const eyebrowStyle = {
  margin: '0 0 6px',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '.12em',
  color: 'rgba(255,255,255,.45)',
  fontWeight: 900,
};
const sectionTitleStyle = {
  margin: '0 0 18px',
  fontSize: 20,
  color: '#fff',
  lineHeight: 1.2,
};
const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 12,
  fontWeight: 800,
  color: 'rgba(255,255,255,.55)',
};
const inputStyle = {
  background: '#0d1e30',
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 10,
  padding: '10px 13px',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
};
const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 80,
};
const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
  marginBottom: 20,
};
const chipGridStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 8,
};
const chipStyle = {
  border: '1px solid rgba(255,255,255,.15)',
  borderRadius: 999,
  padding: '6px 14px',
  background: 'rgba(255,255,255,.04)',
  color: 'rgba(255,255,255,.7)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 700,
};
const activeChipStyle = {
  ...chipStyle,
  background: 'rgba(232,87,26,.14)',
  border: '1px solid rgba(232,87,26,.6)',
  color: '#e8571a',
};
const operatorCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  borderRadius: 12,
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'all 0.15s ease',
  position: 'relative',
};
const operatorAvatarStyle = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: 'linear-gradient(135deg, #1e3a5f, #0d1e30)',
  border: '1px solid rgba(255,255,255,.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  fontWeight: 900,
  color: '#fff',
  flexShrink: 0,
};
const checkStyle = {
  marginLeft: 'auto',
  color: '#2ecc8a',
  fontSize: 18,
  fontWeight: 900,
};
const previewGridStyle = {
  display: 'grid',
  gap: 10,
  marginBottom: 16,
};
const previewRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 12px',
  background: 'rgba(255,255,255,.04)',
  borderRadius: 8,
  flexWrap: 'wrap',
};
const linkBoxStyle = {
  padding: 16,
  borderRadius: 12,
  border: '1px solid rgba(232,87,26,.3)',
  background: 'rgba(232,87,26,.06)',
  marginTop: 16,
};
const linkTextStyle = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#e8571a',
  wordBreak: 'break-all',
  padding: '8px 0',
};
const msgPreviewStyle = {
  marginTop: 10,
  padding: 14,
  background: '#0d1e30',
  borderRadius: 10,
  fontSize: 12,
  color: 'rgba(255,255,255,.7)',
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
};
const footerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  marginTop: 20,
  flexWrap: 'wrap',
};
const primaryBtnStyle = {
  minHeight: 46,
  border: 'none',
  borderRadius: 12,
  padding: '0 22px',
  background: '#e8571a',
  color: '#fff',
  fontWeight: 900,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(232,87,26,.28)',
  transition: 'all 0.15s ease',
};
const secondaryBtnStyle = {
  minHeight: 44,
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 12,
  padding: '0 18px',
  background: 'rgba(255,255,255,.05)',
  color: '#fff',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
};
const disabledBtnStyle = {
  ...primaryBtnStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
  boxShadow: 'none',
};
const whatsappBtnStyle = {
  ...primaryBtnStyle,
  background: '#25D366',
  boxShadow: '0 8px 20px rgba(37,211,102,.25)',
};
