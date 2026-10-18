(function (root) {
  function install({ button, cue, icon, onError = () => {}, onStateChange = () => {} }) {
    let state = null;
    let pending = true;
    function render(next) {
      state = next;
      const hidden = !!next.enabled;
      const iconName = hidden ? 'hat-glasses' : 'eye';
      button.innerHTML = icon(iconName, { size: 18, stroke: 1.8 });
      button.dataset.icon = iconName;
      button.classList.toggle('on', hidden);
      button.setAttribute('aria-pressed', String(hidden));
      button.setAttribute('aria-label', hidden ? 'Show Cue in screen shares' : 'Hide Cue from screen shares');
      const action = hidden ? 'Click to show Cue in screen shares.' : 'Click to enable screen-share protection.';
      const limit = next.bestEffort ? ' Best effort on macOS; some capture tools can still show Cue.' : '';
      button.title = next.available ? `Hidden mode: ${hidden ? 'on' : 'off'}. ${action}${limit}` : next.reason;
      button.disabled = pending || !next.available;
      onStateChange(next);
    }
    cue.on('protection:changed', render);
    button.addEventListener('click', async () => {
      if (!state || pending || !state.available) return;
      pending = true;
      render(state);
      try { render(await cue.protectionSet(!state.enabled)); }
      catch (error) { onError(error.message || String(error)); }
      finally { pending = false; render(state); }
    });
    button.disabled = true;
    const ready = cue.protectionGet().then(next => { pending = false; render(next); }).catch(error => {
      button.disabled = true;
      button.title = 'Screen-share protection status could not be loaded.';
      onError(error.message || String(error));
    });
    return { ready };
  }
  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueProtectionToggle = { install };
})(typeof window === 'object' ? window : globalThis);
