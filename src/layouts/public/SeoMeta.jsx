import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function SeoMeta({
  page
}) {
  useEffect(() => {
    const metaByPage = {
      home: ["VolantiniPro | Volantinaggio misurabile con GPS e report", "Configura campagne Door to Door, Hand to Hand e Business Distribution con analisi zona, Smart Pairing, GPS e PDF report."],
      login: ["Login cliente | VolantiniPro", "Accedi alla dashboard VolantiniPro con magic link sicuro via email."],
      dashboard: ["Dashboard cliente | VolantiniPro", "Monitora campagne, tracking GPS, Smart Pairing e report finali."],
      campaign: ["Dashboard campagna | VolantiniPro", "Stato campagna, percorso GPS, statistiche di distribuzione, proof foto e report PDF."],
      privacy: ["Privacy Policy | VolantiniPro", "Informativa privacy per clienti e utenti VolantiniPro."],
      terms: ["Termini e condizioni | VolantiniPro", "Condizioni d'uso del servizio VolantiniPro."],
      cookie: ["Cookie Policy | VolantiniPro", "Informazioni sui cookie tecnici, analytics e preferenze del sito VolantiniPro."]
    };
    const [title, description] = metaByPage[page] || metaByPage.home;
    document.title = title;
    const setMeta = (selector, attr, value) => {
      let el = document.head.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const match = selector.match(/\[(name|property)="([^"]+)"\]/);
        if (match) el.setAttribute(match[1], match[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:type"]', "content", "website");
    setMeta('meta[property="og:url"]', "content", window.location.href);
  }, [page]);
  return null;
}
