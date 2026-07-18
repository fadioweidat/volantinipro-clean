export const BUSINESS_TARGET_OPTIONS = [
  { value: 'all', label: 'Qualsiasi attività compatibile', categories: [] },
  { value: 'retail', label: 'Negozi', categories: ['Negozio', 'Supermercato', 'Centro comm.', 'Abbigliamento', 'Tabacchi'] },
  { value: 'ristorazione', label: 'Bar e ristoranti', categories: ['Bar', 'Bar/Caffè', 'Pub', 'Ristorante'] },
  { value: 'hospitality', label: 'Hotel e strutture ricettive', categories: ['Hotel', 'Struttura ricettiva'] },
  { value: 'business', label: 'Uffici e aziende', categories: ['Ufficio', 'Azienda'] },
  { value: 'professional_services', label: 'Studi professionali', categories: ['Studio professionale', 'Studio legale', 'Commercialista'] },
  { value: 'sanitario', label: 'Studi medici e farmacie', categories: ['Studio medico', 'Clinica', 'Farmacia'] },
  { value: 'fitness', label: 'Palestre e centri sportivi', categories: ['Palestra', 'Centro sportivo'] },
  { value: 'scuole', label: 'Scuole e centri di formazione', categories: ['Scuola', 'Centro formazione'] },
  { value: 'immobiliare', label: 'Agenzie immobiliari', categories: ['Immobiliare'] },
  { value: 'automotive', label: 'Concessionarie e officine', categories: ['Concessionaria', 'Officina'] },
  { value: 'industrial', label: 'Capannoni e attività industriali', categories: ['Industria', 'Capannone'] },
  { value: 'altro', label: 'Altro', categories: [] },
];

export const BUSINESS_OBJECTIVES = [
  ['information', 'Consegnare materiale informativo'],
  ['service_presentation', 'Presentare un servizio o una fornitura'],
  ['catalogues', 'Distribuire cataloghi'],
  ['coupons', 'Lasciare coupon o promozioni'],
  ['b2b_partnership', 'Proporre una collaborazione B2B'],
  ['professional_event', 'Invitare a un evento professionale'],
  ['display_material', 'Posizionare materiale espositivo'],
  ['other', 'Altro'],
];

export const BUSINESS_DEFINITION_MODES = [
  ['materials', 'Ho una quantità di materiali da distribuire'],
  ['activities', 'Voglio raggiungere un numero di attività'],
  ['both', 'Voglio indicare entrambi'],
];

export const BUSINESS_COPY_MODES = [
  ['fixed_1', '1 copia'],
  ['fixed_2', '2 copie'],
  ['range_3_5', '3–5 copie'],
  ['custom', 'Quantità personalizzata'],
  ['by_category', 'Quantità diversa per categoria'],
  ['to_define', 'Da definire con VolantiniPro'],
];

export const BUSINESS_DELIVERY_METHODS = [
  { value: 'reception', label: 'Consegna alla reception', minutes: 5 },
  { value: 'counter', label: 'Consegna al banco', minutes: 4 },
  { value: 'owner', label: 'Consegna al titolare', minutes: 10 },
  { value: 'manager', label: 'Consegna al responsabile', minutes: 10 },
  { value: 'staff', label: 'Consegna al personale presente', minutes: 5 },
  { value: 'display', label: 'Lasciare il materiale in esposizione', minutes: 8 },
  { value: 'authorization', label: 'Richiedere autorizzazione prima della consegna', minutes: 12 },
  { value: 'presentation', label: 'Breve presentazione commerciale', minutes: 15 },
  { value: 'other', label: 'Altro', minutes: null },
];

export const BUSINESS_RECIPIENTS = [
  ['any', 'Qualsiasi referente disponibile'],
  ['owner', 'Titolare'],
  ['purchasing', 'Responsabile acquisti'],
  ['marketing', 'Responsabile marketing'],
  ['store_manager', 'Direttore del punto vendita'],
  ['reception', 'Reception'],
  ['administration', 'Responsabile amministrativo'],
  ['other', 'Altro'],
];

