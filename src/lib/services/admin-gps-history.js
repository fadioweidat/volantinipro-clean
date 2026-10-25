import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { createAdminGpsHistory } from './admin-gps-history-core.js';
import { getLiveDrivers } from './admin-api.js';
// legacySummaries: previous reading, used only while gps_admin_session_summaries is not installed.
export const adminGpsHistory = createAdminGpsHistory(supabase, ensureSupabaseSessionBridge, { legacySummaries: () => getLiveDrivers() });
