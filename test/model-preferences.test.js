const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/model-preferences');

test('friendly GPT names map to API IDs while custom provider identifiers stay exact', () => {
  assert.equal(models.normalizeId('openai', 'GPT-6 Soul'), 'gpt-6-sol');
  assert.equal(models.normalizeId('openai', 'GPT 6.2 Sol'), 'gpt-6.2-sol');
  assert.equal(models.normalizeId('openai', 'GPT-4o-mini'), 'gpt-4o-mini');
  assert.equal(models.normalizeId('custom', 'Tenant/Model-ABC'), 'Tenant/Model-ABC');
  for (const input of ['', null, 'bad\nmodel', 'x'.repeat(241)]) assert.equal(models.normalizeId('openai', input), '');
});

test('future GPT-6 aliases are discovered without including audio or tool-only models', () => {
  for (const id of ['gpt-6.2-sol','gpt-6-luna','gpt-5.6-terra','gpt-4o-mini','gpt-4.1-mini']) assert.ok(models.discoverable(id), id);
  for (const id of ['gpt-realtime','gpt-image-1','gpt-6-sol-audio','text-embedding-3-small','gpt-5-pro','gpt-6-codex']) assert.equal(models.discoverable(id), false, id);
});

test('saved choices are deduplicated, ranked by usage and isolated by provider', () => {
  let prefs = models.seed({ openai: { fast: 'gpt-6-sol', smart: 'gpt-6-sol' } });
  prefs = models.remember(prefs, 'openai', 'gpt-6-luna', { used: true, now: 1 });
  prefs = models.remember(prefs, 'openai', 'gpt-6-sol', { now: 100 });
  prefs = models.remember(prefs, 'custom', 'gpt-6-luna', { now: 200 });
  assert.deepEqual(models.state(prefs, 'openai').entries.map(item => item.id), ['gpt-6-luna','gpt-6-sol']);
  assert.equal(models.state(prefs, 'custom').entries[0].uses, 0);
  assert.throws(() => models.remember(prefs, '__proto__', 'model'));
});

test('deleting a preset stays effective during use until explicitly re-added', () => {
  let prefs = models.remember(null, 'openai', 'gpt-6-sol');
  prefs = models.forget(prefs, 'openai', 'gpt-6-sol');
  prefs = models.remember(prefs, 'openai', 'gpt-6-sol', { used: true });
  assert.equal(models.state(prefs, 'openai').entries.length, 0);
  assert.deepEqual(models.state(prefs, 'openai').hidden, ['gpt-6-sol']);
  prefs = models.remember(prefs, 'openai', 'gpt-6-sol');
  assert.deepEqual(models.state(prefs, 'openai').hidden, []);
});
