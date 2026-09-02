import { supabase } from '../../supabaseClient.js';
import { logAuditEvent } from '../audit.js';

/**
 * QR & Landing Analytics Service
 * Generates QR codes, manages unique tracking slugs, records real scans, and provides analytics.
 */

export function generateQrSvgUrl(text, size = 240) {
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}&format=svg&margin=1`;
}

export function generateCampaignQrSlug(campaignId) {
  const cleanId = String(campaignId || 'camp').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `vp-${cleanId}-${randomSuffix}`;
}

export function buildCampaignQrInfo(campaign) {
  if (!campaign) return null;
  const meta = campaign.metadata || {};
  const slug = meta.qr_slug || generateCampaignQrSlug(campaign.id);
  const targetUrl = meta.qr_target_url || campaign.website || 'https://volantinipro.it';
  const qrRedirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/q/${slug}` : `https://volantinipro.it/q/${slug}`;
  
  return {
    slug,
    targetUrl,
    qrRedirectUrl,
    qrSvgUrl: generateQrSvgUrl(qrRedirectUrl),
    configured: Boolean(meta.qr_slug || meta.qr_target_url),
  };
}

export async function recordQrScanEvent(slug, reqMetadata = {}) {
  if (!slug) return null;
  
  const userAgent = reqMetadata.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown');
  const isBot = /bot|googlebot|crawler|spider|robot|crawling/i.test(userAgent);
  if (isBot) {
    console.info('[QR_SCAN_BOT_IGNORED]', { slug, userAgent });
    return { status: 'ignored_bot' };
  }

  const timestamp = new Date().toISOString();
  const rawIp = reqMetadata.ip || 'local';
  
  let ipHash = 'anon';
  try {
    if (crypto?.subtle) {
      const msgUint8 = new TextEncoder().encode(rawIp + '-salt-vp');
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      ipHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    }
  } catch {}

  const deviceType = /mobile|iphone|android|ipad/i.test(userAgent) ? 'mobile' : 'desktop';
  const referrer = reqMetadata.referrer || (typeof document !== 'undefined' ? document.referrer : '');

  const scanRecord = {
    slug,
    scanned_at: timestamp,
    ip_hash: ipHash,
    device_type: deviceType,
    referrer: referrer ? referrer.slice(0, 250) : null,
  };

  try {
    if (supabase) {
      const { error } = await supabase.from('campaign_qr_scans').insert([scanRecord]);
      if (error && import.meta.env?.DEV) {
        console.warn('[QR_SCAN_DB_RECORD_FALLBACK]', error.message);
      }
    }
  } catch (err) {
    console.warn('[QR_SCAN_RECORD_ERROR]', err);
  }

  try {
    const key = `vp_qr_scans_${slug}`;
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    stored.push(scanRecord);
    localStorage.setItem(key, JSON.stringify(stored.slice(-500)));
  } catch {}

  return scanRecord;
}

export async function getCampaignQrStats(campaignId, slug) {
  if (!slug && !campaignId) return { totalScans: 0, uniqueVisitors: 0, scans: [], loading: false };

  let scans = [];
  try {
    if (supabase && slug) {
      const { data, error } = await supabase
        .from('campaign_qr_scans')
        .select('*')
        .eq('slug', slug)
        .order('scanned_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        scans = data;
      }
    }
  } catch (e) {
    console.warn('[QR_STATS_FETCH_ERROR]', e);
  }

  if (scans.length === 0 && slug) {
    try {
      const stored = JSON.parse(localStorage.getItem(`vp_qr_scans_${slug}`) || '[]');
      if (Array.isArray(stored)) scans = stored;
    } catch {}
  }

  const uniqueIps = new Set(scans.map(s => s.ip_hash).filter(Boolean));
  const mobileCount = scans.filter(s => s.device_type === 'mobile').length;
  const desktopCount = scans.filter(s => s.device_type === 'desktop').length;

  return {
    totalScans: scans.length,
    uniqueVisitors: uniqueIps.size || (scans.length > 0 ? scans.length : 0),
    mobileCount,
    desktopCount,
    scans,
    lastScannedAt: scans[0]?.scanned_at || null,
  };
}
