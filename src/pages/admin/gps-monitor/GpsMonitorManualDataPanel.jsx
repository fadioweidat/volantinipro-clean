import { useEffect, useMemo, useState } from 'react';
import { saveCampaignManualOperationalMetrics } from '../../../lib/services/admin-api.js';

export function GpsMonitorManualDataPanel({
  campaignId,
  zoneRows = [],
  selectedZoneId = null,
  onSelectZone = null,
  canonicalOperators = [],
  manualMetrics = null,
  onSaved = null,
}) {
  const selectedZone = useMemo(
    () => (selectedZoneId ? zoneRows.find((z) => z.id === selectedZoneId) || null : null),
    [zoneRows, selectedZoneId],
  );

  const activeZoneManual = useMemo(() => {
    if (!manualMetrics) return null;
    if (selectedZoneId && selectedZoneId !== 'all') {
      return manualMetrics.zones?.[selectedZoneId] || null;
    }
    return manualMetrics.campaign_level || null;
  }, [manualMetrics, selectedZoneId]);

  const [formData, setFormData] = useState({
    operatorKey: '',
    coveragePercent: '',
    operationalHours: '',
    operationalMinutes: '',
    operationalDistanceKm: '',
    verifiedPointsCount: '',
    verifiedAt: '',
    note: '',
  });

  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Popola il form quando cambia la zona selezionata o arrivano nuovi dati manuali
  useEffect(() => {
    const defaultDate = new Date().toISOString().slice(0, 16);
    if (activeZoneManual) {
      const totalSec = activeZoneManual.operational_time_seconds || 0;
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);

      const opKey = activeZoneManual.operator_id || activeZoneManual.operator_slot || '';

      setFormData({
        operatorKey: opKey,
        coveragePercent: activeZoneManual.coverage_percent != null ? String(activeZoneManual.coverage_percent) : '',
        operationalHours: totalSec > 0 ? String(hours) : '',
        operationalMinutes: totalSec > 0 ? String(minutes) : '',
        operationalDistanceKm: activeZoneManual.operational_distance_km != null ? String(activeZoneManual.operational_distance_km) : '',
        verifiedPointsCount: activeZoneManual.verified_points_count != null ? String(activeZoneManual.verified_points_count) : '',
        verifiedAt: activeZoneManual.verified_at ? new Date(activeZoneManual.verified_at).toISOString().slice(0, 16) : defaultDate,
        note: activeZoneManual.note || '',
      });
      if (activeZoneManual.note) setShowNotes(true);
    } else {
      setFormData({
        operatorKey: '',
        coveragePercent: '',
        operationalHours: '',
        operationalMinutes: '',
        operationalDistanceKm: '',
        verifiedPointsCount: '',
        verifiedAt: defaultDate,
        note: '',
      });
    }
    setStatusMessage(null);
  }, [selectedZoneId, activeZoneManual]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!campaignId) return;

    setSaving(true);
    setStatusMessage(null);

    try {
      const h = parseInt(formData.operationalHours, 10) || 0;
      const m = parseInt(formData.operationalMinutes, 10) || 0;
      const totalSeconds = (h * 3600 + m * 60) > 0 ? (h * 3600 + m * 60) : null;

      let matchedOp = null;
      if (formData.operatorKey) {
        matchedOp = canonicalOperators.find(
          (o) => o.operatorId === formData.operatorKey || o.assignmentId === formData.operatorKey || o.slot === formData.operatorKey,
        );
      }

      const res = await saveCampaignManualOperationalMetrics(campaignId, {
        zoneId: selectedZoneId || 'all',
        zoneName: selectedZone?.zone_name || (selectedZoneId ? null : 'Tutte le zone'),
        coveragePercent: formData.coveragePercent !== '' ? Number(formData.coveragePercent) : null,
        operationalTimeSeconds: totalSeconds,
        operationalDistanceKm: formData.operationalDistanceKm !== '' ? Number(formData.operationalDistanceKm) : null,
        verifiedPointsCount: formData.verifiedPointsCount !== '' ? Number(formData.verifiedPointsCount) : null,
        verifiedAt: formData.verifiedAt ? new Date(formData.verifiedAt).toISOString() : new Date().toISOString(),
        operatorId: matchedOp?.operatorId || (formData.operatorKey ? formData.operatorKey : null),
        operatorSlot: matchedOp?.slot || null,
        note: formData.note ? formData.note.trim() : null,
      });

      setStatusMessage({ type: 'success', text: 'Dati manuali verificati salvati con successo!' });
      if (onSaved) onSaved(res);
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Errore durante il salvataggio: ${err?.message || 'Errore sconosciuto'}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={panelContainerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#fff' }}>
            Inserimento Dati Operativi Verificati (Manuali)
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,.55)' }}>
            Registra le metriche verificate per compensare l'assenza o parzialità della telemetria GPS reale.
          </p>
        </div>
        {selectedZone && (
          <span style={zoneBadgeStyle}>
            Ambito: {selectedZone.zone_name}
          </span>
        )}
      </div>

      {statusMessage && (
        <div style={statusMessage.type === 'success' ? successAlertStyle : errorAlertStyle}>
          {statusMessage.text}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
        <div style={formGridStyle}>
          {/* Operatore associato (opzionale) */}
          <div>
            <label style={labelStyle}>Operatore associato (opzionale)</label>
            <select
              value={formData.operatorKey}
              onChange={(e) => setFormData((prev) => ({ ...prev, operatorKey: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Operatore non specificato</option>
              {canonicalOperators.map((op, idx) => {
                const opKey = op.operatorId || op.assignmentId || op.colorKey;
                return (
                  <option key={op.colorKey} value={opKey}>
                    {op.slot || `OP-${String(idx + 1).padStart(2, '0')}`} · {op.displayName}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Copertura verificata % */}
          <div>
            <label style={labelStyle}>Copertura verificata (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="es. 85.0"
              value={formData.coveragePercent}
              onChange={(e) => setFormData((prev) => ({ ...prev, coveragePercent: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Tempo operativo */}
          <div>
            <label style={labelStyle}>Tempo operativo verificato</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                type="number"
                min="0"
                placeholder="Ore"
                value={formData.operationalHours}
                onChange={(e) => setFormData((prev) => ({ ...prev, operationalHours: e.target.value }))}
                style={inputStyle}
              />
              <input
                type="number"
                min="0"
                max="59"
                placeholder="Minuti"
                value={formData.operationalMinutes}
                onChange={(e) => setFormData((prev) => ({ ...prev, operationalMinutes: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Distanza operativa (km) */}
          <div>
            <label style={labelStyle}>Distanza operativa (km)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="es. 12.5"
              value={formData.operationalDistanceKm}
              onChange={(e) => setFormData((prev) => ({ ...prev, operationalDistanceKm: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Punti di copertura verificati */}
          <div>
            <label style={labelStyle}>Punti di copertura verificati</label>
            <input
              type="number"
              min="0"
              placeholder="es. 350"
              value={formData.verifiedPointsCount}
              onChange={(e) => setFormData((prev) => ({ ...prev, verifiedPointsCount: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Data e ora di verifica */}
          <div>
            <label style={labelStyle}>Data/ora di verifica</label>
            <input
              type="datetime-local"
              value={formData.verifiedAt}
              onChange={(e) => setFormData((prev) => ({ ...prev, verifiedAt: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Dettagli / Note facoltative */}
        <div>
          <button
            type="button"
            onClick={() => setShowNotes((prev) => !prev)}
            style={toggleNotesBtnStyle}
          >
            {showNotes ? '▲ Nascondi Note facoltative' : '▼ Dettagli / Note facoltative'}
          </button>

          {showNotes && (
            <div style={{ marginTop: 8 }}>
              <textarea
                rows={2}
                placeholder="Dettagli o motivazione della verifica manuale (facoltativa)"
                value={formData.note}
                onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                style={{ ...inputStyle, width: '100%', resize: 'vertical' }}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button
            type="submit"
            disabled={saving}
            style={saveButtonStyle(saving)}
          >
            {saving ? 'Salvataggio in corso...' : '💾 Salva dati manuali verificati'}
          </button>
        </div>
      </form>

      {/* Scheda riepilogativa dei dati manuali esistenti per la campagna */}
      {manualMetrics && (
        <div style={summaryBoxStyle}>
          <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(255,255,255,.5)', marginBottom: 8 }}>
            Riepilogo Dati Manuali Registrati
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Copertura totale</span>
              <strong style={metricValStyle}>
                {manualMetrics.campaign_level?.coverage_percent != null ? `${manualMetrics.campaign_level.coverage_percent}%` : 'n/d'}
              </strong>
            </div>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Punti verificati</span>
              <strong style={metricValStyle}>
                {manualMetrics.campaign_level?.verified_points_count != null ? manualMetrics.campaign_level.verified_points_count : 'n/d'}
              </strong>
            </div>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Tempo operativo</span>
              <strong style={metricValStyle}>
                {manualMetrics.campaign_level?.operational_time_seconds != null
                  ? `${Math.floor(manualMetrics.campaign_level.operational_time_seconds / 3600)}h ${Math.floor((manualMetrics.campaign_level.operational_time_seconds % 3600) / 60)}m`
                  : 'n/d'}
              </strong>
            </div>
            <div style={metricCardStyle}>
              <span style={metricLabelStyle}>Distanza</span>
              <strong style={metricValStyle}>
                {manualMetrics.campaign_level?.operational_distance_km != null ? `${manualMetrics.campaign_level.operational_distance_km} km` : 'n/d'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const panelContainerStyle = {
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 12,
  padding: 16,
};

const zoneBadgeStyle = {
  fontSize: 12,
  fontWeight: 800,
  padding: '4px 10px',
  borderRadius: 6,
  background: 'rgba(232,87,26,.18)',
  border: '1px solid rgba(232,87,26,.3)',
  color: '#ea580c',
};

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'rgba(255,255,255,.6)',
  marginBottom: 4,
};

const inputStyle = {
  width: '100%',
  border: '1px solid rgba(255,255,255,.14)',
  background: 'rgba(255,255,255,.04)',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  boxSizing: 'border-box',
};

const toggleNotesBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,.6)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  padding: '4px 0',
};

function saveButtonStyle(disabled) {
  return {
    border: 'none',
    borderRadius: 8,
    padding: '10px 18px',
    background: disabled ? 'rgba(232,87,26,.5)' : '#e8571a',
    color: '#fff',
    fontWeight: 900,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: '0 2px 8px rgba(232,87,26,.3)',
  };
}

const summaryBoxStyle = {
  marginTop: 16,
  padding: 12,
  background: 'rgba(255,255,255,.02)',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.06)',
};

const metricCardStyle = {
  padding: 8,
  borderRadius: 8,
  background: 'rgba(255,255,255,.03)',
  border: '1px solid rgba(255,255,255,.05)',
};

const metricLabelStyle = {
  display: 'block',
  fontSize: 10,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.45)',
  fontWeight: 800,
};

const metricValStyle = {
  fontSize: 14,
  color: '#fff',
  fontWeight: 800,
  marginTop: 2,
};

const successAlertStyle = {
  padding: 10,
  borderRadius: 8,
  background: 'rgba(34,197,94,.15)',
  border: '1px solid rgba(34,197,94,.3)',
  color: '#86efac',
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 10,
};

const errorAlertStyle = {
  padding: 10,
  borderRadius: 8,
  background: 'rgba(239,68,68,.15)',
  border: '1px solid rgba(239,68,68,.3)',
  color: '#fca5a5',
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 10,
};
