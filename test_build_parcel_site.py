import json
import tempfile
import unittest
from pathlib import Path

from build_parcel_site import build, geometry_bounds


class SiteBuildTests(unittest.TestCase):
    def test_build_preserves_geometry_and_all_attributes_once(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            features = []
            for oid, x in [(1, -122.03), (2, -122.029), (3, -121.98)]:
                features.append({
                    "type": "Feature",
                    "properties": {"OBJECTID": oid, "APN": f"00100000{oid}", "OWNER": None},
                    "geometry": {"type": "Polygon", "coordinates": [
                        [[x, 38], [x + .001, 38], [x + .001, 38.001], [x, 38]]
                    ]},
                })
            features.append({"type": "Feature", "properties": {"OBJECTID": 4, "APN": "004"}, "geometry": None})
            source = root / "source.json"
            source.write_text(json.dumps({"type": "FeatureCollection", "features": features}))
            output = root / "data"
            manifest = build(source, output)
            self.assertEqual(manifest["feature_count"], 4)
            self.assertEqual(manifest["geometry_count"], 3)
            self.assertEqual(manifest["null_geometry_ids"], [4])
            rows = json.loads((output / "search.json").read_text())
            self.assertEqual({r["id"] for r in rows}, {1, 2, 3, 4})
            mapped = {}
            records = {}
            for tile in manifest["tiles"]:
                data = json.loads((output / "tiles" / f"{tile['id']}.geojson").read_text())
                for feature in data["features"]:
                    self.assertNotIn(feature["id"], mapped)
                    mapped[feature["id"]] = feature["geometry"]
                records.update(json.loads((output / "attributes" / f"{tile['id']}.json").read_text()))
            records.update(json.loads((output / "attributes" / "no-geometry.json").read_text()))
            for feature in features:
                oid = feature["properties"]["OBJECTID"]
                self.assertEqual(records[str(oid)], feature["properties"])
                if feature["geometry"]:
                    self.assertEqual(mapped[oid], feature["geometry"])

    def test_multipolygon_bounds_include_every_part(self):
        geometry = {"type": "MultiPolygon", "coordinates": [
            [[[0, 0], [1, 0], [1, 1], [0, 0]]],
            [[[2, 2], [3, 2], [3, 3], [2, 2]]],
        ]}
        self.assertEqual(geometry_bounds(geometry), [0, 0, 3, 3])

    def test_invalid_coordinates_fail(self):
        with self.assertRaises(ValueError):
            geometry_bounds({"type": "Polygon", "coordinates": [[[190, 0], [0, 0], [190, 0]]]})


if __name__ == "__main__":
    unittest.main()
