// -----------------------------------------------------------------------------
// One Gladys device per NWS gauge.
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js):
//   - stage               level-sensor/liquid-depth, in feet or metres: the
//                         water height at the gauge (a stage above the gauge
//                         datum, or an elevation for some lakes and dams);
//   - flow                water-valve/flow, when the gauge reports one: in
//                         cubic metres per second (unit of the core since
//                         5.3.2), or in cubic feet per second, a unit the core
//                         does not have: then without unit, and the name says
//                         "cfs";
//   - flood_level         risk/integer, when the gauge has flood stages: 0 no
//                         flooding (action stage included), 1 minor, 2
//                         moderate, 3 major. The front draws it as a risk
//                         badge (none, low, medium, high), and a native "device
//                         value ≥ 1" scene trigger fires on minor flooding;
//   - flood_category      text/text: the NWS category in words, the action
//                         stage and "no recent reading" included;
//   - last_reading        text/text: the time of the last reading;
//   - forecast_*          only at the gauges the NWS forecasts: the highest
//                         value of the current forecast (a stage, or a flow at
//                         the few gauges forecast by flow), its time, its
//                         flood level (0 when there is no current forecast)
//                         and its category.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The NWS location identifier (BRKM2) is the platform id.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'gauge';
export const FEATURE_KEYS = {
  STAGE: 'stage',
  FLOW: 'flow',
  FLOOD_LEVEL: 'flood_level',
  FLOOD_CATEGORY: 'flood_category',
  LAST_READING: 'last_reading',
  FORECAST_PEAK: 'forecast_peak',
  FORECAST_PEAK_TIME: 'forecast_peak_time',
  FORECAST_FLOOD_LEVEL: 'forecast_flood_level',
  FORECAST_CATEGORY: 'forecast_category',
};

// cubic-meter-per-second of Gladys 5.3.2, not in the SDK 0.16.0 yet
// (integration-sdk-js#47).
const CUBIC_METER_PER_SECOND = 'cubic-meter-per-second';
const METRES_PER_FOOT = 0.3048;
const CUBIC_METRES_PER_CUBIC_FOOT = 0.028316846592;

// How each unit system publishes a stage and a flow given in ft and cfs: the
// Gladys unit, the display bounds (wide enough for the elevations of western
// lakes, about 8,700 ft, and the Mississippi in flood) and the rounding.
export const UNITS = {
  us: {
    stage: { unit: DEVICE_FEATURE_UNITS.FEET, bound: 10000, factor: 1, digits: 2, label: 'ft' },
    flow: { unit: undefined, bound: 5000000, factor: 1, digits: 0, label: 'cfs' },
  },
  metric: {
    stage: {
      unit: DEVICE_FEATURE_UNITS.M,
      bound: 3050,
      factor: METRES_PER_FOOT,
      digits: 2,
      label: 'm',
    },
    flow: {
      unit: CUBIC_METER_PER_SECOND,
      bound: 150000,
      factor: CUBIC_METRES_PER_CUBIC_FOOT,
      digits: 1,
      label: 'm³/s',
    },
  },
};

/** A value in ft or cfs (`kind` 'stage' or 'flow') in a unit system, rounded. */
export function convert(value, kind, system) {
  const format = UNITS[system]?.[kind] ?? UNITS.us[kind];
  const scale = 10 ** format.digits;
  return Math.round(value * format.factor * scale) / scale;
}

/** The unit system a feature of Gladys was created with, by its unit. */
export const systemOfFeature = (feature) =>
  feature?.unit === DEVICE_FEATURE_UNITS.M || feature?.unit === CUBIC_METER_PER_SECOND
    ? 'metric'
    : 'us';

