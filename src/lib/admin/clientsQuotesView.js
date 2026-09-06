// TICKET — ADMIN CLIENTI & PREVENTIVI: dashboard stati / filtri / riepilogo.
// Logica PURA di sola presentazione: KPI, filtro rapido, ricerca estesa,
// ordinamento, template WhatsApp Admin->Cliente, testo "Copia riepilogo".
// Nessuna business logic: legge SOLO le righe gia' prodotte da
// getClientsQuotesOverview (paymentStatus / assignment / gpsStatus / ...),
// non tocca pagamento, pricing, gateway.

export const CQ_FILTERS = ['tutti', 'da_pagare', 'pagati', 'da_assegnare', 'in_lavorazione', 'completati'];
export const CQ_SORTS = ['default', 'recenti', 'vecchi', 'importo_desc', 'importo_asc'];

export const CQ_FILTER_LABEL = {
  tutti: 'Tutti',
  da_pagare: 'Da pagare',
  pagati: 'Pagati',
  da_assegnare: 'Da assegnare',
  in_lavorazione: 'In lavorazione',
  completati: 'Completati',
};

export const CQ_SORT_LABEL = {
  default: 'Ordine consigliato',
  recenti: 'Piu’ recenti',
  vecchi: 'Piu’ vecchi',
  importo_desc: 'Importo maggiore',
  importo_asc: 'Importo minore',
};

// Colori stato coerenti col resto della pagina (arancio/verde/grigio/blu).
export const CQ_FILTER_COLOR = {
  tutti: '#9CA3AF',
  da_pagare: '#F59E0B',
  pagati: '#10B981',
  da_assegnare: '#60A5FA',
  in_lavorazione: '#A78BFA',
  completati: '#047857',
};

// Un solo "bucket" di ciclo di vita per riga (mutuamente esclusivo), derivato
// dai soli stati reali gia' calcolati a monte.
export function lifecycleBucket(row) {
  if (!row) return 'da_pagare';
  if (row.paymentStatus !== 'pagato') return 'da_pagare'; // da_pagare + non_disponibile
  if (row.gpsStatus === 'storico') return 'completato';
  if (!row.assignment) return 'da_assegnare';
  return 'in_lavorazione';
}

// Conteggi KPI dai dati REALI della pagina. "pagati" e' volutamente un
// superinsieme (tutti quelli con paymentStatus 'pagato'); gli altri quattro
// bucket partizionano le righe.
export function computeKpiCounts(rows = []) {
  const c = { totali: rows.length, da_pagare: 0, pagati: 0, da_assegnare: 0, in_lavorazione: 0, completati: 0 };
  for (const r of rows) {
    if (r?.paymentStatus === 'pagato') c.pagati += 1;
    const b = lifecycleBucket(r);
    if (b === 'da_pagare') c.da_pagare += 1;
    else if (b === 'da_assegnare') c.da_assegnare += 1;
    else if (b === 'in_lavorazione') c.in_lavorazione += 1;
    else if (b === 'completato') c.completati += 1;
  }
  return c;
}

export function matchesFilter(row, filter) {
  if (!filter || filter === 'tutti') return true;
  if (filter === 'pagati') return row?.paymentStatus === 'pagato';
  const b = lifecycleBucket(row);
  if (filter === 'da_pagare') return b === 'da_pagare';
  if (filter === 'da_assegnare') return b === 'da_assegnare';
  if (filter === 'in_lavorazione') return b === 'in_lavorazione';
  if (filter === 'completati') return b === 'completato';
  return true;
}

// Ricerca estesa: nome cliente, comune/zona, campaign_id, email, telefono.
export function matchesSearch(row, query) {
  const s = String(query || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [
    row?.client, row?.zone, row?.name, row?.id,
    ...(Array.isArray(row?.comuni) ? row.comuni : []),
    row?.email, row?.phone,
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(s);
}

export function sortRows(rows = [], sort = 'default') {
  const arr = rows.slice();
  const ts = (r) => {
    const t = new Date(r?.createdAt || r?.date || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const amt = (r) => (r?.total != null && Number.isFinite(Number(r.total)) ? Number(r.total) : -Infinity);
  if (sort === 'recenti') return arr.sort((a, b) => ts(b) - ts(a));
  if (sort === 'vecchi') return arr.sort((a, b) => ts(a) - ts(b));
  if (sort === 'importo_desc') return arr.sort((a, b) => amt(b) - amt(a));
  if (sort === 'importo_asc') return arr.sort((a, b) => amt(a) - amt(b));
  // default: prima DA PAGARE piu' recenti, poi PAGATI recenti, poi il resto.
  const rank = (r) => (lifecycleBucket(r) === 'da_pagare' ? 0 : r?.paymentStatus === 'pagato' ? 1 : 2);
  return arr.sort((a, b) => rank(a) - rank(b) || ts(b) - ts(a));
}

export function applyClientsQuotesView(rows = [], { search = '', filter = 'tutti', sort = 'default' } = {}) {
  const matched = rows.filter((r) => matchesSearch(r, search) && matchesFilter(r, filter));
  return sortRows(matched, sort);
}

const SERVICE_LABEL = { d2d: 'Door to Door', h2h: 'Hand to Hand', b2b: 'Business to Business' };
export function serviceLabel(service) {
  return SERVICE_LABEL[service] || 'Servizio n/d';
}

export function shortCampaignId(id) {
  const s = String(id || '');
  if (!s) return 'n/d';
  return s.length > 8 ? `${s.slice(0, 8)}…` : s;
}

function euro(value) {
  return value != null && Number.isFinite(Number(value))
    ? `€ ${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;
}
function qtyLabel(value) {
  return value ? `${Number(value).toLocaleString('it-IT')} volantini` : null;
}
function zoneLabel(row) {
  return (Array.isArray(row?.comuni) && row.comuni.length ? row.comuni.join(', ') : row?.zone) || null;
}

// §6 — template Admin -> Cliente (NON il messaggio Cliente -> VolantiniPro).
export function buildAdminClientWhatsAppMessage(row) {
  const nome = row?.client || 'Cliente';
  const id = shortCampaignId(row?.id).replace('…', '');
  return [
    `Buongiorno ${nome},`,
    `la contattiamo da VolantiniPro in merito alla campagna ${id}.`,
    '',
    `Servizio: ${serviceLabel(row?.service)}`,
    `Zona: ${zoneLabel(row) || 'da definire'}`,
    `Quantita: ${qtyLabel(row?.qty) || 'da definire'}`,
    `Totale: ${euro(row?.total) || 'da definire'}`,
    'Stato: pagamento da completare.',
    '',
    'Le inviamo le informazioni necessarie per completare il pagamento.',
  ].join('\n');
}

// §7 — testo "Copia riepilogo" per WhatsApp/email/manuale.
export function buildClientsQuotesSummary(row) {
  const paymentText = row?.paymentStatus === 'pagato' ? 'PAGATO'
    : row?.paymentStatus === 'da_pagare' ? 'DA PAGARE' : 'DATO NON DISPONIBILE';
  return [
    `Cliente: ${row?.client || 'n/d'}`,
    `ID campagna: ${row?.id || 'n/d'}`,
    `Servizio: ${serviceLabel(row?.service)}`,
    `Zona: ${zoneLabel(row) || 'n/d'}`,
    `Quantita: ${qtyLabel(row?.qty) || 'n/d'}`,
    `Totale: ${euro(row?.total) || 'n/d'}`,
    `Stato pagamento: ${paymentText}`,
  ].join('\n');
}
