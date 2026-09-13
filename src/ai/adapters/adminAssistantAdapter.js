import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";

/**
 * Invokes ai-core backend with admin_dashboard context type.
 * Server strictly verifies JWT token and enforces Admin role.
 */
export async function runAdminDashboardAi({ page = "admin", campaignId = null, snapshot = {}, question }) {
  const trimmedQuestion = String(question || "").trim();
  if (!trimmedQuestion) throw new Error("INVALID_QUESTION");

  try {
    await ensureSupabaseSessionBridge();
    const { data, error } = await supabase.functions.invoke("ai-core", {
      body: {
        contextType: "admin_dashboard",
        page,
        campaignId: campaignId || snapshot?.campaignId || snapshot?.id || null,
        snapshot: snapshot || {},
        question: trimmedQuestion,
      },
    });

    if (error) throw error;
    if (data?.error) {
      if (data.error === "AUTHENTICATION_REQUIRED") {
        return {
          answer: "Accesso non autorizzato o sessione Admin scaduta. Effettua nuovamente il login con credenziali di amministratore.",
          status: "auth_error",
        };
      }
      if (data.error === "FORBIDDEN") {
        return {
          answer: "Accesso negato: questa sezione richiede privilegi di Amministratore.",
          status: "forbidden",
        };
      }
      throw new Error(data.error);
    }

    if (typeof data?.answer === "string" && data.answer.trim()) {
      return {
        answer: data.answer.trim(),
        summary: data.summary || null,
        status: data.status || "ai",
        warnings: data.warnings || [],
        action: data.action || null,
      };
    }

    throw new Error("EMPTY_ANSWER");
  } catch (err) {
    console.warn("[ADMIN_AI_INVOKE_FAILED]", err?.message);
    throw err;
  }
}
