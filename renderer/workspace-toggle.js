(function (root) {
  function install({ button, cue, icon, onError = () => {} }) {
    let state = null, pending = true;
    function render(next) {
      state = next;
      button.hidden = !next.available;
      button.disabled = pending || !next.available;
      button.classList.toggle('on', !next.followAll);
      button.innerHTML = next.followAll ? icon('layers', { size: 16, stroke: 1.8 })
        : '<span class="toolbar-pin-glyph" aria-hidden="true"></span>';
      button.dataset.mode = next.followAll ? 'all-desktops' : 'this-desktop';
      button.setAttribute('aria-pressed', String(!next.followAll));
      button.setAttribute('aria-label', next.followAll ? 'All desktops: Cue follows desktop switches' : 'This desktop: Cue stays in this Space');
      button.title = next.followAll
        ? 'All desktops · Cue follows you into other desktops and full-screen apps. Click to keep Cue on this desktop.'
        : 'This desktop · Cue stays in this Space when you swipe to another desktop or full-screen app. Click to follow all desktops.';
    }
    button.disabled = true;
    button.addEventListener('click', async () => {
      if (!state?.available || pending) return;
      pending = true; render(state);
      try { render(await cue.workspaceSet(!state.followAll)); }
      catch (error) { onError(String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
      finally { pending = false; render(state); }
    });
    cue.on('workspace:changed', render);
    const ready = cue.workspaceGet().then(next => { pending = false; render(next); }).catch(error => {
      button.disabled = true; button.title = 'Could not read Cue’s desktop mode.'; onError(error.message);
    });
    return { ready };
  }
  root.CueWorkspaceToggle = { install };
})(window);
