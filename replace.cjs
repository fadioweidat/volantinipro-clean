const fs = require('fs');
const file = 'src/pages/public/configurator/Step2.jsx';
let content = fs.readFileSync(file, 'utf8');

const sortTargetRegex = /const zoneSortValue = \(zone, sortId\) => \{[\s\S]*?return Number\(zone\.families \?\? zone\.famiglie \?\? zCap\(zone\) \?\? 0\);\s*\};/;

const sortReplacement = `const zoneSortValue = (zone, sortId) => {
    if (sortId === "coverage") return Number(zone.coverage ?? zone.pct ?? zone.percent_nel_raggio ?? 0);
    if (sortId === "families") return Number(zone.families ?? zone.famiglie ?? 0);
    if (sortId === "assigned") {
      const alloc = zonesAllocation.find(a => a.id === zone.id);
      return Math.max(0, Number(alloc?.assignedFlyers || alloc?.assigned || alloc?.allocated || alloc?.volantini_assegnati || 0));
    }
    return Number(zone.families ?? zone.famiglie ?? zCap(zone) ?? 0);
  };`;

content = content.replace(sortTargetRegex, sortReplacement);

const tableStartString = '{showClientZoneDetails && (() => {';
const tableEndString = "L'allocazione automatica parte dalle zone a maggiore densità di famiglie. Puoi coprire il tuo comune aumentando la quantità o passando alla modalità Manuale.";

