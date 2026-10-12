# Assessment formula inputs in the parcel data

This note lists which inputs to the four FY 2026-27 Concord assessment
functions (see [assessment-functions.md](assessment-functions.md)) can be found
in the parcel records published with the map app (`public/data/attributes`).
It records what each field contains and how complete it is. It does not mean
a field is the value the Engineer's Reports used.

Statistics come from the snapshot built on 2026-10-12 (`public/data/manifest.json`).
That snapshot has 39,586 records, all with geometry. Every record has
`LIEN_YEAR = 2027` except 227 records with no assessor data, and every
assessor-roll sweep date (`AR_SWP_DT`) is 2026-09-04. The layer has no field
aliases or coded-value domains, so the meanings below come from field names
and observed values. Treat them as interpretations unless stated otherwise.

## Summary

| Formula input | District(s) | Parcel field | Records filled | Fit |
|---|---|---|---:|---|
| Land use type `L_i` | Citywide, District No. 3, Downtown | `USE_CODE` | 39,359 (99.4%) | Direct |
| Lot size `P_i` | Downtown | `TOT_AREA`, else `Shape.STArea()` | 31,703 / 39,586 | Close |
| Original home size `s_i` | Pine Hollow | `TLA` | 28,104 of 28,170 single-family | Approximate |
| Home count `U_i`, `u_Bi` | Downtown, District No. 3 | `UNITS` | 1,343 (3.4%) | Sparse |
| Has homes `R_i` | Downtown | Derived from `USE_CODE` | 99.4% | Derived |
| EDU `EDU_i` | District No. 3 (Ygnacio Woods) | Derived from `USE_CODE` | 99.4% | Derived |
| District or zone membership (`I_*`) | All but Citywide | none (see [rolls/](rolls/README.md)) | 0 | Missing from layer; in rolls |
| Street or median frontage `F_i` | Downtown | none | 0 | Missing |

