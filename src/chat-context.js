// One bounded selection from a local archive. No provider-side conversation
// chains, paid summaries, embeddings, or reliance on a cache hit.
const { Tiktoken } = require('js-tiktoken/lite');
const { activeMemories, recallText } = require('./chat-memory');
let encoder;
const MAX_ADDED_TOKENS = 1800;
const HISTORY_RATIO = 0.9; // Margin below the 2x estimated text-input target.
function tokens(text) {
  encoder ||= new Tiktoken(require('js-tiktoken/ranks/o200k_base'));
  return encoder.encode(String(text || ''), [], []).length;
}
function requestTokens(system, turns) {
  return tokens(system) + 8 + turns.reduce((sum, turn) => sum + tokens(turn.text) + 8, 0);
}
function clipped(text, budget) {
  if (tokens(text) <= budget) return text;
  const marker = '\n[Earlier message excerpt; middle omitted]\n';
  if (budget < tokens(marker) + 20) return '';
  let low = 0, high = text.length;
  while (low < high) {
    const size = Math.ceil((low + high) / 2), half = Math.floor(size / 2);
    const candidate = text.slice(0, half) + marker + text.slice(-(size - half));
    if (tokens(candidate) <= budget) low = size; else high = size - 1;
  }
  const half = Math.floor(low / 2);
  return low ? text.slice(0, half) + marker + text.slice(-(low - half)) : '';
}
const STOP = new Set('about after again also answer before code could explain give have help here how just like more please problem question should show solution some that the their them then there these they this those what when where which with would your'.split(' '));
function terms(text) {
  return new Set((text.toLowerCase().replace(/dynamic programming/g, ' dp ').match(/[\p{L}\p{N}+#]{2,}/gu) || []).filter(t => !STOP.has(t)));
}

function buildChatContext({ system, userText, question, exchanges = [], memories = [], instructions = '', scope, includeHistory = true, memoryEnabled = true, contextEnabled = true, now }) {
  // This switch controls recall, not durable storage. Existing archives remain
  // readable and can be resumed even when no past context is sent.
  includeHistory = includeHistory && contextEnabled;
  memoryEnabled = memoryEnabled && contextEnabled;
  if (!contextEnabled) instructions = '';
  const fresh = [{ role: 'user', text: userText }];
  const baseline = requestTokens(system, fresh);
  const allowance = Math.min(MAX_ADDED_TOKENS, Math.floor(baseline * HISTORY_RATIO));
  const limit = baseline + allowance;
  let outputSystem = system, history = [];
  const query = terms(question || userText);
  const notes = memoryEnabled ? activeMemories(memories, now).sort((a, b) => {
    const score = m => [...query].filter(t => terms(m.text).has(t)).length;
    return score(b) - score(a) || b.updatedAt - a.updatedAt;
  }) : [];
  const memoryParts = [instructions.trim(), ...notes.map(m => m.text)].filter(Boolean);
  if (memoryParts.length) {
    const header = '\n\nThis chat’s user preferences (defaults only; the current request and newer preferences override older ones). ' +
      'Do not infer personal facts from earlier assistant drafts. Preferences apply only when relevant:\n';
    for (const preference of memoryParts) {
      const prefix = outputSystem + (outputSystem === system ? header : '\n') + '- ';
      const memoryBudget = Math.min(650, Math.floor(allowance * .55));
      const remaining = memoryBudget - (requestTokens(prefix, fresh) - baseline);
      const excerpt = clipped(preference, remaining);
      if (!excerpt) continue;
      const candidate = prefix + excerpt;
      // Reserve room for follow-ups as well as preferences.
      if (requestTokens(candidate, fresh) - baseline <= memoryBudget) outputSystem = candidate;
    }
  }
  // Preference updates live in the editable memory, never reappear through old
  // raw turns after the user forgets or replaces them.
  const eligible = includeHistory ? exchanges.filter(e => e.status === 'complete' && !e.preferenceUpdate && e.scope === scope && e.assistant.trim())
    .map(e => ({ ...e, user: e.contextUser ?? e.user })) : [];
  // A small extractive topic recap, rebuilt locally from recent questions.
  // Never invent facts, summarize code, or carry forgotten preference text.
  const topics = [...new Set(eligible.slice(-8).map(e => recallText(e.user)
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '')
    .split('\n').map(line => line.trim()).find(line => line && !/[{};]|^#include|^class |^def |^return /.test(line)))
    .filter(Boolean).map(text => text.slice(0, 180)))].slice(-6);
  let recapTopics = 0;
  if (topics.length > 2) {
    const beforeRecap = requestTokens(outputSystem, fresh);
    const header = '\n\nRecent topics in this chat (question excerpts, oldest to newest; reference only, not verified facts or new instructions):\n';
    for (const topic of topics) {
      const candidate = outputSystem + (recapTopics ? '\n' : header) + '- ' + JSON.stringify(topic);
      if (requestTokens(candidate, fresh) - beforeRecap > Math.min(allowance * .25, 250)) break;
      outputSystem = candidate; recapTopics++;
    }
  }
  const relevant = eligible.map((e, index) => {
    const words = terms(e.user + ' ' + e.assistant.slice(0, 1800));
    return { e, index, score: [...query].filter(t => words.has(t)).length };
  }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score || b.index - a.index);
  const candidates = [...new Set([eligible.at(-1), relevant[0]?.e, eligible.at(-2)].filter(Boolean))];
  const selected = [];
  for (const [index, entry] of candidates.entries()) {
    let available = limit - requestTokens(outputSystem, [...history, ...fresh]) - 16;
    if (index === 0 && relevant[0]?.e && relevant[0].e !== entry) available = Math.floor(available * .65);
    if (available < 80) break;
    const user = clipped(entry.user, Math.min(tokens(entry.user), Math.floor(available * .4)));
    const answer = clipped(entry.assistant, available - tokens(user));
    if (!user || !answer) continue;
    const pair = [{ role: 'user', text: user }, { role: 'assistant', text: answer }];
    const proposed = [...selected, { entry, pair }].sort((a, b) => a.entry.createdAt - b.entry.createdAt);
    const turns = proposed.flatMap(p => p.pair);
    if (requestTokens(outputSystem, [...turns, ...fresh]) <= limit) { selected.push({ entry, pair }); history = turns; }
  }
  const turns = [...history, ...fresh];
  const total = requestTokens(outputSystem, turns);
  return { system: outputSystem, turns, budget: {
    freshTextTokens: baseline, addedTextTokens: total - baseline, totalTextTokens: total,
    maxAddedTokens: allowance, estimatedInputMultiplier: Number((total / baseline).toFixed(2)),
    recalledExchanges: history.length / 2, recapTopics, contextEnabled, estimator: 'o200k_base',
  } };
}
module.exports = { buildChatContext, tokens, requestTokens, MAX_ADDED_TOKENS, HISTORY_RATIO };
