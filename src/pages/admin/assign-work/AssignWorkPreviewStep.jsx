import { parseSupplierCompensation } from '../../../lib/services/recipientResolver.js';
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
  recipientValid,
  resolvedRecipient,
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

  const compNum = parseSupplierCompensation(supplierCompensation);
  const compDisplay = (compNum != null)
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

      {/* Box Destinatario Programma (WhatsApp) */}
      <div
        style={{
          marginTop: 18,
          marginBottom: 16,
          padding: '14px 16px',
          borderRadius: 10,
          background: recipientValid && resolvedRecipient?.phone ? 'rgba(46,204,138,.08)' : 'rgba(239,68,68,.08)',
          border: `1px solid ${recipientValid && resolvedRecipient?.phone ? 'rgba(46,204,138,.3)' : 'rgba(239,68,68,.3)'}`,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: recipientValid && resolvedRecipient?.phone ? '#86efac' : '#fca5a5' }}>
          Destinatario programma:
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4 }}>
          {resolvedRecipient?.recipientName || 'Non selezionato'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: recipientValid && resolvedRecipient?.phone ? '#86efac' : '#fca5a5', marginTop: 2 }}>
          {resolvedRecipient?.phone ? `+${resolvedRecipient.phone}` : 'Numero non disponibile'}
        </div>
        {(!recipientValid || !resolvedRecipient?.phone) && (
          <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>
            ⚠️ Numero destinatario non disponibile. Inserisci un recapito valido per il gruppo o fornitore prima di inviare il programma.
          </div>
        )}
      </div>

      <div style={{ ...footerRowStyle, marginTop: 20 }}>
        <button type="button" style={secondaryBtnStyle} onClick={() => setStep(2)}>← Modifica</button>
        <button
          type="button"
          style={saving || !recipientValid || !resolvedRecipient?.phone ? disabledBtnStyle : primaryBtnStyle}
          disabled={saving || !recipientValid || !resolvedRecipient?.phone}
          onClick={handleSave}
        >
          {saving ? 'Salvataggio...' : isEdit ? 'Aggiorna assegnazione' : '✓ Salva e genera link'}
        </button>
      </div>
    </div>
  );
}

