import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, gaugeCodeOf, normalizeConfig, parseGaugeCodes } from '../src/config.js';

test('a gauge code is read from a code or a water.noaa.gov address', () => {
  assert.equal(gaugeCodeOf('BRKM2'), 'BRKM2');
  assert.equal(gaugeCodeOf('brkm2'), 'BRKM2');
  assert.equal(gaugeCodeOf('https://water.noaa.gov/gauges/brkm2'), 'BRKM2');
  assert.equal(gaugeCodeOf('https://water.noaa.gov/gauges/ARCF1?x=1'), 'ARCF1');
  assert.equal(gaugeCodeOf('01646500'), null, 'a USGS site number is not a NWS code');
  assert.equal(gaugeCodeOf('BRK2'), null);
});

test('codes are split on commas, spaces and semicolons, deduplicated, the rest is invalid', () => {
  assert.deepEqual(parseGaugeCodes('BRKM2, arcf1;BRKM2  hello'), {
    codes: ['BRKM2', 'ARCF1'],
    invalid: ['hello'],
  });
});

test('the normalized defaults are the manifest defaults', () => {
  assert.deepEqual(normalizeConfig({}), {
    gaugeCodes: [],
    invalid: [],
    houseSelector: null,
    homeRadiusMiles: 0,
    units: DEFAULT_CONFIG.units,
    refreshMinutes: 15,
    language: 'fr',
  });
  const config = normalizeConfig({
    gauges: 'BRKM2',
    house: ' home ',
    around_home: '25',
    units: 'metric',
    refresh_interval: '30',
    language: 'es',
  });
  assert.equal(config.houseSelector, 'home');
  assert.equal(config.homeRadiusMiles, 25);
  assert.equal(config.units, 'metric');
  assert.equal(config.refreshMinutes, 30);
  assert.equal(config.language, 'es');
  assert.equal(normalizeConfig({ around_home: '7', units: 'si' }).homeRadiusMiles, 0);
  assert.equal(normalizeConfig(null).units, 'us');
});
