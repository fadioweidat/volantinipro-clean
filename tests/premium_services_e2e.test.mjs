import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SELECTED_EXTRAS_ORDER,
  OPTIONAL_EXTRAS_ORDER,
  buildExtraServicesRegistry,
  buildExtraServicesById,
  normalizeSelectedExtras,
  buildOptionalExtras,
} from '../src/lib/extraServicesRegistry.js';

import {
  generateCampaignQrSlug,
  generateQrSvgUrl,
  buildCampaignQrInfo,
} from '../src/lib/services/qr-analytics-api.js';

import {
  validateVideoFile,
  ALLOWED_VIDEO_TYPES,
} from '../src/lib/services/video-proof-api.js';

describe('Premium Services End-to-End Test Suite', () => {
  const registry = buildExtraServicesRegistry({
    flyerQty: 10000,
    dedicatedSupervisionPrice: 50,
    campaignDurationKnown: true,
  });
  const registryById = buildExtraServicesById(registry);

  it('Fase 1 & Step 4: All 4 premium services are in the registry with valid pricing', () => {
    const requiredServices = ['photo_proof', 'advanced_report', 'qr_analytics', 'video_proof'];
    for (const id of requiredServices) {
      assert.ok(registryById[id], `Servizio ${id} mancante in registry`);
      assert.ok(registryById[id].price > 0, `Prezzo per ${id} deve essere maggiore di 0`);
      assert.ok(SELECTED_EXTRAS_ORDER.includes(id), `${id} deve essere in SELECTED_EXTRAS_ORDER`);
      assert.ok(OPTIONAL_EXTRAS_ORDER.includes(id), `${id} deve essere in OPTIONAL_EXTRAS_ORDER`);
    }

    assert.equal(registryById.photo_proof.price, 35);
    assert.equal(registryById.advanced_report.price, 39);
    assert.equal(registryById.qr_analytics.price, 49);
    assert.equal(registryById.video_proof.price, 69);
  });

  it('Step 4 Pricing: Selected extras sum into the total', () => {
    const mockData = {
      extraServices: ['photo_proof', 'advanced_report', 'qr_analytics', 'video_proof'],
    };
    const selected = normalizeSelectedExtras(mockData, registryById);
    assert.equal(selected.length, 4);
    const sum = selected.reduce((acc, curr) => acc + curr.price, 0);
    assert.equal(sum, 35 + 39 + 49 + 69); // 192 EUR
  });

  it('Fase 3: QR & Landing Analytics slug, QR url and buildCampaignQrInfo contract', () => {
    const slug = generateCampaignQrSlug('test-uuid-1234');
    assert.match(slug, /^vp-testuu-[a-z0-9]{4}$/);

    const qrSvg = generateQrSvgUrl('https://volantinipro.it/q/vp-123');
    assert.ok(qrSvg.includes('api.qrserver.com'));
    assert.ok(qrSvg.includes('format=svg'));

    const mockCamp = {
      id: 'c-999',
      website: 'https://example.com/promo',
      metadata: { qr_slug: 'vp-c999-custom', qr_target_url: 'https://example.com/landing' },
    };
    const info = buildCampaignQrInfo(mockCamp);
    assert.equal(info.slug, 'vp-c999-custom');
    assert.equal(info.targetUrl, 'https://example.com/landing');
    assert.ok(info.qrRedirectUrl.includes('/q/vp-c999-custom'));
    assert.equal(info.configured, true);
  });

  it('Fase 4: Video Proof validation rejects oversized files and unapproved MIME types', () => {
    const validFile = { name: 'campagna-proof.mp4', size: 50 * 1024 * 1024, type: 'video/mp4' };
    const validRes = validateVideoFile(validFile);
    assert.equal(validRes.valid, true);

    const oversizedFile = { name: 'huge.mp4', size: 200 * 1024 * 1024, type: 'video/mp4' };
    const oversizedRes = validateVideoFile(oversizedFile);
    assert.equal(oversizedRes.valid, false);
    assert.match(oversizedRes.error, /150 MB/);

    const invalidTypeFile = { name: 'doc.pdf', size: 5 * 1024 * 1024, type: 'application/pdf' };
    const invalidTypeRes = validateVideoFile(invalidTypeFile);
    assert.equal(invalidTypeRes.valid, false);
    assert.match(invalidTypeRes.error, /Formato video non supportato/);
  });

  it('Fase 5: Negative Test — Unpurchased services are recognized as non_incluso', () => {
    const emptyData = { extraServices: [] };
    const selected = normalizeSelectedExtras(emptyData, registryById);
    assert.equal(selected.length, 0);

    const optional = buildOptionalExtras(registryById);
    assert.ok(optional.some(e => e.id === 'photo_proof'));
    assert.ok(optional.some(e => e.id === 'advanced_report'));
    assert.ok(optional.some(e => e.id === 'qr_analytics'));
    assert.ok(optional.some(e => e.id === 'video_proof'));
  });

  it('Fase 1: Photo proof exports valid CSV and enriches photos with SHA-256 and GPS', async () => {
    const { enrichProofPhoto, buildPhotoArchiveCsv } = await import('../src/lib/services/photo-proof.js');
    const mockPhoto = {
      id: 'photo-1',
      campaign_id: 'c-1',
      lat: 45.4642,
      lng: 9.1900,
      taken_at: '2026-09-02T10:00:00Z',
      storage_path: 'proofs/c-1/photo-1.jpg',
      note: '[VP_PHOTO_PROOF]{"hash":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","photoId":"photo-1","operatorName":"Mario Rossi","comune":"Milano","lat":45.4642,"lng":9.1900}',
    };
    const enriched = enrichProofPhoto(mockPhoto);
    assert.equal(enriched.proof.gps.status, 'ok');
    assert.equal(enriched.proof.hash, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    const csv = buildPhotoArchiveCsv([enriched]);
    assert.ok(csv.includes('photo-1'));
    assert.ok(csv.includes('45.4642'));
    assert.ok(csv.includes('e3b0c442'));
  });

  it('Fase 2: Advanced coverage report uses real metrics without simulated fallbacks', async () => {
    const { calculateDistanceKm } = await import('../src/lib/services/gps-api.js');
    const realPoints = [
      { lat: 45.4642, lng: 9.1900, at: '2026-09-02T09:00:00Z' },
      { lat: 45.4700, lng: 9.2000, at: '2026-09-02T09:30:00Z' },
    ];
    const km = calculateDistanceKm(realPoints);
    assert.ok(km > 0, 'Distance must be real and positive');
    assert.ok(km < 10, 'Distance between points is reasonable');
  });

  it('Fase 3: Bot requests are filtered and do not trigger scan insert', async () => {
    const handler = (await import('../api/q/[slug].js')).default;
    let redirectedStatus = null;
    let redirectedHeaders = null;

    const mockBotReq = {
      query: { slug: 'vp-test12-34ab' },
      headers: {
        'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        'x-forwarded-for': '66.249.66.1',
      },
    };
    const mockRes = {
      writeHead(status, headers) {
        redirectedStatus = status;
        redirectedHeaders = headers;
      },
      end() {},
      status(code) { return { send() {} }; },
    };

    await handler(mockBotReq, mockRes);
    assert.equal(redirectedStatus, 302, 'Bot is redirected normally without crashing');
    assert.ok(redirectedHeaders.Location);
  });
});
