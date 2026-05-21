const serviceLabels = {
  d2d: "Door to Door",
  h2h: "Hand to Hand",
  b2b: "Business to Business",
};

const campaignLabels = {
  standard: "Standard",
  multi_area: "Multi-zona",
  urgent: "Urgente",
};

export function QuoteStep({ quote, service, schedule, zones, omi, onBackToMap }) {
  return (
    <section className="step-card">
      <div className="section-heading">
        <p className="eyebrow">Step 4</p>
        <h2>Preventivo e riepilogo zone</h2>
      </div>

      <div className="quote-box">
        <div>
          <span>Totale IVA inclusa</span>
          <strong>{formatCurrency(quote.total)}</strong>
        </div>
        <p>Riepilogo basato su quantità, formato, calendario e zone salvate nel configuratore.</p>
      </div>

      <div className="summary-list">
        <Row label="Servizio" value={serviceLabels[service.serviceType]} />
        <Row label="Formato" value={service.format} />
        <Row label="Tipo campagna" value={campaignLabels[service.campaignType]} />
        <Row label="Volantini totali" value={formatNumber(quote.totalQuantity)} />
        <Row label="Periodo" value={schedule.startDate && schedule.endDate ? `${schedule.startDate} - ${schedule.endDate}` : "Da definire"} />
        <Row label="Smart Pairing" value={schedule.smartPairing ? `${schedule.flexibilityDays} giorni flessibili` : "No"} />
      </div>

      <div className="zone-summary-list">
        {zones.map((zone) => (
          <article key={zone.id} className="zone-summary">
            <div>
              <h3>{zone.label}</h3>
              <span>{zone.radiusKm} km - {serviceLabels[zone.serviceType]} - {formatNumber(zone.quantity)} volantini</span>
            </div>
            <div className="zone-kpis">
              <Kpi label="Famiglie" value={formatNumber(zone.families)} />
              <Kpi label="Copertura" value={zone.coverage ? `${zone.coverage}%` : "n/d"} />
              <Kpi label="Settori" value={formatNumber(zone.sectorCount)} />
              <Kpi label="POI" value={formatNumber(zone.poiCount)} />
              <Kpi label="OMI" value={formatNumber(zone.omiZoneCount)} />
              <Kpi label="Density" value={zone.density ? `${formatNumber(zone.density)}/kmq` : "n/d"} />
            </div>
            {zone.comuni?.length ? (
              <div className="mini-breakdown">
                {zone.comuni.slice(0, 4).map((row) => (
                  <span key={row.municipality_code || row.comune_name}>
                    {row.comune_name}: {formatNumber(row.households_total)} fam.
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="summary-list muted">
        <Row label="Volantini consigliati da backend" value={formatNumber(quote.recommended)} />
        <Row label="Zone OMI attive" value={formatNumber(omi?.values?.omi_zone_count)} />
        <Row label="Sconto Smart Pairing" value={formatCurrency(quote.discount)} />
      </div>

      <div className="totals">
        <Row label="Imponibile" value={formatCurrency(quote.subtotal)} />
        <Row label="IVA 22%" value={formatCurrency(quote.vat)} />
        <Row label="Totale" value={formatCurrency(quote.total)} strong />
      </div>

      <button className="secondary-action" type="button" onClick={onBackToMap}>Modifica zone GIS</button>
    </section>
  );
}

function Kpi({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={strong ? "row strong" : "row"}>
      <span>{label}</span>
      <b>{value ?? "n/d"}</b>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}

function formatNumber(value) {
  return value == null || value === 0 ? "n/d" : Number(value).toLocaleString("it-IT");
}
