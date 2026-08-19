const QUOTE_SOURCE = 'quote_requests';

const clean = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numberOrNull = (value) => value != null && Number.isFinite(Number(value)) ? Number(value) : null;

export function quoteLeadState(campaign = {}) {
  const value = String(campaign.rawStatus || campaign.status || '').trim().toLowerCase();
  const contactedAt = campaign.contactedAt || campaign.metadata?.contacted_at || null;
  if (['completed', 'converted', 'approved', 'confirmed', 'active', 'in_progress', 'pagato'].includes(value)) return { key: 'converted', label: 'Convertito' };
  if (['closed', 'cancelled', 'rejected'].includes(value)) return { key: 'closed', label: 'Chiuso' };
  if (contactedAt || value === 'contacted') return { key: 'contacted', label: 'Contattato' };
  if (value === 'viewed') return { key: 'viewed', label: 'Visto' };
  if (['new', 'pending', 'pending_review'].includes(value)) return { key: 'new', label: 'Nuovo' };
  return { key: 'unavailable', label: 'Stato non disponibile' };
}

export function isQuickQuoteCampaign(campaign = {}) {
  return String(campaign.leadSource || campaign.source || campaign.metadata?.source || '').toLowerCase() === QUOTE_SOURCE;
}

export function customerAccessForCampaign(campaign = {}) {
  const sessions = Number(campaign.ops?.sessionCount || 0);
  const completedSessions = Number(campaign.ops?.completedSessions || 0);
  const approvedPhotos = Number(campaign.ops?.approvedPhotos || 0);
  return {
    customerArea: campaign.createdBy ? { available: true, label: 'Attiva' } : { available: false, label: 'Non attiva' },
    tracking: sessions > 0 ? { available: true, label: 'Disponibile' } : { available: false, label: 'Non ancora disponibile' },
    report: completedSessions > 0 ? { available: true, label: 'Disponibile' } : { available: false, label: 'Non disponibile' },
    photos: { available: approvedPhotos > 0, count: approvedPhotos, label: `${approvedPhotos} disponibili` },
  };
}

export function buildCommercialSnapshot({ campaigns = [], today } = {}) {
  const dateKey = today || new Date().toISOString().slice(0, 10);
  const quotes = campaigns
    .filter((campaign) => campaign.quality === 'real' && isQuickQuoteCampaign(campaign))
    .map((campaign) => ({
      id: campaign.id,
      name: clean(campaign.client) || `Preventivo ${String(campaign.id || '').slice(0, 8)}`,
      zone: clean(campaign.zone) || 'Zona non disponibile',
      quantity: numberOrNull(campaign.qty),
      createdAt: campaign.createdAt || campaign.date || null,
      state: quoteLeadState(campaign),
      phone: clean(campaign.phone),
      email: clean(campaign.email),
      company: clean(campaign.company),
      campaignId: campaign.id || null,
      access: customerAccessForCampaign(campaign),
    }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return {
    quotes,
    latest: quotes.slice(0, 5),
    metrics: {
      newToday: quotes.filter((quote) => quote.state.key === 'new' && String(quote.createdAt || '').slice(0, 10) === dateKey).length,
      toContact: quotes.filter((quote) => ['new', 'viewed'].includes(quote.state.key)).length,
      converted: quotes.filter((quote) => quote.state.key === 'converted').length,
      closed: quotes.filter((quote) => quote.state.key === 'closed').length,
    },
  };
}

export function buildConsultationWhatsAppMessage({ name, zone } = {}) {
  return `Buongiorno ${clean(name) || 'Cliente'},\nsono Fadi di VolantiniPro.\nHo ricevuto la sua richiesta di consulenza${clean(zone) ? ` per la distribuzione volantini a ${clean(zone)}` : ''}.\n\nQuando possiamo sentirci?`;
}