export const BUSINESS_PROOF_OPTIONS = [
  ['visited_list', 'Elenco attività visitate'],
  ['visit_outcome', 'Esito della visita'],
  ['geolocated_photos', 'Foto geolocalizzate'],
  ['gps', 'GPS'],
  ['recipient_name', 'Nome del referente, quando comunicato'],
  ['delivery_confirmation', 'Firma o conferma di consegna'],
  ['closed_business', 'Segnalazione attività chiusa'],
  ['refusal', 'Segnalazione rifiuto'],
  ['final_report', 'Report finale'],
];

export const BUSINESS_MATERIAL_LOCATIONS = [
  ['at_volantinipro', 'Materiale già presso VolantiniPro'],
  ['pickup_client', 'Ritiro presso il cliente'],
  ['client_delivery', 'Il cliente consegnerà il materiale'],
  ['to_print', 'Materiale ancora da stampare'],
];

export function getBusinessDefaultCopies(data = {}) {
  const mode = data.businessCopiesMode || 'fixed_1';
  if (mode === 'fixed_2') return 2;
  if (mode === 'range_3_5') return Math.max(3, Math.min(5, Number(data.businessDefaultCopies || 3)));
  if (mode === 'custom') return Math.max(1, Number(data.businessCustomCopies || 1));
  if (mode === 'to_define') return null;
  return 1;
}

export function getBusinessCopiesForPoi(poi, data = {}, assignment = null) {
  const explicit = Number(assignment?.copies);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  if (data.businessCopiesMode === 'by_category') {
    const map = data.businessCopiesByCategory || {};
    const category = String(poi?.category || '').trim();
    const mapped = Number(map[category] ?? map[poi?.targetKey]);
    if (Number.isFinite(mapped) && mapped > 0) return Math.round(mapped);
  }
  return getBusinessDefaultCopies(data);
}

export function calculateBusinessMaterials(selectedPois = [], assignments = {}, data = {}) {
  const rows = selectedPois.map((poi) => {
    const copies = getBusinessCopiesForPoi(poi, data, assignments[poi.id]);
    return { ...poi, copies };
  });
  const calculableRows = rows.filter(row => Number.isFinite(row.copies));
  const materialsRequired = calculableRows.length === rows.length
    ? calculableRows.reduce((total, row) => total + row.copies, 0)
    : null;
  const inserted = Math.max(0, Number(data.businessMaterialQuantity ?? data.qty ?? 0) || 0);
  return {
    rows,
    inserted,
    materialsRequired,
    materialsRemaining: materialsRequired == null ? null : Math.max(0, inserted - materialsRequired),
    materialsMissing: materialsRequired == null ? null : Math.max(0, materialsRequired - inserted),
    selectedActivities: rows.length,
  };
}

function calendarDaysInclusive(start, end) {
  if (!start || !end) return null;
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null;
  return Math.floor((to - from) / 86400000) + 1;
}

export function calculateBusinessOperationalPlan(selectedCount, data = {}) {
  const method = BUSINESS_DELIVERY_METHODS.find(item => item.value === data.businessDeliveryMethod);
  const minutesPerVisit = Number(method?.minutes);
  if (!selectedCount || !Number.isFinite(minutesPerVisit) || minutesPerVisit <= 0) {
    return { calculable: false, selectedActivities: selectedCount || 0, minutesPerVisit: null, reason: 'Mancano attività selezionate o tempo medio per visita.' };
  }
  const productiveMinutesPerDay = 420;
  const visitsPerOperatorDay = Math.max(1, Math.floor(productiveMinutesPerDay / minutesPerVisit));
  const operatorDays = Math.ceil(selectedCount / visitsPerOperatorDay);
  const availableDays = calendarDaysInclusive(data.businessPreferredStartDate || data.startDate, data.businessCompleteBy || data.endDate);
  const recommendedOperators = availableDays ? Math.max(1, Math.ceil(operatorDays / availableDays)) : null;
  return {
    calculable: true,
    selectedActivities: selectedCount,
    minutesPerVisit,
    visitsPerOperatorDay,
    operatorDays,
    availableDays,
    recommendedOperators,
    calendarDuration: recommendedOperators ? Math.ceil(operatorDays / recommendedOperators) : null,
  };
}

export function businessCategoryLabel(value) {
  return BUSINESS_TARGET_OPTIONS.find(item => item.value === value)?.label || value || '—';
}

export function businessOptionLabel(options, value) {
  const item = options.find(option => (Array.isArray(option) ? option[0] : option.value) === value);
  return Array.isArray(item) ? item[1] : item?.label || '—';
}
