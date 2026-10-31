(function (root) {
  function install({ cue, document = root.document, icon, isBusy = () => false, onOpen = () => {} }) {
    const $ = selector => document.querySelector(selector);
    const sidebar = $('#chat-sidebar'), list = $('#sidebar-list'), search = $('#sidebar-search');
    const toggle = $('#chat-sidebar-toggle'), backdrop = $('#chat-sidebar-backdrop');
    const main = $('#panel-main'), detail = $('#library-detail'), columns = $('#panel-columns');
    const notice = $('#sidebar-notice');
    let open = false, tab = 'chats', generation = 0, pending = false, editing = false, timer, recordingId = null, readerGeneration = 0;
    let activeMenu = null, menuSequence = 0;
    const readPreference = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const remember = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
    const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
    const message = text => { notice.textContent = text; notice.hidden = !text; };
    function button(text, action, cls = 'library-action') {
      const node = el('button', cls, text); node.type = 'button';
      node.addEventListener('click', () => Promise.resolve().then(action).catch(error => message(cleanError(error)))); return node;
    }
    function cleanError(error) { return String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
    function lockControls() {
      sidebar.querySelectorAll('[data-mutation]').forEach(node => { node.disabled = pending || isBusy() || node.dataset.live === 'true'; });
      $('#sidebar-new-chat').disabled = pending || isBusy();
    }
    async function action(work) {
      if (pending || isBusy()) { message('Finish or stop the current answer before changing chats.'); return; }
      pending = true; lockControls(); message('');
      try { await work(); } finally { pending = false; lockControls(); }
    }
    function compact() { return columns.clientWidth < 650; }
    function layout() {
      columns.classList.toggle('library-compact', compact());
      backdrop.hidden = !(open && compact());
      main.inert = detail.inert = open && compact();
    }
    function closeMenus(restoreFocus = false) {
      if (!activeMenu) return;
      const { menu, options } = activeMenu; activeMenu = null;
      if (menu.matches(':popover-open')) menu.hidePopover();
      menu.hidden = true; options.setAttribute('aria-expanded', 'false');
      if (restoreFocus && options.isConnected) options.focus({ preventScroll: true });
    }
    function openMenu(menu, options) {
      const alreadyOpen = activeMenu?.menu === menu; closeMenus();
      if (alreadyOpen) { options.focus({ preventScroll: true }); return; }
      // The browser's top layer escapes the list's scroll clipping without
      // changing row height. Position in CSS viewport coordinates, including zoom.
      menu.hidden = false; menu.showPopover();
      const anchor = options.getBoundingClientRect(), bounds = $('#panel').getBoundingClientRect();
      const popup = menu.getBoundingClientRect(), gap = 8;
      const left = anchor.right + gap + popup.width <= bounds.right - gap ? anchor.right + gap
        : anchor.left - gap - popup.width >= bounds.left + gap ? anchor.left - gap - popup.width
        : Math.max(bounds.left + gap, bounds.right - gap - popup.width);
      menu.style.left = left + 'px';
      menu.style.top = Math.max(bounds.top + gap, Math.min(anchor.top - 6, bounds.bottom - gap - popup.height)) + 'px';
      activeMenu = { menu, options }; options.setAttribute('aria-expanded', 'true');
      menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }
    function menuAction(label, glyph, work, danger = false) {
      const node = button('', () => { closeMenus(); return work(); }, 'library-action' + (danger ? ' danger' : ''));
      const mark = el('span', 'library-glyph menu-' + glyph + '-glyph'); mark.setAttribute('aria-hidden', 'true');
      node.append(mark, el('span', '', label)); node.setAttribute('role', 'menuitem'); node.tabIndex = -1;
      return node;
    }
    function setOpen(next, focus = true) {
      open = next; sidebar.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Collapse chat sidebar' : 'Open chat sidebar'); toggle.title = open ? 'Collapse chat sidebar' : 'Open chat sidebar';
      remember('cue.library.open', String(open)); layout();
      if (open) { onOpen(); void refresh(); if (focus) search.focus(); }
      else { ++generation; editing = false; closeMenus(); if (focus) toggle.focus(); }
    }
    function showChat() { ++readerGeneration; recordingId = null; detail.hidden = true; main.hidden = false; detail.replaceChildren(); layout(); }
    async function mutate(kind, type, id, payload) {
      if (kind === 'chats') return cue.chatMutate(type, id, payload);
      return cue.sessionMutate(type, id, payload);
    }
    function date(value) { return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; }
    function group(item, kind) {
      if (tab === 'trash') return kind === 'chats' ? 'Deleted chats' : 'Deleted recordings';
      if (item.pinnedAt && kind === 'chats') return 'Pinned';
      const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const timestamp = item.updatedAt || item.startedAt || 0;
      return timestamp >= today ? 'Today' : timestamp >= today - 86400000 ? 'Yesterday' : timestamp >= today - 7 * 86400000 ? 'Previous 7 days' : 'Older';
    }
    function rename(row, item, kind) {
      closeMenus(); editing = true; row.replaceChildren();
      const form = el('form', 'library-rename'), input = el('input'); input.value = item.title; input.maxLength = 100; input.required = true; input.setAttribute('aria-label', 'Rename ' + item.title);
      const save = button('Save', () => action(async () => {
        if (!input.value.trim()) { message('Enter a name for this ' + (kind === 'chats' ? 'chat.' : 'recording.')); input.focus(); return; }
        await mutate(kind, 'rename', item.id, input.value); editing = false; await refresh();
        if (recordingId === item.id) await openRecording(item.id);
      })); save.dataset.mutation = '';
      const cancel = button('Cancel', () => { editing = false; void refresh(); });
      form.append(input, save, cancel); form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
      form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); cancel.click(); } });
      row.append(form); input.focus(); input.select();
    }
    function render(items) {
      closeMenus(); const top = list.scrollTop; list.replaceChildren();
      if (!items.length) { list.append(el('p', 'library-empty', search.value ? 'No matching items.' : tab === 'trash' ? 'Nothing in Trash. Deleted chats and recordings can be restored here.' : tab === 'recordings' ? 'Your recorded conversations will appear here.' : 'Start a new chat. It will be saved here.')); return; }
      let shown = 0, lastGroup = '';
      const more = button('Show more', () => { more.remove(); appendPage(); }); more.id = 'sidebar-load-more';
      function appendPage() {
        for (const item of items.slice(shown, shown + 40)) {
          const kind = item.kind, heading = group(item, kind);
          if (heading !== lastGroup) { list.append(el('h3', 'library-group', heading)); lastGroup = heading; }
          const selected = kind === 'chats' ? item.active : item.id === recordingId;
          const row = el('div', 'library-row' + (selected ? ' selected' : '')); row.dataset.id = item.id; row.dataset.kind = kind;
          const select = button('', () => action(async () => {
            if (kind === 'chats') { await cue.chatMutate('activate', item.id); showChat(); if (compact()) setOpen(false, false); $('#input').focus(); }
            else { await openRecording(item.id); if (compact()) setOpen(false, false); detail.querySelector('.library-recording-body')?.focus(); }
          }), 'library-item');
          select.dataset.mutation = ''; select.title = item.title;
          if (selected) select.setAttribute('aria-current', 'page');
          select.append(el('span', 'library-item-title', item.title), el('small', 'library-item-date', date(item.updatedAt || item.startedAt) + (item.live ? ' · Recording' : '')));
          if (item.pinnedAt && kind === 'chats') { const pin = el('span', 'library-pin'); pin.innerHTML = icon('pin', { size: 12 }); pin.setAttribute('aria-label', 'Pinned'); select.append(pin); }
          row.append(select);
          if (tab === 'trash') {
            select.disabled = true; delete select.dataset.mutation;
            const restore = button('Restore', () => action(async () => { await mutate(kind, 'restore', item.id); await refresh(); message('Restored to ' + (kind === 'chats' ? 'Chats.' : 'Recordings.')); }), 'library-restore');
            restore.dataset.mutation = ''; row.append(restore);
          } else {
            const menu = el('div', 'library-menu'); menu.hidden = true; menu.popover = 'manual'; menu.id = 'library-menu-' + (++menuSequence);
            menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Actions for ' + item.title); menu.dataset.noWindowDrag = '';
            const options = button('⋯', () => openMenu(menu, options), 'library-options');
            options.setAttribute('aria-label', 'Options for ' + item.title); options.setAttribute('aria-expanded', 'false');
            options.setAttribute('aria-haspopup', 'menu'); options.setAttribute('aria-controls', menu.id);
            menu.append(menuAction('Rename', 'rename', () => rename(row, item, kind)));
            if (kind === 'chats') menu.append(menuAction(item.pinnedAt ? 'Unpin' : 'Pin', 'pin', () => action(async () => { await cue.chatMutate('pin', item.id, !item.pinnedAt); await refresh(); })));
            const divider = el('div', 'library-menu-divider'); divider.setAttribute('role', 'separator'); menu.append(divider);
            menu.append(menuAction('Delete', 'delete', () => action(async () => {
              await mutate(kind, 'trash', item.id); if (recordingId === item.id) showChat(); await refresh(); message('Moved to Trash. You can restore it there.');
            }), true));
            menu.addEventListener('keydown', event => {
              const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab'];
              if (!keys.includes(event.key)) return;
              event.stopPropagation();
              if (event.key === 'Tab') { closeMenus(true); return; }
              event.preventDefault();
              if (event.key === 'Escape') { closeMenus(true); return; }
              const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
              const index = buttons.indexOf(document.activeElement);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
              buttons[next]?.focus({ preventScroll: true });
            });
            options.addEventListener('keydown', event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); event.stopPropagation(); openMenu(menu, options);
                if (event.key === 'ArrowUp') [...menu.querySelectorAll('button:not(:disabled)')].at(-1)?.focus({ preventScroll: true });
              }
            });
            menu.querySelectorAll('button').forEach(node => { node.dataset.mutation = ''; node.dataset.live = String(!!item.live); });
            row.append(options, menu);
          }
          list.append(row);
        }
        shown += 40; if (shown < items.length) list.append(more); lockControls();
      }
      appendPage(); list.scrollTop = top;
    }
    async function refresh() {
      if (!open || editing) return;
      const request = ++generation, category = tab, query = search.value.trim().toLowerCase();
      list.setAttribute('aria-busy', 'true');
      try {
        let items;
        if (category === 'trash') {
          const [chats, recordings] = await Promise.all([cue.chatsList({ trash: true }), cue.sessionsList({ trash: true })]);
          items = [...chats.map(item => ({ ...item, kind: 'chats' })), ...recordings.map(item => ({ ...item, kind: 'recordings' }))];
        } else items = (category === 'chats' ? await cue.chatsList({ query }) : await cue.sessionsList()).map(item => ({ ...item, kind: category }));
        if (request !== generation || !open) return;
        render(items.filter(item => !query || (item.title + ' ' + (item.preview || item.summary || '')).toLowerCase().includes(query)));
      } catch (error) { if (request === generation) message('Could not load the library. ' + cleanError(error)); }
      finally { if (request === generation) list.setAttribute('aria-busy', 'false'); }
    }
    async function openRecording(id) {
      const request = ++readerGeneration;
      const data = await cue.sessionGet(id); if (request !== readerGeneration) return;
      if (!data) { message('This recording is no longer available.'); return; }
      recordingId = id; main.hidden = true; detail.hidden = false; detail.replaceChildren();
      const header = el('div', 'library-detail-header');
      header.append(button('← Back to chat', () => { showChat(); $('#input').focus(); }), el('h2', '', data.title));
      const body = el('div', 'library-recording-body'); body.tabIndex = 0;
      if (data.summary) { const summary = el('div', 'answer-content'); summary.innerHTML = root.CueAnswerFormat.render(data.summary); body.append(summary); }
      for (const [key, title] of [['keyPoints', 'Key points'], ['decisions', 'Decisions'], ['actionItems', 'Action items'], ['followUp', 'Follow-up']]) {
        if (!data[key]?.length) continue;
        const section = el('section', 'library-recording-notes'), notes = el('ul');
        section.append(el('h3', '', title), notes); data[key].forEach(text => notes.append(el('li', '', text))); body.append(section);
      }
      if (data.live) body.append(el('p', 'library-empty', 'Recording in progress. Reopen this recording to refresh the transcript.'));
      let shown = 0; const more = button('Show more transcript', () => { more.remove(); appendPage(); });
      const turns = el('div');
      function appendPage() {
        for (const turn of data.transcript.slice(shown, shown + 60)) {
          const row = el('article', 'library-recording-turn'); row.append(el('strong', '', turn.channel === 'you' ? 'You' : 'Call'), el('p', '', turn.text)); turns.append(row);
        }
        shown += 60; if (shown < data.transcript.length) body.append(more);
      }
      body.append(turns); appendPage(); detail.append(header, body); layout(); void refresh();
    }
    toggle.addEventListener('click', () => setOpen(!open));
    $('#chat-sidebar-close').addEventListener('click', () => setOpen(false)); backdrop.addEventListener('click', () => setOpen(false));
    $('#sidebar-new-chat').addEventListener('click', () => action(async () => { await cue.chatMutate('create'); showChat(); if (compact()) setOpen(false, false); $('#input').focus(); }).catch(error => message(cleanError(error))));
    $('#sidebar-tabs').querySelectorAll('button').forEach(node => node.addEventListener('click', () => {
      closeMenus(); tab = node.dataset.libraryTab; editing = false; search.value = ''; list.scrollTop = 0; message(''); remember('cue.library.tab', tab);
      $('#sidebar-tabs').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button === node)));
      search.placeholder = 'Search ' + tab; void refresh();
    }));
    search.addEventListener('input', () => { editing = false; list.scrollTop = 0; clearTimeout(timer); timer = setTimeout(refresh, 150); });
    sidebar.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (activeMenu) closeMenus(true); else { editing = false; setOpen(false); } }
      if (event.key === 'Tab' && compact()) {
        const controls = [...sidebar.querySelectorAll('button:not(:disabled), input, [tabindex="0"]')].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    document.addEventListener('pointerdown', event => { if (!event.target.closest('.library-options, .library-menu')) closeMenus(); });
    document.addEventListener('focusin', event => { if (activeMenu && !activeMenu.menu.contains(event.target) && event.target !== activeMenu.options) closeMenus(); });
    list.addEventListener('scroll', () => closeMenus(), { passive: true });
    root.addEventListener('resize', () => closeMenus()); root.addEventListener('blur', () => closeMenus());
    new root.MutationObserver(() => { if ($('#panel-wrap').classList.contains('collapsed')) closeMenus(); }).observe($('#panel-wrap'), { attributes: true, attributeFilter: ['class'] });
    for (const event of ['chats:changed', 'chats:meta', 'chats:active', 'llm:done', 'capture:state']) cue.on(event, () => { if (event === 'chats:active') showChat(); void refresh(); });
    cue.on('answer:state', lockControls);
    new root.ResizeObserver(layout).observe(columns);
    const savedTab = readPreference('cue.library.tab'); if (['chats','recordings','trash'].includes(savedTab)) $('#sidebar-tabs [data-library-tab="' + savedTab + '"]').click();
    setOpen(readPreference('cue.library.open') === 'true', false);
    return { refresh, setOpen };
  }
  root.CueChatSidebar = { install };
})(window);
