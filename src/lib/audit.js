import { getStoredSupabaseSession } from "./supabaseClient.js";

// Best-effort, fire-and-forget audit trail writer. Never throws and never
// blocks the caller's real action — a failed audit write must not break
// login, campaign save, or any other business flow. Requires the
// `public.audit_log` table + RLS policies described in AUDIT_LOG_SETUP.sql
// (not created automatically — see project notes).
const KNOWN_ACTIONS = new Set([
  "login_requested",
  "login_succeeded",
  "login_failed",
  "campaign_saved",
  "campaign_save_failed",
  "waitlist_submitted",
  "waitlist_submit_failed",
  "waitlist_marked_handled",
  "waitlist_mark_handled_failed",
  "admin_access_granted",
  "admin_access_denied",
  "admin_access_no_session",
  "crm_client_updated",
  "crm_referente_created",
  "crm_referente_updated",
  "crm_referente_deleted",
  "dms_document_uploaded",
  "dms_document_upload_failed",
  "dms_document_deleted",
  "dms_document_delete_failed",
  "config_setting_updated",
  "config_setting_update_failed",
  "ai_anomaly_scan_performed",
]);

function supabaseEnv() {
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export async function logAuditEvent({ action, resourceType = null, resourceId = null, metadata = null, success = true, errorMessage = null } = {}) {
  try {
    if (!KNOWN_ACTIONS.has(action)) {
      console.warn("[AUDIT_LOG_UNKNOWN_ACTION]", { action });
      return;
    }
    const { url, anonKey } = supabaseEnv();
    if (!url || !anonKey) return;
    const session = getStoredSupabaseSession();
    const token = session?.accessToken || session?.access_token || anonKey;
    const actorId = session?.user?.id || null;
    const actorEmail = session?.user?.email || null;

    const response = await fetch(`${url}/rest/v1/audit_log`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        action,
        resource_type: resourceType,
        resource_id: resourceId ? String(resourceId) : null,
        actor_id: actorId,
        actor_email: actorEmail,
        metadata: metadata || null,
        success: Boolean(success),
        error_message: errorMessage || null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[AUDIT_LOG_WRITE_FAILED]", { action, status: response.status, error: text });
    }
  } catch (err) {
    console.warn("[AUDIT_LOG_WRITE_FAILED]", { action, error: err?.message || String(err) });
  }
}
