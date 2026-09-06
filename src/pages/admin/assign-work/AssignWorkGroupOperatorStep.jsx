import React, { useState, useMemo } from 'react';

export function AssignWorkGroupOperatorStep({
  Notice,
  suppliers = [],
  selectedSupplierId,
  setSelectedSupplierId,
  selectedSupplier,
  groups,
  selectedGroupId,
  setSelectedGroupId,
  groupCreatorOpen,
  setGroupCreatorOpen,
  handleCreateGroup,
  newGroupName,
  setNewGroupName,
  newGroupLeadId,
  setNewGroupLeadId,
  groupSaving,
  operators,
  selectedOperatorId,
  setSelectedOperatorId,
  phoneEditId,
  phoneDraft,
  setPhoneDraft,
  phoneSaving,
  phoneError,
  onStartEditPhone,
  onCancelEditPhone,
  onSaveOperatorPhone,
  phonePlaceholder,
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
    disabledBtnStyle,
    primaryBtnStyle,
    footerRowStyle,
    operatorAvatarStyle,
  } = styles;

  const [supplierSearch, setSupplierSearch] = useState('');

  const editLinkStyle = {
    background: 'none',
    border: 'none',
    color: '#e8571a',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '2px 4px',
  };

  const phoneRowStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    marginTop: 6,
    padding: '8px 10px',
    borderRadius: 10,
    background: 'rgba(232,87,26,.06)',
    border: '1px solid rgba(232,87,26,.2)',
  };

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

  // Operatori filtrati per fornitore se selezionato, altrimenti tutti
  const supplierOperators = useMemo(() => {
    if (!selectedSupplierId) return operators;
    const forSupplier = operators.filter((op) => op.supplier_id === selectedSupplierId);
    return forSupplier.length > 0 ? forSupplier : operators;
  }, [operators, selectedSupplierId]);

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Step 1 — Scegli Fornitore, Gruppo e Persona</p>

      {/* ─────────────────────────────────────────────────────────────
          1. SCEGLI FORNITORE
      ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div>
            <h2 style={{ ...sectionTitleStyle, margin: 0, fontSize: 18 }}>1. Scegli il Fornitore</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
              Il lavoro viene affidato prima all'azienda partner / fornitore responsabile.
            </p>
          </div>
          {selectedSupplier && (
            <button
              type="button"
              style={{ ...secondaryBtnStyle, fontSize: 12, padding: '6px 12px' }}
              onClick={() => setSelectedSupplierId('')}
            >
              ↺ Cambia fornitore
            </button>
          )}
        </div>

        {selectedSupplier ? (
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
            </div>
          </div>
        ) : suppliers.length === 0 ? (
          <Notice text="Nessun fornitore registrato nel marketplace. Puoi procedere assegnando direttamente agli operatori." />
        ) : (
          /* Grid Selezione Fornitore */
          <div>
            <div style={{ marginBottom: 12 }}>
              <input
                type="text"
                placeholder="🔍 Cerca fornitore per nome, referente, città, email..."
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

      {/* ─────────────────────────────────────────────────────────────
          2. SCEGLI OPERATORE / PERSONA DEL FORNITORE
      ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <h3 style={{ ...sectionTitleStyle, fontSize: 18, marginBottom: 4 }}>2. Scegli la persona che riceverà il link GPS</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
          {selectedSupplier
            ? `Autisti o referenti associati a ${selectedSupplier.company_name}:`
            : 'Seleziona la persona tra gli operatori disponibili:'}
        </p>

        {supplierOperators.length === 0 ? (
          <Notice danger text="Nessun operatore attivo trovato in operator_profiles. Crea prima il profilo operatore." />
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {supplierOperators.map((op) => (
              <div key={op.id}>
                <button
                  type="button"
                  style={{
                    ...operatorCardStyle,
                    border: selectedOperatorId === op.id ? '2px solid #e8571a' : '1px solid rgba(255,255,255,.1)',
                    background: selectedOperatorId === op.id ? 'rgba(232,87,26,.1)' : 'rgba(255,255,255,.03)',
                  }}
                  onClick={() => setSelectedOperatorId(op.id)}
                >
                  <div style={operatorAvatarStyle}>{(op.display_name || '?').slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong style={{ color: '#fff', fontSize: 15 }}>
                      {op.display_name || `Operatore ${op.id.slice(0, 8)}`}
                    </strong>
                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                      {op.phone || 'Telefono non inserito'} · {op.status}
                    </p>
                  </div>
                  {selectedOperatorId === op.id && <span style={checkStyle}>✓</span>}
                </button>

                {phoneEditId === op.id ? (
                  <div style={phoneRowStyle}>
                    <input
                      type="tel"
                      autoFocus
                      value={phoneDraft}
                      placeholder={phonePlaceholder}
                      onChange={(event) => setPhoneDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          onSaveOperatorPhone(op.id);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          onCancelEditPhone();
                        }
                      }}
                      style={{ ...inputStyle, flex: '1 1 180px', minWidth: 0 }}
                      aria-label={`Telefono di ${op.display_name || 'operatore'}`}
                    />
                    <button
                      type="button"
                      disabled={phoneSaving}
                      onClick={() => onSaveOperatorPhone(op.id)}
                      style={phoneSaving ? disabledBtnStyle : primaryBtnStyle}
                    >
                      {phoneSaving ? 'Salvataggio…' : 'Salva'}
                    </button>
                    <button type="button" disabled={phoneSaving} onClick={onCancelEditPhone} style={secondaryBtnStyle}>
                      Annulla
                    </button>
                    {phoneError && (
                      <span style={{ flexBasis: '100%', color: '#ff8a65', fontSize: 12, fontWeight: 700 }}>
                        {phoneError}
                      </span>
                    )}
                  </div>
                ) : (
                  <button type="button" onClick={() => onStartEditPhone(op)} style={editLinkStyle}>
                    ✏️ Modifica telefono
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. GRUPPO OPERATIVO
      ───────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ ...sectionTitleStyle, fontSize: 18, marginBottom: 4 }}>3. A quale gruppo assegni il programma?</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
          I gruppi organizzano la distribuzione per zona o squadra operativa.
        </p>

        {groups.length === 0 ? (
          <Notice text="Nessun gruppo configurato." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, marginBottom: 14 }}>
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
                    {group.lead_name || 'Referente non disponibile'}
                  </p>
                </div>
                {selectedGroupId === group.id && <span style={checkStyle}>✓</span>}
              </button>
            ))}
          </div>
        )}

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
              Nome gruppo
              <input
                required
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="es. Gruppo Fabio"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Primo membro / referente WhatsApp
              <select
                required
                value={newGroupLeadId}
                onChange={(event) => setNewGroupLeadId(event.target.value)}
                style={inputStyle}
              >
                <option value="">Seleziona persona</option>
                {operators.map((operator) => (
                  <option key={operator.id} value={operator.id}>
                    {operator.display_name || `Operatore ${String(operator.id).slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ ...labelStyle, justifyContent: 'end' }}>
              <span>La membership diventa reale al salvataggio del programma.</span>
              <button
                type="submit"
                disabled={groupSaving}
                style={groupSaving ? disabledBtnStyle : primaryBtnStyle}
              >
                {groupSaving ? 'Creazione…' : 'Crea gruppo'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Validation warnings */}
      {suppliers.length > 0 && !selectedSupplierId && (
        <Notice danger text="Seleziona prima il fornitore partner a cui affidare il lavoro." />
      )}
      {selectedSupplierId && !selectedOperatorId && (
        <Notice danger text="Seleziona la persona/autista del fornitore che riceverà il programma." />
      )}
      {selectedOperatorId && !selectedGroupId && (
        <Notice danger text="Seleziona o crea il gruppo operativo per questo programma." />
      )}

      <div style={footerRowStyle}>
        <span />
        <button
          style={canGoNext() ? primaryBtnStyle : disabledBtnStyle}
          type="button"
          disabled={!canGoNext()}
          onClick={() => setStep(2)}
        >
          Avanti →
        </button>
      </div>
    </div>
  );
}
