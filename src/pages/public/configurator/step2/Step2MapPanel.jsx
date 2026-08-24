import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { H2H_HOTSPOT_META, getComuneColor } from "../../../../lib/step2/businessZoneHelpers.js";
import { businessOptionLabel, BUSINESS_DELIVERY_METHODS, BUSINESS_RECIPIENTS } from "../../../../lib/business/business-config.js";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { Step2Map } from "../../../../components/Step2Map.jsx";
import { Step2MapErrorBoundary } from "../../../../components/Step2MapErrorBoundary.jsx";
import { formatRadiusLabel } from "../../../../lib/utils/format.js";
import { getCoverageStatus } from "../../../../lib/step2/buildStep2ViewModel.js";
import { normalizeMunicipalityName } from "../../../../lib/step2/addressIntent.js";
import { truthfulSourceLabel } from "../../../../lib/step2/truthfulSourceLabel.js";

export function Step2MapPanel({ activeMapLayers, city, handleManualMapClick, hasUnconfirmedAddressPoint, isBusinessStep2, isMovementStep2, manualPinMode, mapBasemap, mapConfiniOn, pois, radius, selZones, setActiveMapLayers, setManualPinMode, setMapBasemap, setMapConfiniOn, showTerritoryData }) {
  return (
    <>
      {/* MAPPA GRANDE — solo Vista Cliente. */}
          <div style={{
            borderRadius: 14,
            overflow: "hidden",
            position: "relative",
            background: "linear-gradient(135deg,#081610 0%,#080f1e 60%,#100819 100%)",
            border: "1px solid rgba(255,255,255,.08)"
          }}>
            {manualPinMode && <div style={{
              position: "absolute",
              top: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1000,
              padding: "10px 18px",
              borderRadius: 30,
              background: "#1E3A8A",
              border: "2px solid #60A5FA",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13,
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(0,0,0,.6)",
              display: "flex",
              alignItems: "center",
              gap: 10
            }}>
                <span style={{
                display: "flex",
                alignItems: "center",
                gap: 6
              }}><Step1Icon name="pin" size={14} /> Clicca su un punto qualsiasi della mappa per calcolare il raggio</span>
                <button onClick={() => setManualPinMode(false)} style={{
                padding: "4px 10px",
                borderRadius: 14,
                border: "none",
                background: "rgba(255,255,255,.2)",
                color: C.white,
                fontSize: 11,
                cursor: "pointer"
              }}>
                  Annulla
                </button>
              </div>}
            {isRadiusMode && radiusKm > 0 && serviceKpis?.coverage != null && <div style={{
              position: "absolute",
              top: 14,
              right: 14,
              zIndex: 999,
              pointerEvents: "none",
              padding: "6px 12px",
              borderRadius: 20,
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.18)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 800,
              color: C.white
            }}>
                <span style={{
                color: "#38BDF8"
              }}>{formatRadiusLabel(radiusKm)}</span>
                <span style={{
                color: "rgba(255,255,255,0.4)"
              }}>·</span>
                <span style={{
                color: getCoverageStatus(serviceKpis.coverage) === "coperto" ? "#22C55E" : getCoverageStatus(serviceKpis.coverage) === "parziale" ? "#FACC15" : "#F87171"
              }}>
                  {sharedCoveragePctText} copertura
                </span>
              </div>}
            <Step2MapErrorBoundary resetKey={`${mapCityForStep2?.name || mapCityForStep2?.label || ""}|${data.activeZoneId || ""}`}>
            <Step2Map city={mapCityForStep2} radius={isRadiusMode ? Number(radiusKm) || Number(radius) || 3 : radiusKm} svcType={svcType} serviceColor={col} zonesWithCoords={zonesWithCoords} selected={selected} onToggleZone={toggleZone} apiData={apiData} targetColor={targetBusinessMeta?.color || '#a78bfa'} activeLayers={activeMapLayers} settori={sectors} pois={pois} loadingPois={poiLoading} poiEmptySectorLabel={poiEmptySectorLabel} poiFetchFailed={poiFetchFailed} onRetryPoi={retryPoi} operationalPoints={step1OperationalPoints} poiAssignments={poiAssignments} onTogglePoi={togglePoiAssignment} focusPoiId={focusedPoiId} focusPoiNonce={focusedPoiNonce} businessConfig={isBusinessStep2 ? {
              deliveryLabel: businessOptionLabel(BUSINESS_DELIVERY_METHODS, data.businessDeliveryMethod),
              recipientLabel: businessOptionLabel(BUSINESS_RECIPIENTS, data.businessPreferredRecipient)
            } : null} civiciState={civiciState} onLayerToggle={id => {
              if (id === "civici" && !civiciAvailable) return;
              if (id === "settori" && !sectors) return;
              setActiveMapLayers(prev => ({
                ...prev,
                [id]: !prev[id]
              }));
            }} campaignZones={data.campaignZones} activeZoneId={data.activeZoneId} onSelectZone={selectCampaignZone} municipalityBoundary={
            // In Comune mode (isComuneMode): always pass the boundary — it is the territory itself.
            // mapConfiniOn does NOT gate the Comune polygon; it only gates the boundary in Raggio/address mode.
            // hiddenBoundaries (per-comune toggle from the UI) still applies.
            // Indirizzo non confermato: il confine comune viene passato come contesto leggero tratteggiato.
            (isComuneMode || mapConfiniOn && searchMode === "address") && municipalityBoundary ? Array.isArray(municipalityBoundary) ? municipalityBoundary.filter(b => !hiddenBoundaries.includes(normalizeMunicipalityName(b?.name || ""))) : hiddenBoundaries.includes(normalizeMunicipalityName(municipalityBoundary?.name || city?.label || city?.name || "")) ? null : municipalityBoundary : null} isMunicipalityMode={isComuneMode && !hasUnconfirmedAddressPoint} unconfirmedAddressMode={hasUnconfirmedAddressPoint} nilMode={isNilManualMode} coveragePolygons={mapCoverageZones} zoneAllocationById={zoneAllocationById} boundaryKpis={boundaryKpisForMap} themeMode={viewMode !== "distribuzione"} activeLayerId={activeLay?.id || null} zoneCoverageById={zoneCoverageById} basemap={mapBasemap} mapConfiniOn={mapConfiniOn} onToggleConfini={() => setMapConfiniOn(v => !v)} dusafLanduse={dusafLanduse} omiInfo={omiInfo} onBasemapToggle={() => setMapBasemap(b => b === "standard" ? "satellite" : "standard")} onMapClick={manualPinMode ? handleManualMapClick : null} />
            </Step2MapErrorBoundary>
            {showTerritoryData && (gisLoading || gisTimedOut) && <div style={{
              position: "absolute",
              inset: 0,
              zIndex: 760,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: gisTimedOut ? "rgba(8,15,30,.18)" : "rgba(8,15,30,.08)"
            }}>
                <div style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(8,15,30,.88)",
                border: `1px solid ${gisTimedOut ? "rgba(239,68,68,.26)" : "rgba(255,255,255,.12)"}`,
                color: gisTimedOut ? "#FCA5A5" : C.white,
                fontFamily: F.sans,
                fontSize: 12,
                fontWeight: 800,
                boxShadow: "0 10px 28px rgba(0,0,0,.34)",
                backdropFilter: "blur(10px)"
              }}>
                  {gisTimedOut ? "Dati non disponibili, riprova o cambia raggio." : "Analisi GIS in corso..."}
                </div>
              </div>}

            {/* Map overlays */}
            <div style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              display: "flex",
              gap: 6
            }}>
              <div style={{
                background: "rgba(8,15,30,.9)",
                backdropFilter: "blur(8px)",
                borderRadius: 6,
                padding: "4px 9px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.5)",
                border: "1px solid rgba(255,255,255,.07)"
              }}>
                CartoDB – OSM
              </div>
              {isAdminView && activeLay && viewMode !== "distribuzione" && <div style={{
                background: "rgba(8,15,30,.88)",
                borderRadius: 6,
                padding: "4px 9px",
                fontFamily: F.sans,
                fontSize: 9,
                color: "rgba(255,255,255,.55)",
                border: "1px solid rgba(255,255,255,.06)"
              }}>
                  Layer: <b style={{
                  color: col
                }}>{activeLay.label}</b>
                </div>}
            </div>
            {city && selZones.length > 0 && searchMode !== "municipality" && <div style={{
              position: "absolute",
              top: 58,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,15,30,.82)",
              border: `1px solid ${col}55`,
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: F.sans,
              fontSize: 9,
              fontWeight: 700,
              color: C.white
            }}>
                {selZones.length} {selZones.length === 1 ? "zona" : "zone"} selezionate
              </div>}
            {/* Badge "Intero comune" — visibile solo in modalità comune, e
                solo dopo conferma: mentre un indirizzo non è confermato non
                è ancora vero che la distribuzione è "limitata al confine
                comunale" (potrebbe diventare un raggio o una NIL). */}
            {searchMode === "municipality" && city && !hasUnconfirmedAddressPoint && <div style={{
              position: "absolute",
              top: 10,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,22,12,.92)",
              border: "1px solid rgba(34,197,94,.45)",
              borderRadius: 8,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7
            }}>
                <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#22C55E",
                flexShrink: 0
              }} />
                <div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#22C55E"
                }}>Intero comune: {city.label || city.name}</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.5)",
                  marginTop: 1
                }}>Distribuzione limitata al confine comunale</div>
                </div>
              </div>}
            {hasUnconfirmedAddressPoint && <div style={{
              position: "absolute",
              top: 10,
              right: 10,
              pointerEvents: "none",
              background: "rgba(8,15,30,.92)",
              border: "1px solid rgba(59,130,246,.45)",
              borderRadius: 8,
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: 7
            }}>
                <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#60A5FA",
                flexShrink: 0
              }} />
                <div>
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: F.sans,
                  fontSize: 10,
                  fontWeight: 900,
                  color: "#60A5FA"
                }}><Step1Icon name="pin" size={11} /> Indirizzo selezionato</div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 8,
                  color: "rgba(255,255,255,.5)",
                  marginTop: 1
                }}>{selectedSearchPoint?.label || "Scegli raggio o comune completo"}</div>
                </div>
              </div>}
            {showTerritoryData && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 230
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: "#22C55E",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>{isNilAnalysis ? "NIL Milano" : "Residential territory"}</div>
                {residentialRadiusRows.slice(0, 4).map(r => <div key={r.id} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: getComuneColor(r.id),
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)",
                  flex: 1
                }}>{r.name}</span>
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  fontWeight: 800,
                  color: C.white
                }}>{r.strength}/100</span>
                  </div>)}
              </div>}
            {isBusinessStep2 && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 220
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: targetBusinessMeta.color,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>Commercial intelligence</div>
                {[{
                c: targetBusinessMeta.color,
                l: "attività target / categoria"
              }, {
                c: C.red,
                l: "competitor rilevati"
              }, {
                c: C.purple,
                l: "pocket commerciali forti"
              }].map(({
                c,
                l
              }) => <div key={l} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c,
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)"
                }}>{l}</span>
                  </div>)}
              </div>}
            {isMovementStep2 && city && <div style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(8,15,30,.88)",
              borderRadius: 8,
              padding: "8px 10px",
              border: "1px solid rgba(255,255,255,.08)",
              maxWidth: 230
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: C.blue,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                marginBottom: 6
              }}>Movement intelligence</div>
                {[{
                c: H2H_HOTSPOT_META.transit.color,
                l: "transit / stazioni"
              }, {
                c: H2H_HOTSPOT_META.school.color,
                l: "scuole, eventi, anchor"
              }, {
                c: H2H_HOTSPOT_META.retail.color,
                l: "POI e strade attive"
              }, {
                c: C.blue,
                l: "flusso e pass-through"
              }].map(({
                c,
                l
              }) => <div key={l} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4
              }}>
                    <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: c,
                  display: "inline-block"
                }} />
                    <span style={{
                  fontFamily: F.sans,
                  fontSize: 9,
                  color: "rgba(255,255,255,.58)"
                }}>{l}</span>
                  </div>)}
              </div>}
            {/* Legend tematica overlay */}
            {viewMode === "tematica" && activeLay && zonesInRadius.length > 0 && <div style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              background: "rgba(8,15,30,.9)",
              backdropFilter: "blur(8px)",
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid rgba(255,255,255,.10)",
              minWidth: 130
            }}>
                <div style={{
                fontFamily: F.sans,
                fontSize: 8,
                fontWeight: 800,
                color: col,
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: ".06em"
              }}>Layer attivo: {activeLay.label}</div>
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: F.sans,
                fontSize: 8,
                color: "rgba(255,255,255,.4)",
                marginBottom: 3
              }}>
                  <span>{thMin > 0 ? activeLay.fmt(Math.round(thMin)) : "Basso"}</span><span>{thMax > 0 ? activeLay.fmt(Math.round(thMax)) : "Alto"}</span>
                </div>
                <div style={{
                width: "100%",
                height: 6,
                borderRadius: 3,
                background: `linear-gradient(to right,${activeLay.lo},${activeLay.hi})`
              }} />
                <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(255,255,255,.28)",
                marginTop: 2
              }}>
                  <span>basso</span><span>medio</span><span>alto</span>
                </div>
                {zonesWithCoords.filter(z => !z.metricColor).length > 0 && <div style={{
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(248,113,113,.7)",
                marginTop: 3
              }}>
                    {zonesWithCoords.filter(z => !z.metricColor).length} zone: dato non disponibile
                  </div>}
                <div style={{
                fontFamily: F.sans,
                fontSize: 7,
                color: "rgba(255,255,255,.22)",
                marginTop: 2
              }}>Fonte: {truthfulSourceLabel(activeLay.src)}</div>
              </div>}

          </div>
    </>
  );
}
