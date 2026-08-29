import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { normalizeCustomerCampaign } from '../customerCampaigns.js';
import {
  calculateDistanceKm,
  createProofPhotoSignedUrl,
  getCustomerCampaignGpsPoints,
  getCustomerCampaignGpsSessions,
  getCampaignProofPhotos,
} from './gps-api.js';
import { getFinalCoverage } from './coverage-adjustments-api.js';
import { getCustomerIssues } from './customer-issues-api.js';

export class CustomerCampaignAccessError extends Error {
  constructor(message = 'Campagna non trovata o non autorizzata.') {
    super(message);
    this.name = 'CustomerCampaignAccessError';
    this.code = 'customer_campaign_forbidden';
  }
}

export async function getOwnedCustomerCampaign(campaignId) {
  if (!supabase) throw new Error('Supabase non configurato.');
  await ensureSupabaseSessionBridge();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user?.id) throw new CustomerCampaignAccessError('Autenticazione Cliente richiesta.');
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_zones(*)')
    .eq('id', campaignId)
    .eq('user_id', authData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CustomerCampaignAccessError();
  return normalizeCustomerCampaign(data, data.campaign_zones);
}

export async function getOwnedCustomerTracking(campaignId) {
  const campaign = await getOwnedCustomerCampaign(campaignId);
  // Letture customer-safe: select esplicite, nessun dato operatore (nome,
  // telefono, device_id, driver_id, assignment_id, metadata) nel payload che
  // arriva al browser del cliente.
  const [points, sessions, photos, finalCoverage, issues] = await Promise.all([
    getCustomerCampaignGpsPoints(campaignId),
    getCustomerCampaignGpsSessions(campaignId),
    getCampaignProofPhotos(campaignId, { approvedOnly: true }),
    // Copertura VERIFICATA/FINALE unica: e' l'unica geometria che il Cliente
    // deve vedere sulla mappa (GPS reale verificato + verifiche
    // manuali/automatiche - esclusioni), senza distinguere le fonti.
    getFinalCoverage(campaignId).catch(() => null),
    getCustomerIssues(campaignId).catch(() => []),
  ]);
  const approvedPhotos = await Promise.all((photos || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
  // Foto delle segnalazioni: firma la signed url (bucket privato). Restano
  // legate alla singola issue — MAI mescolate con approvedPhotos (gallery).
  const issuesWithPhotos = await Promise.all((Array.isArray(issues) ? issues : []).map(async (issue) => ({
    ...issue,
    photos: await Promise.all((issue.photos || []).map(async (p) => ({
      ...p,
      signedUrl: await createProofPhotoSignedUrl(p.storage_path).catch(() => null),
    }))),
  })));
  return { campaign, points, sessions, photos: approvedPhotos, finalCoverage, issues: issuesWithPhotos };
}

export async function getOwnedCustomerReport(campaignId) {
  const tracking = await getOwnedCustomerTracking(campaignId);
  return {
    ...tracking,
    totalKm: calculateDistanceKm(tracking.points),
  };
}
