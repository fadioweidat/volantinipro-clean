import { supabase } from "../../supabaseClient.js";
import { generateClientStep2Answer } from "../context/buildQuoteAssistantContext.js";

const VALID_CONTEXT_TYPES = new Set(["step1", "step2", "step3", "step4"]);

export async function runQuoteAssistant({ contextType, snapshot, question }) {
  if (!VALID_CONTEXT_TYPES.has(contextType)) throw new Error("INVALID_CONTEXT_TYPE");
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) throw new Error("INVALID_QUESTION");

  // Per Step 2, se la domanda ha una risposta deterministica immediata basata sui dati reali, rispondi subito
  if (contextType === "step2" && snapshot) {
    const directAnswer = generateClientStep2Answer(normalizedQuestion, snapshot);
    if (directAnswer) {
      return { answer: directAnswer, status: "deterministic" };
    }
  }

  let invokeError = null;
  try {
    const { data, error } = await supabase.functions.invoke("ai-core", {
      body: { contextType, snapshot, question: normalizedQuestion },
    });
    if (!error && data && data.status !== "error" && typeof data.answer === "string" && data.answer.trim()) {
      return { answer: data.answer.trim(), status: data.status || "ai" };
    }
    invokeError = data?.error || error?.message || null;
  } catch (err) {
    invokeError = err instanceof Error ? err.message : "INVOKE_FAILED";
  }

  // Fallback sicuro grounded se la funzione backend non è disponibile
  if (contextType === "step2" && snapshot) {
    const fallbackAnswer = generateClientStep2Answer(normalizedQuestion, snapshot, { allowGeneric: true });
    if (fallbackAnswer) {
      return { answer: fallbackAnswer, status: "fallback" };
    }
  }

  throw new Error(invokeError || "ASSISTANT_UNAVAILABLE");
}

