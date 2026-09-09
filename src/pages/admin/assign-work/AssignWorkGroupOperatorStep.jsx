import React, { useState, useMemo } from 'react';

export function AssignWorkGroupOperatorStep({
  Notice,
  supplierMode = 'registered',
  setSupplierMode,
  suppliers = [],
  supplierLoading = false,
  supplierError = null,
  onRetrySuppliers,
  selectedSupplierId,
  setSelectedSupplierId,
  selectedSupplier,
  manualSupplier,
  setManualSupplier,
  groups = [],
  selectedGroupId,
  setSelectedGroupId,
  groupCreatorOpen,
  setGroupCreatorOpen,
  handleCreateGroup,
  newGroupName,
  setNewGroupName,
  groupSaving,
  canGoNext,
  setStep,
  styles,
}) {
  const {
    cardStyle,
    eyebrowStyle,
    sectionTitleStyle,
    operatorCardStyle,
    checkStyle,
    secondaryBtnStyle,
    formGridStyle,
    labelStyle,
    inputStyle,
    textareaStyle,
    disabledBtnStyle,
    primaryBtnStyle,
    footerRowStyle,
  } = styles;

  const [supplierSearch, setSupplierSearch] = useState('');

  const supplierActionBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,.15)',
    background: 'rgba(255,255,255,.06)',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const q = supplierSearch.trim().toLowerCase();
    return suppliers.filter((s) => {
      const company = (s.company_name || '').toLowerCase();
      const contact = (s.contact_name || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      const areas = Array.isArray(s.coverage_areas) ? s.coverage_areas.join(' ').toLowerCase() : '';
      return company.includes(q) || contact.includes(q) || email.includes(q) || phone.includes(q) || areas.includes(q);
    });
  }, [suppliers, supplierSearch]);

  // Manual validation helpers
  const manualNameValid = Boolean(manualSupplier?.name && manualSupplier.name.trim().length > 0);
  const cleanManualPhone = (manualSupplier?.phone || '').replace(/[^\d+]/g, '');
  const manualPhoneValid = cleanManualPhone.length >= 6;
  const manualEmail = (manualSupplier?.email || '').trim();
  const manualEmailValid = !manualEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail);

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Step 1 — Scegli Fornitore e Gruppo Operativo</p>

      {/* ─────────────────────────────────────────────────────────────
          1. SCEGLI FORNITORE (DUAL MODE)
      ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <h2 style={{ ...sectionTitleStyle, margin: 0, fontSize: 18 }}>1. Scegli il Fornitore</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              Seleziona un'azienda registrata nel marketplace o inserisci i dati di contatto di un fornitore esterno.
            </p>
          </div>
        </div>

        {/* Segmented Controls / Mode Switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: 12 }}>
          <button
            type="button"
            onClick={() => setSupplierMode('registered')}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: supplierMode === 'registered' ? '1px solid #e8571a' : '1px solid rgba(255,255,255,.12)',
              background: supplierMode === 'registered' ? 'rgba(232,87,26,.18)' : 'rgba(255,255,255,.04)',
              color: supplierMode === 'registered' ? '#fff' : 'rgba(255,255,255,.6)',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            🏢 Fornitori registrati
          </button>
          <button
            type="button"
            onClick={() => setSupplierMode('manual')}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: supplierMode === 'manual' ? '1px solid #e8571a' : '1px solid rgba(255,255,255,.12)',
              background: supplierMode === 'manual' ? 'rgba(232,87,26,.18)' : 'rgba(255,255,255,.04)',
              color: supplierMode === 'manual' ? '#fff' : 'rgba(255,255,255,.6)',
              fontWeight: 800,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            ✍️ Inserisci manualmente
          </button>
        </div>

        {/* ── MODE A: REGISTERED SUPPLIER ── */}
        {supplierMode === 'registered' && (
          <div>
            {supplierLoading ? (
              <Notice text="Caricamento fornitori..." />
            ) : supplierError ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,.35)',
                  background: 'rgba(239,68,68,.06)',
                  color: '#fca5a5',
                  marginBottom: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>Impossibile caricare i fornitori.</strong>
                  <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.85 }}>{supplierError}</p>
                </div>
                {onRetrySuppliers && (
                  <button
                    type="button"
                    style={{ ...secondaryBtnStyle, fontSize: 12, padding: '6px 14px' }}
                    onClick={onRetrySuppliers}
                  >
                    🔄 Riprova
                  </button>
                )}
              </div>
            ) : selectedSupplier ? (
              /* Card Fornitore Selezionato */
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: 'rgba(232,87,26,.1)',
                  border: '2px solid #e8571a',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 14,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>🏢</span>
                    <strong style={{ color: '#fff', fontSize: 16 }}>{selectedSupplier.company_name}</strong>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800,
                        background: selectedSupplier.status === 'verified' ? 'rgba(46,204,138,.2)' : 'rgba(251,191,36,.2)',
                        color: selectedSupplier.status === 'verified' ? '#86efac' : '#fde68a',
                      }}
                    >
                      {selectedSupplier.status === 'verified' ? 'Verificato' : selectedSupplier.status}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,.7)' }}>
                    Referente: <strong>{selectedSupplier.contact_name || 'Non specificato'}</strong>
                    {selectedSupplier.phone ? ` · Tel: ${selectedSupplier.phone}` : ''}
                    {selectedSupplier.email ? ` · Email: ${selectedSupplier.email}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {selectedSupplier.phone && (
                    <>
                      <a
                        href={`https://wa.me/${selectedSupplier.phone.replace(/[^\d+]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...supplierActionBtnStyle, background: 'rgba(46,204,138,.15)', borderColor: 'rgba(46,204,138,.3)', color: '#86efac' }}
                      >
                        📱 WhatsApp
                      </a>
                      <a
                        href={`tel:${selectedSupplier.phone}`}
                        style={supplierActionBtnStyle}
                      >
                        📞 Chiama
                      </a>
                    </>
                  )}
                  {selectedSupplier.email && (
                    <a
                      href={`mailto:${selectedSupplier.email}`}
                      style={supplierActionBtnStyle}
                    >
                      ✉️ Email
                    </a>
                  )}
                  <button
                    type="button"
                    style={{ ...secondaryBtnStyle, fontSize: 12, padding: '6px 12px' }}
                    onClick={() => setSelectedSupplierId('')}
                  >
                    ↺ Cambia fornitore
                  </button>
                </div>
              </div>
            ) : suppliers.length === 0 ? (
              <Notice text="Nessun fornitore registrato nel marketplace." />
            ) : (
              /* Grid Selezione Fornitore */
              <div>
                <div style={{ marginBottom: 12 }}>
                  <input
                    type="text"
                    placeholder="🔍 Cerca fornitore per nome azienda, referente, città, email..."
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    style={{ ...inputStyle, width: '100%', maxWidth: 440 }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {filteredSuppliers.map((supp) => {
                    const isSelected = selectedSupplierId === supp.id;
                    return (
                      <div
                        key={supp.id}
                        style={{
                          ...operatorCardStyle,
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          border: isSelected ? '2px solid #e8571a' : '1px solid rgba(255,255,255,.1)',
                          background: isSelected ? 'rgba(232,87,26,.1)' : 'rgba(255,255,255,.03)',
                          padding: 14,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                          <div>
                            <strong style={{ color: '#fff', fontSize: 15 }}>{supp.company_name}</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,.6)' }}>
                              {supp.contact_name ? `Ref: ${supp.contact_name}` : 'Referente da definire'}
                            </p>
                          </div>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 10,
                              fontWeight: 800,
                              background: supp.status === 'verified' ? 'rgba(46,204,138,.18)' : 'rgba(251,191,36,.18)',
                              color: supp.status === 'verified' ? '#86efac' : '#fde68a',
                            }}
                          >
                            {supp.status === 'verified' ? 'Verificato' : supp.status}
                          </span>
                        </div>

                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
                          {supp.phone || 'Nessun telefono'} · {supp.email || 'Nessuna email'}
                        </p>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 10 }}>
                          <button
                            type="button"
                            style={{ ...primaryBtnStyle, padding: '6px 12px', fontSize: 12 }}
                            onClick={() => setSelectedSupplierId(supp.id)}
                          >
                            {isSelected ? '✓ Selezionato' : 'Seleziona'}
                          </button>
                          {supp.phone && (
                            <>
                              <a
                                href={`https://wa.me/${supp.phone.replace(/[^\d+]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={supplierActionBtnStyle}
                              >
                                WhatsApp
                              </a>
                              <a href={`tel:${supp.phone}`} style={supplierActionBtnStyle}>
                                Chiama
                              </a>
                            </>
                          )}
                          {supp.email && (
                            <a href={`mailto:${supp.email}`} style={supplierActionBtnStyle}>
                              Email
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MODE B: MANUAL SUPPLIER ── */}
        {supplierMode === 'manual' && (
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'rgba(255,255,255,.03)',
              border: '1px solid rgba(255,255,255,.12)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
              <label style={labelStyle}>
                Nome ditta / Nome fornitore *
                <input
                  type="text"
                  placeholder="es. Mario Rossi Distribuzioni"
                  value={manualSupplier?.name || ''}
                  onChange={(e) => setManualSupplier((prev) => ({ ...prev, name: e.target.value }))}
                  style={{
                    ...inputStyle,
                    borderColor: !manualNameValid && manualSupplier?.name !== undefined ? 'rgba(239,68,68,.5)' : inputStyle.borderColor,
                  }}
                  required
                />
                {!manualNameValid && manualSupplier?.name !== undefined && (
                  <span style={{ fontSize: 11, color: '#fca5a5' }}>Il nome del fornitore è obbligatorio</span>
                )}
              </label>

              <label style={labelStyle}>
                Referente (facoltativo)
                <input
                  type="text"
                  placeholder="es. Mario Rossi"
                  value={manualSupplier?.contact_name || ''}
                  onChange={(e) => setManualSupplier((prev) => ({ ...prev, contact_name: e.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={labelStyle}>
                Telefono * (per WhatsApp)
                <input
                  type="tel"
                  placeholder="es. +39 333 1234567"
                  value={manualSupplier?.phone || ''}
                  onChange={(e) => setManualSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                  style={{
                    ...inputStyle,
                    borderColor: !manualPhoneValid && manualSupplier?.phone ? 'rgba(239,68,68,.5)' : inputStyle.borderColor,
                  }}
                  required
                />
                {!manualPhoneValid && manualSupplier?.phone ? (
                  <span style={{ fontSize: 11, color: '#fca5a5' }}>Inserisci un numero di telefono valido (min. 6 cifre)</span>
                ) : (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>Formato italiano o internazionale con prefisso</span>
                )}
              </label>

              <label style={labelStyle}>
                Email (facoltativa)
                <input
                  type="email"
                  placeholder="es. info@mariorossi.it"
                  value={manualSupplier?.email || ''}
                  onChange={(e) => setManualSupplier((prev) => ({ ...prev, email: e.target.value }))}
                  style={{
                    ...inputStyle,
                    borderColor: !manualEmailValid ? 'rgba(239,68,68,.5)' : inputStyle.borderColor,
                  }}
                />
                {!manualEmailValid && (
                  <span style={{ fontSize: 11, color: '#fca5a5' }}>Formato email non valido</span>
                )}
              </label>
            </div>

            <label style={{ ...labelStyle, marginBottom: 12 }}>
              Note fornitore (facoltative)
              <textarea
                placeholder="Note interne su accordi, referenti operativi o recapiti secondari..."
                value={manualSupplier?.notes || ''}
                onChange={(e) => setManualSupplier((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                style={textareaStyle || inputStyle}
              />
            </label>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(46,204,138,.06)',
                border: '1px solid rgba(46,204,138,.2)',
                fontSize: 12,
                color: '#86efac',
              }}
            >
              <span>ℹ️</span>
              <span>
                I dati del fornitore manuale sono salvati nel programma di lavoro e utilizzati per l'invio WhatsApp. Non viene creato alcun account fornitore fittizio.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. GRUPPO OPERATIVO (FACOLTATIVO)
      ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ ...sectionTitleStyle, fontSize: 18, marginBottom: 4 }}>2. Gruppo Operativo (Facoltativo)</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
          Puoi associare il programma a una squadra o gruppo specifico, oppure procedere senza gruppo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8, marginBottom: 14 }}>
          {/* Opzione Nessun Gruppo */}
          <button
            type="button"
            style={{
              ...operatorCardStyle,
              border: !selectedGroupId ? '2px solid #e8571a' : '1px solid rgba(255,255,255,.1)',
              background: !selectedGroupId ? 'rgba(232,87,26,.1)' : 'rgba(255,255,255,.03)',
            }}
            onClick={() => setSelectedGroupId('')}
          >
            <div>
              <strong style={{ color: '#fff' }}>Nessun gruppo</strong>
              <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,.48)' }}>
                Assegna direttamente al fornitore
              </p>
            </div>
            {!selectedGroupId && <span style={checkStyle}>✓</span>}
          </button>

          {/* Gruppi esistenti */}
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              style={{
                ...operatorCardStyle,
                border: selectedGroupId === group.id ? '2px solid #e8571a' : '1px solid rgba(255,255,255,.1)',
                background: selectedGroupId === group.id ? 'rgba(232,87,26,.1)' : 'rgba(255,255,255,.03)',
              }}
              onClick={() => setSelectedGroupId(group.id)}
            >
              <div>
                <strong style={{ color: '#fff' }}>{group.name}</strong>
                <p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,.48)' }}>
                  {group.lead_name ? `Ref: ${group.lead_name}` : 'Gruppo operativo'}
                </p>
              </div>
              {selectedGroupId === group.id && <span style={checkStyle}>✓</span>}
            </button>
          ))}
        </div>

        <button type="button" style={secondaryBtnStyle} onClick={() => setGroupCreatorOpen((open) => !open)}>
          + Crea gruppo
        </button>

        {groupCreatorOpen && (
          <form
            onSubmit={handleCreateGroup}
            style={{
              ...formGridStyle,
              marginTop: 14,
              padding: 14,
              border: '1px solid rgba(232,87,26,.28)',
              borderRadius: 12,
              background: 'rgba(232,87,26,.06)',
            }}
          >
            <label style={labelStyle}>
              Nome nuovo gruppo
              <input
                required
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="es. Squadra Centro Milano"
                style={inputStyle}
              />
            </label>
            <div style={{ ...labelStyle, justifyContent: 'flex-end', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="submit"
                disabled={groupSaving}
                style={groupSaving ? disabledBtnStyle : primaryBtnStyle}
              >
                {groupSaving ? 'Creazione…' : 'Crea gruppo'}
              </button>
              <button
                type="button"
                style={secondaryBtnStyle}
                onClick={() => { setGroupCreatorOpen(false); setNewGroupName(''); }}
              >
                Annulla
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Validation warnings */}
      {suppliers.length > 0 && !selectedSupplierId && (
        <Notice danger text="Seleziona il fornitore partner a cui affidare la campagna." />
      )}

      <div style={footerRowStyle}>
        <span />
        <button
          style={canGoNext() ? primaryBtnStyle : disabledBtnStyle}
          type="button"
          disabled={!canGoNext()}
          onClick={() => setStep(2)}
        >
          Avanti al programma →
        </button>
      </div>
    </div>
  );
}
