import React, { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import { getDailyOperations, generateDriverAssignmentLink, buildDriverWhatsAppMessage } from '../../lib/services/admin-api.js';
import { operationAlertPriority } from '../../lib/operations/deriveOperationAlerts.js';
import { AdminOperationsKpiPanel } from './admin-operations/AdminOperationsKpiPanel.jsx';
import { AdminOperationsDateFilter } from './admin-operations/AdminOperationsDateFilter.jsx';

const kpiGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '32px' };

const C = {
  navyMid: "#111827",
  navyLight: "#1F2937",
  orange: "#e8571a",
  white: "#FFFFFF",
  gray: "#9CA3AF",
  green: "#10B981",
  red: "#EF4444",
  yellow: "#F59E0B"
};

function Kpi({ label, value, tone = 'default' }) {
  const color = tone === 'green' ? C.green : tone === 'red' ? C.red : tone === 'yellow' ? C.yellow : C.white;
  return (
    <div style={{ background: C.navyLight, padding: '16px', borderRadius: '8px', border: '1px solid #374151' }}>
      <p style={{ fontSize: '12px', color: C.gray, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ fontSize: '24px', fontWeight: 'bold', color, margin: 0 }}>{value}</p>
    </div>
  );
}

export function AdminOperationsCenter({ onNav }) {
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  
  const [state, setState] = useState({ loading: true, error: null, assignments: [] });

  const loadData = async (targetDate) => {
    try {
      const data = await getDailyOperations(targetDate);
      setState({ loading: false, error: null, assignments: data });
    } catch (err) {
      console.error(err);
      setState({ loading: false, error: err.message || 'Errore di caricamento', assignments: [] });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    
    loadData(date).then(() => {
      if (cancelled) return;
    });
    
    const interval = setInterval(() => {
      if (!cancelled) loadData(date);
    }, 30000);
    
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [date]);

  // wa.me aperto (o messaggio copiato) NON e' prova che il messaggio sia
  // stato davvero inviato/consegnato: window.open apre solo una tab, non
  // conferma nulla. Prima di questo fix qui si registrava
  // assignment_program_sent in automatico ad ogni click (anche sul ramo
  // "copia", dove WhatsApp non viene nemmeno aperto), violando la regola del
  // ticket "NON registrare sent se non esiste prova reale". La sola prova
  // reale disponibile in questo sistema resta l'evento generato dal driver
  // (assignment_program_opened/confirmed in DriverAssignmentPage.jsx), stessa
  // semantica gia' corretta in AssignWork.jsx: qui si prepara solo il
  // messaggio, nessun evento viene scritto.
  const handleSendProgram = (assignment, method) => {
    try {
      const link = generateDriverAssignmentLink(assignment.id, assignment.access_token);
      const text = buildDriverWhatsAppMessage({
        operatorName: assignment.operator_profiles?.display_name,
        campaignTitle: assignment.campaigns?.title,
        date: new Date(assignment.starts_at).toLocaleDateString('it-IT'),
        comuni: assignment.zones.map(z => z.name),
        zone: assignment.zones.map((z, index) => `${index + 1}. ${z.name}`),
        qty: assignment.totalFlyers,
        total: `${assignment.totalFlyers.toLocaleString('it-IT')} volantini`,
        link
      });

      if (method === 'whatsapp') {
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
        alert('WhatsApp aperto. Lo stato "Inviato" verra mostrato solo dopo un evento reale del driver.');
      } else {
        navigator.clipboard.writeText(text);
        alert('Messaggio copiato negli appunti!');
      }
    } catch (err) {
      console.error(err);
      alert("Errore durante la preparazione del messaggio: " + err.message);
    }
  };

  const changeDate = (days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const setToday = () => {
    setDate(new Date().toISOString().split('T')[0]);
  };

  // Elaborazione KPIs e Cards
  const processedAssignments = useMemo(() => {
    return state.assignments.map(a => {
      const rawZones = a.operator_assignment_zones || [];
      const zones = rawZones.map(rz => {
        const cz = rz.campaign_zones || {};
        return {
          id: rz.id,
          name: rz.municipality_name,
          priority: cz.priority ?? 999,
          quantity: rz.quantity ?? cz.quantity_assigned ?? 0,
          status: cz.status || 'Da iniziare'
        };
      }).sort((z1, z2) => {
        // Ordina: In corso prima, poi Da iniziare, poi Completata/Bloccata ecc.
        const order = { 'In corso': 1, 'Da iniziare': 2, 'Completata': 3, 'Bloccata': 4, 'Parziale': 4 };
        const o1 = order[z1.status] || 5;
        const o2 = order[z2.status] || 5;
        if (o1 !== o2) return o1 - o2;
        if (z1.priority !== z2.priority) return z1.priority - z2.priority;
        return z1.name.localeCompare(z2.name);
      });

      const totalZones = zones.length;
      const completedZones = zones.filter(z => z.status === 'Completata').length;
      const totalFlyers = zones.reduce((sum, z) => sum + z.quantity, 0);
      
      const inProgress = zones.filter(z => z.status === 'In corso').length;
      const issues = zones.filter(z => z.status === 'Bloccata' || z.status === 'Parziale');
      
      let driverStatus = 'Da iniziare';
      let statusTone = 'default';
      
      if (issues.length > 0) {
        driverStatus = 'Problema';
        statusTone = 'red';
      } else if (inProgress > 0) {
        driverStatus = 'In corso';
        statusTone = 'green';
      } else if (totalZones > 0 && completedZones === totalZones) {
        driverStatus = 'Completato';
        statusTone = 'default';
      }

      const currentMunicipality = zones.find(z => z.status === 'In corso')?.name || (driverStatus === 'Completato' ? 'Programma completato' : 'Da iniziare');
      
      const progressRatio = `${completedZones} / ${totalZones}`;
      const progressPercent = totalZones > 0 ? Math.round((completedZones / totalZones) * 100) : 0;

      return {
        ...a,
        programStatus: a.programConfirmedAt
          ? 'Confermato'
          : a.programOpenedAt
            ? 'Aperto'
            : a.programSentAt
              ? 'Inviato'
              : 'Non inviato',
        zones,
        totalZones,
        completedZones,
        totalFlyers,
        driverStatus,
        statusTone,
        currentMunicipality,
        progressRatio,
        progressPercent,
        issues,
        alerts: a.alerts || [],
        alertPriority: operationAlertPriority(a.alerts)
      };
    }).sort((a, b) => {
      // Driver con zone in corso prima, poi da iniziare, poi completati
      if (a.alertPriority !== b.alertPriority) return b.alertPriority - a.alertPriority;
      const so = { 'Problema': 1, 'In corso': 2, 'Da iniziare': 3, 'Completato': 4 };
      const valA = so[a.driverStatus] || 5;
      const valB = so[b.driverStatus] || 5;
      if (valA !== valB) return valA - valB;
      const nameA = a.operator_profiles?.display_name || '';
      const nameB = b.operator_profiles?.display_name || '';
      return nameA.localeCompare(nameB);
    });
  }, [state.assignments]);

  const kpis = useMemo(() => {
    let drivers = processedAssignments.length;
    let campaigns = new Set(processedAssignments.map(a => a.campaign_id)).size;
    let municipalities = 0;
    let flyers = 0;
    let inProgress = 0;
    let completed = 0;
    let problem = 0;
    let alerts = 0;
    let criticalAlerts = 0;

    processedAssignments.forEach(a => {
      municipalities += a.totalZones;
      flyers += a.totalFlyers;
      alerts += a.alerts.length;
      criticalAlerts += a.alerts.filter(alert => alert.severity === 'CRITICAL').length;
      a.zones.forEach(z => {
        if (z.status === 'In corso') inProgress++;
        if (z.status === 'Completata') completed++;
        if (z.status === 'Bloccata' || z.status === 'Parziale') problem++;
      });
    });

    return { drivers, campaigns, municipalities, flyers, inProgress, completed, problem, alerts, criticalAlerts };
  }, [processedAssignments]);

  const breadcrumbs = [
    { label: "Dashboard", href: "/admin" },
    { label: "Centrale Operativa" }
  ];

  return (
    <AdminLayout title="Centrale Operativa Giornaliera" subtitle="Monitoraggio real-time assegnazioni" breadcrumbs={breadcrumbs} onNav={onNav}>
      
      {/* Date Filter */}
      <AdminOperationsDateFilter
        date={date}
        setDate={setDate}
        onPreviousDay={() => changeDate(-1)}
        onToday={setToday}
        onNextDay={() => changeDate(1)}
        loading={state.loading}
        colors={C}
        styles={{
          btnStyle,
        }}
      />

      {state.error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', padding: '12px', borderRadius: '6px', marginBottom: '24px' }}>
          {state.error}
        </div>
      )}

      {/* KPIs */}
      <AdminOperationsKpiPanel
        kpis={kpis}
        Kpi={Kpi}
        styles={{
          kpiGridStyle,
        }}
      />

      {kpis.alerts > 0 && (
        <section aria-labelledby="operations-alerts-title" style={{ background: C.navyLight, border: '1px solid #4B5563', borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <h2 id="operations-alerts-title" style={{ color: C.white, fontSize: 15, margin: '0 0 12px', letterSpacing: '0.06em' }}>ATTENZIONE OPERATIVA</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {processedAssignments.flatMap(assignment => assignment.alerts.map(alert => (
              <button key={alert.id} type="button" onClick={() => document.getElementById(`operation-${assignment.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} style={{ background: alert.severity === 'CRITICAL' ? 'rgba(239,68,68,.12)' : alert.severity === 'WARNING' ? 'rgba(245,158,11,.12)' : 'rgba(59,130,246,.12)', border: `1px solid ${alert.severity === 'CRITICAL' ? C.red : alert.severity === 'WARNING' ? C.yellow : '#60A5FA'}`, borderRadius: 6, padding: 12, textAlign: 'left', color: C.white, cursor: 'pointer' }}>
                <strong style={{ display: 'block', color: alert.severity === 'CRITICAL' ? C.red : alert.severity === 'WARNING' ? C.yellow : '#93C5FD', fontSize: 11 }}>{alert.severity}</strong>
                <span style={{ display: 'block', fontWeight: 800, marginTop: 4 }}>{assignment.operator_profiles?.display_name || 'Driver'}</span>
                <span style={{ display: 'block', color: '#D1D5DB', fontSize: 13, marginTop: 3 }}>{alert.message}</span>
              </button>
            ))) }
          </div>
        </section>
      )}

      {/* Driver Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {processedAssignments.length === 0 && !state.loading && (
          <p style={{ color: C.gray }}>Nessuna operazione trovata per questa data.</p>
        )}
        
        {processedAssignments.map(a => (
          <div id={`operation-${a.id}`} key={a.id} style={{ background: C.navyLight, border: `1px solid ${a.alertPriority === 3 ? C.red : a.alertPriority === 2 ? C.yellow : '#374151'}`, borderRadius: '8px', overflow: 'hidden', scrollMarginTop: 24 }}>
            {/* Card Header */}
            <div style={{ padding: '16px', borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', color: C.white, fontSize: '18px' }}>{a.operator_profiles?.display_name || 'Driver Sconosciuto'}</h3>
                <p style={{ margin: 0, color: C.gray, fontSize: '14px' }}>{a.operational_groups?.name || 'Gruppo Sconosciuto'} • {a.campaigns?.title || 'Campagna'}</p>
                
                <div style={{ marginTop: '12px', display: 'flex', gap: '16px', fontSize: '14px', flexWrap: 'wrap' }}>
                  <span style={{ color: a.statusTone === 'green' ? C.green : a.statusTone === 'red' ? C.red : C.white, fontWeight: 'bold' }}>
                    STATO: {a.driverStatus}
                  </span>
                  <span style={{ color: C.gray }}>|</span>
                  <span style={{ color: C.white }}>Progresso: {a.progressRatio} comuni completati ({a.progressPercent}%)</span>
                  <span style={{ color: C.gray }}>|</span>
                  <span style={{ color: C.white }}>Comune attuale: <strong>{a.currentMunicipality}</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', textAlign: 'right' }}>
                <div style={{ fontSize: '14px', color: C.white }}>
                  <strong>{a.totalZones}</strong> comuni • <strong>{a.totalFlyers.toLocaleString('it-IT')}</strong> volantini
                </div>
                {a.alerts.length > 0 && <span style={{ alignSelf: 'flex-end', background: a.alertPriority === 3 ? C.red : C.yellow, color: a.alertPriority === 3 ? C.white : C.navyMid, borderRadius: 999, padding: '4px 9px', fontSize: 12, fontWeight: 900 }}>⚠ {a.alerts.length} alert</span>}
                {a.issues.length > 0 && (
                  <div style={{ color: C.red, fontSize: '14px', fontWeight: 'bold' }}>
                    ⚠ {a.issues.length} {a.issues.length === 1 ? 'problema' : 'problemi'} ({a.issues.map(i => i.name).join(', ')})
                  </div>
                )}
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: C.gray }}>
                  <span style={{
                    color: a.programConfirmedAt ? C.green : a.programOpenedAt ? C.yellow : a.programSentAt ? C.white : C.gray,
                    fontWeight: 'bold',
                    padding: '2px 7px',
                    borderRadius: '999px',
                    border: `1px solid ${a.programConfirmedAt ? C.green : a.programOpenedAt ? C.yellow : '#4B5563'}`,
                  }}>Programma: {a.programStatus.toUpperCase()}</span>
                  <span>Inviato: {a.programSentAt ? new Date(a.programSentAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'No'}</span>
                  <span style={{ color: a.programOpenedAt ? C.green : C.gray, fontWeight: a.programOpenedAt ? 'bold' : 'normal' }}>
                    Aperto: {a.programOpenedAt ? new Date(a.programOpenedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'No'}
                  </span>
                  <span style={{ color: a.programConfirmedAt ? C.green : C.gray, fontWeight: a.programConfirmedAt ? 'bold' : 'normal' }}>
                    Confermato: {a.programConfirmedAt ? new Date(a.programConfirmedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'No'}
                  </span>
                  <span>GPS: {a.lastPing ? new Date(a.lastPing).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : 'Nessun segnale'}</span>
                  <span>Foto ricevute: {a.photosCount}</span>
                </div>
              </div>
            </div>

            {a.alerts.length > 0 && (
              <div style={{ padding: '10px 16px', display: 'grid', gap: 6, background: 'rgba(0,0,0,.16)', borderBottom: '1px solid #374151' }}>
                {a.alerts.map(alert => <div key={alert.id} style={{ color: alert.severity === 'CRITICAL' ? '#FCA5A5' : alert.severity === 'WARNING' ? '#FCD34D' : '#93C5FD', fontSize: 13, fontWeight: 700 }}>{alert.message}</div>)}
              </div>
            )}

            {/* Card Body - Zones */}
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {a.zones.map(z => (
                <div key={z.id} style={{ background: C.navyMid, padding: '12px', borderRadius: '6px', borderLeft: `4px solid ${z.status === 'In corso' ? C.green : z.status === 'Completata' ? C.gray : z.status === 'Bloccata' || z.status === 'Parziale' ? C.red : C.orange}` }}>
                  <p style={{ margin: '0 0 4px 0', color: C.white, fontWeight: 'bold' }}>{z.name}</p>
                  <p style={{ margin: '0 0 4px 0', color: C.gray, fontSize: '12px' }}>{z.quantity.toLocaleString('it-IT')} volantini</p>
                  <p style={{ margin: 0, fontSize: '12px', color: z.status === 'In corso' ? C.green : C.gray }}>{z.status}</p>
                </div>
              ))}
            </div>

            {/* Card Footer - Actions */}
            <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.1)', borderTop: '1px solid #374151', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={() => handleSendProgram(a, 'whatsapp')} style={{...actionBtnStyle, background: 'rgba(16, 185, 129, 0.1)', color: C.green, border: `1px solid ${C.green}`}}>Invia via WhatsApp</button>
              <button onClick={() => handleSendProgram(a, 'copy')} style={actionBtnStyle}>Copia Messaggio</button>
              <div style={{ width: '1px', background: '#374151', margin: '0 4px' }}></div>
              <button onClick={() => window.open(generateDriverAssignmentLink(a.id, a.access_token), '_blank')} style={actionBtnStyle}>Apri programma</button>
              <button onClick={() => {
                navigator.clipboard.writeText(generateDriverAssignmentLink(a.id, a.access_token));
                alert('Link personale copiato — non condividere con altri operatori. Ogni operatore deve avere il proprio link.');
              }} style={actionBtnStyle}>Copia link Driver</button>
              <button onClick={() => onNav(`admin-gps:${a.campaign_id}`)} style={actionBtnStyle}>GPS Live</button>
              <button onClick={() => onNav(`admin-assignments:${a.campaign_id}`)} style={actionBtnStyle}>Modifica assegnazioni</button>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}

const btnStyle = {
  background: '#374151',
  color: C.white,
  border: 'none',
  padding: '8px 16px',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'background 0.2s'
};

const actionBtnStyle = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid #4B5563',
  color: '#D1D5DB'
};
