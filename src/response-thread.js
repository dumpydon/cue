const { createHash } = require('node:crypto');

// Only completed text answers are retained, in memory. No screenshots or credentials.
function responseScope(settings = {}) {
  const modes = settings.meetingModes || {};
  const active = (modes.items || []).find(mode => mode.id === modes.activeId);
  const profile = Object.fromEntries(['resumeText', 'jobDescription', 'starStories', 'whyCompany',
    'whyLeaving', 'workStyle', 'salaryTarget', 'questionsToAsk', 'aiRules'].map(key => [key, settings[key] || '']));
  return createHash('sha256').update(JSON.stringify({ activeId: modes.activeId || 'general', active, profile })).digest('hex');
}

function bounded(text, max) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  const marker = '\n[Middle of earlier message omitted]\n';
  const half = Math.floor((max - marker.length) / 2);
  return value.slice(0, half) + marker + value.slice(-(max - marker.length - half));
}

function createResponseThread({ maxExchanges = 6, maxChars = 24000 } = {}) {
  let scope = null, version = 0, exchanges = [];
  function reset() { version++; exchanges = []; }
  return {
    prepare(nextScope) {
      if (scope !== nextScope) { reset(); scope = nextScope; }
      return version;
    },
    turns(userText, includeHistory = true) {
      return [...(includeHistory ? exchanges.flatMap(exchange => exchange.map(turn => ({ ...turn }))) : []),
        { role: 'user', text: userText }];
    },
    commit(expectedVersion, userText, answer) {
      if (version !== expectedVersion || !String(answer || '').trim()) return false;
      exchanges.push([{ role: 'user', text: bounded(userText, 4000) }, { role: 'assistant', text: bounded(answer, 10000) }]);
      while (exchanges.length && (exchanges.length > maxExchanges ||
        exchanges.reduce((sum, exchange) => sum + exchange.reduce((n, turn) => n + turn.text.length, 0), 0) > maxChars)) exchanges.shift();
      return true;
    },
    reset,
    isCurrent: expectedVersion => version === expectedVersion,
    get size() { return exchanges.length; },
  };
}

module.exports = { createResponseThread, responseScope };
