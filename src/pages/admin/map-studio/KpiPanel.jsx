// Studio Mappa — KPI professionali. RETE % e AREA % SEMPRE separate e
// distinte, in due blocchi diversi.
import { useMemo } from 'react';
import { kpiTile, panel, panelTitle } from './mapStudioStyles.js';
import { computeKpi } from './mapStudioKpi.js';

function Tile({ label, value, hint }) {
  return (
    <div style={kpiTile}>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.5)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>{hint}</div>}
    </div>
  );
}

export function KpiPanel({ project }) {
  const network = project.auto?.lastResult
    ? {
      totalNetworkM: project.auto.lastResult.totalNetworkM,
      selectedNetworkM: project.auto.lastResult.selectedNetworkM,
      networkPercentLabel: project.auto.lastResult.label,
    }
    : null;

  const kpi = useMemo(() => computeKpi(project, network), [project, network]);

  const nf = (v, suffix = '') => (v == null ? 'n/d' : `${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 })}${suffix}`);

  return (
    <div style={panel}>
      <p style={panelTitle}>KPI</p>

      <p style={{ ...panelTitle, marginTop: 4, color: '#93c5fd' }}>Rete stradale (metrica lineare)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Tile label="Rete totale" value={nf(kpi.network.totalKm, ' km')} />
        <Tile label="Rete selezionata" value={nf(kpi.network.selectedKm, ' km')} />
        <Tile label="RETE %" value={kpi.network.selectedPercent == null ? 'n/d' : `${kpi.network.selectedPercent}%`} hint={kpi.network.label || 'esegui l’automatico'} />
        <Tile label="Comune" value={kpi.municipality || 'n/d'} />
      </div>

      <p style={{ ...panelTitle, marginTop: 10, color: '#86efac' }}>Area geografica (metrica areale — stima)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Tile label="Area comune" value={nf(kpi.area.municipalityKm2, ' km²')} />
        <Tile label="Area coperta stimata" value={nf(kpi.area.coveredKm2, ' km²')} hint={kpi.area.method} />
        <Tile label="AREA %" value={kpi.area.coveredPercent == null ? 'n/d' : `${kpi.area.coveredPercent}%`} hint={`raster ${kpi.area.rasterCellM} m`} />
        <Tile label="Volantini (stima)" value={nf(kpi.estimatedFlyers)} />
      </div>

      <p style={{ ...panelTitle, marginTop: 10 }}>Disegno</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <Tile label="Linee" value={kpi.counts.lines} />
        <Tile label="Punti" value={kpi.counts.points} />
        <Tile label="Operatori" value={kpi.counts.operators} />
        <Tile label="Km disegnati" value={nf(kpi.drawnKm, ' km')} />
        <Tile label="Ore stimate" value={nf(kpi.totalEstimatedHours, ' h')} />
        <Tile label="Poligoni" value={kpi.counts.polygons} />
      </div>

      <p style={{ ...panelTitle, marginTop: 10 }}>Per operatore</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {kpi.perOperator.map((o) => (
          <div key={o.operatorId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: o.color }} />
            <span style={{ flex: 1 }}>{o.name}</span>
            <span>{nf(o.km, ' km')}</span>
            <span style={{ color: 'rgba(255,255,255,.5)' }}>{nf(o.estimatedHours, ' h')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
