const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { learnPreferences, activeMemories, preferenceKey, recallText, MAX_MEMORIES } = require('./chat-memory');
const ID = /^[a-z0-9-]{1,80}$/i;
const clone = value => structuredClone(value);

function atomicWrite(file, value) {
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}
function titleFrom(text, mode) {
  const prose = text.replace(/```[\s\S]*?(?:```|$)/g, '').split('\n').map(s => s.trim())
    .filter(s => s && !/[{};]|^#include|^public:|^class |^def |^return /.test(s));
  const line = prose.find(s => /\?|^(?:what|how|why|explain|solve|help|compare|implement)\b/i.test(s)) || prose[0];
  const fallback = { leetcode: 'Screen coding question', assist: 'Screen assistance', say: 'Live conversation', answerThis: 'Live conversation', recap: 'Conversation recap' }[mode] || 'New chat';
  return (line || fallback).replace(/\s+/g, ' ').slice(0, 72);
}

function createChatStore({ directory, now = Date.now, onError = () => {} }) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const indexFile = path.join(directory, 'index.json');
  const cache = new Map(), summaries = new Map(), dirty = new Set(), warnings = [];
  let activeId = null, timer = null;
  const fileFor = id => {
    if (typeof id !== 'string' || !ID.test(id) || id === 'index') throw Error('Invalid chat ID.');
    return path.join(directory, id + '.json');
  };
  function summary(chat) {
    return { id: chat.id, title: chat.title, modeId: chat.modeId, createdAt: chat.createdAt, updatedAt: chat.updatedAt,
      deletedAt: chat.deletedAt || null, count: chat.exchanges.length, preview: chat.exchanges.at(-1)?.user.slice(0, 180) || '',
      pinnedAt: Number.isFinite(chat.pinnedAt) ? chat.pinnedAt : null, contextEnabled: chat.contextEnabled !== false,
      memoryCount: activeMemories(chat.memories, now()).length, active: chat.id === activeId };
  }
  function read(id) {
    if (cache.has(id)) return cache.get(id);
    const chat = JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
    if (chat.version !== 1 || chat.id !== id || !Array.isArray(chat.exchanges) || !Array.isArray(chat.memories)) throw Error('Saved chat is unreadable. Its file has been preserved.');
    cache.set(id, chat); return chat;
  }
  function write(chat) {
    // Calculate metadata before touching the durable file, so malformed data
    // cannot overwrite a previously valid chat and then fail during indexing.
    const metadata = summary(chat);
    atomicWrite(fileFor(chat.id), chat);
    cache.set(chat.id, chat); summaries.set(chat.id, metadata); dirty.delete(chat.id);
  }
  function saveIndex() { atomicWrite(indexFile, { version: 1, activeId }); }
  // Rebuild the lightweight catalog from durable files, so a crash between a
  // chat save and index update cannot hide a conversation. Never reset bad files.
  for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.json') && name !== 'index.json')) {
    const id = file.slice(0, -5);
    try {
      const chat = read(id);
      let interrupted = false;
      for (const exchange of chat.exchanges) if (exchange.status === 'pending') { exchange.status = 'interrupted'; interrupted = true; }
      if (interrupted) write(chat);
      summaries.set(id, summary(chat));
    } catch { warnings.push('A saved chat could not be opened. Its original file is still on this device.'); }
  }
  try { const index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); if (summaries.has(index.activeId) && !read(index.activeId).deletedAt) activeId = index.activeId; } catch { /* Catalog remains recoverable from chat files. */ }
  // An explicitly empty activeId (after removing a chat) must remain empty.
  function requireChat(id, allowTrash = false) {
    if (!summaries.has(id)) throw Error('Chat not found.');
    const chat = read(id);
    if (chat.deletedAt && !allowTrash) throw Error('This chat is in Trash. Restore it first.');
    return chat;
  }
  function mutate(id, fn, allowTrash = false) {
    const next = clone(requireChat(id, allowTrash)); fn(next); next.updatedAt = now(); write(next); return clone(next);
  }
  function flush() {
    if (timer) clearTimeout(timer); timer = null;
    for (const id of [...dirty]) write(read(id));
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { flush(); } catch { onError('Could not save the current answer. Check available disk space.'); } }, 700);
    timer.unref?.();
  }
  const api = {
    get activeId() { return activeId; }, warnings,
    list({ trash = false, query = '' } = {}) {
      const needle = String(query).toLowerCase().slice(0, 160);
      return [...summaries.values()].filter(c => !!c.deletedAt === !!trash && (!needle || (c.title + ' ' + c.preview).toLowerCase().includes(needle)))
        .sort((a,b) => Number(!!b.pinnedAt)-Number(!!a.pinnedAt) || (b.pinnedAt || 0)-(a.pinnedAt || 0) || b.updatedAt-a.updatedAt).map(c => ({ ...c, active: c.id === activeId }));
    },
    get(id = activeId) { return id ? clone(requireChat(id)) : null; },
    metadata(id = activeId) {
      if (!id) return null;
      const chat = requireChat(id);
      return { ...summary(chat), meetingId: chat.meetingId, instructions: chat.instructions, memoryEnabled: chat.memoryEnabled,
        memories: clone(activeMemories(chat.memories, now())), total: chat.exchanges.length };
    },
    context(id = activeId) {
      const chat = requireChat(id);
      // Main-process inference reads immutable strings; do not deep-clone all
      // old code answers just to select a small context window.
      return { contextEnabled: chat.contextEnabled !== false, instructions: chat.instructions, memoryEnabled: chat.memoryEnabled, memories: clone(chat.memories),
        exchanges: chat.exchanges.map(exchange => Object.freeze({ ...exchange })) };
    },
    page(id = activeId, before) {
      if (!id) return null;
      const chat = requireChat(id);
      const end = Number.isInteger(before) ? Math.max(0, Math.min(before, chat.exchanges.length)) : chat.exchanges.length;
      const start = Math.max(0, end - 30);
      return { ...summary(chat), instructions: chat.instructions, memoryEnabled: chat.memoryEnabled,
        memories: clone(activeMemories(chat.memories, now())), exchanges: clone(chat.exchanges.slice(start, end)), offset: start, total: chat.exchanges.length };
    },
    create(modeId = 'general', scope = '') {
      flush();
      const chat = { version: 1, id: randomUUID(), title: 'New chat', customTitle: false,
        createdAt: now(), updatedAt: now(), modeId, scope, meetingId: null,
        instructions: '', contextEnabled: true, memoryEnabled: true, memories: [], exchanges: [], deletedAt: null };
      write(chat); activeId = chat.id; saveIndex(); return api.page();
    },
    activate(id) { flush(); requireChat(id); activeId = id; saveIndex(); return api.page(); },
    rename(id, title) {
      if (typeof title !== 'string' || !title.trim() || title.trim().length > 100) throw Error('Use a chat name between 1 and 100 characters.');
      mutate(id, chat => { chat.title = title.trim(); chat.customTitle = true; }); return api.page(id);
    },
    trash(id) {
      flush(); mutate(id, chat => { chat.deletedAt = now(); });
      if (id === activeId) { activeId = null; saveIndex(); }
      return true;
    },
    restore(id) { mutate(id, chat => { chat.deletedAt = null; }, true); return true; },
    begin({ user, mode, scope, category, small, meetingId }) {
      if (!activeId) throw Error('Create a chat before asking a question.');
      const id = randomUUID(), timestamp = now();
      mutate(activeId, chat => {
        if (!chat.exchanges.length && !chat.customTitle) chat.title = titleFrom(user, mode);
        chat.scope = scope; if (meetingId) chat.meetingId = meetingId;
        chat.exchanges.push({ id, user, assistant: '', mode, scope, category, small: !!small, createdAt: timestamp, status: 'pending' });
        if (mode === 'ask') {
          const learned = learnPreferences(chat.memories, user, id, timestamp);
          const changed = JSON.stringify(learned) !== JSON.stringify(chat.memories);
          const contextUser = changed ? recallText(user) : user;
          chat.exchanges.at(-1).preferenceUpdate = changed && !contextUser;
          if (changed) chat.exchanges.at(-1).contextUser = contextUser;
          if (chat.memoryEnabled && chat.contextEnabled !== false) chat.memories = learned;
        }
      });
      return { chatId: activeId, exchangeId: id };
    },
    append({ chatId, exchangeId }, text) {
      const chat = requireChat(chatId), exchange = chat.exchanges.find(e => e.id === exchangeId);
      if (!exchange || exchange.status !== 'pending') return;
      exchange.assistant += text; dirty.add(chatId); schedule();
    },
    finish({ chatId, exchangeId }, { answer, status = 'complete', error = '', budget = null }) {
      mutate(chatId, chat => {
        const exchange = chat.exchanges.find(e => e.id === exchangeId);
        if (!exchange || exchange.status !== 'pending') return;
        if (typeof answer === 'string') exchange.assistant = answer;
        exchange.status = status; exchange.error = String(error).slice(0, 600); exchange.budget = budget;
      });
    },
    setContextEnabled(id, enabled) {
      if (typeof enabled !== 'boolean') throw Error('Choose whether chat context is on or off.');
      mutate(id, chat => { chat.contextEnabled = enabled; });
      return api.metadata(id);
    },
    pin(id, pinned) {
      if (typeof pinned !== 'boolean') throw Error('Choose whether to pin this chat.');
      mutate(id, chat => { chat.pinnedAt = pinned ? now() : null; });
      return api.metadata(id);
    },
    setMemory(id, { instructions, memoryEnabled, memories }) {
      if (typeof instructions !== 'string' || instructions.length > 1500 || typeof memoryEnabled !== 'boolean' || !Array.isArray(memories) || memories.length > MAX_MEMORIES) throw Error('Invalid chat memory settings.');
      const saved = requireChat(id);
      const normalized = memories.map(m => {
        if (typeof m.text !== 'string' || !m.text.trim() || m.text.length > 360) throw Error('Each preference must contain 1–360 characters.');
        const old = saved.memories.find(item => item.id === m.id);
        return old && old.text === m.text ? old : { id: old?.id || randomUUID(), key: preferenceKey(m.text), text: m.text.trim(), sourceId: old?.sourceId || null, updatedAt: now(), manual: true };
      });
      const unique = new Map(); normalized.forEach(m => { unique.delete(m.key); unique.set(m.key, m); });
      mutate(id, chat => { chat.instructions = instructions; chat.memoryEnabled = memoryEnabled; chat.memories = [...unique.values()]; });
      return api.page(id);
    },
    flush,
  };
  return api;
}
module.exports = { createChatStore, atomicWrite, titleFrom };
