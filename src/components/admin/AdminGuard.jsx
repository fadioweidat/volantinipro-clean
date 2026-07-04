import { useEffect, useState } from "react";
import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";
import { logAuditEvent } from "../../lib/audit.js";

// Admin role source: no `admin_users` table exists on the live Supabase
// schema (verified via a read-only REST probe — 404 PGRST205). The
// `public.profiles` table does exist with an `id` (uuid) + `role` column,
// which is the standard Supabase pattern (profiles.id references auth.users.id).
// This is the only plausible existing role source, so it's used here. It
// requires an RLS policy letting a user read their own profiles row and at
// least one row with role='admin' to actually grant access — see the SQL
// notes reported alongside this fix. Nothing is hardcoded/mocked: with no
// matching row, every user is denied (fail-closed).
const ADMIN_ROLES = ["admin", "super_admin"];

export async function checkAdminAccess() {
  console.info("[ADMIN_GUARD_CHECK_STARTED]");

  if (!supabase) {
    console.warn("[ADMIN_GUARD_NO_SESSION]", { reason: "supabase_not_configured" });
    logAuditEvent({ action: "admin_access_no_session", success: false, metadata: { reason: "supabase_not_configured" } });
    return { status: "no_session", user: null, role: null };
  }

  await ensureSupabaseSessionBridge();
  const { data } = await supabase.auth.getUser();
  const user = data?.user || null;

  if (!user) {
    console.warn("[ADMIN_GUARD_NO_SESSION]");
    logAuditEvent({ action: "admin_access_no_session", success: false });
    return { status: "no_session", user: null, role: null };
  }

  console.info("[ADMIN_GUARD_USER_FOUND]", { email: user.email, userId: user.id });
  console.info("[ADMIN_GUARD_ROLE_CHECK]", { userId: user.id });

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || null;
  const isAdmin = ADMIN_ROLES.includes(role);

  if (error || !isAdmin) {
    console.warn("[ADMIN_GUARD_DENIED]", { email: user.email, role, error: error?.message || null });
    logAuditEvent({ action: "admin_access_denied", success: false, metadata: { role }, errorMessage: error?.message || null });
    return { status: "forbidden", user, role };
  }

  console.info("[ADMIN_GUARD_ALLOWED]", { email: user.email, role });
  logAuditEvent({ action: "admin_access_granted", metadata: { role } });
  return { status: "allowed", user, role };
}

export function useAdminAccess() {
  const [state, setState] = useState({ status: "checking", user: null, role: null });

  useEffect(() => {
    let cancelled = false;
    checkAdminAccess()
      .then((result) => { if (!cancelled) setState(result); })
      .catch((err) => {
        console.warn("[ADMIN_GUARD_DENIED]", { reason: "check_failed", error: err?.message || String(err) });
        if (!cancelled) setState({ status: "forbidden", user: null, role: null });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

const C = { navyDeep: "#060F1A", orange: "#E8571A", white: "#FFFFFF" };
const F = { serif: "'DM Serif Display',Georgia,serif", sans: "'DM Sans',sans-serif" };

export function AdminAccessScreen({ mode, onLogin }) {
  const isForbidden = mode === "forbidden";
  return (
    <div style={{ minHeight: "100vh", background: C.navyDeep, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center", padding: "40px 32px", borderRadius: 20, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 20px", background: isForbidden ? "rgba(239,68,68,.12)" : "rgba(232,87,26,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
          {isForbidden ? "⛔" : "🔒"}
        </div>
        <h1 style={{ fontFamily: F.serif, fontSize: 24, color: C.white, marginBottom: 10 }}>
          {isForbidden ? "Accesso non autorizzato" : "Accesso admin richiesto"}
        </h1>
        <p style={{ fontFamily: F.sans, fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.6, marginBottom: 24 }}>
          {isForbidden
            ? "Il tuo account non ha i permessi per accedere a questa area riservata agli amministratori VolantiniPro."
            : "Questa area è riservata agli amministratori VolantiniPro."}
        </p>
        {!isForbidden && (
          <button
            type="button"
            onClick={onLogin}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: C.orange, color: C.white, fontFamily: F.sans, fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            Accedi
          </button>
        )}
      </div>
    </div>
  );
}

const defaultOnLogin = () => {
  try {
    if (typeof window !== "undefined" && window.location.pathname.toLowerCase().includes("/admin")) {
      window.localStorage.setItem("volantinipro_return_to", "admin");
      window.localStorage.setItem("volantinipro_return_to_source", "admin");
      window.localStorage.removeItem("volantinipro_pending_campaign_id");
      console.info("[AUTH_RETURN_TO_SOURCE]", { source: "admin_guard_default", returnTo: "admin" });
    }
  } catch {}
  window.location.href = "/login";
};

export function AdminRouteGuard({ children, onLogin = defaultOnLogin }) {
  const { status } = useAdminAccess();

  if (status === "checking") {
    return (
      <div style={{ minHeight: "100vh", background: C.navyDeep, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "rgba(255,255,255,.5)", fontFamily: F.sans, fontSize: 13 }}>Verifica accesso in corso...</div>
      </div>
    );
  }

  if (status !== "allowed") {
    console.warn("[ADMIN_ROUTE_BLOCKED]", { status, path: typeof window !== "undefined" ? window.location.pathname : null });
    return <AdminAccessScreen mode={status} onLogin={onLogin} />;
  }

  return children;
}
