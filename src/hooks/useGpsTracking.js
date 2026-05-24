import { useCallback, useEffect, useRef, useState } from 'react';
import { endGpsSession, insertGpsPoint, pauseGpsSession, resumeGpsSession, startGpsSession } from '../lib/services/gps-api.js';

const SEND_INTERVAL_MS = 15000;
const MIN_DISTANCE_METERS = 8;

export function useGpsTracking(campaignId) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const watchIdRef = useRef(null);
  const sessionRef = useRef(null);
  const statusRef = useRef('idle');
  const lastSentRef = useRef({ at: 0, lat: null, lng: null });
  const sendingRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }, []);

  const sendPosition = useCallback(async (position) => {
    const activeSession = sessionRef.current;
    if (!campaignId || !activeSession?.id || statusRef.current !== 'active' || sendingRef.current) return;
    const coords = position.coords;
    const lat = Number(coords.latitude);
    const lng = Number(coords.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const now = Date.now();
    const previous = lastSentRef.current;
    const movedMeters = previous.lat != null && previous.lng != null
      ? distanceMeters(previous.lat, previous.lng, lat, lng)
      : Infinity;
    const elapsed = now - (previous.at || 0);
    if (elapsed < SEND_INTERVAL_MS) return;
    if (movedMeters < MIN_DISTANCE_METERS && elapsed < SEND_INTERVAL_MS * 2) return;

    sendingRef.current = true;
    try {
      const point = await insertGpsPoint({
        campaignId,
        sessionId: activeSession.id,
        driverId: activeSession.driver_id,
        lat,
        lng,
        accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        speed: Number.isFinite(coords.speed) ? coords.speed : null,
        heading: Number.isFinite(coords.heading) ? coords.heading : null,
        recordedAt: new Date(position.timestamp || now).toISOString(),
      });
      lastSentRef.current = { at: now, lat, lng };
      setLastSentAt(new Date().toISOString());
      setLastPosition(point);
      setAccuracy(point.accuracy ?? coords.accuracy ?? null);
      setError(null);
    } catch (err) {
      setError(err?.message || 'Errore invio posizione GPS.');
    } finally {
      sendingRef.current = false;
    }
  }, [campaignId]);

  const startWatch = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('permission_error');
      setError('GPS non disponibile su questo dispositivo/browser.');
      return;
    }
    stopWatch();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        setLastPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          recorded_at: new Date(position.timestamp || Date.now()).toISOString(),
        });
        sendPosition(position);
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setStatus('permission_error');
          setError('Permesso GPS negato. Abilita la posizione per iniziare il tracking.');
          stopWatch();
          return;
        }
        setError(geoError.message || 'Errore lettura posizione GPS.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [sendPosition, stopWatch]);

  const start = useCallback(async () => {
    setError(null);
    const nextSession = await startGpsSession(campaignId);
    sessionRef.current = nextSession;
    statusRef.current = 'active';
    setSession(nextSession);
    setStatus('active');
    lastSentRef.current = { at: 0, lat: null, lng: null };
    startWatch();
    return nextSession;
  }, [campaignId, startWatch]);

  const pause = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await pauseGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'paused';
    setSession(updated);
    setStatus('paused');
    stopWatch();
    return updated;
  }, [stopWatch]);

  const resume = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await resumeGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'active';
    setSession(updated);
    setStatus('active');
    startWatch();
    return updated;
  }, [startWatch]);

  const end = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    stopWatch();
    const updated = await endGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'completed';
    setSession(updated);
    setStatus('completed');
    return updated;
  }, [stopWatch]);

  useEffect(() => stopWatch, [stopWatch]);

  return {
    session,
    status,
    error,
    accuracy,
    lastPosition,
    lastSentAt,
    isActive: status === 'active',
    isPaused: status === 'paused',
    start,
    pause,
    resume,
    end,
  };
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
