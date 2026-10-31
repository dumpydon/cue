(function (root) {
  function install({ cue, icon, document = root.document, window = root, onBeforeOpen = async () => true, onMenuOpen = () => {}, onError = () => {} }) {
    const $ = selector => document.querySelector(selector);
    const trigger = $('#modes-btn'), scrim = $('#modes-scrim'), manager = $('#meeting-modes');
    const list = $('#mode-list'), title = $('#mode-title'), context = $('#mode-context');
    const status = $('#mode-save-status'), retry = $('#mode-save-retry'), reload = $('#mode-reload');
    const activate = $('#mode-activate'), actions = $('#mode-actions'), more = $('#mode-more');
    const drop = $('#mode-file-drop');
    const menu = document.createElement('div');
    menu.id = 'meeting-mode-menu'; menu.className = 'meeting-mode-menu hidden'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Meeting mode');
    document.body.append(menu);
    trigger.innerHTML = icon('layout-grid', { size: 17 });
    more.innerHTML = icon('more-horizontal', { size: 16 });
    $('.mode-file-art').innerHTML = icon('file-text', { size: 32 });
    let state = null, selectedId = null, queue = Promise.resolve(), saveTimer = null;
    let returnFocus = null, draggingId = null, actionBusy = false, importing = false, navigation = 0;
    const drafts = new Map();
    const isOpen = () => !scrim.classList.contains('hidden');
    const selected = () => state?.items.find(item => item.id === selectedId);
    const element = (tag, className, text) => { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; };
    function feedback(message, error = false, conflict = false) {
      status.textContent = String(message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); status.parentElement.classList.toggle('error', error);
      retry.classList.toggle('hidden', !error || conflict || !drafts.size);
      reload.classList.toggle('hidden', !conflict);
    }
    function enqueue(work) { const job = queue.then(work); queue = job.catch(() => {}); return job; }
    function closeActions() { actions.classList.add('hidden'); more.setAttribute('aria-expanded', 'false'); }
    function closeMenu(focus = false) {
      const wasOpen = !menu.classList.contains('hidden');
      menu.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false');
      if (focus && wasOpen) trigger.focus();
    }
    function updateActive() {
      const active = state?.items.find(item => item.id === state.activeId);
      trigger.title = 'Meeting mode: ' + (active?.title || 'General');
      trigger.setAttribute('aria-label', trigger.title);
      const isActive = selectedId === state?.activeId;
      activate.textContent = isActive ? 'Active Mode' : 'Set Active';
      activate.disabled = isActive || actionBusy || !selected();
      $('#mode-new').disabled = actionBusy || (state?.items.length || 0) >= (state?.limits.modes || 40);
      Array.from(list.children).forEach((row, index) => {
        const arrows = row.querySelectorAll('.mode-order-controls button');
        if (arrows[0]) arrows[0].disabled = actionBusy || index === 0;
        if (arrows[1]) arrows[1].disabled = actionBusy || index === list.children.length - 1;
      });
      $('#mode-undo-delete').classList.toggle('hidden', !state?.trash.length);
      $('#mode-undo-delete').title = state?.trash[0] ? 'Restore ' + state.trash[0].title : '';
    }
    function positionMenu() {
      if (menu.classList.contains('hidden')) return;
      const rect = trigger.getBoundingClientRect(), column = $('#app').getBoundingClientRect();
      const width = Math.min(280, column.width - 20), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
      const up = below < 220 && above > below;
      menu.style.width = width + 'px';
      menu.style.left = Math.max(column.left + 10, Math.min(rect.left, column.right - width - 10)) + 'px';
      menu.style.top = up ? 'auto' : rect.bottom + 8 + 'px';
      menu.style.bottom = up ? window.innerHeight - rect.top + 8 + 'px' : 'auto';
      menu.style.maxHeight = Math.max(80, Math.min(380, up ? above : below)) + 'px';
    }
    function renderMenu() {
      if (!state || menu.classList.contains('hidden')) return;
      menu.replaceChildren();
      const options = element('div', 'meeting-mode-options'); options.setAttribute('role', 'none');
      for (const mode of state.items) {
        const option = element('button', 'meeting-mode-option'); option.type = 'button'; option.dataset.id = mode.id; option.tabIndex = -1;
        option.setAttribute('role', 'menuitemradio'); option.setAttribute('aria-checked', String(mode.id === state.activeId)); option.title = mode.title;
        const symbol = element('span', ''); symbol.innerHTML = icon(mode.icon, { size: 16 }); symbol.setAttribute('aria-hidden', 'true');
        option.append(symbol, element('span', 'meeting-mode-name', mode.title), element('span', 'meeting-mode-check', mode.id === state.activeId ? '✓' : ''));
        option.addEventListener('click', async () => {
          try { await perform('activate', { id: mode.id }); closeMenu(true); }
          catch (error) { onError(error.message); }
        });
        options.append(option);
      }
      const manage = element('button', 'meeting-mode-manage', 'Manage modes'); manage.type = 'button'; manage.setAttribute('role', 'menuitem'); manage.tabIndex = -1;
      manage.addEventListener('click', () => { closeMenu(); void open(); });
      menu.append(options, manage); positionMenu();
    }
    function renderList() {
      if (!state) return;
      if (draggingId) { updateActive(); return; }
      const scrollTop = list.scrollTop;
      list.replaceChildren();
      state.items.forEach((mode, index) => {
        const row = element('div', 'mode-row' + (mode.id === selectedId ? ' selected' : '')); row.dataset.id = mode.id;
        const grip = element('button', 'mode-drag-grip'); grip.type = 'button'; grip.draggable = true;
        grip.innerHTML = icon('grip-vertical', { size: 13 }); grip.setAttribute('aria-label', 'Reorder ' + mode.title);
        grip.title = 'Drag to reorder, or use Alt + Up / Down';
        grip.addEventListener('keydown', event => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); void moveBy(mode.id, event.key === 'ArrowUp' ? -1 : 1);
        });
        const button = element('button', 'mode-select'); button.type = 'button'; button.title = mode.title;
        button.setAttribute('aria-pressed', String(mode.id === selectedId));
        const symbol = element('span', 'mode-row-icon'); symbol.innerHTML = icon(mode.icon, { size: 16 }); symbol.setAttribute('aria-hidden', 'true');
        const draft = drafts.get(mode.id);
        button.append(symbol, element('span', 'mode-row-label', draft?.title.trim() || mode.title));
        if (mode.id === state.activeId) { const check = element('span', 'mode-active-dot', '✓'); check.setAttribute('aria-label', 'Active mode'); button.append(check); }
        button.addEventListener('click', () => { void selectMode(mode.id); });
        const order = element('span', 'mode-order-controls');
        for (const delta of [-1, 1]) {
          const arrow = element('button', ''); arrow.type = 'button'; arrow.innerHTML = icon(delta < 0 ? 'chevron-up' : 'chevron-down', { size: 12 });
          arrow.setAttribute('aria-label', 'Move ' + mode.title + (delta < 0 ? ' up' : ' down'));
          arrow.disabled = actionBusy || (delta < 0 ? index === 0 : index === state.items.length - 1);
          arrow.addEventListener('click', () => { void moveBy(mode.id, delta); }); order.append(arrow);
        }
        row.append(grip, button, order); list.append(row);
      });
      list.scrollTop = scrollTop; updateActive();
    }
    function renderFiles() {
      const mode = selected(); if (!mode) return;
      const container = $('#mode-file-list'); container.replaceChildren();
      $('#mode-file-count').textContent = mode.files.length + ' / ' + state.limits.files;
      for (const file of mode.files) {
        const row = element('div', 'mode-file'), text = element('span', 'mode-file-text');
        text.append(element('span', 'mode-file-name', file.name), element('small', 'mode-file-meta', file.truncated
          ? file.characters.toLocaleString() + ' of ' + file.originalCharacters.toLocaleString() + ' characters included'
          : file.characters.toLocaleString() + ' characters'));
        const remove = element('button', 'mode-file-remove'); remove.type = 'button'; remove.innerHTML = icon('x', { size: 13 });
        remove.setAttribute('aria-label', 'Remove ' + file.name); remove.disabled = importing;
        remove.addEventListener('click', () => { void perform('remove-file', { id: mode.id, fileId: file.id }).catch(error => feedback(error.message, true)); });
        row.append(text, remove); container.append(row);
      }
      drop.disabled = importing || mode.files.length >= state.limits.files;
    }
    function countCharacters() { $('#mode-character-count').textContent = context.value.length.toLocaleString() + ' / ' + (state?.limits.context || 64000).toLocaleString() + ' characters'; }
    function fillEditor() {
      const mode = selected(); if (!mode) return;
      const draft = drafts.get(mode.id);
      title.value = draft?.title ?? mode.title; context.value = draft?.context ?? mode.context;
      title.maxLength = state.limits.title; context.maxLength = state.limits.context;
      countCharacters(); renderFiles(); updateActive(); closeActions();
    }
    function apply(next) {
      if (state && next.revision < state.revision) return;
      const oldSelected = selected(); state = next;
      if (!state.items.some(mode => mode.id === selectedId)) selectedId = state.activeId;
      renderList(); renderMenu(); renderFiles();
      if (isOpen() && !drafts.has(selectedId) && (oldSelected?.id !== selectedId || oldSelected?.revision !== selected()?.revision)) fillEditor();
    }
    async function load() {
      try { apply(await cue.meetingModesState()); return true; }
      catch (error) { onError('Could not load meeting modes. ' + error.message); return false; }
    }
    async function saveDraft(id) {
      return enqueue(async () => {
        const draft = drafts.get(id); if (!draft) return true;
        if (!draft.title.trim()) { feedback('Give this mode a name to save it.', true); return false; }
        const version = draft.version;
        feedback('Saving…');
        try {
          const next = await cue.meetingModesMutate('update', { id, title: draft.title, context: draft.context, expectedRevision: draft.baseRevision });
          const revision = next.items.find(item => item.id === id)?.revision;
          if (drafts.get(id)?.version === version) drafts.delete(id);
          else if (drafts.has(id)) drafts.get(id).baseRevision = revision;
          apply(next); feedback(drafts.size ? 'Saving…' : 'Saved'); return true;
        } catch (error) {
          const conflict = /changed elsewhere/.test(error.message);
          feedback(error.message || 'Could not save. Your edits are still here.', true, conflict); return false;
        }
      });
    }
    async function flush() {
      clearTimeout(saveTimer);
      for (let iteration = 0; drafts.size && iteration < 15; iteration++) {
        for (const id of [...drafts.keys()]) if (!(await saveDraft(id))) return false;
      }
      return drafts.size === 0;
    }
    function edited() {
      const mode = selected(); if (!mode) return;
      const previous = drafts.get(mode.id);
      drafts.set(mode.id, { title: title.value, context: context.value, version: (previous?.version || 0) + 1, baseRevision: previous?.baseRevision ?? mode.revision });
      countCharacters(); renderList(); feedback('Saving…');
      clearTimeout(saveTimer); saveTimer = setTimeout(() => { void saveDraft(mode.id); }, 350);
    }
    async function selectMode(id) {
      const generation = ++navigation;
      if (!(await flush()) || generation !== navigation || !state.items.some(mode => mode.id === id)) return;
      selectedId = id; renderList(); fillEditor(); feedback('Saved'); $('#mode-editor').scrollTop = 0;
    }
    async function perform(action, payload = {}) {
      if (!(await flush())) throw new Error('Save or correct your current mode edits first.');
      return enqueue(async () => {
        actionBusy = true; updateActive();
        try { const next = await cue.meetingModesMutate(action, payload); apply(next); feedback('Saved'); return next; }
        finally { actionBusy = false; updateActive(); }
      });
    }
    async function moveBy(id, delta) {
      if (!state) return;
      const ids = state.items.map(mode => mode.id), from = ids.indexOf(id), to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return;
      ids.splice(from, 1); ids.splice(to, 0, id);
      try {
        await perform('reorder', { ids });
        const row = Array.from(list.children).find(row => row.dataset.id === id);
        row?.querySelector('.mode-drag-grip').focus(); row?.scrollIntoView({ block: 'nearest' });
      } catch (error) { feedback(error.message, true); }
    }
    async function open() {
      if (!state && !(await load())) return;
      if (!(await onBeforeOpen())) return;
      closeMenu(); returnFocus = document.activeElement;
      selectedId = state.items.some(item => item.id === selectedId) ? selectedId : state.activeId;
      scrim.classList.remove('hidden'); renderList(); fillEditor(); feedback(drafts.size ? 'Unsaved changes' : 'Saved'); $('#modes-done').focus();
    }
    async function close() {
      if (!isOpen()) { closeMenu(); return true; }
      if (!(await flush())) return false;
      scrim.classList.add('hidden'); closeActions();
      if (returnFocus?.isConnected) returnFocus.focus();
      return true;
    }
    async function importFiles(files) {
      if (importing || !(await flush())) return;
      const id = selectedId; importing = true; renderFiles(); feedback('Reading files…');
      try {
        const result = files ? await cue.meetingModeDropFiles(id, files) : await cue.meetingModePickFiles(id);
        apply(result.state);
        const problems = result.errors.map(error => error.name + ': ' + error.message).join(' ');
        feedback(problems || (result.canceled ? 'Saved' : result.added ? result.added + (result.added === 1 ? ' file added.' : ' files added.') : 'These files are already attached.'), !!problems);
      } catch (error) { feedback(error.message || 'Could not import files. Try again.', true); }
      finally { importing = false; renderFiles(); }
    }
    title.addEventListener('input', edited); context.addEventListener('input', edited);
    $('#modes-done').addEventListener('click', () => { void close(); });
    $('#manage-modes-settings').addEventListener('click', () => { void open(); });
    retry.addEventListener('click', () => { void flush(); });
    reload.addEventListener('click', async () => { if (await load()) { drafts.delete(selectedId); fillEditor(); feedback('Saved version reloaded.'); } });
    activate.addEventListener('click', () => { void perform('activate', { id: selectedId }).catch(error => feedback(error.message, true)); });
    $('#mode-new').addEventListener('click', async () => {
      const existing = new Set(state.items.map(mode => mode.id));
      try { const next = await perform('create'); selectedId = next.items.find(mode => !existing.has(mode.id)).id; renderList(); fillEditor(); title.focus(); title.select(); }
      catch (error) { feedback(error.message, true); }
    });
    more.addEventListener('click', () => { const hidden = actions.classList.toggle('hidden'); more.setAttribute('aria-expanded', String(!hidden)); });
    $('#mode-duplicate').addEventListener('click', async () => {
      closeActions(); const existing = new Set(state.items.map(mode => mode.id));
      try { const next = await perform('duplicate', { id: selectedId }); selectedId = next.items.find(mode => !existing.has(mode.id)).id; renderList(); fillEditor(); title.focus(); title.select(); }
      catch (error) { feedback(error.message, true); }
    });
    $('#mode-delete').addEventListener('click', async () => {
      closeActions();
      try { await perform('remove', { id: selectedId }); fillEditor(); feedback('Mode deleted. You can undo this below.'); }
      catch (error) { feedback(error.message, true); }
    });
    $('#mode-undo-delete').addEventListener('click', async () => {
      const id = state.trash[0]?.id;
      try { await perform('restore', { id }); selectedId = id; renderList(); fillEditor(); feedback('Mode restored.'); }
      catch (error) { feedback(error.message, true); }
    });
    drop.addEventListener('click', () => { void importFiles(); });
    drop.addEventListener('dragover', event => { if (Array.from(event.dataTransfer.types).includes('Files')) { event.preventDefault(); drop.classList.add('file-over'); event.dataTransfer.dropEffect = 'copy'; } });
    drop.addEventListener('dragleave', () => drop.classList.remove('file-over'));
    drop.addEventListener('drop', event => { event.preventDefault(); event.stopPropagation(); drop.classList.remove('file-over'); if (event.dataTransfer.files.length) void importFiles(Array.from(event.dataTransfer.files)); });
    const clearDrag = () => { draggingId = null; list.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(row => row.classList.remove('dragging', 'drop-before', 'drop-after')); };
    list.addEventListener('dragstart', event => {
      if (!event.target.closest('.mode-drag-grip')) return;
      draggingId = event.target.closest('.mode-row').dataset.id;
      event.dataTransfer.setData('application/x-cue-meeting-mode', draggingId); event.dataTransfer.effectAllowed = 'move';
      event.target.closest('.mode-row').classList.add('dragging');
    });
    list.addEventListener('dragover', event => {
      const row = event.target.closest('.mode-row');
      if (!draggingId || !row || row.dataset.id === draggingId) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.drop-before, .drop-after').forEach(item => item.classList.remove('drop-before', 'drop-after'));
      const r = row.getBoundingClientRect(); row.classList.add(event.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    list.addEventListener('drop', event => {
      const row = event.target.closest('.mode-row'), moving = draggingId;
      if (!moving || !row || row.dataset.id === moving) { clearDrag(); return; }
      event.preventDefault(); event.stopPropagation();
      const r = row.getBoundingClientRect(), after = event.clientY >= r.top + r.height / 2;
      const ids = state.items.map(mode => mode.id).filter(id => id !== moving);
      ids.splice(ids.indexOf(row.dataset.id) + (after ? 1 : 0), 0, moving); clearDrag();
      void perform('reorder', { ids }).catch(error => feedback(error.message, true));
    });
    list.addEventListener('dragend', clearDrag);
    trigger.addEventListener('click', async () => {
      if (!menu.classList.contains('hidden')) { closeMenu(true); return; }
      if (!state && !(await load())) return;
      if (!(await close())) return;
      onMenuOpen(); menu.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true'); renderMenu();
      const current = menu.querySelector('[aria-checked="true"]'); (current || menu.querySelector('button'))?.focus();
    });
    document.addEventListener('pointerdown', event => {
      if (!menu.contains(event.target) && !trigger.contains(event.target)) closeMenu();
      if (!actions.contains(event.target) && !more.contains(event.target)) closeActions();
    });
    document.addEventListener('dragover', event => { if (isOpen() && Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault(); });
    document.addEventListener('drop', event => { if (isOpen()) event.preventDefault(); });
    document.addEventListener('keydown', event => {
      if (!menu.classList.contains('hidden')) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeMenu(true); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); const options = Array.from(menu.querySelectorAll('button'));
          const index = options.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
          options[next]?.focus(); return;
        }
        if (event.key === 'Tab') closeMenu();
      }
      if (!isOpen()) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!actions.classList.contains('hidden')) closeActions(); else void close(); return; }
      if (event.key === 'Tab') {
        const focusable = Array.from(manager.querySelectorAll('button:not([disabled]), input, textarea')).filter(el => el.getClientRects().length && !el.closest('.hidden'));
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }, true);
    window.addEventListener('resize', positionMenu); cue.on('window:zoom-changed', positionMenu);
    cue.on('modes:changed', apply);
    const ready = load();
    return { open, close, closeMenu, flush, isOpen, ready };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueMeetingModes = { install };
})(typeof window === 'object' ? window : globalThis);
