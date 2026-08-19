import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export // Section
function StepperBar({
  current,
  onGo
}) {
  const steps = ["Tipo campagna", "Zona & Mappa", "Smart Pairing", "Preventivo"];
  const ids = ["step1", "step2", "step3", "step4"];
  const idx = ids.indexOf(current);
  // Mobile 395px (e sotto): "flex: 1" sugli item + whiteSpace: nowrap sulle
  // label facevano traboccare "Smart Pairing"/"Preventivo" ben oltre il
  // viewport invece di andare a capo o restringersi (i figli flex non si
  // restringono mai sotto la dimensione del proprio contenuto) — tagliati
  // silenziosamente dall'overflow della pagina, non scrollabili. Su mobile
  // la fila diventa scrollabile orizzontalmente SOLO dentro la barra dello
  // stepper (overflow-x:auto), item a larghezza naturale (flexShrink:0),
  // connettori a larghezza fissa — mai l'intera pagina che scrolla.
  // Su desktop il layout resta ESATTAMENTE quello di prima (flex:1 su item
  // e connettori, nessun overflow-x): stesso identico markup/valori.
  const isMobile = useIsMobile(760);
  return <div style={{
    background: "rgba(10,18,34,.98)",
    borderBottom: "1px solid rgba(255,255,255,.07)",
    padding: "0 28px",
    maxWidth: "100%",
    boxSizing: "border-box"
  }}>
      <div style={isMobile ? {
      maxWidth: 1100,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      height: 60,
      overflowX: "auto",
      WebkitOverflowScrolling: "touch",
      minWidth: 0
    } : {
      maxWidth: 1100,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      height: 60
    }}>
        {steps.map((s, i) => {
        const done = i < idx,
          active = i === idx;
        return <div key={s} style={{
          display: "flex",
          alignItems: "center",
          flex: isMobile ? "none" : 1,
          flexShrink: isMobile ? 0 : undefined
        }}>
              <div onClick={() => done && onGo(ids[i])} style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            cursor: done ? "pointer" : "default",
            opacity: done || active ? 1 : .36
          }}>
                <div style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: done ? C.green : active ? "#6366F1" : "rgba(255,255,255,.1)",
              border: active ? `2px solid #6366F1` : "none",
              flexShrink: 0
            }}>
                  {done ? <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 5.5l2.5 2.5 4-4.5" stroke="white" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg> : <span style={{
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 700,
                color: C.white
              }}>{i + 1}</span>}
                </div>
                <span style={{
              fontFamily: F.sans,
              fontSize: 14,
              fontWeight: active ? 800 : 600,
              color: active ? C.white : "rgba(255,255,255,.7)",
              whiteSpace: "nowrap"
            }}>{s}</span>
              </div>
              {i < 3 && <div style={isMobile ? {
            width: 32,
            flexShrink: 0,
            height: 1,
            background: "rgba(255,255,255,.07)",
            margin: "0 14px"
          } : {
            flex: 1,
            height: 1,
            background: "rgba(255,255,255,.07)",
            margin: "0 14px"
          }} />}
            </div>;
      })}
      </div>
    </div>;
}

// Section
// HOME PAGE
// Section
