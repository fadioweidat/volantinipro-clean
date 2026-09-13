/**
 * Supplier AI Assistant Client Adapter.
 *
 * Bridge between Supplier Dashboard and ai-core Edge Function.
 * Uses authenticated supplier session for server-side verification.
 */

import { supabase } from "../../lib/supabaseClient.js";

export async function runSupplierDashboardAi({ campaignId = null, question, snapshot = {} }) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) {
    return {
      status: "error",
      error: "EMPTY_QUESTION",
      answer: "Inserisci una domanda per l'assistente.",
    };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || null;

    if (!token) {
      return {
        status: "error",
        error: "AUTH_REQUIRED",
        answer: "Sessione fornitore non valida o scaduta. Effettua nuovamente l'accesso.",
      };
    }

    const { data, error } = await supabase.functions.invoke("ai-core", {
      body: {
        contextType: "supplier_dashboard",
        campaignId,
        question: cleanQuestion,
        snapshot,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      const errMessage = String(error.message || "");
      if (errMessage.includes("403") || error.context?.status === 403) {
        return {
          status: "error",
          error: "FORBIDDEN",
          answer: "Accesso non autorizzato. Questa funzionalità è riservata esclusivamente ai partner fornitori verificati.",
        };
      }
      if (errMessage.includes("401") || error.context?.status === 401) {
        return {
          status: "error",
          error: "UNAUTHORIZED",
          answer: "Autenticazione richiesta. Effettua il login come fornitore.",
        };
      }
      return {
        status: "error",
        error: "AI_CORE_ERROR",
        answer: "Si è verificato un errore durante la risposta del Copilot Fornitore. Riprova tra qualche istante.",
      };
    }

    if (!data || typeof data.answer !== "string") {
      return {
        status: "fallback",
        answer: "Questo dato non è disponibile nei dati operativi attuali.",
        summary: "Dato non disponibile.",
        sources: [],
        action: null,
      };
    }

    return {
      status: data.status || "ai",
      answer: data.answer,
      summary: data.summary || "",
      priorities: Array.isArray(data.priorities) ? data.priorities : [],
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      sources: Array.isArray(data.sources) ? data.sources : [],
      action: data.action || null,
      cached: Boolean(data.cached),
    };
  } catch (err) {
    return {
      status: "error",
      error: "NETWORK_ERROR",
      answer: "Impossibile contattare l'assistente in questo momento. Verifica la connessione e riprova.",
    };
  }
}
