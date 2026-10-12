"""Build spatial chunks and a search index for the static Leaflet parcel site."""

import argparse
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from download_parcels import write_json

CELL_SIZE = 0.005


def geometry_bounds(geometry):
    if geometry["type"] not in {"Polygon", "MultiPolygon"}:
        raise ValueError(f"Unsupported geometry: {geometry['type']}")
    points = []

    def visit(value):
        if isinstance(value[0], (int, float)):
            x, y = value[:2]
            if not math.isfinite(x) or not math.isfinite(y) or not (-180 <= x <= 180 and -90 <= y <= 90):
                raise ValueError("Coordinates must be finite WGS84 longitude/latitude")
            points.append((x, y))
        else:
            for child in value:
                visit(child)

    visit(geometry["coordinates"])
    return [
        min(p[0] for p in points), min(p[1] for p in points),
        max(p[0] for p in points), max(p[1] for p in points),
    ]


def combined_bounds(bounds):
    return [
        min(b[0] for b in bounds), min(b[1] for b in bounds),
        max(b[2] for b in bounds), max(b[3] for b in bounds),
    ]


def build(source, output, metadata_path=None):
    data = json.loads(source.read_text(encoding="utf-8"))
    if data.get("type") != "FeatureCollection" or not data.get("features"):
        raise ValueError("Expected a nonempty GeoJSON FeatureCollection")
    groups = defaultdict(list)
    rows = []
    seen = set()
    null_ids = []
    for feature in data["features"]:
        properties = feature["properties"]
        oid = properties["OBJECTID"]
        if oid in seen:
            raise ValueError(f"Duplicate OBJECTID: {oid}")
        seen.add(oid)
        geometry = feature.get("geometry")
        bounds = geometry_bounds(geometry) if geometry else None
        if bounds:
            x = math.floor((bounds[0] + bounds[2]) / 2 / CELL_SIZE)
            y = math.floor((bounds[1] + bounds[3]) / 2 / CELL_SIZE)
            tile = f"{x}_{y}"
            groups[tile].append((feature, bounds))
        else:
            null_ids.append(oid)
            tile = "no-geometry"
            groups[tile].append((feature, bounds))
        rows.append({
            "id": oid, "apn": properties.get("APN") or "",
            "address": properties.get("full_address_display") or "",
            "use": properties.get("USE_DESC") or "", "tile": tile, "bounds": bounds,
        })
    output.mkdir(parents=True, exist_ok=True)
    tiles_dir = output / "tiles"
    attributes_dir = output / "attributes"
    tiles_dir.mkdir(exist_ok=True)
    attributes_dir.mkdir(exist_ok=True)
    manifest_tiles = []
    for tile, entries in sorted(groups.items()):
        features = []
        attributes = {}
        for feature, bounds in entries:
            props = feature["properties"]
            attributes[str(props["OBJECTID"])] = props
            if bounds:
                features.append({
                    "type": "Feature", "id": props["OBJECTID"], "geometry": feature["geometry"],
                    "properties": {key: props.get(key) for key in
                                   ("OBJECTID", "APN", "full_address_display", "USE_DESC")},
                })
        write_json(attributes_dir / f"{tile}.json", attributes)
        if features:
            write_json(tiles_dir / f"{tile}.geojson", {"type": "FeatureCollection", "features": features})
            manifest_tiles.append({
                "id": tile, "count": len(features),
                "bounds": combined_bounds([b for _, b in entries if b]),
            })
    if not manifest_tiles:
        raise ValueError("No parcel geometries to map")
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path else {}
    write_json(output / "search.json", rows)
    manifest = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "feature_count": len(seen), "geometry_count": len(seen) - len(null_ids),
        "null_geometry_ids": null_ids, "bounds": combined_bounds([t["bounds"] for t in manifest_tiles]),
        "tiles": manifest_tiles, "fields": metadata.get("fields", []),
        "minimum_zoom": 15,
    }
    write_json(output / "manifest.json", manifest)
    print(f"Built {len(seen):,} parcels in {len(manifest_tiles):,} spatial chunks at {output.resolve()}")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("data") / "parcels" / "parcels.geojson")
    parser.add_argument("--output", type=Path, default=Path("public") / "data")
    parser.add_argument("--metadata", type=Path, default=Path("data") / "parcels" / "layer_metadata.json")
    args = parser.parse_args()
    build(args.source, args.output, args.metadata)


if __name__ == "__main__":
    main()
