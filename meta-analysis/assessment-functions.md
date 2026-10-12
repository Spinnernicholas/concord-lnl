# Concord FY 2026-27 assessment functions

This note translates the four final City of Concord Engineer's Reports for
FY 2026-27 into explicit assessment functions. The functions describe the
reported parcel-allocation methods; use the final assessment roll for the
actual tax-roll amount, because published rates and tax-roll rounding can make
a calculation from displayed rates differ slightly from the adopted parcel
levy.

The City Council adopted the four reports on May 26, 2026, in Resolutions
26-31 through 26-34. Report references and links are in the corresponding
FY 2026-27 rows of [sources.csv](sources.csv).

## Shared notation

- `i` identifies a parcel.
- `A_i` is the annual assessment for parcel `i`, in dollars.
- `I_zone(i)` is 1 when parcel `i` is in the named benefit zone and 0
  otherwise.
- `round_roll(x)` means the applicable County tax-roll rounding/allocation
  treatment. The reports provide parcel rolls for the final charges but do
  not specify one universal rounding function for all four districts.
- Rates below are the reports' FY 2026-27 constants unless stated otherwise.
- None of the four functions takes parcel-to-improvement distance as an input.
- [parcel-data-inputs.md](parcel-data-inputs.md) lists which inputs are in
  the map app's parcel records and how complete they are.

## 1. Pine Hollow Estates Landscape and Lighting Maintenance District

### Inputs and constants

| Symbol | Meaning | FY 2026-27 value |
|---|---|---:|
| `s_i` | Originally built dwelling floor area for assessable parcel `i`, in sq. ft. | Parcel-specific |
| `S` | Total original dwelling floor area of assessable parcels | 731,026 sq. ft. |
| `T` | Total district assessment | $61,755.46 |
| `r_displayed` | Published rate per original dwelling sq. ft. | $0.08448 |

There is one benefit zone. The report identifies 401 assessable single-family
parcels out of 425 parcels; 24 open-space or utility-right-of-way parcels are
not assessed.

### Function

The report says costs are apportioned in proportion to original dwelling
square footage. Expressed as a proportional allocation:

```text
pine_hollow_raw(i; s_i, S, T) = T * s_i / S
pine_hollow_assessment(i; s_i, S, T) = round_roll(pine_hollow_raw(i))
```

With the reported constants:

```text
pine_hollow_raw(i) = 61,755.46 * s_i / 731,026
                   ≈ 0.0844778 * s_i dollars
```

The report displays the rate rounded to `$0.08448` per square foot. Use the
assessment roll, not multiplication by the rounded display rate, to recover an
exact parcel levy.

**Evidence:** Final Engineer's Report, Part D, printed p. 10 (PDF p. 14),
Table 2; total assessment, Part E, printed p. 11 (PDF p. 15); adopted as
Resolution 26-32.

## 2. Landscaping and Lighting Maintenance District No. 3

The district has four separate service zones. Assessment rates apply only to
parcels/units in the applicable zone.

### Inputs and constants

| Symbol | Meaning | FY 2026-27 value |
|---|---|---:|
| `n_K` | Kirkwood assessable single-family parcels | 468 |
| `n_Y` | Ygnacio Woods Unit II assessable single-family parcels | 35 |
| `u_Bi` | Residential units on Balhan Terrace parcel `i` | Parcel-specific; 13 units total across 6 parcels |
| `r_K` | Kirkwood rate | $40.64 per parcel |
| `r_Y` | Ygnacio Woods Unit II rate | $355.00 per parcel/EDU |
| `r_V` | Valley Terrace current rate | $0.00 per parcel |
| `r_B` | Balhan Terrace current rate | $0.00 per residential unit |

Kirkwood and Ygnacio Woods Unit II each have one EDU per single-family parcel.
The report says Balhan Terrace, when assessed, is apportioned by residential
unit count. Valley Terrace is apportioned equally by parcel. The FY 2026-27
rate table sets both street-lighting zone rates to zero; the City says State
tax augmentation funds those costs.

### Functions

```text
kirkwood_assessment(i; I_K) = I_K(i) * 40.64
ygnacio_assessment(i; I_Y, EDU_i) = I_Y(i) * 355.00 * EDU_i
valley_terrace_assessment(i; I_V) = I_V(i) * 0.00
balhan_terrace_assessment(i; I_B, u_Bi) = I_B(i) * 0.00 * u_Bi

district_3_assessment(i) =
    kirkwood_assessment(i)
  + ygnacio_assessment(i)
  + valley_terrace_assessment(i)
  + balhan_terrace_assessment(i)
```

