import React, { useEffect, useState } from 'react';
import {
  createOperationalGroup,
  deactivateOperationalGroup,
  generateDriverAssignmentLink,
  buildDriverWhatsAppMessage,
  renameOperationalGroup,
  revokeOperatorAssignment,
} from '../../lib/services/admin-api.js';
import { AdminLayout } from './AdminLayout.jsx';
import { AssignWork } from './AssignWork.jsx';
import { loadAdminHomeData } from './AdminDashboard.jsx';
import { GroupsManagerCreateForm } from './groups-manager/GroupsManagerCreateForm.jsx';
import './admin-dashboard.css';

function emptyData() {
  return { campaigns: [], groups: [], operators: [], availability: { campaigns: false, groups: false } };
}

export function GroupsManager({ onNav }) {
  const [state, setState] = useState({ loading: true, error: null, data: emptyData() });
  const [notice, setNotice] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardCampaignId, setWizardCampaignId] = useState('');
  const [wizardGroupId, setWizardGroupId] = useState('');
  const [wizardOperatorId, setWizardOperatorId] = useState('');
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ campaignId: '', name: '', leadOperatorId: '' });
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [busyGroupId, setBusyGroupId] = useState(null);

  async function load() {
    try {
      const data = await loadAdminHomeData();
      setState({ loading: false, error: null, data });
    } catch (error) {
      setState({ loading: false, error: error?.message || 'Errore caricamento gruppi.', data: emptyData() });
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const scrollToDashboardHash = () => {
      const id = window.location.hash.slice(1);
      if (id) window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }));
    };
    scrollToDashboardHash();
    window.addEventListener("hashchange", scrollToDashboardHash);
    return () => window.removeEventListener("hashchange", scrollToDashboardHash);
  }, []);

  const { campaigns, groups, operators, availability } = state.data;
  const realCampaigns = campaigns.filter((campaign) => campaign.quality === 'real');

  function openWizard(campaignId = '', groupId = '', operatorId = '') {
    setWizardCampaignId(campaignId);
    setWizardGroupId(groupId);
    setWizardOperatorId(operatorId);
    setWizardOpen(true);
    window.requestAnimationFrame(() => document.getElementById('nuovo-programma')?.scrollIntoView({ behavior: 'smooth' }));
  }

  function openGroupWhatsApp(group) {
    // Il link deve sempre puntare al programma CORRENTE del gruppo: le
    // assignment sono ordinate piu' recente-prima (selectOptionalTable
    // ordina per created_at desc), quindi activeAssignments[0] e' sempre
    // l'ultima creata e non revocata. Prima si cercava l'assignment del
    // primo membro con telefono (group.members.find) — se quel membro aveva
    // una assignment piu' vecchia per lo stesso gruppo, il link generato
    // era quello vecchio invece del programma davvero attivo oggi.
    const assignment = group.activeAssignments[0] || null;
    const member = group.members.find((item) => (item.id || item.user_id) === assignment?.operator_id && item.phone)
      || group.members.find((item) => item.phone);
    if (!member?.phone || !assignment?.id) {
      setNotice('WhatsApp non disponibile: serve una persona con numero e un programma attivo reale.');
      return;
    }
    const text = buildDriverWhatsAppMessage({
      operatorName: member.display_name,
      groupName: group.name,
      campaignTitle: campaignName(group.campaign),
      date: assignment.starts_at ? new Date(assignment.starts_at).toLocaleDateString('it-IT') : null,
      qty: assignment.quantity_assigned || assignment.quantity || null,
      link: generateDriverAssignmentLink(assignment.id, assignment.access_token),
    });
    window.open(`https://wa.me/${member.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    setNotice('Link del programma reale preparato in WhatsApp; nessun evento di invio è stato inventato.');
  }

  async function submitNewGroup(event) {
    event.preventDefault();
    if (busyGroupId === 'new') return;
    try {
      setBusyGroupId('new');
      const lead = operators.find((operator) => operator.id === groupForm.leadOperatorId);
      const group = await createOperationalGroup({ campaignId: groupForm.campaignId, name: groupForm.name, leadName: lead?.display_name });
      setGroupForm({ campaignId: '', name: '', leadOperatorId: '' });
      setGroupFormOpen(false);
      setNotice('Gruppo creato. Completa il programma per salvare la persona come membro reale.');
      await load();
      openWizard(group.campaign_id, group.id, lead?.id || '');
    } catch (error) { setNotice(error?.message || 'Impossibile creare il gruppo.'); }
    finally { setBusyGroupId(null); }
  }

  async function saveGroupName(group) {
    try {
      setBusyGroupId(group.id);
      await renameOperationalGroup(group.id, editingGroupName);
      setEditingGroupId(null);
      setNotice('Nome gruppo aggiornato.');
      await load();
    } catch (error) { setNotice(error?.message || 'Impossibile rinominare il gruppo.'); }
    finally { setBusyGroupId(null); }
  }

  async function removeMember(group, memberId) {
    const assignments = group.activeAssignments.filter((item) => item.operator_id === memberId);
    if (!assignments.length) return;
    try {
      setBusyGroupId(group.id);
      await Promise.all(assignments.map((item) => revokeOperatorAssignment(item.id)));
      setNotice('Persona rimossa dai programmi attivi. Lo storico è stato conservato.');
      await load();
    } catch (error) { setNotice(error?.message || 'Impossibile rimuovere la persona.'); }
    finally { setBusyGroupId(null); }
  }

  async function deactivateGroup(group) {
    if (!window.confirm(`Revocare tutti i programmi attivi di ${group.name}? Gruppo e storico resteranno disponibili.`)) return;
    try {
      setBusyGroupId(group.id);
      const count = await deactivateOperationalGroup(group.activeAssignments);
      setNotice(count ? `${count} programmi attivi revocati. Gruppo e storico conservati.` : 'Il gruppo non aveva programmi attivi.');
      await load();
    } catch (error) { setNotice(error?.message || 'Impossibile disattivare i programmi del gruppo.'); }
    finally { setBusyGroupId(null); }
  }

  const breadcrumbs = [{ label: 'Dashboard', href: '/admin' }, { label: 'Gruppi' }];

  return (
    <AdminLayout onNav={onNav} title="Gruppi" subtitle="Persone, programmi e assegnazioni per ogni gruppo operativo." breadcrumbs={breadcrumbs}>
      {state.loading && <p style={{ color: 'rgba(255,255,255,.5)' }}>Caricamento gruppi reali...</p>}
      {state.error && <Notice danger>{state.error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <nav className="admin-home__quick" aria-label="Azioni rapide">
        <a href="#link-operatori">Gestisci gruppi</a>
        <a href="#nuovo-programma">Nuovo programma</a>
      </nav>

      <section id="link-operatori" className="admin-home__section" aria-labelledby="groups-title">
        <SectionHeading id="groups-title" eyebrow="Persone" title="I miei gruppi" meta={`${groups.length} gruppi reali`} action="+ Nuovo gruppo" onAction={() => setGroupFormOpen((value) => !value)} />
        {groupFormOpen && (
          <GroupsManagerCreateForm
            groupForm={groupForm}
            setGroupForm={setGroupForm}
            realCampaigns={realCampaigns}
            operators={operators}
            busy={busyGroupId === 'new'}
            onSubmit={submitNewGroup}
            campaignName={campaignName}
          />
        )}
        {groups.length === 0 ? <EmptyState text="Nessun gruppo configurato." action="+ Crea gruppo" onAction={() => setGroupFormOpen(true)} /> : (
          <div className="admin-home__groups-grid">
            {groups.map((group) => (
              <article className="admin-home__group-card" key={group.id}>
                <div className="admin-home__group-title">
                  <div>{editingGroupId === group.id ? <input aria-label="Nuovo nome gruppo" value={editingGroupName} onChange={(event) => setEditingGroupName(event.target.value)} /> : <><h3>{group.name}</h3><p>{campaignName(group.campaign)}</p></>}</div>
                  <StatusDot status={group.presence} />
                </div>
                <div className="admin-home__members">
                  {group.members.length ? group.members.map((member) => <span key={member.id || member.user_id}>{member.display_name || 'Persona'}<button type="button" aria-label={`Rimuovi ${member.display_name || 'persona'}`} onClick={() => removeMember(group, member.id || member.user_id)}>×</button></span>) : <em>Nessuna persona con programma attivo</em>}
                </div>
                <p className="admin-home__history">{group.members.length} {group.members.length === 1 ? 'membro' : 'membri'} · Referente: {group.lead_name || 'non configurato'} · {group.activeAssignments.length} programmi attivi</p>
                <div className="admin-home__card-actions">
                  {editingGroupId === group.id ? <><button type="button" onClick={() => saveGroupName(group)}>Salva nome</button><button type="button" onClick={() => setEditingGroupId(null)}>Annulla</button></> : <button type="button" onClick={() => { setEditingGroupId(group.id); setEditingGroupName(group.name); }}>Rinomina</button>}
                  <button type="button" onClick={() => openWizard(group.campaign_id, group.id)}>Aggiungi persona</button>
                  <button type="button" onClick={() => openWizard(group.campaign_id, group.id)}>Assegna lavoro</button>
                  <button type="button" onClick={() => openGroupWhatsApp(group)}>WhatsApp</button>
                  <a href={`/admin/campaigns/${group.campaign_id}/groups`}>Copia link gruppo</a>
                  <button type="button" disabled={busyGroupId === group.id} onClick={() => deactivateGroup(group)}>Disattiva programmi</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="nuovo-programma" className="admin-home__section" aria-labelledby="program-title">
        <SectionHeading id="program-title" eyebrow="Assegnazione" title="Nuovo programma" meta="Usa il flusso Driver esistente" action={wizardOpen ? 'Chiudi' : 'Apri'} onAction={() => setWizardOpen((value) => !value)} />
        {wizardOpen && (!wizardCampaignId ? (
          <div className="admin-home__campaign-picker"><h3>Step A · Scegli campagna</h3>{realCampaigns.map((campaign) => <button type="button" key={campaign.id} onClick={() => setWizardCampaignId(campaign.id)}><strong>{campaignName(campaign)}</strong><span>{campaign.qty ? `${campaign.qty.toLocaleString('it-IT')} volantini` : 'Quantità non disponibile'}</span></button>)}</div>
        ) : <AssignWork key={`${wizardCampaignId}:${wizardGroupId}:${wizardOperatorId}`} campaignId={wizardCampaignId} initialGroupId={wizardGroupId} initialOperatorId={wizardOperatorId} onSaved={() => load()} onClose={() => { setWizardOpen(false); setWizardCampaignId(''); setWizardGroupId(''); setWizardOperatorId(''); }} />)}
      </section>
    </AdminLayout>
  );
}

function StatusDot({ status }) { return <span className={`admin-home__presence admin-home__presence--${status.key}`}><i />{status.label}</span>; }
function SectionHeading({ id, eyebrow, title, meta, action, onAction }) { return <header className="admin-home__heading"><div><p>{eyebrow}</p><h2 id={id}>{title}</h2>{meta && <span>{meta}</span>}</div>{action && <button type="button" onClick={onAction}>{action}</button>}</header>; }
function EmptyState({ text, action, onAction }) { return <div className="admin-home__empty"><p>{text}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function Notice({ children, danger = false }) { return <div className={`admin-home__notice${danger ? ' admin-home__notice--danger' : ''}`} role={danger ? 'alert' : 'status'}>{children}</div>; }
function campaignName(campaign) { return campaign?.name || campaign?.zone || campaign?.client || 'Campagna non disponibile'; }
