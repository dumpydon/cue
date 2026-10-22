const test = require('node:test');
const assert = require('node:assert/strict');
const { questionTranscript, formatTranscript, responseTokenBudget } = require('../src/response-context');
const { MODES } = require('../src/prompts');
const { detectCategory, buildInterviewContext } = require('../src/interview-context');

const transcript = [
  { channel: 'them', text: 'Tell me about a time you improved reliability.' },
  { channel: 'you', text: 'We used a Redis queue, with a 30-second retry delay. I did not build the queue.' },
  { channel: 'them', text: 'Why that delay?' },
  { channel: 'you', text: 'It left enough time for the upstream service to recover.' },
  { channel: 'them', text: 'What are your salary expectations?' },
];

test('selected audio follow-ups retain their referent and exclude later questions', () => {
  const selected = questionTranscript(transcript, 'Why that delay?');
  assert.equal(selected.length, 3);
  const prompt = MODES.answerThis.build({ transcript, userText: 'Why that delay?' });
  assert.match(prompt, /Redis queue, with a 30-second retry delay/);
  assert.match(prompt, /I did not build the queue/);
  assert.doesNotMatch(prompt, /salary expectations|upstream service/);
  assert.match(prompt, /"Why that delay\?"/);
});

test('speech composer questions spanning chunks anchor before subsequent conversation', () => {
  const speech = [
    { channel: 'you', text: 'The service runs on one server.' },
    { channel: 'them', text: 'How would you design' },
    { channel: 'them', text: 'a distributed cache?' },
    { channel: 'them', text: 'What is your notice period?' },
  ];
  assert.deepEqual(questionTranscript(speech, ' How would you design  a distributed cache? '), speech.slice(0, 3));
});

test('new technical and compensation questions supersede earlier behavioral topics', () => {
  assert.equal(detectCategory(transcript), 'compensation');
  assert.equal(detectCategory([...transcript, { channel: 'them', text: 'Explain the difference between a queue and a stack.' }]), 'technical');
  assert.equal(detectCategory(transcript, 'Why do you want to work here?'), 'motivation');
  assert.equal(detectCategory(transcript, 'Which fruit do you prefer?'), 'general');
  const context = buildInterviewContext({ whyCompany: 'Their accessibility work.', salaryTarget: '$100k' }, 'answerThis', transcript, 'Why do you want to work here?');
  assert.match(context, /Their accessibility work/);
  assert.doesNotMatch(context, /Salary Target/);
});

test('short contextual follow-ups inherit the nearest relevant topic', () => {
  assert.equal(detectCategory(questionTranscript(transcript, 'Why that delay?'), 'Why that delay?'), 'behavioral');
  assert.equal(detectCategory([{ channel: 'them', text: 'How would you design a distributed cache?' }, { channel: 'them', text: 'Why?' }]), 'technical');
});

test('category detection joins unfinished speech chunks but not old completed questions', () => {
  assert.equal(detectCategory([
    { channel: 'them', text: 'How would you design' },
    { channel: 'them', text: 'a distributed cache?' },
  ]), 'technical');
  assert.equal(detectCategory([
    { channel: 'them', text: 'Tell me about a time you failed.' },
    { channel: 'them', text: 'What hobbies do you enjoy?' },
  ]), 'general');
});

test('live speech remains labelled provisional, with speaker attribution and bounded context', () => {
  const speech = [...Array.from({ length: 50 }, (_, index) => ({ channel: 'you', text: `Earlier ${index}: ` + 'x'.repeat(500) })),
    { channel: 'them', text: 'Please solve this without sorting.', partial: true }];
  const prompt = formatTranscript(speech, 16, 4000);
  assert.match(prompt, /Them \(still speaking; provisional\): Please solve this without sorting\./);
  assert.match(prompt, /Earlier conversation omitted/);
  assert.ok(prompt.length < 4100);
  assert.doesNotMatch(prompt, /Earlier 0:/);
  assert.equal(formatTranscript([null, { channel: 'invalid', text: 'bad' }, { channel: 'you', text: '  ' }]), '');
});

test('spoken modes require actual speech and prompts distinguish generated drafts from facts', () => {
  assert.equal(MODES.say.transcriptRequired, true);
  for (const name of ['ask', 'say', 'assist', 'answerThis']) {
    const system = MODES[name].buildSystem(null, '');
    assert.match(system, /Earlier assistant messages are suggested drafts/);
    assert.match(system, /do not invent a polished story/);
    assert.match(system, /still speaking is provisional/);
  }
});

test('coding and detailed requests have room for complete answers while spoken replies remain concise', () => {
  assert.ok(responseTokenBudget('leetcode', false) >= 4096);
  assert.ok(responseTokenBudget('ask', false) > 700);
  assert.ok(responseTokenBudget('say', false) < responseTokenBudget('ask', false));
  assert.ok(responseTokenBudget('leetcode', true) > responseTokenBudget('leetcode', false));
});
