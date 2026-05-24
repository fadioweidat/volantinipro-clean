export function CalendarStep({ schedule, onScheduleChange, zones, onNext }) {
  return (
    <section className="step-card">
      <div className="section-heading">
        <p className="eyebrow">Step 3</p>
        <h2>Calendario e Smart Pairing</h2>
      </div>

      <div className="split-fields">
        <label className="field">
          <span>Data inizio</span>
          <input type="date" value={schedule.startDate} onChange={(event) => onScheduleChange({ ...schedule, startDate: event.target.value })} />
        </label>
        <label className="field">
          <span>Data fine</span>
          <input type="date" value={schedule.endDate} onChange={(event) => onScheduleChange({ ...schedule, endDate: event.target.value })} />
        </label>
      </div>

      <label className="switch-row">
        <input
          type="checkbox"
          checked={schedule.smartPairing}
          onChange={(event) => onScheduleChange({ ...schedule, smartPairing: event.target.checked })}
        />
        <span>
          <strong>Smart Pairing</strong>
          Abbina la campagna a finestre operative compatibili con altre distribuzioni nella stessa area.
        </span>
      </label>

      {schedule.smartPairing && (
        <label className="field">
          <span>Flessibilità calendario: {schedule.flexibilityDays} giorni</span>
          <input
            type="range"
            min="1"
            max="10"
            step="1"
            value={schedule.flexibilityDays}
            onChange={(event) => onScheduleChange({ ...schedule, flexibilityDays: Number(event.target.value) })}
          />
        </label>
      )}

      <label className="field">
        <span>Note operative</span>
        <textarea
          value={schedule.notes}
          onChange={(event) => onScheduleChange({ ...schedule, notes: event.target.value })}
          placeholder="Es. preferenza mattina, esclusioni vie, contatto referente"
        />
      </label>

      <div className="calendar-note">
        <strong>{zones.length} zona/e in pianificazione</strong>
        <span>Lo Smart Pairing non attiva tracking GPS e non salva una campagna: prepara solo il riepilogo operativo.</span>
      </div>

      <button className="primary-action" type="button" onClick={onNext}>Vai al preventivo</button>
    </section>
  );
}
