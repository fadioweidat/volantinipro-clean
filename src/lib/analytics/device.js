// Analytics Visitatori — parsing User-Agent → famiglia (NO fingerprint).
// Solo device_type + browser family + os family. PURO.

const BOT_RE = /(bot|crawler|spider|crawl|slurp|mediapartners|facebookexternalhit|embedly|quora link|pinterest|redditbot|whatsapp|telegrambot|preview|lighthouse|headlesschrome|puppeteer|playwright|python-requests|curl|wget|axios|node-fetch|go-http|semrush|ahrefs|dotbot|bingpreview)/i;
const TABLET_RE = /(ipad|tablet|playbook|silk|(android(?!.*mobile)))/i;
const MOBILE_RE = /(mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|iemobile)/i;

export function deviceTypeFromUA(ua) {
  const s = String(ua || '');
  if (!s) return 'desktop';
  if (BOT_RE.test(s)) return 'bot';
  if (TABLET_RE.test(s)) return 'tablet';
  if (MOBILE_RE.test(s)) return 'mobile';
  return 'desktop';
}

export function browserFamilyFromUA(ua) {
  const s = String(ua || '');
  if (/edg[ae]?\//i.test(s)) return 'Edge';
  if (/opr\/|opera/i.test(s)) return 'Opera';
  if (/samsungbrowser/i.test(s)) return 'Samsung Internet';
  if (/firefox\/|fxios/i.test(s)) return 'Firefox';
  if (/chrome\/|crios\//i.test(s) && !/edg/i.test(s)) return 'Chrome';
  if (/safari\//i.test(s) && /version\//i.test(s)) return 'Safari';
  if (/msie |trident\//i.test(s)) return 'Internet Explorer';
  return 'Other';
}

export function osFamilyFromUA(ua) {
  const s = String(ua || '');
  if (/iphone|ipad|ipod|ios /i.test(s)) return 'iOS';
  if (/android/i.test(s)) return 'Android';
  if (/windows nt|win64|win32/i.test(s)) return 'Windows';
  if (/mac os x|macintosh/i.test(s)) return 'macOS';
  if (/cros/i.test(s)) return 'ChromeOS';
  if (/linux/i.test(s)) return 'Linux';
  return 'Other';
}

export function parseUserAgent(ua) {
  return {
    device_type: deviceTypeFromUA(ua),
    browser: browserFamilyFromUA(ua),
    os: osFamilyFromUA(ua),
  };
}

// Lato client: preferisci userAgentData quando c'è (nessun parsing UA string),
// fallback al parser sopra.
export function detectClientDevice() {
  if (typeof navigator === 'undefined') return { device_type: 'desktop', browser: 'Other', os: 'Other' };
  const ua = navigator.userAgent || '';
  const parsed = parseUserAgent(ua);
  try {
    if (navigator.userAgentData) {
      const mobile = navigator.userAgentData.mobile;
      if (typeof mobile === 'boolean' && parsed.device_type !== 'tablet' && parsed.device_type !== 'bot') {
        parsed.device_type = mobile ? 'mobile' : 'desktop';
      }
      const brands = navigator.userAgentData.brands || [];
      const b = brands.find((x) => /Chrome|Edge|Opera|Firefox/i.test(x.brand));
      if (b) parsed.browser = b.brand.replace(/ ?(Not.?A.?Brand|Chromium)/i, '').trim() || parsed.browser;
    }
  } catch {
    /* userAgentData non disponibile */
  }
  return parsed;
}
