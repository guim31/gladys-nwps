// The `gauges` widget: content within the core vocabulary and budget
// (validateWidgetContent: an empty array = rendered as sent), every bound
// feature existing on the device, texts localized, units of the request.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ALFW1, APAM2, ARCF1, BRKM2, create, createWorld } from './helpers/world.js';

const get = async (world, settings, language = 'en', units = 'us') => {
  const ack = await world.fake.widgetGet('gauges', { settings, language, units });
  assert.equal(ack.success, true);
  return ack.data.content;
};

test('without any created gauge, the widget says what to do', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => world.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const content = await get(world, {}, language);
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].variant, 'body');
  }
});

test('the overview: one line per gauge, a heading on flooding, the button can be hidden', async (t) => {
  const world = await createWorld({ config: { gauges: `${BRKM2},${APAM2},${ARCF1}` } });
  t.after(() => world.app.stop());
  for (const code of [BRKM2, APAM2, ARCF1]) {
    await create(world, code);
  }
  const content = await get(world, {});
  assert.deepEqual(validateWidgetContent(content), []);
  const [heading, status] = content.components;
  assert.equal(heading.text, 'Flooding: Minor flooding');
  assert.deepEqual(
    status.items.map((item) => [item.value, item.color]),
    [
      ['2.78 ft · No flooding', 'success'],
      ['2.02 ft · Action stage', 'warning'],
      ['11.97 ft · Minor flooding', 'warning'],
    ],
  );
  const metric = await get(world, { show_link: false }, 'fr', 'metric');
  assert.equal(metric.components[1].items[0].value, '0,85 m · Pas de crue');
  assert.equal(metric.components.filter((c) => c.type === 'button').length, 0);
});

test('one gauge: live tiles bound to its features, category, crest, flood stage', async (t) => {
  const world = await createWorld({ config: { gauges: `${APAM2},${ALFW1}` } });
  t.after(() => world.app.stop());
  for (const code of [APAM2, ALFW1]) {
    const device = await create(world, code);
    for (const language of ['en', 'fr', 'de', 'es']) {
      const content = await get(world, { gauge: device.external_id }, language);
      assert.deepEqual(validateWidgetContent(content), [], `${code} ${language}`);
      const ids = new Set(device.features.map((f) => f.external_id));
      for (const tile of content.components.filter((c) => c.device_feature)) {
        assert.ok(ids.has(tile.device_feature), `${code}: ${tile.device_feature}`);
      }
    }
  }
  const apam2 = world.fake.devices.find((d) => d.external_id.endsWith(':APAM2'));
  const content = await get(world, { gauge: apam2.external_id });
  const items = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.map((item) => [item.label, item.value]),
    [
      ['Category', 'Action stage'],
      ['Forecast crest', '2.7 ft · 11/12, 06:00 PM'],
      ['Forecast category', 'Minor flooding'],
      ['Flood stage', '2.6 ft'],
      ['Last reading', '11/12, 07:54 AM'],
    ],
  );
  const link = content.components.find((c) => c.type === 'button');
  assert.equal(link.link.url, 'https://water.noaa.gov/gauges/apam2');
});

test('the widget shows the name given in Gladys, and a removed gauge says so', async (t) => {
  const world = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => world.app.stop());
  const device = await create(world, BRKM2);
  await world.fake.deviceUpdated({ ...device, name: 'Potomac' });
  const content = await get(world, {});
  assert.equal(content.components.find((c) => c.type === 'status').items[0].label, 'Potomac');
  await world.fake.deviceDeleted({ ...device, name: 'Potomac' });
  const gone = await get(world, { gauge: device.external_id });
  assert.equal(gone.components[0].text, 'This gauge is no longer followed.');
});

test('the flow tile says cfs in US units, and only features of the device get a tile', async (t) => {
  const world = await createWorld({ config: { gauges: APAM2 } });
  t.after(() => world.app.stop());
  const device = await create(world, APAM2);
  // A flow reading appears after creation: no feature, so no tile.
  world.api.set(APAM2, 'observed', { secondary: 1.2, secondaryUnit: 'kcfs' });
  await world.monitor.refresh();
  const content = await get(world, { gauge: device.external_id });
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => c.label),
    ['Water level'],
  );
  const other = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => other.app.stop());
  const brkm2 = await create(other, BRKM2);
  const tiles = (await get(other, { gauge: brkm2.external_id })).components.filter(
    (c) => c.type === 'value',
  );
  assert.deepEqual(
    tiles.map((c) => c.label),
    ['Water level', 'Flow (cfs)'],
  );
});
