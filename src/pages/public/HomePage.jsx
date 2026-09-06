import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
import KpiTooltip from "../../components/ui/KpiTooltip.jsx";
import { Step1Icon } from "../../components/Step1Icon.jsx";
import TrustBar from "../../components/home/TrustBar.jsx";
import ServicesSection from "../../components/home/ServicesSection.jsx";
import EnterpriseSection from "../../components/home/EnterpriseSection.jsx";
import FAQSection from "../../components/home/FAQSection.jsx";
import Footer from "../../components/home/Footer.jsx";
import VolantiniProHeroMap from "../../components/home/VolantiniProHeroMap.jsx";
import WhyDifferentSection from "../../components/home/WhyDifferentSection.jsx";
import HowItWorksSection from "../../components/home/HowItWorksSection.jsx";
import GpsLiveSection from "../../components/home/GpsLiveSection.jsx";
import SmartPairingSection from "../../components/home/SmartPairingSection.jsx";
import DashboardClienteSection from "../../components/home/DashboardClienteSection.jsx";
import FinalCtaSection from "../../components/home/FinalCtaSection.jsx";
import ContattiSection from "../../components/home/ContattiSection.jsx";

export function HomePage({
  onStart: n
}) {
  const i = () => document.getElementById("come-funziona")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    }),
    [r, l] = useState(!1),
    [u, h] = useState({
      city: "",
      qty: "5000",
      service: "Door to Door"
    }),
    f = Math.max(180, Math.round((Number(u.qty) || 0) * (u.service === "Door to Door" ? .13 : u.service === "Hand to Hand" ? .18 : .22))),
    m = [{
      t: "Piattaforma",
      items: [["Configuratore", "step1"], ["Preventivo rapido", "quick"], ["Come funziona", "home"], ["Tracking GPS", "campaign"]]
    }, {
      t: "Servizi",
      items: [["Door to Door", "step1"], ["Hand to Hand", "step1"], ["Business Distribution", "step1"], ["Report campagna", "campaign"]]
    }, {
      t: "Risorse",
      items: [["Servizi", "home"], ["Supporto", "consultant"], ["Privacy", "privacy"], ["Termini", "terms"], ["Cookie", "cookie"]]
    }];
  useEffect(() => {
    const D = () => l(window.innerWidth < 760);
    return D(), window.addEventListener("resize", D), () => window.removeEventListener("resize", D);
  }, []);
  const [kpiBandVisible, setKpiBandVisible] = useState(!0),
    kpiBandRef = useRef(null);
  useEffect(() => {
    const D = kpiBandRef.current;
    if (!D) return;
    const W = new IntersectionObserver(([A]) => {
      A.isIntersecting && (setKpiBandVisible(!0), W.disconnect());
    }, {
      threshold: .25
    });
    return W.observe(D), () => W.disconnect();
  }, []);
  const x = [{
      value: "Famiglie",
      l: "Abitazioni stimate",
      src: "Fonti territoriali",
      term: "Famiglie"
    }, {
      value: "Zone",
      l: "Aree coperte",
      src: "Mappa e raggio",
      term: "Zone"
    }, {
      value: "GPS",
      l: "Monitoraggio stradale",
      src: "Verifica campo",
      term: "GPS"
    }, {
      value: "Report",
      l: "Documento finale",
      src: "Output verificabile",
      term: "Report PDF"
    }],
    w = ["Dati ISTAT ufficiali", "GPS certificato", "No vincoli mensili"],
    j = ["Retail locale", "Food locale", "Casa e servizi", "Fitness locale", "Attività locale"],
    T = [{
      n: "01",
      t: "Configura",
      d: "Servizio, comune, quantità e formato.",
      b: "Servizio + quantità",
      c: "#E8571A"
    }, {
      n: "02",
      t: "Analizza il territorio",
      d: "Copertura, famiglie, zone, mappa e dati reali.",
      b: "Analisi territoriale",
      c: "#E8571A"
    }, {
      n: "03",
      t: "Personalizza",
      d: "Piano, servizi ed extra.",
      b: "Piano + extra",
      c: "#E8571A"
    }, {
      n: "04",
      t: "Preventivo e conferma",
      d: "Prezzo finale, PDF e avvio campagna.",
      b: "Riepilogo + prezzo",
      c: "#E8571A"
    }],
    z = [{
      name: "Door to Door",
      icon: "D2D",
      desc: "Distribuzione nelle cassette postali di condomini, palazzi, villette e zone residenziali.",
      features: ["attività locali", "promozioni zona", "grande copertura territoriale"],
      c: C.orange
    }, {
      name: "Hand to Hand",
      icon: "H2H",
      desc: "Distribuzione a mano in punti ad alto passaggio.",
      features: ["POI rilevanti", "Fermate metro/bus/treno", "Scuole, università, eventi", "Flusso potenziale", "Smart Pairing"],
      c: C.orange
    }, {
      name: "Business Distribution",
      icon: "B2B",
      desc: "Distribuzione mirata ad attività commerciali, uffici e zone business.",
      features: ["B2B", "fornitori", "servizi professionali", "attività locali"],
      c: C.orange
    }],
    R = [{
      n: "01",
      t: "Preventivo Guidato",
      d: "Analisi completa e configurazione step-by-step.",
      benefits: ["Analisi ISTAT zona", "Mappa e copertura", "GPS e report verificabili", "Smart Pairing opzionale"],
      cta: "Preventivo Guidato",
      c: C.orange,
      fn: () => n("step1")
    }, {
      n: "02",
      t: "Preventivo Rapido",
      d: "Configurazione base e stima costi immediata.",
      benefits: ["3 campi essenziali", "Prezzo personalizzato", "Nessun account richiesto"],
      cta: "Preventivo Rapido",
      c: C.orange,
      fn: () => n("step1", {
        quickMode: true
      }),
      quick: !1
    }, {
      n: "03",
      t: "Parla con un Consulente",
      d: "Preferisci supporto diretto? Invia una richiesta e ti ricontattiamo.",
      benefits: ["Brief gratuito", "Scelta servizio guidata", "Richiamo operativo", "Tempo: immediato"],
      cta: "Parla con un Consulente",
      c: C.orange,
      fn: () => n("consultant")
    }];
  return _jsxs("div", {
    className: "home-shell-dark saas-home-refinement",
    style: {
      background: "#0B1020",
      paddingBottom: 0,
      minHeight: "100vh"
    },
    children: [_jsx("style", {
      children: `
  .home-shell-dark { background-color: #0B1020 !important; color: #F8FAFC !important; }
  .home-shell-dark section, .home-shell-dark article { background: transparent !important; }
  .home-shell-dark section[style*="cream"], .home-shell-dark div[style*="cream"] { background: #111827 !important; border-top: 1px solid rgba(148, 163, 184, 0.18) !important; color: #F8FAFC !important; }
  .home-shell-dark .vc { background: #182235 !important; border: 1px solid rgba(148, 163, 184, 0.18) !important; color: #F8FAFC !important; box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important; border-radius: 18px !important; }
  .home-shell-dark .vb, .home-shell-dark button[style*="E8571A"], .home-shell-dark button[style*="orange"] { background: #E8571A !important; color: #FFFFFF !important; border: none !important; box-shadow: 0 8px 24px rgba(232, 87, 26, 0.35) !important; text-shadow: none !important; }
  .home-shell-dark .why-diff-card { background: #182235 !important; border: 1px solid rgba(148, 163, 184, 0.18) !important; }
  .home-shell-dark .why-diff-card:hover { background: #22304A !important; border-color: #E8571A !important; transform: translateY(-4px); }
  .home-shell-dark .why-diff-title, .home-shell-dark h1, .home-shell-dark h2, .home-shell-dark h3 { color: #F8FAFC !important; }
  .home-shell-dark .why-diff-kicker { color: #E8571A !important; letter-spacing: 0.15em !important; }
  .home-shell-dark .why-diff-icon-badge { background: rgba(232, 87, 26, 0.12) !important; color: #E8571A !important; border: 1px solid rgba(232, 87, 26, 0.25) !important; }
  .home-shell-dark [style*="rgba(255,255,255,.08)"], .home-shell-dark [style*="rgba(255,255,255,.06)"], .home-shell-dark [style*="rgba(255,255,255,.04)"] { background: #182235 !important; border-color: rgba(148, 163, 184, 0.18) !important; color: #F8FAFC !important; }
  .home-shell-dark span[style*="orange"], .home-shell-dark div[style*="orange"], .home-shell-dark [style*="E8571A"] { color: #E8571A !important; }
  .home-shell-dark .vp-start-secondary { background: #182235 !important; border-color: rgba(148, 163, 184, 0.18) !important; color: #F8FAFC !important; }
  .home-shell-dark .vp-start-secondary:hover { border-color: rgba(232, 87, 26, 0.4) !important; }
  .home-shell-dark .vp-start-secondary h3, .home-shell-dark .vp-start-secondary p { color: #CBD5E1 !important; }
  .home-shell-dark .vp-start-primary { background: #0f1a2e !important; }
  @media (min-width: 1025px) { .home-shell-dark .steps-grid { grid-template-columns: repeat(4, 1fr) !important; gap: 16px !important; } }
  @media (max-width: 1024px) and (min-width: 641px) { .home-shell-dark .steps-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 16px !important; } }
  @media (max-width: 640px) { .home-shell-dark .steps-grid { grid-template-columns: 1fr !important; gap: 16px !important; } }
  .home-shell-dark .section { padding-top: 52px !important; padding-bottom: 52px !important; }
  .home-shell-dark .section-tight { padding-top: 36px !important; padding-bottom: 36px !important; }
  .home-shell-dark .vp-home-hero-nav { box-sizing: border-box; }
  .home-shell-dark .vp-home-hero-title,
  .home-shell-dark .vp-home-hero-copy,
  .home-shell-dark .servizio-card,
  .home-shell-dark .servizio-card * { overflow-wrap: normal; word-break: normal; hyphens: none; }
  @media (max-width: 900px) {
    .home-shell-dark .section { padding-top: 38px !important; padding-bottom: 38px !important; }
    .home-shell-dark .section-tight { padding-top: 28px !important; padding-bottom: 28px !important; }
    .home-shell-dark .vp-home-hero-nav { padding: 0 !important; border-radius: 0 !important; background: transparent !important; border-bottom: 0 !important; box-shadow: none !important; }
    .home-shell-dark .vp-home-hero-content,
    .home-shell-dark .vp-home-hero-copy-block { min-width: 0; width: 100%; }
    .home-shell-dark .vp-home-hero-title { font-size: clamp(2.35rem, 10.5vw, 3.35rem) !important; line-height: 1.02 !important; letter-spacing: -0.035em !important; max-width: 100% !important; margin-bottom: 16px !important; }
    .home-shell-dark .vp-home-hero-copy { font-size: 1rem !important; line-height: 1.55 !important; margin: 16px 0 22px !important; }
    .home-shell-dark .vp-home-hero-summary { max-width: calc(100% - 24px) !important; }
  }
  @media (max-width: 1120px) {
    /* Su tablet le KPI card flottanti si sovrapponevano al titolo dell'hero
       (griglia full-width, top:64). I numeri chiave restano nella summary card
       in basso. */
    .home-shell-dark .vp-home-hero-kpis { display: none !important; }
  }
  @media (max-width: 600px) {
    .home-shell-dark .vp-home-hero-header-cta,
    .home-shell-dark .vp-home-hero-kpis { display: none !important; }
    .home-shell-dark .vp-home-hero-shade { background: linear-gradient(to bottom, #07101f 0%, rgba(7,16,31,.94) 18%, rgba(7,16,31,.76) 58%, rgba(7,16,31,.28) 78%, #07101f 100%) !important; }
    .home-shell-dark .vp-home-hero-nav-actions { gap: 8px !important; }
    .home-shell-dark .vp-home-hero-break { display: none; }
    .home-shell-dark .vp-home-hero-actions { display: grid !important; grid-template-columns: 1fr !important; width: 100%; gap: 10px !important; }
    .home-shell-dark .vp-home-hero-actions > *,
    .home-shell-dark .vp-home-hero-actions button { width: 100%; }
    .home-shell-dark .vp-home-hero-chips { gap: 6px !important; }
    .home-shell-dark .vp-home-hero-spacer { height: 430px !important; }
    .home-shell-dark .vp-home-hero-summary { padding: 16px !important; gap: 16px !important; }
    .home-shell-dark .servizio-card { min-height: 0 !important; padding: 24px 20px !important; }
    .home-shell-dark #chi-siamo { padding-top: 44px !important; padding-bottom: 44px !important; }
    .home-shell-dark .why-diff-header { margin-bottom: 28px !important; }
    .home-shell-dark .why-diff-card { min-height: 0 !important; padding: 24px 20px !important; gap: 16px !important; }
    .home-shell-dark .faq-row button { min-height: 64px !important; padding: 18px 4px !important; }
  }
`
    }), _jsx(VolantiniProHeroMap, {
      onConfigure: () => n("preventivo"),
      onQuote: () => n("preventivo"),
      onLogin: () => n("login"),
      onAdmin: () => n("admin"),
      onHowItWorks: i
    }), _jsx(TrustBar, {
      metrics: [{
        value: "ISTAT",
        label: "Dati territoriali"
      }, {
        value: "GIS",
        label: "Analisi zona"
      }, {
        value: "GPS",
        label: "Tracking operativo"
      }, {
        value: "PDF",
        label: "Report verificabili"
      }]
    }), _jsx(WhyDifferentSection, {}), _jsx(HowItWorksSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(ServicesSection, {
      onConfigure: () => n("preventivo"),
      onServiceLink: (pageKey) => n(pageKey)
    }), _jsx(GpsLiveSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(SmartPairingSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(DashboardClienteSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(EnterpriseSection, {}), _jsx(FAQSection, {
      onContact: () => n("consultant")
    }), _jsx(ContattiSection, {}), _jsx(FinalCtaSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(Footer, {
      onNav: n,
      onHowItWorks: i
    })]
  });
}

// JSX runtime shim for reconstructed bundle code

