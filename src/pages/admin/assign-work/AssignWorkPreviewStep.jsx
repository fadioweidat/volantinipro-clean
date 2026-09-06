export function AssignWorkPreviewStep({ PreviewRow, selectedSupplier, selectedOperator, selectedOperatorId, selectedGroup, campaignTitle, getSelectedProgramRows, startsAt, endsAt, notes, saving, isEdit, handleSave, setStep, styles }) {
  const { cardStyle, eyebrowStyle, sectionTitleStyle, previewGridStyle, footerRowStyle, secondaryBtnStyle, primaryBtnStyle, disabledBtnStyle } = styles;
  return (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 3 — Anteprima assegnazione</p>
          <h2 style={sectionTitleStyle}>Conferma i dati</h2>

          <div style={previewGridStyle}>
            {selectedSupplier && (
              <PreviewRow
                label="Fornitore"
                value={`${selectedSupplier.company_name}${selectedSupplier.contact_name ? ` (Ref: ${selectedSupplier.contact_name})` : ''}`}
              />
            )}
            <PreviewRow label="Operatore" value={selectedOperator?.display_name || selectedOperatorId} />
            <PreviewRow label="Gruppo" value={selectedGroup?.name || 'Gruppo non disponibile'} />
            <PreviewRow label="Campagna" value={campaignTitle} />
            <PreviewRow label="Programma" value={getSelectedProgramRows().map((row, index) => `${index + 1}. ${row.name} — ${row.quantity ? `${row.quantity.toLocaleString('it-IT')} volantini` : 'quantità da definire'}`).join(' | ')} />
            <PreviewRow label="Totale" value={`${getSelectedProgramRows().reduce((sum, row) => sum + (row.quantity || 0), 0).toLocaleString('it-IT')} volantini`} />
            <PreviewRow label="Data inizio" value={startsAt ? new Date(startsAt).toLocaleString('it-IT') : 'Immediata'} />
            <PreviewRow label="Scadenza" value={endsAt ? new Date(endsAt).toLocaleString('it-IT') : 'Nessuna'} />
            {notes && <PreviewRow label="Note" value={notes} />}
          </div>

          <div style={{ ...footerRowStyle, marginTop: 20 }}>
            <button type="button" style={secondaryBtnStyle} onClick={() => setStep(2)}>← Modifica</button>
            <button
              type="button"
              style={saving ? disabledBtnStyle : primaryBtnStyle}
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Salvataggio...' : isEdit ? 'Aggiorna assegnazione' : '✓ Salva e genera link'}
            </button>
          </div>
        </div>
  );
}
