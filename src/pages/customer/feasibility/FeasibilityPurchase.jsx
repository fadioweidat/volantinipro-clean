import React, { useEffect, useState } from 'react';
import { analysisToken, commerce, errorText } from './feasibilityCommerce.js';
import { money, number, DISCLAIMER } from './FeasibilityReport.jsx';
import FeasibilityAuth from './FeasibilityAuth.jsx';
export default function FeasibilityPurchase({ preview }) {
 const [config,setConfig]=useState(null),[pending,setPending]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{commerce('config').then(setConfig).catch(e=>setNotice(errorText(e)));},[]);
 async function buy(option) {
   setBusy(true);setNotice('');
   try { await commerce('purchase',{analysisToken:analysisToken(),option}); window.location.assign('/le-mie-analisi'); }
   catch(e) { if(e.message==='AUTH_REQUIRED') setPending(option); else setNotice(errorText(e)); }
   finally {setBusy(false);}
 }
 return <><section className="vf-panel"><h2>Studio completato</h2><p>{preview.city} · {preview.businessType} · {number(preview.flyerQuantity)} volantini</p><p>Costo campagna: {money(preview.campaignCost)}</p><p>Clienti per pareggio: <strong>{number(preview.breakEvenCustomers)}</strong></p><p>Valutazione: <strong>{preview.classification}</strong></p><p>Scenario {preview.scenarioName}: {number(preview.expectedCustomers)} clienti attesi, come ipotesi di simulazione.</p><p>{DISCLAIMER}</p></section>{config&&<div className="vf-report-pair">{[['study_only','Solo Studio di Fattibilità','Acquista il report'],['study_campaign','Studio + Campagna VolantiniPro','Acquista con credito campagna']].map(([option,title,cta])=><section className="vf-panel" key={option}><h2>{title}</h2><strong>{money(config.price_cents/100)}</strong><p>Analisi completa, scenari, ROI, SWOT, rischi, raccomandazioni, report salvato e PDF.</p>{option==='study_campaign'&&<><p>Se confermi una campagna idonea entro {config.validity_days} giorni dal pagamento verificato, puoi applicare fino a {money(config.credit_cents/100)} di credito dopo la verifica Admin della campagna.</p><p>Costo effettivo dello studio con credito interamente utilizzato: {money((config.price_cents-config.credit_cents)/100)}.</p><p>Un solo utilizzo, stesso cliente, nessun rimborso in denaro e nessun residuo riutilizzabile.</p></>}<p>Pagamento manuale. Il report si sblocca dopo la verifica Admin dell’incasso.</p><button className="vf-primary" disabled={busy} onClick={()=>buy(option)}>{cta}</button></section>)}</div>}{pending&&<FeasibilityAuth onSuccess={()=>buy(pending)}/>}<p>Il credito promozionale sulla campagna è soggetto alle condizioni mostrate al momento dell’acquisto.</p>{notice&&<p role="status">{notice}</p>}</>;
}
