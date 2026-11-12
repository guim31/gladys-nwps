import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';

test('"Find gauges" lists the gauges around the house, nearest first, in four languages', async (t) => {
  const world = await createWorld({});
  t.after(() => world.app.stop());
  const ack = await world.fake.action('search_gauges', { radius: '10' });
  assert.equal(ack.success, true);
  const { message } = ack.data;
  assert.deepEqual(Object.keys(message), ['en', 'fr', 'de', 'es']);
  const lines = message.en.split('\n');
  assert.match(lines[0], /gauge\(s\), nearest first/);
  assert.equal(
    lines[1],
    'BRKM2 — Potomac River near Washington DC (Little Falls), 2.6 mi, No flooding, forecast',
  );
  assert.match(message.fr, /2,6 mi, Pas de crue, prévision/);
});

test('without a located house, or with the API down, the action says why', async (t) => {
  const homeless = await createWorld({ houses: [] });
  t.after(() => homeless.app.stop());
  assert.match((await homeless.fake.action('search_gauges', {})).data.message.en, /No house/);
  const world = await createWorld({});
  t.after(() => world.app.stop());
  world.api.down = 503;
  assert.match((await world.fake.action('search_gauges', {})).data.message.en, /does not answer/);
});
