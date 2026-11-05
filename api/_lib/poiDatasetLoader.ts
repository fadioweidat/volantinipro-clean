// Caricamento del dataset POI OpenStreetMap preparato offline, per
// api/poi-search.ts. Una copia per istanza warm, sostituita solo da una
// versione nuova valida: se manifest, hash o contenuto non tornano si tiene la
// copia precedente (aggiornamento atomico). Senza nessuna copia valida il
// chiamante usa Overpass come prima.
//
// Fonti, in ordine:
//  1. file inclusi nella funzione: poi-dataset/manifest.json + bundle
//     (vercel.json -> functions."api/poi-search.ts".includeFiles);
//  2. POI_DATASET_POINTER_URL (env server): current.json pubblicato dal
//     workflow poi-dataset, { version, tag, base } -> manifest e bundle sotto
//     `base` (asset della release di quella versione);
//  3. POI_DATASET_BASE_URL (env server): manifest.json e bundle sotto quell'URL.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

import { validatePoiBundle } from "../../src/lib/poi/poiDataset.js";

declare const process: any;

export type PoiDataset = { manifest: any; cells: Record<string, { n: any[]; w: any[] }>; origin: string };

const REFRESH_MS = 6 * 3600 * 1000;
// Senza nessuna copia valida si riprova prima, per non restare su Overpass a lungo.
const RETRY_EMPTY_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

async function fetchBytes(fetchImpl: any, url: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`POI_DATASET_HTTP_${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** Manifest + bundle (gz) -> dataset verificato, oppure errore con il motivo. */
export function decodePoiDataset(manifestRaw: Buffer | string, bundleGz: Buffer, origin: string): PoiDataset {
  const manifest = JSON.parse(String(manifestRaw));
  const sha = createHash("sha256").update(bundleGz).digest("hex");
  if (!manifest?.bundle?.sha256 || sha !== manifest.bundle.sha256) throw new Error("POI_DATASET_SHA_MISMATCH");
  const bundle = JSON.parse(gunzipSync(bundleGz).toString("utf8"));
  const problem = validatePoiBundle(manifest, bundle);
  if (problem) throw new Error(`POI_DATASET_INVALID_${problem}`);
  return { manifest, cells: bundle.cells, origin };
}

export function createPoiDatasetLoader(deps: { env?: Record<string, string | undefined>; fetchImpl?: any; rootDir?: string; log?: (p: Record<string, unknown>) => void } = {}) {
  const env = deps.env || (typeof process !== "undefined" ? process.env : {}) || {};
  const fetchImpl = deps.fetchImpl || ((url: string, init: any) => fetch(url, init));
  const rootDir = deps.rootDir || (typeof process !== "undefined" ? process.cwd() : ".");
  const log = deps.log || (() => {});
  let current: PoiDataset | null = null;
  let checkedAt = 0;
  let inflight: Promise<PoiDataset | null> | null = null;

  async function loadFresh(): Promise<PoiDataset | null> {
    const localDir = join(rootDir, "poi-dataset");
    const localManifest = join(localDir, "manifest.json");
    if (existsSync(localManifest)) {
      const manifestRaw = readFileSync(localManifest);
      const file = JSON.parse(String(manifestRaw))?.bundle?.file;
      if (current && JSON.parse(String(manifestRaw)).version === current.manifest.version) return current;
      return decodePoiDataset(manifestRaw, readFileSync(join(localDir, String(file))), "bundled");
    }
    let base = String(env.POI_DATASET_BASE_URL || "").trim().replace(/\/+$/, "");
    const pointerUrl = String(env.POI_DATASET_POINTER_URL || "").trim();
    if (/^https:\/\//i.test(pointerUrl)) {
      const pointer = JSON.parse(String(await fetchBytes(fetchImpl, pointerUrl)));
      if (current && pointer?.version === current.manifest.version) return current;
      base = String(pointer?.base || "").trim().replace(/\/+$/, "");
    }
    if (!/^https:\/\//i.test(base)) return current;
    const manifestRaw = await fetchBytes(fetchImpl, `${base}/manifest.json`);
    const manifest = JSON.parse(String(manifestRaw));
    if (current && manifest.version === current.manifest.version) return current;
    const bundleGz = await fetchBytes(fetchImpl, `${base}/${encodeURIComponent(String(manifest?.bundle?.file || ""))}`);
    return decodePoiDataset(manifestRaw, bundleGz, base);
  }

  /** Dataset valido corrente (eventualmente aggiornato), o null. Mai lancia. */
  return async function getPoiDataset(): Promise<PoiDataset | null> {
    if (Date.now() - checkedAt < (current ? REFRESH_MS : RETRY_EMPTY_MS)) return current;
    if (!inflight) {
      inflight = (async () => {
        const t0 = Date.now();
        try {
          const next = await loadFresh();
          if (next && next !== current) log({ outcome: "dataset_loaded", version: next.manifest.version, origin: next.origin, elapsedMs: Date.now() - t0 });
          current = next;
        } catch (err: any) {
          // Versione nuova non valida o fonte irraggiungibile: resta la precedente.
          log({ outcome: "dataset_load_failed", error: String(err?.message || err), keptVersion: current?.manifest?.version ?? null, elapsedMs: Date.now() - t0 });
        } finally {
          checkedAt = Date.now();
          inflight = null;
        }
        return current;
      })();
    }
    return inflight;
  };
}
