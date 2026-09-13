/**
 * Canonical program recipient resolution service.
 * Enforces business priority for WhatsApp / SMS dispatch:
 * 1. Manual supplier contact phone (when assignment is manual or manual_supplier metadata exists)
 * 2. Registered supplier contact phone (from selectedSupplier or supplier_profiles)
 * 3. Operational group contact phone (if present on group object)
 * 4. Genuine driver/operator contact phone (only if explicitly assigned and not defaulting to admin)
 *
 * CRITICAL SAFETY INVARIANT:
 * Never silently fall back to Admin/logged-in user's own number or SUPPORT_WHATSAPP.
 * If no valid recipient phone is available, block send and report 'Numero destinatario non disponibile'.
 */

export function cleanPhoneNumber(raw) {
  if (!raw) return '';
  const cleaned = String(raw).trim().replace(/[^\d+]/g, '');
  // Must have at least 6 digits to be a real phone number
  const digitCount = cleaned.replace(/\D/g, '').length;
  return digitCount >= 6 ? cleaned : '';
}

export function resolveProgramRecipient({
  explicitProgramRecipient = null,
  assignment = null,
  manualSupplier = null,
  selectedSupplier = null,
  group = null,
  operator = null,
  adminPhone = null,
} = {}) {
  const normalizedAdminPhone = cleanPhoneNumber(adminPhone || '+393277175000');
  const meta = assignment?.metadata || {};

  // 1. Explicit Program Recipient Priority
  if (explicitProgramRecipient) {
    const rawPhone = typeof explicitProgramRecipient === 'string'
      ? explicitProgramRecipient
      : explicitProgramRecipient.phone;
    const phone = cleanPhoneNumber(rawPhone);
    if (phone && (!normalizedAdminPhone || phone !== normalizedAdminPhone)) {
      const name = (typeof explicitProgramRecipient === 'object' && explicitProgramRecipient.name)
        ? explicitProgramRecipient.name.trim()
        : 'Destinatario';
      return {
        valid: true,
        phone,
        recipientName: name,
        recipientType: 'explicit',
      };
    }
  }

  const isManual = meta.supplier_mode === 'manual' || Boolean(meta.manual_supplier) || Boolean(manualSupplier?.phone);

  // 2. Manual Supplier Priority
  if (isManual || meta.manual_supplier || manualSupplier) {
    const rawManual = meta.manual_supplier || manualSupplier || {};
    const manualPhone = cleanPhoneNumber(rawManual.phone);
    if (manualPhone && (!normalizedAdminPhone || manualPhone !== normalizedAdminPhone)) {
      const name = rawManual.contact_name?.trim()
        || rawManual.name?.trim()
        || meta.supplier_name
        || group?.name
        || 'Fornitore';
      return {
        valid: true,
        phone: manualPhone,
        recipientName: name,
        recipientType: 'manual_supplier',
      };
    }
  }

  // 3. Registered Supplier Priority
  const suppPhone = cleanPhoneNumber(selectedSupplier?.phone || meta.supplier_phone);
  if (suppPhone && (!normalizedAdminPhone || suppPhone !== normalizedAdminPhone)) {
    const name = selectedSupplier?.contact_name?.trim()
      || selectedSupplier?.company_name?.trim()
      || meta.supplier_name
      || 'Fornitore';
    return {
      valid: true,
      phone: suppPhone,
      recipientName: name,
      recipientType: 'registered_supplier',
    };
  }

  // 4. Operational Group Contact Priority
  const groupPhone = cleanPhoneNumber(group?.phone || group?.contact_phone || group?.lead_phone);
  if (groupPhone && (!normalizedAdminPhone || groupPhone !== normalizedAdminPhone)) {
    const name = group?.lead_name?.trim() || group?.name?.trim() || 'Gruppo';
    return {
      valid: true,
      phone: groupPhone,
      recipientName: name,
      recipientType: 'group',
    };
  }

  // 5. Genuine Assigned Operator Phone (strictly excludes Admin phone)
  const operatorPhone = cleanPhoneNumber(operator?.phone);
  if (operatorPhone && (!normalizedAdminPhone || operatorPhone !== normalizedAdminPhone)) {
    const name = operator?.display_name?.trim() || operator?.name?.trim() || 'Operatore';
    return {
      valid: true,
      phone: operatorPhone,
      recipientName: name,
      recipientType: 'operator',
    };
  }

  // 6. ERROR — Numero destinatario non disponibile (Never fallback to admin, support, customer, or first operator)
  return {
    valid: false,
    phone: null,
    recipientName: meta.supplier_name || group?.name || 'Destinatario sconosciuto',
    recipientType: 'none',
    error: 'Numero destinatario non disponibile',
  };
}
