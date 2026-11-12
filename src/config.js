// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Units of the new features: 'us' (feet, cubic feet per second, as the NWS
// publishes them) or 'metric' (metres, cubic metres per second).
export const UNIT_SYSTEMS = ['us', 'metric'];

// Miles around the house where the nearest gauges are followed; '0' = off.
export const HOME_RADII = ['0', '5', '10', '25'];

// Minutes between two readings. Gauges report every 5 to 60 minutes and the
// forecasts are issued a few times a day: faster would only ask the same thing.
export const REFRESH_INTERVALS = ['15', '20', '30'];

// Gauges followed "around my house": the nearest ones in service.
export const HOME_GAUGES = 3;

// Upper bound of the gauges taken from the configuration (codes and house
// together): one request per gauge and per refresh stays light for the NWPS,
// and the states far below the 300 per minute of the core.
export const MAX_GAUGES = 20;

export const DEFAULT_CONFIG = {
  gauges: '',
  // A `source: "houses"` select takes no default (store rule): empty = the
  // first house of Gladys that has a location.
  house: '',
  around_home: '0',
  units: 'us',
  refresh_interval: '15',
  language: 'fr',
};

// NWS location identifier (LID) of a gauge: four letters and a digit (BRKM2).
// Every one of the 12,971 gauges of the NWPS had this form on 12/11/2026.
const GAUGE_CODE = /^[A-Z]{4}[0-9]$/;
// Its page on water.noaa.gov ends with it: https://water.noaa.gov/gauges/brkm2.
const GAUGE_URL = /\/gauges\/([A-Za-z]{4}[0-9])(?:[/?#]|$)/;

const tokens = (text) =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

/** A gauge code from a code or a water.noaa.gov URL, upper-cased; null otherwise. */
export function gaugeCodeOf(token) {
  const fromUrl = GAUGE_URL.exec(String(token));
  const code = (fromUrl ? fromUrl[1] : String(token)).toUpperCase();
  return GAUGE_CODE.test(code) ? code : null;
}

/** Gauge codes of a free text; `invalid` lists the tokens that are not one. */
export function parseGaugeCodes(text) {
  const codes = [];
  const invalid = [];
  for (const token of tokens(text)) {
    const code = gaugeCodeOf(token);
    if (code === null) {
      invalid.push(token);
    } else if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return { codes, invalid };
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const gauges = parseGaugeCodes(source.gauges);
  return {
    gaugeCodes: gauges.codes,
    invalid: gauges.invalid,
    // The selector of the chosen house (source: "houses"), null = the first located one.
    houseSelector:
      typeof source.house === 'string' && source.house.trim() !== '' ? source.house.trim() : null,
    homeRadiusMiles: pick(source.around_home, HOME_RADII, DEFAULT_CONFIG.around_home),
    units: UNIT_SYSTEMS.includes(source.units) ? source.units : DEFAULT_CONFIG.units,
    refreshMinutes: pick(
      source.refresh_interval,
      REFRESH_INTERVALS,
      DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
