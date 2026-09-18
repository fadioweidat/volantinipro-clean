import { resolveProgramRecipient, parseSupplierCompensation } from '../../../lib/services/recipientResolver.js';

export function ProgramRecipientSummary({ assignment, recipient, compensation }) {
  const resolved = recipient ?? resolveProgramRecipient({ assignment });
  const amount = parseSupplierCompensation(compensation);
  return (
    <div
      aria-label="Riepilogo destinatario programma"
      style={{
        padding: 14,
        margin: '12px 0',
        border: `1px solid ${resolved.valid ? 'rgba(46,204,138,.3)' : 'rgba(239,68,68,.3)'}`,
        borderRadius: 8,
        background: resolved.valid ? 'rgba(46,204,138,.06)' : 'rgba(239,68,68,.06)',
        overflowWrap: 'anywhere',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: resolved.valid ? '#86efac' : '#fca5a5', marginBottom: 4 }}>
        Destinatario programma
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{resolved.recipientName}</div>
      <div style={{ fontSize: 14, color: resolved.valid ? '#86efac' : '#fca5a5', marginTop: 2 }}>
        {resolved.phone ? `+${resolved.phone}` : 'Numero non disponibile'}
      </div>
      {amount != null && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
          Compenso concordato: <strong>€ {amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
      )}
      {!resolved.valid && (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#fca5a5' }}>
          ⚠️ {resolved.error}
        </p>
      )}
    </div>
  );
}

export function getRecipientCandidates({ supplier, supplierMode, group, operators = [] }) {
  const supplierPhone = supplier?.phone;
  const supplierName = supplierMode === 'manual'
    ? (supplier?.contact_name || supplier?.name)
    : (supplier?.company_name || supplier?.name || supplier?.contact_name);

  let groupPhone = group?.phone || group?.contact_phone || group?.lead_phone || null;
  let groupContactName = group?.lead_name || group?.name || null;

  if (group && !groupPhone) {
    const opMatch = (operators || []).find(op =>
      (group.lead_name && op.display_name && op.display_name.trim().toLowerCase() === group.lead_name.trim().toLowerCase()) ||
      (group.lead_name && op.name && op.name.trim().toLowerCase() === group.lead_name.trim().toLowerCase()) ||
      (group.name && op.display_name && op.display_name.trim().toLowerCase() === group.name.trim().toLowerCase()) ||
      (group.name && op.name && op.name.trim().toLowerCase() === group.name.trim().toLowerCase())
    );
    if (opMatch?.phone) {
      groupPhone = opMatch.phone;
      groupContactName = opMatch.display_name || opMatch.name || groupContactName;
    } else if (supplier?.phone) {
      const matchSupplierContact = (
        (group.lead_name && supplier.contact_name && group.lead_name.trim().toLowerCase() === supplier.contact_name.trim().toLowerCase()) ||
        (group.name && supplier.contact_name && (
          supplier.contact_name.trim().toLowerCase().includes(group.name.trim().toLowerCase()) ||
          group.name.trim().toLowerCase().includes(supplier.contact_name.trim().toLowerCase())
        ))
      );
      if (matchSupplierContact) {
        groupPhone = supplier.phone;
        groupContactName = group.lead_name || supplier.contact_name || group.name;
      }
    }
  }

  const rawCandidates = [
    group && groupContactName && groupPhone && {
      type: 'group',
      id: group.id,
      name: groupContactName.trim(),
      phone: groupPhone,
      groupName: group.name,
    },
    supplier && supplierName && supplierPhone && {
      type: supplierMode === 'manual' ? 'manual_supplier' : 'registered_supplier',
      id: supplier.id || null,
      name: supplierName.trim(),
      phone: supplierPhone,
    },
    ...(operators || []).map(op => ({
      type: 'operator',
      id: op.id || op.user_id,
      name: op.display_name || op.name,
      phone: op.phone,
    })),
  ].filter(Boolean);

  const seen = new Set();
  const validCandidates = [];
  for (const raw of rawCandidates) {
    const res = resolveProgramRecipient({ explicitProgramRecipient: raw, isExplicitLocked: true });
    if (res.valid && res.recipient) {
      const k = JSON.stringify(res.recipient);
      if (!seen.has(k)) {
        seen.add(k);
        validCandidates.push(res.recipient);
      }
    }
  }
  return validCandidates;
}

export function ProgramRecipientSelector({ value, onChange, supplier, supplierMode, group, operators, resolvedRecipient }) {
  const candidates = getRecipientCandidates({ supplier, supplierMode, group, operators });
  const key = candidate => JSON.stringify(candidate);
  // Preserve the saved snapshot if a directory contact later changes.
  if (value && !candidates.some(candidate => key(candidate) === key(value))) candidates.unshift(value);

  const activeResolved = resolvedRecipient ?? resolveProgramRecipient({
    explicitProgramRecipient: value,
    selectedGroup: group,
    selectedSupplier: supplier,
    supplierMode,
    operators,
  });

  return (
    <div style={{ margin: '14px 0', padding: 14, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.1)' }}>
      <label style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>
          Destinatario programma <span style={{ color: '#e8571a' }}>*</span>
        </span>
        <select
          value={value ? key(value) : ''}
          onChange={event => onChange(event.target.value ? { ...JSON.parse(event.target.value), isManualChoice: true } : null)}
          style={{ width: '100%', minWidth: 0, padding: '10px 12px', color: '#fff', background: '#0d1e30', border: '1px solid #64748b', borderRadius: 8, fontSize: 13 }}
        >
          <option value="">Automatico (in base a Gruppo / Fornitore)</option>
          {candidates.map((candidate, index) => {
            const roleTag = candidate.type === 'operator'
              ? 'Operatore'
              : candidate.type === 'group'
                ? `Gruppo${candidate.groupName ? `: ${candidate.groupName}` : ''}`
                : 'Fornitore';
            return (
              <option key={`${key(candidate)}:${index}`} value={key(candidate)}>
                {candidate.name} — +{candidate.phone} ({roleTag})
              </option>
            );
          })}
        </select>
      </label>

      {activeResolved.valid ? (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#2ecc8a', fontWeight: 600 }}>
          <span>✓ Destinatario programma:</span>
          <span style={{ color: '#fff' }}>{activeResolved.recipientName}</span>
          <span style={{ color: '#86efac' }}>(+{activeResolved.phone})</span>
          {value?.isManualChoice && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,.1)' }}>Manuale</span>}
        </div>
      ) : (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#fca5a5' }}>
          ⚠️ {activeResolved.error || 'Nessun destinatario valido disponibile con numero di telefono.'}
        </p>
      )}
    </div>
  );
}
