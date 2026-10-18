(function (root) {
  function install({ cue, document = root.document, window = root, icon, getProvider, getPreferences = () => null, onChange = () => {} }) {
    const models = root.CueModels;
    const menu = document.createElement('div');
    menu.id = 'model-menu'; menu.className = 'model-menu hidden';
    menu.setAttribute('role', 'dialog');
    document.body.append(menu);
    const fields = Object.fromEntries(['fast', 'smart'].map(tier => [tier, {
      input: document.getElementById('model-' + tier), button: document.getElementById('model-' + tier + '-toggle')
    }]));
    const status = document.getElementById('model-list-status');
    const refreshButton = document.getElementById('models-refresh');
    let provider = 'openai', epoch = 0, active = null, query = '', choices = { entries: [], hidden: [] };
    let catalog = models.OPENAI_DEFAULTS.slice(), loading = false, catalogMessage = '';
    const preferenceCache = new Map();

    function close(focus = false) {
      const tier = active;
      active = null; menu.classList.add('hidden');
      for (const field of Object.values(fields)) {
        field.input.setAttribute('aria-expanded', 'false');
        field.button.setAttribute('aria-expanded', 'false');
      }
      if (focus && tier) fields[tier].input.focus();
    }
    function position() {
      if (!active) return;
      const rect = fields[active].input.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) { close(); return; }
      const below = window.innerHeight - rect.bottom - 10, above = rect.top - 10;
      const desired = Math.min(380, menu.scrollHeight);
      const up = below < desired && above > below;
      const height = Math.max(60, Math.min(380, up ? above : below));
      menu.style.width = Math.min(rect.width, window.innerWidth - 20) + 'px';
      menu.style.maxHeight = height + 'px';
      menu.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - rect.width - 10)) + 'px';
      menu.style.top = up ? 'auto' : rect.bottom + 6 + 'px';
      menu.style.bottom = up ? window.innerHeight - rect.top + 6 + 'px' : 'auto';
    }
    const searchKey = value => value.toLowerCase().replace(/soul/g, 'sol').replace(/[^a-z0-9.]/g, '');
    function node(tag, className, text) {
      const el = document.createElement(tag); el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    }
    function feedback(message) { status.textContent = message || catalogMessage || (provider === 'openai' ? 'New compatible OpenAI models are discovered automatically.' : 'Type a model ID once to save it here.'); }
    async function choose(raw) {
      if (!active) return;
      const tier = active, selectedProvider = provider, generation = epoch;
      const id = models.normalizeId(provider, raw);
      if (!id) { feedback('Enter a valid model ID.'); return; }
      const previous = fields[tier].input.value;
      fields[tier].input.value = id; onChange(selectedProvider, tier, id); close();
      try {
        const next = await cue.modelRemember(selectedProvider, id);
        preferenceCache.set(selectedProvider, next);
        if (provider === selectedProvider && epoch === generation) { choices = next; feedback('Saved to your model list.'); }
      } catch (error) {
        if (provider === selectedProvider && epoch === generation) {
          if (fields[tier].input.value === id) { fields[tier].input.value = previous; onChange(selectedProvider, tier, previous); }
          feedback(error.message || 'Could not save this model.');
        }
      }
    }
    async function remove(id, button) {
      const selectedProvider = provider, generation = epoch;
      button.disabled = true;
      try {
        const next = await cue.modelForget(selectedProvider, id);
        preferenceCache.set(selectedProvider, next);
        if (provider === selectedProvider && epoch === generation) {
          choices = next; render(); feedback('Removed from your choices. Your current model selection is unchanged.');
          if (active) menu.querySelector('.model-option')?.focus();
        }
      } catch (error) { if (provider === selectedProvider) feedback(error.message || 'Could not remove this model.'); }
      finally { button.disabled = false; }
    }
    function render() {
      if (!active) return;
      menu.replaceChildren();
      menu.setAttribute('aria-label', 'Choose ' + (active === 'fast' ? 'Fast' : 'Smart') + ' model');
      const hidden = new Set(choices.hidden || []), saved = new Set((choices.entries || []).map(item => item.id));
      const needle = searchKey(query);
      const matches = item => !hidden.has(item.id) && (!needle || searchKey(item.id + ' ' + item.label).includes(needle));
      const groups = [
        ['Your frequently used models', (choices.entries || []).filter(matches)],
        [provider === 'openai' ? 'OpenAI models' : 'Models', catalog.filter(item => !saved.has(item.id) && matches(item))]
      ];
      const current = models.normalizeId(provider, fields[active].input.value);
      let count = 0;
      for (const [title, items] of groups) {
        if (!items.length) continue;
        menu.append(node('div', 'model-group-title', title));
        for (const item of items) {
          const row = node('div', 'model-menu-row');
          const option = node('button', 'model-option'); option.type = 'button'; option.dataset.model = item.id;
          option.setAttribute('aria-label', item.label + (item.id === current ? ', selected' : ''));
          const text = node('span', 'model-option-text');
          text.append(node('strong', 'model-option-label', item.label), node('small', 'model-option-id', item.id));
          option.append(text);
          if (item.id === current) { const check = node('span', 'model-selected', '✓'); check.setAttribute('aria-hidden', 'true'); option.append(check); }
          option.addEventListener('click', () => { void choose(item.id); });
          const erase = node('button', 'model-delete');
          erase.type = 'button'; erase.title = 'Delete this model';
          erase.setAttribute('aria-label', 'Delete ' + item.label + ' from your model choices');
          erase.innerHTML = icon('trash-2', { size: 14 });
          erase.addEventListener('click', () => { void remove(item.id, erase); });
          row.append(option, erase); menu.append(row); count++;
        }
      }
      const typed = models.normalizeId(provider, query);
      const known = [...(choices.entries || []), ...catalog].some(item => !hidden.has(item.id) && item.id === typed);
      if (typed && !known) {
        const use = node('button', 'model-option model-custom', 'Use “' + typed + '”');
        use.type = 'button'; use.dataset.model = typed;
        use.addEventListener('click', () => { void choose(typed); });
        menu.append(use); count++;
      }
      if (!count) menu.append(node('p', 'model-empty', query ? 'No matching models. Enter a model ID to add one.' : 'No saved models yet. Type a model ID to add one.'));
      if (loading) menu.append(node('p', 'model-loading', 'Refreshing OpenAI models…'));
      position();
    }
    function open(tier, filter = false) {
      if (active && active !== tier) close();
      active = tier; query = filter ? fields[tier].input.value : '';
      fields[tier].input.setAttribute('aria-expanded', 'true'); fields[tier].button.setAttribute('aria-expanded', 'true');
      menu.classList.remove('hidden'); render();
    }
    function focusOption(last = false) {
      const options = Array.from(menu.querySelectorAll('.model-option'));
      (last ? options.at(-1) : options[0])?.focus();
    }
    async function refresh(force = false) {
      if (provider !== 'openai') return;
      const generation = epoch;
      loading = true; refreshButton.disabled = true; feedback('Refreshing OpenAI models…'); render();
      try {
        const result = await cue.modelCatalog(provider, force);
        if (generation !== epoch) return;
        catalog = result.models || []; catalogMessage = result.message || '';
      } catch (_) { if (generation === epoch) catalogMessage = 'Could not refresh models. Your saved choices are still available.'; }
      finally {
        if (generation === epoch) { loading = false; refreshButton.disabled = false; feedback(); render(); }
      }
    }
    function setProvider(next) {
      close(); provider = next; const generation = ++epoch;
      choices = preferenceCache.get(provider) || models.state(getPreferences(), provider); catalog = provider === 'openai' ? models.OPENAI_DEFAULTS.slice() : [];
      loading = false; catalogMessage = ''; refreshButton.disabled = false;
      refreshButton.classList.toggle('hidden', provider !== 'openai'); feedback();
      const requestedProvider = provider;
      cue.modelChoices(provider).then(result => { preferenceCache.set(requestedProvider, result); if (generation === epoch) { choices = result; render(); } }).catch(() => { if (generation === epoch) feedback('Could not load saved model choices.'); });
      if (provider === 'openai') void refresh();
    }
    for (const [tier, field] of Object.entries(fields)) {
      field.button.innerHTML = icon('chevron-down', { size: 15 });
      field.button.addEventListener('click', () => { if (active === tier) close(true); else { open(tier); field.input.focus(); } });
      field.input.addEventListener('click', () => open(tier));
      field.input.addEventListener('input', () => open(tier, true));
      field.input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); if (active !== tier) open(tier); focusOption(event.key === 'ArrowUp');
        } else if (event.key === 'Enter') {
          event.preventDefault(); event.stopPropagation();
          if (!field.input.value.trim()) { close(); return; }
          const id = models.normalizeId(provider, field.input.value);
          const available = [...(choices.entries || []), ...catalog].filter(item => !(choices.hidden || []).includes(item.id));
          const exact = available.find(item => item.id === id || item.id.toLowerCase() === field.input.value.trim().toLowerCase());
          const matching = available.find(item => searchKey(item.id + ' ' + item.label).includes(searchKey(field.input.value)));
          if (active !== tier) open(tier, true);
          if (exact || matching || id) void choose(exact?.id || matching?.id || id);
        } else if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); close(true); }
      });
    }
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const options = Array.from(menu.querySelectorAll('.model-option'));
      const selected = document.activeElement.closest('.model-menu-row')?.querySelector('.model-option') || document.activeElement;
      let index = options.indexOf(selected);
      index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      options[index]?.focus();
    });
    document.addEventListener('pointerdown', event => {
      if (active && !menu.contains(event.target) && !Object.values(fields).some(field => field.input.parentElement.contains(event.target))) close();
    });
    document.addEventListener('focusin', event => {
      if (active && !menu.contains(event.target) && !Object.values(fields).some(field => field.input.parentElement.contains(event.target))) close();
    });
    document.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    cue.on('window:zoom-changed', position);
    refreshButton.addEventListener('click', () => { void refresh(true); });
    cue.on('models:changed', next => { preferenceCache.set(next.provider, next); if (next.provider === provider) { choices = next; render(); } });
    return { setProvider, close, refresh, normalizeValues() {
      for (const field of Object.values(fields)) {
        const id = models.normalizeId(getProvider(), field.input.value);
        if (id) field.input.value = id;
      }
    } };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueModelPicker = { install };
})(typeof window === 'object' ? window : globalThis);
