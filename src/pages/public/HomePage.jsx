import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
import TrustBar from "../../components/home/TrustBar.jsx";
import ServicesSection from "../../components/home/ServicesSection.jsx";
import FeatureZonaMappa from "../../components/home/FeatureZonaMappa.jsx";
import FeatureSmartPairing from "../../components/home/FeatureSmartPairing.jsx";
import RisultatiSection from "../../components/home/RisultatiSection.jsx";
import FAQSection from "../../components/home/FAQSection.jsx";
import PricingSection from "../../components/home/PricingSection.jsx";
import Footer from "../../components/home/Footer.jsx";
import VolantiniProHeroMap from "../../components/home/VolantiniProHeroMap.jsx";
import WhyDifferentSection from "../../components/home/WhyDifferentSection.jsx";

export function HomePage({
  onStart: n
}) {
  const i = () => document.getElementById("come-funziona")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    }),
    scrollOptions = () => document.getElementById("scegli-percorso")?.scrollIntoView({
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
      t: "Configura campagna",
      d: "Scegli servizio, quantità, formato, stampa e frequenza della distribuzione.",
      b: "Servizio + quantità",
      c: "#E8571A"
    }, {
      n: "02",
      t: "Zona e mappa",
      d: "Imposta comune e raggio, poi verifica famiglie ISTAT, comuni coinvolti, copertura e volantini consigliati.",
      b: "Analisi territoriale",
      c: "#E8571A"
    }, {
      n: "03",
      t: "Pianificazione",
      d: "Scegli il periodo desiderato. Smart Pairing resta opzionale quando esistono campagne compatibili.",
      b: "Date + opzioni",
      c: "#E8571A"
    }, {
      n: "04",
      t: "Preventivo completo",
      d: "Controlla il preventivo finale e avvia la campagna. Include tracking GPS live degli operatori e report finale con foto.",
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
`
    }), _jsx(VolantiniProHeroMap, {
      onConfigure: scrollOptions,
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
            gridTemplateColumns: "repeat(4,1fr)",
            gap: 12
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
              padding: "34px 28px",
              background: C.white,
              borderRadius: 16,
              border: "1px solid rgba(0,0,0,.1)",
              boxShadow: "0 12px 32px rgba(0,0,0,.06)",
              position: "relative",
              overflow: "hidden"
            },
            children: [_jsx("div", {
              style: {
                position: "absolute",
                top: -8,
                right: 12,
                fontFamily: F.sans,
                fontWeight: 900,
                fontSize: 94,
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
                marginBottom: 24
              }
            }), _jsx("h3", {
              style: {
                fontFamily: F.serif,
                fontSize: 22,
                color: C.navy,
                marginBottom: 12,
                letterSpacing: "-.3px"
              },
              children: W
            }), _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 14,
                color: C.muted,
                lineHeight: 1.6,
                marginBottom: 20
              },
              children: A
            }), _jsx("div", {
              style: {
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: 6,
                background: `${B}12`,
                fontFamily: F.sans,
                fontSize: 11,
                fontWeight: 700,
                color: B
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
            onClick: scrollOptions,
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
            children: "Calcola la tua copertura →"
          })
        })]
      })
    }), _jsx(ServicesSection, {
      onConfigure: scrollOptions
    }), _jsx(React.Suspense, {
      fallback: _jsx("div", {
        style: {
          minHeight: 200,
          background: "#0B1020"
        }
      }),
      children: _jsx(VolantiniProAIHub, {
        onConfigure: scrollOptions
      })
    }), _jsx(FeatureSmartPairing, {
      onConfigure: scrollOptions
    }), _jsx("section", {
      id: "scegli-percorso",
      className: "section",
      style: {
        background: "#0B1020",
        paddingLeft: 28,
        paddingRight: 28,
        borderTop: "1px solid rgba(255,255,255,.05)",
        scrollMarginTop: 80
      },
      children: _jsxs("div", {
        style: {
          maxWidth: 1200,
          margin: "0 auto"
        },
        children: [_jsxs("div", {
          style: {
            display: "flex",
            flexDirection: window.innerWidth < 900 ? "column" : "row",
            alignItems: window.innerWidth < 900 ? "flex-start" : "center",
            justifyContent: "space-between",
            marginBottom: 50,
            gap: 20
          },
          children: [_jsx("div", {
            children: _jsxs("h2", {
              style: {
                fontFamily: F.serif,
                fontSize: "clamp(40px, 5vw, 64px)",
                color: "#fff",
                letterSpacing: "-1.5px",
                lineHeight: 1.05,
                margin: 0
              },
              children: ["Richiedi un", _jsx("br", {}), "Preventivo"]
            })
          }), _jsx("div", {
            style: {
              maxWidth: 400
            },
            children: _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 18,
                color: "rgba(255,255,255,.6)",
                margin: 0,
                lineHeight: 1.5
              },
              children: "Scegli il percorso più adatto alle esigenze della tua campagna."
            })
          })]
        }), _jsxs("div", {
          style: {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 24
          },
          children: [_jsxs("div", {
            style: {
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            },
            children: [_jsxs("div", {
              style: {
                position: "absolute",
                top: 24,
                right: 24,
                background: `${C.green}26`,
                color: C.green,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: F.sans,
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: [_jsx(Step1Icon, {
                name: "star",
                size: 12
              }), " Consigliato"]
            }), _jsx("h3", {
              style: {
                fontFamily: F.serif,
                fontSize: 26,
                color: "#fff",
                margin: "0 0 16px 0"
              },
              children: "Preventivo Guidato"
            }), _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 15,
                color: "rgba(255,255,255,.65)",
                lineHeight: 1.6,
                margin: "0 0 32px 0"
              },
              children: "Configurazione completa in 4 Step con analisi territoriale, suggerimenti intelligenti e configurazione professionale."
            }), _jsxs("div", {
              style: {
                background: "#0B101E",
                borderRadius: 16,
                padding: 24,
                marginBottom: 32,
                flex: 1
              },
              children: [_jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 8
                },
                children: "IDEALE PER"
              }), _jsx("div", {
                style: {
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: 24
                },
                children: "Campagne complete e personalizzate"
              }), _jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 12
                },
                children: "INCLUDE"
              }), _jsx("ul", {
                style: {
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                },
                children: ["Analisi territoriale", "Quantità consigliata", "Copertura stimata", "Servizi extra", "Configurazione completa"].map(item => _jsxs("li", {
                  key: item,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: "rgba(255,255,255,.8)"
                  },
                  children: [_jsx("div", {
                    style: {
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: C.orange
                    }
                  }), " ", item]
                }))
              })]
            }), _jsxs("div", {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "auto"
              },
              children: [_jsxs("div", {
                children: [_jsx("div", {
                  style: {
                    fontSize: 10,
                    fontWeight: 800,
                    color: "rgba(255,255,255,.4)",
                    letterSpacing: "1px",
                    marginBottom: 4
                  },
                  children: "TEMPO MEDIO"
                }), _jsx("div", {
                  style: {
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff"
                  },
                  children: "3-5 minuti"
                })]
              }), _jsx("button", {
                onClick: () => n("step1"),
                style: {
                  background: C.orange,
                  color: "#fff",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(232,87,26,.3)"
                },
                children: "Inizia il percorso"
              })]
            })]
          }), _jsxs("div", {
            style: {
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            },
            children: [_jsxs("div", {
              style: {
                position: "absolute",
                top: 24,
                right: 24,
                background: `${C.orange}26`,
                color: C.orange,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: F.sans,
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: [_jsx(Step1Icon, {
                name: "lightning",
                size: 12
              }), " Più veloce"]
            }), _jsx("h3", {
              style: {
                fontFamily: F.serif,
                fontSize: 26,
                color: "#fff",
                margin: "0 0 16px 0"
              },
              children: "Preventivo Rapido"
            }), _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 15,
                color: "rgba(255,255,255,.65)",
                lineHeight: 1.6,
                margin: "0 0 32px 0"
              },
              children: "Ricevi una stima immediata inserendo solo le informazioni essenziali."
            }), _jsxs("div", {
              style: {
                background: "#0B101E",
                borderRadius: 16,
                padding: 24,
                marginBottom: 32,
                flex: 1
              },
              children: [_jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 8
                },
                children: "IDEALE PER"
              }), _jsx("div", {
                style: {
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: 24
                },
                children: "Chi conosce già servizio, zona e quantità."
              }), _jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 12
                },
                children: "INCLUDE"
              }), _jsx("ul", {
                style: {
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                },
                children: ["Prezzo stimato", "Tempo indicativo", "Preventivo immediato", "Fino a 3 comuni", "Servizi extra opzionali"].map(item => _jsxs("li", {
                  key: item,
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    color: "rgba(255,255,255,.8)"
                  },
                  children: [_jsx("div", {
                    style: {
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: C.orange
                    }
                  }), " ", item]
                }))
              })]
            }), _jsxs("div", {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "auto"
              },
              children: [_jsxs("div", {
                children: [_jsx("div", {
                  style: {
                    fontSize: 10,
                    fontWeight: 800,
                    color: "rgba(255,255,255,.4)",
                    letterSpacing: "1px",
                    marginBottom: 4
                  },
                  children: "TEMPO MEDIO"
                }), _jsx("div", {
                  style: {
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff"
                  },
                  children: "Meno di 1 minuto"
                })]
              }), _jsx("button", {
                onClick: () => n("quick"),
                style: {
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,.2)",
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer"
                },
                children: "Calcola subito"
              })]
            })]
          }), _jsxs("div", {
            style: {
              background: "#121B2A",
              borderRadius: 20,
              padding: 32,
              display: "flex",
              flexDirection: "column",
              border: "1px solid rgba(255,255,255,.06)",
              position: "relative"
            },
            children: [_jsxs("div", {
              style: {
                position: "absolute",
                top: 24,
                right: 24,
                background: `${C.blue}26`,
                color: C.blue,
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: F.sans,
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: [_jsx(Step1Icon, {
                name: "user",
                size: 12
              }), " Supporto dedicato"]
            }), _jsx("h3", {
              style: {
                fontFamily: F.serif,
                fontSize: 26,
                color: "#fff",
                margin: "0 0 16px 0"
              },
              children: "Consulenza Personalizzata"
            }), _jsx("p", {
              style: {
                fontFamily: F.sans,
                fontSize: 15,
                color: "rgba(255,255,255,.65)",
                lineHeight: 1.6,
                margin: "0 0 32px 0"
              },
              children: "Parla con un consulente VolantiniPro per costruire la soluzione migliore per la tua campagna."
            }), _jsxs("div", {
              style: {
                background: "#0B101E",
                borderRadius: 16,
                padding: 24,
                marginBottom: 32,
                flex: 1
              },
              children: [_jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 8
                },
                children: "IDEALE PER"
              }), _jsx("div", {
                style: {
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: 24
                },
                children: "Aziende, Franchising, Multi città, Campagne personalizzate"
              }), _jsx("div", {
                style: {
                  fontSize: 10,
                  fontWeight: 800,
                  color: "rgba(255,255,255,.4)",
                  letterSpacing: "1px",
                  marginBottom: 12
                },
                children: "INCLUDE"
              }), _jsx("ul", {
                style: {
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10
                },
                children: ["Preventivo su misura", "Analisi della richiesta", "Pianificazione campagna", "Supporto dedicato", "WhatsApp, Email, Telefono"].map(item => _jsxs("li", {
                  key: item,
                  style: {
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    fontSize: 14,
                    color: "rgba(255,255,255,.8)"
                  },
                  children: [_jsx("div", {
                    style: {
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: C.orange,
                      marginTop: 8
                    }
                  }), " ", item]
                }))
              })]
            }), _jsxs("div", {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "auto"
              },
              children: [_jsxs("div", {
                children: [_jsx("div", {
                  style: {
                    fontSize: 10,
                    fontWeight: 800,
                    color: "rgba(255,255,255,.4)",
                    letterSpacing: "1px",
                    marginBottom: 4
                  },
                  children: "TEMPO MEDIO"
                }), _jsx("div", {
                  style: {
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff"
                  },
                  children: "Ricontatto in breve"
                })]
              }), _jsxs("button", {
                onClick: () => n("consultant"),
                style: {
                  background: `${C.orange}14`,
                  color: "#fff",
                  border: `1.5px solid ${C.orange}`,
                  padding: "12px 24px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8
                },
                children: [_jsx(Step1Icon, {
                  name: "handshake",
                  size: 15
                }), "Parla con noi"]
              })]
            })]
          })]
        })]
      })
    }), _jsx(RisultatiSection, {}), _jsx(FAQSection, {
      onContact: () => n("consultant")
    }), _jsx(PricingSection, {
      onConfigure: scrollOptions,
      onConsultant: () => n("consultant")
    }), _jsx(Footer, {
      onNav: n,
      onHowItWorks: i
    })]
  });
}

// JSX runtime shim for reconstructed bundle code

