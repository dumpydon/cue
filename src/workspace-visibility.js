// Workspace membership is independent from screen-share protection and window
// level. Default to the current Space; following full-screen apps is opt-in.
function createWorkspaceVisibility({ platform = process.platform, getWindow, readPreference, writePreference }) {
  const available = platform === 'darwin' || platform === 'linux';
  function state() { return { available, followAll: available && readPreference() === true }; }
  function apply(window, followAll) {
    if (!available || !window || window.isDestroyed()) return;
    window.setVisibleOnAllWorkspaces(followAll, { visibleOnFullScreen: followAll,
      ...(platform === 'darwin' ? { skipTransformProcessType: true } : {}) });
    if (window.isVisibleOnAllWorkspaces() !== followAll) throw Error('macOS could not change Cue’s desktop mode. Try again.');
  }
  function applyToWindow(window) { apply(window, state().followAll); return state(); }
  function setFollowAll(next) {
    if (typeof next !== 'boolean') throw Error('Choose this desktop or all desktops.');
    if (!available) throw Error('Desktop following is available on macOS and Linux.');
    const window = getWindow(), previous = state().followAll;
    try { apply(window, next); writePreference(next); return state(); }
    catch (error) { try { apply(window, previous); } catch { /* Keep the original error visible. */ } throw error; }
  }
  return { state, applyToWindow, setFollowAll };
}
module.exports = { createWorkspaceVisibility };
