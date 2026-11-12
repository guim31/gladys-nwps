# Fixtures

Real answers of the NWPS API (`https://api.water.noaa.gov/nwps/v1`), recorded on 12/11/2026
around 13:25 UTC. Public data of the U.S. government, nothing to anonymize.

- `nwps/gauge-<LID>.json`: `GET /gauges/<LID>`, trimmed (historic crests, impacts and datums cut
  to keep the repository light; the fields the integration reads are untouched):
  - `BRKM2` Potomac River at Little Falls: stage and flow, forecast point, flood stages;
  - `AAIT2` Williamson Creek, Austin: no forecast, flood stages without action stage;
  - `AAMC1` Alameda tide gage: no forecast, no flood stages, no flow;
  - `ALFW1` Pend Oreille below Albeni Falls Dam: forecast by flow (kcfs), stage as secondary;
  - `APAM2` Severn River at Annapolis: action stage observed, minor flooding forecast;
  - `ARCF1` Peace River at Arcadia: minor flooding observed and forecast.
- `nwps/gauge-unknown.404.json`: the 404 body of `GET /gauges/ZZZZ9`.
- `nwps/gauges-bbox-washington.json`: `GET /gauges?bbox.xmin=-77.3&bbox.ymin=38.8&bbox.xmax=-77&bbox.ymax=39.1&srid=EPSG_4326`.
- `gladys-feature-table.json`: category/type couples and units the Gladys front knows (with the
  m³/s unit of 5.3.2).
