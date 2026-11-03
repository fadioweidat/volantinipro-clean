"""Dataset POI OpenStreetMap per lo Step 2 (Lombardia), preparato offline.

Estrae da un estratto Geofabrik (.osm.pbf) gli stessi elementi che la query
Overpass di poi-search chiede: nodi e way con una delle coppie key=val
esportate da export-poi-tags.mjs (nessuna relation, come la query). Per le
way il punto e' il centro del riquadro, come `out center` di Overpass.

Uscita (cartella --out):
  manifest.json            versione, fonte, timestamp OSM, celle e conteggi
  cells/<ix>_<iy>.json     POI di una cella di --cell gradi, ordinati per id
  poi-lombardia.json.gz    tutte le celle in un file (letto da /api/poi-search);
                           sha256 e dimensione sono nel manifest
  LICENSE-ODbL.txt         attribuzione e licenza (obbligo ODbL)

Ogni cella del manifest e' "in" (interamente in Lombardia: i dati sono
completi) oppure "border" (attraversa il confine: dati solo lato Lombardia,
quindi incompleti). Una cella "in" senza POI e' uno zero reale; una cella
assente dal manifest non e' coperta dal dataset.

Uso:
  python build_poi_dataset.py --pbf nord-ovest.osm.pbf --tags tags.json \
    --boundary public/data/territories/lombardia-comuni.json --out out/ \
    --version 2026-11-02 [--previous old/manifest.json]
"""
import argparse
import gzip
import hashlib
import json
import math
import os
import sys
import time

import osmium
import shapely
from shapely.geometry import box, shape
from shapely.ops import unary_union

KEPT_TAGS = (
    "name", "name:it", "addr:street", "addr:housenumber", "addr:city",
    "website", "contact:website", "opening_hours",
)


def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_boundary(path):
    data = json.load(open(path, encoding="utf-8"))
    polys = [shape(c["g"]).buffer(0) for c in data["comuni"]]
    # I confini comunali semplificati lasciano fessure di pochi metri tra
    # comuni vicini: una chiusura morfologica (~200 m) le elimina senza
    # spostare il confine esterno in modo apprezzabile.
    region = unary_union(polys).buffer(0.002).buffer(-0.002)
    shapely.prepare(region)
    return region, len(polys)


