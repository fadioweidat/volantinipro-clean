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

let disabledWriterWarningEmitted = false;

export async function logAuditEvent({ action } = {}) {
  if (!KNOWN_ACTIONS.has(action)) {
    console.warn("[AUDIT_LOG_UNKNOWN_ACTION]", { action });
    return;
  }
  if (!disabledWriterWarningEmitted) {
    disabledWriterWarningEmitted = true;
    console.warn("[AUDIT_LOG_CLIENT_WRITER_DISABLED]", {
      reason: "P0 security hardening: direct browser INSERT is disabled",
      restoration: "Route audit events through a controlled backend or Edge Function",
    });
  }
}
