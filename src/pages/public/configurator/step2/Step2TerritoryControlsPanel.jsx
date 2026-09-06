import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT, formatNumber, formatRadiusLabel } from "../../../../lib/utils/format.js";
import { InteractiveRadiusSlider } from "../../../../components/InteractiveRadiusSlider.jsx";
import { Step1Icon } from "../../../../components/Step1Icon.jsx";
import { applyConfiguratorServiceChange } from "../../../../lib/configuratorServiceTransition.js";
import { getServiceAccent } from "../../../../lib/services/service-config.js";
import { detectSearchIntent, ADDRESS_INTENT_RE, isGeocoderResultInMilanoComune, looksLikeAddressResult, logAddressVsMunicipalityDebug, normalizeMunicipalityName, isNilLikePlaceType } from "../../../../lib/step2/addressIntent.js";
import { S2_RADII } from "../../../../lib/step2/s2Constants.js";

export function Step2TerritoryControlsPanel({ activeAreaTab, activeZoneId, addressFullCoverageConfirmed, addressIntentInMilano, addressSearchError, apiLoading, appendMunicipalityToActiveZone, campaignZones, capSearchLoading, capSuggestions, city, col, data, dropOpen, duplicateComuneNotice, geocodeSuggestions, getCampaignZoneLabel, handleAddZone, handleCapSelect, hasSearchPoint, hasUnconfirmedAddressPoint, hiddenBoundaries, isAdminView, isBusinessStep2, isMobile, isMovementStep2, isNilAnalysis, isRadiusMode, municipalityBoundary, nilManualMode, onBack, pendingAddMunicipality, pill, radiusAdvisoryData, radiusKm, recommendedRadiusForSlider, removeMunicipalityFromActiveZone, resetActiveZone, resolveMilanoCity, search, searchedLocation, searchMode, selectAddressPointInMilano, selectCampaignZone, selectMilanoAsNil, selectMunicipalityAsRadiusCenter, selectOperationalPoint, selectPrimaryMunicipality, selectedCaps, selectedComuni, selectedSearchPoint, setAddressFullCoverageConfirmed, setAddressSearchError, setCapDataMap, setCity, setCoverageDecision, setCoverageStrategy, setData, setDismissedAdvisoryRadius, setDropOpen, setHiddenBoundaries, setPartialCoverageConfirmed, setPendingAddMunicipality, setSearch, setSelected, setSelectedCaps, setSelectedComuni, setSelectedSearchPoint, sharedCoveragePctText, startManualPinSelection, svcType, switchToCapMode, switchToComuneMode, switchToRadiusMode, updateActiveRadius, zonesInRadius }) {
  return (
    <>
      {/* Section */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              marginBottom: 14,
              flexWrap: "wrap"
            }}>
              <button type="button" onClick={onBack} aria-label="Torna allo Step 1" style={{
                minHeight: 38,
                padding: "0 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.06)",
                color: C.white,
                fontFamily: F.sans,
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                flexShrink: 0
              }}>
                ← Torna allo Step 1
              </button>

              {/* Titolo — su mobile stretto (395px) il testo del titolo (senza
                  vincolo di larghezza) restava piu' largo del viewport e
                  traboccava invece di andare a capo: maxWidth:100% permette al
                  wrapping naturale del testo di funzionare entro il contenitore. */}
              <div style={{
                flexShrink: 1,
                minWidth: 0,
                maxWidth: "100%"
              }}>
                <div style={{
                  fontFamily: F.serif,
                  fontSize: 22,
                  color: C.white,
                  letterSpacing: "-.5px",
                  maxWidth: "100%"
                }}>{isBusinessStep2 ? "Seleziona le attività e le aziende da raggiungere" : "Scegli la zona di distribuzione"}</div>
                <div style={{
                  fontFamily: F.sans,
                  fontSize: 13,
                  color: "rgba(255,255,255,.55)",
                  marginTop: 4
                }}>{isBusinessStep2 ? "Definisci l’area, verifica le attività reali disponibili e costruisci il piano di visita Business." : "Cerca un comune o CAP, scegli il raggio e verifica la copertura stimata dei tuoi volantini."}</div>
              </div>

              <div style={{
                width: 1,
                height: 28,
                background: "rgba(255,255,255,.1)",
                flexShrink: 0
              }} />

              {/* SERVICE PILLS - cambiano il servizio */}
              <div style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap"
              }}>
                {[{
                  id: "d2d",
                  icon: " ",
                  l: "Door to Door"
                }, {
                  id: "h2h",
                  icon: "",
                  l: "Hand to Hand"
                }, {
                  id: "b2b",
                  icon: "",
                  l: "Business"
                }].map(({
                  id,
                  icon,
                  l
                }) => <button key={id} onClick={() => setData(d => applyConfiguratorServiceChange(d, id))} style={pill(svcType === id, getServiceAccent(id))}>
                    {icon} {l}
                  </button>)}
              </div>

              {/* VIEW PILLS (Distribuzione/Heatmap/Demografia) rimossi: erano
                  controlli dei layer MAPPA in vista tecnica, ma in 📊 Analisi
                  Avanzata la mappa non viene più mostrata (è un report dati, non
                  una vista GIS) — sarebbero rimasti comandi senza effetto. */}

            </div>

            {/* Section */}
            <div style={{
              display: "flex",
              gap: 10,
              marginBottom: 12,
              alignItems: "flex-start",
              flexWrap: "wrap"
            }}>
              {/* Search */}
              <div style={{
                position: "relative",
                flex: "0 0 340px"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0,
                  padding: 0,
                  borderRadius: 10,
                  background: "rgba(255,255,255,.07)",
                  border: "1px solid rgba(255,255,255,.12)",
                  overflow: "hidden"
                }}>
                  <div style={{
                    display: "flex",
                    background: "rgba(255,255,255,.03)",
                    borderRight: "1px solid rgba(255,255,255,.12)"
                  }}>
                    <button onClick={switchToComuneMode} style={{
                      padding: "9px 10px",
                      background: activeAreaTab === "comune" ? col : "transparent",
                      border: "none",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all.2s"
                    }}>Comune</button>
                    <button onClick={switchToRadiusMode} style={{
                      padding: "9px 10px",
                      background: activeAreaTab === "raggio" ? col : "transparent",
                      border: "none",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all.2s"
                    }}>Raggio</button>
                    <button onClick={switchToCapMode} style={{
                      padding: "9px 10px",
                      background: activeAreaTab === "cap" ? col : "transparent",
                      border: "none",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all.2s"
                    }}>CAP</button>
                  </div>
                  <div style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 12px"
                  }}>
                    <span style={{
                      fontSize: 13
                    }}>{searchMode === "cap" ? "" : ""} </span>
                    <input value={search} onChange={e => {
                      setSearch(e.target.value);
                      setDropOpen(true);
                      setAddressSearchError("");
                    }} onFocus={() => setDropOpen(true)} onKeyDown={e => {
                      if (e.key === "Enter" && searchMode !== "cap") {
                        const sIntent = detectSearchIntent(search);
                        if (sIntent.intent === "address" && sIntent.parentComune === "Milano") {
                          const topValid = geocodeSuggestions.find(c => {
                            const textLooksLikeAddr = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                            const inMil = isGeocoderResultInMilanoComune(c);
                            const hasCoords = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                            return (looksLikeAddressResult(c) || textLooksLikeAddr) && inMil && hasCoords;
                          });
                          if (topValid) {
                            selectAddressPointInMilano(topValid.name, topValid);
                          } else {
                            setAddressSearchError("Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa.");
                            setSelectedSearchPoint(null);
                            setDropOpen(false);
                            logAddressVsMunicipalityDebug(search, city, city, null, true, "invalid_milano_address_blocked_auto_select", search, "unknown", null);
                            if (import.meta.env.DEV) {
                              console.log("[STEP2_ADDRESS_VALIDATION]", {
                                inputValue: search,
                                searchIntent: sIntent,
                                rawResultsCount: geocodeSuggestions.length,
                                validMilanoAddressResultsCount: 0,
                                rejectedResults: geocodeSuggestions.map(r => ({
                                  name: r.name,
                                  fullName: r.fullName,
                                  type: r.placeType || r.type,
                                  lat: r.lat,
                                  lng: r.lng,
                                  reason: !Number.isFinite(Number(r.lat)) || !Number.isFinite(Number(r.lng)) ? "invalid_coordinates" : "not_valid_milano_address"
                                })),
                                selectedSearchPoint: null,
                                addressSearchError: "Indirizzo non trovato a Milano. Controlla il nome della via oppure scegli un punto sulla mappa."
                              });
                            }
                          }
                        }
                      }
                    }} placeholder={searchMode === "cap" ? "Inserisci CAP (es. 20121)..." : searchMode === "municipality" ? pendingAddMunicipality ? "Aggiungi comune (es. Meda, Cesano...)" : "Cerca comune" : "Cerca comune o CAP"} style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: C.white,
                      fontFamily: F.sans,
                      fontSize: 13,
                      height: 38
                    }} />
                    {search && <button onClick={() => {
                      setSearch("");
                      setDropOpen(false);
                    }} style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,.4)",
                      cursor: "pointer",
                      fontSize: 16
                    }}>-</button>}
                  </div>
                </div>
                {duplicateComuneNotice && <div style={{
                  marginTop: 6,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(251,191,36,.1)",
                  border: "1px solid rgba(251,191,36,.3)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "#FBBF24"
                }}>
                    {duplicateComuneNotice}
                  </div>}
                {dropOpen && search.length > 0 && <div style={{
                  position: "static",
                  marginTop: 4,
                  background: "#1a2a40",
                  border: "1px solid rgba(255,255,255,.1)",
                  borderRadius: 10,
                  zIndex: 80,
                  overflowY: "auto",
                  overflowX: "hidden",
                  maxHeight: 260,
                  boxShadow: "0 14px 36px rgba(0,0,0,.55)"
                }}>
                    {searchMode !== "cap" ? (() => {
                    if (geocodeSuggestions.length === 0 && search.length >= 2) {
                      return <div style={{
                        padding: "9px 14px",
                        fontFamily: F.sans,
                        fontSize: 12,
                        color: "rgba(255,255,255,.35)"
                      }}>Nessun risultato...</div>;
                    }
                    const searchIntent = detectSearchIntent(search);
                    const addressIntentInMilano = searchIntent.intent === "address" && searchIntent.parentComune === "Milano";
                    // Ordine (§ticket): indirizzi/punti → Milano → altri comuni
                    // (solo come alternativa esplicita, mai scelta principale).
                    const rankSuggestion = s => {
                      if (!addressIntentInMilano) return 1;
                      if (looksLikeAddressResult(s)) return 0;
                      if (normalizeMunicipalityName(s.label || s.name) === "milano") return 1;
                      return 2;
                    };
                    const validMilanoAddresses = geocodeSuggestions.filter(c => {
                      const textLooksLikeAddr = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                      const inMil = isGeocoderResultInMilanoComune(c);
                      const hasCoords = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                      return (looksLikeAddressResult(c) || textLooksLikeAddr) && inMil && hasCoords;
                    });
                    const hasValidMilanoAddress = validMilanoAddresses.length > 0;
                    const orderedSuggestions = addressIntentInMilano ? [...geocodeSuggestions].sort((a, b) => rankSuggestion(a) - rankSuggestion(b)) : geocodeSuggestions;
                    return <>
                      {addressIntentInMilano && !hasValidMilanoAddress && <div style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid rgba(255,255,255,.08)",
                        background: "rgba(251,191,36,.08)",
                        fontFamily: F.sans
                      }}>
                          <div style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#FBBF24",
                          marginBottom: 8
                        }}>
                            Indirizzo non trovato a Milano. Controlla il nome della via.
                          </div>
                          <div style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap"
                        }}>
                            <button onClick={() => {
                            resolveMilanoCity().then(milano => {
                              if (milano) {
                                setCity(milano);
                                setSelectedComuni([milano]);
                                setSearch("Milano");
                                setDropOpen(false);
                                setSelected([]);
                                setCoverageDecision(null);
                                setCoverageStrategy(null);
                                setPartialCoverageConfirmed(false);
                                setAddressFullCoverageConfirmed(true);
                                setAddressSearchError("");
                                setSelectedSearchPoint(null);
                              }
                            });
                          }} style={{
                            padding: "6px 12px",
                            borderRadius: 7,
                            border: "1px solid rgba(255,255,255,.2)",
                            background: "rgba(255,255,255,.1)",
                            color: C.white,
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer"
                          }}>
                              Usa Milano comune completo
                            </button>
                            <button onClick={() => {
                            startManualPinSelection();
                          }} style={{
                            padding: "6px 12px",
                            borderRadius: 7,
                            border: "1px solid rgba(59,130,246,.4)",
                            background: "rgba(59,130,246,.15)",
                            color: "#60A5FA",
                            fontFamily: F.sans,
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: "pointer"
                          }}>
                              Scegli punto manuale sulla mappa
                            </button>
                          </div>
                        </div>}
                      {orderedSuggestions.map(c => {
                        // Intent indirizzo-in-Milano: righe indirizzo/POI cliccabili
                        // come PUNTO dentro Milano; i comuni fuzzy (Cormano, Como)
                        // restano solo alternative esplicite, mai auto-selezione.
                        // Check robusto: looksLikeAddressResult (placeType) OPPURE
                        // il testo del suggerimento contiene un odonimo (via/corso/
                        // piazza…) — il geocoder potrebbe taggare l'indirizzo come
                        // poi/place/locality anziché address, ma se il nome contiene
                        // un odonimo È un indirizzo a prescindere dal tag.
                        const textLooksLikeAddress = ADDRESS_INTENT_RE.test(c?.name || c?.label || "");
                        const hasPointCoordinates = Number.isFinite(Number(c?.lat)) && Number.isFinite(Number(c?.lng));
                        const isOperationalPointResult = searchMode === "address" && isMovementStep2 && hasPointCoordinates && c?.placeType !== "place";
                        if (isOperationalPointResult) {
                          return <div key={c.id} onClick={() => selectOperationalPoint(c.label || c.name, c)} style={{
                            padding: "9px 14px",
                            cursor: "pointer",
                            fontFamily: F.sans,
                            fontSize: 13,
                            color: C.white,
                            borderBottom: "1px solid rgba(255,255,255,.05)"
                          }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <Step1Icon name="pin" size={12} style={{
                              verticalAlign: -1,
                              marginRight: 4
                            }} />{c.label || c.name} <span style={{
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)",
                              marginLeft: 6
                            }}>punto operativo</span>
                            </div>;
                        }
                        if (addressIntentInMilano && (looksLikeAddressResult(c) || textLooksLikeAddress)) {
                          const inMilano = isGeocoderResultInMilanoComune(c);
                          if (!inMilano) return null;
                          return <div key={c.id} onClick={() => selectAddressPointInMilano(c.name, c)} style={{
                            padding: "9px 14px",
                            cursor: "pointer",
                            fontFamily: F.sans,
                            fontSize: 13,
                            color: C.white,
                            borderBottom: "1px solid rgba(255,255,255,.05)"
                          }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <Step1Icon name="pin" size={12} style={{
                              verticalAlign: -1,
                              marginRight: 4
                            }} />{c.name} <span style={{
                              fontSize: 10,
                              color: "rgba(255,255,255,.45)",
                              marginLeft: 6
                            }}>indirizzo/punto · Milano</span>
                            </div>;
                        }
                        if (addressIntentInMilano && !isNilLikePlaceType(c.placeType) && normalizeMunicipalityName(c.label || c.name) !== "milano") {
                          // §5: comune diverso da Milano con intent indirizzo — non
                          // è la scelta principale; selezione solo esplicita.
                          return <div key={c.id} style={{
                            padding: "8px 14px",
                            borderBottom: "1px solid rgba(255,255,255,.05)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8
                          }}>
                              <span style={{
                              fontFamily: F.sans,
                              fontSize: 11,
                              color: "rgba(255,255,255,.45)"
                            }}>
                                {c.label || c.name} <span style={{
                                color: "#FBBF24"
                              }}>— Risultato fuori Milano — seleziona comunque</span>
                              </span>
                              <button onClick={() => {
                              setAddressSearchError("");
                              logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_override_municipality", c.label || c.name, "municipality_explicit", c.label || c.name);
                              if (import.meta.env.DEV) console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                                inputValue: search,
                                detectedSearchIntent: "address",
                                selectedResultName: c.label || c.name,
                                selectedResultType: "municipality_explicit",
                                parentComune: "Milano",
                                selectedComune: c.label || c.name,
                                selectedAddressPoint: null,
                                radiusCenterSource: "municipality",
                                blockedReason: "explicit_override"
                              });
                              if (pendingAddMunicipality) {
                                appendMunicipalityToActiveZone(c);
                              } else if (searchMode === "address") {
                                selectMunicipalityAsRadiusCenter(c);
                              } else {
                                selectPrimaryMunicipality(c);
                                setSelectedSearchPoint(null);
                              }
                            }} style={{
                              padding: "4px 9px",
                              borderRadius: 6,
                              border: "1px solid rgba(255,255,255,.15)",
                              background: "rgba(255,255,255,.05)",
                              color: "rgba(255,255,255,.6)",
                              fontFamily: F.sans,
                              fontSize: 10,
                              fontWeight: 800,
                              cursor: "pointer",
                              whiteSpace: "nowrap"
                            }}>
                                Seleziona comunque
                              </button>
                            </div>;
                        }

                        const isMilanoArea = isGeocoderResultInMilanoComune(c) || normalizeMunicipalityName(c.comune || c.name || "") === "milano";
                        const isMilanNilCandidate = isMilanoArea && isNilLikePlaceType(c.placeType) && normalizeMunicipalityName(c.displayName || c.label || c.name) !== "milano";

                        if (isMilanNilCandidate) {
                          const nilName = c.localita || c.label || c.name;
                          return <div key={c.id} style={{
                            padding: "10px 14px",
                            borderBottom: "1px solid rgba(255,255,255,.05)",
                            background: "rgba(251,191,36,.05)"
                          }}>
                              <div style={{
                                fontFamily: F.sans,
                                fontSize: 13,
                                color: C.white,
                                marginBottom: 3
                              }}>{c.displayName || nilName}</div>
                              <div style={{
                                fontFamily: F.sans,
                                fontSize: 11,
                                color: "#FBBF24",
                                marginBottom: 6
                              }}>
                                  Zona / quartiere di Milano
                              </div>
                              <button onClick={() => {
                                selectMilanoAsNil(nilName, {
                                  lat: c.lat,
                                  lng: c.lng
                                });
                              }} style={{
                                padding: "5px 10px",
                                borderRadius: 7,
                                border: "1px solid rgba(34,197,94,.4)",
                                background: "rgba(34,197,94,.14)",
                                color: "#22C55E",
                                fontFamily: F.sans,
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer"
                              }}>
                                    Seleziona {nilName} come NIL
                              </button>
                            </div>;
                        }

                        const displayTitle = c.displayName || c.label || c.name;
                        const isSubLocalityType = c.type === "frazione" || c.type === "localita" || c.type === "quartiere" || Boolean(c.localita);
                        const badgeTypeLabel = c.type === "frazione" ? "frazione" : c.type === "quartiere" ? "quartiere" : c.type === "localita" ? "località" : (c.placeType === "place" || c.type === "comune") ? "comune" : c.type;

                        return <div key={c.id} onClick={() => {
                          if (searchMode === "municipality" && pendingAddMunicipality) {
                            appendMunicipalityToActiveZone(c);
                          } else if (searchMode === "address") {
                            setAddressSearchError("");
                            logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_radius_municipality_selection", displayTitle, c.placeType || "municipality", c.comune || c.label || c.name);
                            selectMunicipalityAsRadiusCenter(c);
                            setSelectedSearchPoint(null);
                            if (import.meta.env.DEV) {
                              console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                                inputValue: search,
                                detectedSearchIntent: detectSearchIntent(search).intent,
                                selectedResultName: displayTitle,
                                selectedResultType: c.placeType || "municipality",
                                parentComune: c.comune || null,
                                selectedComune: c.comune || c.label || c.name,
                                selectedAddressPoint: null,
                                radiusCenterSource: "municipality_radius_center",
                                blockedReason: null
                              });
                            }
                          } else {
                            setAddressSearchError("");
                            logAddressVsMunicipalityDebug(search, city, c, null, false, "explicit_municipality_selection", displayTitle, c.placeType || "municipality", c.comune || c.label || c.name);
                            selectPrimaryMunicipality(c);
                            setSelectedSearchPoint(null);
                            if (import.meta.env.DEV) {
                              console.log("[STEP2_SEARCH_SELECTION_DEBUG]", {
                                inputValue: search,
                                detectedSearchIntent: detectSearchIntent(search).intent,
                                selectedResultName: displayTitle,
                                selectedResultType: c.placeType || "municipality",
                                parentComune: c.comune || null,
                                selectedComune: c.comune || c.label || c.name,
                                selectedAddressPoint: null,
                                radiusCenterSource: "municipality",
                                blockedReason: null
                              });
                            }
                          }
                        }} style={{
                          padding: "9px 14px",
                          cursor: "pointer",
                          fontFamily: F.sans,
                          fontSize: 13,
                          color: C.white,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8
                        }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                           <div>
                             <span>{displayTitle}</span>
                           </div>
                           {isSubLocalityType && <span style={{
                             fontSize: 10,
                             padding: "2px 6px",
                             borderRadius: 4,
                             background: "rgba(59, 130, 246, 0.18)",
                             color: "#93C5FD",
                             fontWeight: 700,
                             textTransform: "uppercase",
                             letterSpacing: "0.04em",
                             whiteSpace: "nowrap"
                           }}>
                             {badgeTypeLabel}
                           </span>}
                        </div>;
                      })}
                      </>;
                  })() : capSearchLoading ? <div style={{
                    padding: "9px 14px",
                    fontFamily: F.sans,
                    fontSize: 12,
                    color: "rgba(255,255,255,.35)"
                  }}>Ricerca CAP in corso––</div> : capSuggestions.length === 0 && search.length >= 2 ? <div style={{
                    padding: "9px 14px",
                    fontFamily: F.sans,
                    fontSize: 12,
                    color: "rgba(255,255,255,.35)"
                  }}>Nessun CAP trovato</div> : capSuggestions.map(c => <div key={c.id} onClick={() => handleCapSelect(c)} style={{
                    padding: "9px 14px",
                    cursor: "pointer",
                    fontFamily: F.sans,
                    fontSize: 13,
                    color: C.white,
                    borderBottom: "1px solid rgba(255,255,255,.05)"
                  }} onMouseEnter={e => e.currentTarget.style.background = "rgba(34, 197, 94,.12)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                           {c.name}
                        </div>)}
                  </div>}
              </div>

              {/* Comune selezionato badge / lista — in modalità comune */}
              {searchMode === "municipality" && (selectedComuni.length > 0 || city) && <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                width: "100%",
                marginBottom: 4
              }}>
                  {selectedComuni.length > 1 && <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.7)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em"
                }}>
                      Territorio selezionato
                    </div>}
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap"
                }}>
                    <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.55)"
                  }}>
                      {isMovementStep2 ? selectedComuni.length > 1 ? `${selectedComuni.length} zone operative:` : 'Zona operativa:' : isBusinessStep2 ? selectedComuni.length > 1 ? `${selectedComuni.length} cluster attività:` : 'Cluster attività:' : selectedComuni.length > 1 ? `${selectedComuni.length} Comuni selezionati:` : 'Comune selezionato:'}
                    </span>
                    {(selectedComuni.length > 0 ? selectedComuni : [city]).filter(Boolean).map((c, idx) => {
                    const normName = normalizeMunicipalityName(c.label || c.name);
                    const zoneData = (zonesInRadius || []).find(z => normalizeMunicipalityName(z.name) === normName);
                    const fam = zoneData?.families || zoneData?.householdsTotal || 0;
                    const pop = zoneData?.pop || zoneData?.population || zoneData?.populationTotal || 0;
                    const rec = zoneData?.flyersMin || zoneData?.recommendedFlyers || 0;
                    const cov = zoneData?.coverage || 100;
                    // In analisi NIL (Milano), z.coverage è il peso della singola
                    // zona NIL sul totale comune (es. 1%) — NON una copertura
                    // geografica parziale del confine. Usarlo qui creerebbe un
                    // falso badge "Parziale (1%)" fuori contesto: il badge resta
                    // sul solo stato di caricamento del confine.
                    const isPart = !isNilAnalysis && cov < 95;
                    const hasBound = municipalityBoundary && (Array.isArray(municipalityBoundary) ? municipalityBoundary.some(b => normalizeMunicipalityName(b.name) === normName) : true);
                    const isHidden = hiddenBoundaries.includes(normName);
                    return <div key={c.id || idx} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      borderRadius: 10,
                      background: isHidden ? "rgba(255,255,255,.03)" : "rgba(34,197,94,.09)",
                      border: isHidden ? "1px dashed rgba(255,255,255,.18)" : "1px solid rgba(34,197,94,.22)",
                      fontFamily: F.sans,
                      fontSize: 12,
                      flexWrap: "wrap",
                      opacity: isHidden ? 0.65 : 1,
                      transition: "all 0.2s ease"
                    }}>
                          <span style={{
                        color: isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                        fontWeight: 900
                      }}>✓ {c.label || c.name}</span>
                          {hasBound && <span style={{
                        color: isHidden ? "rgba(255,255,255,.45)" : "#22C55E",
                        fontSize: 10,
                        fontWeight: 800
                      }}>✓ confine</span>}
                          {fam > 0 && <span style={{
                        color: "rgba(255,255,255,.7)",
                        fontSize: 11
                      }}><b>{formatNumber(fam)}</b> fam.</span>}
                          {pop > 0 && <span style={{
                        color: "rgba(255,255,255,.6)",
                        fontSize: 11
                      }}>({formatNumber(pop)} ab.)</span>}
                          {rec > 0 && <span style={{
                        color: col,
                        fontSize: 11,
                        fontWeight: 700
                      }}>{formatNumber(rec)} vol.</span>}
                          <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: isPart ? "rgba(234,179,8,.15)" : isHidden ? "rgba(255,255,255,.08)" : "rgba(34,197,94,.15)",
                        color: isPart ? "#FACC15" : isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                        border: `1px solid ${isPart ? "rgba(234,179,8,.3)" : isHidden ? "rgba(255,255,255,.15)" : "rgba(34,197,94,.3)"}`
                      }}>
                            {isPart ? `Parziale (${cov}%)` : "Confine OK/Caricato"}
                          </span>
                          {/* Toggle Visibilità Confine ON/OFF (Solo Visivo - NON RIMUOVI IL COMUNE NE' I KPI) */}
                          {hasBound && <button type="button" onClick={e => {
                        e.stopPropagation();
                        setHiddenBoundaries(prev => prev.includes(normName) ? prev.filter(n => n !== normName) : [...prev, normName]);
                      }} title={isHidden ? "Mostra confine sulla mappa (i KPI restano invariati)" : "Nascondi confine dalla mappa (solo visivo, i KPI restano invariati)"} style={{
                        background: isHidden ? "rgba(255,255,255,.08)" : "rgba(34,197,94,.18)",
                        border: `1px solid ${isHidden ? "rgba(255,255,255,.18)" : "rgba(34,197,94,.35)"}`,
                        borderRadius: 6,
                        color: isHidden ? "rgba(255,255,255,.6)" : "#22C55E",
                        cursor: "pointer",
                        padding: "3px 7px",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        marginLeft: 4,
                        transition: "all 0.15s ease"
                      }}>
                              <span style={{
                          display: "inline-flex"
                        }}><Step1Icon name={isHidden ? "eyeOff" : "eye"} size={13} /></span>
                              <span>{isHidden ? "Confine OFF" : "Confine ON"}</span>
                            </button>}
                          <button onClick={e => {
                        e.stopPropagation();
                        removeMunicipalityFromActiveZone(normName);
                      }} title="Rimuovi comune dalla selezione (cambia i KPI)" style={{
                        background: "none",
                        border: "none",
                        color: "rgba(255,255,255,.5)",
                        cursor: "pointer",
                        fontSize: 14,
                        fontWeight: 800,
                        padding: "0 4px",
                        marginLeft: 2
                      }}>
                            ✕
                          </button>
                        </div>;
                  })}
                  </div>
                </div>}

              {/* Radius pills & info - in modalità raggio */}
              {activeAreaTab === "raggio" && <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                width: "100%",
                marginBottom: 6
              }}>
                  {selectedComuni.length > 0 || city || searchedLocation ? <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap"
                }}>
                      <span style={{
                    fontFamily: F.sans,
                    fontSize: 11,
                    color: "rgba(255,255,255,.55)"
                  }}>Comune/punto di riferimento:</span>
                      <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.15)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.white
                  }}>
                        <Step1Icon name="pin" size={12} /> {hasSearchPoint ? selectedSearchPoint.label : city?.label || city?.name || selectedComuni[0]?.label || selectedComuni[0]?.name || searchedLocation}
                      </div>
                      <div style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "rgba(34,197,94,.12)",
                    border: "1px solid rgba(34,197,94,.3)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#22C55E"
                  }}>
                        Raggio selezionato: {radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`}
                      </div>
                      <div style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    background: "rgba(59,130,246,.12)",
                    border: "1px solid rgba(59,130,246,.3)",
                    fontFamily: F.sans,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#60A5FA"
                  }}>
                        Area operativa: raggio {radiusKm < 1 ? `${radiusKm * 1000}m` : `${radiusKm}km`} da {hasSearchPoint ? (selectedSearchPoint.label || "punto cercato").split(",")[0] : city?.label || city?.name ? `${city.label || city.name} centro` : searchedLocation || "centro selezionato"}
                      </div>
                    </div> : <div style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(234,179,8,.12)",
                  border: "1px solid rgba(234,179,8,.3)",
                  fontFamily: F.sans,
                  fontSize: 12,
                  color: "#FACC15"
                }}>
                      Seleziona un comune o un punto di partenza per applicare il raggio.
                    </div>}
                  <div style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "center",
                  marginTop: 8
                }}>
                    <InteractiveRadiusSlider value={radiusKm} options={S2_RADII} disabled={!city && selectedComuni.length === 0 && !searchedLocation || apiLoading} onCommit={updateActiveRadius} recommendedValue={recommendedRadiusForSlider} accent={col} />
                  </div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.55)"
                }}>Aumentando il raggio aumentano copertura, comuni coinvolti e quantità consigliata.</div>
                </div>}
              {searchMode === "cap" && selectedCaps.length > 0 && <div style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap"
              }}>
                  <span style={{
                  fontFamily: F.sans,
                  fontSize: 10,
                  color: "rgba(255,255,255,.35)",
                  whiteSpace: "nowrap"
                }}>CAP selezionati:</span>
                  {selectedCaps.map(cap => <span key={cap} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 9px",
                  borderRadius: 100,
                  background: `${col}18`,
                  border: `1px solid ${col}35`,
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 700,
                  color: col
                }}>
                       {cap}
                      <button onClick={() => {
                    setSelectedCaps(prev => prev.filter(c => c !== cap));
                    setCapDataMap(prev => {
                      const n = {
                        ...prev
                      };
                      delete n[cap];
                      return n;
                    });
                  }} style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,.4)",
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: 1,
                    padding: 0,
                    marginLeft: 2
                  }}>-</button>
                    </span>)}
                </div>}

              {/* Dropdown "Layer mappa" (heatmap tematica) rimosso: era visibile
                  solo in Analisi Avanzata, dove ora la mappa non viene più mostrata
                  — un selettore di layer mappa senza mappa sarebbe un comando morto. */}
            </div>

            {/* BARRA COMPATTA DI CONSIGLIO SUL RAGGIO */}
            {radiusAdvisoryData && <div style={{
              margin: "0 0 16px",
              padding: "12px 16px",
              borderRadius: 12,
              background: radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "rgba(34, 197, 94, 0.08)" : "rgba(234, 179, 8, 0.1)",
              border: `1px solid ${radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "rgba(34, 197, 94, 0.28)" : "rgba(234, 179, 8, 0.35)"}`,
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              gap: 12,
              transition: "all .2s ease"
            }}>
                <div style={{
                flex: 1
              }}>
                  <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  fontFamily: F.sans,
                  fontSize: 12,
                  fontWeight: 800,
                  color: radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "#22C55E" : "#FACC15"
                }}>
                    <span style={{
                    display: "inline-flex"
                  }}>{radiusAdvisoryData.status === "coperto" || radiusAdvisoryData.isDismissed ? "✓" : <Step1Icon name="warning" size={13} />}</span>
                    <span>
                      {radiusAdvisoryData.isDismissed ? `Raggio confermato (${formatRadiusLabel(radiusAdvisoryData.currentRadius)})` : radiusAdvisoryData.status === "coperto" ? "Raggio coerente con la quantità" : radiusAdvisoryData.covPct < 25 || radiusAdvisoryData.status === "non_coperto" ? "Raggio ampio rispetto alla quantità" : "Copertura parziale dell'area"}
                    </span>
                  </div>
                  <div style={{
                  fontFamily: F.sans,
                  fontSize: 11,
                  color: "rgba(255,255,255,.76)",
                  lineHeight: 1.45
                }}>
                    {radiusAdvisoryData.isDismissed ? `Raggio di ${formatRadiusLabel(radiusAdvisoryData.currentRadius)} mantenuto per la distribuzione (${formatIntegerIT(radiusAdvisoryData.currQty)} volantini per una copertura stimata del ${sharedCoveragePctText}).` : radiusAdvisoryData.status === "coperto" ? `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato (${formatRadiusLabel(radiusAdvisoryData.currentRadius)}) è coerente con il fabbisogno stimato dell'area (copertura al ${sharedCoveragePctText}).` : radiusAdvisoryData.covPct < 25 || radiusAdvisoryData.status === "non_coperto" ? `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato copre circa il ${sharedCoveragePctText} del fabbisogno stimato dell'area. Per una distribuzione più concentrata puoi usare il raggio consigliato.` : `Con ${formatIntegerIT(radiusAdvisoryData.currQty)} volantini, il raggio selezionato copre circa il ${sharedCoveragePctText} del fabbisogno stimato dell'area (${formatIntegerIT(radiusAdvisoryData.currReq)} volantini per copertura completa). Puoi mantenere la selezione o concentrare la distribuzione sul raggio consigliato.`}
                  </div>
                </div>

                {!radiusAdvisoryData.isDismissed && radiusAdvisoryData.status !== "coperto" && radiusAdvisoryData.recRadius !== radiusAdvisoryData.currentRadius && <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
                width: isMobile ? "100%" : "auto",
                justifyContent: isMobile ? "flex-start" : "flex-end"
              }}>
                    <button type="button" onClick={() => updateActiveRadius(radiusAdvisoryData.recRadius)} style={{
                  padding: "7px 14px",
                  borderRadius: 8,
                  border: "1px solid #22C55E",
                  background: "#22C55E",
                  color: "#000",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  boxShadow: "0 2px 8px rgba(34,197,94,.35)",
                  transition: "all .15s ease"
                }}>
                      Usa raggio consigliato ({formatRadiusLabel(radiusAdvisoryData.recRadius)})
                    </button>
                    <button type="button" onClick={() => setDismissedAdvisoryRadius(radiusAdvisoryData.currentRadius)} style={{
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.22)",
                  background: "rgba(255,255,255,.06)",
                  color: C.white,
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "all .15s ease"
                }}>
                      Mantieni {formatRadiusLabel(radiusAdvisoryData.currentRadius)}
                    </button>
                  </div>}
              </div>}

            {/* Section — riga chip zone + pulsante "+ Aggiungi": overflow-x:auto
                da solo lasciava "+ Aggiungi un'altra zona / comune" (e le chip
                zona) fuori dal viewport senza alcuna affordance di scroll
                visibile su mobile ("tagliato", non davvero raggiungibile).
                flex-wrap va a capo invece di scrollare — tutto resta sempre
                visibile, stesso pattern esplicitamente richiesto per le righe di
                controlli (a differenza dello Stepper, dove lo scroll resta
                accettabile perche' e' una sequenza ordinata, non una riga di
                controlli indipendenti). */}
            <div style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
              margin: "-4px 0 12px",
              paddingBottom: 2
            }}>
              {campaignZones.map((z, idx) => {
                const isActive = z.id === data.activeZoneId;
                const zoneSvcColor = "#22C55E";
                const zUnconfirmed = z.searchMode === "municipality" && !z.addressFullCoverageConfirmed && !z.nilManualMode && !z.addressSearchError && z.selectedSearchPoint?.type === "address";
                const configured = zUnconfirmed ? false : z.searchMode === "cap" ? (z.selectedCaps || []).length > 0 : z.selectedComuni && z.selectedComuni.length > 0 || !!z.city;
                return <button key={z.id} onClick={() => selectCampaignZone(z.id)} style={{
                  minHeight: 32,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: `1px solid ${isActive ? zoneSvcColor : "rgba(255,255,255,.09)"}`,
                  background: isActive ? `${zoneSvcColor}18` : "rgba(255,255,255,.035)",
                  color: isActive ? C.white : "rgba(255,255,255,.58)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  whiteSpace: "nowrap",
                  flexShrink: 0
                }}>
                    <span>{getCampaignZoneLabel(z, idx)}</span>
                    <span style={{
                    fontSize: 9,
                    color: zUnconfirmed ? "#FBBF24" : configured ? C.green : C.yellow
                  }}>{zUnconfirmed ? "Anteprima" : configured ? "OK" : "Da configurare"}</span>
                  </button>;
              })}
              <button type="button" onClick={() => setDropOpen(true)} style={{
                minHeight: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.1)",
                background: "rgba(255,255,255,.04)",
                color: "rgba(255,255,255,.72)",
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0
              }}>
                Modifica zona
              </button>
              {!isRadiusMode && (() => {
                const hasValidSearchPoint = Boolean(selectedSearchPoint && Number.isFinite(Number(selectedSearchPoint.lat)) && Number.isFinite(Number(selectedSearchPoint.lng)));
                const hasValidCityPoint = Boolean(!hasValidSearchPoint && city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lng)));
                if (!hasValidSearchPoint && !hasValidCityPoint) return null;
                if (hasUnconfirmedAddressPoint) return null;
                let ctaLabel = "Usa raggio da questo punto";
                if (hasValidSearchPoint) {
                  const rawAddr = String(selectedSearchPoint.name || selectedSearchPoint.label || selectedSearchPoint.fullName || "").split(',')[0].trim();
                  if (rawAddr && rawAddr.length <= 28) {
                    ctaLabel = `Usa raggio da ${rawAddr}`;
                  }
                } else if (hasValidCityPoint) {
                  const rawCity = String(city.name || city.label || "").split(',')[0].trim();
                  if (rawCity) {
                    ctaLabel = `Usa raggio dal centro di ${rawCity}`;
                  }
                }
                return <button type="button" onClick={switchToRadiusMode} style={{
                  minHeight: 32,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.04)",
                  color: "rgba(255,255,255,.82)",
                  fontFamily: F.sans,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5
                }}>
                    <Step1Icon name="pin" size={12} />
                    <span>{ctaLabel}</span>
                  </button>;
              })()}
              <button type="button" onClick={resetActiveZone} style={{
                minHeight: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,.1)",
                background: "rgba(255,255,255,.03)",
                color: "rgba(255,255,255,.58)",
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0
              }}>
                Reset zona
              </button>
              <button onClick={() => {
                if (searchMode === "municipality") {
                  setPendingAddMunicipality(true);
                  setDropOpen(true);
                  setSearch("");
                } else {
                  handleAddZone();
                }
              }} style={{
                minHeight: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: `1px dashed ${col}`,
                background: `${col}0f`,
                color: col,
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 900,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0
              }}>
                + Aggiungi un'altra zona / comune
              </button>
            </div>
    </>
  );
}
