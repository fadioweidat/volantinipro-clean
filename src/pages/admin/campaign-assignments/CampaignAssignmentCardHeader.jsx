export function CampaignAssignmentCardHeader({ assignment, meta, effectiveStatus, StatusBadge, MetaChip, styles }) {
  const { metaRowStyle } = styles;
  return (
    <>
      {/* Row 1: name + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: '#fff', fontSize: 15 }}>
            {assignment.operator_name || `Operatore ${String(assignment.operator_id || '').slice(0, 8)}`}
          </strong>
          {assignment.operator_phone && (
            <span style={{ marginLeft: 10, color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
              {assignment.operator_phone}
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
