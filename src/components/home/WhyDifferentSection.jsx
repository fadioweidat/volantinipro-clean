import React, { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { FEASIBILITY_PATH } from "../../lib/feasibility/entryPoint.js";
import DifferenceIllustration from "./DifferenceIllustration.jsx";
import "./why-different.css";

const CARDS = [
  { id: "istat", badge: "ISTAT", title: "Dati territoriali ISTAT", desc: "Famiglie, popolazione e densità abitativa lette dalle fonti territoriali disponibili.", bullets: ["Famiglie e popolazione", "Copertura stimata"], micro: ["Dati affidabili,", "decisioni migliori."] },
  { id: "gis", badge: "GIS", title: "Analisi territoriale", desc: "Prima della campagna analizziamo zona, raggio e comuni coinvolti.", bullets: ["Zone e comuni", "Fabbisogno volantini"], micro: ["Territori che", "diventano opportunità."] },
  { id: "analysis", badge: "AI + ANALISI", title: "Studio di Fattibilità AI", desc: "Due analisi per due decisioni diverse.", bullets: ["Valutazione di attività, territorio, concorrenza e opportunità", "Verifica di una campagna con break-even, ROI e scenari"], note: "Analisi basata sui dati realmente disponibili e sulle informazioni che fornisci.", cta: "Scopri come funziona", href: FEASIBILITY_PATH, micro: ["Idee più chiare.", "Risultati reali."] },
  { id: "gps", badge: "GPS", title: "Tracking GPS", desc: "Il lavoro sul campo viene registrato con il percorso GPS degli operatori.", bullets: ["Percorso operativo", "Avanzamento live"], micro: ["Più controllo", "sul territorio."] },
  { id: "pdf", badge: "PDF", title: "Report e prove", desc: "Le evidenze raccolte rendono la distribuzione controllabile a fine campagna.", bullets: ["Foto geolocalizzate", "Mappa di copertura"], micro: ["Trasparenza", "in ogni dettaglio."] },
  { id: "assistant", badge: "AI ASSISTANT", title: "Assistente VolantiniPro", desc: "Un assistente AI integrato nel configuratore, nella Dashboard Cliente, nell’area Admin, Driver e Fornitori.", bullets: ["Risponde in linguaggio naturale", "Legge i dati reali della piattaforma", "Spiega preventivi, campagne, tracking, report e pagamenti", "Rispetta ruoli e permessi"], cta: "Scopri l’Assistente AI", micro: ["Un dialogo", "che fa la differenza."] },
];

function FooterMark({ type }) {
  return <svg viewBox="0 0 40 40" aria-hidden="true" className="vpd-footer-mark" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    {type === "istat" ? <path d="M8 32V23h3v9m4 0V15h3v17m4 0V9h3v23m4 0V4h3v28" /> : type === "gis" ? <path d="m5 9 10-5 10 6 10-5v26l-10 5-10-6-10 5Zm10-5v26m10-20v26" /> : type === "gps" ? <><path d="m14 14 12 12-7 7L7 21Zm3 3 5-5 7 7-5 5M5 30l5 5m-6-9a9 9 0 0 0 10 10M25 8a10 10 0 0 1 8 9M25 3a16 16 0 0 1 13 14" /></> : <path d="M9 3h16l8 8v26H9Zm16 0v9h8M14 18h14m-14 6h14m-14 6h14" />}
  </svg>;
}

function DifferenceCard({ card }) {
  const [expanded, setExpanded] = useState(false);
  return <article className={`vpd-card vpd-card--${card.id}`} aria-labelledby={`difference-${card.id}`}>
    <DifferenceIllustration type={card.id} />
    <span className="vpd-badge">{card.badge}</span>
    <div className="vpd-card-intro">
      <h3 id={`difference-${card.id}`}>{card.title}</h3>
      <p>{card.desc}</p>
    </div>
    <ul className="vpd-bullets">{card.bullets.map(b => <li key={b}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10 2.5 2.5 5-5" fill="none" stroke="#102033" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg><span>{b}</span></li>)}</ul>
    {card.note && <p className="vpd-note">{card.note}</p>}
    <div className={`vpd-card-footer${card.cta ? " vpd-card-footer--cta" : ""}`}>
      {card.cta && (card.href ? <a className="vpd-cta" href={card.href}>{card.cta}<span aria-hidden="true">→</span><i aria-hidden="true">›</i></a> : <button className="vpd-cta" type="button" aria-expanded={expanded} aria-controls="difference-assistant-details" onClick={() => setExpanded(!expanded)}>{card.cta}<span aria-hidden="true">→</span><i aria-hidden="true">{expanded ? "−" : "›"}</i></button>)}
      <span className="vpd-micro">{card.micro.map(line => <span key={line}>{line}</span>)}</span>
      {!card.cta && <FooterMark type={card.id} />}
    </div>
    {card.id === "assistant" && <div id="difference-assistant-details" className="vpd-assistant-details" hidden={!expanded}>Apri l’Assistente AI nell’area che stai utilizzando e scrivi la tua domanda. Le risposte dipendono dai dati disponibili e dai permessi del tuo ruolo.</div>}
  </article>;
}

export default function WhyDifferentSection() {
  const reduceMotion = useReducedMotion();
  return <section id="chi-siamo" className="vpd-section" data-reduced-motion={reduceMotion || undefined} aria-labelledby="why-different-title">
    <div className="vpd-container">
      <header className="vpd-header">
        <div className="vpd-eyebrow">La differenza</div>
        <h2 id="why-different-title">Perché VolantiniPro è diverso</h2>
        <p className="vpd-subtitle">Analizziamo il territorio, valutiamo la convenienza, pianifichiamo la distribuzione e monitoriamo il lavoro.<br className="vpd-desktop-break" /> Con l’Assistente AI VolantiniPro, clienti e operatori possono comprendere e gestire ogni fase in linguaggio naturale.</p>
        <div className="vpd-signature" aria-hidden="true"><span>Dati + tecnologia<br />Persone = risultati</span><i /><em>Più valore<br />al tuo territorio.</em></div>
      </header>
      <div className="vpd-grid">{CARDS.map(card => <DifferenceCard key={card.id} card={card} />)}</div>
    </div>
  </section>;
}
