"""Build public/data/districts.json for the parcel map and the calculators.

Combines the FY 2026-27 assessment rolls (meta-analysis/rolls/*.csv) and the
approximate district outlines (district-outlines-2026-27.geojson) into one
file: district summaries, outlines, and an APN index of roll entries.

Uses only the standard library. Run from the repository root after
build_district_outlines.py:

    python meta-analysis/build_district_index.py
"""

import csv
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROLLS = ROOT / "meta-analysis" / "rolls"
OUTLINES = ROLLS / "district-outlines-2026-27.geojson"
OUT = ROOT / "public" / "data" / "districts.json"

DISTRICTS = [
    {
        "id": "pine-hollow",
        "name": "Pine Hollow Estates LLMD",
        "short": "Pine Hollow",
        "color": "#1b9e77",
        "roll": "pine-hollow-2026-27.csv",
        "layers": ["pine-hollow"],
    },
    {
        "id": "district-3",
        "name": "Landscape & Lighting Maintenance District No. 3",
        "short": "District No. 3",
        "color": "#d95f02",
        "roll": "district-3-2026-27.csv",
        "layers": ["district-3-kirkwood", "district-3-ygnacio-woods"],
    },
    {
        "id": "downtown",
        "name": "Downtown Landscape Maintenance District",
        "short": "Downtown",
        "color": "#7570b3",
        "roll": "downtown-2026-27.csv",
        "layers": ["downtown", "downtown-todos-santos", "downtown-collector-median", "downtown-streetscape"],
    },
    {
        "id": "citywide",
        "name": "Citywide Street Lighting Assessment District",
        "short": "Citywide",
        "color": "#c9a227",
        "roll": None,
        "layers": [],
        "note": "Per-parcel roll is not published. Map estimates use USE_CODE and the EDU schedule.",
    },
]

LAYER_COLORS = {
    "downtown-todos-santos": "#e7298a",
    "downtown-collector-median": "#66a61e",
    "downtown-streetscape": "#a6761d",
}
ZONE_CODES = {"Kirkwood": "K", "Ygnacio Woods": "Y"}


def read_roll(name):
    with open(ROLLS / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def entry(district_id, row):
    out = {"d": district_id, "a": float(row["assessment"])}
    if district_id == "district-3":
        out["z"] = ZONE_CODES[row["zone"]]
    elif district_id == "downtown":
        out["c"] = row["property_class"]
        out["z"] = "".join(
            code for code, col in (("T", "todos_santos"), ("C", "collector_median"), ("S", "streetscape"))
            if row[col] == "Y"
        )
    return out


def main():
    outlines = json.loads(OUTLINES.read_text(encoding="utf-8"))
    by_layer = {f["properties"]["id"]: f for f in outlines["features"]}

    parcels = {}
    districts = []
    for d in DISTRICTS:
        meta = {k: v for k, v in d.items() if k != "roll"}
        if d["roll"]:
            rows = read_roll(d["roll"])
            total = sum(Decimal(r["assessment"]) for r in rows)
            meta["parcels"] = len(rows)
            meta["total"] = float(total)
            for r in rows:
                parcels.setdefault(r["apn"].replace("-", ""), []).append(entry(d["id"], r))
        meta["layers"] = [
            {
                "id": lid,
                "zone": by_layer[lid]["properties"]["zone"],
                "parcels": by_layer[lid]["properties"]["member_parcels"],
                "color": LAYER_COLORS.get(lid, d["color"]),
            }
            for lid in d["layers"]
        ]
        districts.append(meta)

    features = []
    for d in DISTRICTS:
        for lid in d["layers"]:
            f = by_layer[lid]
            features.append({
                "type": "Feature",
                "properties": {
                    "id": lid,
                    "district_id": d["id"],
                    "zone": f["properties"]["zone"],
                    "color": LAYER_COLORS.get(lid, d["color"]),
                },
                "geometry": f["geometry"],
            })

    data = {
        "fiscal_year": "2026-27",
        "source": "City of Concord FY 2026-27 Engineer's Reports; outlines are approximate.",
        "districts": districts,
        "outlines": {"type": "FeatureCollection", "features": features},
        "parcels": dict(sorted(parcels.items())),
    }
    OUT.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    for d in districts:
        print(f"{d['id']:12} parcels={d.get('parcels', '-')!s:>4} total={d.get('total', '-')}")
    print(f"{len(parcels)} APNs; wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
