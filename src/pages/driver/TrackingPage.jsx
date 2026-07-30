import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGpsTracking } from '../../hooks/useGpsTracking.js';
import { PodCapture } from '../../components/driver/PodCapture.jsx';
import {
  createProofPhotoSignedUrl,
  getCampaignProofPhotos,
  getCurrentOperatorProfile,
} from '../../lib/services/gps-api.js';
import { parseProofPhotoNote, podOutcomeLabel } from '../../lib/pod/podPhotoProcessing.js';

function resolveOperatorDisplayName(profile) {
  if (!profile) return null;
  return profile.full_name || profile.fullName || profile.name || profile.display_name || profile.displayName || null;
}

export function TrackingPage({ campaignId }) {
  const tracking = useGpsTracking(campaignId);
  const [uploadState, setUploadState] = useState({ loading: false, message: null, error: null });
  const [driverName, setDriverName] = useState(null);
  const [photosState, setPhotosState] = useState({ loading: true, error: null, photos: [] });

  useEffect(() => {
    let cancelled = false;
    getCurrentOperatorProfile()
      .then((profile) => { if (!cancelled) setDriverName(resolveOperatorDisplayName(profile)); })
      .catch(() => { if (!cancelled) setDriverName(null); });
    return () => { cancelled = true; };
  }, []);

  const loadRecentPhotos = useCallback(async () => {
    if (!campaignId) return;
    setPhotosState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const photos = await getCampaignProofPhotos(campaignId);
      const withUrls = await Promise.all(photos.slice(0, 8).map(async (photo) => ({
        ...photo,
        signedUrl: await createProofPhotoSignedUrl(photo.storage_path).catch(() => null),
        meta: parseProofPhotoNote(photo.note),
      })));
      setPhotosState({ loading: false, error: null, photos: withUrls });
    } catch (err) {
      setPhotosState({ loading: false, error: err?.message || 'Errore caricamento foto inviate.', photos: [] });
    }
  }, [campaignId]);

  useEffect(() => {
    loadRecentPhotos();
  }, [loadRecentPhotos]);

  const statusLabel = useMemo(() => {
    if (tracking.status === 'active') return 'GPS attivo';
    if (tracking.status === 'paused') return 'In pausa';
    if (tracking.status === 'completed') return 'Distribuzione terminata';
    if (tracking.status === 'permission_error') return 'Errore permesso GPS';
    return 'Non iniziata';
  }, [tracking.status]);

  const assignmentLabel = useMemo(() => {
    if (tracking.assignmentState.status === 'valid') return 'Assegnazione valida';
    if (tracking.assignmentState.status === 'checking') return 'Verifica assegnazione...';
    if (tracking.assignmentState.status === 'invalid') return 'Assegnazione non valida';
    return 'Assegnazione da verificare';
  }, [tracking.assignmentState.status]);

  async function handle(action) {
    try {
      setUploadState((prev) => ({ ...prev, error: null }));
      await action();
    } catch (err) {
      setUploadState({ loading: false, message: null, error: err?.message || 'Operazione non riuscita.' });
    }
  }

  return (
    <GpsShell title="Tracking distribuzione" subtitle={`Campagna ${campaignId}`}>
      <section style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <p style={eyebrowStyle}>Stato operativo</p>
            <h1 style={{ margin: 0, fontSize: 28 }}>{statusLabel}</h1>
          </div>
          <StatusPill status={tracking.status} />
        </div>

        {tracking.error && <div style={errorStyle}>{tracking.error}</div>}
        {tracking.assignmentState.error && <div style={errorStyle}>{tracking.assignmentState.error}</div>}

        <div style={metricGridStyle}>
          <Metric label="Assignment" value={assignmentLabel} />
          <Metric label="Accuracy" value={tracking.accuracy != null ? `${Math.round(tracking.accuracy)} m` : 'n/d'} />
          <Metric label="Ultimo invio" value={tracking.lastSentAt ? new Date(tracking.lastSentAt).toLocaleTimeString('it-IT') : 'nessuno'} />
          <Metric label="Sessione" value={tracking.session?.id ? tracking.session.id.slice(0, 8) : 'non avviata'} />
          <Metric label="Rete" value={tracking.networkStatus} />
          <Metric label="Coda locale" value={tracking.queueSize} />
          <Metric label="Wake lock" value={tracking.wakeLockStatus} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tracking.status === 'idle' || tracking.status === 'completed' || tracking.status === 'permission_error' ? (
            <button style={primaryButtonStyle} type="button" onClick={() => handle(tracking.start)} disabled={!tracking.canStart}>
              Inizia distribuzione
            </button>
          ) : null}
          {tracking.status === 'active' && (
            <button style={secondaryButtonStyle} type="button" onClick={() => handle(tracking.pause)}>
              Pausa
            </button>
          )}
          {tracking.status === 'paused' && (
            <button style={primaryButtonStyle} type="button" onClick={() => handle(tracking.resume)}>
              Riprendi
            </button>
          )}
          {(tracking.status === 'active' || tracking.status === 'paused') && (
            <button style={dangerButtonStyle} type="button" onClick={() => handle(tracking.end)}>
              Termina distribuzione
            </button>
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Ultima posizione inviata</p>
        {tracking.lastPosition ? (
          <div style={metricGridStyle}>
            <Metric label="Latitudine" value={formatCoord(tracking.lastPosition.lat)} />
            <Metric label="Longitudine" value={formatCoord(tracking.lastPosition.lng)} />
            <Metric label="Registrata" value={formatDateTime(tracking.lastPosition.recorded_at)} />
          </div>
        ) : (
          <EmptyState text="Nessuna posizione GPS inviata. Premi Inizia distribuzione e autorizza il GPS." />
        )}
      </section>

      {tracking.assignmentState.status === 'valid' && (
        <PodCapture
          campaignId={campaignId}
          sessionId={tracking.session?.id || null}
          lastPosition={tracking.lastPosition}
          driverName={driverName}
          onUploaded={loadRecentPhotos}
        />
      )}

      <section style={cardStyle}>
        <p style={eyebrowStyle}>Ultime foto inviate</p>
        {photosState.error && <div style={errorStyle}>{photosState.error}</div>}
        {photosState.photos.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {photosState.photos.map((photo) => (
              <RecentPhotoRow key={photo.id} photo={photo} />
            ))}
          </div>
        ) : (
          <EmptyState text={photosState.loading ? 'Caricamento foto inviate...' : 'Nessuna foto prova inviata per questa campagna.'} />
        )}
      </section>

      {uploadState.error && <div style={errorStyle}>{uploadState.error}</div>}
    </GpsShell>
  );
}

