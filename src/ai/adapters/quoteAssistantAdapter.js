import { supabase } from "../../supabaseClient.js";

const VALID_CONTEXT_TYPES = new Set(["step1", "step2", "step3", "step4"]);

export async function runQuoteAssistant({ contextType, snapshot, question }) {
  if (!VALID_CONTEXT_TYPES.has(contextType)) throw new Error("INVALID_CONTEXT_TYPE");
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) throw new Error("INVALID_QUESTION");

  const { data, error } = await supabase.functions.invoke("ai-core", {
    body: { contextType, snapshot, question: normalizedQuestion },
  });
  if (error || !data || data.status === "fallback" || data.status === "error" || typeof data.answer !== "string" || !data.answer.trim()) {
    throw new Error(data?.error || error?.message || "ASSISTANT_UNAVAILABLE");
  }
  return { answer: data.answer.trim(), status: data.status || "ai" };
}
