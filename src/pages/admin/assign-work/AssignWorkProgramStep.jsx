export function AssignWorkProgramStep({
  Notice,
  startsAt,
  setStartsAt,
  endsAt,
  setEndsAt,
  supplierCompensation,
  setSupplierCompensation,
  notes,
  setNotes,
  zones,
  selectedZonesState,
  zonePriorities,
  handleToggleZone,
  handleZoneQtyChange,
  handleZonePriorityChange,
  splitLocalDatetime,
  combineLocalDatetime,
  canGoNext,
  setStep,
  styles,
}) {
  const {
    cardStyle,
    eyebrowStyle,
    sectionTitleStyle,
    formGridStyle,
    labelStyle,
    inputStyle,
    textareaStyle,
    footerRowStyle,
    secondaryBtnStyle,
    primaryBtnStyle,
    disabledBtnStyle,
  } = styles;

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Step 2 — Programma Operativo</p>
      <h2 style={sectionTitleStyle}>Configura il Programma di Lavoro</h2>

      <div style={formGridStyle}>
        <label style={labelStyle}>
          Data inizio *
          <input
            type="date"
            value={splitLocalDatetime(startsAt).date}
            onChange={(e) => setStartsAt(combineLocalDatetime(e.target.value, splitLocalDatetime(startsAt).time))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Ora inizio *
          <input
            type="time"
            value={splitLocalDatetime(startsAt).time}
            onChange={(e) => setStartsAt(combineLocalDatetime(splitLocalDatetime(startsAt).date, e.target.value))}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Data scadenza (facoltativa)
          <input
            type="date"
            value={splitLocalDatetime(endsAt).date}
            onChange={(e) => setEndsAt(e.target.value ? combineLocalDatetime(e.target.value, splitLocalDatetime(endsAt).time || '23:59') : '')}
            style={inputStyle}
            min={splitLocalDatetime(startsAt).date || undefined}
          />
        </label>
        <label style={labelStyle}>
          Ora scadenza (facoltativa)
          <input
            type="time"
            value={splitLocalDatetime(endsAt).time}
            onChange={(e) => setEndsAt(combineLocalDatetime(splitLocalDatetime(endsAt).date || splitLocalDatetime(startsAt).date, e.target.value))}
            style={inputStyle}
            disabled={!splitLocalDatetime(endsAt).date}
          />
        </label>
      </div>

      {/* Compenso Fornitore */}
      <div style={{ marginTop: 14, marginBottom: 14, padding: 14, borderRadius: 10, background: 'rgba(232,87,26,.06)', border: '1px solid rgba(232,87,26,.25)' }}>
        <label style={{ ...labelStyle, marginBottom: 4 }}>
          Compenso Fornitore (€)
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="es. 450.00"
            value={supplierCompensation}
            onChange={(e) => setSupplierCompensation(e.target.value)}
            style={{ ...inputStyle, maxWidth: 220, marginTop: 4 }}
          />
        </label>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>
          Importo netto riconosciuto al fornitore (da offerta marketplace o concordato). Rigorosamente separato dal prezzo pagato dal cliente.
        </p>
      </div>

      <label style={{ ...labelStyle, marginBottom: 12 }}>
        Note operative per il Fornitore (visibili nel programma)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Istruzioni specifiche, punti di carico volantini, orari di accesso..."
          rows={2}
          style={textareaStyle}
        />
      </label>

      <h3 style={{ ...sectionTitleStyle, fontSize: 16, marginTop: 24, marginBottom: 8 }}>Comuni / Zone disponibili</h3>
      {zones.length === 0 ? (
        <Notice text="Nessuna zona configurata per questa campagna." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {zones.map((z) => {
            const isSelected = selectedZonesState[z.id]?.selected || false;
            const assignedQty = selectedZonesState[z.id]?.qty || '';
            const currentPriority = zonePriorities[z.id] !== undefined ? zonePriorities[z.id] : (z.priority || 0);

            return (
              <div
                key={z.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 8,
                  background: isSelected ? 'rgba(232,87,26,.1)' : 'rgba(0,0,0,.15)',
                  border: `1px solid ${isSelected ? 'rgba(232,87,26,.4)' : 'rgba(255,255,255,.05)'}`,
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: '1 1 200px' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleZone(z.id)}
                    style={{ width: 16, height: 16, accentColor: '#e8571a' }}
                  />
                  <strong style={{ color: '#fff', fontSize: 14 }}>{z.zone_name || z.municipality_name}</strong>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
                  Qtà:
                  <input
                    type="number"
                    placeholder="es. 4000"
                    value={assignedQty}
                    onChange={(e) => handleZoneQtyChange(z.id, e.target.value)}
                    disabled={!isSelected}
                    style={{ ...inputStyle, width: 90, padding: '6px 10px' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
                  Ordine:
                  <input
                    type="number"
                    value={currentPriority}
                    onChange={(e) => handleZonePriorityChange(z.id, e.target.value)}
                    style={{ ...inputStyle, width: 70, padding: '6px 10px' }}
                  />
                </label>
              </div>
            );
          })}
        </div>
      )}

      <div style={footerRowStyle}>
        <button type="button" style={secondaryBtnStyle} onClick={() => setStep(1)}>← Indietro</button>
        <button
          type="button"
          style={canGoNext() ? primaryBtnStyle : disabledBtnStyle}
          disabled={!canGoNext()}
          onClick={() => setStep(3)}
        >
          Anteprima →
        </button>
      </div>
    </div>
  );
}
