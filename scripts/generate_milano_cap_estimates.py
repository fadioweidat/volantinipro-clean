"""Generate precomputed deterministic CAP demographic estimates for Milano.

Usage:
  python scripts/generate_milano_cap_estimates.py

Sources:
  - DS2973: Stradario referendum 2026 con CAP (Comune di Milano)
  - DS634: Coordinate geografiche civici con NIL e Municipio (Comune di Milano)
  - DS1440: Famiglie anagrafiche per quartiere / NIL (Comune di Milano)

Output:
  public/data/territories/milano-cap-estimates.json
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date
from pathlib import Path


DS2973_URL = "https://dati.comune.milano.it/dataset/645e8e6a-aff3-47ef-9dce-4d102ff471b8/resource/e1a336d2-8dd6-483f-913f-4388758dd446/download/ds2973_stradario_referendum_2026.csv"
DS634_ZIP_URL = "https://dati.comune.milano.it/dataset/5c6519f6-6d26-41c9-b53b-6106e08d1b90/resource/533b4e63-3d78-4bb5-aeb4-6c5f648f7f21/download/ds634_civici_coordinategeografiche_20260901_final_csv.zip"
DS1440_ZIP_URL = "https://dati.comune.milano.it/dataset/e2f3d14b-c4eb-40cd-926c-61c07bd30a3f/resource/ef2a810e-2702-4083-8d94-c54f04552fc0/download/ds1440_popolazione_residenti_famiglie_quartiere.zip"


def clean(value: str | None) -> str:
    return (value or "").strip().upper()


def digits(value: str | None) -> str:
    val = clean(value)
    return str(int(val)) if val.isdigit() else val.lstrip("0") or "0"


def civic_parts(number: str | None, suffix: str | None) -> tuple[str, str, str]:
    num = digits(number)
    suf = re.sub(r"[^A-Z0-9]", "", clean(suffix))
    if suf.isalpha():
        return num, suf, ""
    return num, "", suf


def join_key(code: str | None, number: str | None, suffix: str | None) -> str:
    num, letter, bar = civic_parts(number, suffix)
    return "|".join((digits(code), num, letter, bar))


def fetch_bytes(url: str) -> bytes:
    print(f"Fetching {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "VolantiniPro/1.0"})
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def main() -> None:
    output_path = Path("public/data/territories/milano-cap-estimates.json")

    # 1. Load DS634 civics with NIL mapping
    ds634_bytes = fetch_bytes(DS634_ZIP_URL)
    z634 = zipfile.ZipFile(io.BytesIO(ds634_bytes))
    ds634_name = z634.namelist()[0]
    civic_rows: dict[str, list[dict[str, str]]] = defaultdict(list)
    nil_total_civics: dict[str, int] = defaultdict(int)
    nil_names: dict[str, str] = {}

    with z634.open(ds634_name) as handle:
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"), delimiter=";")
        for row in reader:
            suf = clean(row["LETTERA"]) or clean(row["BARRA"])
            k = join_key(row["CODICE_VIA"], row["NUMERO"], suf)
            civic_rows[k].append(row)
            nil_id = clean(row.get("ID_NIL"))
            nil_name = clean(row.get("NIL"))
            if nil_id:
                nil_total_civics[nil_id] += 1
                if nil_name and nil_id not in nil_names:
                    nil_names[nil_id] = nil_name

    # 2. Load DS1440 official 2025 NIL families
    ds1440_bytes = fetch_bytes(DS1440_ZIP_URL)
    z1440 = zipfile.ZipFile(io.BytesIO(ds1440_bytes))
    ds1440_name = z1440.namelist()[0]
    nil_families_2025: dict[str, int] = defaultdict(int)

    with z1440.open(ds1440_name) as handle:
        reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"), delimiter=";")
        for row in reader:
            anno = (row.get("Anno") or "").strip()
            if anno != "2025":
                continue
            quartiere = (row.get("Quartiere") or "").strip()
            m = re.search(r"\((\d+)\)", quartiere)
            nil_id = m.group(1) if m else quartiere
            fam = int((row.get("Famiglie") or "0").strip())
            nil_families_2025[nil_id] += fam

    # 3. Load DS2973 and join civics with CAP + NIL
    ds2973_bytes = fetch_bytes(DS2973_URL)
    reader = csv.DictReader(io.StringIO(ds2973_bytes.decode("utf-8-sig")), delimiter=";")

    cap_nil_civics: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    cap_total_civics: dict[str, int] = defaultdict(int)
    cap_unmatched: dict[str, int] = defaultdict(int)
    cap_ambiguous: dict[str, int] = defaultdict(int)
    cap_municipi: dict[str, set[int]] = defaultdict(set)

    total_joined = 0
    total_excluded = 0

    for source in reader:
        suffix = clean(source.get("BARRATO"))
        matches = civic_rows.get(join_key(source.get("CODICE_VIA"), source.get("CIVICO"), suffix), [])
        base = [r for r in matches if not clean(r.get("BARRA2"))]
        chosen = base if base else matches

        cap_raw = digits(source.get("CAP"))
        cap = f"20{int(cap_raw):03d}" if cap_raw.isdigit() else ""

        if not re.fullmatch(r"201\d{2}", cap) or cap == "20100":
            total_excluded += 1
            continue

        if not chosen:
            cap_unmatched[cap] += 1
            continue

        unique_sites = {(clean(r["LONG_WGS84"]), clean(r["LAT_WGS84"])) for r in chosen}
        if len(unique_sites) != 1:
            cap_ambiguous[cap] += 1
            continue

        match = chosen[0]
        nil_id = clean(match.get("ID_NIL"))
        mun = clean(match.get("MUNICIPIO"))
        if mun.isdigit():
            cap_municipi[cap].add(int(mun))

        if nil_id:
            cap_nil_civics[cap][nil_id] += 1
            cap_total_civics[cap] += 1
            total_joined += 1

    # 4. Compute CAP demographic estimates and confidence
    cap_estimates: dict[str, dict] = {}

    for cap in sorted(cap_total_civics.keys()):
        civic_count = cap_total_civics[cap]
        unmatched = cap_unmatched[cap]
        ambiguous = cap_ambiguous[cap]
        total_attempts = civic_count + unmatched + ambiguous
        joined_rate = round(civic_count / total_attempts, 4) if total_attempts > 0 else 0.0

        nil_contributions = []
        estimated_families_float = 0.0

        sorted_nils = sorted(
            cap_nil_civics[cap].items(),
            key=lambda item: item[1],
            reverse=True
        )

        top_nil_share = (sorted_nils[0][1] / civic_count) if (sorted_nils and civic_count > 0) else 0.0

        for nil_id, c_count in sorted_nils:
            tot_in_nil = nil_total_civics.get(nil_id, c_count)
            cap_civic_share = round(c_count / tot_in_nil, 4) if tot_in_nil > 0 else 0.0
            nil_fam = nil_families_2025.get(nil_id, 0)
            fam_contrib = round(nil_fam * cap_civic_share)
            estimated_families_float += fam_contrib

            nil_contributions.append({
                "nilId": nil_id,
                "nilName": nil_names.get(nil_id, f"NIL {nil_id}"),
                "nilFamilies2025": nil_fam,
                "civicsInNilWithCap": c_count,
                "totalCivicsInNil": tot_in_nil,
                "capCivicShare": cap_civic_share,
                "estimatedFamiliesContribution": fam_contrib
            })

        estimated_families = round(estimated_families_float)
        recommended_quantity = round(estimated_families * 1.1)

        # Deterministic confidence evaluation
        if civic_count >= 500 and joined_rate >= 0.95 and top_nil_share >= 0.65:
            confidence = "high"
            confidence_label = "Alta"
        elif civic_count >= 150 and joined_rate >= 0.85:
            confidence = "medium"
            confidence_label = "Media"
        else:
            confidence = "low"
            confidence_label = "Bassa"

        cap_estimates[cap] = {
            "cap": cap,
            "estimatedFamilies": estimated_families,
            "recommendedQuantity": recommended_quantity,
            "confidence": confidence,
            "confidenceLabel": confidence_label,
            "civicSampleCount": civic_count,
            "joinedCivicRate": joined_rate,
            "municipi": sorted(list(cap_municipi[cap])),
            "nilCount": len(nil_contributions),
            "primaryNilName": nil_contributions[0]["nilName"] if nil_contributions else None,
            "primaryNilShare": round(top_nil_share, 4),
            "nilContributions": nil_contributions
        }

    document = {
        "schemaVersion": 1,
        "label": "Stima territoriale CAP Milano",
        "generatedOn": str(date.today()),
        "license": "CC BY 4.0",
        "methodology": "Stima VolantiniPro basata su ripartizione dei civici CAP nei NIL comunali (DS2973 + DS634 + DS1440)",
        "disclaimer": "Il CAP è utilizzato come area operativa stimata. Non rappresenta un confine postale ufficiale.",
        "canonicalFlyerFactor": 1.1,
        "quality": {
            "totalJoinedCivics": total_joined,
            "excludedRecords": total_excluded,
            "totalValidCaps": len(cap_estimates)
        },
        "estimates": cap_estimates
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {output_path} ({len(cap_estimates)} CAP estimates computed)")


if __name__ == "__main__":
    main()
