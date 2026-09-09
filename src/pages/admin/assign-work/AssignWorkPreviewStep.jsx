export function AssignWorkPreviewStep({
  PreviewRow,
  supplierMode = 'registered',
  selectedSupplier,
  manualSupplier,
  activeSupplierName,
  activeSupplierContact,
  activeSupplierPhone,
  activeSupplierEmail,
  selectedGroup,
  campaignTitle,
  supplierCompensation,
  getSelectedProgramRows,
  startsAt,
  endsAt,
  notes,
  saving,
  isEdit,
  handleSave,
  setStep,
  styles,
}) {
  const {
    cardStyle,
    eyebrowStyle,
    sectionTitleStyle,
    previewGridStyle,
    footerRowStyle,
    secondaryBtnStyle,
    primaryBtnStyle,
    disabledBtnStyle,
  } = styles;

  const compNum = Number(supplierCompensation);
  const compDisplay = (supplierCompensation != null && supplierCompensation !== '' && !Number.isNaN(compNum))
    ? `€ ${compNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Non specificato';

  const isManual = supplierMode === 'manual';
  const supplierLabel = isManual ? 'Fornitore manuale' : 'Fornitore';

  const contactDetails = [
    activeSupplierContact ? `Ref: ${activeSupplierContact}` : null,
    activeSupplierPhone ? `Tel: ${activeSupplierPhone}` : null,
    activeSupplierEmail ? `Email: ${activeSupplierEmail}` : null,
  ].filter(Boolean).join(' · ');

  const supplierValue = activeSupplierName
    ? `${activeSupplierName}${contactDetails ? ` (${contactDetails})` : ''}`
    : 'Non specificato';

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Step 3 — Anteprima assegnazione</p>
      <h2 style={sectionTitleStyle}>Conferma i dati del Programma</h2>

      <div style={previewGridStyle}>
        <PreviewRow
          label={supplierLabel}
          value={supplierValue}
        />
        <PreviewRow label="Gruppo" value={selectedGroup?.name || 'Nessun gruppo'} />
        <PreviewRow label="Compenso Fornitore" value={compDisplay} />
        <PreviewRow label="Campagna" value={campaignTitle} />
        <PreviewRow
          label="Programma"
          value={getSelectedProgramRows().map((row, index) => `${index + 1}. ${row.name} — ${row.quantity ? `${row.quantity.toLocaleString('it-IT')} volantini` : 'quantità da definire'}`).join(' | ') || 'Nessuna zona'}
        />
        <PreviewRow
          label="Totale volantini"
          value={`${getSelectedProgramRows().reduce((sum, row) => sum + (row.quantity || 0), 0).toLocaleString('it-IT')} volantini`}
        />
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

