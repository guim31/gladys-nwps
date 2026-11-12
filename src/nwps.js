// -----------------------------------------------------------------------------
// Client of the National Water Prediction Service API of the NOAA National
// Weather Service (https://api.water.noaa.gov/nwps/v1/docs/), public and keyless.
//
// One request per gauge and per refresh: `GET /gauges/{lid}` holds everything
// the integration publishes. Its `status.observed` is the last reading, with
// the flood category the NWS computed for it; its `status.forecast` is the
// highest value of the remaining official forecast, with its time and
// category (checked on 12/11/2026 against `/gauges/{lid}/stageflow/forecast`
// on four gauges: same value, same time), or `fcst_not_current` when there is
// no current forecast. `GET /gauges?bbox…` lists the gauges of a box, with the
// same `status` but without the flood stages: it serves "around my house" and
// the search.
//
// Everything is normalized here to feet and cubic feet per second, whatever
// the NWPS sends: most gauges forecast a stage in ft with a flow in kcfs as
// secondary value, about a hundred (dams of the Northwest) forecast a flow in
// kcfs with a stage as secondary value. Missing values are -999 (-9999 for the
// flood stages) in the API, null here.
// -----------------------------------------------------------------------------

import { HttpError, getJson } from './http.js';

export const API_URL = 'https://api.water.noaa.gov/nwps/v1';
export const GAUGE_PAGE = (code) => `https://water.noaa.gov/gauges/${code.toLowerCase()}`;
export const NWPS_SITE = 'https://water.noaa.gov';

// Flood categories of the NWPS (status.*.floodCategory), from the lowest to
// the highest. The other values say why there is none: `not_defined` (no flood
// stages at this gauge), `obs_not_current` (no recent reading),
// `fcst_not_current` (no current forecast), `out_of_service`.
export const RANKED_CATEGORIES = ['no_flooding', 'action', 'minor', 'moderate', 'major'];
export const OTHER_CATEGORIES = [
  'low_threshold',
  'not_defined',
  'obs_not_current',
  'fcst_not_current',
  'out_of_service',
];

/**
 * Rank of a category, 0 (no flooding) to 4 (major); `low_threshold` (below
 * the low-water threshold) is no flooding. null for a category that says
 * there is no value.
 */
export function categoryRank(category) {
  if (category === 'low_threshold') {
    return 0;
  }
  const rank = RANKED_CATEGORIES.indexOf(category);
  return rank === -1 ? null : rank;
}

const MISSING = -900; // -999 and -9999 are the "no value" of the API
const number = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > MISSING ? value : null;

const FEET_PER_METRE = 1 / 0.3048;

/** A value of the API in feet or cfs, by its unit; null for an unknown unit. */
function normalize(value, unit) {
  const v = number(value);
  if (v === null) {
    return null;
  }
  switch (unit) {
    case 'ft':
      return { kind: 'stage', value: v };
    case 'm':
      return { kind: 'stage', value: v * FEET_PER_METRE };
    case 'kcfs':
      return { kind: 'flow', value: v * 1000 };
    case 'cfs':
      return { kind: 'flow', value: v };
    default:
      return null;
  }
}

// The year 1 of the API means "no time" (validTime of a missing forecast).
const timeOf = (text) => {
  const time = typeof text === 'string' ? Date.parse(text) : NaN;
  return Number.isFinite(time) && time > 0 ? time : null;
};

/** `{ stage, flow, category, time }` of a `status.observed` or `status.forecast`. */
export function parseStatus(status) {
  const result = { stage: null, flow: null, category: null, time: null };
  if (!status || typeof status !== 'object') {
    return result;
  }
  for (const [value, unit] of [
    [status.primary, status.primaryUnit],
    [status.secondary, status.secondaryUnit],
  ]) {
    const normalized = normalize(value, unit);
    if (normalized && result[normalized.kind] === null) {
      result[normalized.kind] = normalized.value;
    }
  }
  result.category = typeof status.floodCategory === 'string' ? status.floodCategory : null;
  result.time = timeOf(status.validTime);
  return result;
}

/** Flood stages `{ action, minor, moderate, major }` of a series, null where undefined. */
function thresholds(categories, field, unit) {
  return Object.fromEntries(
    ['action', 'minor', 'moderate', 'major'].map((name) => {
      const n = normalize(categories?.[name]?.[field], unit);
      return [name, n ? n.value : null];
    }),
  );
}

/**
 * A gauge of `/gauges/{lid}` (or of the `/gauges` list, without flood stages).
 * `kind` is what the gauge measures and forecasts first: 'stage' for most,
 * 'flow' when its physical element (pedts) is a discharge (Q…).
 */
export function parseGauge(raw) {
  const observed = parseStatus(raw?.status?.observed);
  const forecast = parseStatus(raw?.status?.forecast);
  const pedts = raw?.pedts ?? {};
  const kind = String(pedts.observed ?? '').startsWith('Q') ? 'flow' : 'stage';
  const flood = raw?.flood;
  const stageUnit = flood?.stageUnits || 'ft';
  const flowUnit = flood?.flowUnits || 'cfs';
  const stages = thresholds(flood?.categories, kind, kind === 'flow' ? flowUnit : stageUnit);
  return {
    code: String(raw?.lid ?? '').toUpperCase(),
    name:
      String(raw?.name ?? '')
        .replace(/\s+/g, ' ')
        .trim() || String(raw?.lid ?? ''),
    state: raw?.state?.abbreviation ?? null,
    latitude: number(raw?.latitude),
    longitude: number(raw?.longitude),
    kind,
    // The flood stages, in the unit of `kind`; null when the API did not send them.
    thresholds: flood ? stages : null,
    hasThresholds: ['minor', 'moderate', 'major'].some((name) => stages[name] !== null),
    hasForecast: typeof pedts.forecast === 'string' && pedts.forecast !== '',
    inService: raw?.inService?.enabled !== false,
    observed,
    forecast,
  };
}

export class NwpsClient {
  /**
   * @param {object} [options]
   * @param {Function} [options.fetch]
   * @param {string} [options.baseUrl]
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, baseUrl = API_URL } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
  }

  /** The gauge of a code, or null when the NWPS does not know it (HTTP 404). */
  async gauge(code) {
    try {
      const raw = await getJson(this.fetch, `${this.baseUrl}/gauges/${encodeURIComponent(code)}`);
      return parseGauge(raw);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 404 || err.status === 400)) {
        return null;
      }
      throw err;
    }
  }

  /** The gauges of a box `[minLon, minLat, maxLon, maxLat]`, without flood stages. */
  async gaugesInBox([minLon, minLat, maxLon, maxLat]) {
    const query = new URLSearchParams({
      'bbox.xmin': String(minLon),
      'bbox.ymin': String(minLat),
      'bbox.xmax': String(maxLon),
      'bbox.ymax': String(maxLat),
      srid: 'EPSG_4326',
    });
    const raw = await getJson(this.fetch, `${this.baseUrl}/gauges?${query}`);
    return (Array.isArray(raw?.gauges) ? raw.gauges : []).map(parseGauge);
  }
}
