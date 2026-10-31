/* Sent prompts stay literal and selectable, including pasted code. Collapse
 * by rendered height so wrapped prose and narrow windows get the same preview. */
(function (root) {
  function install({ container, copyText, onEdit, canEdit = () => true, icon = root.ICONS.icon, onError = () => {} }) {
    const document = container.ownerDocument;
    let nextId = 0;

    function refresh() {
      for (const bubble of container.querySelectorAll('.user-bubble')) {
        const content = bubble.querySelector('.user-message-text');
        if (!content || !content.clientWidth) continue;
        const toggle = bubble.querySelector('.user-message-toggle');
        bubble.querySelector('.user-message-edit').disabled = !canEdit();
        const previewHeight = parseFloat(root.getComputedStyle(content).lineHeight) * 6;
        toggle.hidden = content.scrollHeight <= previewHeight + 1;
        toggle.setAttribute('aria-expanded', String(bubble.classList.contains('expanded')));
      }
    }

    const observer = new root.ResizeObserver(refresh);
    observer.observe(container);
    document.fonts.ready.then(refresh);

    function create(text) {
      const bubble = document.createElement('div');
      bubble.className = 'user-bubble';
      bubble.dataset.noWindowDrag = '';
      const content = document.createElement('div');
      content.className = 'user-message-text';
      content.id = 'user-message-' + ++nextId;
      content.textContent = text;

      const body = document.createElement('div'); body.className = 'user-message-body';
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'user-message-toggle';
      const toggleLabel = document.createElement('span'); toggleLabel.textContent = 'Show more';
      const arrow = document.createElement('span'); arrow.className = 'user-message-chevron'; arrow.setAttribute('aria-hidden', 'true'); arrow.innerHTML = icon('chevron-down', { size: 13, stroke: 1.8 });
      toggle.append(toggleLabel, arrow); toggle.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', content.id);
      toggle.addEventListener('click', () => {
        const expanding = !bubble.classList.contains('expanded');
        // Expanding keeps the beginning in view; collapsing keeps the control
        // near the reader instead of jumping to a different response.
        const anchor = expanding ? bubble : toggle;
        const top = anchor.getBoundingClientRect().top;
        bubble.classList.toggle('expanded', expanding);
        toggleLabel.textContent = expanding ? 'Show less' : 'Show more';
        refresh();
        container.scrollTop += anchor.getBoundingClientRect().top - top;
      });

      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'user-message-copy';
      const copyGlyph = () => { copy.innerHTML = icon('copy-message', { size: 18, stroke: 1.7 }); copy.setAttribute('aria-label', 'Copy message'); };
      copyGlyph();
      copy.title = 'Copy the entire message, including hidden lines';
      copy.addEventListener('click', async () => {
        const focused = document.activeElement === copy;
        copy.disabled = true;
        try {
          await copyText(text);
          copy.innerHTML = icon('check', { size: 18, stroke: 1.7 }); copy.setAttribute('aria-label', 'Message copied');
          setTimeout(copyGlyph, 1600);
        } catch {
          onError('Could not copy the message. Select the text and copy it instead.');
        } finally {
          copy.disabled = false;
          if (focused && document.activeElement === document.body && copy.isConnected) copy.focus({ preventScroll: true });
        }
      });
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'user-message-edit';
      edit.innerHTML = icon('pencil-message', { size: 18, stroke: 1.7 }); edit.setAttribute('aria-label', 'Edit message');
      edit.title = 'Edit a copy of this message and send it again'; edit.disabled = !canEdit();
      edit.addEventListener('click', () => { if (canEdit()) onEdit?.(text); });
      const actions = document.createElement('div'); actions.className = 'user-message-actions';
      actions.setAttribute('role', 'group'); actions.setAttribute('aria-label', 'Message actions'); actions.append(copy, edit);
      body.append(content, toggle); bubble.append(body, actions);
      return bubble;
    }

    return { create, refresh };
  }
  root.CueUserMessages = { install };
})(window);
