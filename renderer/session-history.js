(function (root) {
  function install({ cue, document = root.document, icon, onOpen = () => {} }) {
    const $ = selector => document.querySelector(selector);
    const scrim = $('#sessions-scrim'), content = $('#sessions-content');
    const back = $('#sessions-back'), refresh = $('#sessions-refresh'), done = $('#sessions-close');
    const search = $('#history-search'), tabs = $('#history-tabs'), notice = $('#history-notice');
    let selectedId = null, selectedKind = 'chats', tab = 'chats', editing = null, version = 0, returnFocus = null, searchTimer, openMemory = false;
    refresh.innerHTML = icon('refresh-cw', { size: 16 });
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(label, action, className = 'history-button') {
      const node = element('button', className, label); node.type = 'button';
      node.addEventListener('click', async () => {
        node.disabled = true; notice.textContent = '';
        try { await action(); } catch (error) { notice.textContent = cleanError(error); }
        finally { if (node.isConnected) node.disabled = false; }
      });
      return node;
    }
    function cleanError(error) { return String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
    function date(value) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable'; }
    function metadata(item, kind) {
      return kind === 'chats' ? `${date(item.updatedAt)} · ${item.count} answer${item.count === 1 ? '' : 's'}${item.active ? ' · Current chat' : ''}`
        : `${date(item.startedAt)} · ${item.turnCount} transcript turns${item.live ? ' · Listening now' : ''}`;
    }
    function message(text) { content.replaceChildren(element('p', 'sessions-empty', text)); }
    function section(title, items) {
      if (!items?.length) return;
      content.append(element('h3', 'session-section-title', title));
      const list = element('ul', 'session-notes');
      for (const text of items) { const item = element('li', 'answer-content'); item.innerHTML = root.CueAnswerFormat.render(text); list.append(item); }
      content.append(list);
    }
    async function mutate(action, id, payload, kind = selectedKind) {
      if (kind === 'chats') await cue.chatMutate(action, id, payload);
      else await cue.sessionMutate(action, id, payload);
    }
    function renameEditor(item, kind) {
      editing = 'rename'; content.replaceChildren();
      const form = element('form', 'history-editor'), label = element('label', '', kind === 'chats' ? 'Chat name' : 'Recording name');
      const input = element('input', 'history-input'); input.value = item.title; input.maxLength = 100; input.required = true;
      input.id = 'history-name'; label.htmlFor = input.id;
      const save = button('Save name', async () => { await mutate('rename', item.id, input.value, kind); editing = null; await load(); });
      save.id = 'history-rename-save';
      const actions = element('div', 'history-actions'); actions.append(save, button('Cancel', () => { editing = null; return load(); }));
      form.append(label, input, actions); form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
      content.append(form); input.focus(); input.select();
    }
    function memoryEditor(chat) {
      editing = 'memory'; content.replaceChildren();
      content.append(element('h3', 'session-section-title', 'Memory for this chat'));
      content.append(element('p', 'history-help', 'These preferences belong only to this chat. Your current request wins. No extra AI calls are used to update memory.'));
      const form = element('div', 'history-editor');
      const enabledLabel = element('label', 'history-check');
      const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = chat.memoryEnabled; enabled.id = 'chat-memory-enabled';
      enabledLabel.append(enabled, document.createTextNode('Remember explicit preferences from my messages'));
      form.append(enabledLabel);
      const instructionLabel = element('label', '', 'Instructions for this chat');
      const instructions = element('textarea', 'history-input'); instructions.id = 'chat-instructions'; instructions.rows = 3; instructions.maxLength = 1500;
      instructions.value = chat.instructions || ''; instructions.placeholder = 'For example: explain DP with recursion and memoization, then give complexity.';
      instructionLabel.htmlFor = instructions.id; form.append(instructionLabel, instructions);
      form.append(element('p', 'history-help', 'Instructions always apply when relevant. Turning memory off stops automatic learning and use of saved preferences. Recent answers still support follow-ups.'));
      const rows = element('div', 'memory-rows');
      function addRow(memory = {}) {
        const row = element('div', 'memory-row'); row.dataset.id = memory.id || '';
        const input = element('textarea', 'history-input memory-text'); input.rows = 2; input.maxLength = 360; input.value = memory.text || ''; input.setAttribute('aria-label', 'Saved preference');
        const source = element('small', 'history-help', memory.manual ? 'Saved by you · stays until removed' : `From your message · ${date(memory.updatedAt)} · expires after 90 days`);
        const remove = button('Forget', () => row.remove(), 'history-button history-danger'); remove.setAttribute('aria-label', 'Forget this preference');
        row.append(input, source, remove); rows.append(row); return input;
      }
      chat.memories.forEach(addRow);
      const add = button('Add preference', () => { if (rows.children.length >= 16) throw Error('Keep up to 16 preferences. Remove one to add another.'); addRow({ manual: true }).focus(); });
      const clear = button('Forget all', () => rows.replaceChildren(), 'history-button history-danger'); clear.id = 'chat-memory-clear';
      const actions = element('div', 'history-actions');
      const save = button('Save memory', async () => {
        const memories = [...rows.children].map(row => ({ id: row.dataset.id, text: row.querySelector('textarea').value.trim() })).filter(m => m.text);
        await mutate('memory', chat.id, { instructions: instructions.value, memoryEnabled: enabled.checked, memories }, 'chats');
        editing = null; await load(); notice.textContent = 'Memory saved for this chat.';
      }); save.id = 'chat-memory-save';
      actions.append(save, button('Cancel', () => { editing = null; return load(); }));
      form.append(rows, add, clear, actions); content.append(form); instructions.focus();
    }
    function chatTurn(exchange) {
      const row = element('article', 'history-exchange');
      row.append(element('div', 'session-speaker', 'You'), element('p', 'history-user-text', exchange.user));
      if (exchange.assistant) {
        row.append(element('div', 'session-speaker', 'Cue'));
        const answer = element('div', 'session-summary answer-content'); answer.dataset.raw = exchange.assistant;
        answer.innerHTML = root.CueAnswerFormat.render(exchange.assistant); row.append(answer);
      }
      if (exchange.status !== 'complete') row.append(element('p', 'history-help', exchange.status === 'pending' ? 'Generating…' : exchange.status === 'interrupted' ? 'Interrupted when Cue closed. This partial answer is not used as memory.' : 'Answer failed. ' + (exchange.error || 'Try the question again.')));
      return row;
    }
    function budgetDescription(chat) {
      const budget = [...chat.exchanges].reverse().find(e => e.budget)?.budget;
      return budget ? `Last answer: about ${budget.totalTextTokens.toLocaleString()} text-input tokens (${budget.addedTextTokens.toLocaleString()} from history and memory; ${budget.estimatedInputMultiplier}× a fresh prompt).`
        : 'History and memory use a small, capped part of each prompt.';
    }
    async function showChat(chat) {
      const actions = element('div', 'history-actions');
      actions.append(button('Continue chat', async () => { await mutate('activate', chat.id, null, 'chats'); close(); }),
        button('Rename', () => renameEditor(chat, 'chats')),
        button('Memory', () => memoryEditor(chat)),
        button('Delete', async () => { await mutate('trash', chat.id, null, 'chats'); selectedId = null; await load(); notice.textContent = 'Chat moved to Trash. You can restore it there.'; }, 'history-button history-danger'));
      actions.querySelector('button').id = 'history-continue';
      content.append(actions, element('p', 'session-meta', metadata(chat, 'chats')),
        element('p', 'history-help', budgetDescription(chat)),
        element('p', 'history-help', 'Estimated text input stays below 2× the same fresh prompt, with at most 1,800 added tokens. Actual cost varies by model, output, reasoning and cache pricing.'));
      if (!chat.exchanges.length) content.append(element('p', 'sessions-empty', 'No messages yet. Continue this chat to ask a question.'));
      const turns = element('div', 'history-exchanges');
      chat.exchanges.forEach(exchange => turns.append(chatTurn(exchange)));
      let offset = chat.offset;
      const older = button('Load earlier messages', async () => {
        const next = await cue.chatGet(chat.id, offset); offset = next.offset;
        const height = content.scrollHeight, top = content.scrollTop;
        const fragment = document.createDocumentFragment(); next.exchanges.forEach(e => fragment.append(chatTurn(e)));
        turns.prepend(fragment); older.hidden = offset === 0; content.scrollTop = top + content.scrollHeight - height;
      }); older.id = 'history-load-earlier'; older.hidden = !offset;
      content.append(older, turns);
    }
    function showRecording(data) {
      const actions = element('div', 'history-actions');
      actions.append(button('Rename', () => renameEditor(data, 'recordings')),
        button('Delete', async () => { await mutate('trash', data.id, null, 'recordings'); selectedId = null; await load(); notice.textContent = 'Recording moved to Trash. You can restore it there.'; }, 'history-button history-danger'));
      actions.querySelectorAll('button').forEach(b => { b.disabled = data.live; });
      content.append(actions, element('p', 'session-meta', metadata(data, 'recordings')));
      if (data.live) content.append(element('p', 'history-help', 'Stop listening to rename or remove this recording.'));
      if (data.summary) {
        const summary = element('div', 'session-summary answer-content'); summary.innerHTML = root.CueAnswerFormat.render(data.summary);
        content.append(element('h3', 'session-section-title', 'Summary'), summary);
      }
      section('Key points', data.keyPoints); section('Decisions', data.decisions); section('Action items', data.actionItems); section('Follow-up', data.followUp);
      content.append(element('h3', 'session-section-title', 'Transcript'));
      if (!data.transcript.length) content.append(element('p', 'sessions-empty', 'No transcript saved.'));
      for (const turn of data.transcript) {
        const row = element('div', 'session-turn');
        const who = turn.channel === 'you' ? 'You' : 'Them';
        const time = turn.ts ? new Date(turn.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
        row.append(element('span', 'session-speaker', `${who}${time ? ' · ' + time : ''}`), element('p', '', turn.text)); content.append(row);
      }
    }
    async function load() {
      const request = ++version;
      refresh.disabled = true; back.classList.toggle('hidden', !selectedId);
      search.hidden = !!selectedId; tabs.hidden = !!selectedId;
      $('#history-new').hidden = !!selectedId || tab !== 'chats';
      content.setAttribute('aria-busy', 'true'); message('Loading history…');
      try {
        let data;
        if (selectedId) data = selectedKind === 'chats' ? await cue.chatGet(selectedId) : await cue.sessionGet(selectedId);
        else if (tab === 'trash') {
          const [chats, recordings] = await Promise.all([cue.chatsList({ trash: true }), cue.sessionsList({ trash: true })]);
          data = [...chats.map(c => ({ ...c, kind: 'chats' })), ...recordings.map(c => ({ ...c, kind: 'recordings' }))];
        } else data = tab === 'chats' ? await cue.chatsList({ query: search.value }) : await cue.sessionsList();
        if (request !== version || scrim.classList.contains('hidden')) return;
        content.replaceChildren(); content.scrollTop = 0;
        if (!selectedId) {
          $('#sessions-title').textContent = 'History';
          tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
          const needle = search.value.toLowerCase();
          data = data.filter(item => !needle || (item.title + ' ' + (item.preview || item.summary || '')).toLowerCase().includes(needle));
          if (!data.length) { message(needle ? 'No matches. Try a different name.' : tab === 'chats' ? 'Your chats will appear here as soon as you ask Cue a question.' : tab === 'trash' ? 'Trash is empty. Deleted chats and recordings can be restored here.' : 'No saved recordings yet. Start listening to save a conversation.'); return; }
          let shown = 0;
          const more = button('Show more', () => { more.remove(); appendPage(); });
          function appendPage() {
            for (const item of data.slice(shown, shown + 30)) {
              const kind = item.kind || tab;
              const card = element('button', 'session-card'); card.type = 'button';
              card.append(element('strong', 'session-card-title', item.title), element('span', 'session-meta', metadata(item, kind)));
              if (item.preview || item.summary) card.append(element('span', 'session-preview', item.preview || item.summary));
              if (tab === 'trash') {
                const row = element('div', 'history-trash-row'); card.disabled = true;
                row.append(card, button('Restore', async () => { await mutate('restore', item.id, null, kind); await load(); notice.textContent = 'Restored to ' + (kind === 'chats' ? 'Chats.' : 'Recordings.'); })); content.append(row);
              } else {
                card.addEventListener('click', () => { selectedId = item.id; selectedKind = kind; editing = null; void load(); });
                const row = element('div', 'history-card-row');
                const menu = element('div', 'history-item-menu'); menu.hidden = true;
                const options = button('⋯', () => {
                  const reveal = menu.hidden;
                  content.querySelectorAll('.history-item-menu').forEach(m => { m.hidden = true; });
                  content.querySelectorAll('.history-item-options').forEach(b => b.setAttribute('aria-expanded', 'false'));
                  menu.hidden = !reveal; options.setAttribute('aria-expanded', String(reveal));
                }, 'history-button history-item-options');
                options.setAttribute('aria-label', 'Options for ' + item.title); options.setAttribute('aria-expanded', 'false');
                menu.append(button('Rename', async () => {
                  selectedId = item.id; selectedKind = kind; await load(); renameEditor(item, kind);
                }), button('Delete', async () => {
                  await mutate('trash', item.id, null, kind); await load(); notice.textContent = 'Moved to Trash. You can restore it there.';
                }, 'history-button history-danger'));
                menu.querySelectorAll('button').forEach(b => { b.disabled = !!item.live; });
                row.append(card, options, menu); content.append(row);
              }
            }
            shown += 30; if (shown < data.length) content.append(more);
          }
          appendPage();
        } else if (!data) message('This item is no longer available. Return to History and refresh.');
        else {
          $('#sessions-title').textContent = data.title;
          if (selectedKind === 'chats' && openMemory) { openMemory = false; memoryEditor(data); }
          else { if (selectedKind === 'chats') await showChat(data); else showRecording(data); back.focus(); }
        }
      } catch (error) { if (request === version) message('Could not load history. ' + cleanError(error)); }
      finally { if (request === version) { refresh.disabled = false; content.setAttribute('aria-busy', 'false'); } }
    }
    function open(options = {}) {
      if (scrim.classList.contains('hidden')) returnFocus = document.activeElement;
      selectedId = options.id || null; selectedKind = options.kind || 'chats'; tab = options.tab || 'chats'; editing = null; openMemory = !!options.memory;
      notice.textContent = ''; search.value = ''; scrim.classList.remove('hidden'); onOpen(); done.focus(); void load();
    }
    function close() { ++version; clearTimeout(searchTimer); scrim.classList.add('hidden'); if (returnFocus?.isConnected) returnFocus.focus(); }
    done.addEventListener('click', close);
    refresh.addEventListener('click', () => { editing = null; void load(); });
    back.addEventListener('click', () => { selectedId = null; editing = null; void load(); });
    $('#history-new').addEventListener('click', async () => { try { await cue.chatMutate('create'); close(); } catch (e) { notice.textContent = cleanError(e); } });
    tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; selectedId = null; editing = null; search.value = ''; notice.textContent = ''; void load(); }));
    search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => void load(), 180); });
    $('#sessions-btn').addEventListener('click', () => open());
    cue.on('ui:open-sessions', () => open());
    cue.on('chats:changed', () => { if (!scrim.classList.contains('hidden') && !editing && !selectedId) void load(); });
    scrim.addEventListener('click', event => { if (event.target === scrim) close(); });
    document.addEventListener('keydown', event => {
      if (scrim.classList.contains('hidden')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...$('#sessions').querySelectorAll('button:not([disabled]), input, textarea, [tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    return { open, close };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueSessionHistory = { install };
})(typeof window === 'object' ? window : globalThis);