def kept_tags(tags, keys):
    out = {}
    for k in keys:
        v = tags.get(k)
        if v is not None:
            out[k] = v
    for k in KEPT_TAGS:
        v = tags.get(k)
        if v is not None:
            out[k] = v
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pbf", required=True)
    ap.add_argument("--tags", required=True)
    ap.add_argument("--boundary", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--source-url", default="")
    ap.add_argument("--cell", type=float, default=0.05)
    ap.add_argument("--previous", default="")
    ap.add_argument("--min-ratio", type=float, default=0.9,
                    help="totale minimo rispetto al dataset precedente")
    ap.add_argument("--min-total", type=int, default=50000,
                    help="totale minimo assoluto (prima esecuzione, senza precedente)")
    args = ap.parse_args()

    t0 = time.time()
    pairs = json.load(open(args.tags, encoding="utf-8"))["pairs"]
    wanted = {}
    for p in pairs:
        wanted.setdefault(p["key"], set()).add(p["val"])
    keys = sorted(wanted)

    region, n_comuni = load_boundary(args.boundary)
    minx, miny, maxx, maxy = region.bounds
    print(f"confine: {n_comuni} comuni, bbox {region.bounds}", flush=True)

    def matches(tags):
        for k, vals in wanted.items():
            v = tags.get(k)
            if v is not None and v in vals:
                return True
        return False

    nodes, ways = [], []
    seen = {"node": 0, "way": 0, "way_no_loc": 0, "outside": 0}
    fp = (osmium.FileProcessor(args.pbf, osmium.osm.NODE | osmium.osm.WAY)
          .with_locations()
          .with_filter(osmium.filter.KeyFilter(*keys)))
    for obj in fp:
        tags = obj.tags
        if not matches(tags):
            continue
        if obj.is_node():
            if not obj.location.valid():
                continue
            lat, lon = obj.location.lat, obj.location.lon
            seen["node"] += 1
            target = nodes
        else:
            lats, lons = [], []
            for n in obj.nodes:
                if n.location.valid():
                    lats.append(n.location.lat)
                    lons.append(n.location.lon)
            if not lats:
                seen["way_no_loc"] += 1
                continue
            lat = (min(lats) + max(lats)) / 2
            lon = (min(lons) + max(lons)) / 2
            seen["way"] += 1
            target = ways
        if not (minx <= lon <= maxx and miny <= lat <= maxy) or not shapely.contains_xy(region, lon, lat):
            seen["outside"] += 1
            continue
        target.append((obj.id, round(lat, 7), round(lon, 7), kept_tags({t.k: t.v for t in tags}, keys)))
    t_extract = time.time() - t0
    print(f"estrazione {t_extract:.0f}s: {seen}, in Lombardia nodi={len(nodes)} way={len(ways)}", flush=True)

    # Celle: indice intero, riquadro [ix*cell, (ix+1)*cell).
    cell = args.cell
    def cell_of(lat, lon):
        return math.floor(lon / cell), math.floor(lat / cell)

    buckets = {}
    for kind, rows in (("n", nodes), ("w", ways)):
        for row in rows:
            key = cell_of(row[1], row[2])
            buckets.setdefault(key, {"n": [], "w": []})[kind].append(row)

    cells = {}
    ix0, iy0 = math.floor(minx / cell), math.floor(miny / cell)
    ix1, iy1 = math.floor(maxx / cell), math.floor(maxy / cell)
    for ix in range(ix0, ix1 + 1):
        for iy in range(iy0, iy1 + 1):
            b = box(ix * cell, iy * cell, (ix + 1) * cell, (iy + 1) * cell)
            if not region.intersects(b):
                continue
            status = "in" if region.contains(b) else "border"
            cells[(ix, iy)] = status

    out_cells = os.path.join(args.out, "cells")
    os.makedirs(out_cells, exist_ok=True)
    manifest_cells = {}
    bundle_cells = {}
    total_bytes = 0
    largest = (0, None)
    for (ix, iy), status in sorted(cells.items()):
        content = buckets.get((ix, iy), {"n": [], "w": []})
        content["n"].sort(key=lambda r: r[0])
        content["w"].sort(key=lambda r: r[0])
        entry = {"s": status, "n": len(content["n"]), "w": len(content["w"])}
        if entry["n"] or entry["w"]:
            body = json.dumps({"c": [ix, iy], "n": content["n"], "w": content["w"]},
                              ensure_ascii=False, separators=(",", ":"))
            raw = body.encode("utf-8")
            with open(os.path.join(out_cells, f"{ix}_{iy}.json"), "wb") as f:
                f.write(raw)
            bundle_cells[f"{ix}_{iy}"] = {"n": content["n"], "w": content["w"]}
            entry["b"] = len(raw)
            entry["h"] = hashlib.sha256(raw).hexdigest()[:16]
            total_bytes += len(raw)
            if len(raw) > largest[0]:
                largest = (len(raw), f"{ix}_{iy}")
        manifest_cells[f"{ix}_{iy}"] = entry

    # Celle con POI ma fuori dalla griglia del confine: impossibile (POI gia'
    # ritagliati sul confine) — se capita il dataset e' incoerente.
    stray = [k for k in buckets if k not in cells]
    total = len(nodes) + len(ways)
    counts_by_key = {}
    for rows in (nodes, ways):
        for _, _, _, tags in rows:
            for k in keys:
                v = tags.get(k)
                if v is not None and v in wanted[k]:
                    counts_by_key[f"{k}={v}"] = counts_by_key.get(f"{k}={v}", 0) + 1

    problems = []
    if stray:
        problems.append(f"{len(stray)} celle con POI fuori griglia")
    if total < args.min_total:
        problems.append(f"totale {total} < minimo {args.min_total}")
    for k in keys:
        if not any(c for pair, c in counts_by_key.items() if pair.startswith(k + "=")):
            problems.append(f"nessun POI con chiave {k}")
    if args.previous and os.path.exists(args.previous):
        prev = json.load(open(args.previous, encoding="utf-8"))
        prev_total = prev.get("totals", {}).get("elements", 0)
        if prev_total and total < prev_total * args.min_ratio:
            problems.append(f"totale {total} < {args.min_ratio:.0%} del precedente {prev_total}")
        # Una coppia che crolla (oltre meta' persa, su almeno 20 POI) indica un
        # estratto incompleto, non un cambiamento reale della mappa.
        for pair, before in prev.get("countsByPair", {}).items():
            if before >= 20 and counts_by_key.get(pair, 0) < before * 0.5:
                problems.append(f"{pair}: {counts_by_key.get(pair, 0)} contro {before} del precedente")
        prev_in = {k for k, c in prev.get("cells", {}).items() if c.get("s") == "in"}
        lost = [k for k in prev_in if manifest_cells.get(k, {}).get("s") != "in"]
        if lost:
            problems.append(f"{len(lost)} celle interne del precedente non piu' interne")

    header = osmium.io.Reader(args.pbf, osmium.osm.NOTHING).header()
    osm_timestamp = header.get("osmosis_replication_timestamp", "")
    if not osm_timestamp:
        problems.append("estratto senza osmosis_replication_timestamp")

    bundle_raw = json.dumps({"version": args.version, "cellDeg": cell, "cells": bundle_cells},
                            ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    bundle_gz = gzip.compress(bundle_raw, compresslevel=9, mtime=0)
    with open(os.path.join(args.out, "poi-lombardia.json.gz"), "wb") as f:
        f.write(bundle_gz)

    manifest = {
        "schema": 1,
        "version": args.version,
        "osmTimestamp": osm_timestamp,
        "bundle": {
            "file": "poi-lombardia.json.gz",
            "bytes": len(bundle_gz),
            "rawBytes": len(bundle_raw),
            "sha256": hashlib.sha256(bundle_gz).hexdigest(),
        },
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": {
            "provider": "Geofabrik GmbH (estratto) / OpenStreetMap contributors (dati)",
            "file": os.path.basename(args.pbf),
            "url": args.source_url,
            "md5": md5_of(args.pbf),
        },
        "license": "ODbL 1.0 - © OpenStreetMap contributors - https://www.openstreetmap.org/copyright",
        "cellDeg": cell,
        "bounds": [round(minx, 5), round(miny, 5), round(maxx, 5), round(maxy, 5)],
        "pairs": [f"{p['key']}={p['val']}" for p in pairs],
        "totals": {
            "elements": total, "nodes": len(nodes), "ways": len(ways),
            "cells": len(manifest_cells),
            "cellsIn": sum(1 for c in manifest_cells.values() if c["s"] == "in"),
            "cellsBorder": sum(1 for c in manifest_cells.values() if c["s"] == "border"),
            "bytes": total_bytes,
            "largestCell": {"id": largest[1], "bytes": largest[0]},
        },
        "countsByPair": dict(sorted(counts_by_key.items())),
        "timings": {"extractSeconds": round(t_extract), "totalSeconds": round(time.time() - t0)},
        "cells": manifest_cells,
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(args.out, "LICENSE-ODbL.txt"), "w", encoding="utf-8") as f:
        f.write(
            "Dati: © OpenStreetMap contributors, disponibili sotto Open Database License 1.0\n"
            "https://www.openstreetmap.org/copyright - https://opendatacommons.org/licenses/odbl/1-0/\n"
            f"Estratto: {os.path.basename(args.pbf)} (Geofabrik GmbH), md5 {manifest['source']['md5']}\n"
            "Questo dataset e' una selezione di POI derivata da OpenStreetMap ed e' distribuito\n"
            "sotto la stessa licenza ODbL 1.0. Metodo: scripts/poi-dataset/ nel repository\n"
            "fadioweidat/volantinipro-clean.\n"
        )
    print(json.dumps({k: manifest[k] for k in ("version", "totals", "timings")}, indent=1), flush=True)
    if problems:
        print("DATASET NON VALIDO: " + "; ".join(problems), file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
