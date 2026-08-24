import React from 'react';

export function GroupsManagerCreateForm({ groupForm, setGroupForm, realCampaigns, operators, busy, onSubmit, campaignName }) {
  return (
    <form className="admin-home__group-form" onSubmit={onSubmit}>
      <label>Campagna<select required value={groupForm.campaignId} onChange={(event) => setGroupForm((value) => ({ ...value, campaignId: event.target.value }))}><option value="">Seleziona campagna</option>{realCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaignName(campaign)}</option>)}</select></label>
      <label>Nome gruppo<input required value={groupForm.name} onChange={(event) => setGroupForm((value) => ({ ...value, name: event.target.value }))} /></label>
      <label>Primo membro / referente WhatsApp<select required value={groupForm.leadOperatorId} onChange={(event) => setGroupForm((value) => ({ ...value, leadOperatorId: event.target.value }))}><option value="">Seleziona persona</option>{operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.display_name || `Operatore ${String(operator.id).slice(0, 8)}`}</option>)}</select></label>
      <button className="admin-home__primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Crea gruppo'}</button>
    </form>
  );
}
