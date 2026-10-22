import React from 'react';
import { F } from '../../lib/constants.js';
import { formatEuroIT } from '../../lib/customerDisplay.js';

// Same content and logic as before; explicit colours (the unstyled tags showed
// black text on the dark dashboard) and Italian money format (€1.524,44).
const money = (value) => (value == null ? 'Non definito' : formatEuroIT(value));
const boxStyle = { margin: '0 0 10px', fontFamily: F.sans, color: 'rgba(255,255,255,.85)', fontSize: 13, lineHeight: 1.5 };
const titleStyle = { margin: '0 0 4px', fontFamily: F.sans, fontSize: 14, fontWeight: 800, color: '#fff' };
const lineStyle = { margin: '2px 0' };

export default function CampaignSettlementSummary({ settlement:s }) {
 if(!s || s.settlement_status==='not_applicable') return null;
 return <section aria-label="Saldo campagna verificato" style={boxStyle}><h3 style={titleStyle}>Saldo campagna</h3>{s.original_total_cents!=null&&<><p style={lineStyle}>Totale campagna verificato: {money(s.original_total_cents/100)}</p><p style={lineStyle}>Credito Studio: −{money(s.credit_cents/100)}</p></>}<p style={lineStyle}><strong>{s.amount_due_cents==null?'Saldo in verifica: contatta assistenza.':`Importo da versare: ${money(s.amount_due_cents/100)}`}</strong></p>{s.settlement_status==='settled_by_credit'&&<p style={lineStyle}>Saldo coperto da credito. Nessun importo da versare.</p>}{s.settlement_status==='settled_by_verified_receipt'&&<p style={lineStyle}>Incasso del residuo verificato da Admin. Nessun importo da versare.</p>}{s.settlement_status==='review_required'&&<p style={lineStyle}>La campagna è cambiata: è necessaria una nuova verifica Admin.</p>}</section>;
}
