export function NewCampaignOperationalLinksPanel({ campaignId, LinkRow, EmptyState, styles }) {
  const { cardStyle, eyebrowStyle } = styles;
  return (
    <aside style={cardStyle}>
      <p style={eyebrowStyle}>Link operativi</p>
      {campaignId ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <LinkRow label="Tracking driver" href={`/driver/tracking/${campaignId}`} />
          <LinkRow label="Gruppi" href={`/admin/campaigns/${campaignId}/groups`} />
          <LinkRow label="Operations" href={`/admin/campaigns/${campaignId}/operations`} />
          <LinkRow label="Report cliente" href={`/client/campaigns/${campaignId}/report`} />
        </div>
      ) : (
        <EmptyState text="I link saranno disponibili dopo la creazione della campagna." />
      )}
    </aside>
  );
}
