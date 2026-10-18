const test = require('node:test');
const assert = require('node:assert/strict');
const { createMeetingStore } = require('../src/meetings');
const { listSessions, getSession } = require('../src/session-history');

test('session lists are newest first, compact, and read without changing stored meetings', () => {
  const store = createMeetingStore();
  const first = store.add(), second = store.add();
  store.update(first.id, { startedAt: 100, context: 'private prompt', transcript: [{ text: 'hello', channel: 'you', ts: 105 }] });
  store.update(second.id, { startedAt: 200 });
  const before = JSON.stringify(store.all());
  const list = listSessions(store, second.id);
  assert.deepEqual(list.map(item => item.id), [second.id, first.id]);
  assert.equal(list[0].live, true); assert.equal(list[1].turnCount, 1);
  assert.equal(list[0].transcript, undefined); assert.equal(list[1].context, undefined);
  assert.equal(JSON.stringify(store.all()), before);
});

test('details include notes and transcripts, accept legacy follow-up text and expose no arbitrary fields', () => {
  const store = createMeetingStore(), session = store.add();
  store.update(session.id, { title: '<script>unsafe</script>', followUp: 'Legacy note', actionItems: ['Do this', null], secret: 'not a session field', transcript: [{ channel: 'you', text: '<img onerror=unsafe>', ts: 123 }] });
  const detail = getSession(store, session.id);
  assert.deepEqual(detail.followUp, ['Legacy note']); assert.deepEqual(detail.actionItems, ['Do this']);
  assert.equal(detail.title, '<script>unsafe</script>'); // renderer must use textContent
  assert.equal(detail.secret, undefined); assert.equal(detail.transcript[0].text, '<img onerror=unsafe>');
  detail.transcript[0].text = 'changed'; assert.equal(store.get(session.id).transcript[0].text, '<img onerror=unsafe>');
  for (const id of [null, {}, '../../outside', 'x'.repeat(201)]) assert.equal(getSession(store, id), null);
});

test('empty and capped session history are safe to open', () => {
  assert.deepEqual(listSessions(null), []); assert.equal(getSession(null, 'id'), null);
  const store = createMeetingStore();
  for (let i = 0; i < 60; i++) store.update(store.add().id, { startedAt: i });
  assert.equal(listSessions(store).length, 50); assert.equal(listSessions(store)[0].startedAt, 59);
});
