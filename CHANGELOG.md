# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- One device per US river gauge of the NOAA National Water Prediction Service
  (NWPS): water level, flow, flood category of the NWS (as a risk level and in
  words) and time of the last reading, in feet and cfs or metres and m³/s.
- At the gauges the NWS forecasts: the forecast crest, its time, its flood
  level and its category.
- Gauges by NWS code or water.noaa.gov address, or the 3 nearest ones around
  the house, and a "Find gauges" button listing the gauges around it.
- Scene trigger "River flood category rises", observed or forecast, with the
  gauge name, category, level and time as variables.
- Dashboard widget "River gauges": every gauge on one line, or one gauge with
  its forecast crest and flood stage.
- Texts and documentation in English, French, German and Spanish.
