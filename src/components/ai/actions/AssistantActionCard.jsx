import React, { useState } from "react";
import { ACTION_TYPES, ACTION_STATES, getActionExecutionKey } from "../../../ai/actions/actionSchema.js";

/**
 * AssistantActionCard — Generic interactive action card for assistant messages.
 * Phase 5A: Supports safe navigation and mutation preview confirmation UX.
 */
export default function AssistantActionCard({
  action,
  role = "guest",
  onNavigate,
  onConfirmAction,
}) {
  const [state, setState] = useState(ACTION_STATES.IDLE);
  const [feedback, setFeedback] = useState(null);

  if (!action || !action.type) return null;

  // 1. Navigation Action
  if (action.type === ACTION_TYPES.NAVIGATE) {
    const label = action.label || `Apri ${action.route || ""}`;
    const handleNavClick = () => {
      if (typeof onNavigate === "function") {
        onNavigate(action.route, action);
      }
    };

    return (
      <div className="quote-ai__action-card quote-ai__action-card--navigate">
        <button
          type="button"
          className="quote-ai__action-btn quote-ai__action-btn--nav"
          onClick={handleNavClick}
          aria-label={label}
        >
          <span>→</span> {label}
        </button>
      </div>
    );
  }

  // 2. Mutation Preview Action
  if (action.type === ACTION_TYPES.PREVIEW_MUTATION) {
    const isCancelled = state === ACTION_STATES.CANCELLED;
    const isConfirmed = state === ACTION_STATES.CONFIRMED;
    const isConfirming = state === ACTION_STATES.CONFIRMING;
    const isFailed = state === ACTION_STATES.FAILED;

    const handleCancel = () => {
      setState(ACTION_STATES.CANCELLED);
      setFeedback("Operazione annullata. Nessuna modifica apportata.");
    };

    const handleConfirm = async () => {
      if (state === ACTION_STATES.CONFIRMING || state === ACTION_STATES.CONFIRMED) return;
      setState(ACTION_STATES.CONFIRMING);
      setFeedback(null);

      try {
        if (typeof onConfirmAction === "function") {
          const res = await onConfirmAction(action);
          if (res?.allowed || res?.ok) {
            setState(ACTION_STATES.CONFIRMED);
            setFeedback(res.message || "Azione verificata con successo.");
          } else {
            setState(ACTION_STATES.FAILED);
            setFeedback(res?.error || "Autorizzazione negata dal server.");
          }
        } else {
          // Default Phase 5A simulated confirmation: safe verification acknowledgment
          setState(ACTION_STATES.CONFIRMED);
          setFeedback("Azione confermata (modalità sicura Phase 5A).");
        }
      } catch (err) {
        setState(ACTION_STATES.FAILED);
        setFeedback(err instanceof Error ? err.message : "Errore durante la conferma.");
      }
    };

    const isSendMessage = action.action === "admin_send_message";
    const confirmButtonLabel = isConfirming
      ? "Invio in corso…"
      : isSendMessage
      ? "Conferma invio"
      : "Conferma";

    return (
      <div
        className={`quote-ai__action-card quote-ai__action-card--preview ${state}`}
        data-action-key={getActionExecutionKey(action)}
      >
        <div className="quote-ai__preview-badge">
          {isSendMessage ? "Anteprima Invio Messaggio" : "Anteprima Operazione"}
        </div>
        <div className="quote-ai__preview-summary">{action.summary}</div>

        {isSendMessage && action.messageText && (
          <div style={{ margin: "6px 0 10px 0", padding: "8px 10px", background: "rgba(255,255,255,0.06)", borderRadius: "6px", fontSize: "11px" }}>
            <div style={{ color: "#93c5fd", fontWeight: 700, marginBottom: "4px" }}>
              Destinatario: {action.recipientName || (action.recipientType === "customer" ? "Cliente" : "Driver")}
            </div>
            <div style={{ color: "#fff", fontStyle: "italic", whiteSpace: "pre-wrap" }}>
              "{action.messageText}"
            </div>
          </div>
        )}

        {Array.isArray(action.consequences) && action.consequences.length > 0 && (
          <ul className="quote-ai__consequences">
            {action.consequences.map((c, idx) => (
              <li key={idx}>{c}</li>
            ))}
          </ul>
        )}

        {state === ACTION_STATES.IDLE || state === ACTION_STATES.CONFIRMING ? (
          <div className="quote-ai__confirm-box">
            <p className="quote-ai__confirm-prompt">
              {isSendMessage ? "Vuoi confermare l'invio di questo messaggio?" : "Vuoi confermare questa azione?"}
            </p>
            <div className="quote-ai__confirm-bar">
              <button
                type="button"
                className="quote-ai__btn quote-ai__btn--cancel"
                onClick={handleCancel}
                disabled={isConfirming}
              >
                Annulla
              </button>
              <button
                type="button"
                className="quote-ai__btn quote-ai__btn--confirm"
                onClick={handleConfirm}
                disabled={isConfirming}
              >
                {confirmButtonLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className={`quote-ai__action-feedback quote-ai__action-feedback--${state}`}>
            <div>{feedback}</div>
            {state === ACTION_STATES.FAILED && (
              <button
                type="button"
                className="quote-ai__btn quote-ai__btn--confirm"
                style={{ marginTop: "6px" }}
                onClick={() => { setState(ACTION_STATES.IDLE); setFeedback(null); }}
              >
                Riprova
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