function RecentPhotoRow({ photo }) {
  return (
    <div style={photoRowStyle}>
      {photo.signedUrl ? <img src={photo.signedUrl} alt="Foto prova inviata" style={photoThumbStyle} /> : <div style={{ ...photoThumbStyle, background: '#f1f5f9' }} />}
      <div style={{ display: 'grid', gap: 3 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>{formatDateTime(photo.taken_at || photo.created_at)}</strong>
          <OutcomeBadge outcome={photo.meta?.outcome} />
        </div>
        <span style={{ fontSize: 12, color: '#64748b' }}>{photo.meta?.client || 'Cliente non specificato'}{photo.meta?.address ? ` · ${photo.meta.address}` : ''}</span>
        {photo.meta?.ddt && <span style={{ fontSize: 11, color: '#94a3b8' }}>DDT {photo.meta.ddt}{photo.meta?.colli ? ` · ${photo.meta.colli} colli` : ''}</span>}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }) {
  if (!outcome) return null;
  const color = outcome === 'consegnato' ? '#0f766e' : outcome === 'rifiutato' ? '#b91c1c' : '#b45309';
  return <span style={{ ...pillStyle, color, borderColor: `${color}44`, background: `${color}14`, fontSize: 10 }}>{podOutcomeLabel(outcome)}</span>;
}

function GpsShell({ title, subtitle, children }) {
  return (
    <main style={shellStyle}>
      <header style={{ marginBottom: 22 }}>
        <a href="/" style={{ color: '#e8571a', fontWeight: 900, textDecoration: 'none' }}>VolantiniPro</a>
        <p style={eyebrowStyle}>{subtitle}</p>
        <h1 style={{ margin: 0, fontSize: 34 }}>{title}</h1>
      </header>
      <div style={{ display: 'grid', gap: 16 }}>{children}</div>
    </main>
  );
}

function StatusPill({ status }) {
  const color = status === 'active' ? '#0f766e' : status === 'paused' ? '#b45309' : status === 'permission_error' ? '#b91c1c' : '#64748b';
  return <span style={{ ...pillStyle, color, borderColor: `${color}44`, background: `${color}14` }}>{status}</span>;
}

function Metric({ label, value }) {
  return (
    <div style={metricStyle}>
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 800 }}>{label}</span>
      <strong style={{ fontSize: 16, color: '#17211f' }}>{value}</strong>
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: 16, border: '1px dashed #cbd5e1', borderRadius: 10, color: '#64748b' }}>{text}</div>;
}

function formatCoord(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : 'n/d';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'n/d';
}

const shellStyle = { minHeight: '100vh', padding: 24, background: '#eef2ef', color: '#17211f', fontFamily: 'Inter, system-ui, sans-serif' };
const cardStyle = { background: '#fff', border: '1px solid #d7ded9', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(15,23,42,.07)' };
const eyebrowStyle = { margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', color: '#64748b', fontWeight: 900 };
const metricGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, margin: '14px 0' };
const metricStyle = { display: 'grid', gap: 4, padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' };
const primaryButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#e8571a', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const secondaryButtonStyle = { border: '1px solid #cbd5e1', borderRadius: 10, padding: '12px 16px', background: '#fff', color: '#17211f', fontWeight: 900, cursor: 'pointer' };
const dangerButtonStyle = { border: 'none', borderRadius: 10, padding: '12px 16px', background: '#b91c1c', color: '#fff', fontWeight: 900, cursor: 'pointer' };
const pillStyle = { display: 'inline-flex', border: '1px solid', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900 };
const errorStyle = { marginTop: 12, padding: 12, borderRadius: 10, color: '#991b1b', background: '#fee2e2', border: '1px solid #fecaca' };
const photoRowStyle = { display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #eef2ef' };
const photoThumbStyle = { width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid #e2e8f0', flexShrink: 0 };
