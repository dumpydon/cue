const models = require('./model-preferences');

function createModelCatalog({ listModels, now = Date.now, ttlMs = 5 * 60 * 1000 } = {}) {
  let key = null, cached = null, pending = null;
  const defaults = () => models.OPENAI_DEFAULTS.map(model => ({ ...model }));
  async function get({ apiKey, force = false } = {}) {
    if (!apiKey) return { models: defaults(), live: false, message: 'Save your OpenAI API key to discover new models.' };
    if (key !== apiKey) { key = apiKey; cached = null; pending = null; }
    if (!force && cached && now() - cached.fetchedAt < ttlMs) return cached;
    if (pending) return pending;
    const requestedKey = apiKey;
    const request = (async () => {
      try {
        const list = listModels ? await listModels(apiKey) : await fetchModels(apiKey);
        const available = Array.from(new Set(list.filter(item => item && models.discoverable(item.id) && (!item.shutdown_date || Date.parse(item.shutdown_date) > now())).map(item => item.id)));
        const preferred = models.OPENAI_DEFAULTS.map(item => item.id).filter(id => available.includes(id));
        const ids = [...preferred, ...available.filter(id => !preferred.includes(id)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))];
        const result = { models: ids.map(id => ({ id, label: models.label(id) })), live: true, fetchedAt: now(), message: '' };
        if (key === requestedKey) cached = result;
        return result;
      } catch (error) {
        const message = error.status === 401 ? 'Save a valid OpenAI API key, then refresh models.'
          : error.status === 403 ? 'This API key cannot list models. Saved choices and defaults are still available.'
          : 'Could not refresh OpenAI models. Saved choices and defaults are still available.';
        return { models: cached?.models || defaults(), live: false, message };
      }
    })();
    pending = request;
    try { return await request; } finally { if (pending === request) pending = null; }
  }
  return { get };
}

async function fetchModels(apiKey) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey, baseURL: 'https://api.openai.com/v1', timeout: 10000, maxRetries: 0 });
  const page = await client.models.list();
  return page.data || [];
}

module.exports = { createModelCatalog };
