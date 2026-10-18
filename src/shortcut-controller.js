const { DEFAULTS } = require('./shortcuts');

const ACTION_NAMES = ['say', 'assist', 'leetcode', 'quit'];

// Unregister unused accelerators with the OS. Ignoring their callbacks alone
// would still swallow the keystrokes before another application receives them.
function createShortcutController({ globalShortcut, canRunActions, actions, state = {},
  onUnavailable = () => {}, onError = () => {} }) {
  let started = false, disposed = false;
  const attempted = new Set();
  const names = [...ACTION_NAMES, 'hide'];
  for (const name of names) state[name] = false;

  function release(name) {
    if (state[name]) globalShortcut.unregister(DEFAULTS[name]);
    state[name] = false;
    attempted.delete(name);
  }
  function sync() {
    if (!started || disposed) return;
    const active = canRunActions();
    for (const name of names) {
      if (name !== 'hide' && !active) { release(name); continue; }
      if (attempted.has(name)) continue;
      attempted.add(name);
      try {
        state[name] = globalShortcut.register(DEFAULTS[name], () => {
          if (disposed || (name !== 'hide' && !canRunActions())) return;
          try { Promise.resolve(actions[name]()).catch(error => onError(name, error)); }
          catch (error) { onError(name, error); }
        });
        if (!state[name]) onUnavailable(name);
      } catch (error) { state[name] = false; onUnavailable(name, error); }
    }
  }
  return {
    start() { if (disposed) return; started = true; sync(); },
    sync,
    dispose() { if (disposed) return; disposed = true; for (const name of names) release(name); }
  };
}

module.exports = { createShortcutController, ACTION_NAMES };
