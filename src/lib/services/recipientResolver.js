export const RECIPIENT_REQUIRED = 'Numero destinatario non disponibile. Inserisci un recapito valido per il gruppo o fornitore prima di inviare il programma.';

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

// Identita' canonica del destinatario: solo i campi stabili (type, id, name, phone normalizzato).
// Sono metadati transitori di UI e NON fanno parte dell'identita': isManualChoice (blocco di scelta
// manuale, ripristinato in AssignWork all'apertura) e groupName (derivabile dal gruppo).
export function recipientIdentity(recipient) {
  if (!recipient || typeof recipient !== 'object') return null;
  const phone = cleanPhoneNumber(recipient.phone);
  const name = String(recipient.name ?? '').trim();
  if (!recipient.type || !phone || !name) return null;
  return { type: recipient.type, id: recipient.id || null, name, phone };
}

export function recipientIdentityKey(recipient) {
  const identity = recipientIdentity(recipient);
  return identity ? JSON.stringify([identity.type, identity.id, identity.name, identity.phone]) : null;
}

// Due destinatari sono lo stesso destinatario solo se entrambi validi e con identita' canonica uguale.
export function isSameRecipientIdentity(a, b) {
  const keyA = recipientIdentityKey(a);
  return keyA !== null && keyA === recipientIdentityKey(b);
}

