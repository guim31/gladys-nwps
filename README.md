# NWPS River Floods for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration that brings the **river
levels of the United States**, their **flood category** and the **official crest forecast** of the
NOAA National Weather Service into Gladys, from the public API of the
[National Water Prediction Service](https://water.noaa.gov) (NWPS). No account, no key.

> A complement, not a safety alert system: in a flood, follow the official warnings. Not affiliated
> with NOAA or the National Weather Service. Developed and tested against the live NWPS API, not yet
> on a real Gladys installation: feedback welcome.

## What it does

- One device per gauge: water level (feet or metres), flow (cfs or m³/s) when reported, the NWS
  flood category (no flooding, action stage, minor, moderate, major) as a risk level and in words,
  time of the last reading.
- At forecast points: the crest of the current official forecast, its time, level and category.
- Gauges by NWS code (`BRKM2`) or water.noaa.gov address, or the 3 nearest ones around your house;
  a "Find gauges" button lists the gauges around it.
- A scene trigger "River flood category rises" (observed or forecast) and a "River gauges"
  dashboard widget.
- Texts and documentation in English, French, German and Spanish.

The USGS river integrations give readings only: the added value here is the flood categories and
the forecasts of the NWS.

## Requirements

- Gladys Assistant 5.3.2 or later.
- Internet access to `api.water.noaa.gov`.
- For the gauges around the house: the location of the house in Gladys.

## Installation

In Gladys: **Integrations → Install from GitHub**, address `https://github.com/guim31/gladys-nwps`.
Then fill in the configuration, save, and create the devices in the **Discover** tab.

User documentation: [English](docs/en.md), [Français](docs/fr.md), [Deutsch](docs/de.md),
[Español](docs/es.md).

## Limits

- The NWPS gives the crest of the forecast, not the whole forecast curve nor its uncertainty.
- Flood categories only where the NWS defined flood stages; many forecast points are forecast only
  during high water.
- Flows in cfs have no unit in Gladys (the feature name says "cfs").
- No published quota: one request per followed gauge (20 at most) per refresh (15 minutes by
  default), one after the other.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and recorded NWPS answers (`test/fixtures/nwps`,
12/11/2026); they never touch the network. See `CLAUDE.md` for the architecture and the pitfalls.

## Credits

- Data: NOAA National Weather Service, National Water Prediction Service (U.S. government work,
  public domain). Readings of many gauges come from the U.S. Geological Survey.
- Started from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js) and
  modelled on [gladys-vigicrues](https://github.com/guim31/gladys-vigicrues).

## License

Apache-2.0, see [LICENSE](LICENSE). Not affiliated with NOAA, the NWS or the USGS.
