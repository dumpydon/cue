/* Sent prompts stay literal and selectable, including pasted code. Collapse
 * by rendered height so wrapped prose and narrow windows get the same preview. */
(function (root) {
  function install({ container, copyText, onError = () => {} }) {
    const document = container.ownerDocument;
    let nextId = 0;

    function refresh() {
      for (const bubble of container.querySelectorAll('.user-bubble')) {
        const content = bubble.querySelector('.user-message-text');
        if (!content || !content.clientWidth) continue;
        const toggle = bubble.querySelector('.user-message-toggle');
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

      const actions = document.createElement('div');
      actions.className = 'user-message-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button'; toggle.className = 'user-message-toggle';
      toggle.textContent = 'Show more'; toggle.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', content.id);
      toggle.addEventListener('click', () => {
        const expanding = !bubble.classList.contains('expanded');
        // Expanding keeps the beginning in view; collapsing keeps the control
        // near the reader instead of jumping to a different response.
        const anchor = expanding ? bubble : toggle;
        const top = anchor.getBoundingClientRect().top;
        bubble.classList.toggle('expanded', expanding);
        toggle.textContent = expanding ? 'Show less' : 'Show more';
        refresh();
        container.scrollTop += anchor.getBoundingClientRect().top - top;
      });

      const copy = document.createElement('button');
      copy.type = 'button'; copy.className = 'user-message-copy';
      copy.textContent = 'Copy'; copy.setAttribute('aria-label', 'Copy message');
      copy.title = 'Copy the entire message, including hidden lines';
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        try {
          await copyText(text);
          copy.textContent = 'Copied';
          setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
        } catch {
          onError('Could not copy the message. Select the text and copy it instead.');
        } finally { copy.disabled = false; }
      });
      actions.append(toggle, copy);
      bubble.append(content, actions);
      return bubble;
    }

    return { create, refresh };
  }
  root.CueUserMessages = { install };
})(window);
