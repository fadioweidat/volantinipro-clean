import React, { useState } from "react";
import { C, F } from "../../../../lib/constants.js";

// Ricerca NIL unica di Step 2 (sopra la mappa). SOLO presentazionale: i
// risultati arrivano da Step2.jsx, calcolati sul dataset NIL canonico completo
// di Milano (mai sulle zone selezionate/visibili). Aggiungi/Rimuovi usano
// l'unico stato `selected` (toggleNilZone); cliccare un risultato inquadra la
// mappa senza cambiare la selezione.

const box = {
  background: "rgba(255,255,255,.035)",
  border: "1px solid rgba(255,255,255,.10)",
  borderRadius: 12,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontFamily: F.sans,
  boxSizing: "border-box",
  minWidth: 0,
  position: "relative",
};

const btn = (danger) => ({
  padding: "5px 11px",
  borderRadius: 999,
  border: `1px solid ${danger ? "#EF4444" : "rgba(255,255,255,.25)"}`,
  background: danger ? "rgba(239,68,68,.16)" : "rgba(255,255,255,.06)",
  color: danger ? "#FCA5A5" : C.white,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: F.sans,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
});

export function MilanoNilSearch({
  query = "",
  onQueryChange = () => {},
  results = [],
  poolStatus = "ready", // "loading" | "error" | "ready"
  poolSize = 0,
  onRetry = null,
  onToggle = null,
  onFocusResult = null,
  contextLabel = "Milano",
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const ready = poolStatus === "ready";

  const pick = (result) => {
    if (!result) return;
    onQueryChange(result.name);
    if (onFocusResult) onFocusResult(result);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e) => {
    if (!open || results.length === 0) {
      if (e.key === "ArrowDown" && query) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active] || results[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="vp-step2-nil-search" style={box}>
      <label htmlFor="vp-milano-nil-search" style={{ fontSize: 13, fontWeight: 800, color: C.white }}>
        Aggiungi un quartiere / zona
      </label>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>
        Cerca un quartiere di Milano e aggiungilo alla distribuzione.
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          id="vp-milano-nil-search"
          type="text"
          role="combobox"
          aria-expanded={open && Boolean(query) && ready}
          aria-controls="vp-milano-nil-search-results"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && results[active] ? `vp-nil-search-option-${results[active].id}` : undefined}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(Boolean(e.target.value));
            setActive(-1);
          }}
          onFocus={() => setOpen(Boolean(query))}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Cerca quartiere di Milano, es. Comasina"
          autoComplete="off"
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            padding: "9px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,.18)",
            background: "rgba(0,0,0,.25)",
            color: C.white,
            fontSize: 16, // >=16px: niente zoom automatico su iOS
            fontFamily: F.sans,
          }}
        />
        {query ? (
          <button type="button" onClick={() => { onQueryChange(""); setOpen(false); setActive(-1); }} style={btn(false)}>
            Pulisci
          </button>
        ) : null}
      </div>

      {poolStatus === "loading" && query ? (
        <div role="status" style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>Caricamento quartieri...</div>
      ) : null}
      {poolStatus === "error" ? (
        <div role="alert" style={{ fontSize: 11, color: "#FCA5A5", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Impossibile caricare i quartieri di Milano</span>
          {onRetry ? <button type="button" onClick={onRetry} style={btn(false)}>Riprova</button> : null}
        </div>
      ) : null}
      {ready && query ? (
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.5)" }}>
          {results.length} {results.length === 1 ? "risultato" : "risultati"}
          {poolSize ? ` su ${poolSize} zone di Milano` : ""}
        </div>
      ) : null}

      {ready && open && query ? (
        <div
          id="vp-milano-nil-search-results"
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 12,
            right: 12,
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            background: "#14181f",
            border: "1px solid rgba(255,255,255,.14)",
            borderRadius: 10,
            boxShadow: "0 12px 28px rgba(0,0,0,.45)",
            zIndex: 1200, // sopra i pannelli di Leaflet (z-index fino a 1000)
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 11.5, color: "rgba(255,255,255,.5)", fontFamily: F.sans }}>
              Nessuna zona trovata
            </div>
          ) : (
            results.map((result, idx) => (
              <div
                key={result.id}
                id={`vp-nil-search-option-${result.id}`}
                role="option"
                aria-selected={idx === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(result)}
                onMouseEnter={() => setActive(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: idx === active ? "rgba(232,87,26,.14)" : result.isSelected ? "rgba(34,197,94,.08)" : "transparent",
                  borderBottom: idx < results.length - 1 ? "1px solid rgba(255,255,255,.06)" : "none",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.white, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {result.name}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)" }}>
                    NIL · {contextLabel}{result.isSelected ? " · selezionato" : ""}
                  </div>
                </div>
                {onToggle ? (
                  <button
                    type="button"
                    data-nil-toggle={result.isSelected ? "remove" : "add"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(result.id);
                      if (onFocusResult) onFocusResult(result);
                    }}
                    style={btn(Boolean(result.isSelected))}
                  >
                    {result.isSelected ? "Rimuovi" : "Aggiungi"}
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default MilanoNilSearch;
