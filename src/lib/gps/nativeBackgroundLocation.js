import { Capacitor, registerPlugin } from '@capacitor/core';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

let activeWatcherId = null;

export function isNativeBackgroundGpsAvailable() {
  return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform();
}

export async function startNativeBackgroundGps(onPosition, onError) {
  if (!isNativeBackgroundGpsAvailable()) return null;
  if (activeWatcherId) return activeWatcherId;

  activeWatcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'VolantiniPro sta registrando la posizione durante il lavoro.',
      backgroundTitle: 'Tracking VolantiniPro attivo',
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (location, error) => {
      if (error) {
        onError?.(error);
        return;
      }
      if (!location) return;
      onPosition?.({
        coords: {
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
          speed: Number.isFinite(Number(location.speed)) ? Number(location.speed) : null,
          heading: Number.isFinite(Number(location.bearing)) ? Number(location.bearing) : null,
        },
        timestamp: Number.isFinite(Number(location.time)) ? Number(location.time) : Date.now(),
        source: 'native-background',
      });
    },
  );

  return activeWatcherId;
}

export async function stopNativeBackgroundGps() {
  const id = activeWatcherId;
  activeWatcherId = null;
  if (!id || !isNativeBackgroundGpsAvailable()) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id });
  } catch {
    // Best effort during pause/stop/unmount.
  }
}
