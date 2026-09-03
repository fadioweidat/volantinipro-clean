import React, { useId, useState } from "react";
import "./ai-components.css";

export function AISourcePopover({ datum }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const sources = Array.isArray(datum?.sources) ? datum.sources : [];
  return (
    <span className="ai-source">
      <button
        type="button"
        className="ai-source__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      >
        Fonte e criterio
      </button>
      {open && (
        <span className="ai-source__panel" id={panelId} role="region" aria-label={`Dettagli fonte per ${datum?.label || "dato"}`}>
          <strong>Fonte</strong>
          <span>{sources.length ? sources.map((source) => source.label).join(", ") : "Non dichiarata"}</span>
          {datum?.derivation && (
            <>
              <strong>Criterio</strong>
              <span>{datum.derivation.criterion}</span>
              {datum.derivation.formula && <code>{datum.derivation.formula}</code>}
              {datum.derivation.assumptions?.length > 0 && <span>Assunzioni: {datum.derivation.assumptions.join(" ")}</span>}
            </>
          )}
          {datum?.unavailable && (
            <>
              <strong>Motivo</strong>
              <span>{datum.unavailable.reason}</span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
