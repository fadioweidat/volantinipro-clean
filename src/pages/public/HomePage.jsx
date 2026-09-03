import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
import KpiTooltip from "../../components/ui/KpiTooltip.jsx";
import { Step1Icon } from "../../components/Step1Icon.jsx";
import TrustBar from "../../components/home/TrustBar.jsx";
import ServicesSection from "../../components/home/ServicesSection.jsx";
import FeatureZonaMappa from "../../components/home/FeatureZonaMappa.jsx";
import FeatureSmartPairing from "../../components/home/FeatureSmartPairing.jsx";
import RisultatiSection from "../../components/home/RisultatiSection.jsx";
import EnterpriseSection from "../../components/home/EnterpriseSection.jsx";
import FAQSection from "../../components/home/FAQSection.jsx";
import PricingSection from "../../components/home/PricingSection.jsx";
import Footer from "../../components/home/Footer.jsx";
import VolantiniProHeroMap from "../../components/home/VolantiniProHeroMap.jsx";
import WhyDifferentSection from "../../components/home/WhyDifferentSection.jsx";
import DashboardClienteSection from "../../components/home/DashboardClienteSection.jsx";
import TrackingLiveSection from "../../components/home/TrackingLiveSection.jsx";
import CosaRiceviSection from "../../components/home/CosaRiceviSection.jsx";
import TecnologiaSection from "../../components/home/TecnologiaSection.jsx";
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
    }), _jsx(WhyDifferentSection, {}), _jsx("section", {
      ref: kpiBandRef,
      className: "section-tight",
      style: {
        display: "none",
        background: C.navy,
        paddingLeft: 28,
        paddingRight: 28,
        borderTop: `3px solid ${C.orange}`,
        opacity: kpiBandVisible ? 1 : 0,
        transform: kpiBandVisible ? "none" : "translateY(22px)",
        transition: "opacity .5s ease, transform .7s cubic-bezier(.2,.8,.2,1)",
        willChange: "transform, opacity"
      },
      children: _jsx("div", {
        style: {
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 2
        },
        children: x.map(({
          value: D,
          l: W,
          src: A,
          term: TM
        }, F) => _jsxs("div", {
          style: {
            padding: "34px 26px",
            borderLeft: F > 0 ? "1px solid rgba(255,255,255,.07)" : "none"
          },
          children: [_jsx("div", {
            style: {
              width: 26,
              height: 3,
              background: C.orange,
              borderRadius: 2,
              marginBottom: 16
            }
          }), _jsx("div", {
            style: {
              fontFamily: F.serif,
              fontSize: typeof D == "string" && D.length > 8 ? 34 : 50,
              color: C.white,
              letterSpacing: "-1.4px",
              lineHeight: 1,
              marginBottom: 10,
              fontVariantNumeric: "tabular-nums"
            },
            children: D
          }), _jsxs("div", {
            style: {
              display: "flex",
              alignItems: "center",
              fontFamily: F.sans,
              fontSize: 13,
              color: "rgba(255,255,255,.8)",
              lineHeight: 1.4,
              marginBottom: 8
            },
            children: [W, _jsx(KpiTooltip, {
              term: TM || D
            })]
          }), _jsx("div", {
            style: {
              display: "inline-flex",
              padding: "3px 7px",
              borderRadius: 4,
              background: "rgba(232,87,26,.12)",
              fontFamily: F.sans,
              fontSize: 9,
              color: C.orange
            },
            children: A
          })]
        }, W))
      })
    }), _jsx("section", {
      id: "come-funziona",
      className: "section",
      style: {
        background: C.cream,
        paddingLeft: 28,
        paddingRight: 28,
        scrollMarginTop: 80
      },
      children: _jsxs("div", {
        style: {
          maxWidth: 1200,
          margin: "0 auto"
        },
        children: [_jsxs("div", {
          style: {
            marginBottom: 64
          },
          children: [_jsx("div", {
            style: {
              fontFamily: F.sans,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".15em",
              textTransform: "uppercase",
              color: C.orange,
              marginBottom: 12
            },
            children: "Dall'idea al volantino in mano"
          }), _jsxs("h2", {
            style: {
              fontFamily: F.serif,
              fontSize: 48,
              color: C.navy,
              letterSpacing: "-1.5px",
              marginBottom: 14,
              lineHeight: 1.06
            },
            children: ["Dall'idea alla campagna", _jsx("br", {}), "in 4 step misurabili."]
          }), _jsx("p", {
            style: {
              fontFamily: F.sans,
              fontSize: 16,
              color: C.muted,
              maxWidth: 520,
              lineHeight: 1.65
            },
            children: "Un flusso unico per definire servizio, zona, date operative e preventivo finale."
          })]
        }), _jsx("div", {
          className: "steps-grid",
          style: {
            display: "grid",
            gap: 16
          },
          children: T.map(({
            n: D,
            t: W,
            d: A,
            b: badge,
            c: B
          }, P) => _jsxs("div", {
            className: "vc",
            style: {
              padding: "24px 20px",
              background: C.white,
              borderRadius: 16,
              border: "1px solid rgba(0,0,0,.1)",
              boxShadow: "0 12px 32px rgba(0,0,0,.06)",
              position: "relative",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              height: "100%"
            },
            children: [_jsx("div", {
              style: {
                position: "absolute",
                top: 0,
                right: 12,
                fontFamily: F.sans,
                fontWeight: 900,
                fontSize: 64,
                color: "#F4F6F8",
                lineHeight: 1,
                userSelect: "none"
              },
              children: D
            }), _jsx("div", {
              style: {
                width: 24,
                height: 3,
                borderRadius: 2,
                background: B,
                marginBottom: 16
              }
            }), _jsx("h3", {
              style: {
                fontFamily: F.serif,
                fontSize: 20,
                color: C.navy,
                marginBottom: 10,
                letterSpacing: "-.3px"
              },
              children: W
            }), _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 13,
                color: C.muted,
                lineHeight: 1.5,
                marginBottom: 16,
                flex: 1
              },
              children: A
            }), _jsx("div", {
              style: {
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: 6,
                background: `${B}12`,
                fontFamily: F.sans,
                fontSize: 10,
                fontWeight: 800,
                color: B,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                alignSelf: "flex-start"
              },
              children: badge
            })]
          }, D))
        }), _jsx("div", {
          style: {
            textAlign: "center",
            marginTop: 56
          },
          children: _jsx("button", {
            className: "vb",
            onClick: () => n("preventivo"),
            style: {
              padding: "14px 34px",
              borderRadius: 8,
              border: "none",
              background: "linear-gradient(135deg,#E8571A 0%,#D0450B 100%)",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(232,87,26,0.28)"
            },
            children: "Configura la tua campagna →"
          })
        })]
      })
    }), _jsx(DashboardClienteSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(TrackingLiveSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(ServicesSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(CosaRiceviSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(PricingSection, {
      onConfigure: () => n("preventivo"),
      onConsultant: () => n("consultant")
    }), _jsx(TecnologiaSection, {
      onConfigure: () => n("preventivo")
    }), _jsx(EnterpriseSection, {}), _jsx(RisultatiSection, {}), _jsx(FAQSection, {
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

