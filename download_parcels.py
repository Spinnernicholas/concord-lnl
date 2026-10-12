"""Download complete parcel geometry and attributes from Concord's public GIS."""

import argparse
import csv
import hashlib
import json
import logging
import math
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

LAYER_URL = (
    "https://gis.cityofconcord.org/gsrv1/rest/services/"
    "PublicGISBasemap/MapServer/9"
)
APP_ID = "90c227258f1c4b5d80b7fb19d855c94b"
WEBMAP_ID = "86b76da3893340a5919b6e2d59060de6"
LOG = logging.getLogger(__name__)


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, value):
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
    ) as stream:
        temporary = Path(stream.name)
        try:
            json.dump(value, stream, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            stream.write("\n")
        except BaseException:
            stream.close()
            temporary.unlink()
            raise
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class Client:
    def __init__(self, delay=1):
        self.delay = delay
        self.last_request = 0

    def request(self, url, params=None):
        for attempt in range(5):
            time.sleep(max(0, self.last_request + self.delay - time.monotonic()))
            self.last_request = time.monotonic()
            request = Request(
                url if params is not None else url + "?f=json",
                data=urlencode(params).encode() if params is not None else None,
                headers={"User-Agent": "ConcordParcelDownloader/1.0"},
            )
            try:
                with urlopen(request, timeout=120) as response:
                    result = json.load(response)
            except HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == 4:
                    raise
                retry_after = error.headers.get("Retry-After", "")
                pause = max(2 ** (attempt + 1), float(retry_after) if retry_after.isdigit() else 0)
                LOG.warning("HTTP %s; retrying in %ss", error.code, pause)
                time.sleep(pause)
                continue
            except (URLError, TimeoutError) as error:
                if attempt == 4:
                    raise
                pause = 2 ** (attempt + 1)
                LOG.warning("Network failure %s; retrying in %ss", error, pause)
                time.sleep(pause)
                continue
            if not isinstance(result, dict):
                raise ValueError("GIS response is not a JSON object")
            if "error" in result:
                raise ValueError(f"GIS query failed: {result['error']}")
            return result
        raise RuntimeError("Request attempts exhausted")


def validate_batch(response, ids, oid_field, fields, geojson=False):
    if response.get("exceededTransferLimit"):
        raise ValueError("GIS truncated a batch; rerun with a smaller --batch-size")
    if geojson and response.get("type") != "FeatureCollection":
        raise ValueError("GIS did not return a GeoJSON FeatureCollection")
    features = response.get("features")
    if not isinstance(features, list):
        raise ValueError("GIS batch has no feature list")
    key = "properties" if geojson else "attributes"
    actual = []
    for feature in features:
        attributes = feature.get(key)
        if not isinstance(attributes, dict) or set(attributes) != set(fields):
            raise ValueError("GIS feature has missing or unexpected attributes")
        actual.append(attributes[oid_field])
        geometry = feature.get("geometry")
        if geometry is not None:
            if geojson:
                if geometry.get("type") not in {"Polygon", "MultiPolygon"} or not geometry.get("coordinates"):
                    raise ValueError("Invalid GeoJSON parcel geometry")
            elif not geometry.get("rings"):
                raise ValueError("Invalid native parcel geometry")
    if len(actual) != len(ids) or set(actual) != set(ids):
        raise ValueError("GIS batch object IDs do not match the requested census")


def same_spatial_reference(left, right):
    left_codes = {left[k] for k in ("wkid", "latestWkid") if left.get(k) is not None}
    right_codes = {right[k] for k in ("wkid", "latestWkid") if right.get(k) is not None}
    return bool(left_codes & right_codes) or bool(left.get("wkt") and left.get("wkt") == right.get("wkt"))


def export(output, cache_paths, metadata, census, fields):
    oid_field = census["objectIdFieldName"]
    names = ["parcels.geojson", "parcels.esri.json", "parcel_attributes.csv"]
    null_geometry_ids = []
    with tempfile.TemporaryDirectory(dir=output) as temporary:
        staging = Path(temporary)
        with (
            (staging / names[0]).open("w", encoding="utf-8") as geo,
            (staging / names[1]).open("w", encoding="utf-8") as native,
            (staging / names[2]).open("w", encoding="utf-8", newline="") as table,
        ):
            geo.write('{"type":"FeatureCollection","features":[')
            # Native rings, curve vertex IDs, units, and field types stay unchanged.
            header = {
                "geometryType": metadata["geometryType"],
                "spatialReference": metadata["extent"]["spatialReference"],
                "fields": [f for f in metadata["fields"] if f["name"] in fields],
            }
            native.write(json.dumps(header, ensure_ascii=False)[:-1] + ',"features":[')
            writer = csv.DictWriter(table, fieldnames=fields)
            writer.writeheader()
            first = True
            written_ids = set()
            for path in cache_paths:
                batch = json.loads(path.read_text(encoding="utf-8"))
                validate_batch(batch["native"], batch["ids"], oid_field, fields)
                validate_batch(batch["geojson"], batch["ids"], oid_field, fields, True)
                projected = {f["properties"][oid_field]: f for f in batch["geojson"]["features"]}
                for feature in batch["native"]["features"]:
                    attrs = feature["attributes"]
                    oid = attrs[oid_field]
                    if oid in written_ids:
                        raise ValueError(f"Duplicate object ID in export: {oid}")
                    written_ids.add(oid)
                    if feature.get("geometry") is None:
                        null_geometry_ids.append(oid)
                    if not first:
                        geo.write(",")
                        native.write(",")
                    json.dump(projected[oid], geo, ensure_ascii=False, allow_nan=False)
                    json.dump(feature, native, ensure_ascii=False, allow_nan=False)
                    writer.writerow(attrs)
                    first = False
            geo.write("]}\n")
            native.write("]}\n")
        if written_ids != set(census["objectIds"]):
            raise ValueError("Export does not match the full object-ID census")
        files = {}
        for name in names:
            path = staging / name
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            files[name] = {"bytes": path.stat().st_size, "sha256": digest.hexdigest()}
        for name in names:
            (staging / name).replace(output / name)
    return files, null_geometry_ids


def download(output, client, where="1=1", batch_size=1000):
    output.mkdir(parents=True, exist_ok=True)
    cache = output / "batches"
    cache.mkdir(exist_ok=True)
    started = timestamp()
    metadata = client.request(LAYER_URL)
    if metadata.get("geometryType") != "esriGeometryPolygon":
        raise ValueError("Expected a polygon parcel layer")
    batch_size = min(batch_size, metadata["maxRecordCount"])
    if batch_size < 1:
        raise ValueError("Batch size must be positive")
    fields = [f["name"] for f in metadata["fields"] if f["type"] != "esriFieldTypeGeometry"]
    census = client.request(
        LAYER_URL + "/query", {"f": "json", "where": where, "returnIdsOnly": "true"}
    )
    ids = census.get("objectIds")
    if not isinstance(ids, list) or not ids or len(ids) != len(set(ids)):
        raise ValueError("Invalid or empty parcel census")
    ids.sort()
    oid_field = census["objectIdFieldName"]
    if oid_field not in fields:
        raise ValueError("Census object-ID field not found in layer schema")
    count = client.request(
        LAYER_URL + "/query", {"f": "json", "where": where, "returnCountOnly": "true"}
    )["count"]
    if count != len(ids):
        raise ValueError("Server count differs from census; retry when the layer is stable")
    # An old completion marker must not describe an interrupted new export.
    (output / "summary.json").unlink(missing_ok=True)
    write_json(output / "layer_metadata.json", metadata)
    write_json(output / "object_ids.json", census)
    for item, name in [(APP_ID, "application.json"), (WEBMAP_ID, "webmap.json")]:
        source = client.request(f"https://www.arcgis.com/sharing/rest/content/items/{item}/data")
        write_json(output / name, source)
    LOG.info("Downloading %s features with %s attributes in batches of %s", count, len(fields), batch_size)
    cache_paths = []
    for offset in range(0, len(ids), batch_size):
        wanted = ids[offset:offset + batch_size]
        path = cache / f"{offset:06d}.json"
        identity = {"layer": LAYER_URL, "where": where, "ids": wanted}
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            reusable = all(saved.get(k) == v for k, v in identity.items())
        else:
            reusable = False
        if reusable:
            validate_batch(saved["native"], wanted, oid_field, fields)
            validate_batch(saved["geojson"], wanted, oid_field, fields, True)
        else:
            params = {
                "f": "json", "objectIds": ",".join(map(str, wanted)),
                "outFields": "*", "returnGeometry": "true", "returnTrueCurves": "false",
            }
            native = client.request(LAYER_URL + "/query", params)
            validate_batch(native, wanted, oid_field, fields)
            if not same_spatial_reference(
                native.get("spatialReference", {}), metadata["extent"]["spatialReference"]
            ):
                raise ValueError("Batch spatial reference differs from layer metadata")
            geojson = client.request(LAYER_URL + "/query", {**params, "f": "geojson", "outSR": 4326})
            validate_batch(geojson, wanted, oid_field, fields, True)
            native_attrs = {f["attributes"][oid_field]: f["attributes"] for f in native["features"]}
            if any(f["properties"] != native_attrs[f["properties"][oid_field]] for f in geojson["features"]):
                raise ValueError("Attributes changed between native and GeoJSON requests; rerun")
            write_json(path, {**identity, "retrieved_at": timestamp(), "native": native, "geojson": geojson})
        cache_paths.append(path)
        LOG.info("%s / %s features verified%s", min(offset + batch_size, count), count,
                 " (cached)" if reusable else "")
    final_census = client.request(
        LAYER_URL + "/query", {"f": "json", "where": where, "returnIdsOnly": "true"}
    )
    final_ids = final_census.get("objectIds")
    if not isinstance(final_ids, list) or sorted(final_ids) != ids:
        raise ValueError("Parcel census changed during download; rerun to reconcile")
    files, null_ids = export(output, cache_paths, metadata, census, fields)
    summary = {
        "complete": True, "layer_url": LAYER_URL, "application_id": APP_ID,
        "webmap_id": WEBMAP_ID, "where": where, "started_at": started,
        "completed_at": timestamp(), "feature_count": count, "attribute_count": len(fields),
        "object_id_field": oid_field, "geojson_crs": "EPSG:4326",
        "native_spatial_reference": metadata["extent"]["spatialReference"],
        "null_geometry_object_ids": null_ids, "files": files,
        "notes": [
            "All layer records are included, not just the map's s_city = 'CONCORD' filter.",
            "Shape is a geometry field; it is exported as geometry, not a CSV attribute.",
            "GeoJSON uses longitude/latitude; native JSON retains source coordinates and vertex IDs.",
            "Curves, if present, are densified by ArcGIS; no geometry precision reduction is requested.",
            "Cached batches retain their original retrieval timestamps. This is not a transactional snapshot.",
            "Separate zoning, hazard, census, and housing overlays are not parcel attributes.",
            "CSV empty cells represent null or empty strings; JSON preserves the distinction.",
        ],
    }
    if where != "1=1":
        summary["notes"][0] = f"Records are filtered by: {where}"
    write_json(output / "summary.json", summary)
    LOG.info("Complete: %s features exported to %s", count, output.resolve())
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data") / "parcels")
    parser.add_argument("--where", default="1=1", help="ArcGIS SQL filter; default includes the entire layer")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--delay", type=float, default=1, help="Minimum seconds between request starts")
    args = parser.parse_args()
    if args.batch_size < 1 or not math.isfinite(args.delay) or args.delay < 0:
        parser.error("--batch-size must be positive and --delay must be finite and nonnegative")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        download(args.output, Client(args.delay), args.where, args.batch_size)
    except KeyboardInterrupt:
        LOG.warning("Interrupted; verified batches are saved. Rerun the same command to resume.")
        return 130
    except (OSError, ValueError, KeyError, TypeError) as error:
        LOG.error("Download failed: %s. Verified batches are saved; rerun to resume.", error)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
