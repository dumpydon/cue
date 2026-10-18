/* Pointer-captured gestures keep transparent, click-through windows draggable.
 * Controls, selectable text and scrollbars retain their normal mouse behavior. */
(function (root) {
  function install({ cue, document = root.document, window = root }) {
    const html = document.documentElement;
    const surfaces = '#toolbar, #panel-wrap, #transcript-sidebar, #settings, #onboard, #consent, #sessions, #meeting-modes';
    const mouseAreas = `${surfaces}, #settings-scrim, #onboard-scrim, #consent-scrim, #sessions-scrim, #modes-scrim, .model-menu, .meeting-mode-menu, .window-resize-handle`;
    const controls = 'button, input, textarea, select, option, a, label, summary, [role="button"], [contenteditable]:not([contenteditable="false"]), [data-no-window-drag]';
    let ignoring = null;
    let gesture = null;

    function setIgnore(value) {
      // Going click-through during a gesture would lose the button release.
      if (gesture && value) return;
      if (value === ignoring) return;
      ignoring = value;
      cue.setIgnoreMouse(value);
    }

    function updateIgnore(event) {
      // macOS can deliver a queued, forwarded mousemove with buttons=0 just
      // after capture starts. It is not a release; using it to end a gesture
      // cancels a real drag before the first window update.
      if (gesture) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      setIgnore(!target?.closest(mouseAreas));
    }

    function overScrollbar(target, event) {
      // Let native scrollbars receive the press, including overlay scrollbars.
      for (let el = target; el && el !== html; el = el.parentElement) {
        const rect = el.getBoundingClientRect();
        if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(window.getComputedStyle(el).overflowY) && event.clientX >= rect.right - 12) return true;
        if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(window.getComputedStyle(el).overflowX) && event.clientY >= rect.bottom - 12) return true;
      }
      return false;
    }

    function begin(event) {
      if (event.button !== 0 || event.isPrimary === false || gesture) return;
      const target = event.target;
      const handle = target.closest('.window-resize-handle');
      const edge = handle?.dataset.resize;
      if (!handle) {
        if (!target.closest(surfaces) || target.closest(controls)) return;
        if (window.getComputedStyle(target).userSelect === 'text' || overScrollbar(target, event)) return;
      }
      event.preventDefault();
      gesture = { pointerId: event.pointerId };
      html.setPointerCapture(event.pointerId);
      html.dataset.windowInteraction = edge ? 'resize' : 'drag';
      html.style.setProperty('--interaction-cursor', edge ? `${edge}-resize` : 'grabbing');
      setIgnore(false);
      cue.windowInteractionStart(edge ? { kind: 'resize', edge } : { kind: 'drag' });
    }

    function finish(event) {
      if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      const { pointerId } = gesture;
      gesture = null;
      delete html.dataset.windowInteraction;
      html.style.removeProperty('--interaction-cursor');
      cue.windowInteractionEnd();
      if (html.hasPointerCapture(pointerId)) html.releasePointerCapture(pointerId);
      if (event?.clientX != null) updateIgnore(event);
    }

    document.addEventListener('pointerdown', begin);
    document.addEventListener('pointermove', updateIgnore);
    document.addEventListener('mousemove', updateIgnore); // forwarded while click-through
    document.addEventListener('pointerup', finish);
    document.addEventListener('mouseup', event => { if (event.button === 0) finish(event); });
    document.addEventListener('pointercancel', finish);
    html.addEventListener('lostpointercapture', finish);
    window.addEventListener('blur', () => finish());
    document.addEventListener('keydown', event => { if (event.key === 'Escape') finish(); });
    setIgnore(true);
    return { setIgnore };
  }

  if (typeof module === 'object' && module.exports) module.exports = { install };
  else root.CueWindowInteractions = { install };
})(typeof window === 'object' ? window : globalThis);
