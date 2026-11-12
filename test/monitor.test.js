// The monitor against the fake Gladys and the fake NWPS: states, units,
// refresh by the container's own timer, scene trigger, connection status.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AAIT2,
  ALFW1,
  APAM2,
  BRKM2,
  START,
  captureLogs,
  create,
  createApi,
  createWorld,
  cycle,
  discovered,
  featureId,
  last,
} from './helpers/world.js';

const MINUTE = 60 * 1000;

test('creating a device publishes all its states at once, in feet and cfs', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2, language: 'en' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.states.length, 0, 'nothing before the device exists in Gladys');
  const device = await create(world, BRKM2);
  assert.equal(last(world, device, 'stage'), 2.78);
  assert.equal(last(world, device, 'flow'), 1810);
  assert.equal(last(world, device, 'flood_level'), 0);
  assert.equal(last(world, device, 'flood_category'), 'No flooding');
  assert.equal(last(world, device, 'last_reading'), '11/12, 07:45 AM');
  assert.equal(last(world, device, 'forecast_peak'), 2.8);
  assert.equal(last(world, device, 'forecast_peak_time'), '11/12, 01:00 PM');
  assert.equal(last(world, device, 'forecast_flood_level'), 0);
  assert.equal(last(world, device, 'forecast_category'), 'No flooding');
  assert.ok(world.fake.widgetRefreshes.length > 0, 'the widget is asked to refresh');
});

test('metric units convert; a feature keeps the unit it was created with', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2, units: 'metric' } });
  t.after(() => world.app.stop());
  const device = await create(world, BRKM2);
  assert.equal(last(world, device, 'stage'), 0.85);
  assert.equal(last(world, device, 'flow'), 51.3);
  assert.equal(device.features.find((f) => f.type === 'flow').name, 'Débit');
  // The user goes back to feet without "Update": the created features stay in metres.
  await world.fake.configUpdated({ gauges: BRKM2, units: 'us' });
  world.api.set(BRKM2, 'observed', { primary: 3.28 });
  await cycle(world);
  assert.equal(last(world, device, 'stage'), 1);
  assert.equal(discovered(world, BRKM2).features[0].unit, 'feet', 'new devices in feet');
});

test('a gauge forecast by flow publishes its forecast peak as a flow', async (t) => {
  const world = await createWorld({ config: { gauges: ALFW1 } });
  t.after(() => world.app.stop());
  const device = await create(world, ALFW1);
  const peak = device.features.find((f) => f.external_id.endsWith(':forecast_peak'));
  assert.equal(peak.type, 'flow');
  assert.equal(peak.name, 'Pic de débit prévu (cfs)');
  assert.equal(last(world, device, 'forecast_peak'), 12252);
  assert.equal(last(world, device, 'stage'), 2034.4);
});

test('the forecast categories: action now, minor flooding forecast; a withdrawn forecast is 0', async (t) => {
  const world = await createWorld({ config: { gauges: APAM2, language: 'en' } });
  t.after(() => world.app.stop());
  const device = await create(world, APAM2);
  assert.equal(last(world, device, 'flood_level'), 0, 'action stage is no flooding yet');
  assert.equal(last(world, device, 'flood_category'), 'Action stage');
  assert.equal(last(world, device, 'forecast_flood_level'), 1);
  assert.equal(last(world, device, 'forecast_category'), 'Minor flooding');
  world.api.set(APAM2, 'forecast', {
    primary: -999,
    floodCategory: 'fcst_not_current',
    validTime: '0001-01-01T00:00:00Z',
  });
  await cycle(world);
  assert.equal(last(world, device, 'forecast_flood_level'), 0);
  assert.equal(last(world, device, 'forecast_category'), 'No current forecast');
  assert.equal(last(world, device, 'forecast_peak_time'), 'No current forecast');
  assert.equal(last(world, device, 'forecast_peak'), 2.7, 'the last crest is not overwritten');
});

test('a reading older than a day is not published again', async (t) => {
  const world = await createWorld({ config: { gauges: AAIT2 } });
  t.after(() => world.app.stop());
  const device = await create(world, AAIT2);
  const count = () =>
    world.fake.states.filter((s) => s.device_feature_external_id === featureId(device, 'stage'))
      .length;
  const before = count();
  t.mock.timers.enable({ apis: ['Date'], now: START + 13 * 60 * MINUTE });
  world.clock.advance(13 * 60 * MINUTE);
  await world.monitor.refresh();
  assert.equal(count(), before + 1, 'the 12 h heartbeat');
  t.mock.timers.setTime(START + 26 * 60 * MINUTE);
  world.clock.advance(13 * 60 * MINUTE);
  await world.monitor.refresh();
  assert.equal(count(), before + 1, 'stale: not sent again');
});

test('the container refreshes on its own timer, without any poll from Gladys', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({
    config: { gauges: BRKM2, refresh_interval: '20' },
    timers: true,
  });
  t.after(() => world.app.stop());
  const device = await create(world, BRKM2);
  world.api.set(BRKM2, 'observed', { primary: 3.5 });
  t.mock.timers.tick(20 * MINUTE);
  await world.monitor.running;
  assert.equal(last(world, device, 'stage'), 3.5);
  assert.equal(world.fake.discoveredDevices[0].should_poll, false);
});