const startIdx = content.indexOf(tableStartString);
// Find the closing divs and closing brace for the IIFE after tableEndString
const endIdx = content.indexOf('})()}', content.indexOf(tableEndString)) + 5;

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `{showClientZoneDetails && (() => {
              const detailZones = isMovementStep2 ? h2hMetrics.clusters : isBusinessStep2 && businessMetrics.clusterRows.length ? businessMetrics.clusterRows : sortedResidentialZones;
              
              let sumTarget = 0;
              let sumAssigned = 0;
              let countComplete = 0;
              let countPartial = 0;
              let countExcluded = 0;
              
              const tableRows = detailZones.map((zone, index) => {
                const allocation = zoneAllocationById?.[zone.id] || null;
                const assigned = Math.max(0, Number(allocation?.assignedFlyers || 0));
                const target = isResidentialStep2 ? Number(zone.families || zone.famiglie || zone.households || 0) : isMovementStep2 ? Number(zone.poi || zone.points || zone.transitStops || 0) : Number(zone.targetBiz || zone.businesses || zone.value || 0);
                const coverage = target > 0 ? Math.min(100, (assigned / target) * 100) : 0;
                const missing = Math.max(0, target - assigned);
                const status = assigned <= 0 ? "Escluso" : assigned >= target ? "Completo" : "Parziale";
                
                sumTarget += target;
                sumAssigned += assigned;
                if (status === "Completo") countComplete++;
                else if (status === "Parziale") countPartial++;
                else countExcluded++;
                
                return { zone, index, assigned, target, coverage, missing, status, allocation };
              });
              
              const overallCoverage = sumTarget > 0 ? Math.min(100, (sumAssigned / sumTarget) * 100) : 0;

              return <div id="vp-step2-zone-details-panel" className="vp-step2-zone-details__panel">
                    <div style={{
                      display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, padding: 12, 
                      background: "rgba(255,255,255,.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,.06)"
                    }}>
                      <div style={{flex: "1 1 45%", display: "flex", flexDirection: "column", gap: 2}}>
                        <span style={{fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase"}}>Comuni nel raggio</span>
                        <strong style={{fontSize: 14, color: C.white}}>{detailZones.length}</strong>
                      </div>
                      <div style={{flex: "1 1 45%", display: "flex", flexDirection: "column", gap: 2}}>
                        <span style={{fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase"}}>Copertura complessiva del fabbisogno</span>
                        <strong style={{fontSize: 14, color: col}}>{formatPercentIT(overallCoverage, 1)}</strong>
                      </div>
                      <div style={{flex: "1 1 100%", display: "flex", gap: 16, marginTop: 4, fontSize: 12}}>
                        <span style={{color: "#86EFAC"}}>• {countComplete} completi</span>
                        <span style={{color: "#FCD34D"}}>• {countPartial} parziali</span>
                        <span style={{color: "#FCA5A5"}}>• {countExcluded} esclusi</span>
                      </div>
                    </div>

                    {showTerritoryData && <div className="vp-step2-zone-details__sort" aria-label="Ordina dettaglio zone">
                        <span>Ordina per</span>
                        {[["relevance", "Priorità"], ["families", "Target"], ["coverage", "Copertura"], ["assigned", "Quantità assegnata"]].map(([id, label]) => <button type="button" key={id} aria-pressed={zoneListSort === id} onClick={() => setZoneListSort(id)}>{label}</button>)}
                      </div>}
                    
                    {!isMobile ? (
                      <table className="vp-step2-zone-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ minWidth: 140, whiteSpace: "nowrap", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Zona / NIL</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>{isResidentialStep2 ? "Famiglie stimate" : isMovementStep2 ? "Pubblico / punti" : "Attività / target"}</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Assegnati</th>
                            <th style={{ textAlign: "right", padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Mancanti</th>
                            <th style={{ padding: "8px 12px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Copertura del fabbisogno cassette</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Priorità</th>
                            <th style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.1)" }}>Stato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row) => {
                            const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                            const rowKey = zone.id || zone.name || index;
                            const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;
                            
                            let statusColor = "#FCA5A5";
                            let statusBg = "rgba(248,113,113,.1)";
                            if (status === "Completo") {
                              statusColor = "#86EFAC";
                              statusBg = "rgba(34,197,94,.1)";
                            } else if (status === "Parziale") {
                              statusColor = "#FCD34D";
                              statusBg = "rgba(250,204,21,.1)";
                            }

                            return <tr key={rowKey} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                                <th scope="row" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, padding: "8px 12px", textAlign: "left", fontWeight: "normal" }} title={zone.name || zone.label || \`Zona \${index + 1}\`}>
                                  {zone.name || zone.label || \`Zona \${index + 1}\`}
                                </th>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px" }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</td>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px" }}>{formatIntegerIT(assigned)}</td>
                                <td className="vp-data-number" style={{ textAlign: "right", padding: "8px 12px", color: missing > 0 ? "rgba(255,255,255,.6)" : "inherit" }}>{formatIntegerIT(missing)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span className="vp-data-number" style={{ minWidth: 45 }}>{formatPercentIT(coverage, 1)}</span>
                                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2, overflow: "hidden" }}>
                                      <div style={{ width: \`\${coverage}%\`, height: "100%", background: statusColor, borderRadius: 2 }} />
                                    </div>
                                  </div>
                                </td>
                                <td style={{ textAlign: "center", padding: "8px 12px" }}>{priorityLabel}</td>
                                <td style={{ textAlign: "center", padding: "8px 12px" }}>
                                  <span style={{
                                    display: "inline-block", padding: "2px 8px", borderRadius: 12,
                                    fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                                    color: statusColor, background: statusBg
                                  }}>
                                    {status}
                                  </span>
                                </td>
                              </tr>;
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {tableRows.map((row) => {
                          const { zone, index, assigned, target, coverage, missing, status, allocation } = row;
                          const rowKey = zone.id || zone.name || index;
                          const priorityLabel = allocation?.priorityRank === 1 ? "1" : allocation?.priorityRank || index + 1;
                          
                          let statusColor = "#FCA5A5";
                          let statusBg = "rgba(248,113,113,.1)";
                          if (status === "Completo") {
                            statusColor = "#86EFAC";
                            statusBg = "rgba(34,197,94,.1)";
                          } else if (status === "Parziale") {
                            statusColor = "#FCD34D";
                            statusBg = "rgba(250,204,21,.1)";
                          }

                          return <div key={rowKey} style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 12, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                              <strong style={{ fontSize: 14, color: C.white }}>{zone.name || zone.label || \`Zona \${index + 1}\`}</strong>
                              <span style={{
                                padding: "2px 8px", borderRadius: 12, fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                                color: statusColor, background: statusBg
                              }}>{status}</span>
                            </div>
                            
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,.1)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: \`\${coverage}%\`, height: "100%", background: statusColor, borderRadius: 3 }} />
                              </div>
                              <span className="vp-data-number" style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>{formatPercentIT(coverage, 1)}</span>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 12px" }}>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>{isResidentialStep2 ? "Famiglie stimate" : "Target"}</div>
                                <div className="vp-data-number" style={{ fontSize: 13 }}>{target > 0 ? formatIntegerIT(target) : "N/D"}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Assegnati</div>
                                <div className="vp-data-number" style={{ fontSize: 13 }}>{formatIntegerIT(assigned)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Mancanti</div>
                                <div className="vp-data-number" style={{ fontSize: 13, color: missing > 0 ? "rgba(255,255,255,.7)" : "inherit" }}>{formatIntegerIT(missing)}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", marginBottom: 2 }}>Priorità</div>
                                <div style={{ fontSize: 13 }}>{priorityLabel}</div>
                              </div>
                            </div>
                          </div>;
                        })}
                      </div>
                    )}

                    {showTerritoryData && <div style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.07)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)",
                  lineHeight: 1.5
                }}>
                        L'allocazione automatica parte dalle zone a maggiore densità di target. Puoi coprire il tuo comune aumentando la quantità o passando alla modalità Manuale.
                      </div>}
                  </div>;
            })()}`;
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  fs.writeFileSync(file, content);
  console.log('Replaced successfully');
} else {
  console.log('Could not find start or end index', startIdx, endIdx);
}
