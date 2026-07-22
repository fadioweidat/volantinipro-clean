import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endGpsSession,
  getActiveGpsSession,
  heartbeatGpsSession,
  insertGpsPoint,
  isPermanentGpsWriteError,
  pauseGpsSession,
  resumeGpsSession,
  startGpsSession,
} from '../lib/services/gps-api.js';

const SEND_INTERVAL_MS = 15000;
const MIN_DISTANCE_METERS = 8;
const HEARTBEAT_INTERVAL_MS = 20000;
const QUEUE_FLUSH_INTERVAL_MS = 10000;
const HIGH_SPEED_MPS = 2.2;

export function useGpsTracking(campaignId) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [lastPosition, setLastPosition] = useState(null);
  const [lastSentAt, setLastSentAt] = useState(null);
  const [networkStatus, setNetworkStatus] = useState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online');
  const [queueSize, setQueueSize] = useState(0);
  const [wakeLockStatus, setWakeLockStatus] = useState('unsupported');
  const [path, setPath] = useState([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);
  const [altitude, setAltitude] = useState(null);
  const [battery, setBattery] = useState({ supported: false, level: null, charging: null });
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const highAccuracyRef = useRef(true);
  const sessionRef = useRef(null);
  const statusRef = useRef('idle');
  const lastSentRef = useRef({ at: 0, lat: null, lng: null });
  const distanceMetersRef = useRef(0);
  const sendingRef = useRef(false);
  const queueKeyRef = useRef('');

  useEffect(() => {
    queueKeyRef.current = `volantinipro:gps-queue:${campaignId || 'unknown'}`;
    setQueueSize(readQueue(queueKeyRef.current).length);
  }, [campaignId]);

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

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // The browser can release wake lock on its own when the page is hidden.
    }
    wakeLockRef.current = null;
    setWakeLockStatus('released');
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) {
      setWakeLockStatus('unsupported');
      return;
    }
    if (document.visibilityState !== 'visible') return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockStatus('active');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
        setWakeLockStatus('released');
      });
    } catch (err) {
      setWakeLockStatus('error');
      console.warn('Wake Lock non disponibile', err);
    }
  }, []);

  const enqueuePoint = useCallback((payload) => {
    const key = queueKeyRef.current;
    if (!key) return;
    const queue = readQueue(key);
    queue.push({ ...payload, queuedAt: new Date().toISOString() });
    writeQueue(key, queue);
    setQueueSize(queue.length);
    console.info('[OPERATOR_GPS_OFFLINE_QUEUE]', { campaignId, queueSize: queue.length });
  }, [campaignId]);

  const clearQueuedPoints = useCallback(() => {
    const key = queueKeyRef.current;
    if (!key) return;
    writeQueue(key, []);
    setQueueSize(0);
  }, []);

  useEffect(() => {
    if (!navigator.getBattery) return undefined;
    let managerRef = null;
    const update = () => {
      if (!managerRef) return;
      const next = { supported: true, level: Math.round(managerRef.level * 100), charging: managerRef.charging };
      setBattery(next);
      if (next.level <= 15 && !next.charging) {
        console.warn('[GPS_ALARM_LOW_BATTERY]', { campaignId, battery: next.level });
      }
    };
    navigator.getBattery().then((manager) => {
      managerRef = manager;
      update();
      manager.addEventListener('levelchange', update);
      manager.addEventListener('chargingchange', update);
    }).catch(() => setBattery({ supported: false, level: null, charging: null }));
    return () => {
      if (!managerRef) return;
      managerRef.removeEventListener('levelchange', update);
      managerRef.removeEventListener('chargingchange', update);
    };
  }, [campaignId]);

  const flushQueue = useCallback(async () => {
    const key = queueKeyRef.current;
    if (!key || sendingRef.current || navigator.onLine === false) return;
    const queue = readQueue(key);
    if (!queue.length) {
      setQueueSize(0);
      return;
    }

    sendingRef.current = true;
    const remaining = [];
    try {
      for (const queuedPoint of queue) {
        try {
          const { queuedAt, ...payload } = queuedPoint;
          const point = await insertGpsPoint(payload);
          lastSentRef.current = { at: Date.now(), lat: Number(payload.lat), lng: Number(payload.lng) };
          setLastSentAt(new Date().toISOString());
          setLastPosition(point);
          setAccuracy(point.accuracy ?? payload.accuracy ?? null);
        } catch (err) {
          if (isPermanentGpsWriteError(err)) {
            clearQueuedPoints();
            setStatus('permission_error');
            setError(err?.message || 'Accesso operatore richiesto per inviare il tracking GPS.');
            stopWatch();
            await releaseWakeLock();
            console.warn('[OPERATOR_GPS_WRITE_BLOCKED]', {
              campaignId,
              reason: 'auth_or_rls',
              queuedPointsDiscarded: queue.length,
            });
            return;
          }
          remaining.push(queuedPoint);
          console.warn('[OPERATOR_GPS_QUEUE_RETRY]', {
            campaignId,
            reason: err?.code || err?.status || 'transient_error',
          });
        }
      }
      writeQueue(key, remaining);
      setQueueSize(remaining.length);
      console.info('[OPERATOR_GPS_SYNC]', { sent: queue.length - remaining.length, remaining: remaining.length });
      if (!remaining.length) setError(null);
    } finally {
      sendingRef.current = false;
    }
  }, [campaignId, clearQueuedPoints, releaseWakeLock, stopWatch]);

  const sendPosition = useCallback(async (position) => {
    const activeSession = sessionRef.current;
    if (!campaignId || !activeSession?.id || statusRef.current !== 'active') return;
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

    const payload = {
      campaignId,
      sessionId: activeSession.id,
      driverId: activeSession.driver_id,
      lat,
      lng,
      accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
      speed: Number.isFinite(coords.speed) ? coords.speed : null,
      heading: Number.isFinite(coords.heading) ? coords.heading : null,
      altitude: Number.isFinite(coords.altitude) ? coords.altitude : null,
      batteryLevel: battery.supported ? battery.level : null,
      recordedAt: new Date(position.timestamp || now).toISOString(),
    };

    if (navigator.onLine === false || sendingRef.current) {
      enqueuePoint(payload);
      setNetworkStatus('offline');
      return;
    }

    sendingRef.current = true;
    try {
      const point = await insertGpsPoint(payload);
      lastSentRef.current = { at: now, lat, lng };
      setLastSentAt(new Date().toISOString());
      setLastPosition(point);
      setAccuracy(point.accuracy ?? coords.accuracy ?? null);
      setError(null);
    } catch (err) {
      if (isPermanentGpsWriteError(err)) {
        clearQueuedPoints();
        setStatus('permission_error');
        setError(err?.message || 'Accesso operatore richiesto per inviare il tracking GPS.');
        stopWatch();
        await releaseWakeLock();
        return;
      }
      enqueuePoint(payload);
      setError(`${err?.message || 'Errore invio posizione GPS.'} Punto salvato in coda locale.`);
    } finally {
      sendingRef.current = false;
    }
  }, [battery.level, battery.supported, campaignId, clearQueuedPoints, enqueuePoint, releaseWakeLock, stopWatch]);

  const startWatch = useCallback((forceHighAccuracy = highAccuracyRef.current) => {
    if (!navigator.geolocation) {
      setStatus('permission_error');
      setError('GPS non disponibile su questo dispositivo/browser.');
      return;
    }
    stopWatch();
    highAccuracyRef.current = forceHighAccuracy;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        const speed = Number.isFinite(coords.speed) ? coords.speed : 0;
        const shouldUseHighAccuracy = speed >= HIGH_SPEED_MPS;
        if (shouldUseHighAccuracy !== highAccuracyRef.current && statusRef.current === 'active') {
          window.setTimeout(() => startWatch(shouldUseHighAccuracy), 0);
        }
        setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        setLastPosition({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          speed: Number.isFinite(coords.speed) ? coords.speed : null,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          altitude: Number.isFinite(coords.altitude) ? coords.altitude : null,
          recorded_at: new Date(position.timestamp || Date.now()).toISOString(),
        });
        setSpeed(Number.isFinite(coords.speed) ? coords.speed : null);
        setHeading(Number.isFinite(coords.heading) ? coords.heading : null);
        setAltitude(Number.isFinite(coords.altitude) ? coords.altitude : null);
        const pathPoint = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          recorded_at: new Date(position.timestamp || Date.now()).toISOString(),
        };
        setPath((prev) => {
          const last = prev[prev.length - 1];
          if (last) {
            const meters = distanceMeters(last.lat, last.lng, pathPoint.lat, pathPoint.lng);
            if (Number.isFinite(meters) && meters > 1) {
              distanceMetersRef.current += meters;
              setDistanceKm(Math.round((distanceMetersRef.current / 1000) * 100) / 100);
            }
          }
          return [...prev, pathPoint].slice(-1500);
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
        console.warn('[GPS_ALARM_READ_ERROR]', { campaignId, code: geoError.code, message: geoError.message });
      },
      { enableHighAccuracy: forceHighAccuracy, maximumAge: forceHighAccuracy ? 5000 : 15000, timeout: 20000 },
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
    distanceMetersRef.current = 0;
    setDistanceKm(0);
    setPath([]);
    console.info('[OPERATOR_WORK_START]', { campaignId, sessionId: nextSession?.id });
    await requestWakeLock();
    startWatch();
    flushQueue();
    return nextSession;
  }, [campaignId, flushQueue, requestWakeLock, startWatch]);

  const pause = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await pauseGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'paused';
    setSession(updated);
    setStatus('paused');
    console.info('[OPERATOR_WORK_PAUSE]', { campaignId, sessionId: updated?.id });
    stopWatch();
    await releaseWakeLock();
    return updated;
  }, [campaignId, releaseWakeLock, stopWatch]);

  const resume = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    const updated = await resumeGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'active';
    setSession(updated);
    setStatus('active');
    console.info('[OPERATOR_WORK_RESUME]', { campaignId, sessionId: updated?.id });
    await requestWakeLock();
    startWatch();
    flushQueue();
    return updated;
  }, [campaignId, flushQueue, requestWakeLock, startWatch]);

  const end = useCallback(async () => {
    if (!sessionRef.current?.id) return null;
    stopWatch();
    const updated = await endGpsSession(sessionRef.current.id);
    sessionRef.current = updated;
    statusRef.current = 'completed';
    setSession(updated);
    setStatus('completed');
    console.info('[OPERATOR_WORK_STOP]', { campaignId, sessionId: updated?.id, distanceKm });
    await releaseWakeLock();
    return updated;
  }, [campaignId, distanceKm, releaseWakeLock, stopWatch]);

  useEffect(() => {
    let cancelled = false;
    async function resumeExistingSession() {
      if (!campaignId) return;
      try {
        const existing = await getActiveGpsSession(campaignId);
        if (cancelled || !existing || existing.status !== 'started') return;
        sessionRef.current = existing;
        statusRef.current = 'active';
        setSession(existing);
        setStatus('active');
        await requestWakeLock();
        startWatch();
        flushQueue();
      } catch (err) {
        console.warn('Resume session GPS non riuscito', err);
      }
    }
    resumeExistingSession();
    return () => {
      cancelled = true;
    };
  }, [campaignId, flushQueue, requestWakeLock, startWatch]);

  useEffect(() => {
    const onVisibilityChange = () => {
      console.info('GPS visibilitychange', document.visibilityState);
      if (document.visibilityState === 'visible' && statusRef.current === 'active') {
        requestWakeLock();
        startWatch();
        flushQueue();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushQueue, requestWakeLock, startWatch]);

  useEffect(() => {
    const onOnline = () => {
      setNetworkStatus('online');
      console.info('[OPERATOR_NETWORK_ONLINE]', { campaignId });
      flushQueue();
    };
    const onOffline = () => {
      setNetworkStatus('offline');
      console.info('[OPERATOR_NETWORK_OFFLINE]', { campaignId });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [campaignId, flushQueue]);

  useEffect(() => {
    const timer = window.setInterval(flushQueue, QUEUE_FLUSH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flushQueue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (statusRef.current !== 'active' || !sessionRef.current?.id) return;
      heartbeatGpsSession(sessionRef.current.id).catch((err) => {
        console.warn('Heartbeat GPS non riuscito', err);
      });
    }, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    stopWatch();
    releaseWakeLock();
  }, [releaseWakeLock, stopWatch]);

  return {
    session,
    status,
    error,
    accuracy,
    lastPosition,
    lastSentAt,
    networkStatus,
    queueSize,
    wakeLockStatus,
    path,
    distanceKm,
    speed,
    heading,
    altitude,
    battery,
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

function readQueue(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(key, queue) {
  window.localStorage.setItem(key, JSON.stringify(queue.slice(-500)));
}
