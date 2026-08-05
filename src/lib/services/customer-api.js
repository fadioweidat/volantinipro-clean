import { ensureSupabaseSessionBridge, supabase } from '../../supabaseClient.js';
import { normalizeCustomerCampaign } from '../customerCampaigns.js';
import {
  calculateDistanceKm,
  createProofPhotoSignedUrl,
  getCampaignGpsPoints,
  getCampaignGpsSessions,
  getCampaignProofPhotos,
} from './gps-api.js';

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
  const [points, sessions, photos] = await Promise.all([
    getCampaignGpsPoints(campaignId),
    getCampaignGpsSessions(campaignId),
    getCampaignProofPhotos(campaignId, { approvedOnly: true }),
  ]);
  const approvedPhotos = await Promise.all((photos || []).map(async (photo) => ({
    ...photo,
    signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
  })));
  return { campaign, points, sessions, photos: approvedPhotos };
}

export async function getOwnedCustomerReport(campaignId) {
  const tracking = await getOwnedCustomerTracking(campaignId);
  return {
    ...tracking,
    totalKm: calculateDistanceKm(tracking.points),
  };
}
