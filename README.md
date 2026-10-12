# Concord special-assessment collector

Read-only collection from the Contra Costa County tax payment portal. Requires
Python 3.10+; uses only the standard library. No credentials or payments are used.

## Static interactive parcel map

The Leaflet explorer lives entirely in [public](public/index.html). It provides
APN/address search, clickable boundaries, satellite/street basemaps, all parcel
attributes, and a selected-parcel GeoJSON download. No application backend or
third-party Python/Node packages are needed.

After downloading the parcel GeoJSON, build the static data and serve it locally:

```powershell
python build_parcel_site.py
python -m http.server 8000 --bind 127.0.0.1 --directory public
```

Open `http://127.0.0.1:8000`. Or use the VS Code **Serve parcel map** task.
Deploy the **entire contents of `public`**, including `data` and `vendor`,
to any static host. Relative URLs also support hosting under a subdirectory.
Do not open the page directly through `file://`; browser fetch requires HTTP.
Public hosting publishes the downloaded ownership and other parcel attributes.

### GitHub Pages

The published map is at <https://spinnernicholas.github.io/concord-lnl/>.
The [Pages workflow](.github/workflows/pages.yml) deploys the contents of `public`
when site files change on `main`, or when manually triggered in GitHub Actions.
Repository **Settings > Pages > Source** must be **GitHub Actions**.
Generated data is already committed; deployment does not rerun the downloader
or require access to the source GIS service.

The builder splits the large GeoJSON into spatial geometry chunks plus separate
attribute chunks, preserving original coordinates and every attribute. Boundaries
load only at zoom level 15 or closer; APN/address search works at every zoom.
The search index loads on first search. Each parcel is stored once; chunk bounds
include the entire geometry so large or multipart parcels are not lost.
Null-geometry records remain searchable with their attributes.

Leaflet 1.9.4 is vendored locally under its MIT license. Parcel data and scripts
are local; OpenStreetMap and Esri basemap tiles require internet access and retain
their provider attribution. Basemap providers receive tile requests, not parcel
attributes or search terms. The downloaded parcel data is a snapshot, not live GIS.
Rebuild after refreshing the source download. Publish builds together, rather
than replacing individual data files while users are browsing.

Validate the builder with `python -m unittest -v test_build_parcel_site`.

## Full parcel geometry and data download

