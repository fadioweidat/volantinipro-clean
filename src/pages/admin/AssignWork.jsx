import { useEffect, useState, useCallback } from 'react';
import {
  listAssignableOperators,
  createOperationalGroup,
  createOperatorAssignment,
  updateOperatorAssignment,
  revokeOperatorAssignment,
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
  getCampaignZonesWithGroups,
  setAssignmentZones,
  listAssignmentZones,
  updateCampaignZoneAssignment,
} from '../../lib/services/admin-api.js';
import { getCampaignRecord } from '../../lib/services/gps-api.js';
import { AssignWorkGroupOperatorStep } from './assign-work/AssignWorkGroupOperatorStep.jsx';
import { AssignWorkProgramStep } from './assign-work/AssignWorkProgramStep.jsx';

// ─── AssignWork ───────────────────────────────────────────────────────────────
// Form a step per assegnare lavoro a un operatore e generare il link GPS personale.
// Può essere usato come pagina completa o come modale controllato dall'esterno.
//
// Props:
//   campaignId   — UUID campagna
//   onSaved      — callback({ assignment, link }) dopo salvataggio
//   onClose      — callback per chiudere (se usato come modale)
//   existingAssignment — se passato, entra in modalità "modifica"

export function AssignWork({ campaignId, onSaved, onClose, existingAssignment = null, initialGroupId = null, initialOperatorId = null }) {
  const isEdit = Boolean(existingAssignment);

  // Step 1=operatore, 2=programma, 3=prewiew, 4=risultato
  const [step, setStep] = useState(1);
  const [operators, setOperators] = useState([]);
  const [groups, setGroups] = useState([]);
  const [zones, setZones] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLeadId, setNewGroupLeadId] = useState(initialOperatorId || '');

  // Form state
  const [selectedOperatorId, setSelectedOperatorId] = useState(existingAssignment?.operator_id || initialOperatorId || '');
  const [selectedGroupId, setSelectedGroupId] = useState(existingAssignment?.group_id || initialGroupId || '');

  const [startsAt, setStartsAt] = useState(
    existingAssignment?.starts_at
      ? toLocalDatetimeInputValue(existingAssignment.starts_at)
      : todayIso()
  );
  const [endsAt, setEndsAt] = useState(
    existingAssignment?.ends_at ? toLocalDatetimeInputValue(existingAssignment.ends_at) : ''
  );
  const [notes, setNotes] = useState(existingAssignment?.metadata?.notes || '');

  // Zone specific state
  const [zonePriorities, setZonePriorities] = useState({}); // { zoneId: newPriority }
  const [selectedZonesState, setSelectedZonesState] = useState({}); // { zoneId: { selected: true, qty: '' } }

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
        const [ops, zonesData, camp, existingZones] = await Promise.all([
          listAssignableOperators().catch(() => []),
          getCampaignZonesWithGroups(campaignId),
          getCampaignRecord(campaignId).catch(() => null),
          isEdit ? listAssignmentZones(existingAssignment.id).catch(() => []) : Promise.resolve([]),
        ]);
        if (!cancelled) {
          setOperators(ops);
          setZones(zonesData.zones || []);
          setGroups(zonesData.groups || []);
          setCampaign(camp);

          if (isEdit && existingZones.length > 0) {
             const initObj = {};
             existingZones.forEach(z => {
               initObj[z.zone_id] = { selected: true, qty: z.quantity || '' };
             });
             setSelectedZonesState(initObj);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Errore caricamento dati.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [campaignId, isEdit, existingAssignment]);

  const selectedOperator = operators.find(op => op.id === selectedOperatorId) || null;
  const selectedGroup = groups.find(group => group.id === selectedGroupId) || null;
  const campaignTitle = campaign?.title || campaign?.campaign_name || campaign?.nome || `Campagna ${String(campaignId).slice(0, 8)}`;

  async function handleCreateGroup(event) {
    event.preventDefault();
    if (groupSaving) return;
    const lead = operators.find((operator) => operator.id === newGroupLeadId);
    if (!lead) {
      setError('Seleziona il primo membro e referente WhatsApp.');
      return;
    }
    setGroupSaving(true);
    setError(null);
    try {
      const group = await createOperationalGroup({
        campaignId,
        name: newGroupName,
        leadName: lead.display_name,
      });
      setGroups((current) => [...current, group].sort((left, right) => String(left.name).localeCompare(String(right.name), 'it')));
      setSelectedGroupId(group.id);
      setSelectedOperatorId(lead.id);
      setNewGroupName('');
      setGroupCreatorOpen(false);
      setNotice('Gruppo creato e selezionato. Completa il programma per salvare la persona come membro reale.');
    } catch (err) {
      setError(err?.message || 'Impossibile creare il gruppo.');
    } finally {
      setGroupSaving(false);
    }
  }

  function handleToggleZone(zoneId) {
    setSelectedZonesState(prev => {
      const isSelected = prev[zoneId]?.selected;
      if (isSelected) {
        const next = { ...prev };
        delete next[zoneId];
        return next;
      } else {
        const zone = zones.find(item => item.id === zoneId);
        return { ...prev, [zoneId]: { selected: true, qty: zone?.quantity_assigned ?? '' } };
      }
    });
  }

  function handleZoneQtyChange(zoneId, val) {
    setSelectedZonesState(prev => ({
      ...prev,
      [zoneId]: { ...prev[zoneId], qty: val }
    }));
  }

  function handleZonePriorityChange(zoneId, val) {
    setZonePriorities(prev => ({
      ...prev,
      [zoneId]: val
    }));
  }

  const canGoNext = useCallback(() => {
    if (step === 1) return Boolean(selectedGroupId && selectedOperatorId);
    if (step === 2) return Boolean(startsAt && Object.keys(selectedZonesState).some(id => selectedZonesState[id]?.selected));
    return true;
  }, [step, selectedGroupId, selectedOperatorId, startsAt, selectedZonesState]);

  async function handleSave() {
    if (saving) return; // guard doppio click
    setSaving(true);
    setError(null);
    try {
      const metadata = {
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

      // startsAt/endsAt sono stringhe locali senza offset (dagli input
      // date+time): convertite qui in istanti UTC reali prima dell'invio,
      // mai la stringa grezza (vedi fromLocalDatetimeInputValue).
      const startsAtUtc = fromLocalDatetimeInputValue(startsAt);
      const endsAtUtc = fromLocalDatetimeInputValue(endsAt);

      let result;
      if (isEdit) {
        result = await updateOperatorAssignment(existingAssignment.id, {
          group_id: selectedGroupId || null,
          starts_at: startsAtUtc,
          ends_at: endsAtUtc,
          metadata,
        });
      } else {
        result = await createOperatorAssignment({
          campaignId,
          operatorId: selectedOperatorId,
          groupId: selectedGroupId || null,
          startsAt: startsAtUtc,
          endsAt: endsAtUtc,
          metadata,
          notes,
        });
      }

      // Update Zones priorities
      const priorityPromises = Object.entries(zonePriorities).map(([zId, priorityVal]) => {
         const p = priorityVal === '' ? 0 : Number(priorityVal);
         const orig = zones.find(z => z.id === zId);
         if (orig && Number(orig.priority || 0) !== p) {
           return updateCampaignZoneAssignment(zId, { priority: p }).catch(e => console.error("Priority update err", e));
         }
         return Promise.resolve();
      });
      await Promise.all(priorityPromises);

      // Set operator_assignment_zones
      const selectedZIds = Object.keys(selectedZonesState).filter(k => selectedZonesState[k].selected);
      const zonesToSet = selectedZIds.map(zId => {
        const orig = zones.find(z => z.id === zId);
        const q = selectedZonesState[zId].qty;
        return {
          zone_id: zId,
          municipality_name: orig?.zone_name || orig?.municipality_name || 'Sconosciuto',
          quantity: q ? Number(q) : null
        };
      });

      await setAssignmentZones(result.id, zonesToSet);

      const link = generateDriverAssignmentLink(result.id, result.access_token);
      setSavedAssignment(result);
      setGeneratedLink(link);
      setStep(4); // step finale: card risultato

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

  function getSelectedZoneNames() {
    return Object.keys(selectedZonesState)
       .filter(k => selectedZonesState[k].selected)
       .map(k => zones.find(z => z.id === k)?.zone_name || zones.find(z => z.id === k)?.municipality_name)
       .filter(Boolean);
  }

  function getSelectedProgramRows() {
    return Object.keys(selectedZonesState)
      .filter(id => selectedZonesState[id].selected)
      .map(id => {
        const zone = zones.find(item => item.id === id);
        return {
          id,
          name: zone?.zone_name || zone?.municipality_name || 'Zona',
          quantity: Number(selectedZonesState[id].qty) || null,
          priority: Number(zonePriorities[id] ?? zone?.priority ?? 0),
        };
      })
      .sort((a, b) => a.priority - b.priority);
  }

  function buildWhatsAppMsg() {
    const op = selectedOperator || { display_name: existingAssignment?.operator_name };
    const programRows = getSelectedProgramRows();
    const selZones = programRows.map(row => row.name);
    const totalQty = programRows.reduce((sum, row) => sum + (row.quantity || 0), 0);

    return buildDriverWhatsAppMessage({
      operatorName: op?.display_name || 'Operatore',
      groupName: selectedGroup?.name || null,
      campaignTitle,
      date: startsAt ? new Date(startsAt).toLocaleDateString('it-IT') : 'Da definire',
      startTime: startsAt ? new Date(startsAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : null,
      comuni: selZones,
      zone: selZones,
      programRows,
      qty: totalQty || null,
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
    if (!phone) {
      setNotice('Numero WhatsApp non disponibile. Puoi copiare il messaggio senza segnare il programma come inviato.');
      return;
    }
    const msg = buildWhatsAppMsg();
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    setNotice('Programma preparato in WhatsApp. Lo stato inviato verra mostrato solo dopo un evento reale.');
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
      {step < 4 && (
        <div style={stepBarStyle}>
          {['Gruppo e persona', 'Programma', 'Anteprima'].map((label, idx) => (
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
        <AssignWorkGroupOperatorStep
          Notice={Notice}
          groups={groups}
          selectedGroupId={selectedGroupId}
          setSelectedGroupId={setSelectedGroupId}
          groupCreatorOpen={groupCreatorOpen}
          setGroupCreatorOpen={setGroupCreatorOpen}
          handleCreateGroup={handleCreateGroup}
          newGroupName={newGroupName}
          setNewGroupName={setNewGroupName}
          newGroupLeadId={newGroupLeadId}
          setNewGroupLeadId={setNewGroupLeadId}
          groupSaving={groupSaving}
          operators={operators}
          selectedOperatorId={selectedOperatorId}
          setSelectedOperatorId={setSelectedOperatorId}
          canGoNext={canGoNext}
          setStep={setStep}
          styles={{
            cardStyle,
            eyebrowStyle,
            sectionTitleStyle,
            operatorCardStyle,
            checkStyle,
            secondaryBtnStyle,
            formGridStyle,
            labelStyle,
            inputStyle,
            disabledBtnStyle,
            primaryBtnStyle,
            footerRowStyle,
            operatorAvatarStyle,
          }}
        />
      )}

      {/* ── STEP 2: Programma Operativo ── */}
      {step === 2 && (
        <AssignWorkProgramStep
          Notice={Notice}
          startsAt={startsAt}
          setStartsAt={setStartsAt}
          endsAt={endsAt}
          setEndsAt={setEndsAt}
          notes={notes}
          setNotes={setNotes}
          zones={zones}
          selectedZonesState={selectedZonesState}
          zonePriorities={zonePriorities}
          handleToggleZone={handleToggleZone}
          handleZoneQtyChange={handleZoneQtyChange}
          handleZonePriorityChange={handleZonePriorityChange}
          splitLocalDatetime={splitLocalDatetime}
          combineLocalDatetime={combineLocalDatetime}
          canGoNext={canGoNext}
          setStep={setStep}
          styles={{
            cardStyle,
            eyebrowStyle,
            sectionTitleStyle,
            formGridStyle,
            labelStyle,
            inputStyle,
            textareaStyle,
            footerRowStyle,
            secondaryBtnStyle,
            primaryBtnStyle,
            disabledBtnStyle,
          }}
        />
      )}

      {/* ── STEP 3: Anteprima ── */}
      {step === 3 && (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 3 — Anteprima assegnazione</p>
          <h2 style={sectionTitleStyle}>Conferma i dati</h2>

          <div style={previewGridStyle}>
            <PreviewRow label="Operatore" value={selectedOperator?.display_name || selectedOperatorId} />
            <PreviewRow label="Gruppo" value={selectedGroup?.name || 'Gruppo non disponibile'} />
            <PreviewRow label="Campagna" value={campaignTitle} />
            <PreviewRow label="Programma" value={getSelectedProgramRows().map((row, index) => `${index + 1}. ${row.name} — ${row.quantity ? `${row.quantity.toLocaleString('it-IT')} volantini` : 'quantità da definire'}`).join(' | ')} />
            <PreviewRow label="Totale" value={`${getSelectedProgramRows().reduce((sum, row) => sum + (row.quantity || 0), 0).toLocaleString('it-IT')} volantini`} />
            <PreviewRow label="Data inizio" value={startsAt ? new Date(startsAt).toLocaleString('it-IT') : 'Immediata'} />
            <PreviewRow label="Scadenza" value={endsAt ? new Date(endsAt).toLocaleString('it-IT') : 'Nessuna'} />
            {notes && <PreviewRow label="Note" value={notes} />}
          </div>

          <div style={{ ...footerRowStyle, marginTop: 20 }}>
            <button type="button" style={secondaryBtnStyle} onClick={() => setStep(2)}>← Modifica</button>
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

      {/* ── STEP 4: Risultato ── */}
      {step === 4 && savedAssignment && (
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
            <PreviewRow label="Zone (Programma)" value={getSelectedZoneNames().join(', ') || 'Nessuna specifica'} />
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
              onClick={() => { setStep(2); setSavedAssignment(null); }}
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

// Un valore ISO salvato in DB (es. "2026-08-16T12:25:00+00:00") va convertito
// nell'equivalente orario LOCALE del browser prima di finire in un input
// date/time — stesso trucco di todayIso() ma applicato a una data esistente
// invece che a "adesso". Senza questo, riaprire un'assegnazione per
// modificarla mostrava le cifre UTC grezze come se fossero gia' locali.
function toLocalDatetimeInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const shifted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

// Percorso inverso: un valore "YYYY-MM-DDTHH:mm" digitato/scelto dall'Admin
// (nessun offset di timezone: il browser lo intende come ora locale) va
// convertito in un vero istante UTC prima di essere inviato a Supabase.
// Prima veniva inviata la stringa grezza: Postgres, non avendo offset,
// la interpretava con il fuso del server (UTC) invece che con quello
// dell'Admin — un'ora scelta come "14:25" locale (CEST, UTC+2) veniva
// salvata come 14:25 UTC, cioe' le 16:25 locali mostrate poi al Driver:
// esattamente lo scarto di 2 ore riprodotto nel ticket.
function fromLocalDatetimeInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// startsAt/endsAt restano un'unica stringa "YYYY-MM-DDTHH:mm" (stesso
// formato datetime-local di prima, stessa logica di validazione/anteprima
// gia' esistente altrove nel file) — questi due helper servono solo a
// presentarla come Data + Ora separate nel form, piu' pratiche su mobile
// del widget datetime-local unico.
function splitLocalDatetime(value) {
  if (!value) return { date: '', time: '' };
  const [date = '', time = ''] = value.split('T');
  return { date, time };
}
function combineLocalDatetime(date, time) {
  if (!date) return '';
  return `${date}T${time || '00:00'}`;
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