The [Missing inputs](#missing-inputs) section lists what has to come from
somewhere else.

## Field details

### `USE_CODE`: County land use code

- Integer, filled for 39,359 records. The 227 records with no value are the
  same records that have no assessor data (`LIEN_YEAR` is also null).
- Every code in the data appears in the Citywide Street Lighting EDU schedule
  (Appendix A), so each one maps to an EDU value without gaps.
- Most common codes:

  | Code | Records | EDU schedule class |
  |---:|---:|---|
  | 11 | 24,595 | Single-family home |
  | 29 | 4,545 | Condominium |
  | 19 | 3,129 | Single-family home |
  | 16 | 2,860 | Condominium |
  | 79 | 468 | Government-owned buildings |
  | 87 | 437 | Common areas |
  | 88 | 366 | Mobile homes (land underneath only) |
  | 21 | 213 | Multiple family: 2 units |

- Codes 11, 12, 13, 14, 19 and 61 (single-family) cover 28,170 records.
- Other formula inputs derived from this code:
  - **Citywide EDU `e(L_i)`:** look the code up in the Appendix A schedule.
  - **District No. 3 `EDU_i`:** 1 for the single-family codes.
  - **Downtown residential flag `R_i`:** 1 for residential codes
    (single-family, condominium, multiple family), 0 for the rest. The report's
    own residential test is not stated as a code list, so this is an
    interpretation.
- Limits:
  - The schedule's "single-family home on private street" class (0.75 EDU)
    has no county code, so the data can't tell it apart from a regular
    single-family home (1.00 EDU).
  - Codes 79, 83 and 86 are assessed only on the part of the property used for
    business. No field gives that portion.
- `USE_DESC` is a short text description, but it is filled for only 2,326
  records (5.9%). Use `USE_CODE` instead.

### `TLA`: living area

- Stored as **text**, though every filled value parses as a positive number.
- Filled for 28,104 of 28,170 single-family records, and for 7,768
  other records.
- Single-family values: median 1,562 sq ft, 5th percentile 1,016, 95th
  percentile 2,792.
- **Fit for Pine Hollow `s_i`:** The report uses each home's floor area *when
  first built*. `TLA` is the assessor's current living area, so it can include
  later additions:
  - `ADDITION` is filled for 35,928 records: `N` 28,821, `Y` 6,948, `X` 108,
    `A` 51. Among single-family records, 6,885 are `Y`. What the letter codes
    mean is not documented.
  - `REMODEL` has codes (`N`, `X`, `K`, `B`, `T`) that are also undocumented.
  - `YR_HS_BLT` (year the house was built, stored as text) is filled for 28,102
    single-family records.
- Check: the 401 assessable Pine Hollow homes should total about 731,026
  sq ft, an average of about 1,823 sq ft per home. Summing `TLA` over the
  district's parcels would test how close `TLA` is, once those parcels are
  identified.
- `BLDG_SQFT` (1,900 records) and `NET_RNT_AR` (1,874) are mostly commercial
  building areas. They are not used by any of the four formulas.

### Lot size fields

Four fields describe lot size. Their median ratios to the mapped parcel area
are all about 1.0, which suggests `Shape.STArea()` is in square feet.

| Field | Units | Records filled | Median ratio to `Shape.STArea()` |
|---|---|---:|---:|
| `TOT_AREA` | sq ft (integer) | 31,703 (28,104 single-family) | 1.0007 |
| `GR_LND_AR` | sq ft (integer) | 2,442 | 1.0000 |
| `ACREAGE` | acres | 3,757 | 0.9992 (after × 43,560) |
| `Shape.STArea()` | sq ft (from geometry) | 39,586 | n/a |

- 34,344 records have at least one of `TOT_AREA`, `GR_LND_AR` or `ACREAGE`.
- `TOT_AREA` is within ±20% of `Shape.STArea()` for 97.9% of records. The
  5th to 95th percentile range of the ratio is 0.92 to 1.11.
- **Fit for Downtown `P_i`:** Close. A reasonable order is `TOT_AREA`, then
  `GR_LND_AR`, then `ACREAGE × 43,560`, then `Shape.STArea()`. The report
  measures "assessable parcel area," and the published fields may differ from
  it slightly.

### `UNITS`: number of homes

- Integer, filled for 1,343 records (3.4%).

  | Land use group | Records | `UNITS` filled |
  |---|---:|---:|
  | Multiple family (codes 21-28) | 705 | 496 |
  | Condominium (16, 29) | 7,405 | 110 |
  | Single-family | 28,170 | 42 |
  | Mixed multiple/commercial (48) | 20 | 9 |
  | Retirement housing (76) | 6 | 5 |

- For codes 21 to 24, the code itself gives the unit count when `UNITS` is
  blank. For example, 194 of the 213 code-21 records (2 units) have no
  `UNITS` value. The 5-12, 13-24, 25-59 and 60+ unit classes give only a
  range.
- Treating single-family and condominium records as one home each is an
  assumption the data supports but does not state.
- **Fit for Downtown `U_i` and Balhan Terrace `u_Bi`:** Sparse. Fill blank
  values using the code-based counts above.

### Location and grouping fields

These don't feed a formula directly, but they could help link parcels to
districts or zones.

- `TRACT`: subdivision tract or parcel-map number, as text. Filled for 27,497
  records with 1,306 distinct values. Pine Hollow Estates and the District
  No. 3 zones are subdivisions, so their tract numbers could identify their
  parcels if checked against the report maps.
- `TRA`: tax rate area code. 54 distinct values. It marks tax-rate areas, not
  assessment districts.
- `s_city`: city in the property address. `CONCORD` for 38,931 records. The
  others are `CLYDE` (278), blank (227), `WALNUT CREEK` (66),
  `PORT CHICAGO` (42), `MARTINEZ` (24), `BAY POINT` (15) and `PACHECO` (2).
  The map layer includes parcels outside the city, so membership in the
  Citywide Street Lighting district should not be assumed from this layer
  alone.
- `APN`: assessor's parcel number. This is the key for joining the records to
  an assessment roll or to the tax-bill collector.

## Missing inputs

1. **District and zone membership.** No field marks Pine Hollow, the four
   District No. 3 zones, or the four Downtown zones. The reports' assessment
   rolls fill most of this gap. They are saved in [rolls/](rolls/README.md),
   and every APN in them joins to this layer once the dashes are removed. The
   rolls cover:
   - all 401 Pine Hollow parcels;
   - the Kirkwood and Ygnacio Woods zones of District No. 3. Valley Terrace
     and Balhan Terrace are levied $0, so they are not listed. Use the
     boundary diagrams for those two zones;
   - all 767 Downtown parcels, with their Todos Santos, Collector Median and
     Streetscape zones (every Downtown parcel is in the Thoroughfare zone).

   The Citywide roll is not printed in its report; it is on file with the
   City Clerk.
2. **Downtown street and median frontage `F_i^S`, `F_i^C` and `F_i^T`.** No
   field has these. `Shape.STLength()` is the whole parcel perimeter, not the
   length along the street. Frontage could be estimated by finding the parcel
   edges that touch the street right-of-way, but that is not the report's
   measurement.
3. **Original building area for Pine Hollow.** `TLA` is a close stand-in, but
   additions may change it (see [`TLA`](#tla-living-area)).
4. **Business-use portion** for government, State Board and municipal
   properties (codes 79, 83 and 86) in the Citywide district.
5. **Private-street single-family homes** (0.75 EDU) in the Citywide
   district.

For any of these inputs, the adopted assessment roll or the itemized secured
tax bill, joined by `APN`, gives the actual charge and is authoritative.
