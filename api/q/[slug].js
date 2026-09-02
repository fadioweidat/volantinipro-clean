import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const KNOWN_BOT_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /applebot/i,
  /petalbot/i,
];

function isBot(userAgent) {
  if (!userAgent) return true;
  return KNOWN_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.QR_HASH_SALT || 'volantinipro-qr-salt';
  return createHash('sha256').update(ip + salt).digest('hex');
}

function detectDevice(userAgent) {
  if (!userAgent) return 'desktop';
  if (/mobile|android|iphone|ipad|phone/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

function sanitizeTargetUrl(url) {
  if (!url || typeof url !== 'string') return 'https://volantinipro.it';
  const trimmed = url.trim();
  if (/^(javascript|data|file|vbscript):/i.test(trimmed)) {
    return 'https://volantinipro.it';
  }
  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {}
  return 'https://volantinipro.it';
}

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug || typeof slug !== 'string') {
    return res.status(400).send('Invalid slug parameter.');
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  let targetUrl = 'https://volantinipro.it';
  let campaignId = null;

  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Query campagna by metadata->qr_slug
      const { data: campaigns, error } = await supabase
        .from('campagne')
        .select('id, website, metadata')
        .limit(50);

      if (!error && Array.isArray(campaigns)) {
        const match = campaigns.find(
          (c) =>
            c.metadata?.qr_slug === slug ||
            `vp-${String(c.id).slice(0, 6)}` === slug
        );

        if (match) {
          campaignId = match.id;
          targetUrl = match.metadata?.qr_target_url || match.website || targetUrl;
        }
      }

      // Record scan server-side if not bot
      const userAgent = req.headers['user-agent'] || '';
      if (!isBot(userAgent)) {
        const clientIp =
          req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
          req.socket?.remoteAddress ||
          '';

        await supabase.from('campaign_qr_scans').insert({
          campaign_id: campaignId,
          slug,
          ip_hash: hashIp(clientIp),
          device_type: detectDevice(userAgent),
          referrer: req.headers['referer'] || req.headers['referrer'] || null,
        });
      }
    } catch (err) {
      console.error('[QR_REDIRECT_SERVER_ERROR]', err);
    }
  }

  const safeLocation = sanitizeTargetUrl(targetUrl);

  // Server-side HTTP 302 Redirect
  res.writeHead(302, {
    Location: safeLocation,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  res.end();
}
