// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_CONFIG,
  HOME_RADII,
  LANGUAGES,
  REFRESH_INTERVALS,
  UNIT_SYSTEMS,
} from '../src/config.js';
import { TRIGGER_KEY, WIDGET_KEY } from '../src/monitor.js';
import { SEARCH_RADII } from '../src/search.js';
import { WIDGETS } from '../src/widgets.js';
import { BRKM2, create, createWorld, cycle } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...manifest.config_schema,
  ...[...(manifest.actions ?? []), ...(manifest.scene_triggers ?? [])].flatMap(
    (item) => item.fields ?? [],
  ),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}
const atLeast = (version, required) => {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
};

test('identity: name, image, cover, cloud transport, environment category, US', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.docker_image, `ghcr.io/guim31/gladys-nwps:${manifest.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-nwps/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment']);
  assert.deepEqual(manifest.countries, ['US']);
  assert.equal(manifest.location, true, '"around my house" reads the house location');
});

test('Gladys 5.3.2 at least: the m³/s unit (and countries, keywords, widgets, triggers)', () => {
  assert.ok(atLeast(minGladysVersion(), [5, 3, 2]), manifest.gladys_version);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), handlerKeys('action:').sort());
});

test('no scene action: the states and the trigger cover the use', () => {
  assert.equal(manifest.scene_actions, undefined);
});

test('the scene trigger the monitor fires is declared, with its filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGER_KEY]);
  const [trigger] = manifest.scene_triggers;
  const world = await createWorld({ config: { gauges: BRKM2 } });
  t.after(() => world.app.stop());
  await create(world, BRKM2);
  world.api.set(BRKM2, 'observed', { floodCategory: 'major' });
  await cycle(world);
  const [event] = world.fake.sceneEvents;
  const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
  assert.deepEqual(Object.keys(event.data).sort(), declared.sort());
  assert.ok(
    optionValues(field(trigger.fields, 'category')).includes(event.data.category),
    'the category filter has the value sent',
  );
  assert.deepEqual(optionValues(field(trigger.fields, 'source')), ['observed', 'forecast']);
});

test('every widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('config_schema defaults and options are the ones of the code', () => {
  const stored = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(stored).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const entry of stored) {
    if (entry.default !== undefined) {
      assert.equal(entry.default, DEFAULT_CONFIG[entry.key], entry.key);
    }
  }
  const options = (key) => optionValues(field(manifest.config_schema, key));
  assert.deepEqual(options('around_home'), HOME_RADII);
  assert.deepEqual(options('units'), UNIT_SYSTEMS);
  assert.deepEqual(options('refresh_interval'), REFRESH_INTERVALS);
  assert.deepEqual(options('language'), LANGUAGES);
  assert.deepEqual(optionValues(field(manifest.actions[0].fields, 'radius')), SEARCH_RADII);
});

test('dynamic selects declare their source, no static options and no default', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length >= 3);
  for (const entry of dynamic) {
    assert.ok(['devices', 'houses'].includes(entry.source), entry.key);
    assert.equal(entry.options, undefined, entry.key);
    assert.equal(entry.default, undefined, entry.key);
  }
});

test('actions: no secret field, no default, no required field (the core applies no default)', () => {
  for (const action of manifest.actions) {
    for (const entry of action.fields ?? []) {
      assert.notEqual(entry.type, 'secret');
      assert.equal(entry.default, undefined);
      assert.notEqual(entry.required, true);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