For the current report, `EDU_i = 1` for each Ygnacio Woods single-family
parcel. For a future nonzero Balhan levy, the report's stated allocation rule
would distribute the zone's assessment total `T_B` by units:

```text
balhan_future_assessment(i; u_Bi, T_B, U_B) = T_B * u_Bi / U_B
```

where `U_B = 13` residential units. This last expression explains the
unit-based apportionment; it is not a current charge.

Ygnacio Woods' $355 rate reflects the previously voter-approved CPI escalator.
The report states the annual adjustment is capped at 3%, and that the FY
2026-27 rate includes a 1.75% increase over FY 2025-26.

**Evidence:** Final Engineer's Report, Part D, printed pp. 15-16 (PDF pp.
19-20), Tables 5-6; zone cost estimates, printed pp. 6-9 (PDF pp. 10-13);
adopted as Resolution 26-33.

## 3. Downtown Landscape Maintenance District

Each parcel's assessment is the sum of the charges for every Downtown benefit
zone that applies to it. Define:

- `P_i`: assessable parcel area, in square feet.
- `U_i`: residential unit count on the parcel.
- `F_i^S`: parcel frontage, in linear feet, in the Streetscape zone.
- `F_i^C`: frontage, in linear feet, for parcels that generally front a
  landscaped Collector Street median; zero for parcels not included in that
  frontage share.
- `F_i^T`: frontage, in linear feet, for parcels that generally front a
  landscaped Thoroughfare median; zero for parcels not included in that
  frontage share.
- `R_i`: 1 for a residential parcel and 0 for a nonresidential parcel in the
  Todos Santos Plaza zone.
- `I_P`, `I_S`, `I_C`, `I_T`: membership indicators for the Todos Santos Plaza,
  Streetscape, Collector Street Median, and Thoroughfare Median zones.

### FY 2026-27 rate constants

| Component | Rate |
|---|---:|
| Todos Santos Plaza, nonresidential parcel area | $0.066582 per sq. ft. |
| Todos Santos Plaza, residential units | $20.227564 per unit |
| Streetscape frontage | $2.019385 per linear ft. |
| Collector Street Median frontage | $0.573620 per qualifying linear ft. |
| Collector Street Median parcel area | $0.003344 per sq. ft. |
| Thoroughfare Median frontage | $1.418458 per qualifying linear ft. |
| Thoroughfare Median parcel area | $0.003371 per sq. ft. |

### Functions

```text
downtown_plaza(i) =
    I_P(i) * (
        (1 - R_i) * 0.066582 * P_i
      + R_i       * 20.227564 * U_i
    )

downtown_streetscape(i) =
    I_S(i) * 2.019385 * F_i^S

downtown_collector_median(i) =
    I_C(i) * (0.573620 * F_i^C + 0.003344 * P_i)

downtown_thoroughfare_median(i) =
    I_T(i) * (1.418458 * F_i^T + 0.003371 * P_i)

downtown_assessment(i) =
    round_roll(
        downtown_plaza(i)
      + downtown_streetscape(i)
      + downtown_collector_median(i)
      + downtown_thoroughfare_median(i)
    )
```

For each median zone, the frontage rate applies to the one-third share assigned
to parcels that generally front the median street; the area rate applies to
the two-thirds share spread over the applicable zone. Do not apply the
frontage term to parcels that are not in the qualifying frontage group.

The report permits an annual CPI increase not exceeding 5%. It gives the
February index values as 350.836 for the prior year and 356.964 for the
current year, reporting a 1.75% increase. For a positive CPI change, the
reported cap can be represented as:

```text
delta_cpi = CPI_current / CPI_prior - 1
increase = min(delta_cpi, 0.05)
rate_current = rate_prior * (1 + increase)
```

For this report, use the published FY 2026-27 rates above; they already
incorporate the reported 1.75% adjustment. The report does not specify here
how a negative CPI change would affect rates.

The report's four cost-zone assessment-revenue requirements are approximately
$258,241 (Plaza), $87,487 (Streetscape), $34,023 (Collector medians), and
$139,403 (Thoroughfare medians). Total proposed parcel assessments are
$519,152.18. These are assessment amounts after other revenue/fund offsets,
not the district's full operating costs. The published unit rates are rounded
to six decimal places, so multiplying displayed rates by the reported
districtwide measurement totals may not reproduce each cost-zone amount
exactly; the parcel assessment roll is authoritative for actual levies.

