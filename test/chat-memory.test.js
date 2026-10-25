const test = require('node:test');
const assert = require('node:assert/strict');
const { learnPreferences, activeMemories, MEMORY_TTL_MS } = require('../src/chat-memory');

test('explicit DP preference survives intervening graph questions; newest replaces older style', () => {
  let memory = learnPreferences([], 'I prefer DP questions in recursive form with memoization.', 'dp', 1000);
  for (let i=0; i<50; i++) memory = learnPreferences(memory, `Solve graph problem ${i} using BFS.`, 'graph'+i, 2000+i);
  assert.equal(memory.length,1); assert.match(memory[0].text,/recursive/);
  memory = learnPreferences(memory, 'Actually, I prefer bottom-up tabulation for DP questions.', 'new', 3000);
  assert.equal(memory.length,1); assert.match(memory[0].text,/bottom-up/); assert.equal(memory[0].sourceId,'new');
  assert.doesNotMatch(JSON.stringify(memory),/recursive/);
});
test('never learns from fenced code, block quotes, transient requests, credentials or assistant text', () => {
  for (const text of ['```\nI prefer Python.\n```', '> I prefer recursion.', '    I prefer recursion.', 'I prefer Python for this question.', 'I prefer my api key sk-abcd1234.', 'The interviewer said "I prefer Java."', 'Does the user prefer Python?']) {
    assert.deepEqual(learnPreferences([],text,'source',1000),[],text);
  }
});
test('forget and expiry remove preferences; manually saved instructions remain under user control', () => {
  let memory=learnPreferences([], 'I prefer Python.\nI prefer recursive DP.', 'one',1000);
  memory=learnPreferences(memory,'Forget my preference about DP.','two',2000);
  assert.equal(memory.length,1); assert.match(memory[0].text,/Python/);
  assert.deepEqual(learnPreferences(memory,'Forget all my preferences.','three',3000),[]);
  assert.equal(activeMemories(memory,1001+MEMORY_TTL_MS).length,0);
  assert.equal(activeMemories([{...memory[0],manual:true}],1001+MEMORY_TTL_MS).length,1);
});
