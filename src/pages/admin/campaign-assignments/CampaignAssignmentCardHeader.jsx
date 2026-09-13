export function CampaignAssignmentCardHeader({ assignment, meta, effectiveStatus, StatusBadge, MetaChip, styles }) {
  const { metaRowStyle } = styles;
  const isSupplier = meta?.supplier_mode === 'manual' || meta?.supplier_mode === 'registered' || Boolean(meta?.manual_supplier) || Boolean(meta?.supplier_id);
  const displayName = assignment.operator_name
    || (isSupplier ? (meta.supplier_name || meta.manual_supplier?.name || 'Fornitore') : (assignment.operator_id ? `Operatore ${String(assignment.operator_id).slice(0, 8)}` : 'Assegnazione'));
  const displayPhone = assignment.operator_phone
    || (isSupplier ? (meta.manual_supplier?.phone || meta.supplier_phone || '') : '');

  return (
    <>
      {/* Row 1: name + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#fff', fontSize: 15 }}>
            {displayName}
          </strong>
          {isSupplier && !assignment.operator_name && (
            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: 500 }}>
              Fornitore
            </span>
          )}
          {displayPhone && (
            <span style={{ marginLeft: 10, color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
              {displayPhone}
            </span>
          )}
        </div>
        <StatusBadge status={effectiveStatus} />
      </div>

      {/* Row 2: comuni, zone, qty */}
      <div style={metaRowStyle}>
        {meta.comuni?.length > 0 && (
          <MetaChip icon="📍" label={meta.comuni.join(', ')} />
        )}
        {meta.zone_labels?.length > 0 && (
          <MetaChip icon="🗂" label={meta.zone_labels.join(', ')} />
        )}
        {meta.qty && (
          <MetaChip icon="📦" label={`${Number(meta.qty).toLocaleString('it-IT')} volantini`} />
        )}
      </div>
    </>
  );
}
