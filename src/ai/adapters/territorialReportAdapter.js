import { supabase, ensureSupabaseSessionBridge } from "../../supabaseClient.js";

export const TERRITORIAL_REPORT_DEFAULT_QUESTION = "Genera l'analisi territoriale usando esclusivamente lo snapshot fornito.";

export async function runTerritorialReport({ snapshot, question = TERRITORIAL_REPORT_DEFAULT_QUESTION } = {}) {
  if (!snapshot) return { status: "error", error: "Dati insufficienti per generare un'analisi affidabile." };
  try {
    await ensureSupabaseSessionBridge();
    const { data, error } = await supabase.functions.invoke("ai-core", {
      body: { contextType: "territorial_report", snapshot, question },
    });
    if (error) throw error;
    if (!data || data.status === "error" || data.error) {
      return { status: "error", error: data?.error || "Analisi AI non disponibile." };
    }
    return data;
  } catch (error) {
    return { status: "error", error: error instanceof Error && error.message ? error.message : "Analisi AI non disponibile." };
  }
}