**Evidence:** Final Engineer's Report, Part D, printed pp. 14-17 (PDF pp.
18-21), zone allocation and rate calculations; Part E, printed p. 18 (PDF
p. 22), total assessment; adopted as Resolution 26-31.

## 4. Citywide Street Lighting Assessment District

The function assigns an EDU value using the parcel's land-use classification,
then multiplies by the fixed per-EDU rate.

### Inputs and constants

| Symbol | Meaning | FY 2026-27 value |
|---|---|---:|
| `L_i` | Parcel's County land-use classification | Parcel-specific |
| `e(L_i)` | EDU lookup for that classification | Appendix A schedule below |
| `r_EDU` | Assessment rate per EDU | $25.00 |
| `T` | Total proposed district assessment | $1,046,853.92 |

```text
citywide_lighting_assessment(i; L_i) =
    round_roll(25.00 * e(L_i))
```

The schedule defines an EDU as the sum of the report's illumination-intensity,
pedestrian-activity, and security factors. The report identifies the
single-family residential parcel as the 1.00-EDU baseline. Codes are Contra
Costa County Land Use Codes.

### Complete FY 2026-27 EDU lookup

| Property classification | County code(s) | Intensity | Pedestrian | Security | EDU |
|---|---|---:|---:|---:|---:|
| Single-family home | 11, 12, 13, 14, 19, 61 | 0.250 | 0.500 | 0.250 | 1.000 |
| Single-family home on private street | N/A | 0.250 | 0.500 | 0.000 | 0.750 |
| Condominium | 16, 29 | 0.250 | 0.125 | 0.125 | 0.500 |
| Multiple family: 2 units | 21 | 0.250 | 1.000 | 0.500 | 1.750 |
| Multiple family: 3 units | 22, 24 | 0.250 | 2.250 | 0.500 | 3.000 |
| Multiple family: 4 units | 23 | 0.500 | 2.250 | 0.500 | 3.250 |
| Multiple family: 5-12 units | 25 | 0.500 | 3.500 | 1.000 | 5.000 |
| Multiple family: 13-24 units | 26 | 0.750 | 4.000 | 1.250 | 6.000 |
| Multiple family: 25-59 units | 27 | 0.750 | 4.500 | 1.750 | 7.000 |
| Multiple family: 60+ units | 28 | 1.000 | 5.000 | 2.000 | 8.000 |
| Commercial stores | 31 | 1.000 | 2.000 | 1.000 | 4.000 |
| Small grocery stores | 32 | 1.000 | 2.000 | 1.000 | 4.000 |
| Office buildings | 33 | 1.000 | 1.000 | 1.000 | 3.000 |
| Medical-dental offices | 34 | 1.000 | 1.000 | 1.000 | 3.000 |
| Service stations | 35 | 1.000 | 2.000 | 1.000 | 4.000 |
| Garages | 36 | 1.000 | 0.500 | 1.000 | 2.500 |
| Recreational clubs | 37 | 1.000 | 4.000 | 1.000 | 6.000 |
| Golf courses | 38 | 1.000 | 1.000 | 1.000 | 3.000 |
| Bowling alleys | 39 | 1.000 | 4.000 | 1.000 | 6.000 |
| Boat harbors | 40 | 1.000 | 3.000 | 1.000 | 5.000 |
| Supermarkets | 41 | 1.000 | 6.000 | 1.000 | 8.000 |
| Shopping centers | 42 | 5.000 | 10.000 | 5.000 | 20.000 |
| Financial office buildings | 43 | 1.000 | 1.000 | 1.000 | 3.000 |
| Hotels, motels, mobile homes | 44 | 2.000 | 5.000 | 2.000 | 9.000 |
| Theaters | 45 | 2.000 | 2.000 | 2.000 | 6.000 |
| Drive-in restaurants | 46 | 1.000 | 3.000 | 1.000 | 5.000 |
| Restaurants | 47 | 1.000 | 3.000 | 1.000 | 5.000 |
| Mixed multiple/commercial | 48 | 1.000 | 3.000 | 1.000 | 5.000 |
| Auto agency | 49 | 1.000 | 3.000 | 1.000 | 5.000 |
| Industrial parks | 51, 52 | 1.000 | 3.000 | 1.000 | 5.000 |
| Industrial | 53, 54, 56 | 5.000 | 10.000 | 5.000 | 20.000 |
| Warehouses | 55 | 1.000 | 3.000 | 1.000 | 5.000 |
| Unassigned (pipeline right-of-way) | 59 | 0.000 | 0.000 | 0.000 | 0.000 |
| Convalescent hospitals | 70 | 1.000 | 1.000 | 1.000 | 3.000 |
| Churches | 71 | 0.500 | 1.000 | 0.500 | 2.000 |
| Schools | 72 | 0.500 | 1.000 | 0.500 | 2.000 |
| Hospitals | 73 | 1.000 | 1.000 | 1.000 | 3.000 |
| Cemeteries, mortuaries | 74 | 0.250 | 0.500 | 0.250 | 1.000 |
| Fraternal and service organizations | 75 | 1.000 | 2.000 | 1.000 | 4.000 |
| Retirement housing complex | 76 | 1.000 | 1.000 | 1.000 | 3.000 |
| Cultural uses | 77 | 1.000 | 1.000 | 1.000 | 3.000 |
| Parks and playgrounds | 78 | 0.000 | 0.000 | 0.000 | 0.000 |
| Government-owned buildings (assess developed business-use portion) | 79 | 1.000 | 1.000 | 1.000 | 3.000 |
| Vacant land | 10, 15, 17, 18, 20, 30, 50, 60, 62-69 | 0.250 | 0.000 | 0.250 | 0.500 |
| Mineral rights | 80 | 0.000 | 0.000 | 0.000 | 0.000 |
| Private roads | 81 | 0.125 | 0.250 | 0.125 | 0.500 |
| Pipelines and canals | 82 | 0.000 | 0.000 | 0.000 | 0.000 |
| State Board assessed parcels (developed business-use portion) | 83 | 1.000 | 1.000 | 1.000 | 3.000 |
| Utilities | 84 | 0.000 | 0.000 | 0.000 | 0.000 |
| Parking facilities | 85 | 0.500 | 1.000 | 1.000 | 2.500 |
| Municipal properties (developed business-use portion) | 86 | 1.000 | 1.000 | 1.000 | 3.000 |
| Common areas | 87 | 0.000 | 0.000 | 0.000 | 0.000 |
| Mobile homes (underlying parcel only) | 88 | 0.000 | 0.000 | 0.000 | 0.000 |
| Split parcels in different tax-code areas | 89 | 0.250 | 0.500 | 0.250 | 1.000 |
| Exempt assignment | 99 | 0.000 | 0.000 | 0.000 | 0.000 |

