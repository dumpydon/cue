(function (root) {
  function install({ cue, document = root.document }) {
    const panel = document.getElementById('panel-wrap');
    const dialogs = [...document.querySelectorAll('#settings-scrim, #sessions-scrim, #modes-scrim, #onboard-scrim, #consent-scrim')];
    let previous = '';
    function read() {
      return { expanded: !panel.classList.contains('collapsed'),
        blocked: dialogs.some(dialog => !dialog.classList.contains('hidden')) };
    }
    function sync() {
      const context = read(), value = JSON.stringify(context);
      if (value === previous) return;
      previous = value;
      cue.windowShortcutContext(context);
    }
    const observer = new root.MutationObserver(sync);
    for (const element of [panel, ...dialogs]) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    sync();
    return { active: () => { const context = read(); return context.expanded && !context.blocked; } };
  }
  root.CueShortcutContext = { install };
})(window);
