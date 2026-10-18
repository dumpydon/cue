(function (root) {
  const PROVIDERS = ['openai', 'anthropic', 'gemini', 'groq', 'cerebras', 'custom', 'ollama', 'minimax', 'deepseek', 'azure', 'publik'];
  const OPENAI_DEFAULTS = [
    ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6-astra', 'GPT-6 Astra'], ['gpt-6-sol', 'GPT-6 Sol'],
    ['gpt-6-luna', 'GPT-6 Luna'], ['gpt-5.6-sol', 'GPT-5.6 Sol'], ['gpt-5.6-terra', 'GPT-5.6 Terra'], ['gpt-5.6-luna', 'GPT-5.6 Luna']
  ].map(([id, label]) => ({ id, label }));
  const MAX_MODELS = 100;

  function normalizeId(provider, value) {
    if (typeof value !== 'string') return '';
    let id = value.trim();
    if (provider === 'openai') {
      const friendly = /^gpt[\s-]*(\d+(?:\.\d+)?)[\s-]*(sol|soul|luna|terra|astra)$/i.exec(id);
      if (friendly) id = 'gpt-' + friendly[1] + '-' + friendly[2].toLowerCase().replace('soul', 'sol');
      if (discoverable(id.toLowerCase())) id = id.toLowerCase();
    }
    return id.length <= 240 && !/[\s\x00-\x1f\x7f]/u.test(id) ? id : '';
  }

  function label(id) {
    const known = OPENAI_DEFAULTS.find(model => model.id === id);
    if (known) return known.label;
    const match = /^gpt-(\d+(?:\.\d+)?|4o)(?:-(sol|luna|terra|astra|mini|nano))?(-\d{4}-\d{2}-\d{2})?$/i.exec(id);
    return match ? 'GPT-' + match[1] + (match[2] ? ' ' + match[2][0].toUpperCase() + match[2].slice(1) : '') + (match[3] ? ' · ' + match[3].slice(1) : '') : id;
  }

  function discoverable(id) {
    // Only the chat / vision families supported by Cue's request path.
    // In particular, a future GPT-6.x alias needs no hardcoded menu update.
    return /^gpt-(?:5\.6|6(?:\.\d+)?)(?:-(?:sol|luna|terra|astra))?(?:-\d{4}-\d{2}-\d{2})?$/.test(id) ||
      /^gpt-(?:4o(?:-mini)?|4\.1(?:-(?:mini|nano))?)(?:-\d{4}-\d{2}-\d{2})?$/.test(id);
  }

  function normalize(value) {
    const providers = {};
    for (const provider of PROVIDERS) {
      const source = value?.providers?.[provider];
      if (!source) continue;
      const seen = new Set(), entries = [];
      for (const item of Array.isArray(source.entries) ? source.entries : []) {
        const id = normalizeId(provider, item?.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        entries.push({ id, uses: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(item.uses) || 0))),
          lastUsedAt: Math.max(0, Number(item.lastUsedAt) || 0), lastSelectedAt: Math.max(0, Number(item.lastSelectedAt) || 0) });
      }
      const hidden = Array.from(new Set((Array.isArray(source.hidden) ? source.hidden : []).map(id => normalizeId(provider, id)).filter(Boolean))).slice(0, 200);
      providers[provider] = { entries: entries.filter(entry => !hidden.includes(entry.id)).slice(0, MAX_MODELS), hidden };
    }
    return { version: 1, providers };
  }

  function remember(value, provider, raw, { used = false, now = Date.now() } = {}) {
    if (!PROVIDERS.includes(provider)) throw new Error('Unknown model provider.');
    const id = normalizeId(provider, raw);
    if (!id) throw new Error('Enter a valid model ID.');
    const next = normalize(value), current = next.providers[provider] || { entries: [], hidden: [] };
    if (used && current.hidden.includes(id)) return next;
    const previous = current.entries.find(entry => entry.id === id) || { id, uses: 0, lastUsedAt: 0, lastSelectedAt: 0 };
    const entry = { ...previous, ...(used ? { uses: Math.min(Number.MAX_SAFE_INTEGER, previous.uses + 1), lastUsedAt: now } : { lastSelectedAt: now }) };
    next.providers[provider] = { entries: [entry, ...current.entries.filter(item => item.id !== id)].slice(0, MAX_MODELS), hidden: current.hidden.filter(item => item !== id) };
    return next;
  }

  function forget(value, provider, raw) {
    if (!PROVIDERS.includes(provider)) throw new Error('Unknown model provider.');
    const id = normalizeId(provider, raw);
    if (!id) throw new Error('Enter a valid model ID.');
    const next = normalize(value), current = next.providers[provider] || { entries: [], hidden: [] };
    next.providers[provider] = { entries: current.entries.filter(item => item.id !== id), hidden: [id, ...current.hidden.filter(item => item !== id)].slice(0, 200) };
    return next;
  }

  function state(value, provider) {
    const data = normalize(value).providers[provider] || { entries: [], hidden: [] };
    return { provider, hidden: data.hidden, entries: data.entries.slice().sort((a, b) => b.uses - a.uses || Math.max(b.lastUsedAt, b.lastSelectedAt) - Math.max(a.lastUsedAt, a.lastSelectedAt)).map(entry => ({ ...entry, label: label(entry.id) })) };
  }

  function seed(models) {
    let next = normalize(null);
    for (const provider of PROVIDERS) for (const id of Object.values(models?.[provider] || {})) {
      if (normalizeId(provider, id)) next = remember(next, provider, id, { now: 0 });
    }
    return next;
  }

  const api = { PROVIDERS, OPENAI_DEFAULTS, MAX_MODELS, normalizeId, label, discoverable, normalize, remember, forget, state, seed };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CueModels = api;
})(typeof window === 'object' ? window : globalThis);
