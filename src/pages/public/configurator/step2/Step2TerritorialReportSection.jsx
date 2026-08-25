import React from "react";
import { C, F } from "../../../../lib/constants.js";
import { formatIntegerIT, formatPercentIT } from "../../../../lib/utils/format.js";
import TerritorialReport from "../../../TerritorialReport.jsx";
import { D2D_DAILY_CAPACITY } from "../../../../lib/step2/operationalMetrics.js";

export function Step2TerritorialReportSection({ aiAgg, areaMode, b2bKpiZone, businessMaterialPlan, businessOperationalPlan, businessRadiusRows, coverageDecision, d2dKpiZone, effectiveDemoData, fetchedPois, h2hHotspotRadiusRows, isMobile, isMovementStep2, isNilAnalysis, isResidentialStep2, manualFlyers, omiInfo, omiReference, operationalAdvice, operationalEstimate, pois, printTerritorialReportPdf, radius, requiredFlyers, selZones, selectCoverageQuantityDecision, selectedComuni, selectedOperationalPois, serviceKpis, setIsAdminView, step2CoverageFullLabel, step2TruthModel, step2ViewModel, territoryPluralLabel, transportState, updateManualFlyersQuantity, zoneDensity, zoneVerdict }) {

      const svcKey = isResidentialStep2 ? "d2d" : isMovementStep2 ? "h2h" : "b2b";
      const activeServiceTitle = isResidentialStep2 ? "Door to Door" : isMovementStep2 ? "Hand to Hand" : "Distribuzione presso attività e aziende";
      // Il report deve usare lo stesso perimetro selezionato dei KPI Step2.
      // effectiveDemoData puo contenere il totale comunale e non e' quindi un
      // fallback valido per una selezione territoriale piu ristretta.
      const totalHouseholds = Number(serviceKpis?.families) || 0;
      const totalPopulation = Number(serviceKpis?.population) || 0;
      const profileDens = Number(serviceKpis?.density) || zoneDensity || 0;
      const ageRows = effectiveDemoData ? [{
        l: "0-14",
        v: effectiveDemoData.age_0_14_pct,
        c: "#A78BFA"
      }, {
        l: "15-34",
        v: effectiveDemoData.age_15_34_pct,
        c: "#38BDF8"
      }, {
        l: "35-64",
        v: effectiveDemoData.age_35_64_pct,
        c: "#4ADE80"
      }, {
        l: "65+",
        v: effectiveDemoData.age_65_plus_pct,
        c: "#FBBF24"
      }].filter(row => Number.isFinite(Number(row.v))) : [];
      const hasRealNilBreakdown = Boolean(isNilAnalysis && selZones.some(zone => zone?.isNil || zone?.territoryLevel === "nil"));
      const hasSectorBreakdown = Boolean(!hasRealNilBreakdown && selZones.length > 1 && selZones.some(zone => zone?.territoryLevel === "sector" || zone?.isSector));
      const hasMunicipalityBreakdown = Boolean(selectedComuni?.length > 1 && selZones.length > 1);
      const familyBreakdownTitle = hasRealNilBreakdown ? "Ripartizione famiglie per NIL" : hasSectorBreakdown ? "Ripartizione famiglie per settore" : hasMunicipalityBreakdown ? "Ripartizione famiglie per comune" : "Comune analizzato come territorio unico";
      const familyBreakdownItems = hasRealNilBreakdown || hasSectorBreakdown || hasMunicipalityBreakdown ? selZones : [];
      const omiRows = omiInfo?.available && Array.isArray(omiInfo?.values) ? omiInfo.values.filter(row => row?.typology && (row.min_value != null || row.max_value != null)) : [];
      const omiZones = Array.isArray(omiInfo?.zones) ? omiInfo.zones : [];
      const omiZoneNames = omiZones.map(zone => zone?.codice_zona || zone?.zone_code || zone?.name || zone?.description).filter(Boolean);
      const omiMeta = {
        zoneCount: Number.isFinite(Number(omiInfo?.values?.omi_zone_count)) ? Number(omiInfo.values.omi_zone_count) : omiZones.length || null,
        zoneNames: omiZoneNames.length ? omiZoneNames.slice(0, 8).join(", ") : null,
        aggregationLabel: (Number(omiInfo?.values?.omi_zone_count) || omiZones.length || 0) > 1 ? "Valori aggregati da piu zone OMI; min/max derivano dagli estremi restituiti dal backend" : "Valori single-zone quando una sola zona OMI e restituita",
        period: omiReference?.reference_period || omiReference?.reference_year || omiReference?.semester || null
      };
      const operationalRequirementExplanation = isResidentialStep2 ? `Le famiglie residenti (${formatIntegerIT(totalHouseholds)}) provengono dal record comunale ISTAT/demographic_indicators al livello geografico Comune. Il fabbisogno operativo (${formatIntegerIT(step2TruthModel.quantity.baseRequirement)} pz.) proviene dal modello operativo VolantiniPro al livello ${step2TruthModel.territory.modeLabel}: somma i fabbisogni delle zone selezionate e viene poi trasformato nel consigliato (${formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.) aggiungendo il margine operativo (${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.). I due valori differiscono perche il primo e un dato demografico residente, il secondo e una quantita operativa per cassette/fabbisogno distributivo, non un censimento ufficiale di famiglie.` : null;
      const operationalRecommended = Math.round(Number(step2ViewModel.recommendedFlyersValue || 0));
      const operationalMaximum = isResidentialStep2 ? Math.round(Number(d2dKpiZone?.flyersMax || 0)) : 0;
      const operationalDays = isResidentialStep2 ? operationalEstimate.days : null;
      const operationalQuantity = isResidentialStep2 ? operationalEstimate.quantity : 0;
      const modeLabelMap = {
        municipality: "Comune completo",
        multi_municipality: "Multi-comune",
        radius: "Raggio da indirizzo",
        custom_zone: "Multi-zona",
        cap: "Selezione per CAP"
      };
      const modeLabel = modeLabelMap[step2ViewModel.primarySource] || "Territorio selezionato";
      const zoneCount = step2TruthModel.zones.involved;

      // Zone e priorità — righe normalizzate per servizio (nessun dato inventato: usa solo le funzioni di ranking già esistenti)
      const zoneEyebrow = isResidentialStep2 ? "Allocazione NIL / zone" : isMovementStep2 ? "Assegnazione promoter e punti" : "Attività selezionate e materiali";
      const zoneColumns = [{
        key: "priorityRank",
        label: "Priorità",
        align: "right",
        render: r => `#${r.priorityRank}`
      }, {
        key: "name",
        label: "Zona"
      }, {
        key: "assignedFlyers",
        label: "Assegnati",
        align: "right",
        render: r => `${formatIntegerIT(r.assignedFlyers)} pz.`
      }, {
        key: "requiredFlyers",
        label: "Fabbisogno zona",
        align: "right",
        render: r => `${formatIntegerIT(r.requiredFlyers)} pz.`
      }, {
        key: "coveragePct",
        label: "Copertura fabbisogno zona",
        align: "right",
        render: r => r.coveragePct == null ? "Dato non disponibile" : formatPercentIT(r.coveragePct, Number.isInteger(r.coveragePct) ? 0 : 1)
      }, {
        key: "status",
        label: "Stato",
        render: r => r.status === "full" ? "Completa" : r.status === "partial" ? "Parziale" : "Esclusa"
      }];
      const zoneRows = step2TruthModel.allocation.rows.map(row => ({
        ...row,
        priorityValue: Math.max(1, step2TruthModel.allocation.rows.length - row.priorityRank + 1),
        priorityLabel: `Priorità #${row.priorityRank}`
      }));
      const priorityMax = Math.max(...zoneRows.map(r => r.priorityValue || 0), 1);

      // Panoramica — max 6 KPI per servizio, mai valori inventati (unavailable quando manca una vera fonte)
      let overviewKpis = [];
      if (isResidentialStep2) {
        const territorialFamiliesLabel = areaMode === "radius" ? "Famiglie/cassette stimate nel raggio" : "Famiglie/cassette stimate nel territorio";
        overviewKpis = [{
          label: `${territoryPluralLabel} coinvolti`,
          value: step2TruthModel.zones.involved,
          color: "#60A5FA",
          unavailable: !(step2TruthModel.zones.involved > 0)
        }, {
          label: territorialFamiliesLabel,
          value: formatIntegerIT(step2ViewModel.primaryFamiliesValue),
          color: "#4ADE80",
          unavailable: !(step2ViewModel.primaryFamiliesValue > 0),
          source: areaMode === "radius" ? "Modello operativo VolantiniPro — raggio selezionato" : "Modello operativo VolantiniPro"
        }, {
          label: "Quantità inserita",
          value: step2TruthModel.quantity.inserted == null ? null : formatIntegerIT(step2TruthModel.quantity.inserted),
          unit: "pz.",
          color: "#38BDF8",
          unavailable: step2TruthModel.quantity.inserted == null
        }, {
          label: "Quantità consigliata",
          value: formatIntegerIT(step2TruthModel.quantity.recommendedRequirement),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: !(step2TruthModel.quantity.recommendedRequirement > 0)
        }, {
          label: "Copertura scenario corrente",
          value: step2CoverageFullLabel,
          color: "#38BDF8",
          unavailable: step2CoverageFullLabel == null
        }, {
          label: "Score D2D",
          value: `${Math.round(Number(zoneVerdict?.score || 0))}/100`,
          color: "#4ADE80"
        }];
      } else if (isMovementStep2) {
        overviewKpis = [{
          label: "POI rilevati",
          value: fetchedPois.length,
          color: "#38BDF8",
          unavailable: !(fetchedPois.length > 0)
        }, {
          label: "POI utilizzabili",
          value: pois.length,
          color: "#38BDF8",
          unavailable: !(pois.length > 0)
        }, {
          label: "POI selezionati",
          value: selectedOperationalPois.length,
          color: "#A855F7",
          unavailable: selectedOperationalPois.length < 1
        }, {
          label: "Quantità inserita",
          value: step2TruthModel.quantity.inserted == null ? null : formatIntegerIT(step2TruthModel.quantity.inserted),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: step2TruthModel.quantity.inserted == null
        }, {
          label: "Fabbisogno operativo",
          value: formatIntegerIT(operationalRecommended),
          unit: "pz.",
          color: "#4ADE80",
          unavailable: !(operationalRecommended > 0)
        }, {
          label: "Score H2H",
          value: `${Math.round(Number(zoneVerdict?.score || 0))}/100`,
          color: "#38BDF8"
        }];
      } else {
        overviewKpis = [{
          label: "Attività disponibili",
          value: formatIntegerIT(serviceKpis?.businesses || pois.length || 0),
          color: "#FB923C",
          unavailable: !(serviceKpis?.businesses > 0 || pois.length > 0)
        }, {
          label: "Attività selezionate",
          value: selectedOperationalPois.length,
          color: "#A78BFA",
          unavailable: selectedOperationalPois.length < 1
        }, {
          label: "Materiali necessari",
          value: businessMaterialPlan?.materialsRequired == null ? null : formatIntegerIT(businessMaterialPlan.materialsRequired),
          unit: businessMaterialPlan?.materialsRequired == null ? "" : "pz.",
          color: "#4ADE80",
          unavailable: businessMaterialPlan?.materialsRequired == null
        }, {
          label: "Materiali residui",
          value: businessMaterialPlan?.materialsRemaining == null ? null : formatIntegerIT(businessMaterialPlan.materialsRemaining),
          unit: businessMaterialPlan?.materialsRemaining == null ? "" : "pz.",
          color: "#38BDF8",
          unavailable: businessMaterialPlan?.materialsRemaining == null
        }, {
          label: "Materiali mancanti",
          value: businessMaterialPlan?.materialsMissing == null ? null : formatIntegerIT(businessMaterialPlan.materialsMissing),
          unit: businessMaterialPlan?.materialsMissing == null ? "" : "pz.",
          color: "#FCA5A5",
          unavailable: businessMaterialPlan?.materialsMissing == null
        }, {
          label: "Addetti consigliati",
          value: businessOperationalPlan?.recommendedOperators ?? null,
          color: "#A78BFA",
          unavailable: businessOperationalPlan?.recommendedOperators == null
        }];
      }
      const topZonesPreview = zoneRows.slice(0, 3).map(r => ({
        id: r.id,
        name: r.name,
        value: r.priorityValue,
        valueLabel: r.priorityLabel
      }));
      const recommendationConfidence = step2TruthModel.confidence.recommendation;
      const reliability = {
        label: recommendationConfidence.label,
        detail: `${recommendationConfidence.available}/${recommendationConfidence.total} fonti e modelli disponibili. ${recommendationConfidence.limitation || ""}`.trim()
      };

      // Mobilità e POI (H2H)
      const poiCounts = {};
      (pois || []).forEach(poi => {
        const key = poi.category || "Altro";
        poiCounts[key] = (poiCounts[key] || 0) + 1;
      });
      const poiByCategory = Object.entries(poiCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({
        label,
        value
      }));
      const poiMax = Math.max(...poiByCategory.map(c => c.value), 1);

      // Imprese e aree produttive (Business) — topCatsReal: FIX del bug SEZIONE 2 originale (nessun fallback hardcoded)
      const topCatsReal = Array.isArray(b2bKpiZone?.topCats) ? b2bKpiZone.topCats.map(c => ({
        label: c.label || c.name,
        pct: c.pct || 0
      })) : [];
      const sourceRegistry = step2TruthModel.sources;
      const connectedSources = sourceRegistry.filter(s => s.connected).length;
      const recommendation = {
        strategy: requiredFlyers <= 0 || selZones.length === 0 ? "Selezione area non ancora finalizzata." : isResidentialStep2 ? "Seguire l'ordine di priorità dell'allocazione corrente, basato sul fabbisogno stimato delle zone selezionate." : isMovementStep2 ? pois.length > 0 || transportState?.available ? "Valutare per prime le zone con POI o nodi TPL effettivamente restituiti; il dato indica attrazione potenziale, non flusso pedonale misurato." : "Analisi parziale: POI e trasporto non sono collegati, quindi non viene proposta una priorità di attrazione." : pois.length > 0 ? "Valutare per prime le zone con attività POI effettivamente restituite; aree produttive, ATECO e punti di consegna non sono disponibili." : "Analisi parziale: non è collegato un censimento imprese, ATECO o aree produttive; non viene simulata una priorità B2B completa.",
        priorityZones: zoneRows.slice(0, 2).map(r => r.name).join(", ") || "Nessuna zona prioritaria disponibile.",
        criticalities: operationalAdvice.shortage > 0 ? `Quantità insufficiente per copertura completa (mancano ${formatIntegerIT(operationalAdvice.shortage)} pz.).` : operationalAdvice.factors.length ? operationalAdvice.factors.join("; ") : "Nessuna criticità operativa rilevata.",
        alternative: coverageDecision === "manual" && manualFlyers ? `Scenario personalizzato: ${formatIntegerIT(Number(manualFlyers))} pz.` : `Scenario consigliato: ${formatIntegerIT(step2ViewModel.recommendedFlyersValue)} pz.`
      };
      const scoreComponentNames = Array.isArray(zoneVerdict?.components) ? zoneVerdict.components.map(component => component?.name).filter(Boolean) : [];
      const scoreDescription = scoreComponentNames.length ? `Indicatore interno calcolato da: ${scoreComponentNames.join(", ")}. Non e un dato ufficiale ISTAT.` : "Indicatore interno calcolato dalle componenti effettivamente disponibili per questa configurazione. Non e un dato ufficiale ISTAT.";
      const reportProps = {
        truthModel: step2TruthModel,
        service: {
          key: svcKey,
          title: activeServiceTitle
        },
        territory: {
          label: step2TruthModel.territory.label,
          modeLabel,
          zoneCount,
          zoneStats: step2TruthModel.zones
        },
        dataStatusLabel: `${connectedSources}/${sourceRegistry.length} fonti e modelli disponibili`,
        lastUpdateLabel: "riferimenti restituiti indicati nella sezione Fonti",
        onBack: () => setIsAdminView(false),
        quantity: {
          available: !isResidentialStep2 || step2ViewModel.hasUsableCoverageData,
          inserted: step2TruthModel.quantity.current,
          originalInserted: step2TruthModel.quantity.inserted,
          baseRequirement: step2TruthModel.quantity.baseRequirement,
          operationalMargin: step2TruthModel.quantity.operationalMargin,
          recommended: step2TruthModel.quantity.recommendedRequirement,
          manual: manualFlyers,
          decision: coverageDecision,
          onSelectDecision: selectCoverageQuantityDecision,
          onManualChange: updateManualFlyersQuantity,
          maximum: operationalMaximum,
          days: step2TruthModel.duration.days,
          operatorCount: step2TruthModel.duration.operatorCount,
          showOperators: isResidentialStep2,
          dailyCapacity: D2D_DAILY_CAPACITY,
          showDailyCapacity: isResidentialStep2,
          quantityForDays: step2TruthModel.duration.scenarioQuantity,
          quotient: step2TruthModel.duration.operatorDays,
          coveragePctLabel: step2CoverageFullLabel,
          coverageFormula: step2TruthModel.coverage.formula,
          shortage: step2TruthModel.quantity.missing,
          surplus: step2TruthModel.quantity.surplus
        },
        coverage: {
          value: step2TruthModel.coverage.operationalPct,
          label: step2CoverageFullLabel,
          denominator: step2TruthModel.coverage.denominator
        },
        overviewKpis,
        topZonesPreview,
        topZonesMax: Math.max(...topZonesPreview.map(z => z.value || 0), 1),
        advice: operationalAdvice,
        reliability,
        confidence: step2TruthModel.confidence,
        zoneRows,
        zoneColumns,
        zoneEyebrow,
        priorityMax,
        isMilanoNil: isNilAnalysis && step2ViewModel.availableNilCount > 0,
        nilShowCount: 10,
        nilTotal: step2ViewModel.availableNilCount,
        demographics: {
          totalPopulation,
          totalHouseholds,
          profileDens,
          ageRows,
          familyBreakdownTitle,
          familyBreakdownItems,
          operationalRequirementExplanation
        },
        economy: {
          reddito: aiAgg?.reddito ?? null,
          omiRows,
          omiMeta
        },
        mobility: {
          poiByCategory,
          poiMax,
          transport: transportState,
          hotspotRows: h2hHotspotRadiusRows
        },
        business: {
          bizTotal: serviceKpis?.businesses ?? aiAgg?.bizTotal ?? null,
          competitors: serviceKpis?.competitors ?? null,
          cdIdx: serviceKpis?.cdIdx ?? null,
          topCatsReal,
          rankedRows: businessRadiusRows.map(r => ({
            ...r,
            zoneName: r.zoneName || r.name
          }))
        },
        score: {
          pct: Math.max(0, Math.min(100, Math.round(Number(zoneVerdict?.score || 0)))),
          label: zoneVerdict?.score >= 78 ? "ALTA" : zoneVerdict?.score >= 58 ? "MEDIA" : "BASSA",
          color: zoneVerdict?.score >= 78 ? "#4ADE80" : zoneVerdict?.score >= 58 ? "#60A5FA" : "#FBBF24",
          components: Array.isArray(zoneVerdict?.components) ? zoneVerdict.components : [],
          description: scoreDescription
        },
        recommendation,
        sourceRegistry,
        pdf: {
          busy: false,
          onExport: () => printTerritorialReportPdf({
            generatedAt: Date.now(),
            service: activeServiceTitle,
            territoryLabel: step2TruthModel.territory.label || step2ViewModel.primaryAreaLabel || "Territorio selezionato",
            modeLabel,
            overviewKpis: overviewKpis.map(k => ({
              label: k.label,
              value: k.unavailable ? "Dato non disponibile" : k.value,
              unit: k.unavailable ? "" : k.unit
            })),
            quantity: {
              subtitle: "Bilancio operativo",
              bars: [{
                label: "Quantità scenario corrente",
                value: step2TruthModel.quantity.current,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.current)} pz.`
              }, {
                label: "Fabbisogno base",
                value: step2TruthModel.quantity.baseRequirement,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.baseRequirement)} pz.`
              }, {
                label: "Margine operativo",
                value: step2TruthModel.quantity.operationalMargin,
                valueLabel: `+${formatIntegerIT(step2TruthModel.quantity.operationalMargin)} pz.`
              }, {
                label: "Fabbisogno operativo consigliato",
                value: step2TruthModel.quantity.recommendedRequirement,
                valueLabel: `${formatIntegerIT(step2TruthModel.quantity.recommendedRequirement)} pz.`
              }]
            },
            topZones: zoneRows.length ? {
              columns: zoneColumns.map(c => ({
                key: c.key,
                label: c.label,
                render: c.render
              })),
              rows: zoneRows.slice(0, 10)
            } : null,
            demographics: {
              totalPopulation,
              totalHouseholds,
              profileDens,
              operationalRequirementExplanation
            },
            economy: {
              omiRows,
              omiMeta
            },
            score: {
              pct: Math.round(Number(zoneVerdict?.score || 0)),
              serviceTitle: activeServiceTitle,
              note: scoreDescription
            },
            recommendation,
            sources: sourceRegistry.map(s => ({
              ...s,
              status: s.connected ? "Collegato" : "Non collegato"
            }))
          })
        }
      };

    return <TerritorialReport p={reportProps} truthModel={step2TruthModel} isMobile={isMobile} />;
}
