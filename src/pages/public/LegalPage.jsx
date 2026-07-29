import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { C, F, x, w, j, T, z, R } from "../../lib/constants.js";
// Altri import se necessari verranno aggiunti nel prossimo step

export function LegalPage({
  type,
  onNav
}) {
  const config = {
    privacy: {
      eyebrow: "Privacy",
      title: "Privacy Policy",
      intro: "Informativa sintetica per il prototipo VolantiniPro. Prima del go-live andra completata con dati societari, DPO/contatti privacy e fornitori effettivi.",
      rows: [["Dati raccolti", "Dati di contatto, informazioni campagna, dati tecnici di navigazione e dati operativi legati a GPS/proof foto quando il servizio e attivo."], ["Finalita", "Gestione preventivi, campagne, dashboard cliente, comunicazioni operative e miglioramento del servizio."], ["Base giuridica", "Esecuzione del contratto, misure precontrattuali, consenso per comunicazioni opzionali e legittimo interesse per sicurezza e analytics essenziali."], ["Conservazione", "Per il tempo necessario alla gestione del servizio, agli obblighi fiscali e alla tutela dei diritti."]]
    },
    terms: {
      eyebrow: "Termini",
      title: "Termini e condizioni",
      intro: "Condizioni base del servizio in versione prototipo. Il testo legale definitivo va validato prima della pubblicazione.",
      rows: [["Oggetto", "VolantiniPro consente di configurare e stimare campagne di distribuzione volantini con strumenti digitali di pianificazione e reporting."], ["Preventivi", "I preventivi generati nel prototipo sono stime non vincolanti finche non confermati dal team operativo."], ["Dati territoriali", "I dati mostrati sono disponibili solo quando arrivano da configurazione, API o database."], ["Responsabilità", "Tempi, disponibilità e copertura possono variare in base a condizioni operative, meteo, accessibilità e conferma finale."]]
    },
    cookie: {
      eyebrow: "Cookie",
      title: "Cookie Policy",
      intro: "Policy cookie minima per il prototipo. Il banner consensi è predisposto e sarà collegato agli strumenti reali quando attivati.",
      rows: [["Cookie tecnici", "Necessari per navigazione, preferenze locali e funzionamento del configuratore."], ["Analytics", "Google Analytics 4 e Microsoft Clarity sono pianificati ma non ancora attivi nel prototipo."], ["Marketing", "Non attivi nel prototipo. Andranno abilitati solo dopo consenso esplicito."], ["Gestione consenso", "Il consenso può essere aggiornato dal banner cookie o da questa pagina quando il modulo definitivo sarà collegato."]]
    }
  }[type] || {};
  return <div style={{
    minHeight: "100vh",
    background: C.navyMid,
    padding: "105px 24px 80px"
  }}>
      <div style={{
      maxWidth: 900,
      margin: "0 auto"
    }}>
        <div style={{
        fontFamily: F.sans,
        fontSize: 10,
        fontWeight: 800,
        color: C.orange,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        marginBottom: 12
      }}>{config.eyebrow}</div>
        <h1 style={{
        fontFamily: F.serif,
        fontSize: 40,
        color: C.white,
        letterSpacing: "-1px",
        marginBottom: 10
      }}>{config.title}</h1>
        <p style={{
        fontFamily: F.sans,
        fontSize: 14,
        color: "rgba(255,255,255,.55)",
        lineHeight: 1.7,
        maxWidth: 720,
        marginBottom: 22
      }}>{config.intro}</p>
        <div style={{
        display: "grid",
        gap: 10
      }}>
          {config.rows.map(([title, body]) => <div key={title} style={{
          padding: 18,
          borderRadius: 13,
          background: "rgba(255,255,255,.045)",
          border: "1px solid rgba(255,255,255,.08)"
        }}>
              <div style={{
            fontFamily: F.sans,
            fontSize: 13,
            fontWeight: 800,
            color: C.white,
            marginBottom: 6
          }}>{title}</div>
              <div style={{
            fontFamily: F.sans,
            fontSize: 13,
            color: "rgba(255,255,255,.5)",
            lineHeight: 1.6
          }}>{body}</div>
            </div>)}
        </div>
        <NavButton onClick={() => onNav("home")} style={{
        marginTop: 22
      }}>Home</NavButton>
      </div>
    </div>;
}
