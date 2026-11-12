// -----------------------------------------------------------------------------
// The heart of the integration: which gauges are followed, their refresh, the
// states published to Gladys, the scene trigger and the connection status.
//
// Gauges: the codes of the configuration, then the nearest ones in service
// around the house when "Around my house" is on (looked up at start, on a new
// configuration and once a day), 20 at most.
//
// Refresh: one `GET /gauges/{lid}` per gauge, one gauge after the other, every
// 15 to 30 minutes by a timer of the container (devices are published with
// should_poll: false; `poll` only serves a Gladys that would poll anyway).
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat
// every 12 h so a steady river does not show "no recent value". Values are
// published in the unit each feature was created with (feet or metres, cfs or
// m³/s), so changing the unit setting never mixes units in a history: the
// devices take the new unit when "Update" is clicked in the Discover tab.
//
// Scene trigger `flood_category_raised`: fired when the observed or forecast
// category of a created gauge rises to action stage or above. The last
// categories are kept under /data, so a rise during a restart fires once.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HOME_GAUGES, MAX_GAUGES } from './config.js';
import {
  FEATURE_KEYS,
  UNITS,
  buildDevice,
  convert,
  gaugeCodeOfId,
  gaugeIds,
  systemOfFeature,
} from './devices.js';
import { KM_PER_MILE, boxAround, distanceKm } from './geo.js';
import {
  SOURCE_NAMES,
  STATUS,
  categoryName,
  formatDate,
  formatNumber,
  render,
} from './messages.js';
import { NwpsClient, categoryRank } from './nwps.js';

const logger = createLogger({ name: 'nwps-monitor' });

export const WIDGET_KEY = 'gauges';
export const TRIGGER_KEY = 'flood_category_raised';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const DEFAULT_TIMINGS = {
  heartbeatMs: 12 * HOUR,
  // A reading older than this is not published again (the feature then shows
  // "no recent value" in Gladys, which is true).
  freshMs: 24 * HOUR,
  homeLookupMs: 24 * HOUR,
};

/** The flood level feature of a category rank: 0 none/action, 1 minor, 2 moderate, 3 major. */
export const levelOfRank = (rank) => Math.max(0, rank - 1);

/** Whether the forecast of a gauge is current, with a value of its kind. */
export const forecastIsCurrent = (gauge) =>
  gauge.hasForecast &&
  gauge.forecast.time !== null &&
  gauge.forecast[gauge.kind] !== null &&
  !['fcst_not_current', 'out_of_service'].includes(gauge.forecast.category);

