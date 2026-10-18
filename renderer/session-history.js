(function (root) {
  function install({ cue, document = root.document, icon, onOpen = () => {} }) {
    const $ = selector => document.querySelector(selector);
    const scrim = $('#sessions-scrim'), content = $('#sessions-content');
    const back = $('#sessions-back'), refresh = $('#sessions-refresh'), done = $('#sessions-close');
    let selectedId = null, version = 0, returnFocus = null;
    refresh.innerHTML = icon('refresh-cw', { size: 16 });
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function date(value) {
      return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
    }
    function metadata(session) {
      return `${date(session.startedAt)} · ${session.turnCount} message${session.turnCount === 1 ? '' : 's'}${session.live ? ' · Listening now' : ''}`;
    }
    function message(text) { content.replaceChildren(element('p', 'sessions-empty', text)); }
    function section(title, items) {
      if (!items?.length) return;
      content.append(element('h3', 'session-section-title', title));
      const list = element('ul', 'session-notes');
      for (const text of items) { const item = element('li', 'answer-content'); item.innerHTML = root.CueAnswerFormat.render(text); list.append(item); }
      content.append(list);
    }
    async function load() {
      const request = ++version;
      refresh.disabled = true; back.classList.toggle('hidden', !selectedId);
      content.setAttribute('aria-busy', 'true');
      message('Loading sessions…');
      try {
        const data = selectedId ? await cue.sessionGet(selectedId) : await cue.sessionsList();
        if (request !== version || scrim.classList.contains('hidden')) return;
        content.replaceChildren(); content.scrollTop = 0;
        if (!selectedId) {
          $('#sessions-title').textContent = 'Sessions';
          if (!data.length) { message('No saved sessions yet. Start listening to save your conversation here.'); return; }
          for (const session of data) {
            const card = element('button', 'session-card'); card.type = 'button';
            card.append(element('strong', 'session-card-title', session.title), element('span', 'session-meta', metadata(session)));
            if (session.summary) card.append(element('span', 'session-preview', session.summary));
            card.addEventListener('click', () => { selectedId = session.id; void load(); });
            content.append(card);
          }
        } else if (!data) {
          message('This session is no longer available. Return to all sessions and refresh.');
        } else {
          $('#sessions-title').textContent = data.title;
          content.append(element('p', 'session-meta', metadata(data)));
          if (data.summary) {
            const summary = element('div', 'session-summary answer-content'); summary.innerHTML = root.CueAnswerFormat.render(data.summary);
            content.append(element('h3', 'session-section-title', 'Summary'), summary);
          }
          section('Key points', data.keyPoints); section('Decisions', data.decisions);
          section('Action items', data.actionItems); section('Follow-up', data.followUp);
          content.append(element('h3', 'session-section-title', 'Transcript'));
          if (!data.transcript.length) content.append(element('p', 'sessions-empty', 'No transcript saved.'));
          for (const turn of data.transcript) {
            const row = element('div', 'session-turn');
            const who = turn.channel === 'you' ? 'You' : 'Them';
            const time = turn.ts ? new Date(turn.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
            row.append(element('span', 'session-speaker', `${who}${time ? ' · ' + time : ''}`), element('p', '', turn.text));
            content.append(row);
          }
          back.focus();
        }
      } catch (error) {
        if (request === version) message('Could not load sessions. ' + (error.message || 'Try refreshing.'));
      } finally {
        if (request === version) { refresh.disabled = false; content.setAttribute('aria-busy', 'false'); }
      }
    }
    function open() {
      if (scrim.classList.contains('hidden')) returnFocus = document.activeElement;
      selectedId = null;
      scrim.classList.remove('hidden'); onOpen(); done.focus(); void load();
    }
    function close() {
      ++version;
      scrim.classList.add('hidden');
      if (returnFocus?.isConnected) returnFocus.focus();
    }
    done.addEventListener('click', close);
    refresh.addEventListener('click', () => { void load(); });
    back.addEventListener('click', () => { selectedId = null; void load(); });
    $('#sessions-btn').addEventListener('click', open);
    cue.on('ui:open-sessions', open);
    scrim.addEventListener('click', event => { if (event.target === scrim) close(); });
    document.addEventListener('keydown', event => {
      if (scrim.classList.contains('hidden')) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = Array.from($('#sessions').querySelectorAll('button:not([disabled]), [tabindex="0"]')).filter(node => !node.classList.contains('hidden'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    return { open, close };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueSessionHistory = { install };
})(typeof window === 'object' ? window : globalThis);
