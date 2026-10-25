// Local, explicit preference extraction. Never learns from assistant answers,
// screenshots, transcripts, quotations or code; no summarization API calls.
const { createHash, randomUUID } = require('node:crypto');
const MAX_MEMORIES = 16;
const MEMORY_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PREFERENCE = /^(?:please )?(?:remember(?: that)?[, :]+)?(?:i (?:now )?(?:prefer|like|dislike)\b|my preference\b|(?:from now on[, ]+)?(?:always|never|don't|do not) (?:use|include|give|show|write|explain|solve)\b)/i;
const normalizeSentence = sentence => sentence.trim().replace(/^(?:actually|instead|now)[,:]?\s+/i, '');
function recallText(userText) {
  // Keep a question accompanying a preference, so its answer can still support
  // follow-ups. The preference itself is recalled only through editable memory.
  return String(userText).split(/(?<=[.!?])\s+|\n/).filter(sentence => {
    const value = normalizeSentence(sentence);
    return !PREFERENCE.test(value) && !/^(?:please )?forget (?:all )?(?:my |the |our )?(?:saved )?(?:preferences?|memory)\b/i.test(value);
  }).join('\n').trim();
}

function preferenceKey(text) {
  const t = text.toLowerCase();
  if (/\b(dp|dynamic programming)\b/.test(t)) return 'algorithm:dp';
  if (/\b(graph|dfs|bfs|traversal)\b/.test(t)) return 'algorithm:graph';
  if (/\b(recursi\w*|iterative|bottom.up|top.down|memoization|tabulation)\b/.test(t)) return 'algorithm:general';
  if (/\b(python|javascript|typescript|java|cpp|rust|golang|swift)\b|\bc\+\+/.test(t)) return 'code:language';
  if (/\b(concise|brief|short|detailed|verbose|length|depth)\b/.test(t)) return 'answer:depth';
  if (/\b(bullets?|paragraphs?|tables?|format|headings?)\b/.test(t)) return 'answer:format';
  if (/\b(english|hindi|spanish|french|german|chinese)\b/.test(t)) return 'answer:language';
  return 'preference:' + createHash('sha256').update(t.replace(/\W+/g, ' ').trim()).digest('hex').slice(0, 16);
}

function learnPreferences(existing, userText, sourceId, now = Date.now()) {
  let memories = existing.filter(m => m.manual || now - m.updatedAt <= MEMORY_TTL_MS);
  const plain = String(userText || '').replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '')
    .split('\n').filter(line => !/^(?: {4}|\t|\s*>)/.test(line)).join('\n');
  for (let sentence of plain.split(/(?<=[.!?])\s+|\n/)) {
    sentence = normalizeSentence(sentence);
    if (!sentence || sentence.length > 360 || /[{}<>]|api[ -]?key|password|bearer\s+|sk-[a-z0-9]/i.test(sentence)) continue;
    if (/^(?:please )?forget (?:all )?(?:my |the |our )?(?:saved )?(?:preferences|memory)[.!]?$/i.test(sentence)) {
      memories = []; continue;
    }
    if (/^(?:please )?forget (?:my |the )?preference (?:for|about|on) /i.test(sentence)) {
      const key = preferenceKey(sentence);
      memories = memories.filter(m => m.key !== key); continue;
    }
    if (!PREFERENCE.test(sentence)) continue;
    // A request for this one answer is not a durable preference.
    if (/\b(?:this time|this answer|this question|just this|for now|for this)\b/i.test(sentence)) continue;
    const key = preferenceKey(sentence);
    memories = memories.filter(m => m.key !== key && !(key === 'algorithm:general' && m.key.startsWith('algorithm:')));
    memories.push({ id: randomUUID(), key, text: sentence, sourceId, updatedAt: now, manual: false });
  }
  return memories.slice(-MAX_MEMORIES);
}

function activeMemories(memories, now = Date.now()) {
  return memories.filter(m => m.manual || now - m.updatedAt <= MEMORY_TTL_MS).sort((a, b) => b.updatedAt - a.updatedAt);
}

module.exports = { learnPreferences, activeMemories, preferenceKey, recallText, MAX_MEMORIES, MEMORY_TTL_MS };