// Feature names, frozen at creation in Gladys (language of the configuration).
// The flow in cfs has no Gladys unit: its name carries it.
export const NAMES = {
  en: {
    stage: 'Water level',
    flow: 'Flow',
    flow_cfs: 'Flow (cfs)',
    flood_level: 'Flood level',
    flood_category: 'Flood category',
    last_reading: 'Last reading',
    forecast_peak_stage: 'Forecast crest',
    forecast_peak_flow: 'Forecast peak flow',
    forecast_peak_flow_cfs: 'Forecast peak flow (cfs)',
    forecast_peak_time: 'Time of the forecast crest',
    forecast_flood_level: 'Forecast flood level',
    forecast_category: 'Forecast flood category',
  },
  fr: {
    stage: "Hauteur d'eau",
    flow: 'Débit',
    flow_cfs: 'Débit (cfs)',
    flood_level: 'Niveau de crue',
    flood_category: 'Catégorie de crue',
    last_reading: 'Dernière mesure',
    forecast_peak_stage: 'Pic de hauteur prévu',
    forecast_peak_flow: 'Pic de débit prévu',
    forecast_peak_flow_cfs: 'Pic de débit prévu (cfs)',
    forecast_peak_time: 'Heure du pic prévu',
    forecast_flood_level: 'Niveau de crue prévu',
    forecast_category: 'Catégorie de crue prévue',
  },
  de: {
    stage: 'Wasserstand',
    flow: 'Abfluss',
    flow_cfs: 'Abfluss (cfs)',
    flood_level: 'Hochwasserstufe',
    flood_category: 'Hochwasserkategorie',
    last_reading: 'Letzte Messung',
    forecast_peak_stage: 'Prognostizierter Scheitel',
    forecast_peak_flow: 'Prognostizierter Spitzenabfluss',
    forecast_peak_flow_cfs: 'Prognost. Spitzenabfluss (cfs)',
    forecast_peak_time: 'Zeit des Scheitels',
    forecast_flood_level: 'Prognostizierte Hochwasserstufe',
    forecast_category: 'Prognostizierte Kategorie',
  },
  es: {
    stage: 'Nivel del agua',
    flow: 'Caudal',
    flow_cfs: 'Caudal (cfs)',
    flood_level: 'Nivel de inundación',
    flood_category: 'Categoría de inundación',
    last_reading: 'Última medición',
    forecast_peak_stage: 'Cresta prevista',
    forecast_peak_flow: 'Caudal máximo previsto',
    forecast_peak_flow_cfs: 'Caudal máximo previsto (cfs)',
    forecast_peak_time: 'Hora de la cresta prevista',
    forecast_flood_level: 'Nivel de inundación previsto',
    forecast_category: 'Categoría prevista',
  },
};

/** External ids of a gauge device and of its features. */
export function gaugeIds(gladys, code) {
  const ids = gladys.externalIds(DEVICE_TYPE, code);
  return {
    device: ids.device,
    ...Object.fromEntries(Object.values(FEATURE_KEYS).map((key) => [key, ids.feature(key)])),
  };
}

/** The gauge code of a device or feature external id (null if not ours). */
export function gaugeCodeOfId(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const level = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.RISK, TYPES.RISK.INTEGER, {
    keep_history: true,
    min: 0,
    max: 3,
  });

function measure(kind, name, externalId, system) {
  const format = UNITS[system][kind];
  const [category, type] =
    kind === 'stage'
      ? [DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR, TYPES.LEVEL_SENSOR.LIQUID_DEPTH]
      : [DEVICE_FEATURE_CATEGORIES.WATER_VALVE, TYPES.WATER_VALVE.FLOW];
  return sensor(name, externalId, category, type, {
    ...(format.unit ? { unit: format.unit } : {}),
    keep_history: true,
    min: -format.bound,
    max: format.bound,
  });
}

/** Whether a gauge reports a stage, a flow (from its kind and its last reading). */
export const hasStage = (gauge) => gauge.kind === 'stage' || gauge.observed.stage !== null;
export const hasFlow = (gauge) => gauge.kind === 'flow' || gauge.observed.flow !== null;

/**
 * The discovery payload of a gauge.
 * @param {object} gladys
 * @param {object} gauge see src/nwps.js parseGauge
 * @param {string} language language of the feature names
 * @param {string} system 'us' or 'metric', see UNITS
 */
export function buildDevice(gladys, gauge, language = 'fr', system = 'us') {
  const ids = gaugeIds(gladys, gauge.code);
  const names = NAMES[language] ?? NAMES.fr;
  const units = UNITS[system] ? system : 'us';
  const cfs = units === 'us';
  const features = [];
  if (hasStage(gauge)) {
    features.push(measure('stage', names.stage, ids.stage, units));
  }
  if (hasFlow(gauge)) {
    features.push(measure('flow', cfs ? names.flow_cfs : names.flow, ids.flow, units));
  }
  if (gauge.hasThresholds) {
    features.push(level(names.flood_level, ids.flood_level));
  }
  features.push(text(names.flood_category, ids.flood_category));
  features.push(text(names.last_reading, ids.last_reading));
  if (gauge.hasForecast) {
    const peakName =
      gauge.kind === 'stage'
        ? names.forecast_peak_stage
        : cfs
          ? names.forecast_peak_flow_cfs
          : names.forecast_peak_flow;
    features.push(measure(gauge.kind, peakName, ids.forecast_peak, units));
    features.push(text(names.forecast_peak_time, ids.forecast_peak_time));
    if (gauge.hasThresholds) {
      features.push(level(names.forecast_flood_level, ids.forecast_flood_level));
    }
    features.push(text(names.forecast_category, ids.forecast_category));
  }
  const params = [{ name: 'NWS_LID', value: gauge.code }];
  if (gauge.state) {
    params.push({ name: 'STATE', value: gauge.state });
  }
  return {
    name: gauge.name,
    external_id: ids.device,
    model: gauge.hasForecast ? 'NWS forecast point' : 'NWS gauge',
    should_poll: false,
    params,
    features,
  };
}
