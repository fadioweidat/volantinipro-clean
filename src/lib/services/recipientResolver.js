export const RECIPIENT_REQUIRED = 'Seleziona un destinatario con un numero di telefono valido.';

// wa.me requires international digits. Unprefixed Italian numbers receive +39.
export function cleanPhoneNumber(raw) {
  const value = String(raw ?? '').trim();
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return '';
  let digits = value.replace(/\D/g, '');
  const international = value.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!international && (/^3\d{9}$/.test(digits) || /^0\d{5,10}$/.test(digits))) digits = `39${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}

export function programMetadata(value) {
  if (typeof value === 'string') {
    try { return programMetadata(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function resolveProgramRecipient(options = {}) {
  const meta = programMetadata(options.assignment?.metadata);
  // An explicitly cleared/invalid draft must not revert to the saved recipient.
  const recipient = Object.hasOwn(options, 'explicitProgramRecipient')
    ? options.explicitProgramRecipient : meta.explicit_program_recipient;
  const phone = cleanPhoneNumber(recipient?.phone);
  const name = String(recipient?.name ?? '').trim();
  const type = recipient?.type;
  if (!phone || !name || !['manual_supplier', 'registered_supplier', 'group', 'operator'].includes(type)) {
    return { valid: false, phone: null, recipientName: name || 'Non selezionato', recipientType: 'none', error: RECIPIENT_REQUIRED };
  }
  // Only explicit choices reach here, including intentional self selection.
  // No admin, support, supplier or arbitrary operator fallback exists.
  return { valid: true, phone, recipientName: name, recipientType: type,
    recipient: { type, id: recipient.id || null, name, phone } };
}

export function parseSupplierCompensation(value) {
  if (value == null || String(value).trim() === '') return null;
  const amount = Number(String(value).replace(',', '.'));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function savedSupplierCompensation(assignment, campaign) {
  const meta = programMetadata(assignment?.metadata);
  // An explicitly saved empty amount remains empty after reload.
  return parseSupplierCompensation(Object.hasOwn(meta, 'supplier_compensation')
    ? meta.supplier_compensation : programMetadata(campaign?.metadata).supplier_compensation);
}

export function prefillSupplierCompensation({ quotes = [], assignment, campaign, supplierId } = {}) {
  // Editing preserves the saved agreement/manual amount, even if empty.
  if (Object.hasOwn(programMetadata(assignment?.metadata), 'supplier_compensation')) {
    return savedSupplierCompensation(assignment, campaign);
  }
  const accepted = quotes.filter(q => q.quote_status === 'accepted' && q.supplier_id
    && (!supplierId || q.supplier_id === supplierId));
  const amount = accepted.length === 1 ? parseSupplierCompensation(accepted[0].total_amount) : null;
  return amount ?? savedSupplierCompensation(assignment, campaign);
}
