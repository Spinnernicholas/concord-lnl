import csv
import json
import tempfile
import unittest
from pathlib import Path

from download_parcels import LAYER_URL, download, same_spatial_reference, validate_batch


FIELDS = ["OBJECTID", "APN", "OWNER"]
SR = {"wkid": 103005, "latestWkid": 6420}


class FakeClient:
    def __init__(self):
        self.ids = [3, 1, 2]
        self.queries = []
        self.truncate = False
        self.change_census = False
        self.census_calls = 0

    def request(self, url, params=None):
        if url == LAYER_URL:
            return {
                "geometryType": "esriGeometryPolygon", "maxRecordCount": 2,
                "extent": {"spatialReference": SR},
                "fields": [
                    {"name": name, "type": "esriFieldTypeOID" if name == "OBJECTID" else "esriFieldTypeString"}
                    for name in FIELDS
                ] + [{"name": "Shape", "type": "esriFieldTypeGeometry"}],
            }
        if params is None:
            return {"source": url}
        if params.get("returnIdsOnly"):
            self.census_calls += 1
            ids = self.ids + [4] if self.change_census and self.census_calls > 1 else self.ids
            return {"objectIds": ids[:], "objectIdFieldName": "OBJECTID"}
        if params.get("returnCountOnly"):
            return {"count": len(self.ids)}
        self.queries.append(params)
        ids = [int(value) for value in params["objectIds"].split(",")]
        geojson = params["f"] == "geojson"
        features = []
        for oid in reversed(ids):
            attrs = {"OBJECTID": oid, "APN": f"00100000{oid}", "OWNER": None}
            coords = [[0, 0], [1, 0], [1, 1], [0, 0]]
            geometry = {"type": "Polygon", "coordinates": [coords]} if geojson else {"rings": [coords]}
            features.append({
                "properties" if geojson else "attributes": attrs,
                "geometry": None if oid == 3 else geometry,
            })
        return {
            "type": "FeatureCollection", "spatialReference": SR,
            "features": features, "exceededTransferLimit": self.truncate,
        }


class ParcelTests(unittest.TestCase):
    def test_spatial_reference_ignores_storage_tolerances_and_accepts_aliases(self):
        self.assertTrue(same_spatial_reference(SR, {**SR, "xyTolerance": 0.003}))
        self.assertTrue(same_spatial_reference(SR, {"wkid": 6420}))
        self.assertFalse(same_spatial_reference(SR, {"wkid": 4326}))
        self.assertFalse(same_spatial_reference({}, {}))

    def test_download_exports_all_fields_geometry_and_resumes(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            client = FakeClient()
            summary = download(output, client, batch_size=1000)
            self.assertTrue(summary["complete"])
            self.assertEqual(summary["feature_count"], 3)
            self.assertEqual(summary["attribute_count"], 3)
            self.assertEqual(summary["null_geometry_object_ids"], [3])
            self.assertEqual(len(client.queries), 4)
            self.assertEqual(client.queries[1]["outSR"], 4326)
            native = json.loads((output / "parcels.esri.json").read_text())
            geo = json.loads((output / "parcels.geojson").read_text())
            self.assertEqual(native["spatialReference"], SR)
            self.assertEqual(len(native["features"]), 3)
            self.assertEqual(len(geo["features"]), 3)
            with (output / "parcel_attributes.csv").open(newline="") as stream:
                rows = list(csv.DictReader(stream))
            self.assertEqual(set(rows[0]), set(FIELDS))
            self.assertTrue(all(row["APN"].startswith("001") for row in rows))
            download(output, client)
            self.assertEqual(len(client.queries), 4)
            for name, info in summary["files"].items():
                self.assertEqual((output / name).stat().st_size, info["bytes"])
                self.assertEqual(len(info["sha256"]), 64)

    def test_truncated_download_does_not_publish_completion(self):
        with tempfile.TemporaryDirectory() as temporary:
            client = FakeClient()
            client.truncate = True
            with self.assertRaisesRegex(ValueError, "truncated"):
                download(Path(temporary), client)
            self.assertFalse((Path(temporary) / "summary.json").exists())

    def test_changed_census_does_not_publish_completion(self):
        with tempfile.TemporaryDirectory() as temporary:
            client = FakeClient()
            client.change_census = True
            with self.assertRaisesRegex(ValueError, "census changed"):
                download(Path(temporary), client)
            self.assertFalse((Path(temporary) / "parcels.geojson").exists())

    def test_changed_filter_does_not_reuse_batches(self):
        with tempfile.TemporaryDirectory() as temporary:
            client = FakeClient()
            download(Path(temporary), client)
            download(Path(temporary), client, where="s_city = 'CONCORD'")
            self.assertEqual(len(client.queries), 8)

    def test_invalid_batches_are_rejected(self):
        attributes = {"OBJECTID": 1, "APN": "001000001", "OWNER": None}
        feature = {"attributes": attributes, "geometry": {"rings": [[[0, 0], [1, 1], [0, 0]]]}}
        for response in [
            {"features": [feature, feature]},
            {"features": []},
            {"features": [{"attributes": {"OBJECTID": 1}, "geometry": None}]},
            {"features": [feature], "exceededTransferLimit": True},
        ]:
            with self.subTest(response=response), self.assertRaises(ValueError):
                validate_batch(response, [1], "OBJECTID", FIELDS)


if __name__ == "__main__":
    unittest.main()
