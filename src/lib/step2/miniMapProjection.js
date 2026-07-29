// Mini-map SVG projection helpers used by Step2's territorial mini-map and
// the printed territorial report. Fixed pixel-space canvas: MWxMH centered
// on Milan's approximate centroid (LAT_C/LNG_C), scaled by SCALE_X/SCALE_Y.
export const MW = 580;
export const MH = 360;
export const LAT_C = 45.548;
export const LNG_C = 9.175;
export const SCALE_Y = 4200;
export const SCALE_X = 2800;

export function s2proj(n, i) {
  return {
    x: MW / 2 + (i - LNG_C) * SCALE_X,
    y: MH / 2 - (n - LAT_C) * SCALE_Y
  };
}

export function kmToPx(n) {
  return n * SCALE_X / 111.32;
}

export function thColor(n, i, r, l, u) {
  if (n == null) return "rgba(255,255,255,.06)";
  const h = Math.max(0, Math.min(1, (n - i) / (r - i || 1))),
    f = (w, j) => parseInt(w.slice(j, j + 2), 16),
    m = Math.round(f(l, 1) * (1 - h) + f(u, 1) * h),
    y = Math.round(f(l, 3) * (1 - h) + f(u, 3) * h),
    x = Math.round(f(l, 5) * (1 - h) + f(u, 5) * h);
  return `rgb(${m},${y},${x})`;
}
