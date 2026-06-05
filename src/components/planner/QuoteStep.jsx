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

const flyerSupplyLabels = {
  ready: "Materiale gia pronto",
  print: "Stampa da includere",
};

const addOns = [
  { id: "design", title: "Grafica & Design", body: "Impaginazione creativa flat per la campagna.", price: 49 },
  { id: "advancedPhotoReport", title: "Report fotografico avanzato", body: "Evidenze fotografiche aggiuntive nel report finale.", price: 39 },
  { id: "analyticsReport", title: "Report Analytics", body: "Lettura sintetica di copertura, zone e opportunita.", price: 59 },
  { id: "photoCertification", title: "Certificazione fotografica", body: "Selezione e validazione delle prove fotografiche.", price: 29 },
  { id: "supervision", title: "Supervisione", body: "Controllo operativo dedicato sulla campagna.", price: 89 },
];

export function QuoteStep({ quote, service, schedule, zones, omi, quoteOptions, onQuoteOptionsChange, onBackToMap }) {
  function toggleAddOn(id) {
    onQuoteOptionsChange((prev) => ({ ...prev, [id]: !prev?.[id] }));
  }

  return (
    <section className="step-card step-reveal">
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
        <Row label="Materiale" value={flyerSupplyLabels[service.flyerSupply] || flyerSupplyLabels.ready} />
        <Row label="Periodo" value={schedule.startDate && schedule.endDate ? `${schedule.startDate} - ${schedule.endDate}` : "Da definire"} />
        <Row label="Smart Pairing" value={schedule.smartPairing ? `${schedule.flexibilityDays} giorni flessibili` : "No"} />
      </div>

      <div className="addon-panel">
        <div className="addon-panel-head">
          <span>Add-on opzionali</span>
          <b>{formatCurrency(quote.addOns)}</b>
        </div>
        <div className="addon-grid">
          {addOns.map((addon) => {
            const active = Boolean(quoteOptions?.[addon.id]);
            return (
              <button
                key={addon.id}
                type="button"
                className={active ? "addon-option active" : "addon-option"}
                onClick={() => toggleAddOn(addon.id)}
                aria-pressed={active}
              >
                <span>
                  <strong>{addon.title}</strong>
                  <small>{addon.body}</small>
                </span>
                <b>{formatCurrency(addon.price)}</b>
              </button>
            );
          })}
        </div>
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
        <Row label="Distribuzione base" value={formatCurrency(quote.distributionBase)} />
        <Row label="Volantini consigliati da backend" value={formatNumber(quote.recommended)} />
        <Row label="Zone OMI attive" value={formatNumber(omi?.values?.omi_zone_count)} />
        <Row label="Sconto Smart Pairing" value={formatCurrency(quote.discount)} />
        <Row label="Stampa" value={quote.printCost ? formatCurrency(quote.printCost) : "Non inclusa"} />
        <Row label="Add-on opzionali" value={formatCurrency(quote.addOns)} />
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
