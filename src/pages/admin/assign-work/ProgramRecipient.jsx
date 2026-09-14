import { resolveProgramRecipient, parseSupplierCompensation } from '../../../lib/services/recipientResolver.js';

export function ProgramRecipientSummary({ assignment, recipient, compensation }) {
  const resolved = recipient ?? resolveProgramRecipient({ assignment });
  const amount = parseSupplierCompensation(compensation);
  return <div aria-label="Riepilogo destinatario programma" style={{ padding: 12, margin: '12px 0', border: '1px solid #64748b', borderRadius: 8, overflowWrap: 'anywhere' }}>
    <div>Destinatario: <strong>{resolved.recipientName}</strong></div>
    <div>Telefono: {resolved.phone ? `+${resolved.phone}` : 'Non disponibile'}</div>
    <div>Compenso: {amount == null ? 'Compenso non definito' : `€ ${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</div>
    {!resolved.valid && <p role="alert">{resolved.error}</p>}
  </div>;
}

export function ProgramRecipientSelector({ value, onChange, supplier, supplierMode, group, operators }) {
  const candidates = [
    supplier && { type: supplierMode === 'manual' ? 'manual_supplier' : 'registered_supplier', id: supplier.id || null,
      name: supplier.contact_name || supplier.company_name || supplier.name, phone: supplier.phone },
    group && { type: 'group', id: group.id, name: group.lead_name || group.name, phone: group.phone || group.contact_phone || group.lead_phone },
    ...operators.map(op => ({ type: 'operator', id: op.id || op.user_id, name: op.display_name || op.name, phone: op.phone })),
  ].filter(Boolean).map(candidate => resolveProgramRecipient({ explicitProgramRecipient: candidate }))
    .filter(candidate => candidate.valid).map(candidate => candidate.recipient);
  const key = candidate => JSON.stringify(candidate);
  // Preserve the saved snapshot if a directory contact later changes.
  if (value && !candidates.some(candidate => key(candidate) === key(value))) candidates.unshift(value);
  return <label style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
    Destinatario programma
    <select value={value ? key(value) : ''} onChange={event => onChange(event.target.value ? JSON.parse(event.target.value) : null)}
      style={{ width: '100%', minWidth: 0, padding: 12, color: '#fff', background: '#0d1e30', border: '1px solid #64748b', borderRadius: 8 }}>
      <option value="">Seleziona destinatario</option>
      {candidates.map((candidate, index) => <option key={`${key(candidate)}:${index}`} value={key(candidate)}>
        {candidate.name} — +{candidate.phone} ({candidate.type === 'operator' ? 'Operatore' : candidate.type === 'group' ? 'Gruppo' : 'Fornitore'})
      </option>)}
    </select>
  </label>;
}
