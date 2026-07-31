import React from "react";
import { F, C } from "../../lib/constants.js";

const adminBadgeStyle = { 
  display: "inline-flex", 
  padding: "3px 10px", 
  borderRadius: 100, 
  background: "rgba(232,87,26,.15)", 
  border: "1px solid rgba(232,87,26,.3)", 
  fontFamily: F.sans, 
  fontSize: 10, 
  fontWeight: 800, 
  color: C.orange 
};

const secondaryButtonStyle = { 
  height: 38, 
  padding: "0 15px", 
  borderRadius: 10, 
  border: "1px solid rgba(255,255,255,.1)", 
  background: "rgba(255,255,255,.04)", 
  color: "rgba(255,255,255,.58)", 
  fontFamily: F.sans, 
  fontSize: 12, 
  cursor: "pointer", 
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center"
};

const breadcrumbLinkStyle = { 
  color: C.orange, 
  textDecoration: "none", 
  fontWeight: 700 
};

/**
 * AdminLayout - Unified shell for all Admin pages.
 */
export function AdminLayout({ 
  children, 
  title = "Dashboard Admin", 
  subtitle = "Dati reali Supabase. Nessun dato demo.", 
  breadcrumbs = [], 
  onNav 
}) {
  const go = (page) => {
    if (onNav) {
      onNav(page);
    } else {
      window.location.href = "/";
    }
  };

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 60px", minHeight: "100vh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={adminBadgeStyle}>ADMIN</div>
            {breadcrumbs.length > 0 && (
              <div style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.5)", display: "flex", alignItems: "center", gap: 8 }}>
                {breadcrumbs.map((b, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span>/</span>}
                    {b.href ? <a href={b.href} style={breadcrumbLinkStyle}>{b.label}</a> : <span style={{ color: "rgba(255,255,255,.8)" }}>{b.label}</span>}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
          <h1 style={{ fontFamily: F.serif, fontSize: 30, color: C.white, letterSpacing: "-1px", margin: "8px 0 4px" }}>{title}</h1>
          <p style={{ fontFamily: F.sans, fontSize: 12, color: "rgba(255,255,255,.42)", margin: 0 }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignSelf: "flex-start" }}>
          {breadcrumbs.length > 0 && (
            <a href="/admin" style={secondaryButtonStyle}>Dashboard Admin</a>
          )}
          <button onClick={() => go("home")} style={secondaryButtonStyle}>Sito Principale</button>
        </div>
      </header>

      {children}
    </main>
  );
}
