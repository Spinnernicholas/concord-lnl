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

The consolidated source inventory is in [sources.csv](sources.csv). Entries are
unscreened leads; their inclusion does not mean they use distance decay or
quantify proximity in assessment apportionment.

The inventory currently contains 85 records, including direct reports, agency
source indexes, and supporting proceedings. Contra Costa County records have
jurisdiction and district fields populated to support filtering; those fields
may be blank for other entries. Screen each record to identify the primary
report and distinguish an explicit distance-based allocation method from a
district boundary or other benefit factor.

## Contra Costa County focus

Filter `sources.csv` by the `jurisdiction` column to focus on Contra Costa
County. Current county leads include Concord, the County's LL-2 district,
Antioch, Richmond, East Contra Costa County's EBRPD landscape and lighting
district, and San Ramon. Entries are research leads, not findings that any
district uses distance decay. Where an agency page or hearing notice points
to a report rather than providing it directly, locate and screen the primary
report before extracting methodology.

## Independence

This folder has its own research scope and may develop its own data, scripts,
and documentation. Keep its materials self-contained rather than coupling them
to the parcel-map application or assessment collector. Shared files should only
be added to the main project when they are intentionally relevant to those tools.