export function programMetadata(value) {
  if (typeof value === 'string') {
    try { return programMetadata(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function resolveSupplierRecipientCandidate(supplier, supplierMode = 'registered') {
  if (!supplier) return null;
  const rawPhone = supplier.phone;
  const cleanPhone = cleanPhoneNumber(rawPhone);
  if (!cleanPhone) return null;
  const isManual = supplierMode === 'manual';
  const name = isManual
    ? (supplier.contact_name || supplier.name || null)
    : (supplier.company_name || supplier.contact_name || supplier.name || null);
  if (!name || !name.trim()) return null;
  return {
    type: isManual ? 'manual_supplier' : 'registered_supplier',
    id: supplier.id || null,
    name: name.trim(),
    phone: cleanPhone,
  };
}

export function resolveGroupRecipientCandidate(group, operators = [], suppliers = [], selectedSupplier = null) {
  if (!group) return null;
  let rawPhone = group.phone || group.contact_phone || group.lead_phone || null;
  let contactName = group.lead_name || group.name || null;

  if (!rawPhone) {
    // 1. Check in operators
    const opMatch = (operators || []).find(op =>
      (group.lead_name && op.display_name && op.display_name.trim().toLowerCase() === group.lead_name.trim().toLowerCase()) ||
      (group.lead_name && op.name && op.name.trim().toLowerCase() === group.lead_name.trim().toLowerCase()) ||
      (group.name && op.display_name && op.display_name.trim().toLowerCase() === group.name.trim().toLowerCase()) ||
      (group.name && op.name && op.name.trim().toLowerCase() === group.name.trim().toLowerCase())
    );
    if (opMatch?.phone) {
      rawPhone = opMatch.phone;
      contactName = opMatch.display_name || opMatch.name || contactName;
    } else {
      // 2. Check in selectedSupplier / suppliers
      const allSuppliers = selectedSupplier ? [selectedSupplier, ...(suppliers || [])] : (suppliers || []);
      const suppMatch = allSuppliers.find(supp =>
        (group.lead_name && supp.contact_name && group.lead_name.trim().toLowerCase() === supp.contact_name.trim().toLowerCase()) ||
        (group.lead_name && supp.company_name && group.lead_name.trim().toLowerCase() === supp.company_name.trim().toLowerCase()) ||
        (group.name && supp.contact_name && (
          supp.contact_name.trim().toLowerCase().includes(group.name.trim().toLowerCase()) ||
          group.name.trim().toLowerCase().includes(supp.contact_name.trim().toLowerCase())
        )) ||
        (group.name && supp.company_name && (
          supp.company_name.trim().toLowerCase().includes(group.name.trim().toLowerCase()) ||
          group.name.trim().toLowerCase().includes(supp.company_name.trim().toLowerCase())
        ))
      );
      if (suppMatch?.phone) {
        rawPhone = suppMatch.phone;
        contactName = group.lead_name || suppMatch.contact_name || suppMatch.company_name || group.name;
      }
    }
  }

  const cleanPhone = cleanPhoneNumber(rawPhone);
  if (!cleanPhone || !contactName || !contactName.trim()) return null;
  return {
    type: 'group',
    id: group.id || null,
    name: contactName.trim(),
    phone: cleanPhone,
    groupName: group.name,
  };
}

/**
 * Resolves the operational WhatsApp program recipient with strict canonical precedence:
 * 1. Explicit recipient ONLY when Admin actively selected one (manually chosen or locked)
 * 2. Selected Group Lead / contact
 * 3. Selected Supplier contact
 * 4. HARD BLOCK (valid: false, phone: null, never fall back to Admin/self, customer, or support)
 */
export function resolveProgramRecipient(options = {}) {
  const meta = programMetadata(options.assignment?.metadata);
  const hasExplicitArg = Object.hasOwn(options, 'explicitProgramRecipient');
  const explicitArg = options.explicitProgramRecipient;
  const isExplicitLocked = Boolean(options.isExplicitLocked || explicitArg?.isManualChoice);

  // 1. Explicit recipient ONLY when Admin actively selected one
  if (isExplicitLocked && explicitArg) {
    const phone = cleanPhoneNumber(explicitArg.phone);
    const name = String(explicitArg.name ?? '').trim();
    const type = explicitArg.type;
    if (phone && name && ['manual_supplier', 'registered_supplier', 'group', 'operator'].includes(type)) {
      return {
        valid: true,
        phone,
        recipientName: name,
        recipientType: type,
        recipient: { type, id: explicitArg.id || null, name, phone, isManualChoice: true },
      };
    }
    return {
      valid: false,
      phone: null,
      recipientName: name || 'Non selezionato',
      recipientType: 'none',
      error: RECIPIENT_REQUIRED,
    };
  }

  const group = options.selectedGroup || options.group;
  const supplier = options.selectedSupplier || (options.supplierMode === 'manual' ? options.manualSupplier : null);

  // 2. Selected Group Lead / contact (takes precedence when group is selected)
  if (group) {
    const groupCandidate = resolveGroupRecipientCandidate(
      group,
      options.operators,
      options.suppliers,
      options.selectedSupplier
    );
    if (groupCandidate && groupCandidate.phone) {
      return {
        valid: true,
        phone: groupCandidate.phone,
        recipientName: groupCandidate.name,
        recipientType: 'group',
        recipient: groupCandidate,
      };
    }
  }

  // 3. Selected Supplier contact (if no group or group has no phone)
  if (supplier) {
    const suppCandidate = resolveSupplierRecipientCandidate(supplier, options.supplierMode);
    if (suppCandidate && suppCandidate.phone) {
      return {
        valid: true,
        phone: suppCandidate.phone,
        recipientName: suppCandidate.name,
        recipientType: suppCandidate.type,
        recipient: suppCandidate,
      };
    }
  }

  // Fallback to explicit draft or saved assignment recipient only if no group/supplier was given
  const fallbackExplicit = hasExplicitArg ? explicitArg : meta.explicit_program_recipient;
  if (fallbackExplicit) {
    const phone = cleanPhoneNumber(fallbackExplicit.phone);
    const name = String(fallbackExplicit.name ?? '').trim();
    const type = fallbackExplicit.type;
    if (phone && name && ['manual_supplier', 'registered_supplier', 'group', 'operator'].includes(type)) {
      return {
        valid: true,
        phone,
        recipientName: name,
        recipientType: type,
        recipient: { type, id: fallbackExplicit.id || null, name, phone },
      };
    }
  }

  // 4. HARD BLOCK: Never fall back to Admin/self, customer, or support
  return {
    valid: false,
    phone: null,
    recipientName: 'Non selezionato',
    recipientType: 'none',
    error: RECIPIENT_REQUIRED,
  };
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
