# Proposition 218 benefit-distance meta-analysis

This directory is a separate subproject within the `concord-lnl` repository. It
is for researching how California Proposition 218 assessments have used distance,
proximity, or benefit zones to estimate parcel-specific special benefit.

The meta-analysis is separate from the Concord parcel map and assessment
collection tools documented in the repository's main README. Its research notes,
source documents, extraction data, and analysis should be kept here; it does not
change or drive those tools.

## Research scope

Gather primary sources such as assessment engineer's reports, assessment rolls,
district maps, agency proceedings, and relevant legal or state guidance. For
each source, record whether proximity is explicitly part of the method, how it
is measured, and how (if at all) the measure affects parcel benefit or the
assessment calculation.

Treat search results and source lists as leads, not verified evidence. Confirm
each source against the original document and record its agency, district,
document date, URL, and relevant pages or sections before using it in the
analysis.

The consolidated source inventory is in [sources.csv](sources.csv). It records
source metadata and, for screened Contra Costa materials, the methodology
finding, decay function, allocation rule, and evidence location. A source's
presence in the inventory does not imply that it uses distance decay.

The inventory currently contains 91 records, including direct reports, agency
source indexes, and supporting proceedings. Contra Costa records have
jurisdiction and district fields populated to support filtering; those fields
may be blank for other entries.

## Contra Costa County focus

Filter `sources.csv` by the `jurisdiction` column to focus on Contra Costa
County. Current county leads include Concord, the County's LL-2 district,
Antioch, Richmond, East Contra Costa County's EBRPD landscape and lighting
district, and San Ramon. Entries are research leads, not findings that any
district uses distance decay. Where an agency page or hearing notice points
to a report rather than providing it directly, locate and screen the primary
report before extracting methodology.

The four current Concord district assessments have been transcribed into
explicit functions, with input definitions and FY 2026-27 constants, in
[assessment-functions.md](assessment-functions.md). This includes the full
Citywide Street Lighting EDU classification lookup. Which of those inputs
appear in the map app's parcel records, and how complete they are, is
documented in [parcel-data-inputs.md](parcel-data-inputs.md). Parcel lists
from the FY 2026-27 assessment rolls for Pine Hollow, District No. 3 and
Downtown are in [rolls/](rolls/README.md).

### Initial report screen

Nine readable Contra Costa engineer's reports have been screened: the four
Concord districts' FY 2026-27 reports, Concord's Pine Hollow and District No. 3
reports for FY 2021-22, the County's LL-2 report, Antioch's consolidated SLLMD
report, and Richmond's Hilltop LMAD report. None states a continuous
distance-decay function such as a linear or exponential curve.
Several invoke proximity or divide areas into benefit zones, but generally
apportion costs with dwelling/building units, acreage, floor area, parcel
counts, or zone-specific rates.

The four current Concord reports are the final FY 2026-27 Engineer's Reports
adopted by the City Council on May 26, 2026. Their allocation methods differ:

- **Pine Hollow:** $0.08448 per square foot of each assessable dwelling's
  original building area.
- **District No. 3:** zone-specific per-parcel rates—$40.64 in Kirkwood,
  $355.00 in Ygnacio Woods Unit II, and no current levy in Valley Terrace or
  Balhan Terrace. Ygnacio Woods has a CPI adjustment capped at 3% per year.
- **Downtown:** four benefit zones use parcel area, residential-unit counts,
  parcel frontage, or a one-third-frontage/two-thirds-area split, depending on
  the zone. Rates increased 1.75% under the voter-approved CPI escalator, capped
  at 5%.
- **Citywide Street Lighting:** $25 per Equivalent Dwelling Unit (EDU), with
  EDU factors varying by property classification. The report describes
  illumination, pedestrian activity, and security as inputs to those factors;
  it does not calculate a parcel-level distance weight.

Downtown frontage and the citywide EDU benefit factors reflect spatial or
service characteristics, but neither is a continuous distance-decay function.
See the FY 2026-27 records in [sources.csv](sources.csv) for report tables,
adoption references, and the exact rates.

The Hilltop report is the notable spatial exception: in Zone 1 it uses
map-defined membership in an "inner circle" to allocate part of the Hilltop
Mall parking-lot area among parcels by parcel area. Remaining Zone 1 parcels
use acreage-based area units. This is a categorical spatial weighting, not a
continuous distance-decay formula; the report's calculation text does not
state a radius.

The San Ramon FY 2026-27 report is image-only and still needs OCR/manual
screening. The East Contra Costa EBRPD notice references an Engineer's Report
that is not attached to the notice, so that methodology also remains
undetermined. Do not treat either as a negative finding.

## Independence

This folder has its own research scope and may develop its own data, scripts,
and documentation. Keep its materials self-contained rather than coupling them
to the parcel-map application or assessment collector. Shared files should only
be added to the main project when they are intentionally relevant to those tools.
