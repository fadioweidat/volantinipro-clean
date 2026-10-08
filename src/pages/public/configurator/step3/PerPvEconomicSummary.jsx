import React from 'react';
import {formatQuoteCurrency} from '../../../../lib/quotePricing.js';
export function PerPvEconomicSummary({breakdown}) {
 if(!breakdown)return null;
 return <section data-testid="per-pv-economic-summary" aria-label="Breakdown economico per punto vendita" style={{margin:'16px 0',padding:16,border:'1px solid rgba(255,255,255,.16)',borderRadius:14,overflowWrap:'anywhere',color:'#fff'}}>
  <h3 style={{margin:'0 0 12px'}}>Distribuzione per punto vendita</h3>
  {breakdown.rows.map(r=><div key={r.pvId} data-testid="per-pv-economic-row" style={{display:'flex',flexWrap:'wrap',gap:8,justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid rgba(255,255,255,.1)'}}>
   <span>{r.name} · {r.quantity.toLocaleString('it-IT')} volantini<br/><small>Smart Pairing non verificato</small></span>
   <span>Base {formatQuoteCurrency(r.base)}<br/>Sconto {formatQuoteCurrency(r.discount)}<br/>Netto base {formatQuoteCurrency(r.net)}</span>
  </div>)}
  <strong>Totale base {formatQuoteCurrency(breakdown.totals.base)} · Sconto {formatQuoteCurrency(breakdown.totals.discount)} · Netto base {formatQuoteCurrency(breakdown.totals.net)}</strong>
  <p style={{fontSize:12,marginBottom:0}}>Prima di urgenza, piano, stampa, grafica ed extra. Le disponibilità provvisorie non autorizzano sconti e non riservano capacità.</p>
 </section>;
}
