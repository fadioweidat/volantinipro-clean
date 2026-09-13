/**
 * Driver AI Assistant Client Adapter.
 *
 * Bridge between Driver pages and ai-core Edge Function.
 * Uses assignment access token for server-side verification.
 */

import { supabase } from "../../lib/supabaseClient.js";

export async function runDriverAssignmentAi({ assignmentId, accessToken, question, snapshot = {} }) {
  if (!assignmentId || !accessToken) {
    return {
      status: "error",
      error: "AUTH_REQUIRED",
      answer: "Accesso non autorizzato. Verifica il link dell'incarico ricevuto.",
    };
  }

  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) {
    return {
      status: "error",
      error: "EMPTY_QUESTION",
      answer: "Inserisci una domanda per l'assistente.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("ai-core", {
      body: {
        contextType: "driver_assignment",
        assignmentId,
        accessToken,
        question: cleanQuestion,
        snapshot,
      },
      headers: {
        "x-driver-access-token": accessToken,
      },
    });

    if (error) {
      const errMessage = String(error.message || "");
      if (errMessage.includes("403") || error.context?.status === 403) {
        return {
          status: "error",
          error: "FORBIDDEN",
          answer: "Accesso all'incarico non autorizzato. Il token di accesso non corrisponde a questa assegnazione.",
        };
      }
      if (errMessage.includes("401") || error.context?.status === 401) {
        return {
          status: "error",
          error: "UNAUTHORIZED",
          answer: "Accesso non autorizzato. Token mancante o non valido.",
        };
      }
      return {
        status: "error",
        error: "AI_CORE_ERROR",
        answer: "Si è verificato un errore durante la consultazione dell'assistente. Riprova tra qualche istante.",
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
