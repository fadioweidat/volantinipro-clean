import { useEffect, useState } from 'react';
import { getCampaignZonesWithGroups, updateCampaignZoneAssignment } from '../../lib/services/admin-api.js';

export function ZoneAssignmentsPanel({ campaignId }) {
  const [state, setState] = useState({ loading: true, error: null, zones: [], groups: [] });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { zones, groups } = await getCampaignZonesWithGroups(campaignId);
        if (!cancelled) setState({ loading: false, error: null, zones, groups });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: err?.message || 'Errore caricamento zone' }));
      }
    }
    load();
  }, [campaignId]);

  async function handleUpdateZone(zoneId, updates) {
    try {
      const updated = await updateCampaignZoneAssignment(zoneId, updates);
      setState((prev) => ({
        ...prev,
        zones: prev.zones.map(z => z.id === zoneId ? { ...z, ...updated } : z)
      }));
    } catch (err) {
      alert(err.message || 'Errore salvataggio zona');
    }
  }

  if (state.loading) return <div style={panelStyle}><p style={mutedStyle}>Caricamento zone...</p></div>;
  if (state.error) return <div style={{...panelStyle, borderColor: '#ef4444'}}><p style={{color: '#fca5a5'}}>{state.error}</p></div>;
  if (!state.zones.length) return <div style={panelStyle}><p style={mutedStyle}>Nessuna zona configurata per questa campagna.</p></div>;

  return (
    <div style={panelStyle}>
      <p style={eyebrowStyle}>Assegnazione Zone (NIL / Comuni)</p>
      
      <div style={{ display: 'grid', gap: 10 }}>
        {state.zones.map((zone) => (
          <div key={zone.id} style={zoneRowStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: '#fff', fontSize: 14 }}>{zone.zone_name}</strong>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginLeft: 8 }}>
                  Status: {zone.status || 'Da iniziare'}
                </span>
              </div>
            </div>
            
            <div style={controlsGridStyle}>
              <label style={labelStyle}>
                Assegnato a
                <select 
                  value={zone.group_id || ''} 
                  onChange={(e) => handleUpdateZone(zone.id, { group_id: e.target.value || null })}
                  style={inputStyle}
                >
                  <option value="">-- Non assegnato --</option>
                  {state.groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Qtà Assegnata
                <input 
                  type="number" 
                  value={zone.quantity_assigned || ''}
                  onChange={(e) => handleUpdateZone(zone.id, { quantity_assigned: e.target.value ? parseInt(e.target.value) : null })}
                  style={inputStyle}
                  placeholder="es. 1500"
                />
              </label>

              <label style={labelStyle}>
                Priorità
                <input 
                  type="number" 
                  value={zone.priority || 0}
                  onChange={(e) => handleUpdateZone(zone.id, { priority: e.target.value ? parseInt(e.target.value) : 0 })}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const panelStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 16, marginBottom: 16 };
const eyebrowStyle = { margin: '0 0 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', fontWeight: 900 };
const zoneRowStyle = { background: 'rgba(0,0,0,.15)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 8, padding: 12 };
const controlsGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 };
const labelStyle = { display: 'grid', gap: 4, fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 700 };
const inputStyle = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13, width: '100%' };
const mutedStyle = { color: 'rgba(255,255,255,.48)', fontSize: 13 };
