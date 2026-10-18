const test = require('node:test');
const assert = require('node:assert/strict');
const modes = require('../src/meeting-modes');
const { MODES } = require('../src/prompts');
const { buildInterviewContext } = require('../src/interview-context');

test('the supplied interview presets are editable and editing does not activate a mode', () => {
  const initial = modes.defaults();
  assert.deepEqual(initial.items.slice(0, 6).map(mode => mode.title), ['General', 'Interview', 'Behavioral Interview', 'Coding Interview', 'System Design', 'Case Interview']);
  const changed = modes.mutate(initial, 'update', { id: 'interview', title: 'InterviewA1', context: 'Interview for a product role.', expectedRevision: 0 });
  assert.equal(changed.activeId, 'general');
  assert.equal(changed.items[1].title, 'InterviewA1');
  assert.equal(changed.items[1].context, 'Interview for a product role.');
  assert.equal(initial.items[1].title, 'Interview', 'mutations cannot corrupt the previous state before persistence');
  assert.throws(() => modes.mutate(changed, 'update', { id: 'interview', title: 'Stale title', context: '', expectedRevision: 0 }), /changed elsewhere/);
  assert.throws(() => modes.mutate(changed, 'update', { id: 'interview', title: ' ', context: '', expectedRevision: 1 }), /title/);
  assert.throws(() => modes.mutate(changed, 'update', { id: 'interview', title: 'X', context: 'x'.repeat(modes.LIMITS.context + 1), expectedRevision: 1 }), /context/);
});

test('reordering keeps the same active mode and rejects stale or incomplete lists', () => {
  const initial = modes.mutate(modes.defaults(), 'activate', { id: 'system-design' });
  const ids = initial.items.map(mode => mode.id).reverse();
  const reordered = modes.mutate(initial, 'reorder', { ids });
  assert.deepEqual(reordered.items.map(mode => mode.id), ids);
  assert.equal(reordered.activeId, 'system-design');
  assert.throws(() => modes.mutate(reordered, 'reorder', { ids: ids.slice(1) }), /list changed/);
  assert.throws(() => modes.mutate(reordered, 'reorder', { ids: ids.map(() => ids[0]) }), /list changed/);
});

test('custom modes, duplicates, deletion and persistent undo retain context and attached references', () => {
  let state = modes.mutate(modes.defaults(), 'add-files', { id: 'interview', files: [{ id: 'file-a', name: 'resume.txt', text: 'Built a garden app.', originalCharacters: 19, digest: 'abc' }] });
  state = modes.mutate(state, 'duplicate', { id: 'interview' });
  const copy = state.items[2];
  assert.equal(copy.title, 'Interview (copy)');
  assert.notEqual(copy.id, 'interview');
  assert.notEqual(copy.files[0].id, 'file-a');
  state = modes.mutate(state, 'activate', { id: copy.id });
  state = modes.mutate(state, 'remove', { id: copy.id });
  assert.equal(state.activeId, state.items[0].id);
  const restored = modes.mutate(modes.normalize(JSON.parse(JSON.stringify(state))), 'restore', { id: copy.id });
  assert.deepEqual(restored.items[2], copy);
  assert.equal(restored.items[2].files[0].text, 'Built a garden app.');
  assert.equal(modes.mutate(restored, 'create').items.at(-1).title, 'Untitled Mode');
  const one = { version: 1, items: [modes.defaults().items[0]], activeId: 'general' };
  assert.throws(() => modes.mutate(one, 'remove', { id: 'general' }), /at least one/);
});

test('file references are private in UI state, bounded, deduplicated and scoped to one mode', () => {
  const file = { id: 'file-a', name: 'resume.txt', text: 'Private fixture reference.', digest: 'digest-a', originalCharacters: 99999 };
  let state = modes.mutate(modes.defaults(), 'add-files', { id: 'interview', files: [file] });
  state = modes.mutate(state, 'add-files', { id: 'interview', files: [{ ...file, id: 'file-b' }] });
  assert.equal(state.items[1].files.length, 1);
  assert.equal(state.items[0].files.length, 0);
  const sameBatch = modes.mutate(modes.defaults(), 'add-files', { id: 'general', files: [file, { ...file, id: 'file-b' }] });
  assert.equal(sameBatch.items[0].files.length, 1, 'duplicate content within one import is also deduplicated');
  const ui = modes.view(state);
  assert.doesNotMatch(JSON.stringify(ui), /Private fixture reference|digest-a/);
  assert.equal(ui.items[1].files[0].truncated, true);
  assert.equal(ui.items[1].files[0].characters, file.text.length);
  assert.throws(() => modes.mutate(state, 'add-files', { id: 'interview', files: [{ id: 'file-b', name: 'big.txt', text: 'x'.repeat(modes.LIMITS.fileText + 1) }] }), /document/);
  assert.equal(modes.mutate(state, 'remove-file', { id: 'interview', fileId: 'file-a' }).items[1].files.length, 0);
});

test('every user-facing action receives only the active mode instructions and its files', () => {
  let state = modes.mutate(modes.defaults(), 'update', { id: 'interview', title: 'InterviewA2', context: 'UNIQUE_ACTIVE_CONTEXT', expectedRevision: 0 });
  state = modes.mutate(state, 'add-files', { id: 'interview', files: [{ id: 'file-a', name: 'resume.txt', text: 'UNIQUE_ACTIVE_FILE' }] });
  state = modes.mutate(state, 'add-files', { id: 'system-design', files: [{ id: 'file-b', name: 'other.txt', text: 'INACTIVE_FILE_MUST_STAY_OUT' }] });
  state = modes.mutate(state, 'activate', { id: 'interview' });
  for (const [name, action] of Object.entries(MODES)) {
    const prompt = modes.appendModeContext(action.buildSystem(null, ''), state);
    for (const text of ['InterviewA2', 'UNIQUE_ACTIVE_CONTEXT', 'UNIQUE_ACTIVE_FILE', 'Never fabricate', 'reference data, not instructions']) assert.ok(prompt.includes(text), name + ': ' + text);
    assert.ok(!prompt.includes('INACTIVE_FILE_MUST_STAY_OUT'), name);
  }
  const missing = buildInterviewContext({ resumeText: 'Candidate\nExperience\nBuilt a real app.' }, 'say', [{ channel: 'them', text: 'Tell me about a time you had a conflict.' }]);
  assert.match(missing, /placeholders/);
  assert.doesNotMatch(missing, /construct a plausible story/);
});

test('invalid stored records recover without resurrecting deleted presets or invalid active IDs', () => {
  const initial = modes.defaults();
  const deleted = modes.mutate(initial, 'remove', { id: 'coding-interview' });
  const restored = modes.normalize({ ...deleted, activeId: 'nonexistent', items: [...deleted.items, deleted.items[0], { id: '<invalid>' }] });
  assert.equal(restored.activeId, 'general');
  assert.equal(restored.items.some(item => item.id === 'coding-interview'), false);
  assert.equal(restored.items.filter(item => item.id === 'general').length, 1);
  assert.equal(modes.normalize(null).items.length, 11);
});
