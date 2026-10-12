# FY 2026-27 assessment rolls

Parcel lists taken from the assessment rolls in the City of Concord's
Fiscal Year 2026-27 Final Engineer's Reports (source URLs are listed in
[assessment-functions.md](../assessment-functions.md#source-notes)). Owner
names are left out on purpose. Amounts are the per-parcel assessments in
dollars.

| File | District | Report pages | Parcels | Total | Matches report |
|---|---|---|---:|---:|---|
| [pine-hollow-2026-27.csv](pine-hollow-2026-27.csv) | Pine Hollow Estates | PDF pp. 19-23 | 401 | $61,755.46 | Yes (401 parcels, $61,755.46) |
| [district-3-2026-27.csv](district-3-2026-27.csv) | LLMD No. 3 | PDF pp. 23-28 | 503 | $31,444.52 | Yes (Kirkwood 468 × $40.64 = $19,019.52; Ygnacio Woods 35 × $355.00 = $12,425.00) |
| [downtown-2026-27.csv](downtown-2026-27.csv) | Downtown LMD | PDF pp. 24-41 | 767 | $519,152.18 | Yes ($519,152.18) |

Every APN in all three files matches a record in the map app's parcel data
(`public/data/attributes/*.json`). The rolls write APNs as `112-138-003`, and
the parcel data writes them as `112138003`. Remove the dashes to join them.

## Columns

- `pine-hollow-2026-27.csv`: `apn`, `assessment`.
- `district-3-2026-27.csv`: `apn`, `zone` (`Kirkwood` or `Ygnacio Woods`),
  `assessment`.
- `downtown-2026-27.csv`: `apn`, `property_class` (the report's codes, such as
  `COM`, `CONDO`, `MFR`, `SFR`, `IND`, `PUB`; a leading `V` means vacant),
  `todos_santos`, `collector_median`, `streetscape` (`Y` if the roll lists
  the parcel in that special benefit zone), `site_address`, `assessment`.

## Notes and gaps

- **District No. 3:** Valley Terrace (24 parcels) and Balhan Terrace
  (6 parcels / 13 units) are levied $0.00 this year, so they are not in the
  roll. Their members would have to come from the report's boundary diagrams.
- **Downtown:** the roll's zone legend only covers Todos Santos (T),
  Collector Median (C) and Streetscape (S). The report says every parcel in
  the district is in the Thoroughfare Median zone, so all 767 rows are in that
  zone. Zone counts in the roll: Todos Santos 248, Collector Median 44,
  Streetscape 323; 302 parcels are in the Thoroughfare zone only.
- **Downtown frontage** (`F_i`) is not printed in the roll, only the final
  amount.
- **Citywide Street Lighting:** the report does not include the roll.
  Appendix B is "on file in the Office of the City Clerk".
- Parsing: Pine Hollow and District No. 3 were read from the PDF text.
  Downtown was read by word position with `pdfplumber`, because the zone
  letters run into the owner and address text.

## District outlines

[district-outlines-2026-27.geojson](district-outlines-2026-27.geojson) has an
approximate outline (WGS84) for each district or zone built from the rolls:
Pine Hollow, Kirkwood, Ygnacio Woods, the whole Downtown district
(= Thoroughfare Median zone), and the Downtown Todos Santos, Collector Median
and Streetscape zones. These are **not** the official assessment diagrams.

[build_district_outlines.py](../build_district_outlines.py) makes them from
the map app's parcel tiles (`public/data/tiles/*.geojson`). It needs `shapely`
and `pyproj`. Run it from the repository root:

```powershell
python meta-analysis/build_district_outlines.py
```

For each layer, in meters (NAD83 / UTM 10N), it:

1. merges the member parcels;
2. grows the merged shape by the gap distance plus 1.5 m, then shrinks it by
   the gap distance. This fills streets and small gaps between members and
   rounds off notches;
3. fills interior holes smaller than 3 ha, so small non-member lots are
   inside. Larger holes, such as Pine Hollow's central open-space parcel,
   stay out;
4. simplifies the edge with a 1.5 m tolerance and checks that every member
   parcel is still fully inside.

The gap distance is 30 m for every layer except Streetscape, which uses 15 m
because its parcels are narrow strips along separate streets.

Each feature's properties include `member_parcels`, `area_acres`,
`member_parcel_acres`, `parts` and `non_member_parcels_inside` (parcels with
more than half their area inside the outline). Most of those non-members are
common areas, public land or placeholder parcels (`USE_CODE` 79 or 87, or
APNs ending in `XXX`) that are not assessed, so they are expected inside a
district boundary.

| Layer | Parcels | Parts | Acres | Non-members inside |
|---|---:|---:|---:|---:|
| Pine Hollow | 401 | 1 | 110.15 | 6 |
| District No. 3, Kirkwood | 468 | 1 | 99.61 | 6 |
| District No. 3, Ygnacio Woods | 35 | 1 | 8.50 | 1 |
| Downtown (whole district) | 767 | 4 | 783.24 | 25 |
| Downtown, Todos Santos | 248 | 1 | 150.39 | 8 |
| Downtown, Collector Median | 44 | 2 | 187.69 | 4 |
| Downtown, Streetscape | 323 | 6 | 210.29 | 46 |

Downtown splits into pieces where Highway 242 and the rail line cross it.
The Streetscape zone stays as several separate street corridors. No outline
is made for Valley Terrace, Balhan Terrace or Citywide, since they have no
roll.

## Map data

[build_district_index.py](../build_district_index.py) combines these rolls and
the outlines into `public/data/districts.json` for the district map and the
calculator page. It has district names, colors, parcel counts and roll
totals, the outlines, and an index from APN (no dashes) to each roll entry:
district, amount, District No. 3 zone, and Downtown property class and zones.
It uses only the standard library. Run it after the outline builder:

```powershell
python meta-analysis/build_district_index.py
```
