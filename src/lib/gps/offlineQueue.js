export function gpsPointQueueKey(point = {}) {
  return [
    point.sessionId || '',
    point.recordedAt || '',
    Number(point.lat),
    Number(point.lng),
  ].join('|');
}

export function dedupeGpsPointQueue(points = []) {
  const seen = new Set();
  return (Array.isArray(points) ? points : []).filter((point) => {
    const key = gpsPointQueueKey(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
