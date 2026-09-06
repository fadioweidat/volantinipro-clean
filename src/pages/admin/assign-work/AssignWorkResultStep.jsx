export function AssignWorkResultStep({ PreviewRow, Notice, savedAssignment, generatedLink, selectedSupplier, selectedOperator, campaignTitle, endsAt, getSelectedZoneNames, copiedLink, copiedMsg, handleCopyLink, handleCopyMsg, handleWhatsApp, handleRevoke, buildWhatsAppMsg, saving, setStep, setSavedAssignment, onClose, styles }) {
  const { cardStyle, eyebrowStyle, sectionTitleStyle, previewGridStyle, linkBoxStyle, linkTextStyle, msgPreviewStyle, primaryBtnStyle, secondaryBtnStyle, whatsappBtnStyle } = styles;
  return (
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 32 }}>🎉</span>
            <div>
              <p style={eyebrowStyle}>Assegnazione creata</p>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Link personale generato</h2>
            </div>
          </div>

          {savedAssignment.status === 'revoked' && (
            <Notice danger text="Assegnazione revocata. Il link non è più utilizzabile." />
          )}

          <div style={previewGridStyle}>
            {selectedSupplier && (
              <PreviewRow
                label="Fornitore"
                value={`${selectedSupplier.company_name}${selectedSupplier.contact_name ? ` (Ref: ${selectedSupplier.contact_name})` : ''}`}
              />
            )}
            <PreviewRow label="Operatore" value={selectedOperator?.display_name || savedAssignment.operator_id} />
            <PreviewRow label="Campagna" value={campaignTitle} />
            <PreviewRow label="Zone (Programma)" value={getSelectedZoneNames().join(', ') || 'Nessuna specifica'} />
            <PreviewRow label="Stato" value={savedAssignment.status} />
            {endsAt && <PreviewRow label="Scadenza" value={new Date(endsAt).toLocaleString('it-IT')} />}
          </div>

          {/* Link box */}
          <div style={linkBoxStyle}>
            <p style={eyebrowStyle}>Link personale driver (non condivisibile con altri)</p>
            <div style={linkTextStyle}>{generatedLink}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <button type="button" style={primaryBtnStyle} onClick={handleCopyLink}>
                {copiedLink ? '✓ Copiato!' : '📋 Copia link'}
              </button>
              <button type="button" style={whatsappBtnStyle} onClick={handleWhatsApp}>
                📱 Invia WhatsApp
              </button>
              <button type="button" style={secondaryBtnStyle} onClick={handleCopyMsg}>
                {copiedMsg ? '✓ Messaggio copiato!' : '📝 Copia messaggio completo'}
              </button>
            </div>
          </div>

          {/* Quick supplier contact bar if supplier exists */}
          {selectedSupplier && (selectedSupplier.phone || selectedSupplier.email) && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
                Contatto diretto fornitore (<strong>{selectedSupplier.company_name}</strong>):
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selectedSupplier.phone && (
                  <a
                    href={`https://wa.me/${selectedSupplier.phone.replace(/[^\d+]/g, '')}?text=${encodeURIComponent(buildWhatsAppMsg())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...secondaryBtnStyle, fontSize: 12, padding: '4px 10px', background: 'rgba(46,204,138,.12)', color: '#86efac', borderColor: 'rgba(46,204,138,.25)' }}
                  >
                    📱 WhatsApp Fornitore
                  </a>
                )}
                {selectedSupplier.email && (
                  <a
                    href={`mailto:${selectedSupplier.email}?subject=${encodeURIComponent(`Assegnazione lavoro - ${campaignTitle}`)}&body=${encodeURIComponent(buildWhatsAppMsg())}`}
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
              onClick={() => { setStep(2); setSavedAssignment(null); }}
            >
              Modifica scadenza
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
