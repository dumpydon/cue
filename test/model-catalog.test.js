const test = require('node:test');
const assert = require('node:assert/strict');
const { createModelCatalog } = require('../src/model-catalog');

test('model discovery includes compatible future releases and omits unrelated or retired models', async () => {
  const catalog = createModelCatalog({ now: () => Date.UTC(2026,9,18), listModels: async () => [
    {id:'gpt-6.1-sol'}, {id:'gpt-6.2-sol'}, {id:'gpt-6-luna'}, {id:'gpt-image-1'}, {id:'gpt-realtime'},
    {id:'gpt-5.6-sol',shutdown_date:'2026-01-01'}, {id:'gpt-6.2-sol'}
  ] });
  const result = await catalog.get({apiKey:'test-key'});
  assert.equal(result.live, true);
  assert.deepEqual(result.models.map(item => item.id), ['gpt-6.1-sol','gpt-6-luna','gpt-6.2-sol']);
});

test('defaults work without a key and failures cannot expose credentials', async () => {
  let calls = 0;
  const catalog = createModelCatalog({ listModels: async () => { calls++; throw Object.assign(new Error('Secret test-key'), {status:403}); } });
  const offline = await catalog.get();
  assert.equal(offline.models.length, 7); assert.equal(calls, 0);
  const failure = await catalog.get({apiKey:'test-key'});
  assert.equal(failure.models.length, 7); assert.match(failure.message, /cannot list models/);
  assert.doesNotMatch(JSON.stringify(failure), /test-key/);
});

test('concurrent refreshes share one request and forced refresh or changed keys bypass cache', async () => {
  let calls = 0, time = 0;
  const catalog = createModelCatalog({ now: () => time, ttlMs: 100, listModels: async () => { calls++; return [{id:'gpt-6-luna'}]; } });
  await Promise.all([catalog.get({apiKey:'a'}), catalog.get({apiKey:'a'})]);
  assert.equal(calls, 1);
  await catalog.get({apiKey:'a'}); assert.equal(calls, 1);
  await catalog.get({apiKey:'a',force:true}); assert.equal(calls, 2);
  await catalog.get({apiKey:'b'}); assert.equal(calls, 3);
  time = 200; await catalog.get({apiKey:'b'}); assert.equal(calls, 4);
});

test('an old account response cannot overwrite the newer account cache', async () => {
  let finishFirst, calls = 0;
  const catalog = createModelCatalog({ listModels: key => {
    calls++;
    return key === 'a' ? new Promise(resolve => {finishFirst=resolve;}) : Promise.resolve([{id:'gpt-6-luna'}]);
  } });
  const first = catalog.get({apiKey:'a'});
  await catalog.get({apiKey:'b'});
  finishFirst([{id:'gpt-6-sol'}]); await first;
  assert.deepEqual((await catalog.get({apiKey:'b'})).models.map(item => item.id), ['gpt-6-luna']);
  assert.equal(calls, 2);
});
