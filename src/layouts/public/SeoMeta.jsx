import React, { useEffect } from "react";
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from "../../lib/contactConfig.js";
import { faqs } from "../../components/home/FAQSection.jsx";
import { services } from "../../components/home/ServicesSection.jsx";
import { SERVICE_PAGE_CONTENT } from "../../lib/seo/servicePagesContent.js";

// TICKET — SEO TECNICO + GOOGLE + AI SEARCH: title/description/canonical/OG/
// Twitter/robots per pagina + JSON-LD (Organization/WebSite sempre,
// FAQPage/Service solo in home, BreadcrumbList sulle pagine interne).
// Resta un meccanismo CSR (useEffect dopo il mount): aiuta i crawler che
// eseguono JS (Googlebot in primis), non sostituisce un vero SSR/prerender
// per i motori che non eseguono JS — vedi audit del ticket.

const metaByPage = {
  home: [
    "Distribuzione Volantini con GPS e Report | VolantiniPro",
    "Distribuzione volantini Door to Door, Hand to Hand e Business con analisi territoriale, tracking GPS, prove fotografiche e preventivo online.",
  ],
  quick: [
    "Preventivo rapido distribuzione volantini | VolantiniPro",
    "Richiedi una stima rapida per la tua campagna di distribuzione volantini: servizio, zona e quantità in pochi passaggi.",
  ],
  consultant: [
    "Parla con un consulente VolantiniPro",
    "Richiedi supporto diretto per configurare la tua campagna di distribuzione volantini con un consulente VolantiniPro.",
  ],
  preventivo: [
    "Configura il tuo preventivo | VolantiniPro",
    "Configura zona, servizio e quantità e ottieni un preventivo online per la tua campagna di distribuzione volantini.",
  ],
  login: ["Login cliente | VolantiniPro", "Accedi alla dashboard VolantiniPro con magic link sicuro via email."],
  dashboard: ["Dashboard cliente | VolantiniPro", "Monitora campagne, tracking GPS, Smart Pairing e report finali."],
  campaign: ["Dashboard campagna | VolantiniPro", "Stato campagna, percorso GPS, statistiche di distribuzione, proof foto e report PDF."],
  privacy: ["Privacy Policy | VolantiniPro", "Informativa privacy per clienti e utenti VolantiniPro."],
  terms: ["Termini e condizioni | VolantiniPro", "Condizioni d'uso del servizio VolantiniPro."],
  cookie: ["Cookie Policy | VolantiniPro", "Informazioni sui cookie tecnici, analytics e preferenze del sito VolantiniPro."],
  "service-door-to-door": [
    "Distribuzione Volantini Door to Door | VolantiniPro",
    "Distribuzione volantini nelle cassette postali di condomini e zone residenziali, con analisi territoriale, tracking GPS e report finale.",
  ],
  "service-hand-to-hand": [
    "Distribuzione Volantini Hand to Hand | VolantiniPro",
    "Distribuzione volantini a mano in punti ad alto passaggio pedonale, con POI strategici, tracking GPS e report finale.",
  ],
  "service-business": [
    "Distribuzione Volantini Business | VolantiniPro",
    "Distribuzione volantini mirata ad aziende, negozi e uffici, con coordinamento multi-sede, tracking GPS e report finale.",
  ],
};

const SERVICE_PAGE_IDS = Object.keys(SERVICE_PAGE_CONTENT);

// Pagine private/gestionali: mai indicizzate, anche se raggiunte per link
// diretto (robots.txt Disallow blocca il crawling, questo blocca l'indicizzazione
// nel caso una pagina venga comunque referenziata da altrove) — difesa in
// profondità, coerente con FASE 2/FASE 15 del ticket.
function isPrivatePage(page) {
  return (
    page === "login" ||
    page === "dashboard" ||
    page === "supplier-dashboard" ||
    page.startsWith("admin") ||
    page.startsWith("customer") ||
    page.startsWith("campaign")
  );
}

