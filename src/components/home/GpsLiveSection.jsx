import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const OPERATOR_IMAGE = '/images/home/distribution-operator-illustration.png';
const FEATURES = [
  { id: 'photo', title: 'Foto geolocalizzate', text: 'La prova fotografica della distribuzione, collegata al luogo.' },
  { id: 'route', title: 'Percorso GPS', text: 'Il tragitto degli operatori, visibile sulla mappa.' },
  { id: 'report', title: 'Report per Comune', text: 'Zone, percorso e prove raccolte in un unico report.' },
];

function ProofIcon({ type }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === 'photo' ? <><path d="M4 10h6l2-4h8l2 4h6v17H4z" /><circle cx="16" cy="18" r="6" /></> : type === 'route' ? <><path d="M8 25c14 5 19-4 11-10S4 9 9 4" /><circle cx="8" cy="25" r="3" /><path d="M21 8a5 5 0 1 1 10 0c0 4-5 9-5 9s-5-5-5-9Z" /><circle cx="26" cy="8" r="1.5" /></> : <><path d="M7 3h13l6 6v20H7zM20 3v7h6M12 15h9M12 20h9M12 25h6" /></>}
  </svg>;
}

function PhoneMap({ reduced }) {
  return <svg className="vpg-phone-map" viewBox="0 0 260 410" role="img" aria-label="Mappa dimostrativa con zona, percorso e punti GPS">
    <defs><pattern id="vpg-blocks" width="54" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)"><rect width="54" height="60" fill="#eef2ed" /><rect x="6" y="6" width="40" height="45" rx="3" fill="#e0e5dd" /><path d="M0 56h54M50 0v60" stroke="#fff" strokeWidth="6" /></pattern></defs>
    <rect width="260" height="410" fill="url(#vpg-blocks)" />
    <path d="M-15 100 90 145 275 60M-20 300 155 270 280 325M60-10 120 170 75 430M220-15 180 210 250 430" stroke="#cbd2cd" strokeWidth="16" fill="none" />
    <path d="M-15 100 90 145 275 60M-20 300 155 270 280 325M60-10 120 170 75 430M220-15 180 210 250 430" stroke="#fff" strokeWidth="11" fill="none" />
    <path d="m180 0 80 20v105l-38-35-60 5Z" fill="#b8d5ad" /><path d="m0 340 48-25 26 95H0Z" fill="#b8d5ad" />
    <polygon points="73,66 182,100 212,208 175,300 76,310 34,195" fill="#72b4ff" fillOpacity=".22" stroke="#328cfa" strokeWidth="2" strokeDasharray="5 4" />
    <motion.path d="M116 83 86 135 55 182 105 205 152 181 183 231 148 271 83 286" fill="none" stroke="#1688ff" strokeWidth="4" strokeLinecap="round" initial={reduced ? false : { pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: reduced ? 0 : 1.2 }} />
    {[[86,135],[55,182],[105,205],[152,181],[183,231],[148,271]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#ff802f" stroke="#fff" strokeWidth="2" />)}
    <g transform="translate(116 83)"><path d="M0 8s-12-13-12-20a12 12 0 0 1 24 0C12-5 0 8 0 8Z" fill="#28ad5b" stroke="#fff" strokeWidth="2" /><circle cy="-12" r="4" fill="#fff" /></g>
    <g transform="translate(83 286)"><path d="M0 8s-12-13-12-20a12 12 0 0 1 24 0C12-5 0 8 0 8Z" fill="#ff6b20" stroke="#fff" strokeWidth="2" /><circle cy="-12" r="4" fill="#fff" /></g>
  </svg>;
}

export default function GpsLiveSection({ onConfigure }) {
  const reduced = useReducedMotion();
  return <section id="gps-live" className="vpg-section" aria-labelledby="gps-live-title">
    <div className="vpg-inner">
      <div className="vpg-story">
        <div className="vpg-photo"><img src={OPERATOR_IMAGE} width="1086" height="1448" loading="lazy" alt="Illustrazione di un operatore VolantiniPro mentre distribuisce volantini nelle cassette postali" /><span>Immagine illustrativa</span></div>
        <div className="vpg-story-copy"><p className="vpg-eyebrow">IL LAVORO LASCIA UNA TRACCIA</p><h2 id="gps-live-title">Prima sai quanti volantini servono.<br /><em>Poi sai dove vengono distribuiti.</em></h2><p>Dal territorio alla prova del lavoro: percorso GPS, foto e report per verificare la tua campagna.</p></div>
      </div>
      <figure className="vpg-demo">
        <div className="vpg-phone"><div className="vpg-phone-notch" aria-hidden="true" /><div className="vpg-phone-screen"><div className="vpg-app-header"><span aria-hidden="true">‹</span><strong>La tua distribuzione</strong><ProofIcon type="route" /></div><PhoneMap reduced={reduced} /><div className="vpg-phone-label">Percorso di esempio</div><div className="vpg-photo-proof"><img src={OPERATOR_IMAGE} alt="Esempio illustrativo di foto della distribuzione" loading="lazy" /><div><strong>Foto della distribuzione</strong><span>Esempio di prova</span></div><span className="vpg-proof-check" aria-hidden="true">✓</span></div></div></div>
        <figcaption>Anteprima dimostrativa · percorso e foto d’esempio</figcaption>
      </figure>
      <div className="vpg-features">
        {FEATURES.map(feature => <article className={`vpg-feature vpg-feature--${feature.id}`} key={feature.id}><span className="vpg-feature-icon"><ProofIcon type={feature.id} /></span><div><h3>{feature.title}</h3><p>{feature.text}</p></div></article>)}
        <button type="button" className="vpg-cta" onClick={() => onConfigure?.()}>Calcola il preventivo online <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </section>;
}
