// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

declare const Deno: any;

type JsonBody = Record<string, unknown>;

type RateBucket = {
  windowStart: number;
  count: number;
};

const rateBuckets = new Map<string, RateBucket>();

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const RATE_LIMIT_MAX = envInt("FADI_RATE_LIMIT_MAX", 120, 1, 10000);
const RATE_LIMIT_WINDOW_MS = envInt("FADI_RATE_LIMIT_WINDOW_MS", 60000, 1000, 3600000);

function allowedOrigins(): Set<string> {
  const raw = Deno.env.get("FADI_ALLOWED_ORIGINS") || "";
  return new Set(raw.split(",").map((value: string) => value.trim()).filter(Boolean));
}

function requestOrigin(req: Request): string | null {
  return req.headers.get("origin");
}

function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, x-request-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  const origin = requestOrigin(req);
  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function isOriginAllowed(req: Request): boolean {
  const origin = requestOrigin(req);
  if (!origin) return true; // server-to-server requests do not send Origin
  return allowedOrigins().has(origin);
}

function json(req: Request, body: JsonBody, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

function consumeRateLimit(req: Request): { allowed: boolean; retryAfterSeconds: number } {
  const key = clientKey(req);
  const now = Date.now();
  const current = rateBuckets.get(key);

  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { windowStart: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= RATE_LIMIT_MAX) {
    const remaining = Math.max(0, RATE_LIMIT_WINDOW_MS - (now - current.windowStart));
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remaining / 1000)) };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

async function sha256(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function isAuthenticated(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const secret = Deno.env.get("FADI_ONE_SECRET") || "";

  if (!secret) {
    console.error(JSON.stringify({ component: "fadi-gateway", event: "auth_config_error", reason: "missing_fadi_one_secret" }));
    return false;
  }
  if (!token) return false;
  return constantTimeEqual(token, secret);
}

function requestId(req: Request): string {
  const supplied = req.headers.get("x-request-id")?.trim();
  if (supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)) return supplied;
  return crypto.randomUUID();
}

function audit(input: {
  requestId: string;
  action: string;
  result: string;
  httpStatus: number;
  startedAt: number;
}) {
  console.log(JSON.stringify({
    component: "fadi-gateway",
    event: "request_audit",
    timestamp: new Date().toISOString(),
    request_id: input.requestId,
    action: input.action,
    result: input.result,
    duration_ms: Date.now() - input.startedAt,
    http_status: input.httpStatus,
  }));
}

serve(async (req: Request) => {
  const startedAt = Date.now();
  const reqId = requestId(req);
  let action = "unknown";

  const respond = (body: JsonBody, status: number, result: string) => {
    audit({ requestId: reqId, action, result, httpStatus: status, startedAt });
    return json(req, body, status);
  };

  if (!isOriginAllowed(req)) {
    return respond({ status: "error", error: "ORIGIN_NOT_ALLOWED" }, 403, "origin_not_allowed");
  }

  if (req.method === "OPTIONS") {
    audit({ requestId: reqId, action: "preflight", result: "ok", httpStatus: 204, startedAt });
    return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return respond({ status: "error", error: "METHOD_NOT_ALLOWED" }, 405, "method_not_allowed");
  }

  const rate = consumeRateLimit(req);
  if (!rate.allowed) {
    const response = respond({ status: "error", error: "RATE_LIMITED" }, 429, "rate_limited");
    response.headers.set("Retry-After", String(rate.retryAfterSeconds));
    return response;
  }

  if (!(await isAuthenticated(req))) {
    return respond({ status: "error", error: "UNAUTHORIZED" }, 401, "unauthorized");
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return respond({ status: "error", error: "INVALID_PAYLOAD" }, 400, "invalid_payload");
    }

    action = typeof (body as Record<string, unknown>).action === "string"
      ? String((body as Record<string, unknown>).action)
      : "unknown";

    if (!/^[a-z][a-z0-9_]{0,63}$/.test(action)) {
      return respond({ status: "error", error: "INVALID_ACTION" }, 400, "invalid_action");
    }

    const supabase = supabaseAdmin();
    if (!supabase) {
      return respond({ status: "error", error: "INTERNAL_SERVER_ERROR" }, 500, "backend_unavailable");
    }

    switch (action) {
      case "health": {
        return respond({ status: "ok", message: "Fadi Gateway VP-1 is healthy and running in READ_ONLY mode." }, 200, "ok");
      }

      case "get_active_campaigns": {
        const { data, error } = await supabase
          .from("campaigns")
          .select("id, status, quantity, service_type, created_at, start_date, end_date, distribution_mode")
          .in("status", ["pending", "active", "in_progress", "completed"])
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return respond({ status: "ok", data }, 200, "ok");
      }

      case "get_driver_assignments": {
        const { data, error } = await supabase
          .from("operator_assignments")
          .select("id, status, created_at, starts_at, ends_at, campaign_id")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return respond({ status: "ok", data }, 200, "ok");
      }

      case "get_recent_quotes": {
        const { data, error } = await supabase
          .from("quotes")
          .select("id, campaign_id, total_amount, is_active, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return respond({ status: "ok", data }, 200, "ok");
      }

      case "get_operational_anomalies": {
        const { data: campaigns, error: campErr } = await supabase
          .from("campaigns")
          .select("id, status, quantity")
          .eq("status", "active");
        if (campErr) throw campErr;

        const { data: assignments, error: assErr } = await supabase
          .from("operator_assignments")
          .select("campaign_id")
          .in("status", ["active", "pending"]);
        if (assErr) throw assErr;

        const activeAssignedCampaigns = new Set(assignments.map((a: any) => a.campaign_id));
        const unassignedActiveCampaigns = campaigns.filter((c: any) => !activeAssignedCampaigns.has(c.id));
        return respond({
          status: "ok",
          data: { unassigned_active_campaigns: unassignedActiveCampaigns },
        }, 200, "ok");
      }

      default: {
        return respond({ status: "error", error: "ACTION_NOT_ALLOWED" }, 403, "action_not_allowed");
      }
    }
  } catch (error) {
    console.error(JSON.stringify({
      component: "fadi-gateway",
      event: "internal_error",
      request_id: reqId,
      action,
      error_name: error instanceof Error ? error.name : "unknown",
    }));
    return respond({ status: "error", error: "INTERNAL_SERVER_ERROR" }, 500, "internal_error");
  }
});