The separate [parcel downloader](download_parcels.py) downloads the public parcel
layer behind the [City parcel viewer](https://concordca.maps.arcgis.com/apps/instant/lookup/index.html?appid=90c227258f1c4b5d80b7fb19d855c94b):

```powershell
python -m unittest -v test_download_parcels
python download_parcels.py
```

Default output is `data\parcels`. The default includes **every record in the
underlying layer**, including records outside the viewer's `s_city = 'CONCORD'`
filter. To reproduce that filter, use a separate output directory:

```powershell
python download_parcels.py --where "s_city = 'CONCORD'" --output data\parcels-map
```

Outputs:

- `parcels.geojson`: all attributes and polygon/multipolygon geometry in WGS84
  longitude/latitude (EPSG:4326), suitable for QGIS and other GIS tools.
- `parcels.esri.json`: all attributes and source-coordinate Esri geometry,
  including vertex IDs supplied by the server. Any curves are densified by
  ArcGIS; no precision reduction is requested.
- `parcel_attributes.csv`: all non-geometry fields. APNs remain strings in JSON;
  import APN columns as text in spreadsheet tools to retain leading zeroes.
  CSV empty cells cannot distinguish null from empty strings; JSON can.
- `layer_metadata.json`: field types, aliases, domains, and service metadata.
- `application.json`, `webmap.json`: the viewer and map configurations.
- `object_ids.json`: complete server object-ID census.
- `summary.json`: completion marker, counts, timestamps, null-geometry IDs,
  output sizes, and SHA-256 checksums.
- `batches\`: verified cached native and GeoJSON responses for resuming.

The downloader queries all object IDs first, requests every field in bounded
batches, checks returned IDs and field coverage, then rechecks the census before
publishing exports. Rerun the same command after interruption to reuse verified
batches. Each cached batch records its retrieval time; resumed downloads are not
a transactional snapshot, and rerunning does not refresh cached attributes.
For a fresh snapshot, use a new output directory. `summary.json` is removed when
a new download starts and published last; check its hashes before treating an
export set as complete. Records with null geometry are retained and explicitly
listed in the summary.

Requests are sequential, at most one start per second by default. Transient
network/HTTP failures have bounded retries; access-denied responses fail explicitly.
`--batch-size 500` can be used if the service truncates a larger batch.
Separate map overlays (zoning, hazards, census, housing) are not attributes of
the parcel layer and are not downloaded by this command. Public GIS data may lag
current records and is not a legal survey or a certified assessment roll.

## Sources and scope

- City-wide address search:
  `https://taxcolp.cccttc.us/api/lookup/address?street=&suffix=&city=CNCD`
- Parcel lookup:
  `https://taxcolp.cccttc.us/api/lookup/apn?apn=117-150-035`
- Historical/current accessible secured bill links supplied by that lookup.
- [City parcel GIS](https://gis.cityofconcord.org/gsrv1/rest/services/PublicGISBasemap/MapServer/9):
  `BOUNDARYID = 'Concord'`.

Discovery takes the union of Concord-addressed tax accounts and parcels inside
Concord city limits, so address-only and GIS-only parcels are not silently lost.
Exports retain both scope flags. GIS object-ID batches are checked for completeness.
GIS placeholders that are not valid APNs (for example `100370XXX`) are logged and
exported as discovery issues, not silently treated as parcels without assessments.
This is **not** a historical parcel census: retired APNs absent from both present-day
sources require historical rolls from the county.

## Run

From this directory on Windows:

```powershell
python -m unittest -v
python collect_assessments.py discover
python collect_assessments.py collect
```

To collect only the current secured-bill year:

```powershell
python collect_assessments.py collect --current-only --delay 1.5 --workers 8
```

This uses the portal's current bill and assessment year (currently 2026-27), not
the calendar year. Historical downloads are deferred and existing records retained.
Assessment and matching-parcel exports contain only current bills in this mode;
`current_year_coverage.csv` and `current_year_status_counts` in the summary track
current-only progress independently of historical completeness. Historical bill
coverage remains available. Rerunning this mode skips completed current-only parcels;
running without `--current-only` resumes the all-years collection and exports.
Typically only a lookup and one current bill request are needed per new parcel.

For a quick recovery ramp capped at one request/second:

```powershell
python collect_assessments.py collect --current-only --delay 1 --start-delay 6 --workers 8
```

`--start-delay` begins with a slower shared interval, then halves it after every
20 healthy responses: 6, 3, 1.5, then 1 second. Without errors this takes roughly
3.5 minutes of network starts. It never exceeds the `--delay` ceiling unless
`--max-rps` is also explicitly supplied. Plain 403 responses still impose the
one-minute cooldown and temporarily slow the rate; every 20 healthy responses
then halve that interval back toward the configured ceiling.

Validate individual parcels without launching a city-wide crawl:

```powershell
python collect_assessments.py collect --db data\sample.sqlite --output data\sample --apn 117-150-035 --apn 126-051-045 --apn 120-313-019
```

Bound a batch with `--limit 100`. Rerun `collect` to resume pending/interrupted
parcels and retryable failures. Parcels whose only gaps are known unavailable years
stay marked `partial` but are not reprocessed on every restart.
Successful responses and parsed bills are cached in SQLite. Ctrl+C stops safely;
completed bills persist. Collection writes an initial CSV checkpoint and then about
every five minutes, and exports again on normal completion or interruption. Expensive
exports automatically get a longer interval to keep checkpoint overhead below about
5%. Each checkpoint uses a consistent SQLite read snapshot; files are staged before
replacement, with `summary.json` published last. Wait for that summary to refresh
before treating a set of CSV files as the same checkpoint.
Export a checkpoint at any time when collection is stopped:

```powershell
python collect_assessments.py export
```

The default is **at most one network request per second across all workers**, not
one per worker. `--workers 4` (the default) is an upper bound: concurrency adapts
between one and four workers based on measured network latency. Workers have separate
SQLite connections; WAL mode allows checkpoint readers without blocking downloads.
Use `--workers 1` for sequential operation. No third-party packages are required.

An opt-in rate ramp is available for operators authorized to increase traffic:

```powershell
python collect_assessments.py collect --workers 8 --max-rps 100
```

This **starts at one request/second**, not 100. The shared rate increases by at most
10% after both 60 seconds and 100 healthy responses since the last increase.
`--max-rps` is an upper bound, not a target or a known safe rate; eight workers also
limit simultaneous requests, so actual throughput can remain much lower.
Doubling of smoothed response latency (with at least a 250ms increase) immediately
pauses acceleration. If it persists for at least 20 responses over 10 seconds,
the rate slows and further increases freeze for two minutes. A brief spike alone
does not discard a healthy rate. Errors also freeze increases.
The default without `--max-rps` retains the fixed one-request/second ceiling.
Do not use a high ceiling on a service without authorization. No client-side
controller can guarantee preventing overload or blocking; monitor server-side
capacity and Cloudflare analytics when available.

429 responses, transient server failures and timeouts reduce concurrency to one,
slow the shared request budget and impose a global cooldown. `Retry-After` applies
to every worker, including retries; every 20 healthy responses halve the increased
request interval until the original rate is restored, never exceeding it.
`--delay` sets the shared minimum interval in seconds.
Do not increase traffic without considering the county service's capacity.
Rate-limit responses wait at least 60 seconds. A plain HTTP 403 pauses **all workers
for at least 60 seconds** (longer if `Retry-After` requires it), then retries with
the shared rate lowered to half the denied rate or slower. This is temporary
backoff, not a permanent ceiling change: every 20 healthy responses halve the
interval toward `--delay`, provided latency is not elevated. Recovery steps are logged.
Plain 403 responses allow up to ten retries per URL after the initial attempt
(eleven attempts total), then stop the entire download. The old three-denial
window no longer applies. Repeated denials increase the request interval up to
eight seconds; an explicitly slower starting interval is preserved.
HTTP 401, detected Cloudflare
challenges, lookup verification requirements, or exhaustion of four non-403
transient request attempts stop the entire download with an explicit error and final
checkpoint. No automatic restart or challenge bypass is attempted. Already
in-flight requests may finish; no new network requests start after the stop signal.
Inspect and resolve the cause before manually resuming. The checkpoint's
`download_runtime` records `state: blocked` and the stop reason.
Use `--start-delay` to preserve a slower initial interval after a restart while
recovering toward the configured `--delay` ceiling.

The collector learns unavailable historical years only from explicit "Invalid
prior-year range" HTTP 400 responses for that exact endpoint/year on **at least two
different APNs**, without contradicting a successfully parsed bill for that year.
Existing download failures supply the same evidence on upgrade. It records an
`unavailable` bill-coverage row for each skipped parcel/year, preserving the source
URLs used as evidence, instead of making the same doomed request for every parcel.
Other 400 responses and APN-not-found responses do not establish year availability.
Permanent per-URL 400/404/410/422 responses are cached; transient failures are not.
A successfully cached bill is read even if its year has other rejection evidence.

With six readable bill years plus one lookup per parcel, roughly 39,000 parcels
still require about **76 hours of network starts** at one request per second, less
any cached/absent bills, plus parsing/checkpoint/retry overhead. The log reports
measured parcels/hour and an updated remaining-time estimate. No full crawl starts
automatically.

Caches are a dated snapshot, not continuously refreshed. Use a **new `--db` path**
for a fresh snapshot (including rechecking previously unavailable years and permanent
failures). Retryable HTTP/network failures are retried on the next collection run;
a successfully downloaded but malformed bill remains cached for investigation.
Do not interpret lookup failures, verification requirements, missing bills, or
partial collection as absence of assessments.

## Outputs

Under `data\exports` (or `--output`):

- `matching_parcels.csv`: unique parcels with at least one confirmed target charge,
  observed districts/years, and history completion status.
- `matching_assessments.csv`: confirmed assessment line items by parcel and fiscal
  year, annual dollar amount, code, label, phone and source bill URL.
- `matching_parcel_all_assessments.csv`: all collected special-assessment line items
  (including other districts) for parcels with at least one confirmed target charge.
- `matching_parcel_current_values.csv`: current lookup valuation year, land,
  improvements, personal property, gross value, exemptions and net taxable value
  for matching parcels, with retrieval time, source URL and explicit missing-field status.
  These are current assessed property values, not historical valuation snapshots.
- `uncertain_assessments.csv`: candidate landscape/lighting and other Concord labels
  requiring review; **not** confirmed membership in the four requested districts.
- `all_assessments.csv`: every collected special-assessment line item for audit and
  later reclassification.
- `coverage.csv`: all candidate parcels, source flags, status and errors.
- `bill_coverage.csv`: `complete`, `failed`, or `unavailable` for each discovered secured bill.
- `discovery_issues.csv`: GIS records with invalid/unqueryable parcel identifiers.
- `summary.json`: counts, observed years, discovery provenance, unavailable-year
  evidence, runtime request/worker statistics and limitations.

APNs are text identifiers with leading zeros; import the APN column as text in Excel.
Installments sharing the same bill URL are deduplicated. Separate corrected bill
URLs are retained; do not sum them without identifying superseded bills.
Amounts are annual bill line items, not installment totals or unpaid balances.
Supplemental/redemption bills are excluded from this annual secured-roll extraction.
All years means **all secured bill years actually linked by the portal**, not a
guessed range. A current valuation year does not imply a current tax bill exists.
In live validation on October 11, 2026, current 2026-27 bills and historical
2021-22 through 2025-26 HTML bills were readable. The lookup also listed 2014-15
through 2020-21 installments, but their HTML links returned "Invalid prior-year
range" and supplied no PDF links. A test PDF request for 2020-21 returned zero bytes.
Those years remain explicitly unavailable in coverage exports; installment-level totals
cannot establish individual district assessments.

## Requested districts and matching

| Requested district | Observed bill label / code | Classification |
| --- | --- | --- |
| Downtown Landscape Maintenance District | `CONCORD DNTWN LMD` / `MH` | Confirmed from an actual downtown bill |
| Citywide Street Lighting Assessment District | `CONCORD STREET LTS` / `JC` | Confirmed from actual Concord bills |
| Pine Hollow Estates Landscape and Lighting Maintenance District | `PINE HOLLOW LMD` / `MU` | Confirmed against engineer-report APNs and bills |
| Landscaping and Lighting Maintenance District No. 3 | `KIRKWOOD LMD` / `JV` | Confirmed for both Kirkwood and Ygnacio Woods benefit zones |

The code and label must **both** match for a confirmed result. Do not infer Pine
Hollow assessment membership simply because a parcel is on Pine Hollow Road.
Candidate matching deliberately includes unrelated landscape/lighting districts
to avoid suppressing unverified abbreviations. Confirm their identity against the
district's roll or an authoritative code directory before extending `CONFIRMED`.

### Evidence for the two formerly unresolved districts

The [April 27, 2021 City Council agenda, item 3.c](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Meetings/ViewMeeting?id=633&doctype=1)
includes these official preliminary engineer reports:

- [Attachment 2: Pine Hollow Estates, FY 2021-22](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/PineHollow.pdf?documentType=1&meetingId=633&itemId=11714&publishId=9145&isSection=False&isAttachment=True).
- [Attachment 3: Landscaping and Lighting Maintenance District No. 3, FY 2021-22](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/District3.pdf?documentType=1&meetingId=633&itemId=11714&publishId=9146&isSection=False&isAttachment=True).
- [Staff report](https://stream.ci.concord.ca.us/OnBaseAgendaOnline/Documents/DownloadFileBytes/StaffReport.pdf?documentType=1&meetingId=633&itemId=11714&publishId=9143&isSection=False&isAttachment=True).

The APNs below are listed in those reports' assessment rolls. Each 2021-22 tax bill
has the same amount as the corresponding engineer-report entry. Current 2026-27
bills were also checked on October 11, 2026:

| District / benefit zone | APN | Code / label | 2021-22 amount | 2026-27 amount |
| --- | --- | --- | --- | --- |
| Pine Hollow Estates | `121-231-001` | `MU` / `PINE HOLLOW LMD` | $83.46 | $83.46 |
| Pine Hollow Estates | `121-241-004` | `MU` / `PINE HOLLOW LMD` | $180.36 | $180.36 |
| District No. 3 / Kirkwood | `118-130-001` | `JV` / `KIRKWOOD LMD` | $40.64 | $40.64 |
| District No. 3 / Kirkwood | `118-140-013` | `JV` / `KIRKWOOD LMD` | $40.64 | $40.64 |
| District No. 3 / Ygnacio Woods | `134-541-001` | `JV` / `KIRKWOOD LMD` | $311.10 | $355.00 |
| District No. 3 / Ygnacio Woods | `134-542-001` | `JV` / `KIRKWOOD LMD` | $311.10 | $355.00 |

For example: [Pine Hollow 2021-22 bill](https://taxcolp.cccttc.us/PTS_TaxbillsHtmlPYHist?taxyear=2122&apn=121231001),
[Kirkwood 2021-22 bill](https://taxcolp.cccttc.us/PTS_TaxbillsHtmlPYHist?taxyear=2122&apn=118130001),
and [Ygnacio Woods 2021-22 bill](https://taxcolp.cccttc.us/PTS_TaxbillsHtmlPYHist?taxyear=2122&apn=134541001).

**Do not interpret `KIRKWOOD LMD` as only the Kirkwood benefit zone.** It also
appears on Ygnacio Woods bills, and both belong to District No. 3. The staff report
states that Balhan Terrace and Valley Terrace, the district's two other benefit
zones, required zero assessments in 2021-22 because tax augmentation funds covered
their lighting costs. Membership in a district does not imply a bill charge every
year. No separate Balhan/Valley tax code is inferred from zero-assessment rolls.

All four requested district identities are now resolved. Until all candidate parcels
are processed, `matching_parcels.csv` is a **partial answer**, not the full requested list.
Even successful processing covers only currently discoverable APNs and portal-linked
years. For a complete historic roll, request retired parcel records and assessment
levy files from the city/county.
