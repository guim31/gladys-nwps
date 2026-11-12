// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake NWPS serving the
// recorded answers of test/fixtures/nwps (12/11/2026), a manual clock, a
// temporary /data, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './sdk-units.js';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'America/New_York';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The fixtures were recorded at 13:25 UTC on 12/11/2026: the clock starts 5 minutes later.
export const START = Date.parse('2026-11-12T13:30:00Z');

// A house in Bethesda, Maryland (public coordinates of the town centre), 5 km
// from the Potomac at Little Falls (BRKM2).
export const HOUSE = {
  id: 'house-1',
  name: 'Home',
  selector: 'home',
  latitude: 38.9807,
  longitude: -77.1003,
};

export const BRKM2 = 'BRKM2'; // Potomac at Little Falls: stage + flow, forecast, flood stages
export const AAIT2 = 'AAIT2'; // Williamson Creek, Austin: no forecast, flood stages
export const AAMC1 = 'AAMC1'; // Alameda tide gage: no forecast, no flood stages
export const ALFW1 = 'ALFW1'; // Pend Oreille below Albeni Falls Dam: forecast by flow
export const APAM2 = 'APAM2'; // Severn River at Annapolis: action stage, minor forecast
export const ARCF1 = 'ARCF1'; // Peace River at Arcadia: minor flooding
export const CODES = [BRKM2, AAIT2, AAMC1, ALFW1, APAM2, ARCF1];

/** Fake NWPS. `api.down`: 'network' (connection refused), a status (503) or false. */
export function createApi() {
  const api = {
    gauges: Object.fromEntries(CODES.map((code) => [code, fixture(`nwps/gauge-${code}.json`)])),
    box: fixture('nwps/gauges-bbox-washington.json'),
    notFound: fixture('nwps/gauge-unknown.404.json'),
    down: false,
    requests: [],

    /** Changes the status of a gauge, e.g. `set(BRKM2, 'observed', { floodCategory: 'minor' })`. */
    set(code, part, values) {
      Object.assign(api.gauges[code].status[part], values);
    },

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      const match = /\/nwps\/v1\/gauges\/([^/]+)$/.exec(url.pathname);
      if (match) {
        const code = decodeURIComponent(match[1]).toUpperCase();
        // A gauge of the box without its own fixture: its list entry has the
        // same status, without flood stages.
        const body = api.gauges[code] ?? api.box.gauges.find((g) => g.lid === code);
        return body
          ? { status: 200, text: async () => JSON.stringify(body) }
          : { status: 404, text: async () => JSON.stringify(api.notFound) };
      }
      if (url.pathname.endsWith('/nwps/v1/gauges')) {
        const [xmin, ymin, xmax, ymax] = ['xmin', 'ymin', 'xmax', 'ymax'].map((k) =>
          Number(url.searchParams.get(`bbox.${k}`)),
        );
        const gauges = api.box.gauges.filter(
          (g) =>
            g.longitude >= xmin && g.longitude <= xmax && g.latitude >= ymin && g.latitude <= ymax,
        );
        return { status: 200, text: async () => JSON.stringify({ gauges }) };
      }
      return { status: 404, text: async () => '{}' };
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-nwps-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, { store, fetch: api.fetch, timers, now: clock.now });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** The device published for a gauge code, from the last discovery list. */
export const discovered = (world, code) =>
  world.fake.discoveredDevices.find((device) =>
    device.params.some((p) => p.name === 'NWS_LID' && p.value === code),
  );

/** Creates the device of a gauge in Gladys, as the user would. */
export async function create(world, code) {
  const device = discovered(world, code);
  if (!device) {
    throw new Error(`${code} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Last state (number or text) Gladys received for a feature key of a device. */
export const last = (world, device, key) => world.fake.lastState(featureId(device, key));

/** Runs one refresh, `minutes` later. */
export async function cycle(world, minutes = 15) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.refresh();
}

/**
 * Captures the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
