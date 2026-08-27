export function AssignWorkGroupOperatorStep({ Notice, groups, selectedGroupId, setSelectedGroupId, groupCreatorOpen, setGroupCreatorOpen, handleCreateGroup, newGroupName, setNewGroupName, newGroupLeadId, setNewGroupLeadId, groupSaving, operators, selectedOperatorId, setSelectedOperatorId, phoneEditId, phoneDraft, setPhoneDraft, phoneSaving, phoneError, onStartEditPhone, onCancelEditPhone, onSaveOperatorPhone, phonePlaceholder, canGoNext, setStep, styles }) {
  const { cardStyle, eyebrowStyle, sectionTitleStyle, operatorCardStyle, checkStyle, secondaryBtnStyle, formGridStyle, labelStyle, inputStyle, disabledBtnStyle, primaryBtnStyle, footerRowStyle, operatorAvatarStyle } = styles;
  const editLinkStyle = { background: 'none', border: 'none', color: '#e8571a', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '2px 4px' };
  const phoneRowStyle = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(232,87,26,.06)', border: '1px solid rgba(232,87,26,.2)' };
  return (
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Step 1 — Scegli gruppo e persona</p>
          <h2 style={sectionTitleStyle}>A quale gruppo assegni il programma?</h2>
          {groups.length === 0 ? (
            <Notice text="Nessun gruppo configurato." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, marginBottom: 18 }}>
              {groups.map(group => (
                <button key={group.id} type="button" style={{ ...operatorCardStyle, border: selectedGroupId === group.id ? '2px solid #e8571a' : '1px solid rgba(255,255,255,.1)', background: selectedGroupId === group.id ? 'rgba(232,87,26,.1)' : 'rgba(255,255,255,.03)' }} onClick={() => setSelectedGroupId(group.id)}>
                  <div><strong style={{ color: '#fff' }}>{group.name}</strong><p style={{ margin: '3px 0 0', fontSize: 11, color: 'rgba(255,255,255,.48)' }}>{group.lead_name || 'Referente non disponibile'}</p></div>
                  {selectedGroupId === group.id && <span style={checkStyle}>✓</span>}
                </button>
              ))}
            </div>
          )}
          <button type="button" style={secondaryBtnStyle} onClick={() => setGroupCreatorOpen((open) => !open)}>+ Crea gruppo</button>
          {groupCreatorOpen && (
            <form onSubmit={handleCreateGroup} style={{ ...formGridStyle, marginTop: 14, padding: 14, border: '1px solid rgba(232,87,26,.28)', borderRadius: 12, background: 'rgba(232,87,26,.06)' }}>
              <label style={labelStyle}>
                Nome gruppo
                <input required value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="es. Gruppo Fabio" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Primo membro / referente WhatsApp
                <select required value={newGroupLeadId} onChange={(event) => setNewGroupLeadId(event.target.value)} style={inputStyle}>
                  <option value="">Seleziona persona</option>
                  {operators.map((operator) => <option key={operator.id} value={operator.id}>{operator.display_name || `Operatore ${String(operator.id).slice(0, 8)}`}</option>)}
                </select>
              </label>
              <div style={{ ...labelStyle, justifyContent: 'end' }}>
                <span>La membership diventa reale al salvataggio del programma.</span>
                <button type="submit" disabled={groupSaving} style={groupSaving ? disabledBtnStyle : primaryBtnStyle}>{groupSaving ? 'Creazione…' : 'Crea gruppo'}</button>
              </div>
            </form>
          )}
          <h3 style={{ ...sectionTitleStyle, fontSize: 16 }}>Scegli la persona che riceverà il link</h3>
          {operators.length === 0 ? (
            <Notice danger text="Nessun operatore attivo trovato in operator_profiles. Crea prima il profilo operatore." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {operators.map(op => (
                <div key={op.id}>
                  <button
                    type="button"
                    style={{
                      ...operatorCardStyle,
                      border: selectedOperatorId === op.id
                        ? '2px solid #e8571a'
                        : '1px solid rgba(255,255,255,.1)',
                      background: selectedOperatorId === op.id
                        ? 'rgba(232,87,26,.1)'
                        : 'rgba(255,255,255,.03)',
                    }}
                    onClick={() => setSelectedOperatorId(op.id)}
                  >
                    <div style={operatorAvatarStyle}>
                      {(op.display_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong style={{ color: '#fff', fontSize: 15 }}>
                        {op.display_name || `Operatore ${op.id.slice(0, 8)}`}
                      </strong>
                      <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,.5)' }}>
                        {op.phone || 'Telefono non inserito'} · {op.status}
                      </p>
                    </div>
                    {selectedOperatorId === op.id && (
                      <span style={checkStyle}>✓</span>
                    )}
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
                          if (event.key === 'Enter') { event.preventDefault(); onSaveOperatorPhone(op.id); }
                          if (event.key === 'Escape') { event.preventDefault(); onCancelEditPhone(); }
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
                      <button
                        type="button"
                        disabled={phoneSaving}
                        onClick={onCancelEditPhone}
                        style={secondaryBtnStyle}
                      >
                        Annulla
                      </button>
                      {phoneError && (
                        <span style={{ flexBasis: '100%', color: '#ff8a65', fontSize: 12, fontWeight: 700 }}>
                          {phoneError}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartEditPhone(op)}
                      style={editLinkStyle}
                    >
                      ✏️ Modifica telefono
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedOperatorId && !selectedGroupId && <Notice danger text="Prima crea o seleziona un gruppo." />}
          {selectedGroupId && !selectedOperatorId && <Notice danger text="Seleziona il referente/persona che riceverà il programma." />}
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
