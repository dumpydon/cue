(function (root) {
  function install({ cue, document = root.document }) {
    const panel = document.getElementById('panel-wrap');
    const dialogs = [...document.querySelectorAll('#settings-scrim, #sessions-scrim, #modes-scrim, #onboard-scrim, #consent-scrim')];
    let previous = '';
    function read() {
      const library = document.getElementById('chat-sidebar'), reader = document.getElementById('library-detail');
      return { expanded: !panel.classList.contains('collapsed'),
        blocked: dialogs.some(dialog => !dialog.classList.contains('hidden')) ||
          (!!reader && !reader.hidden) || (!!library && !library.hidden &&
            (library.contains(document.activeElement) || library.parentElement.classList.contains('library-compact'))) };
    }
    function sync() {
      const context = read(), value = JSON.stringify(context);
      if (value === previous) return;
      previous = value;
      cue.windowShortcutContext(context);
    }
    const observer = new root.MutationObserver(sync);
    for (const element of [panel, ...dialogs]) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    for (const id of ['chat-sidebar', 'library-detail', 'panel-columns']) {
      const element = document.getElementById(id);
      if (element) observer.observe(element, { attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    document.addEventListener('focusin', sync); document.addEventListener('focusout', () => queueMicrotask(sync));
    sync();
    return { active: () => { const context = read(); return context.expanded && !context.blocked; } };
  }
  root.CueShortcutContext = { install };
})(window);
