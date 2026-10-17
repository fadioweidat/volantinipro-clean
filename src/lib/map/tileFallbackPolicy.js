// Leaflet emits load after every visible tile in a loading cycle has settled.
// A single failed image must not replace an otherwise usable Mapbox layer.
export function attachTileFallbackPolicy(layer, onUnavailable) {
  let loaded = 0;
  let failed = 0;
  let switched = false;
  layer.on('loading', () => { loaded = 0; failed = 0; });
  layer.on('tileload', () => { loaded += 1; });
  layer.on('tileerror', () => { failed += 1; });
  layer.on('load', () => {
    if (switched || loaded > 0 || failed < 2) return;
    switched = true;
    onUnavailable();
  });
}
