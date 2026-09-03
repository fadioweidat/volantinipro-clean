import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { Logo } from "../../components/common/Logo.jsx";

export function Navbar({
  onNav,
  page
}) {
  const [sc, setSc] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const isMobile = useIsMobile();
  useEffect(() => {
    const h = () => setSc(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  const dark = page !== "home";
  const navPosition = page === "home" ? "fixed" : "sticky";
  const go = target => {
    setMenuOpen(false);
    setPlatformOpen(false);
    setAccessOpen(false);
    if (target === "login") {
      try {
        localStorage.setItem("volantinipro_return_to", "dashboard");
        localStorage.setItem("volantinipro_return_to_source", "navbar_login");
        localStorage.removeItem("volantinipro_pending_campaign_id");
        console.info("[AUTH_RETURN_TO_SOURCE]", {
          source: "navbar_login",
          returnTo: "dashboard"
        });
      } catch {}
    }
    if (target === "step1") {
      // Navbar e' renderizzata solo fuori dal configuratore (mai durante
      // Step1-4): ogni link "Configuratore Campagna" qui e' un ingresso da
      // fuori del flusso, quindi deve avviare una campagna nuova, non
      // riproporre l'ultima configurazione salvata.
      onNav(target, null, { newCampaign: true });
      return;
    }
    onNav(target);
  };
  const scrollToSection = id => {
    setMenuOpen(false);
    setPlatformOpen(false);
    if (page !== "home") {
      onNav("home");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 150);
    } else {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  };
  return <nav aria-label="Navigazione principale" style={{
    position: navPosition,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    background: dark || sc ? "rgba(5, 10, 20, 0.92)" : "transparent",
    borderBottom: dark || sc ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
    transition: "background 0.3s ease, border-color 0.3s ease",
    backdropFilter: "blur(16px)"
  }}>
      <div style={{
      maxWidth: 1400,
      margin: "0 auto",
      padding: isMobile ? "0 16px" : "0 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 72
    }}>
        <button onClick={() => go("home")} aria-label="Torna alla Home di VolantiniPro" style={{
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "4px 0",
        minHeight: 44
      }}>
        <Logo dark={true} size={40} />
      </button>

        {!isMobile && <div style={{
        display: "flex",
        gap: 36,
        alignItems: "center",
        position: "relative"
      }}>
            <button onClick={() => scrollToSection("come-funziona")} style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.82)",
          fontFamily: F.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          padding: "8px 12px",
          minHeight: 44,
          transition: "color 0.2s ease"
        }}>
              Come funziona
            </button>
            <button onClick={() => scrollToSection("prezzi")} style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.82)",
          fontFamily: F.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          padding: "8px 12px",
          minHeight: 44,
          transition: "color 0.2s ease"
        }}>
              Prezzi
            </button>
            <div style={{
          position: "relative"
        }} onMouseEnter={() => setPlatformOpen(true)} onMouseLeave={() => setPlatformOpen(false)}>
              <button aria-expanded={platformOpen} aria-haspopup="true" onClick={() => setPlatformOpen(!platformOpen)} style={{
            background: "transparent",
            border: "none",
            color: "rgba(255, 255, 255, 0.82)",
            fontFamily: F.sans,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            padding: "8px 12px",
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "color 0.2s ease"
          }}>
                <span>Piattaforma</span>
                <span style={{
              fontSize: 10,
              color: "rgba(255, 255, 255, 0.5)",
              transform: platformOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s"
            }}>▾</span>
              </button>
              {platformOpen && <div style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 230,
            padding: 8,
            background: "rgba(10, 18, 34, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 210
          }}>
                  <button onClick={() => go("step1")} style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer"
            }}>
                    Configuratore Campagna
                  </button>
                  <button onClick={() => go("quick")} style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.8)",
              fontFamily: F.sans,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}>
                    Preventivo Rapido
                  </button>
                  <button onClick={() => go("consultant")} style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.8)",
              fontFamily: F.sans,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}>
                    Supporto Consulente
                  </button>
                </div>}
            </div>
            <button onClick={() => scrollToSection("chi-siamo")} style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.82)",
          fontFamily: F.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          padding: "8px 12px",
          minHeight: 44,
          transition: "color 0.2s ease"
        }}>
              Chi siamo
            </button>
            <button onClick={() => scrollToSection("contatti")} style={{
          background: "transparent",
          border: "none",
          color: "rgba(255, 255, 255, 0.82)",
          fontFamily: F.sans,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          padding: "8px 12px",
          minHeight: 44,
          transition: "color 0.2s ease"
        }}>
              Contatti
            </button>
          </div>}

        {!isMobile && <div style={{
        display: "flex",
        gap: 14,
        alignItems: "center"
      }}>
            {typeof window !== "undefined" && localStorage.getItem("vp_supabase_session") ? <button onClick={() => go("dashboard")} style={{
          minHeight: 44,
          padding: "0 20px",
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.16)",
          background: "rgba(255, 255, 255, 0.04)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 14.5,
          fontWeight: 700,
          cursor: "pointer",
          transition: "all 0.2s ease"
        }}>
                Dashboard Campagna
              </button> : <div style={{
          position: "relative"
        }} onMouseEnter={() => setAccessOpen(true)} onMouseLeave={() => setAccessOpen(false)}>
                <button aria-expanded={accessOpen} aria-haspopup="true" onClick={() => setAccessOpen(v => !v)} style={{
            minHeight: 44,
            padding: "0 20px",
            borderRadius: 8,
            border: "1px solid rgba(255, 255, 255, 0.16)",
            background: "rgba(255, 255, 255, 0.04)",
            color: C.white,
            fontFamily: F.sans,
            fontSize: 14.5,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "all 0.2s ease"
          }}>
                  <span>Accedi</span>
                  <span style={{
              fontSize: 10,
              color: "rgba(255, 255, 255, 0.5)",
              transform: accessOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.2s"
            }}>▾</span>
                </button>
                {accessOpen && <div style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 210,
            padding: 8,
            background: "rgba(10, 18, 34, 0.98)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.6)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            zIndex: 210
          }}>
                    <button onClick={() => go("login")} style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: C.white,
              fontFamily: F.sans,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer"
            }}>
                      Area Cliente
                    </button>
                    <button onClick={() => go("supplier-dashboard")} style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.8)",
              fontFamily: F.sans,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer"
            }}>
                      Area Fornitore
                    </button>
                  </div>}
              </div>}
            <button className="vb" onClick={() => go("step1")} style={{
          minHeight: 46,
          padding: "0 22px",
          borderRadius: 8,
          border: "none",
          background: "#E8571A",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 14.5,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 6px 16px rgba(232, 87, 26, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
          transition: "all 0.2s ease"
        }}>
              Configura la tua campagna
            </button>
          </div>}

        {isMobile && <button aria-label={menuOpen ? "Chiudi menu" : "Apri menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen(v => !v)} style={{
        minWidth: 72,
        minHeight: 44,
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.18)",
        background: "rgba(255, 255, 255, 0.06)",
        color: C.white,
        fontFamily: F.sans,
        fontSize: 13,
        fontWeight: 800,
        cursor: "pointer",
        padding: "0 14px"
      }}>
            {menuOpen ? "Chiudi" : "Menu"}
          </button>}
      </div>

      {isMobile && menuOpen && <div style={{
      padding: "12px 16px 20px",
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      background: "rgba(10, 18, 34, 0.98)",
      display: "grid",
      gap: 6
    }}>
          <button onClick={() => scrollToSection("come-funziona")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.82)",
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 6px"
      }}>
            Come funziona
          </button>
          <button onClick={() => scrollToSection("prezzi")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.82)",
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 6px"
      }}>
            Prezzi
          </button>
          <button onClick={() => go("step1")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.82)",
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 6px"
      }}>
            Piattaforma: Configuratore
          </button>
          <button onClick={() => go("quick")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.65)",
        fontFamily: F.sans,
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 16px"
      }}>
            ↳ Preventivo Rapido
          </button>
          <button onClick={() => scrollToSection("chi-siamo")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.82)",
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 6px"
      }}>
            Chi siamo
          </button>
          <button onClick={() => scrollToSection("contatti")} style={{
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        background: "transparent",
        border: "none",
        color: "rgba(255, 255, 255, 0.82)",
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        textAlign: "left",
        padding: "0 6px"
      }}>
            Contatti
          </button>
          <div style={{
        height: 1,
        background: "rgba(255,255,255,0.08)",
        margin: "6px 0"
      }} />
          <button onClick={() => setAccessOpen(v => !v)} aria-expanded={accessOpen} aria-haspopup="true" style={{
        minHeight: 44,
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.18)",
        background: "transparent",
        color: C.white,
        fontFamily: F.sans,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6
      }}>
            <span>Accedi</span>
            <span style={{
          fontSize: 10,
          color: "rgba(255, 255, 255, 0.5)",
          transform: accessOpen ? "rotate(180deg)" : "none",
          transition: "transform 0.2s"
        }}>▾</span>
          </button>
          {accessOpen && <div style={{
        display: "grid",
        gap: 4,
        padding: "2px 0"
      }}>
              <button onClick={() => go("login")} style={{
          minHeight: 42,
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.14)",
          background: "rgba(255, 255, 255, 0.04)",
          color: C.white,
          fontFamily: F.sans,
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer"
        }}>
                Area Cliente
              </button>
              <button onClick={() => go("supplier-dashboard")} style={{
          minHeight: 42,
          borderRadius: 8,
          border: "1px solid rgba(255, 255, 255, 0.14)",
          background: "rgba(255, 255, 255, 0.04)",
          color: "rgba(255, 255, 255, 0.82)",
          fontFamily: F.sans,
          fontSize: 13.5,
          fontWeight: 700,
          cursor: "pointer"
        }}>
                Area Fornitore
              </button>
            </div>}
          <button className="vb" onClick={() => go("step1")} style={{
        minHeight: 48,
        borderRadius: 8,
        border: "none",
        background: "#E8571A",
        color: C.white,
        fontFamily: F.sans,
        fontSize: 15,
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: "0 6px 16px rgba(232, 87, 26, 0.3)"
      }}>
            Configura la tua campagna
          </button>
        </div>}
    </nav>;
}

// Section
