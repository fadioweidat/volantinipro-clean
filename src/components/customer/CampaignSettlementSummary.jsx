import React from 'react';
import { money } from '../../pages/customer/feasibility/FeasibilityReport.jsx';
export default function CampaignSettlementSummary({ settlement:s }) {
 if(!s || s.settlement_status==='not_applicable') return null;
 return <section aria-label="Saldo campagna verificato"><h3>Saldo campagna</h3>{s.original_total_cents!=null&&<><p>Totale campagna verificato: {money(s.original_total_cents/100)}</p><p>Credito Studio: −{money(s.credit_cents/100)}</p></>}<p><strong>{s.amount_due_cents==null?'Saldo in verifica: contatta assistenza.':`Importo da versare: ${money(s.amount_due_cents/100)}`}</strong></p>{s.settlement_status==='settled_by_credit'&&<p>Saldo coperto da credito. Nessun importo da versare.</p>}{s.settlement_status==='settled_by_verified_receipt'&&<p>Incasso del residuo verificato da Admin. Nessun importo da versare.</p>}{s.settlement_status==='review_required'&&<p>La campagna è cambiata: è necessaria una nuova verifica Admin.</p>}</section>;
}
