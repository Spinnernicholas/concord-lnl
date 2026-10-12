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