/** A value in ft or cfs with its unit, in a unit system: "2.78 ft", "1 810 cfs". */
export function formatValue(value, kind, system, language) {
  const format = UNITS[system]?.[kind] ?? UNITS.us[kind];
  const digits = format.displayDigits ?? format.digits;
  return `${formatNumber(convert(value, kind, system), language, digits)} ${format.label}`;
}

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch]
   * @param {boolean} [options.timers] false in tests: no refresh timer
   * @param {Function} [options.now] clock, in ms
   * @param {object} [options.timings] see DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch, timers = true, now = Date.now, timings = {} }) {
    this.gladys = gladys;
    this.store = store;
    this.nwps = new NwpsClient({ fetch });
    this.timers = timers;
    this.now = now;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.gauges = new Map(); // code -> last parsed gauge
    this.refreshedAt = new Map(); // code -> time of its last successful read
    this.homeCodes = [];
    this.homeLookedUpAt = null;
    this.homeProblem = null;
    this.homeLookupFailed = false;
    this.unknown = new Set();
    this.unavailable = false;
    this.levels = {}; // code -> { observed, forecast } ranks, see src/store.js
    this.timer = null;
    this.running = null;
    this.lastStatus = null;
  }

  async start(config) {
    const saved = await this.store.load();
    this.levels = saved.levels && typeof saved.levels === 'object' ? saved.levels : {};
    this.config = config;
    // The timer first: a failed first refresh (Gladys or the NWPS down) must
    // not leave the integration without its refresh.
    this.schedule();
    await this.refresh({ discover: true, lookupHome: true });
    logger.info(`Following ${this.followed().length} gauge(s)`);
  }

  /** After a reconnection to Gladys: publish everything again. */
  async resync(config) {
    this.config = config;
    this.gladys.forgetPublishedStates?.();
    await this.refresh({ discover: true });
  }

  async reconfigure(config) {
    this.config = config;
    this.unknown.clear();
    await this.refresh({ discover: true, lookupHome: true });
    this.schedule();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    logger.info(`Configuration updated: following ${this.followed().length} gauge(s)`);
  }

  schedule() {
    if (!this.timers) {
      return;
    }
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.refresh().catch((err) => logger.error('Refresh failed', err));
    }, this.config.refreshMinutes * MINUTE);
    this.timer.unref?.();
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  /**
   * Codes of the followed gauges: the configuration first, then the gauges
   * created in Gladys (a created device stays live when its code leaves the
   * settings: delete the device to stop), then around the house.
   */
  followed() {
    const codes = [
      ...new Set([...(this.config?.gaugeCodes ?? []), ...this.created(), ...this.homeCodes]),
    ];
    return codes.slice(0, MAX_GAUGES);
  }

  /** Codes of the gauges created in Gladys, in the order of Gladys. */
  created() {
    return (this.gladys.devices ?? [])
      .map((device) => gaugeCodeOfId(this.gladys, device.external_id))
      .filter((code) => code !== null);
  }

  /** The house of the configuration, or the first one with a location. */
  async findHouse() {
    const houses = await this.gladys.getHouses();
    const located = houses.filter((house) => house.latitude !== null && house.longitude !== null);
    const selector = this.config?.houseSelector;
    return (selector && located.find((house) => house.selector === selector)) || located[0] || null;
  }

  /** The nearest gauges in service and reporting around the house, `HOME_GAUGES` of them. */
  async lookupHome() {
    const miles = this.config.homeRadiusMiles;
    this.homeProblem = null;
    if (!miles) {
      this.homeCodes = [];
      return;
    }
    const house = await this.findHouse();
    if (!house) {
      this.homeCodes = [];
      this.homeProblem = 'noHouse';
      return;
    }
    const km = miles * KM_PER_MILE;
    const gauges = await this.nwps.gaugesInBox(boxAround(house.latitude, house.longitude, km));
    this.homeCodes = gauges
      .filter(
        (gauge) =>
          gauge.inService &&
          !['out_of_service', 'obs_not_current'].includes(gauge.observed.category) &&
          gauge.latitude !== null &&
          gauge.longitude !== null,
      )
      .map((gauge) => ({
        code: gauge.code,
        km: distanceKm(house.latitude, house.longitude, gauge.latitude, gauge.longitude),
      }))
      .filter((entry) => entry.km <= km)
      .sort((a, b) => a.km - b.km)
      .slice(0, HOME_GAUGES)
      .map((entry) => entry.code);
    this.homeLookedUpAt = this.now();
  }

  /** One refresh at a time: a timer tick during a long refresh waits for it. */
  refresh(options = {}) {
    const previous = this.running ?? Promise.resolve();
    const run = previous.catch(() => {}).then(() => this.doRefresh(options));
    this.running = run;
    return run;
  }

  async doRefresh({ discover = false, lookupHome = false, codes = null } = {}) {
    if (!this.config) {
      return;
    }
    const homeDue =
      this.homeLookedUpAt === null || this.now() - this.homeLookedUpAt >= this.timings.homeLookupMs;
    if (lookupHome || (codes === null && homeDue && this.config.homeRadiusMiles > 0)) {
      try {
        await this.lookupHome();
        if (this.homeLookupFailed) {
          this.homeLookupFailed = false;
          logger.info('The gauges around the house are found again');
        }
      } catch (err) {
        // Keeps the gauges found before; the next refresh tries again. Logged once.
        if (!this.homeLookupFailed) {
          logger.warn(`Cannot look up the gauges around the house: ${err.message}`);
        }
        this.homeLookupFailed = true;
      }
    }
    const before = this.followed()
      .filter((code) => this.gauges.has(code))
      .join(',');
    const targets = codes ?? this.followed();
    let failures = 0;
    let lastError = null;
    for (const code of targets) {
      try {
        const gauge = await this.nwps.gauge(code);
        if (gauge === null) {
          if (!this.unknown.has(code)) {
            logger.warn(`Unknown gauge code ${code}`);
          }
          this.unknown.add(code);
          continue;
        }
        this.unknown.delete(code);
        this.gauges.set(code, gauge);
        this.refreshedAt.set(code, this.now());
        await this.checkTrigger(code, gauge);
      } catch (err) {
        failures += 1;
        lastError = err;
        logger.debug(`Cannot read gauge ${code}: ${err.message}`);
      }
    }
    const down = targets.length > 0 && failures === targets.length;
    if (down && !this.unavailable) {
      logger.warn(`The NWPS API does not answer: ${lastError?.message}`);
    } else if (!down && this.unavailable && failures === 0) {
      logger.info('The NWPS API answers again');
    }
    if (codes === null || down || failures === 0) {
      this.unavailable = down;
    }
    const after = this.followed()
      .filter((code) => this.gauges.has(code))
      .join(',');
    if (discover || after !== before) {
      await this.publishDiscovered();
    }
    const published = await this.publishStates();
    if (published > 0 || discover) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
    await this.updateStatus();
  }

  /** Publishes the discovered devices: the followed gauges the NWPS knows. */
  async publishDiscovered() {
    const devices = this.followed()
      .filter((code) => this.gauges.has(code))
      .map((code) =>
        buildDevice(this.gladys, this.gauges.get(code), this.config.language, this.config.units),
      );
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** Scan requested from the Discover tab: read the missing gauges, then publish. */
  async publishDiscoveredOnScan() {
    const missing = this.followed().filter((code) => !this.gauges.has(code));
    if (missing.length > 0) {
      await this.refresh({ discover: true, codes: missing });
    } else {
      await this.publishDiscovered();
    }
  }

  /** Codes of the configuration the NWPS does not know (a gauge around the house may vanish too). */
  unknownConfigured() {
    return this.config.gaugeCodes.filter((code) => this.unknown.has(code));
  }

  async updateStatus() {
    let status = { connected: true };
    if (this.unavailable) {
      status = { connected: false, message: render(STATUS, 'unavailable') };
    } else if (this.unknownConfigured().length > 0 || this.config.invalid.length > 0) {
      const codes = [...this.config.invalid, ...this.unknownConfigured()].join(', ');
      status = { connected: false, message: render(STATUS, 'unknownCodes', { codes }) };
    } else if (this.homeProblem) {
      status = { connected: false, message: render(STATUS, this.homeProblem) };
    }
    const key = JSON.stringify(status);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys.setConnectionStatus(status.connected, status.message).catch((err) => {
      this.lastStatus = null;
      logger.debug(`Cannot set the connection status: ${err.message}`);
    });
  }

  /** The states of a created gauge, in the units its features were created with. */
  statesOf(device) {
    const code = gaugeCodeOfId(this.gladys, device.external_id);
    const gauge = this.gauges.get(code);
    if (!gauge) {
      return [];
    }
    const language = this.config.language;
    const ids = gaugeIds(this.gladys, code);
    const fresh =
      gauge.observed.time !== null && this.now() - gauge.observed.time <= this.timings.freshMs;
    const observedRank = categoryRank(gauge.observed.category);
    const current = forecastIsCurrent(gauge);
    const forecastRank = current ? (categoryRank(gauge.forecast.category) ?? 0) : 0;
    const states = [];
    const number = (id, value) => {
      if (value !== null && value !== undefined) {
        states.push({ device_feature_external_id: id, state: value });
      }
    };
    const text = (id, value) => states.push({ device_feature_external_id: id, text: value });
    for (const feature of device.features ?? []) {
      const system = systemOfFeature(feature);
      switch (feature.external_id) {
        case ids[FEATURE_KEYS.STAGE]:
          if (fresh && gauge.observed.stage !== null) {
            number(feature.external_id, convert(gauge.observed.stage, 'stage', system));
          }
          break;
        case ids[FEATURE_KEYS.FLOW]:
          if (fresh && gauge.observed.flow !== null) {
            number(feature.external_id, convert(gauge.observed.flow, 'flow', system));
          }
          break;
        case ids[FEATURE_KEYS.FLOOD_LEVEL]:
          if (observedRank !== null) {
            number(feature.external_id, levelOfRank(observedRank));
          }
          break;
        case ids[FEATURE_KEYS.FLOOD_CATEGORY]:
          text(feature.external_id, categoryName(gauge.observed.category, language));
          break;
        case ids[FEATURE_KEYS.LAST_READING]:
          text(
            feature.external_id,
            gauge.observed.time === null
              ? categoryName('obs_not_current', language)
              : formatDate(gauge.observed.time, language),
          );
          break;
        case ids[FEATURE_KEYS.FORECAST_PEAK]:
          if (current) {
            number(feature.external_id, convert(gauge.forecast[gauge.kind], gauge.kind, system));
          }
          break;
        case ids[FEATURE_KEYS.FORECAST_PEAK_TIME]:
          text(
            feature.external_id,
            current
              ? formatDate(gauge.forecast.time, language)
              : categoryName('fcst_not_current', language),
          );
          break;
        case ids[FEATURE_KEYS.FORECAST_FLOOD_LEVEL]:
          number(feature.external_id, levelOfRank(forecastRank));
          break;
        case ids[FEATURE_KEYS.FORECAST_CATEGORY]:
          text(
            feature.external_id,
            categoryName(current ? gauge.forecast.category : 'fcst_not_current', language),
          );
          break;
        default:
          break;
      }
    }
    return states;
  }

  /** Publishes the changed states of every created gauge; resolves with their count. */
  async publishStates(devices = this.gladys.devices ?? []) {
    const states = devices
      .filter((device) => gaugeCodeOfId(this.gladys, device.external_id) !== null)
      .flatMap((device) => this.statesOf(device));
    if (states.length === 0) {
      return 0;
    }
    try {
      const result = await this.gladys.publishChangedStates(states, {
        heartbeat: this.timings.heartbeatMs,
      });
      return result?.count ?? 0;
    } catch (err) {
      // Sent again by the next refresh (the SDK only remembers accepted values).
      logger.warn(`Cannot publish the states: ${err.message}`);
      return 0;
    }
  }

  /** Fires the scene trigger when a category rises to action stage or above. */
  async checkTrigger(code, gauge) {
    const current = forecastIsCurrent(gauge);
    const ranks = {
      observed: categoryRank(gauge.observed.category),
      // No current forecast: nothing forecast, so a new forecast in flood fires again.
      forecast: gauge.hasForecast
        ? current
          ? (categoryRank(gauge.forecast.category) ?? 0)
          : 0
        : null,
    };
    const saved = this.levels[code] ?? {};
    const next = { ...saved };
    let changed = false;
    for (const source of ['observed', 'forecast']) {
      const rank = ranks[source];
      if (rank === null) {
        continue; // no reading, no forecast point: the baseline stays
      }
      const previous = saved[source];
      if (typeof previous === 'number' && rank > previous && rank >= 1) {
        await this.fire(code, gauge, source);
      }
      if (previous !== rank) {
        next[source] = rank;
        changed = true;
      }
    }
    if (changed) {
      this.levels = { ...this.levels, [code]: next };
      this.store.save({ levels: this.levels });
    }
  }

  async fire(code, gauge, source) {
    const ids = gaugeIds(this.gladys, code);
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === ids.device);
    if (!device) {
      return; // not created in Gladys: no scene can target it
    }
    const language = this.config.language;
    const status = gauge[source];
    const value = status[gauge.kind];
    const data = {
      gauge: ids.device,
      source,
      category: status.category,
      gauge_name: device.name || gauge.name,
      category_name: categoryName(status.category, language),
      source_name: SOURCE_NAMES[language][source],
      value: value === null ? '' : formatValue(value, gauge.kind, this.config.units, language),
      time: status.time === null ? '' : formatDate(status.time, language),
    };
    logger.info(`${code}: ${source} category rose to ${status.category}`);
    await this.gladys.publishSceneEvent(TRIGGER_KEY, data).catch((err) => {
      logger.warn(`Cannot fire the scene trigger: ${err.message}`);
    });
  }

  // --- Gladys events ---------------------------------------------------------

  async onDeviceCreated(device) {
    await this.publishStates([device]);
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async onDeviceUpdated(device) {
    await this.publishStates([device]);
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async onDeviceDeleted() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Fallback of `onPoll`: refreshes the gauge if its last read is older than half a period. */
  async poll(device) {
    const code = gaugeCodeOfId(this.gladys, device.external_id);
    if (code === null) {
      return;
    }
    const last = this.refreshedAt.get(code);
    if (last === undefined || this.now() - last >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.refresh({ codes: [code] });
    }
  }

  /** Time of the oldest last read among some gauges (the widget footer), null if none. */
  updatedAt(codes) {
    const times = codes.map((code) => this.refreshedAt.get(code)).filter((t) => t !== undefined);
    return times.length === 0 ? null : Math.min(...times);
  }
}
