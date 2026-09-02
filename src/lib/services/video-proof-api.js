import { supabase } from '../../supabaseClient.js';
import { logAuditEvent } from '../audit.js';

const BUCKET = 'documents';
const MAX_VIDEO_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

export function validateVideoFile(file) {
  if (!file) return { valid: false, error: 'Nessun file selezionato.' };
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return { valid: false, error: 'Il file supera la dimensione massima consentita (150 MB).' };
  }
  const isTypeAllowed = ALLOWED_VIDEO_TYPES.includes(file.type) || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
  if (!isTypeAllowed) {
    return { valid: false, error: 'Formato video non supportato. Usa MP4, WebM o MOV.' };
  }
  return { valid: true, error: null };
}

export async function uploadCampaignVideo(campaignId, file) {
  if (!campaignId) throw new Error('ID campagna obbligatorio per il caricamento del video proof.');
  const validation = validateVideoFile(file);
  if (!validation.valid) throw new Error(validation.error);

  const cleanFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `campaigns/${campaignId}/video-proof/${cleanFilename}`;

  if (!supabase) {
    // Local development fallback
    const localVideoInfo = {
      storage_path: storagePath,
      filename: file.name,
      size: file.size,
      uploaded_at: new Date().toISOString(),
      status: 'pronto',
      preview_url: URL.createObjectURL(file),
    };
    try {
      localStorage.setItem(`vp_video_${campaignId}`, JSON.stringify(localVideoInfo));
    } catch {}
    return localVideoInfo;
  }

  // Upload to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      upsert: true,
      contentType: file.type || 'video/mp4',
    });

  if (uploadError) {
    console.error('[VIDEO_PROOF_UPLOAD_ERROR]', uploadError);
    throw new Error(`Errore caricamento video: ${uploadError.message}`);
  }

  const videoMeta = {
    storage_path: storagePath,
    filename: file.name,
    size: file.size,
    uploaded_at: new Date().toISOString(),
    status: 'pronto',
  };

  // Update campaign metadata
  try {
    const { data: currentCamp } = await supabase.from('campagne').select('metadata').eq('id', campaignId).single();
    const updatedMeta = { ...(currentCamp?.metadata || {}), video_proof: videoMeta };
    await supabase.from('campagne').update({ metadata: updatedMeta }).eq('id', campaignId);
  } catch (err) {
    console.warn('[VIDEO_PROOF_META_UPDATE_WARN]', err);
  }

  logAuditEvent({
    action: 'campaign_video_proof_uploaded',
    resourceId: campaignId,
    metadata: { filename: file.name, size: file.size, storagePath },
  });

  return videoMeta;
}

export async function getCampaignVideoInfo(campaignId, campaign = null) {
  if (!campaignId) return null;

  let videoMeta = campaign?.metadata?.video_proof || null;

  if (!videoMeta && supabase) {
    try {
      const { data } = await supabase.from('campagne').select('metadata').eq('id', campaignId).single();
      videoMeta = data?.metadata?.video_proof || null;
    } catch {}
  }

  if (!videoMeta) {
    try {
      const stored = JSON.parse(localStorage.getItem(`vp_video_${campaignId}`) || 'null');
      if (stored) videoMeta = stored;
    } catch {}
  }

  if (!videoMeta) return null;

  let signedUrl = videoMeta.preview_url || null;
  if (videoMeta.storage_path && supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(videoMeta.storage_path, 3600); // 1 hour signed URL
      if (!error && data?.signedUrl) {
        signedUrl = data.signedUrl;
      }
    } catch (e) {
      console.warn('[VIDEO_PROOF_SIGNED_URL_ERROR]', e);
    }
  }

  return {
    ...videoMeta,
    signedUrl,
  };
}

export async function deleteCampaignVideo(campaignId, storagePath) {
  if (!campaignId) return;

  if (storagePath && supabase) {
    try {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    } catch {}
  }

  if (supabase) {
    try {
      const { data: currentCamp } = await supabase.from('campagne').select('metadata').eq('id', campaignId).single();
      const updatedMeta = { ...(currentCamp?.metadata || {}) };
      delete updatedMeta.video_proof;
      await supabase.from('campagne').update({ metadata: updatedMeta }).eq('id', campaignId);
    } catch {}
  }

  try {
    localStorage.removeItem(`vp_video_${campaignId}`);
  } catch {}

  logAuditEvent({
    action: 'campaign_video_proof_deleted',
    resourceId: campaignId,
  });
}
