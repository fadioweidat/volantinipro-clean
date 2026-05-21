const services = [
  { id: "d2d", title: "Door to Door", body: "Distribuzione residenziale con ISTAT, comuni, settori e density layer." },
  { id: "h2h", title: "Hand to Hand", body: "Presidio in punti ad alta frequentazione con POI reali." },
  { id: "b2b", title: "Business to Business", body: "Copertura attività commerciali con POI categorizzati." },
];

const formats = [
  { id: "A6", label: "A6" },
  { id: "A5", label: "A5" },
  { id: "A4", label: "A4" },
  { id: "pieghevole", label: "Pieghevole" },
];

const campaignTypes = [
  { id: "standard", label: "Standard" },
  { id: "multi_area", label: "Multi-zona" },
  { id: "urgent", label: "Urgente" },
];

export function ServiceStep({ service, onServiceChange, onNext }) {
  return (
    <section className="step-card">
      <div className="section-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Servizio, quantità e formato</h2>
      </div>

      <div className="service-grid">
        {services.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === service.serviceType ? "service-option active" : "service-option"}
            onClick={() => onServiceChange({ serviceType: item.id })}
          >
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </button>
        ))}
      </div>

      <label className="field">
        <span>Quantità volantini</span>
        <input
          type="number"
          min="500"
          step="500"
          value={service.quantity}
          onChange={(event) => onServiceChange({ quantity: Number(event.target.value) })}
        />
      </label>

      <div className="split-fields">
        <label className="field">
          <span>Formato materiale</span>
          <select value={service.format} onChange={(event) => onServiceChange({ format: event.target.value })}>
            {formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Tipo campagna</span>
          <select value={service.campaignType} onChange={(event) => onServiceChange({ campaignType: event.target.value })}>
            {campaignTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      </div>

      <div className="step-footer">
        <span>Il passo successivo userà la mappa GIS collegata a Supabase.</span>
        <button className="primary-action" type="button" onClick={onNext}>Vai alla zona</button>
      </div>
    </section>
  );
}
