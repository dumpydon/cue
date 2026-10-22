// Bounded, speaker-labelled evidence for live answers. Generated drafts live elsewhere.
const normalize = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

function validTurns(turns) {
  return (Array.isArray(turns) ? turns : []).filter(turn =>
    turn && ['you', 'them'].includes(turn.channel) && typeof turn.text === 'string' && turn.text.trim());
}

function questionTranscript(turns, question) {
  const source = validTurns(turns);
  const target = normalize(question);
  if (!target) return source;
  // The speech composer can join several finalized chunks into a single question.
  // Anchor at its last chunk, excluding anything said after that selected question.
  for (let end = source.length - 1; end >= 0; end--) {
    if (source[end].channel !== 'them') continue;
    let combined = '';
    for (let start = end; start >= Math.max(0, end - 7) && source[start].channel === 'them'; start--) {
      combined = normalize(source[start].text + ' ' + combined);
      if (combined === target) return source.slice(0, end + 1);
    }
  }
  return source;
}

function clipEvidence(text, limit) {
  if (text.length <= limit) return text;
  const marker = '\n[earlier words omitted]\n';
  return marker + text.slice(-(Math.max(0, limit - marker.length)));
}

function formatTranscript(turns, limit = 16, maxChars = 12000) {
  const source = validTurns(turns);
  const recent = limit ? source.slice(-limit) : source;
  const selected = [];
  let remaining = maxChars;
  for (let index = recent.length - 1; index >= 0 && remaining > 100; index--) {
    const turn = recent[index];
    const label = (turn.channel === 'them' ? 'Them' : 'You') + (turn.partial ? ' (still speaking; provisional)' : '') + ': ';
    const body = clipEvidence(turn.text.trim(), Math.min(6000, remaining - label.length - 1));
    selected.unshift(label + body);
    remaining -= label.length + body.length + 1;
  }
  const omitted = source.length > selected.length;
  return (omitted ? '[Earlier conversation omitted; this is the most recent context.]\n' : '') + selected.join('\n');
}

function responseTokenBudget(mode, smart) {
  const budgets = {
    say: [768, 1200], answerThis: [768, 1200],
    assist: [2200, 4500], ask: [2200, 4500],
    leetcode: [4096, 6144], recap: [1800, 2800],
  };
  return (budgets[mode] || budgets.ask)[smart ? 1 : 0];
}

module.exports = { validTurns, questionTranscript, formatTranscript, responseTokenBudget };
