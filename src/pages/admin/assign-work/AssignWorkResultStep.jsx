export function AssignWorkResultStep({ PreviewRow, Notice, savedAssignment, generatedLink, selectedOperator, campaignTitle, endsAt, getSelectedZoneNames, copiedLink, copiedMsg, handleCopyLink, handleCopyMsg, handleWhatsApp, handleRevoke, buildWhatsAppMsg, saving, setStep, setSavedAssignment, onClose, styles }) {
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
