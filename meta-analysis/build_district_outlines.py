"""Build approximate district and zone outlines from assessment-roll parcels.

Each outline is a morphological closing of the member parcels: the merged
parcels are grown by a gap distance, shrunk by the same distance, simplified,
and patched so every member parcel stays inside. This fills streets and small
gaps between member parcels and gives a smooth, consistent outline. It is not
the official assessment diagram.

Requires shapely and pyproj. Run from the repository root:

    python meta-analysis/build_district_outlines.py
"""

import argparse
import csv
import glob
import json
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely import STRtree, transform
from shapely.geometry import Polygon, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
ROLLS = ROOT / "meta-analysis" / "rolls"
TILES = ROOT / "public" / "data" / "tiles"
OUT = ROLLS / "district-outlines-2026-27.geojson"

# NAD83 / UTM zone 10N, in meters.
PROJECTED_CRS = 26910
FILL_HOLES_UNDER_M2 = 30_000


def roll(name, match):
    with open(ROLLS / name, newline="", encoding="utf-8") as f:
        return [
            r["apn"].replace("-", "")
            for r in csv.DictReader(f)
            if all(r[k] == v for k, v in match.items())
        ]


def reproject(geom, transformer):
    return transform(geom, lambda xy: np.column_stack(transformer.transform(xy[:, 0], xy[:, 1])))


# id, district, zone, roll file, filter, gap distance in meters
LAYERS = [
    ("pine-hollow", "Pine Hollow Estates LLMD", None, "pine-hollow-2026-27.csv", {}, 30),
    ("district-3-kirkwood", "LLMD No. 3", "Kirkwood", "district-3-2026-27.csv", {"zone": "Kirkwood"}, 30),
    ("district-3-ygnacio-woods", "LLMD No. 3", "Ygnacio Woods Unit II", "district-3-2026-27.csv", {"zone": "Ygnacio Woods"}, 30),
    ("downtown", "Downtown LMD", "Thoroughfare Median (whole district)", "downtown-2026-27.csv", {}, 30),
    ("downtown-todos-santos", "Downtown LMD", "Todos Santos Plaza", "downtown-2026-27.csv", {"todos_santos": "Y"}, 30),
    ("downtown-collector-median", "Downtown LMD", "Collector Median", "downtown-2026-27.csv", {"collector_median": "Y"}, 30),
    ("downtown-streetscape", "Downtown LMD", "Streetscape", "downtown-2026-27.csv", {"streetscape": "Y"}, 15),
]


def load_parcels():
    to_m = Transformer.from_crs(4326, PROJECTED_CRS, always_xy=True)
    parcels = {}
    for path in sorted(glob.glob(str(TILES / "*.geojson"))):
        with open(path, encoding="utf-8") as f:
            for feature in json.load(f)["features"]:
                apn = (feature.get("properties") or {}).get("APN")
                if not apn or not feature.get("geometry"):
                    continue
                g = reproject(shape(feature["geometry"]), to_m).buffer(0)
                parcels[apn] = parcels[apn].union(g) if apn in parcels else g
    return parcels


def polygons(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if hasattr(geom, "geoms") else [geom]


def fill_small_holes(geom, max_area):
    out = []
    for p in polygons(geom):
        keep = [h for h in p.interiors if Polygon(h).area >= max_area]
        out.append(Polygon(p.exterior, keep))
    return unary_union(out)


def outline(members, gap, tolerance):
    merged = unary_union(members)
    closed = merged.buffer(gap + tolerance, quad_segs=8).buffer(-gap, quad_segs=8)
    closed = fill_small_holes(closed, FILL_HOLES_UNDER_M2)
    result = closed.simplify(tolerance)
    missing = merged.difference(result)
    if missing.area > 0:
        result = result.union(missing.buffer(tolerance, quad_segs=2)).simplify(tolerance / 4)
    return merged, result


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tolerance", type=float, default=1.5, help="simplify tolerance and edge margin, meters")
    parser.add_argument("--out", type=Path, default=OUT)
    args = parser.parse_args()

    parcels = load_parcels()
    apns = list(parcels)
    tree = STRtree([parcels[a] for a in apns])
    to_ll = Transformer.from_crs(PROJECTED_CRS, 4326, always_xy=True)

    features = []
    for layer_id, district, zone, roll_file, match, gap in LAYERS:
        member_apns = roll(roll_file, match)
        missing = [a for a in member_apns if a not in parcels]
        if missing:
            raise SystemExit(f"{layer_id}: {len(missing)} roll APNs have no parcel geometry: {missing[:5]}")
        member_set = set(member_apns)
        merged, geom = outline([parcels[a] for a in member_apns], gap, args.tolerance)
        if not geom.buffer(0.01).covers(merged):
            raise SystemExit(f"{layer_id}: outline does not contain every member parcel")

        others = [
            apns[i] for i in tree.query(geom)
            if apns[i] not in member_set
            and parcels[apns[i]].intersection(geom).area > 0.5 * parcels[apns[i]].area
        ]
        parts = polygons(geom)
        props = {
            "id": layer_id,
            "district": district,
            "zone": zone,
            "fiscal_year": "2026-27",
            "member_parcels": len(member_apns),
            "gap_distance_m": gap,
            "tolerance_m": args.tolerance,
            "area_acres": round(geom.area / 4046.8564224, 2),
            "member_parcel_acres": round(merged.area / 4046.8564224, 2),
            "parts": len(parts),
            "non_member_parcels_inside": len(others),
        }
        gj = json.loads(json.dumps(mapping(reproject(geom, to_ll))), parse_float=lambda s: round(float(s), 6))
        features.append({"type": "Feature", "properties": props, "geometry": gj})
        print(
            f"{layer_id:27} parcels={len(member_apns):4} parts={len(parts):2} "
            f"acres={props['area_acres']:8.2f} non-members inside={len(others)}"
        )

    args.out.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}")


if __name__ == "__main__":
    main()
