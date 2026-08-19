const MAX_DRIVERS = 20;
const MAX_CAMPAIGNS = 30;
const MAX_MUNICIPALITIES = 12;
const MAX_ALERTS = 12;

const text = (value, max = 80) => typeof value === "string" && value.trim()
  ? value.trim().slice(0, max)
  : null;
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

function programStatus(driver) {
  if (driver.programConfirmedAt) return "confirmed";
  if (driver.programOpenedAt) return "opened";
  if (driver.programSentAt) return "sent";
  return "not_sent";
}

function currentMunicipality(zones = []) {
  return zones.find(zone => zone.status === "In corso")?.name
    || zones.find(zone => !["Completata", "Bloccata"].includes(zone.status))?.name
    || null;
}

function normalizeAlerts(alerts = []) {
  return alerts.slice(0, MAX_ALERTS).map(alert => ({
    type: text(alert?.type, 40) || "UNKNOWN",
    severity: ["CRITICAL", "WARNING", "INFO"].includes(alert?.severity) ? alert.severity : "INFO",
    message: text(alert?.message, 180) || "Alert operativo senza dettaglio",
  }));
}

/**
 * Serializza il report operativo deterministico gia' usato dall'Admin.
 * Non interroga il DB e non ricalcola alert/status: limita e rimuove PII,
 * coordinate, UUID, prezzi e qualsiasi campo non necessario al Copilot.
 */
export function buildAdminOperationsSnapshot(report, { generatedAt = new Date().toISOString() } = {}) {
  const rows = Array.isArray(report?.drivers) ? report.drivers : [];
  const prioritizedRows = [...rows].sort((a, b) => {
    const rank = item => (item?.alerts || []).reduce((max, alert) => Math.max(max, alert?.severity === "CRITICAL" ? 3 : alert?.severity === "WARNING" ? 2 : 1), 0);
    return rank(b) - rank(a);
  });
  const drivers = prioritizedRows.slice(0, MAX_DRIVERS).map(driver => {
    const zones = Array.isArray(driver?.zones) ? driver.zones : [];
    const completed = zones.filter(zone => zone.status === "Completata").length;
    const blocked = zones.filter(zone => zone.status === "Bloccata").length;
    const alerts = normalizeAlerts(driver?.alerts);
    return {
      displayName: text(driver?.driverName, 60) || "Driver non disponibile",
      campaign: text(driver?.campaignName, 80) || "Campagna non disponibile",
      status: text(driver?.status, 30) || "NON DISPONIBILE",
      municipalities: zones.map(zone => text(zone?.name, 60)).filter(Boolean).slice(0, MAX_MUNICIPALITIES),
      assignedQuantity: number(driver?.quantityAssigned),
      currentMunicipality: text(currentMunicipality(zones), 60),
      progress: { completedZones: completed, totalZones: zones.length, percent: zones.length ? Math.round((completed / zones.length) * 100) : 0 },
      blockedZones: blocked,
      alerts,
      lastGpsAt: text(driver?.lastGpsAt, 40),
      gpsPointCount: number(driver?.gpsPointCount),
      photoCount: number(driver?.photoCount),
      programStatus: programStatus(driver),
    };
  });

  const campaignMap = new Map();
  drivers.forEach(driver => {
    const item = campaignMap.get(driver.campaign) || {
      title: driver.campaign,
      driverNames: new Set(),
      zones: 0,
      completedZones: 0,
      blockedZones: 0,
      assignedQuantity: 0,
      alerts: [],
    };
    item.driverNames.add(driver.displayName);
    item.zones += driver.progress.totalZones;
    item.completedZones += driver.progress.completedZones;
    item.blockedZones += driver.blockedZones;
    item.assignedQuantity += driver.assignedQuantity;
    item.alerts.push(...driver.alerts);
    campaignMap.set(driver.campaign, item);
  });
  const campaigns = [...campaignMap.values()].slice(0, MAX_CAMPAIGNS).map(item => ({
    title: item.title,
    drivers: item.driverNames.size,
    zones: item.zones,
    completedZones: item.completedZones,
    blockedZones: item.blockedZones,
    assignedQuantity: item.assignedQuantity,
    alerts: normalizeAlerts(item.alerts),
  }));

  const allAlerts = drivers.flatMap(driver => driver.alerts);
  const snapshot = {
    schemaVersion: 1,
    generatedAt,
    date: text(report?.date, 10),
    totals: {
      campaigns: campaigns.length,
      drivers: number(report?.kpis?.driversScheduled),
      assignments: rows.length,
      zones: number(report?.kpis?.zonesAssigned ?? report?.kpis?.municipalitiesAssigned),
      completedZones: number(report?.kpis?.zonesCompleted ?? report?.kpis?.municipalitiesCompleted),
      blockedZones: number(report?.kpis?.municipalitiesBlocked),
      activeAlerts: allAlerts.length,
      criticalAlerts: allAlerts.filter(alert => alert.severity === "CRITICAL").length,
      warningAlerts: allAlerts.filter(alert => alert.severity === "WARNING").length,
      gpsSessions: number(report?.kpis?.gpsSessions),
      gpsPoints: drivers.reduce((sum, driver) => sum + driver.gpsPointCount, 0),
      photos: number(report?.kpis?.photos),
    },
    drivers,
    campaigns,
    availability: {
      distributedQuantity: false,
      distanceKm: false,
      blockReason: false,
    },
    truncation: { driversIncluded: drivers.length, driversAvailable: rows.length },
    sources: ["operator_assignments", "campaign_zones", "delivery_sessions", "gps_telemetry_aggregated", "proof_photo_counts", "assignment_event_log", "operation_alerts"],
  };
  // Il limite server ai-core resta 20 KB anche per Step2. Riduciamo soltanto
  // il dettaglio, mai i totali, privilegiando le righe con alert più severi.
  while (JSON.stringify(snapshot).length > 19000 && snapshot.drivers.length > 0) snapshot.drivers.pop();
  while (JSON.stringify(snapshot).length > 19000 && snapshot.campaigns.length > 0) snapshot.campaigns.pop();
  snapshot.truncation.driversIncluded = snapshot.drivers.length;
  return Object.freeze(snapshot);
}
