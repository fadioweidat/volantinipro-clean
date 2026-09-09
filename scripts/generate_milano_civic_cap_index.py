"""Build the presentation-only Milano civic -> CAP lookup.

Usage:
  python scripts/generate_milano_civic_cap_index.py DS2973.csv DS634.csv OUTPUT.json

The output contains no coordinates or geometries. Only unique, quality-audited
DS2973/DS634 civic joins are admitted.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path


STREET_TYPES = {
    "ALZAIA", "AUTOSTRADA", "BASTIONI", "BORGO", "CAVALCAVIA", "CORSO",
    "FORO", "GALLERIA", "LARGO", "PIAZZA", "PIAZZALE", "RIPA", "RONDO",
    "ROTONDA", "STRADA", "TERRAGGIO", "VIA", "VIALE", "VICOLO",
}


def clean(value: str | None) -> str:
    return (value or "").strip().upper()


def digits(value: str | None) -> str:
    value = clean(value)
    return str(int(value)) if value.isdigit() else value.lstrip("0") or "0"


def civic_parts(number: str | None, suffix: str | None) -> tuple[str, str, str]:
    number = digits(number)
    suffix = re.sub(r"[^A-Z0-9]", "", clean(suffix))
    if suffix.isalpha():
        return number, suffix, ""
    return number, "", suffix


def join_key(code: str | None, number: str | None, suffix: str | None) -> str:
    num, letter, bar = civic_parts(number, suffix)
    return "|".join((digits(code), num, letter, bar))


def street_tokens(value: str | None) -> list[str]:
    value = unicodedata.normalize("NFKD", clean(value))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    tokens = re.findall(r"[A-Z0-9]+", value)
    return [token for token in tokens if token not in STREET_TYPES]


def civic_key(street: str | None, number: str | None, suffix: str | None = "", *, sorted_tokens: bool) -> str:
    num, letter, bar = civic_parts(number, suffix)
    tokens = street_tokens(street)
    return f"{' '.join(sorted(tokens) if sorted_tokens else tokens)}|{num}{letter}{bar}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def rows(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        yield from csv.DictReader(handle, delimiter=";")


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("Expected DS2973.csv DS634.csv OUTPUT.json")
    ds2973, ds634, output = map(Path, sys.argv[1:])

    civic_rows: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows(ds634):
        suffix = clean(row["LETTERA"]) or clean(row["BARRA"])
        civic_rows[join_key(row["CODICE_VIA"], row["NUMERO"], suffix)].append(row)

    exact_candidates: dict[str, set[str]] = defaultdict(set)
    normalized_candidates: dict[str, set[str]] = defaultdict(set)
    joined = ambiguous = unmatched = excluded_cap = 0
    for source in rows(ds2973):
        suffix = clean(source["BARRATO"])
        matches = civic_rows.get(join_key(source["CODICE_VIA"], source["CIVICO"], suffix), [])
        base = [row for row in matches if not clean(row["BARRA2"])]
        chosen = base if base else matches
        unique_sites = {(clean(row["LONG_WGS84"]), clean(row["LAT_WGS84"])) for row in chosen}
        if not chosen:
            unmatched += 1
            continue
        if len(unique_sites) != 1:
            ambiguous += 1
            continue
        cap_suffix = digits(source["CAP"])
        cap = f"20{int(cap_suffix):03d}" if cap_suffix.isdigit() else ""
        if not re.fullmatch(r"201\d{2}", cap) or cap == "20100":
            excluded_cap += 1
            continue
        joined += 1
        civic = f"{source['CIVICO']}{suffix}"
        names = {source["DESCRIZIONE_VIA"]}
        for match in chosen:
            names.update((match["DENOMINAZIONE"], match["DESCRITTIVO"], match["OPENSTREETMAP"]))
        for name in names:
            exact_key = civic_key(name, civic, sorted_tokens=False)
            normalized_key = civic_key(name, civic, sorted_tokens=True)
            if exact_key.split("|", 1)[0]: exact_candidates[exact_key].add(cap)
            if normalized_key.split("|", 1)[0]: normalized_candidates[normalized_key].add(cap)

    exact_lookup = {key: next(iter(caps)) for key, caps in exact_candidates.items() if len(caps) == 1}
    normalized_lookup = {key: next(iter(caps)) for key, caps in normalized_candidates.items() if len(caps) == 1}
    conflicting = sum(1 for caps in normalized_candidates.values() if len(caps) > 1)
    document = {
        "schemaVersion": 1,
        "label": "CAP rilevato dall'indirizzo",
        "license": "CC BY 4.0",
        "generatedOn": date.today().isoformat(),
        "sources": [
            {
                "dataset": "DS2973 — Referendum confermativo 2026 stradario",
                "url": "https://dati.comune.milano.it/dataset/645e8e6a-aff3-47ef-9dce-4d102ff471b8/resource/e1a336d2-8dd6-483f-913f-4388758dd446/download/ds2973_stradario_referendum_2026.csv",
                "sha256": sha256(ds2973),
            },
            {
                "dataset": "DS634 — Numeri civici con coordinate geografiche",
                "url": "https://dati.comune.milano.it/dataset/5c6519f6-6d26-41c9-b53b-6106e08d1b90/resource/533b4e63-3d78-4bb5-aeb4-6c5f648f7f21/download/ds634_civici_coordinategeografiche_20260901_final_csv.zip",
                "resourceArchiveSha256": "23E6B16730E1B219E3E764D2AC3DFA56E4D8D22D84B63071C46E07C6967E5322",
                "extractedCsvSha256": sha256(ds634),
            },
        ],
        "quality": {
            "uniqueJoinedRecords": joined,
            "ambiguousRecordsExcluded": ambiguous,
            "unmatchedRecordsExcluded": unmatched,
            "invalidOrLegacyCapRecordsExcluded": excluded_cap,
            "conflictingLookupKeysExcluded": conflicting,
        },
        "exactLookup": dict(sorted(exact_lookup.items())),
        "normalizedLookup": dict(sorted(normalized_lookup.items())),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"output": str(output), "bytes": output.stat().st_size, **document["quality"], "exactKeys": len(exact_lookup), "normalizedKeys": len(normalized_lookup)}, indent=2))


if __name__ == "__main__":
    main()