test('onPoll is a fallback: it reads the gauge again only after half a period', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => world.app.stop());
  const device = await create(world, BRKM2);
  const reads = () => world.api.requests.filter((u) => u.pathname.endsWith('/BRKM2')).length;
  const before = reads();
  await world.fake.poll(device);
  assert.equal(reads(), before);
  world.clock.advance(8 * MINUTE);
  await world.fake.poll(device);
  assert.equal(reads(), before + 1);
});

test('the trigger fires once when a category rises, not on the first reading', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2, language: 'en' } });
  t.after(() => world.app.stop());
  const device = await create(world, BRKM2);
  assert.deepEqual(world.fake.sceneEvents, []);
  world.api.set(BRKM2, 'observed', { primary: 10.4, floodCategory: 'minor' });
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 1);
  const [event] = world.fake.sceneEvents;
  assert.equal(event.key, 'flood_category_raised');
  assert.deepEqual(event.data, {
    gauge: device.external_id,
    source: 'observed',
    category: 'minor',
    gauge_name: device.name,
    category_name: 'Minor flooding',
    source_name: 'observed',
    value: '10.4 ft',
    time: '11/12, 07:45 AM',
  });
  assert.equal(last(world, device, 'flood_level'), 1);
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 1, 'no second event for the same category');
  world.api.set(BRKM2, 'forecast', { primary: 12.5, floodCategory: 'moderate' });
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 2);
  assert.equal(world.fake.sceneEvents[1].data.source, 'forecast');
  assert.equal(world.fake.sceneEvents[1].data.value, '12.5 ft');
  // Going down then up again fires again.
  world.api.set(BRKM2, 'observed', { floodCategory: 'no_flooding' });
  await cycle(world);
  world.api.set(BRKM2, 'observed', { floodCategory: 'action' });
  await cycle(world);
  assert.equal(world.fake.sceneEvents.length, 3);
  assert.equal(world.fake.sceneEvents[2].data.category, 'action');
});

test('a rise during a restart fires once; a gauge not created fires nothing', async (t) => {
  const first = await createWorld({ config: { gauges: `${BRKM2},${APAM2}` } });
  const device = await create(first, BRKM2);
  await first.app.stop();
  const api = createApi();
  api.set(BRKM2, 'observed', { floodCategory: 'minor' });
  api.set(APAM2, 'observed', { floodCategory: 'moderate' });
  const second = await createWorld({
    config: { gauges: `${BRKM2},${APAM2}` },
    devices: [device],
    api,
    dataDir: first.dataDir,
  });
  t.after(() => second.app.stop());
  assert.deepEqual(
    second.fake.sceneEvents.map((e) => e.data.gauge),
    [device.external_id],
  );
});

test('connection status: down API, recovery, unknown codes, no located house', async (t) => {
  const world = await createWorld({ config: { gauges: `${BRKM2}, ZZZZ9, nope` } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(
    world.fake.connectionStatus.message.en,
    'Unknown gauge codes, check the configuration: nope, ZZZZ9',
  );
  assert.equal(typeof world.fake.connectionStatus.message.fr, 'string', 'the four languages');
  await world.fake.configUpdated({ gauges: BRKM2 });
  assert.equal(world.fake.connectionStatus.connected, true);
  world.api.down = 503;
  await cycle(world);
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  world.api.down = false;
  await cycle(world);
  assert.equal(world.fake.connectionStatus.connected, true);

  const homeless = await createWorld({ config: { around_home: '10' }, houses: [] });
  t.after(() => homeless.app.stop());
  assert.match(homeless.fake.connectionStatus.message.en, /No house/);
});

test('around my house: the 3 nearest gauges reporting, after the configured ones', async (t) => {
  const world = await createWorld({ config: { gauges: APAM2, around_home: '10' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.monitor.followed(), [APAM2, BRKM2, 'RCJD2', 'MDRV2']);
  assert.equal(world.fake.discoveredDevices.length, 4);
  // The exact location never leaves Gladys: the box is rounded to 0.05°.
  const box = world.api.requests.find((u) => u.pathname.endsWith('/gauges'));
  for (const key of ['xmin', 'ymin', 'xmax', 'ymax']) {
    const value = Number(box.searchParams.get(`bbox.${key}`));
    assert.ok(Math.abs(value * 20 - Math.round(value * 20)) < 1e-9, `${key} ${value}`);
  }
});

test('a normal refresh writes nothing at info; an outage one line, its end one line', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => world.app.stop());
  await create(world, BRKM2);
  const lines = captureLogs(t, 'info');
  await cycle(world);
  world.api.set(BRKM2, 'observed', { primary: 3 });
  await cycle(world);
  assert.deepEqual(lines, []);
  world.api.down = 'network';
  await cycle(world);
  await cycle(world);
  world.api.down = false;
  await cycle(world);
  assert.equal(lines.length, 2, lines.map((l) => l.text).join('\n'));
  assert.equal(lines[0].level, 'warn');
  assert.match(lines[1].text, /answers again/);
});
