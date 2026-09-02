import React, { useEffect, useState } from 'react';
import { recordQrScanEvent } from '../lib/services/qr-analytics-api.js';
import { supabase } from '../lib/supabaseClient.js';

export function QrRedirectPage({ slug }) {
  const [status, setStatus] = useState('Reindirizzamento in corso...');
  const [targetUrl, setTargetUrl] = useState(null);

  useEffect(() => {
    let active = true;
    async function handleScanAndRedirect() {
      try {
        const currentSlug = slug || window.location.pathname.split('/q/')[1]?.split('/')[0] || '';
        if (!currentSlug) {
          if (active) setStatus('QR code non valido.');
          return;
        }

        // Record scan
        await recordQrScanEvent(currentSlug, {
          userAgent: navigator.userAgent,
          referrer: document.referrer,
        });

        // Resolve destination URL
        let resolvedUrl = 'https://volantinipro.it';
        if (supabase) {
          const { data } = await supabase
            .from('campagne')
            .select('metadata')
            .contains('metadata', { qr_slug: currentSlug })
            .limit(1)
            .single();

          if (data?.metadata?.qr_target_url) {
            resolvedUrl = data.metadata.qr_target_url;
          }
        }

        // Validate safe HTTP(S) URL
        if (!/^https?:\/\//i.test(resolvedUrl)) {
          resolvedUrl = `https://${resolvedUrl}`;
        }

        if (active) {
          setTargetUrl(resolvedUrl);
          setStatus(`Reindirizzamento verso ${resolvedUrl}...`);
          window.location.replace(resolvedUrl);
        }
      } catch (err) {
        console.warn('[QR_REDIRECT_ERROR]', err);
        if (active) {
          window.location.replace('https://volantinipro.it');
        }
      }
    }

    handleScanAndRedirect();
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0B1020', color: '#F8FAFC', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#E8571A,#D0450B)', display: 'grid', placeItems: 'center', marginBottom: 20, fontSize: 24 }}>
        📱
      </div>
      <h2 style={{ fontSize: 20, margin: '0 0 10px', fontWeight: 800 }}>VolantiniPro Smart QR</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 }}>{status}</p>
      {targetUrl && (
        <a href={targetUrl} style={{ marginTop: 20, color: '#E8571A', fontSize: 13, textDecoration: 'underline' }}>
          Clicca qui se non vieni reindirizzato automaticamente
        </a>
      )}
    </div>
  );
}

export default QrRedirectPage;
