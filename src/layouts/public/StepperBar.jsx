import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export // Section
function StepperBar({
  current,
  onGo
}) {
  const steps = ["Tipo campagna", "Zona & Mappa", "Smart Pairing", "Preventivo"];
  const ids = ["step1", "step2", "step3", "step4"];
  const idx = ids.indexOf(current);
  return <div style={{
    background: "rgba(10,18,34,.98)",
    borderBottom: "1px solid rgba(255,255,255,.07)",
    padding: "0 28px"
  }}>
      <div style={{
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
          flex: 1
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
              {i < 3 && <div style={{
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
