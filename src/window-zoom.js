const LEVELS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];

// Native zoom changes content scale only. Renderer chrome compensates its
// transparent gutters so the visible window frame stays in the same place.
function installWindowZoom({ window, onChange = () => {} }) {
  const contents = window.webContents;
  let index = LEVELS.indexOf(1);
  const state = () => ({ factor: LEVELS[index] });
  function publish() { onChange(state()); }
  function change(direction) {
    index = direction === 'reset' ? LEVELS.indexOf(1) : Math.min(LEVELS.length - 1, Math.max(0, index + (direction === 'in' ? 1 : -1)));
    contents.setZoomFactor(LEVELS[index]);
    publish();
  }
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isComposing || input.alt || !(input.meta || input.control)) return;
    const key = input.key;
    const direction = key === '0' ? 'reset' : ['+', '='].includes(key) ? 'in' : ['-', '_'].includes(key) ? 'out' : null;
    if (!direction) return;
    event.preventDefault(); // also prevents Electron's default menu zoom action
    change(direction);
  });
  contents.on('zoom-changed', (event, direction) => { event.preventDefault(); change(direction); });
  contents.on('did-finish-load', () => { contents.setZoomFactor(LEVELS[index]); publish(); });
  return { state, change };
}

module.exports = { LEVELS, installWindowZoom };
