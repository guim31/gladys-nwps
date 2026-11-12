// The parsing of the recorded NWPS answers (12/11/2026) and the client errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NwpsClient, categoryRank, parseGauge } from '../src/nwps.js';
import { createApi, fixture } from './helpers/world.js';

const gauge = (code) => parseGauge(fixture(`nwps/gauge-${code}.json`));

test('a forecast point: stage in ft, flow in cfs, flood stages, the crest of the forecast', () => {
  const brkm2 = gauge('BRKM2');
  assert.equal(brkm2.code, 'BRKM2');
  assert.equal(brkm2.name, 'Potomac River near Washington DC (Little Falls)');
  assert.equal(brkm2.state, 'MD');
  assert.equal(brkm2.kind, 'stage');
  assert.equal(brkm2.hasForecast, true);
  assert.equal(brkm2.hasThresholds, true);
  assert.deepEqual(brkm2.thresholds, { action: 5, minor: 10, moderate: 12, major: 14 });
  assert.deepEqual(brkm2.observed, {
    stage: 2.78,
    flow: 1810,
    category: 'no_flooding',
    time: Date.parse('2026-11-12T12:45:00Z'),
  });
  assert.equal(brkm2.forecast.stage, 2.8);
  assert.equal(brkm2.forecast.time, Date.parse('2026-11-12T18:00:00Z'));
});

test('a gauge without forecast, one without flood stages', () => {
  const aait2 = gauge('AAIT2');
  assert.equal(aait2.hasForecast, false);
  assert.equal(aait2.hasThresholds, true);
  assert.equal(aait2.thresholds.action, null, '-9999 is no value');
  assert.equal(aait2.forecast.time, null, 'the year 1 is no time');
  assert.equal(aait2.forecast.stage, null);
  const aamc1 = gauge('AAMC1');
  assert.equal(aamc1.hasThresholds, false);
  assert.equal(aamc1.observed.flow, null);
  assert.equal(aamc1.observed.category, 'not_defined');
  assert.equal(aamc1.name, 'San Francisco Bay Alameda tide gage', 'spaces collapsed');
});

test('a gauge forecast by flow: flow first, stage as secondary value, flood flows', () => {
  const alfw1 = gauge('ALFW1');
  assert.equal(alfw1.kind, 'flow');
  assert.equal(alfw1.observed.flow, 16300);
  assert.equal(alfw1.observed.stage, 2034.4);
  assert.equal(alfw1.thresholds.minor, 95000);
  assert.equal(Math.round(alfw1.forecast.flow), 12252);
});

test('the categories rank from no flooding to major; the others have no rank', () => {
  assert.deepEqual(
    ['no_flooding', 'action', 'minor', 'moderate', 'major', 'low_threshold'].map(categoryRank),
    [0, 1, 2, 3, 4, 0],
  );
  for (const other of ['not_defined', 'obs_not_current', 'fcst_not_current', 'out_of_service']) {
    assert.equal(categoryRank(other), null);
  }
});

test('the client: an unknown code is null, a down API throws', async () => {
  const api = createApi();
  const client = new NwpsClient({ fetch: api.fetch });
  assert.equal(await client.gauge('ZZZZ9'), null);
  assert.equal((await client.gauge('BRKM2')).code, 'BRKM2');
  api.down = 503;
  await assert.rejects(client.gauge('BRKM2'), /HTTP 503/);
  api.down = 'network';
  await assert.rejects(client.gauge('BRKM2'), /fetch failed/);
});

test('the box query is the one the NWPS documents', async () => {
  const api = createApi();
  const client = new NwpsClient({ fetch: api.fetch });
  const gauges = await client.gaugesInBox([-77.3, 38.8, -77, 39.1]);
  assert.ok(gauges.length > 10);
  const url = api.requests.at(-1);
  assert.equal(url.searchParams.get('bbox.xmin'), '-77.3');
  assert.equal(url.searchParams.get('srid'), 'EPSG_4326');
});
