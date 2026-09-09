import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';
import { createHandler } from '../feasibility-ai/handler.js';
import { calculateFeasibility } from '../../../src/pages/customer/feasibility/feasibilityEngine.js';
import { FIELDS, validationErrors } from '../../../src/pages/customer/feasibility/feasibilitySchemas.js';
import { validateNarrative } from '../../../src/pages/customer/feasibility/feasibilityPrompt.js';

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const origins = ['https://volantinipro-clean.vercel.app','https://volantinipro.it','https://www.volantinipro.it','http://localhost:5173'];
const ai = createHandler({ apiKey: Deno.env.get('OPENAI_API_KEY'), anonKey: anon, model: Deno.env.get('FEASIBILITY_OPENAI_MODEL') || 'gpt-4o-mini' });
const uuid = (v: unknown) => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
async function rpc(name: string, args = {}) { const {data,error}=await service.rpc(name,args); if(error) throw new Error(error.message); return data; }
async function identity(request: Request) {
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token || token===anon) return null;
 const {data,error}=await service.auth.getUser(token);
 if(error || !data.user) throw new Error('AUTH_REQUIRED');
 const {data:profile,error:profileError}=await service.from('profiles').select('role').eq('id',data.user.id).maybeSingle();
 if(profileError) throw new Error('AUTH_REQUIRED');
 return {id:data.user.id,role:profile?.role,email:data.user.email,isTest:data.user.app_metadata?.feasibility_synthetic_test===true};
}
function requireClient(user: any) { if(!user) throw new Error('AUTH_REQUIRED'); if(user.role!=='client') throw new Error('CLIENT_REQUIRED'); }
function requireAdmin(user: any) {
 if(!user || user.role!=='admin') throw new Error('ADMIN_REQUIRED');
 // Optional additional deployment allowlist, never taken from browser metadata.
 const allow=(Deno.env.get('FEASIBILITY_ADMIN_EMAILS')||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(allow.length && !allow.includes(user.email?.toLowerCase())) throw new Error('ADMIN_REQUIRED');
}
function normalizeInputs(raw: any) {
 const clean:any={};
 for(const key of Object.keys(FIELDS)) {
   const item=raw?.[key];
   if(!item || !['campaign_existing','user_provided','model_assumption','benchmark','unavailable'].includes(item.source)) throw new Error('INVALID_INPUT');
   if(item.value!==null && (FIELDS[key].text ? typeof item.value!=='string'||item.value.length>600 : typeof item.value!=='number'||!Number.isFinite(item.value))) throw new Error('INVALID_INPUT');
   clean[key]={value:item.value,source:item.source};
 }
 return clean;
}
export async function handleCommerce(request: Request, aiOnly=false) {
 const origin=request.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!origins.includes(origin)) return reply({error:'ORIGIN'},403);
 if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(request.method!=='POST') return reply({error:'METHOD'},405);
 if(request.headers.get('apikey')!==anon) return reply({error:'AUTH_REQUIRED'},401);
 try {
   if(Number(request.headers.get('content-length'))>30000) return reply({error:'SIZE'},413);
   const raw=await request.text(); if(raw.length>30000) return reply({error:'SIZE'},413);
   const body=JSON.parse(raw), action=aiOnly?'ai':body.action;
   const user=await identity(request);
   if(action==='config') return reply(await rpc('feasibility_commerce_config'));
   if(action==='ai') {
     if(user && user.role!=='client') throw new Error('CLIENT_REQUIRED');
     if(!['collect','narrative'].includes(body.mode) || typeof body.analysisToken!=='string' || !/^[a-f0-9]{64}$/.test(body.analysisToken) || !uuid(body.requestId)) throw new Error('INVALID_REQUEST');
     const inputs=normalizeInputs(body.inputs);
     if(body.mode==='narrative' && Object.keys(validationErrors(inputs,body.unusualMargin===true)).length) throw new Error('INVALID_INPUT');
     if(body.mode==='collect' && (typeof body.message!=='string'||!body.message.trim()||body.message.length>1500)) throw new Error('INVALID_MESSAGE');
     const accessHash=await hash(body.analysisToken);
     const analysis=await rpc('feasibility_reserve_call',{p_hash:accessHash,p_actor:user?.id||null,p_kind:body.mode,p_request:body.requestId});
     // Use the unchanged Phase 2 prompt and numeric firewall inside a quota/entitlement envelope.
     const response=await ai(new Request(request.url,{method:'POST',headers:{origin,apikey:anon,authorization:`Bearer ${anon}`,'content-type':'application/json'},body:JSON.stringify({mode:body.mode,inputs,message:body.message,currentField:body.currentField,unusualMargin:body.unusualMargin})}));
     if(body.mode==='collect') return reply(await response.json(),response.status);
     const outputs=calculateFeasibility(inputs,{unusualMargin:body.unusualMargin===true});
     const candidate=response.ok?await response.json():null;
     const narrative=validateNarrative(candidate);
     const config=await rpc('feasibility_commerce_config');
     const payload={inputs,outputs,narrative,unusualMargin:body.unusualMargin===true,engineVersion:outputs.engineVersion,promptVersion:'phase2-v1',reportVersion:'commerce-v1',pricingVersion:config.pricing_version};
     const preview={campaignCost:outputs.campaignCost,flyerQuantity:inputs.flyerQuantity.value,city:inputs.city.value,businessType:inputs.businessType.value,breakEvenCustomers:outputs.breakEvenCustomers,classification:outputs.classification,scenarioName:outputs.scenarios[0].name,expectedCustomers:outputs.scenarios[0].expectedCustomers,aiAvailable:!!narrative};
     const reportId=await rpc('feasibility_store_report',{p_hash:accessHash,p_actor:user?.id||null,p_payload:payload,p_preview:preview,p_sha:await hash(JSON.stringify(payload))});
     return reply({reportId,analysisId:analysis.id,preview});
   }
   if(action==='purchase') {
     requireClient(user);
     if(typeof body.analysisToken!=='string'||!/^[a-f0-9]{64}$/.test(body.analysisToken)||!uuid(body.requestId)) throw new Error('INVALID_REQUEST');
     const purchase=await rpc('feasibility_create_purchase',{p_actor:user.id,p_hash:await hash(body.analysisToken),p_option:body.option,p_request:body.requestId,p_test:user.isTest});
     return reply({purchase});
   }
   if(action==='library') {
     requireClient(user);
     const {data:purchases,error}=await service.from('feasibility_purchases').select('id,analysis_id,option,amount_cents,currency,status,paid_at,created_at,is_test').eq('owner_id',user.id).order('created_at',{ascending:false}).limit(100);
     if(error) throw new Error('LOAD_FAILED');
     const {data:reports}=await service.from('feasibility_reports').select('id,purchase_id,created_at').eq('owner_id',user.id);
     const {data:credits}=await service.from('feasibility_credits').select('*').eq('owner_id',user.id);
     const {data:analyses}=await service.from('feasibility_analyses').select('id,preview').eq('owner_id',user.id);
     return reply({purchases:(purchases||[]).map(p=>({...p,report:reports?.find(r=>r.purchase_id===p.id)||null,preview:analyses?.find(a=>a.id===p.analysis_id)?.preview||null,credit:credits?.find(c=>c.purchase_id===p.id)||null}))});
   }
   if(action==='report') {
     requireClient(user); if(!uuid(body.reportId)) throw new Error('NOT_FOUND');
     const {data:report}=await service.from('feasibility_reports').select('*').eq('id',body.reportId).eq('owner_id',user.id).maybeSingle();
     if(!report) throw new Error('NOT_FOUND');
     const {data:purchase}=await service.from('feasibility_purchases').select('status,is_test').eq('id',report.purchase_id).eq('owner_id',user.id).maybeSingle();
     if(purchase?.status!=='paid') throw new Error('REPORT_LOCKED');
     return reply({report,isTest:purchase.is_test});
   }
   if(action==='campaigns') {
     requireClient(user);
     const {data,error}=await service.from('campaigns').select('id,title,city,status,total_amount,created_at').eq('user_id',user.id).eq('source','quote_requests').in('status',['pending_review','approved','scheduled']).order('created_at',{ascending:false}).limit(100);
     if(error) throw new Error('LOAD_FAILED');
     const campaigns=[];
     for(const c of data||[]) campaigns.push({...c,settlement:await rpc('feasibility_campaign_settlement',{p_campaign_id:c.id})});
     return reply({campaigns});
   }
   if(action==='apply_credit') {
     requireClient(user); if(!uuid(body.creditId)||!uuid(body.campaignId)||!uuid(body.requestId)) throw new Error('INVALID_REQUEST');
     const application=await rpc('feasibility_apply_credit',{p_actor:user.id,p_credit:body.creditId,p_campaign:body.campaignId,p_request:body.requestId});
     return reply({application,settlement:await rpc('feasibility_campaign_settlement',{p_campaign_id:body.campaignId})});
   }
   if(action==='verify_eligibility' || action==='verify_residual') {
     requireAdmin(user);
     if(body.verified!==true || !uuid(body.campaignId)||!uuid(body.requestId)) throw new Error('RECEIPT_VERIFICATION_REQUIRED');
     if(action==='verify_eligibility') {
       if(!uuid(body.ownerId)||!Number.isSafeInteger(body.grossCents)||typeof body.confirmedAt!=='string') throw new Error('INVALID_REQUEST');
       return reply({eventId:await rpc('feasibility_verify_eligibility',{p_actor:user.id,p_campaign:body.campaignId,p_owner:body.ownerId,p_gross:body.grossCents,p_confirmed:body.confirmedAt,p_reference:body.reference||'',p_request:body.requestId})});
     }
     if(!Number.isSafeInteger(body.amountCents)) throw new Error('INVALID_REQUEST');
     return reply({eventId:await rpc('feasibility_verify_residual',{p_actor:user.id,p_campaign:body.campaignId,p_amount:body.amountCents,p_reference:body.reference||'',p_request:body.requestId})});
   }
   if(action==='admin_list') {
     requireAdmin(user);
     const {data,error}=await service.from('feasibility_purchases').select('id,owner_id,option,status,amount_cents,created_at,paid_at,payment_reference,is_test').order('created_at',{ascending:false}).limit(100);
     if(error) throw new Error('LOAD_FAILED'); return reply({purchases:data});
   }
   if(action==='verify_payment') {
     requireAdmin(user);
     if(body.receiptVerified!==true||!uuid(body.purchaseId)||!uuid(body.requestId)||typeof body.reference!=='string') throw new Error('RECEIPT_VERIFICATION_REQUIRED');
     return reply({purchase:await rpc('feasibility_verify_payment',{p_actor:user.id,p_purchase:body.purchaseId,p_reference:body.reference,p_request:body.requestId})});
   }
   return reply({error:'UNKNOWN_ACTION'},400);
 } catch(error) {
   const message=error instanceof Error?error.message:'REQUEST_FAILED';
   const allowed=['AUTH_REQUIRED','CLIENT_REQUIRED','ADMIN_REQUIRED','NOT_FOUND','REPORT_LOCKED','MESSAGE_LIMIT','NARRATIVE_LIMIT','DAILY_LIMIT','ANALYSIS_FROZEN','CREDIT_ALREADY_USED','CREDIT_EXPIRED','CAMPAIGN_NOT_ELIGIBLE','PAYMENT_NOT_ELIGIBLE','AMOUNT_UNAVAILABLE','REPORT_REQUIRED','PURCHASE_ALREADY_EXISTS','RECEIPT_REFERENCE_REQUIRED','RECEIPT_VERIFICATION_REQUIRED','TEST_CAMPAIGN_REQUIRED','TEST_REFERENCE_REQUIRED','REQUEST_ALREADY_USED','REVIEW_REQUIRED','ELIGIBILITY_VERIFICATION_REQUIRED','APPLIED_SNAPSHOT_IMMUTABLE'];
   const code=allowed.find(code=>message.includes(code))||'REQUEST_FAILED';
   return reply({error:code},code==='AUTH_REQUIRED'?401:code.endsWith('_REQUIRED')&&code!=='REPORT_REQUIRED'?403:code==='NOT_FOUND'?404:409);
 }
}
