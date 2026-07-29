import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function Bootstrap() {
  useEffect(() => {
    if (!document.getElementById("vp-f")) {
      const l = document.createElement("link");
      l.id = "vp-f";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap";
      document.head.appendChild(l);
    }
    if (!document.getElementById("vp-css")) {
      const s = document.createElement("style");
      s.id = "vp-css";
      s.textContent = `html,body{overflow-x:hidden}*{box-sizing:border-box;margin:0;padding:0}
      @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
      @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}.fu{animation:fadeUp.5s ease both}.fu1{animation:fadeUp.5s.1s ease both}.fu2{animation:fadeUp.5s.2s ease both}.fu3{animation:fadeUp.5s.3s ease both}.fadein{animation:fadeIn.35s ease both}.vb:hover{filter:brightness(1.1);transform:translateY(-2px);box-shadow:0 8px 24px rgba(232,87,26,0.35)!important}.vb{transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1)}.btn:hover{filter:brightness(1.09);transform:translateY(-1px)}.btn{transition:all.18s}.vc:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(0,0,0,.13)}.vc{transition:all.22s}.nl:hover{color:#fff!important}.nl{transition:color.2s}.rh:hover{background:rgba(255,255,255,.06)!important}
      .vp-navbtn:hover{background:linear-gradient(180deg,rgba(24,42,70,.86),rgba(10,23,40,.84))!important;border-color:rgba(255,255,255,.30)!important;color:#fff!important;box-shadow:0 14px 30px rgba(0,0,0,.24),0 0 0 3px rgba(96,165,250,.12)!important;transform:translateY(-1px)}.vp-navbtn:active{transform:translateY(0)}.vp-navbtn:focus-visible{outline:2px solid rgba(96,165,250,.86);outline-offset:3px}
      .section{padding-top:128px;padding-bottom:128px}.section-tight{padding-top:64px;padding-bottom:64px}.section-inner-gap{display:flex;flex-direction:column;gap:48px}.trust-bar-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:32px}.trust-bar-logos{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:24px;align-items:center}.trust-bar-logos img{max-width:100%;max-height:42px;filter:grayscale(1);opacity:.6;transition:filter .18s ease,opacity .18s ease}.trust-bar-logos img:hover{filter:grayscale(0);opacity:1}.services-grid,.results-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.servizio-card{min-height:520px;display:flex;flex-direction:column;background:#242424;border-radius:16px;padding:32px 28px;border:.5px solid rgba(255,255,255,.08);transition:border-color .3s ease,transform .3s ease}.servizio-card:hover{border-color:rgba(232,87,26,.4);transform:translateY(-2px)}.faq-layout{display:grid;grid-template-columns:minmax(260px,.75fr) 1.25fr;gap:72px;align-items:start}.faq-sticky{position:sticky;top:96px}.faq-row{border-bottom:.5px solid rgba(0,0,0,.1);transition:background .3s ease}.faq-row:hover{background:rgba(232,87,26,.04)}.testimonial-card{min-height:430px;display:flex;flex-direction:column;background:#242424;border-radius:16px;padding:40px 32px;border:.5px solid rgba(255,255,255,.08)}.footer-grid{display:grid;grid-template-columns:1.35fr repeat(3,1fr);gap:56px}.footer-bottom{margin-top:64px;padding-top:24px;border-top:.5px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:space-between;gap:20px;color:rgba(255,255,255,.45);font-size:12px;font-family:"DM Sans",Inter,system-ui,sans-serif}
      input:focus,select:focus{outline:none!important}
      select option{background:#162238;color:white}
      @media(max-width:980px){.services-grid,.results-grid{grid-template-columns:1fr}.faq-layout{grid-template-columns:1fr;gap:44px}.faq-sticky{position:static}.footer-grid{grid-template-columns:repeat(2,1fr);gap:42px 32px}.smart-pairing-layout{grid-template-columns:1fr!important;gap:42px!important}.steps-grid{grid-template-columns:1fr!important}}@media(max-width:768px){.section{padding-top:64px!important;padding-bottom:64px!important;padding-left:20px!important;padding-right:20px!important}.section-tight{padding-top:48px!important;padding-bottom:48px!important;padding-left:20px!important;padding-right:20px!important}.trust-bar-metrics{grid-template-columns:repeat(2,1fr)}.trust-bar-logos{grid-template-columns:repeat(2,minmax(0,1fr))}.landing-h2{font-size:28px!important;letter-spacing:-.02em!important}.footer-bottom{display:grid;justify-content:stretch}}@media(max-width:760px){button,input,select,textarea{min-height:44px}}`;
      document.head.appendChild(s);
    }
  }, []);
  return null;
}
