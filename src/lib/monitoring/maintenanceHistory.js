const DAILY_PREFIX = 'maintenance_daily_';
const MONTHLY_PREFIX = 'maintenance_monthly_';

const newest = (rows, prefix) => [...(rows || [])]
  .filter((row) => String(row.check_name || '').startsWith(prefix))
  .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at))[0] || null;

function nextFirstMonday(now = new Date()) {
  const date = new Date(now);
  date.setHours(8, 0, 0, 0);
  const firstOfThisMonth = new Date(date.getFullYear(), date.getMonth(), 1, 8);
  const offset = (8 - firstOfThisMonth.getDay()) % 7;
  const thisMonth = new Date(date.getFullYear(), date.getMonth(), 1 + offset, 8);
  if (thisMonth > now) return thisMonth;
  const firstOfNextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1, 8);
  return new Date(firstOfNextMonth.getFullYear(), firstOfNextMonth.getMonth(), 1 + ((8 - firstOfNextMonth.getDay()) % 7), 8);
}

export function deriveMaintenanceStatus(rows = [], now = new Date()) {
  const lastDaily = newest(rows, DAILY_PREFIX);
  const lastMonthly = newest(rows, MONTHLY_PREFIX);
  const nextDaily = new Date(now);
  nextDaily.setHours(7, 0, 0, 0);
  if (nextDaily <= now || lastDaily?.metadata?.localDate === now.toLocaleDateString('en-CA')) nextDaily.setDate(nextDaily.getDate() + 1);
  const summary = lastDaily?.metadata?.summary || {};
  const monthlyReport = lastMonthly?.metadata?.report || null;
  const monthlyCounts = monthlyReport?.counts || {};
  return Object.freeze({
    scheduler: 'pg_cron · platform-health-collector',
    timeZone: 'Europe/Rome',
    lastDailyAt: lastDaily?.checked_at || null,
    nextDailyAt: nextDaily.toISOString(),
    lastMonthlyAt: lastMonthly?.checked_at || null,
    nextMonthlyAt: nextFirstMonday(now).toISOString(),
    autoFixes: lastDaily ? Number(summary.autoFixes) || 0 : null,
    warnings: lastDaily ? Number(summary.warning) || 0 : null,
    critical: lastDaily ? Number(summary.critical) || 0 : null,
    lastDailyStatus: lastDaily?.status || 'unknown',
    lastMonthlyStatus: lastMonthly?.status || 'unknown',
    monthlyAutoFixes: lastMonthly ? Number(monthlyCounts.autoFixes) || 0 : null,
    monthlyWarnings: lastMonthly ? Number(monthlyCounts.warning) || 0 : null,
    monthlyCritical: lastMonthly ? Number(monthlyCounts.critical) || 0 : null,
    monthlyReport,
    // FASE 8: warning persistenti da segnalare senza correggerli automaticamente.
    persistentProblems: (monthlyReport?.problems || []).filter((problem) => problem.persistent),
  });
}
