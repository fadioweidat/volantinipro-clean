import { cleanPhoneNumber, parseSupplierCompensation } from '../../../lib/services/recipientResolver.js';

export function AssignWorkResultStep({
  PreviewRow,
  Notice,
  savedAssignment,
  generatedLink,
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
  endsAt,
  getSelectedZoneNames,
  copiedLink,
  copiedMsg,
  handleCopyLink,
  handleCopyMsg,
  handleWhatsApp,
  recipientValid,
  resolvedRecipient,
  handleRevoke,
  buildWhatsAppMsg,
  saving,
  setStep,
  setSavedAssignment,
  onClose,
  styles,
}) {
  const {
    cardStyle,
    eyebrowStyle,
    sectionTitleStyle,
    previewGridStyle,
    linkBoxStyle,
    linkTextStyle,
    msgPreviewStyle,
    primaryBtnStyle,
    secondaryBtnStyle,
    whatsappBtnStyle,
  } = styles;

  const activeRecipient = resolvedRecipient || resolveProgramRecipient({ assignment: savedAssignment });
  const isSendDisabled = !recipientValid || !activeRecipient?.valid || !activeRecipient?.phone;

  const compNum = parseSupplierCompensation(supplierCompensation);
  const compDisplay = (compNum != null)
    ? `€ ${compNum.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const isManual = supplierMode === 'manual';
  const supplierLabel = isManual ? 'Fornitore manuale' : 'Fornitore';

  const contactDetails = [
    activeSupplierContact ? `Ref: ${activeSupplierContact}` : null,
    activeSupplierPhone ? `Tel: ${activeSupplierPhone}` : null,
    activeSupplierEmail ? `Email: ${activeSupplierEmail}` : null,
  ].filter(Boolean).join(' · ');

  const supplierDisplayValue = activeSupplierName
    ? `${activeSupplierName}${contactDetails ? ` (${contactDetails})` : ''}`
    : 'Non specificato';

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 32 }}>🎉</span>
        <div>
          <p style={eyebrowStyle}>Programma assegnato con successo</p>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Lavoro Assegnato al Fornitore</h2>
        </div>
      </div>

      {savedAssignment.status === 'revoked' && (
        <Notice danger text="Assegnazione revocata. Il link non è più utilizzabile." />
      )}

      <div style={previewGridStyle}>
        <PreviewRow
          label={supplierLabel}
          value={supplierDisplayValue}
        />
        <PreviewRow label="Gruppo" value={selectedGroup?.name || 'Nessun gruppo'} />
        {compDisplay && <PreviewRow label="Compenso Fornitore" value={compDisplay} />}
        <PreviewRow label="Campagna" value={campaignTitle} />
        <PreviewRow label="Zone (Programma)" value={getSelectedZoneNames().join(', ') || 'Nessuna specifica'} />
        <PreviewRow label="Stato" value={savedAssignment.status} />
        {endsAt && <PreviewRow label="Scadenza" value={new Date(endsAt).toLocaleString('it-IT')} />}
      </div>

      {/* Link box */}
      <div style={linkBoxStyle}>
        <p style={eyebrowStyle}>Link al programma operativo (da condividere con il fornitore)</p>
        <div style={linkTextStyle}>{generatedLink}</div>

        {/* Box Destinatario Programma Prima Dell'Invio */}
        <div
          style={{
            marginTop: 14,
            marginBottom: 14,
            padding: '12px 14px',
            borderRadius: 8,
            background: !isSendDisabled ? 'rgba(46,204,138,.08)' : 'rgba(239,68,68,.08)',
            border: `1px solid ${!isSendDisabled ? 'rgba(46,204,138,.3)' : 'rgba(239,68,68,.3)'}`,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: !isSendDisabled ? '#86efac' : '#fca5a5' }}>
            Destinatario programma:
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 3 }}>
            {activeRecipient?.recipientName || 'Non definito'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: !isSendDisabled ? '#86efac' : '#fca5a5', marginTop: 2 }}>
            {activeRecipient?.phone ? `+${activeRecipient.phone}` : 'Numero non disponibile'}
          </div>
          {isSendDisabled && (
            <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 4 }}>
              ⚠️ Numero destinatario non disponibile. Inserisci un recapito valido per il gruppo o fornitore prima di inviare il programma via WhatsApp.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" style={primaryBtnStyle} onClick={handleCopyLink}>
            {copiedLink ? '✓ Copiato!' : '📋 Copia link'}
          </button>
          <button
            type="button"
            style={isSendDisabled ? { ...whatsappBtnStyle, opacity: 0.45, cursor: 'not-allowed', background: '#374151' } : whatsappBtnStyle}
            onClick={handleWhatsApp}
            disabled={isSendDisabled}
          >
            📱 Invia programma
          </button>
          <button type="button" style={secondaryBtnStyle} onClick={handleCopyMsg}>
            {copiedMsg ? '✓ Messaggio copiato!' : '📝 Copia messaggio WhatsApp'}
          </button>
        </div>
      </div>

      {/* Quick supplier contact bar for registered OR manual supplier */}
      {(activeSupplierPhone || activeSupplierEmail) && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
            Contatti rapidi fornitore (<strong>{activeSupplierName}</strong>):
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {cleanPhoneNumber(activeSupplierPhone) && (
              <>
                <a
                  href={`tel:+${cleanPhoneNumber(activeSupplierPhone)}`}
                  style={{ ...secondaryBtnStyle, fontSize: 12, padding: '4px 10px' }}
                >
                  📞 Chiama ({activeSupplierPhone})
                </a>
              </>
            )}
            {activeSupplierEmail && (
              <a
                href={`mailto:${activeSupplierEmail}?subject=${encodeURIComponent(`Programma di lavoro - ${campaignTitle}`)}&body=${encodeURIComponent(buildWhatsAppMsg())}`}
                style={{ ...secondaryBtnStyle, fontSize: 12, padding: '4px 10px' }}
              >
                ✉️ Email Fornitore
              </a>
            )}
          </div>
        </div>
      )}

      {/* Messaggio anteprima */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: 700 }}>
          Anteprima messaggio WhatsApp
        </summary>
        <pre style={msgPreviewStyle}>{buildWhatsAppMsg()}</pre>
      </details>

      {/* Azioni secondarie */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14 }}>
        <button
          type="button"
          style={secondaryBtnStyle}
          onClick={() => { setStep(2); }}
        >
          Modifica programma
        </button>
        {savedAssignment.status !== 'revoked' && (
          <button
            type="button"
            style={{ ...secondaryBtnStyle, color: '#fca5a5', borderColor: 'rgba(239,68,68,.35)' }}
            disabled={saving}
            onClick={handleRevoke}
          >
            🚫 Revoca assegnazione
          </button>
        )}
        {onClose && (
          <button type="button" style={secondaryBtnStyle} onClick={onClose}>Chiudi</button>
        )}
      </div>
    </div>
  );
}

