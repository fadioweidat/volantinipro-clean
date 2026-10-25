import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { createAdminGpsHistory } from './admin-gps-history-core.js';
export const adminGpsHistory = createAdminGpsHistory(supabase, ensureSupabaseSessionBridge);
