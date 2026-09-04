import { ensureSupabaseSessionBridge, supabase } from "../../supabaseClient.js";
import { buildControlCenterAiSnapshot } from "../../lib/monitoring/controlCenterEngine.js";

const REQUIRED_FIELDS = ["probableCause", "impact", "urgency", "suggestedFix", "autoResolvable"];

export async function runControlCenterDiagnosis(problem) {
  const snapshot = buildControlCenterAiSnapshot(problem);
  if (!snapshot) throw new Error("INVALID_CONTROL_CENTER_ISSUE");
  await ensureSupabaseSessionBridge();
  const { data, error } = await supabase.functions.invoke("ai-core", {
    body: {
      contextType: "control_center_diagnosis",
      snapshot,
      question: "Analizza il problema tecnico e proponi il fix più sicuro.",
    },
  });
  if (error) throw error;
  if (data?.status === "error" || data?.status === "fallback") throw new Error(data?.error || "AI_DIAGNOSIS_UNAVAILABLE");
  if (!data || REQUIRED_FIELDS.some((field) => data[field] === undefined)) throw new Error("INVALID_AI_DIAGNOSIS");
  return Object.freeze({
    probableCause: String(data.probableCause).slice(0, 500),
    impact: String(data.impact).slice(0, 500),
    urgency: String(data.urgency).slice(0, 40),
    suggestedFix: String(data.suggestedFix).slice(0, 500),
    autoResolvable: data.autoResolvable === true,
    status: data.status,
  });
}
