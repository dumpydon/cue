const test = require('node:test');
const assert = require('node:assert/strict');
const { createResponseThread, responseScope } = require('../src/response-thread');

test('typed follow-ups retain completed turns in order without shared references', () => {
  const thread = createResponseThread();
  const version = thread.prepare('interview');
  thread.commit(version, 'Explain retries.', 'Use bounded exponential backoff.');
  const turns = thread.turns('Give me an example.');
  assert.deepEqual(turns.map(turn => turn.role), ['user', 'assistant', 'user']);
  assert.equal(turns[1].text, 'Use bounded exponential backoff.');
  turns[1].text = 'mutated';
  assert.equal(thread.turns('Again')[1].text, 'Use bounded exponential backoff.');
  assert.equal(thread.turns('Recap', false).length, 1);
});

test('reset and context changes reject stale completions and clear earlier answers', () => {
  const thread = createResponseThread();
  const first = thread.prepare('first');
  thread.commit(first, 'First question', 'First answer');
  thread.reset();
  assert.equal(thread.isCurrent(first), false);
  assert.equal(thread.commit(first, 'Pending question', 'Late answer'), false);
  assert.equal(thread.turns('New question').length, 1);
  const second = thread.prepare('first');
  thread.commit(second, 'Fresh question', 'Fresh answer');
  thread.prepare('other-mode');
  assert.equal(thread.turns('Different context').length, 1);
});

test('history is bounded in complete pairs and omits empty answers', () => {
  const thread = createResponseThread({ maxExchanges: 3, maxChars: 1000 });
  const version = thread.prepare('test');
  assert.equal(thread.commit(version, 'Bad request', '  '), false);
  for (let index = 0; index < 20; index++) thread.commit(version, 'Question ' + index, 'Answer ' + index + 'x'.repeat(200));
  const history = thread.turns('Follow up').slice(0, -1);
  assert.equal(history.length, 6);
  assert.match(history[0].text, /Question 17/);
  assert.ok(history.reduce((sum, turn) => sum + turn.text.length, 0) <= 1000);
});

test('scope reacts to active context changes, not unrelated provider or display preferences', () => {
  const settings = { meetingModes: { activeId: 'interview', items: [{ id: 'interview', context: 'Garden app', files: [] }, { id: 'other', context: 'Other' }] }, resumeText: 'Resume' };
  const key = responseScope(settings);
  assert.equal(responseScope({ ...settings, smart: true, provider: 'anthropic', opacity: .5 }), key);
  assert.notEqual(responseScope({ ...settings, resumeText: 'Changed background' }), key);
  const changed = structuredClone(settings); changed.meetingModes.items[0].context = 'Changed project';
  assert.notEqual(responseScope(changed), key);
  const unrelated = structuredClone(settings); unrelated.meetingModes.items[1].context = 'Inactive edit';
  assert.equal(responseScope(unrelated), key);
});
