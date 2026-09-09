import { ensureSupabaseSessionBridge, supabase } from '../supabaseClient.js';
export async function campaignSettlement(campaignId) {
 await ensureSupabaseSessionBridge();
 const {data,error}=await supabase.rpc('feasibility_campaign_settlement',{p_campaign_id:campaignId});
 if(error || !data) return {settlement_status:'unavailable',amount_due_cents:null};
 return data;
}
export const isCreditSettled = s => ['settled_by_credit','settled_by_verified_receipt'].includes(s?.settlement_status);
export async function withCampaignSettlement(campaign) {
 if(!campaign) return campaign;
 const settlement=await campaignSettlement(campaign.id);
 if(settlement.settlement_status==='not_applicable') return {...campaign,settlement};
 return {...campaign,settlement,amount_due_euro:settlement.amount_due_cents==null?null:settlement.amount_due_cents/100,
 stato_pagamento:isCreditSettled(settlement)?settlement.settlement_status:settlement.settlement_status==='awaiting_payment'?'in_attesa':'review_required'};
}