// Pagine interne "di contenuto" (non home, non private): ricevono un
// BreadcrumbList Home > Pagina, coerente con FASE 5 del ticket.
const BREADCRUMB_PAGES = new Set(["quick", "consultant", "preventivo", "privacy", "terms", "cookie", ...SERVICE_PAGE_IDS]);

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    const match = selector.match(/\[(name|property)="([^"]+)"\]/);
    if (match) el.setAttribute(match[1], match[2]);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function setJsonLd(id, data) {
  let el = document.head.querySelector(`script[data-seo-jsonld="${id}"]`);
  if (data == null) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.setAttribute("data-seo-jsonld", id);
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify({ "@context": "https://schema.org", ...data });
}

function organizationJsonLd(siteUrl) {
  const org = {
    "@type": "Organization",
    name: "VolantiniPro",
    url: siteUrl,
    email: SUPPORT_EMAIL,
  };
  // Stesso numero già usato per i CTA WhatsApp del sito (contactConfig.js,
  // solo se configurato via env — nessun numero inventato qui). Formattato
  // leggibile "+39 351 767 3737" a partire dalle sole cifre (prefisso 39 +
  // 3 + 3 + 4 cifre).
  const phoneMatch = SUPPORT_WHATSAPP && /^39(\d{3})(\d{3})(\d{4})$/.exec(SUPPORT_WHATSAPP);
  if (phoneMatch) {
    org.telephone = `+39 ${phoneMatch[1]} ${phoneMatch[2]} ${phoneMatch[3]}`;
  }
  return org;
}

export function SeoMeta({ page }) {
  useEffect(() => {
    const [title, description] = metaByPage[page] || metaByPage.home;
    const siteUrl = window.location.origin;
    const canonicalUrl = `${siteUrl}${window.location.pathname}`;

    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setLink("canonical", canonicalUrl);

    setMeta('meta[property="og:site_name"]', "content", "VolantiniPro");
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[property="og:type"]', "content", "website");
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[property="og:locale"]', "content", "it_IT");

    setMeta('meta[name="twitter:card"]', "content", "summary");
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);

    setMeta('meta[name="robots"]', "content", isPrivatePage(page) ? "noindex, nofollow" : "index, follow");

    // JSON-LD — Organization + WebSite sempre presenti (identità del sito,
    // dati reali confermati: nessun indirizzo fisico inventato, nessun
    // LocalBusiness senza dati aziendali reali disponibili).
    setJsonLd("organization", organizationJsonLd(siteUrl));
    setJsonLd("website", { "@type": "WebSite", name: "VolantiniPro", url: siteUrl });

    // FAQPage + Service: in home (tutti i servizi + tutte le FAQ home) o su
    // una delle 3 pagine servizio (solo il proprio Service + le proprie FAQ
    // brevi) — sempre dalla stessa fonte del contenuto realmente visibile
    // (FAQSection.jsx/ServicesSection.jsx per la home,
    // src/lib/seo/servicePagesContent.js per le pagine servizio, la stessa
    // fonte usata da ServicePages.jsx per il rendering), mai testo duplicato
    // o inventato "per AI".
    const servicePageContent = SERVICE_PAGE_CONTENT[page];
    if (page === "home") {
      setJsonLd("faqpage", {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      });
      setJsonLd("services", {
        "@type": "ItemList",
        itemListElement: services.map((s, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Service",
            name: s.title,
            description: [s.subtitle, ...s.bullets].join(" — "),
            provider: { "@type": "Organization", name: "VolantiniPro", url: siteUrl },
          },
        })),
      });
    } else if (servicePageContent) {
      setJsonLd("faqpage", {
        "@type": "FAQPage",
        mainEntity: servicePageContent.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      });
      setJsonLd("services", {
        "@type": "Service",
        name: servicePageContent.h1,
        description: servicePageContent.intro,
        provider: { "@type": "Organization", name: "VolantiniPro", url: siteUrl },
      });
    } else {
      setJsonLd("faqpage", null);
      setJsonLd("services", null);
    }

    // BreadcrumbList: solo pagine interne di contenuto, mai su home/private.
    if (BREADCRUMB_PAGES.has(page)) {
      setJsonLd("breadcrumb", {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: title.split(" | ")[0], item: canonicalUrl },
        ],
      });
    } else {
      setJsonLd("breadcrumb", null);
    }
  }, [page]);
  return null;
}
