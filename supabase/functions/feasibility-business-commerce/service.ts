import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

// Independent Business Feasibility commerce backend (ticket "BUSINESS
// FEASIBILITY €49 COMMERCE BACKEND"). Deliberately does NOT import anything
// from feasibility-commerce/service.ts or feasibilityEngine.js/
// feasibilitySchemas.js — those belong to the Campaign Feasibility (flyer)
// product and are firewalled off-limits. Auth/CORS helpers below are a
// small, intentional duplication of that sibling function's shape, not a
// shared dependency.

const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const origins = ['https://volantinipro-clean.vercel.app','https://volantinipro.it','https://www.volantinipro.it','http://localhost:5173'];
const uuid = (v: unknown) => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
// Stable stringify (sorted keys) so the same logical snapshot always hashes
// the same way regardless of client-side key ordering.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

async function identity(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token === anon) return null;
  const { data, error } = await service.auth.getUser(token);
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  const { data: profile, error: profileError } = await service.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
  if (profileError) throw new Error('AUTH_REQUIRED');
  return { id: data.user.id, role: profile?.role, email: data.user.email };
}
function requireClient(user: any) { if (!user) throw new Error('AUTH_REQUIRED'); if (user.role !== 'client') throw new Error('CLIENT_REQUIRED'); }
function requireAdmin(user: any) {
  if (!user || user.role !== 'admin') throw new Error('ADMIN_REQUIRED');
  const allow = (Deno.env.get('BUSINESS_FEASIBILITY_ADMIN_EMAILS') || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (allow.length && !allow.includes(user.email?.toLowerCase())) throw new Error('ADMIN_REQUIRED');
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await service.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

function isPlainObject(v: unknown) { return typeof v === 'object' && v !== null && !Array.isArray(v); }

// Snapshot shape the client must submit at purchase time (§3). Territorial/
// financial engines stay 100% client-side and untouched — this only stores
// what they already computed, it never recomputes break-even/ROI/etc.
function validateSnapshotPayload(body: any) {
  const { businessInputs, territorialResults, financialInputs, financialOutputs, verdict, sourceMetadata, engineVersion, generatedAt } = body;
  if (!isPlainObject(businessInputs) || !isPlainObject(territorialResults) || !isPlainObject(financialInputs) || !isPlainObject(financialOutputs)) throw new Error('INVALID_REQUEST');
  if (typeof verdict !== 'string' || !verdict.trim() || verdict.length > 60) throw new Error('INVALID_REQUEST');
  if (sourceMetadata !== undefined && sourceMetadata !== null && !isPlainObject(sourceMetadata)) throw new Error('INVALID_REQUEST');
  if (typeof engineVersion !== 'string' || !engineVersion.trim() || engineVersion.length > 60) throw new Error('INVALID_REQUEST');
  const generated = new Date(generatedAt);
  if (!generatedAt || Number.isNaN(generated.getTime()) || generated.getTime() > Date.now() + 60000) throw new Error('INVALID_REQUEST');
  return { businessInputs, territorialResults, financialInputs, financialOutputs, verdict: verdict.trim(), sourceMetadata: sourceMetadata || {}, engineVersion: engineVersion.trim(), generatedAt: generated.toISOString() };
}

// §6/§7 field contract — the ONLY fields a free/unpaid caller ever sees.
// Deliberately a fixed allowlist picked from named keys, never "return the
// row minus some fields": an unlisted or renamed source field is simply
// absent from the preview, never accidentally leaked.
function buildPreview(analysis: any) {
  const t = analysis.territorial_results || {};
  const f = analysis.financial_outputs || {};
  const b = analysis.business_inputs || {};
  const src = analysis.data_source_metadata || {};
  return {
    businessAnalysisId: analysis.id,
    businessName: b.businessName ?? null,
    location: b.location ?? null,
    territorialPotential: t.potentialLabel ?? null,
    dataReliability: t.dataReliabilityLabel ?? null,
    competitionLevel: t.competitionLevel ?? null,
    audience: { population: t.audiencePopulation ?? null, families: t.audienceFamilies ?? null },
    opportunity: t.opportunity ?? null,
    risk: t.risk ?? null,
    breakEvenCustomers: f.breakEvenCustomers ?? null,
    verdict: analysis.verdict,
    verdictWhy: src.verdictWhy ?? null,
    generatedAt: analysis.generated_at,
  };
}

export async function handleBusinessCommerce(request: Request) {
  const origin = request.headers.get('origin') || '';
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'authorization,apikey,content-type', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (!origins.includes(origin)) return reply({ error: 'ORIGIN' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'METHOD' }, 405);
  if (request.headers.get('apikey') !== anon) return reply({ error: 'AUTH_REQUIRED' }, 401);
  try {
    if (Number(request.headers.get('content-length')) > 30000) return reply({ error: 'SIZE' }, 413);
    const raw = await request.text(); if (raw.length > 30000) return reply({ error: 'SIZE' }, 413);
    const body = JSON.parse(raw);
    const { action } = body;
    const user = await identity(request);

    if (action === 'purchase') {
      requireClient(user);
      if (!uuid(body.requestId)) throw new Error('INVALID_REQUEST');
      const snap = validateSnapshotPayload(body);
      const contentSha256 = await sha256(stableStringify({ b: snap.businessInputs, t: snap.territorialResults, fi: snap.financialInputs, fo: snap.financialOutputs, v: snap.verdict, e: snap.engineVersion }));
      const purchase = await rpc('business_feasibility_create_purchase', {
        p_actor: user!.id, p_business_inputs: snap.businessInputs, p_territorial: snap.territorialResults,
        p_financial_inputs: snap.financialInputs, p_financial_outputs: snap.financialOutputs, p_verdict: snap.verdict,
        p_source_metadata: snap.sourceMetadata, p_engine_version: snap.engineVersion, p_generated_at: snap.generatedAt,
        p_content_sha256: contentSha256, p_request: body.requestId,
      });
      // Bank-transfer instructions are rendered client-side from
      // lib/bankTransfer.js (already env-backed, already used elsewhere) —
      // deliberately NOT duplicated here (§16).
      return reply({ purchase });
    }

    if (action === 'get_purchase') {
      requireClient(user);
      if (!uuid(body.purchaseId)) throw new Error('INVALID_REQUEST');
      const { data: purchase } = await service.from('business_feasibility_purchases').select('*').eq('id', body.purchaseId).eq('owner_id', user!.id).maybeSingle();
      if (!purchase) throw new Error('NOT_FOUND');
      return reply({ purchase });
    }

    if (action === 'get_preview') {
      requireClient(user);
      if (!uuid(body.businessAnalysisId)) throw new Error('INVALID_REQUEST');
      const { data: analysis } = await service.from('business_feasibility_analyses').select('*').eq('id', body.businessAnalysisId).eq('owner_id', user!.id).maybeSingle();
      if (!analysis) throw new Error('NOT_FOUND');
      return reply({ preview: buildPreview(analysis) });
    }

    if (action === 'get_report') {
      requireClient(user);
      if (!uuid(body.purchaseId)) throw new Error('INVALID_REQUEST');
      const { data: purchase } = await service.from('business_feasibility_purchases').select('*').eq('id', body.purchaseId).eq('owner_id', user!.id).maybeSingle();
      if (!purchase) throw new Error('NOT_FOUND');
      if (purchase.status !== 'paid') throw new Error('PAYMENT_REQUIRED'); // §7/§11/§12 — never the full snapshot to an unpaid/revoked owner
      const { data: analysis } = await service.from('business_feasibility_analyses').select('*').eq('id', purchase.business_analysis_id).maybeSingle();
      if (!analysis) throw new Error('NOT_FOUND');
      return reply({ purchase, analysis });
    }

    if (action === 'verify_payment') {
      requireAdmin(user);
      if (!uuid(body.purchaseId) || !uuid(body.requestId) || typeof body.confirmation !== 'string') throw new Error('RECEIPT_CONFIRMATION_REQUIRED');
      const purchase = await rpc('business_feasibility_verify_payment', { p_actor: user!.id, p_purchase: body.purchaseId, p_confirmation: body.confirmation, p_request: body.requestId });
      return reply({ purchase });
    }

    if (action === 'revoke') {
      requireAdmin(user);
      if (!uuid(body.purchaseId) || !uuid(body.requestId)) throw new Error('INVALID_REQUEST');
      const purchase = await rpc('business_feasibility_revoke', { p_actor: user!.id, p_purchase: body.purchaseId, p_reason: body.reason || '', p_request: body.requestId });
      return reply({ purchase });
    }

    if (action === 'admin_list') {
      requireAdmin(user);
      const { data: purchases, error } = await service.from('business_feasibility_purchases')
        .select('id,owner_id,business_analysis_id,status,amount_cents,currency,payment_reference,created_at,updated_at,paid_at,verified_by,revoked_at,revoked_by')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error('LOAD_FAILED');
      const analysisIds = [...new Set((purchases || []).map((p: any) => p.business_analysis_id))];
      const ownerIds = [...new Set((purchases || []).map((p: any) => p.owner_id))];
      const [{ data: analyses }, { data: owners }] = await Promise.all([
        analysisIds.length ? service.from('business_feasibility_analyses').select('id,business_inputs,verdict,generated_at').in('id', analysisIds) : Promise.resolve({ data: [] as any[] }),
        ownerIds.length ? service.from('profiles').select('id,full_name,company_name').in('id', ownerIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const rows = (purchases || []).map((p: any) => {
        const a = analyses?.find((x: any) => x.id === p.business_analysis_id);
        const o = owners?.find((x: any) => x.id === p.owner_id);
        return { ...p, businessName: a?.business_inputs?.businessName ?? null, verdict: a?.verdict ?? null, analysisDate: a?.generated_at ?? null, customer: o?.company_name || o?.full_name || null };
      });
      return reply({ purchases: rows });
    }

    return reply({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'REQUEST_FAILED';
    const allowed = ['AUTH_REQUIRED','CLIENT_REQUIRED','ADMIN_REQUIRED','INVALID_REQUEST','NOT_FOUND','PAYMENT_REQUIRED','REQUEST_ALREADY_USED','RECEIPT_CONFIRMATION_REQUIRED','INVALID_PAYMENT_STATE','LOAD_FAILED'];
    const code = allowed.find(c => message.includes(c)) || 'REQUEST_FAILED';
    return reply({ error: code }, code === 'AUTH_REQUIRED' ? 401 : code.endsWith('_REQUIRED') ? 403 : code === 'NOT_FOUND' ? 404 : 409);
  }
}
