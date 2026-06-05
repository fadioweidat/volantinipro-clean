const services = [
  {
    id: "d2d",
    title: "Door to Door",
    body: "Distribuzione residenziale con ISTAT, comuni, settori e density layer.",
    accent: "#E8571A",
    includes: ["Famiglie ISTAT", "Settori", "GPS"],
  },
  {
    id: "h2h",
    title: "Hand to Hand",
    body: "Presidio in punti ad alta frequentazione con POI reali.",
    accent: "#0891B2",
    includes: ["POI", "Fasce orarie", "Presidio"],
  },
  {
    id: "b2b",
    title: "Business to Business",
    body: "Copertura attivita commerciali con POI categorizzati.",
    accent: "#7C3AED",
    includes: ["Aziende", "Categorie", "Zone OMI"],
  },
];

const quantities = [5000, 10000, 15000, 25000];

const formats = [
  { id: "A6", label: "A6" },
  { id: "A5", label: "A5" },
  { id: "A4", label: "A4" },
  { id: "DL", label: "DL" },
];

const campaignTypes = [
  { id: "standard", label: "Standard" },
  { id: "multi_area", label: "Multi-zona" },
  { id: "urgent", label: "Urgente" },
];

const flyerSupplyOptions = [
  { id: "ready", label: "Si, li ho gia" },
  { id: "print", label: "No, devo stamparli" },
];

const serviceLabels = Object.fromEntries(services.map((service) => [service.id, service.title]));
const campaignLabels = Object.fromEntries(campaignTypes.map((type) => [type.id, type.label]));
const flyerSupplyLabels = Object.fromEntries(flyerSupplyOptions.map((option) => [option.id, option.label]));

export function ServiceStep({ service, quote, onServiceChange, onNext }) {
  const selectedService = services.find((item) => item.id === service.serviceType) || services[0];

  return (
    <section className="step-card step-reveal">
      <div className="step-progress-card">
        <span>Step 1 di 4</span>
        <b>Configura la base campagna</b>
        <i style={{ width: "25%" }} />
      </div>

      <div className="section-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Servizio, quantita e formato</h2>
      </div>

      <div className="step-with-summary">
        <div className="step-main-stack">
          <div className="service-grid">
            {services.map((item) => {
              const active = item.id === service.serviceType;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={active ? "service-option active" : "service-option"}
                  style={{ "--service-accent": item.accent }}
                  onClick={() => onServiceChange({ serviceType: item.id })}
                  aria-pressed={active}
                >
                  <span className="service-option-head">
                    <strong>{item.title}</strong>
                    {active ? <em aria-hidden="true">✓</em> : null}
                  </span>
                  <span>{item.body}</span>
                  <span className="service-includes" aria-label="Include">
                    {item.includes.map((include) => (
                      <small key={include}>✓ {include}</small>
                    ))}
                  </span>
                  {active ? <span className="service-active-note">Servizio selezionato</span> : null}
                </button>
              );
            })}
          </div>

          <p className="inline-note">
            Prezzo calcolato su zona, quantita e date operative. La distribuzione viene definita nello Step 2.
          </p>

          <div className="field">
            <span>Quantita volantini</span>
            <div className="option-pills">
              {quantities.map((quantity) => (
                <button
                  key={quantity}
                  type="button"
                  className={Number(service.quantity) === quantity ? "option-pill active" : "option-pill"}
                  onClick={() => onServiceChange({ quantity })}
                >
                  {quantity.toLocaleString("it-IT")}
                </button>
              ))}
            </div>
            <input
              type="number"
              min="500"
              step="500"
              value={service.quantity}
              onChange={(event) => onServiceChange({ quantity: Number(event.target.value) })}
            />
          </div>

          <OptionGroup
            label="Tipo volantino"
            value={service.flyerSupply}
            options={flyerSupplyOptions}
            onChange={(flyerSupply) => onServiceChange({ flyerSupply })}
          />

          <OptionGroup
            label="Formato materiale"
            value={service.format}
            options={formats}
            onChange={(format) => onServiceChange({ format })}
          />

          <OptionGroup
            label="Tipo campagna"
            value={service.campaignType}
            options={campaignTypes}
            onChange={(campaignType) => onServiceChange({ campaignType })}
          />

          <div className="step-footer">
            <span>Il passo successivo usa la mappa GIS collegata a Supabase.</span>
            <button className="primary-action" type="button" onClick={onNext}>Vai alla zona</button>
          </div>
        </div>

        <aside className="config-summary sticky-summary" aria-live="polite">
          <div>
            <span>Configurazione attuale</span>
            <strong>{serviceLabels[service.serviceType] || selectedService.title}</strong>
          </div>
          <SummaryRow label="Distribuzione" value="Calcolata sulla tua zona (Step 2)" />
          <SummaryRow label="Quantita" value={Number(service.quantity || 0).toLocaleString("it-IT")} />
          <SummaryRow label="Formato" value={String(service.format || "A5").toUpperCase()} />
          <SummaryRow label="Piano" value={campaignLabels[service.campaignType] || "Standard"} />
          <SummaryRow label="Stampa" value={flyerSupplyLabels[service.flyerSupply] || flyerSupplyLabels.ready} />
          {quote?.printCost ? <SummaryRow label="Stampa stimata" value={formatCurrency(quote.printCost)} highlight /> : null}
          <SummaryRow label="Subtotale parziale" value={formatCurrency((quote?.printCost || 0))} strong />
          <p>Configurazione attuale: distribuzione da calcolare sulla zona · piano {campaignLabels[service.campaignType] || "Standard"} · formato {String(service.format || "A5").toUpperCase()}</p>
        </aside>
      </div>
    </section>
  );
}

function OptionGroup({ label, value, options, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="option-pills">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={option.id === value ? "option-pill active" : "option-pill"}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong, highlight }) {
  return (
    <div className={strong ? "summary-row strong" : highlight ? "summary-row summary-flash" : "summary-row"}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}