The report says only the portion of government-owned or State Board assessed
property developed for business purposes similar to commercial, industrial, or
institutional activities is assessed. Individual mobile homes are not assessed;
the underlying parcel is assessed.

**Evidence:** Final Engineer's Report, Part D, printed pp. 11-12 (PDF pp.
15-16), methodology and typical rates; Appendix A, printed p. 13 (PDF p. 17),
full EDU classification schedule; Part E, printed p. 12 (PDF p. 16), total
assessment. Adopted as Resolution 26-34.

## Source notes

- [May 26, 2026 City Council minutes](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Meetings/ViewMeeting?id=1425&doctype=2)
- [Final Downtown Engineer's Report](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/Supporting%20Document%20for%20-%20%20-%20Attachment%205%20-%20Final%20Report%20Downtown%20(25711).pdf?documentType=1&meetingId=1425&itemId=25711&publishId=37527&isSection=False&isAttachment=True)
- [Final Pine Hollow Engineer's Report](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/Supporting%20Document%20for%20-%206%20-%20Attachment%206%20-%20Final%20Report%20Pine%20Hollow%20(257.pdf?documentType=1&meetingId=1425&itemId=25711&publishId=37528&isSection=False&isAttachment=True)
- [Final District No. 3 Engineer's Report](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/Supporting%20Document%20for%20-%207%20-%20Attachment%207%20-%20Final%20Report%20Dist.%20No.%203%20(2.pdf?documentType=1&meetingId=1425&itemId=25711&publishId=37529&isSection=False&isAttachment=True)
- [Final Citywide Street Lighting Engineer's Report](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/Supporting%20Document%20for%20-%208%20-%20Attachment%208%20-%20Final%20Report%20Citywide%20Lighting%20(25711).pdf?documentType=1&meetingId=1425&itemId=25711&publishId=37530&isSection=False&isAttachment=True)
