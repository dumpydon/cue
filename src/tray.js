function menuTemplate(state, actions) {
  return [
    { id: 'listening', label: state.listening ? 'Stop Listening' : 'Start Listening', enabled: !state.transitioning, click: actions.toggleListening },
    { id: 'visibility', label: state.visible ? 'Hide Cue' : 'Show Cue', click: actions.toggleVisibility },
    { id: 'invisibility', label: state.protection.enabled ? 'Disable Invisibility' : 'Enable Invisibility', enabled: state.protection.available, click: actions.toggleProtection },
    { type: 'separator' },
    { id: 'sessions', label: 'View History', click: actions.openSessions },
    { id: 'preferences', label: 'Preferences…', click: actions.openPreferences },
    { type: 'separator' },
    { id: 'quit', label: 'Quit Cue', click: actions.quit }
  ];
}

function createTrayController({ Tray, Menu, nativeImage, iconPath, getState, actions, platform = process.platform, onError = () => {} }) {
  let tray = null;
  let disposed = false;
  function destroyTray() {
    if (tray && !tray.isDestroyed()) tray.destroy();
    tray = null;
  }
  const safeActions = Object.fromEntries(Object.entries(actions).map(([key, action]) => [key, () => {
    try { Promise.resolve(action()).catch(onError); } catch (error) { onError(error); }
  }]));
  function sync() {
    if (disposed) return;
    const state = getState();
    // The toolbar remains available to exit hidden mode. Keep no menu-bar
    // trace while the user's screen-share protection preference is enabled.
    if (state.protection.enabled) { destroyTray(); return; }
    if (!tray || tray.isDestroyed()) {
      const image = nativeImage.createFromPath(iconPath);
      if (image.isEmpty()) throw new Error('Cue menu-bar icon could not be loaded.');
      if (platform === 'darwin') image.setTemplateImage(true);
      tray = new Tray(image);
      tray.setToolTip('Cue');
    }
    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate(state, safeActions)));
  }
  return { sync, destroy() { disposed = true; destroyTray(); } };
}

module.exports = { menuTemplate, createTrayController };
