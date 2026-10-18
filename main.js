const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, desktopCapturer, shell, dialog, systemPreferences, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const store = require('./src/store');
const windowGeometry = require('./src/window-geometry');
const { readPermissionStatus, requestCapturePermissions, createScreenPermissionRepair, SCREEN_REPAIR_SWITCH, relaunchArgs } = require('./src/permissions');
const { readSigningInfo } = require('./src/macos-signing');
const { execFile } = require('node:child_process');
const { protectionCapability, createProtectionController } = require('./src/content-protection');
const { createTrayController } = require('./src/tray');
const { installWindowZoom } = require('./src/window-zoom');
const { createShortcutController } = require('./src/shortcut-controller');
const { listSessions, getSession } = require('./src/session-history');
const modelPreferences = require('./src/model-preferences');
const { createModelCatalog } = require('./src/model-catalog');
const modelCatalog = createModelCatalog();
const { createMacDiscovery } = require('./src/macos-discovery');
const { appendModeContext } = require('./src/meeting-modes');
const { readModeFiles, EXTENSIONS: MODE_FILE_EXTENSIONS } = require('./src/mode-files');
let macDiscovery = null;
const { captureScreenshot } = require('./src/screen');
const { createSTT } = require('./src/stt');
const { parseDocumentFile } = require('./src/resume');
const { createLLM } = require('./src/llm');
const { MODES } = require('./src/prompts');
const { rms16 } = require('./src/wav');
const { createStreamingSTT } = require('./src/stt-streaming');
const { AdaptiveVAD, AudioRingBuffer } = require('./src/vad');
const { buildInterviewContext, detectCategory } = require('./src/interview-context');
const { startAppLink, stopAppLink, recordEvent, appLinkConsentState, revokeAppLinkCaller } = require('./src/applink');
const publik = require('./src/publik');
// The app token release.yml baked into src/publik-build.json (empty in a dev
// checkout → the publik option is simply absent from the provider picker).
const publikBuild = publik.loadBuildConfig();
const { createMeetingStore } = require('./src/meetings');
const { createMeetingMemory } = require('./src/meeting-memory');
const {
  hashRGBA,
  shouldEmitSlide,
  createSlideStore,
  clampSlidesConfig,
  buildSlideSystem,
  buildSlideUser,
  DEFAULT_STABLE_REQUIRED
} = require('./src/slides');

// macOS system-audio loopback (the "them" channel via getDisplayMedia) does not
// start on Electron 31–38 unless these Chromium features are enabled; without
// them getDisplayMedia rejects with "Error starting capture" and meeting audio
// silently never works. Electron 39+ wires this up itself, where this is a
// harmless no-op. Must run before app is ready.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
}

// Linux Wayland / Ozone native rendering configuration. Without this, Electron
// falls back to XWayland even on a native Wayland session; 'auto' picks Wayland
// when available and X11 otherwise. Harmless no-op on X11-only sessions.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform,WaylandWindowDecorations');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}
const { WhisperModelManager } = require('./src/whisper-model-manager');
const { requireWhisperModel } = require('./src/whisper-model-catalog');
const { locateWhisperRuntime } = require('./src/whisper-runtime');
const { LocalWhisperTranscriber } = require('./src/local-whisper-transcriber');

let win = null;
let trayController = null;
let windowZoom = null;
let meetingStore = null;
let trayListeningPending = false;
let shortcutController = null;
let shortcutRendererReady = false;
let shortcutContext = { expanded: false, blocked: true };
const shortcutNotifications = [];
// Which keys Cue currently holds with the OS. Action entries are false while
// paused, or when registration fails because another application owns the key.
const shortcutState = { assist: false, say: false, leetcode: false, quit: false, hide: false };
const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const ownsInstanceLock = app.requestSingleInstanceLock();
if (!ownsInstanceLock) app.quit();
app.on('second-instance', () => showMainWindow());

// -------- Windows version helpers --------
// WDA_EXCLUDEFROMCAPTURE (setContentProtection) requires Windows 10 build 19041+.
// os.release() returns the NT kernel version e.g. "10.0.19041" or "10.0.22000" (Win11).
function getWindowsBuild() {
  if (!isWindows) return 0;
  const parts = os.release().split('.').map(Number);
  return parts[2] || 0; // third segment is the build number
}
const WIN_BUILD = getWindowsBuild();
const WIN_SUPPORTS_CONTENT_PROTECTION = !isWindows || WIN_BUILD >= 19041;

// WDA_EXCLUDEFROMCAPTURE (win.setContentProtection(true)) is documented to
// exclude a window's content from third-party capture surfaces (BitBlt,
// PrintWindow, DXGI Desktop Duplication, screen recording / screen share)
// WITHOUT touching the live composited image on an ordinary, physically
// scanned-out desktop session — the user still sees the window fine. But on
// a Windows session whose own visible surface is ITSELF a remoted or
// composited pipeline — a Remote Desktop (RDP) connection, a Windows 365 /
// Cloud PC session, most VM consoles, a CI runner's virtual desktop — the
// same flag has been observed to make the window render nothing at all, to
// the user as much as to any capture tool (see
// cue-windows-overlay-not-visible-for-mic-grant: PrintWindow(PW_RENDERFULLCONTENT)
// sampled zero color variance, and a full-desktop screenshot showed the
// always-on-top window occluding nothing, only ever reproduced with
// protection on and never with it off). Windows sets the SESSIONNAME
// environment variable to exactly "Console" for a locally-attached
// interactive session; every remoted session gets a different value
// (e.g. "RDP-Tcp#3"), and a non-interactive/service context has none at
// all. Anything other than a confirmed local console session is treated as
// unsafe to protect: a window the user can see (even if a screen-share
// viewer also could) is strictly better than a window that is invisible to
// everyone, including the user trying to grant it microphone access.
const WIN_IS_LOCAL_CONSOLE_SESSION = !isWindows || process.env.SESSIONNAME === 'Console';

let permWin = null;
// Windows never blocks startup on an unresolved permission (see app.whenReady()
// below), so launchApp() can already have run once by the time the user grants
// access and clicks Continue in the gate window (permissions:continue also
// calls launchApp()). Without this guard the second call re-creates the main
// BrowserWindow (createWindow() has no existing-window check), re-registers
// global shortcuts and re-starts the applink server -- a real, reachable
// regression, not a hypothetical.
let appLaunched = false;

// -------- capture / transcript state --------
const state = { capturing: false, busy: false, transcribing: { you: false, them: false } };
let sttDisabled = false; // set when the key can't reach any speech model (stops retry spam)
const buffers = { you: [], them: [] };
const transcript = []; // { channel, text, ts } — capped at MAX_TRANSCRIPT_TURNS
const liveTranscript = { you: null, them: null };
function transcriptWithLiveSpeech() {
  return [...transcript, ...Object.values(liveTranscript).filter(turn => turn?.text.trim())]
    .sort((a, b) => a.ts - b.ts).slice(-MAX_TRANSCRIPT_TURNS);
}
const MAX_TRANSCRIPT_TURNS = 200; // ~30–40 minutes of conversation at normal pace
let meetingMemory = null; // persists the transcript per meeting + notes; see src/meeting-memory.js
let restoredTurns = []; // turns of an interrupted meeting resumed at launch, replayed to the renderer once
// -------- slides state (memory-only, never written to disk) --------
let slideStore = createSlideStore({ maxSlides: 50 });
let slideTimer = null;
let slideLastHash = null;
let slideStableCount = 0;
let slideBusy = false;
let slideDisabled = false; // set when the chat key rejects slide captions (stops cost spam)
let slideTxCursor = 0; // transcript.length at last emitted slide
const FLUSH_MS = 900;
const STREAM_INACTIVITY_MS = 25000; // abort a stalled LLM stream so state.busy can't wedge forever
const MIN_BYTES = Math.floor(16000 * 2 * 0.12); // ~0.12s
const RMS_GATE = 180;
let flushTimer = null;
let whisperModelManager = null;
let localWhisperTranscriber = null;
let activeWhisperModelId = null;
let desiredCaptureState = false;
let captureTransition = Promise.resolve(false);

// -------- streaming STT state --------
let streamingSTT = { you: null, them: null }; // streaming STT instances per channel
let streamingMode = false; // true when using WebSocket streaming STT
const vad = {
  you: new AdaptiveVAD({
    onsetThreshold: 220,
    offsetThreshold: 130,
    silenceFrames: 18,       // ~540ms silence before end
    onSpeechStart: () => send('vad:state', { channel: 'you', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'you', speaking: false, durationMs: dur })
  }),
  them: new AdaptiveVAD({
    onsetThreshold: 200,
    offsetThreshold: 120,
    silenceFrames: 20,       // ~600ms for remote audio (more forgiving)
    onSpeechStart: () => send('vad:state', { channel: 'them', speaking: true }),
    onSpeechEnd: (dur) => send('vad:state', { channel: 'them', speaking: false, durationMs: dur })
  })
};
// Pre-speech ring buffers (300ms) so we never clip the start of a word
const ringBuffers = {
  you: new AudioRingBuffer(300, 16000),
  them: new AudioRingBuffer(300, 16000)
};

function pushTranscript(turn) {
  transcript.push(turn);
  if (transcript.length > MAX_TRANSCRIPT_TURNS) transcript.splice(0, transcript.length - MAX_TRANSCRIPT_TURNS);
  if (meetingMemory) meetingMemory.onTurn(turn);
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  if (channel === 'capture:state') trayController?.sync();
}

function getWhisperRuntime() {
  return locateWhisperRuntime({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
    platform: process.platform,
    architecture: process.arch,
    environment: process.env
  });
}

function publishTranscript(channel, text, ts = Date.now()) {
  if (!text || !text.trim()) return;
  const turn = { channel, text: text.trim(), ts };
  pushTranscript(turn);
  send('transcript', turn);
  send('stt:final', { channel, text: turn.text });
}

async function startLocalWhisper(settings) {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const localSettings = settings.localWhisper || {};
  const model = requireWhisperModel(localSettings.modelId || 'base.en');
  const runtime = getWhisperRuntime();
  if (!runtime.available) throw new Error(runtime.message);
  activeWhisperModelId = model.id;
  let transcriber = null;
  try {
    const modelPath = await whisperModelManager.verifyInstalledModel(model.id).catch((error) => {
      if (error.code === 'ENOENT') {
        throw new Error(`Download the ${model.id} model in Settings → Audio before listening.`);
      }
      throw error;
    });

    transcriber = new LocalWhisperTranscriber({
      sessionOptions: {
        executablePath: runtime.executablePath,
        runtimeDirectory: runtime.runtimeDirectory,
        modelPath,
        language: model.englishOnly ? 'en' : (localSettings.language || 'auto'),
        threads: Number(localSettings.threads) || 0,
        tinydiarize: model.tinydiarize
      },
      onTranscript: publishTranscript,
      onSpeechState: (channel, speaking, durationMs) => {
        send('vad:state', { channel, speaking, durationMs });
      },
      onStatus: (status) => send('stt:status', { provider: 'local', ...status }),
      onError: (error) => {
        sttDisabled = true;
        console.log('[local-whisper] error', error && error.message);
        send('stt:status', { provider: 'local', status: 'error' });
        send('status', { message: `Local transcription error: ${error.message}. Audio was not sent to a cloud fallback.` });
      }
    });

    localWhisperTranscriber = transcriber;
    await transcriber.start();
  } catch (error) {
    if (localWhisperTranscriber === transcriber) localWhisperTranscriber = null;
    activeWhisperModelId = null;
    if (transcriber) await transcriber.forceStop().catch(() => {});
    throw error;
  }
}

async function getWhisperOverview() {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const runtime = getWhisperRuntime();
  const models = await whisperModelManager.listModels();
  return {
    runtime: {
      available: runtime.available,
      version: runtime.version,
      target: runtime.target,
      message: runtime.message || null
    },
    models
  };
}

// -------- window --------
// The window has a transparent, click-through strip on each side of the main column so
// the history sidebar can slide out left or right. Must match --main-w/--side-w in
// styles.css. Persist visible-column bounds, excluding the transparent gutters.
const SIDE_W = windowGeometry.SIDE_WIDTH;

const protection = createProtectionController({
  capability: protectionCapability({
    platform: process.platform,
    windowsSupported: WIN_SUPPORTS_CONTENT_PROTECTION,
    localConsole: WIN_IS_LOCAL_CONSOLE_SESSION,
    forceVisible: !!process.env.CUE_NO_PROTECT
  }),
  getWindows: () => BrowserWindow.getAllWindows(),
  readPreference: () => store.getSettings().screenShareProtection,
  writePreference: enabled => {
    const previous = store.getSettings().screenShareProtection;
    store.setSettings({ screenShareProtection: enabled });
    const error = store.lastSaveError();
    if (error) {
      store.getSettings().screenShareProtection = previous;
      throw new Error('Could not save screen-share protection: ' + error.message);
    }
  }
});

function setScreenShareProtection(enabled) {
  const status = protection.setEnabled(enabled);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('protection:changed', status);
  trayController?.sync();
  return status;
}

function mainWindowVisible() {
  return !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()
    && !(isMac && app.isHidden());
}
function syncWindowAvailability() { syncShortcuts(); trayController?.sync(); }
function showMainWindow(channel) {
  if (!win || win.isDestroyed()) createWindow();
  const target = win;
  const reveal = () => {
    if (target.isDestroyed()) return;
    if (isMac && app.isHidden()) app.show();
    if (target.isMinimized()) target.restore();
    target.setIgnoreMouseEvents(false);
    if (channel === 'ui:open-settings' || channel === 'ui:open-sessions') ensureWindowVisible();
    target.show(); target.focus();
    target.webContents.send('ui:reveal', {});
    if (channel) target.webContents.send(channel, {});
  };
  if (target.webContents.isLoading()) target.webContents.once('did-finish-load', reveal);
  else reveal();
}

async function toggleListeningFromTray() {
  if (trayListeningPending) return;
  trayListeningPending = true; trayController?.sync();
  try {
    showMainWindow();
    // Preserve the native menu click's user gesture for getDisplayMedia,
    // and reuse exactly the same mic / loopback flow as the toolbar button.
    await win.webContents.executeJavaScript('window.CueListening.toggle()', true);
  } finally { trayListeningPending = false; trayController?.sync(); }
}

function createTray() {
  trayController = createTrayController({
    Tray, Menu, nativeImage,
    iconPath: path.join(__dirname, 'renderer/assets', isMac ? 'cueTrayTemplate.png' : 'cue-icon.png'),
    getState: () => ({ listening: state.capturing, transitioning: trayListeningPending, visible: mainWindowVisible(), protection: protection.state() }),
    actions: {
      toggleListening: toggleListeningFromTray,
      toggleVisibility: () => {
        if (mainWindowVisible()) {
          finishWindowInteraction(); win.hide();
          if (permWin && !permWin.isDestroyed()) permWin.hide();
        } else showMainWindow();
      },
      toggleProtection: () => setScreenShareProtection(!protection.state().enabled),
      openSessions: () => showMainWindow('ui:open-sessions'),
      openPreferences: () => showMainWindow('ui:open-settings'),
      quit: () => app.quit()
    },
    onError: error => send('status', { message: error.message || String(error) })
  });
  trayController.sync();
}

function createApplicationMenu() {
  const preferences = { label: 'Preferences…', accelerator: 'CommandOrControl+,', click: () => showMainWindow('ui:open-settings') };
  const template = [
    ...(isMac ? [{ label: 'Cue', submenu: [{ role: 'about' }, { type: 'separator' }, preferences, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit', label: 'Quit Cue' }] }] : []),
    { label: 'File', submenu: [{ label: 'View Sessions', click: () => showMainWindow('ui:open-sessions') }, ...(!isMac ? [preferences, { role: 'quit' }] : [])] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Zoom In', accelerator: 'CommandOrControl+Plus', click: () => windowZoom?.change('in') },
      { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => windowZoom?.change('out') },
      { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => windowZoom?.change('reset') }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function saveWindowPosition() {
  if (!win || win.isDestroyed()) return;
  store.setSettings(windowGeometry.savedBounds(win.getBounds()));
}

function createWindow() {
  const savedSettings = store.getSettings();
  const display = Number.isFinite(savedSettings.windowX) && Number.isFinite(savedSettings.windowY)
    ? screen.getDisplayMatching({ x: savedSettings.windowX, y: savedSettings.windowY, width: savedSettings.windowWidth || windowGeometry.DEFAULT_WIDTH, height: savedSettings.windowHeight || 600 })
    : screen.getPrimaryDisplay();
  const { workArea } = display;
  const bounds = windowGeometry.restoreBounds(savedSettings, workArea, { screenBounds: display.bounds });
  const limits = windowGeometry.sizeLimits(workArea);

  const winOptions = {
    ...bounds,
    minWidth: limits.minWidth + 2 * SIDE_W,
    minHeight: limits.minHeight,
    enableLargerThanScreen: true,
    // The window is shown inactive and never takes focus, so without this macOS spends the
    // first click only activating it and a drag on the panel does nothing.
    acceptFirstMouse: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    icon: path.join(__dirname, 'renderer/assets/cue-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  // Fix 1: On Windows, set type:'toolbar' which sets WS_EX_TOOLWINDOW.
  // This removes the window from Alt+Tab AND the taskbar entirely.
  // On macOS, this is not needed (dock hiding + Mission Control handle it).
  if (isWindows) {
    winOptions.type = 'toolbar';
  }

  win = new BrowserWindow(winOptions);
  shortcutRendererReady = false;
  shortcutContext = { expanded: false, blocked: true };
  windowZoom = installWindowZoom({ window: win, onChange: value => send('window:zoom-changed', value) });

  const shouldProtect = store.getSettings().screenShareProtection !== false && !process.env.CUE_NO_PROTECT && WIN_IS_LOCAL_CONSOLE_SESSION;
  protection.applyToWindow(win);

  win.setAlwaysOnTop(true, 'screen-saver', 1);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (isMac && typeof win.setHiddenInMissionControl === 'function') win.setHiddenInMissionControl(true);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  let boundsSaveTimer = null;
  const queueBoundsSave = () => {
    clearTimeout(boundsSaveTimer);
    boundsSaveTimer = setTimeout(saveWindowPosition, 500);
  };
  win.on('move', queueBoundsSave);
  win.on('resize', queueBoundsSave);
  win.on('blur', () => finishWindowInteraction());
  win.on('focus', () => publishPermissionStatus());
  win.on('show', syncWindowAvailability);
  win.on('hide', syncWindowAvailability);
  win.on('minimize', syncWindowAvailability);
  win.on('restore', syncWindowAvailability);
  win.on('close', event => {
    if (!readyToQuit) { event.preventDefault(); app.quit(); return; }
    clearTimeout(boundsSaveTimer);
    finishWindowInteraction();
    saveWindowPosition();
  });
  win.on('closed', () => { stopWindowInteraction(); shortcutRendererReady = false; syncShortcuts(); });

  win.setTitle('Cue');

  win.webContents.on('did-finish-load', () => {
    shortcutRendererReady = true;
    win.showInactive();
    syncShortcuts();
    win.setTitle('Cue');
    if (restoredTurns.length) {
      // A meeting was in progress when cue last exited: put its transcript back
      // in the sidebar so Recap / Follow-up pick up where the conversation was.
      const turns = restoredTurns;
      restoredTurns = [];
      send('transcript:restore', { turns });
      const ageMin = Math.max(1, Math.round((Date.now() - turns[turns.length - 1].ts) / 60000));
      send('status', { message: `Resumed your meeting from ${ageMin} min ago (${turns.length} turns restored).` });
    }
    // Warn about missing content protection on old Windows builds
    if (isWindows && shouldProtect && !WIN_SUPPORTS_CONTENT_PROTECTION) {
      send('status', {
        message: `Heads up: your Windows version (build ${WIN_BUILD}) does not support screen-share hiding. Upgrade to Windows 10 build 19041+ or Windows 11 to enable invisibility in screen shares.`
      });
    }
    // Warn when protection was skipped because this is not a local console
    // session (RDP / Cloud PC / VM console) — see WIN_IS_LOCAL_CONSOLE_SESSION.
    if (isWindows && !process.env.CUE_NO_PROTECT && !WIN_IS_LOCAL_CONSOLE_SESSION) {
      send('status', {
        message: 'Heads up: screen-share hiding is off for this session (remote desktop / cloud PC / VM sessions can render the window invisible to you as well when it is on). The window will be visible in screen shares here.'
      });
    }
  });
  win.webContents.on('render-process-gone', (_e, d) => {
    shortcutRendererReady = false;
    syncShortcuts();
    stopWindowInteraction();
    console.log('[cue] renderer gone', JSON.stringify(d));
    recordEvent({ level: 'fatal', event: 'renderer_gone', code: d && d.reason, msg: 'renderer process ended: ' + JSON.stringify(d), frame: 'BrowserWindow' });
  });
  win.webContents.on('did-start-loading', () => {
    shortcutRendererReady = false;
    shortcutContext = { expanded: false, blocked: true };
    syncShortcuts();
  });
}

// -------- STT flushing (batch mode fallback) --------
const flushTasks = { you: null, them: null };
function flushChannel(channel) {
  if (flushTasks[channel]) return flushTasks[channel];
  const task = flushChannelOnce(channel).finally(() => { if (flushTasks[channel] === task) flushTasks[channel] = null; });
  flushTasks[channel] = task;
  return task;
}
async function flushChannelOnce(channel) {
  if (sttDisabled) { buffers[channel] = []; return; }
  if (state.transcribing[channel]) return;
  const chunks = buffers[channel];
  if (!chunks.length) return;
  const pcm = Buffer.concat(chunks);
  buffers[channel] = [];
  if (pcm.length < MIN_BYTES) return;
  if (rms16(pcm) < RMS_GATE) return; // silence gate

  state.transcribing[channel] = true;
  try {
    const settings = store.getSettings();
    const stt = createSTT(settings);
    if (!stt.available) {
      if (!sttDisabled) { sttDisabled = true; send('status', { message: 'No transcription key set. Add an OpenAI (Whisper) or Groq key in Settings to enable listening. Screen/LeetCode features work without it.' }); }
      return;
    }
    const res = await stt.transcribe(pcm);
    if (res.error) {
      handleSttError(res.error, settings);
      return;
    }
    if (res.text && res.text.trim() && res.text.trim().length > 1 && !/^[?!.,;:\-…]+$/.test(res.text.trim())) {
      publishTranscript(channel, res.text);
    }
  } catch (e) {
    console.log('[stt] error', e && e.message);
    recordEvent({ level: 'error', event: 'stt_failed', msg: e && e.message ? e.message : String(e), frame: 'flushChannel', context: { channel } });
  } finally {
    state.transcribing[channel] = false;
  }
}

function handleSttError(err, settings) {
  console.log('[stt] error', err.provider, err.status, err.code, err.message);
  // Recorded before the early return, because the second and hundredth
  // occurrence still tell you the state cue is stuck in.
  recordEvent({
    level: 'error',
    event: 'stt_rejected',
    code: err.code || (err.status ? 'http_' + err.status : null),
    msg: err.message,
    frame: 'handleSttError',
    context: { provider: err.provider, status: err.status || null, alreadyDisabled: sttDisabled },
  });
  if (sttDisabled) return;
  const isQuota = err.status === 429 || err.code === 'RESOURCE_EXHAUSTED' || (err.message && err.message.includes('Quota exceeded'));
  const noAccess = err.status === 403 || err.status === 401 || err.code === 'model_not_found' || isQuota;
  sttDisabled = true; // stop hammering the API every few seconds
  send('stt:status', { provider: err.provider, status: 'error' });
  if (noAccess) {
    send('status', { message: `Transcription off: your ${err.provider} key was rejected or hit a quota limit. Update your key in Settings to resume.` });
  } else {
    send('status', { message: 'Transcription error (' + err.provider + '): ' + err.message });
  }
}

function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(() => { flushChannel('you'); flushChannel('them'); }, FLUSH_MS);
}
function stopFlushLoop() { if (flushTimer) { clearInterval(flushTimer); flushTimer = null; } }

// -------- streaming STT setup --------
function initStreamingSTT() {
  const settings = store.getSettings();
  streamingMode = false;

  ['you', 'them'].forEach((channel) => {
    let instance = null; // set below; lets the callbacks tell a stale instance from the live one
    const sttInstance = createStreamingSTT(settings, channel, {
      onTranscript: (ch, text) => {
        if (instance && streamingSTT[ch] !== instance) return; // stale instance after a stop/start

        const startedAt = liveTranscript[ch]?.ts || Date.now();
        liveTranscript[ch] = null;
        publishTranscript(ch, text, startedAt);
      },
      onInterim: (ch, text) => {
        if (instance && streamingSTT[ch] !== instance) return;
        liveTranscript[ch] = text.trim() ? { channel: ch, text, ts: liveTranscript[ch]?.ts || Date.now(), partial: true } : null;
        send('stt:interim', { channel: ch, text });
      },
      onError: (err) => {
        // A socket torn down by a quick stop/start can still report an error a
        // moment later; acting on it would kill the sessions that replaced it
        // and start the batch loop alongside them (double transcription).
        if (instance && streamingSTT[channel] !== instance) return;
        if (!state.capturing) return; // A late error while draining must not restart batch capture.
        console.log('[streaming-stt] error', err.provider, err.message);
        const batchFallbackAvailable = createSTT(settings).available;
        stopStreamingSTT(); // close WebSockets and clear keep-alive intervals
        if (batchFallbackAvailable) {
          send('status', { message: `Streaming transcription (${err.provider}) error: ${err.message}. Falling back to batch mode.` });
          startFlushLoop();
          send('stt:status', { provider: 'batch', status: 'batch' });
        } else if (!sttDisabled) {
          sttDisabled = true;
          send('stt:status', { provider: err.provider, status: 'error' });
          send('status', { message: `Transcription stopped (${err.provider}): ${err.message}. The selected provider has no batch fallback.` });
        }
        streamingMode = false;
      },
      onStatusChange: (ch, status) => {
        if (instance && streamingSTT[ch] !== instance) return;
        send('stt:status', { channel: ch, status });
        if (status === 'connected') {
          console.log(`[streaming-stt] ${ch} channel connected`);
        }
      }
    });

    if (sttInstance.type === 'streaming' && sttInstance.instance) {
      instance = sttInstance.instance;
      streamingMode = true;
      streamingSTT[channel] = instance;
      instance.connect();
    }
  });

  return streamingMode;
}

async function stopStreamingSTT({ drain = false } = {}) {
  streamingMode = false;
  await Promise.all(['you', 'them'].map(async channel => {
    const instance = streamingSTT[channel];
    if (!instance) return;
    try {
      if (drain && instance.stop) await instance.stop();
      else instance.disconnect();
    } finally {
      if (streamingSTT[channel] === instance) { streamingSTT[channel] = null; liveTranscript[channel] = null; }
    }
  }));
}

// -------- slides: auto tracking (opt-in, memory-only) --------
// Cheap hash poll (32px thumbnail) every intervalMs; full-res VLM caption only
// on stable change. Never blocks runFeature (own slideBusy flag). Images are
// never stored — only hash + caption + transcript window.
function getSlidesConfig() {
  return clampSlidesConfig(store.getSettings().slides || {});
}

async function captureHashFrame() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 32, height: 32 }
  });
  if (!sources.length) return null;
  const img = sources[0].thumbnail;
  if (!img || img.isEmpty()) return null;
  const size = img.getSize();
  const bmp = img.toBitmap();
  if (!bmp || !size.width || !size.height) return null;
  return { width: size.width, height: size.height, data: bmp };
}

async function captionSlide(imageDataUrl, transcriptSlice) {
  const settings = store.getSettings();
  const llm = createLLM(settings);
  if (!llm.ready) throw new Error(llm.configurationError || 'Complete the provider settings.');
  let watchdog = null;
  const stalled = new Promise((_res, reject) => {
    watchdog = setTimeout(() => reject(new Error('slide caption timed out')), STREAM_INACTIVITY_MS);
  });
  try {
    return await Promise.race([
      llm.stream({
        system: buildSlideSystem(),
        turns: [{ role: 'user', text: buildSlideUser(transcriptSlice) }],
        imageDataUrl,
        maxTokens: 300,
        onToken: () => {}
      }),
      stalled
    ]);
  } finally {
    clearTimeout(watchdog);
  }
}

async function pollSlides() {
  if (!state.capturing || slideBusy || slideDisabled) return;
  const cfg = getSlidesConfig();
  if (!cfg.enabled) return;
  if (slideStore.count() >= cfg.maxSlides) return;
  let frame = null;
  try {
    frame = await captureHashFrame();
  } catch {
    return;
  }
  if (!frame) return;
  const newHash = hashRGBA(frame.width, frame.height, frame.data);
  if (!newHash) return;
  const decision = shouldEmitSlide(slideLastHash, newHash, {
    threshold: cfg.threshold,
    stableCount: slideStableCount,
    requiredStable: DEFAULT_STABLE_REQUIRED
  });
  slideStableCount = decision.stableCount;
  if (!decision.emit) {
    if (slideLastHash && decision.distance != null && decision.distance <= cfg.threshold) slideLastHash = slideLastHash;
    return;
  }
  slideLastHash = newHash;
  slideStableCount = decision.stableCount;
  // Stable change: take one full-res frame and caption it.
  slideBusy = true;
  try {
    const imageDataUrl = await captureScreenshot();
    if (!imageDataUrl) return;
    const txStart = slideTxCursor;
    const txEnd = transcript.length;
    const slice = transcript.slice(txStart, txEnd).slice(-8);
    const caption = (await captionSlide(imageDataUrl, slice) || '').trim();
    if (!caption) return;
    const slide = slideStore.add({ hash: newHash, caption, txStart, txEnd });
    slideTxCursor = txEnd;
    send('slides:update', { count: slideStore.count(), last: slide });
    recordEvent({ level: 'info', event: 'slide_captured', msg: 'slide ' + slideStore.count() + ' captioned' });
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/429|quota|401|403|model_not_found/i.test(msg)) {
      slideDisabled = true;
      send('status', { message: 'Slide captions paused: ' + msg });
    } else {
      console.log('[slides] caption failed', msg);
    }
  } finally {
    slideBusy = false;
  }
}

function startSlideLoop() {
  stopSlideLoop();
  const cfg = getSlidesConfig();
  slideTimer = setInterval(() => { pollSlides().catch(() => {}); }, cfg.intervalMs);
  if (slideTimer.unref) slideTimer.unref();
}

function stopSlideLoop() {
  if (slideTimer) { clearInterval(slideTimer); slideTimer = null; }
}

function resetSlidesSession() {
  slideStore.clear();
  slideLastHash = null;
  slideStableCount = 0;
  slideBusy = false;
  slideDisabled = false;
  slideTxCursor = transcript.length;
}

// -------- audio routing (streaming or batch) --------
// Per-channel level report every few seconds while capturing, so "cue never
// hears me" reports can be told apart: no chunks (capture never reached the
// main process), chunks but rms≈0 (a silent/muted device), or healthy audio
// that the transcriber is dropping.
const AUDIO_LEVEL_LOG_MS = 5000;
const audioLevels = { you: { chunks: 0, peakRms: 0 }, them: { chunks: 0, peakRms: 0 }, lastLog: 0 };
function noteAudioLevel(channel, buf) {
  const lv = audioLevels[channel];
  lv.chunks++;
  if (buf.length >= 2) lv.peakRms = Math.max(lv.peakRms, rms16(buf));
  const now = Date.now();
  if (now - audioLevels.lastLog < AUDIO_LEVEL_LOG_MS) return;
  audioLevels.lastLog = now;
  const fmt = (c) => `${c}: chunks=${audioLevels[c].chunks} peakRms=${Math.round(audioLevels[c].peakRms)}`;
  console.log(`[audio] ${fmt('you')} | ${fmt('them')} (gate=${RMS_GATE}, mode=${localWhisperTranscriber ? 'local' : streamingMode ? 'streaming' : 'batch'})`);
  audioLevels.you = { chunks: 0, peakRms: 0 };
  audioLevels.them = { chunks: 0, peakRms: 0 };
}

function routeAudio(channel, pcmBuffer) {
  if (sttDisabled) return;
  const buf = Buffer.from(pcmBuffer);
  noteAudioLevel(channel, buf);

  if (localWhisperTranscriber) {
    localWhisperTranscriber.push(channel, buf);
    return;
  }

  // Always run through VAD for speech state detection
  vad[channel].processChunk(buf);

  // Keep pre-speech buffer
  ringBuffers[channel].write(buf);

  if (streamingMode && streamingSTT[channel]) {
    // Streaming mode: send raw PCM directly to the WebSocket
    streamingSTT[channel].sendAudio(pcmBuffer);
  } else {
    // Batch mode: accumulate in buffers for periodic flush
    buffers[channel].push(buf);
  }
}

// -------- capture toggle --------
// Mic + system audio are both captured in the RENDERER (getUserMedia for the mic,
// getDisplayMedia loopback for system audio) so they run inside cue's own process
// and use cue's own Screen-Recording grant — no separate helper binary to authorize.
async function setCapturing(active) {
  if (active === state.capturing) return state.capturing;

  if (active) {
    sttDisabled = false; // reset on re-enable
    const settings = store.getSettings();
    if ((settings.sttProvider || 'auto') === 'local') {
      try {
        await startLocalWhisper(settings);
        state.capturing = true;
        console.log('[cue] capture started, mode: local');
        slideDisabled = false;
        slideTxCursor = transcript.length;
        slideStore = createSlideStore({ maxSlides: getSlidesConfig().maxSlides });
        slideLastHash = null;
        slideStableCount = 0;
        startSlideLoop();
        send('capture:state', { active: true, streaming: false, mode: 'local' });
        send('slides:update', { count: 0, last: null });
        return true;
      } catch (error) {
        state.capturing = false;
        desiredCaptureState = false;
        if (error.code === 'STARTUP_CANCELLED') {
          send('stt:status', { provider: 'local', status: 'off' });
          send('capture:state', { active: false, streaming: false, mode: 'local' });
          return false;
        }
        send('stt:status', { provider: 'local', status: 'error' });
        send('status', { message: `Local transcription could not start: ${error.message} No audio was sent to a cloud provider.` });
        send('capture:state', { active: false, streaming: false, mode: 'local' });
        return false;
      }
    }

    state.capturing = true;
    // Try streaming first, fall back to batch
    const streaming = initStreamingSTT();
    if (!streaming) {
      startFlushLoop();
    }
    slideDisabled = false;
    slideTxCursor = transcript.length;
    const slideCfg = getSlidesConfig();
    slideStore = createSlideStore({ maxSlides: slideCfg.maxSlides });
    slideLastHash = null;
    slideStableCount = 0;
    startSlideLoop();
    console.log('[cue] capture started, mode:', streaming ? 'streaming' : 'batch');
    send('capture:state', { active: true, streaming: streamingMode, mode: streaming ? 'streaming' : 'batch' });
    send('slides:update', { count: 0, last: null });
    return true;
  }

  state.capturing = false;
  send('capture:state', { active: false, streaming: false, mode: localWhisperTranscriber ? 'local' : 'off' });
  send('stt:status', { status: 'stopping' });
  stopFlushLoop();
  await stopStreamingSTT({ drain: true });
  await Promise.all([flushChannel('you'), flushChannel('them')]);
  await Promise.all([flushChannel('you'), flushChannel('them')]); // Drain audio queued behind an in-flight batch.
  stopSlideLoop();
  buffers.you = []; buffers.them = [];
  vad.you.reset(); vad.them.reset();
  ringBuffers.you.clear(); ringBuffers.them.clear();
  const stoppingLocalTranscriber = localWhisperTranscriber;
  localWhisperTranscriber = null;
  if (stoppingLocalTranscriber) {
    send('stt:status', { provider: 'local', status: 'stopping' });
    try {
      await stoppingLocalTranscriber.stop();
    } catch (error) {
      console.log('[local-whisper] stop error', error && error.message);
    } finally {
      activeWhisperModelId = null;
    }
  }
  if (meetingMemory) {
    // Write/refresh the notes for this meeting in the background so the
    // summary survives even if cue is closed before the meeting formally ends.
    meetingMemory.refreshNotes().then((notes) => {
      if (notes) send('status', { message: `Meeting notes saved (${transcript.length} turns).` });
    }).catch(() => {});
  }
  send('stt:status', { status: 'off' });
  return false;
}

// -------- feature runner --------
async function runFeature(mode, userText) {
  if (state.busy) return;
  const def = MODES[mode];
  if (!def) return;
  state.busy = true;
  let streamSettled = false; // drop stray tokens from a stream we've already abandoned
  try {
    // Finish pending mode edits before a toolbar action or global shortcut
    // takes its settings snapshot. A failed save keeps the draft for retry.
    if (win && !win.isDestroyed()) {
      const saved = await win.webContents.executeJavaScript('window.CueMeetingModeUI ? window.CueMeetingModeUI.flush() : true');
      if (!saved) { send('status', { message: 'Save or correct your meeting mode edits before asking Cue.' }); return; }
    }
    const settings = store.getSettings();
    const llm = createLLM(settings);
    const userBubble = def.userBubble !== null
      ? def.userBubble
      : (mode === 'ask' ? userText : mode === 'answerThis' ? `"${(userText || '').slice(0, 60)}${userText && userText.length > 60 ? '…' : ''}"` : null);
    const contextTranscript = transcriptWithLiveSpeech();
    const category = mode !== 'leetcode' ? detectCategory(contextTranscript) : null;
    send('llm:start', { userBubble, small: !!def.small, category });

    if (!llm.ready) {
      const message = llm.configurationError || ('Complete the ' + settings.provider + ' provider settings. Model: ' + (llm.model || 'unset') + '.');
      if (settings.provider === publik.PUBLIK_PROVIDER) {
        // No key yet: either the disclosure was never accepted (open it — the
        // mint happens only on "Continue"), or the install was revoked or the
        // last mint failed (offer Reconnect). The app never silently spends.
        const action = !settings.publik.disclosureAccepted
          ? { kind: 'disclosure' }
          : { kind: 'reconnect', label: 'Reconnect' };
        send('llm:error', { message, action });
        return;
      }
      send('llm:error', { message });
      return;
    }
    // Never a silent starter (CONTRACT §12.4): the first-run card — balance,
    // justification, "Link this computer & pick a plan" / "Later" — is shown
    // at least once before any starter usage is spent. Normally it appears
    // right after provisioning; this gate catches a card that was never
    // acknowledged (e.g. an install provisioned by an earlier release).
    if (settings.provider === publik.PUBLIK_PROVIDER && settings.apiKeys.publik && !settings.publik.cardShown) {
      send('llm:error', { message: 'publik API is set up. Take a look at the card, then ask again.', action: { kind: 'card' } });
      return;
    }

    let imageDataUrl = null;
    // Typed chat stays available without screen capture. Explicit screen
    // actions can request capture; macOS still enforces its permission.
    const screenAllowed = getPermissionStatus().screen === 'granted';
    if (def.needsScreen && (mode !== 'ask' || screenAllowed)) {
      try {
        imageDataUrl = await captureScreenshot();
        if (!imageDataUrl) throw new Error('No screen source was available.');
      }
      catch (e) {
        recordEvent({ level: 'error', event: 'screen_capture_failed', msg: e && e.message ? e.message : String(e), frame: 'captureScreenshot', context: { mode } });
        const message = process.platform === 'darwin'
          ? 'Screen capture needs permission — grant Screen Recording to cue in System Settings.'
          : process.platform === 'win32'
            ? 'Screen capture failed. Make sure cue is not blocked by Windows privacy or security software, then try again.'
            : 'Screen capture failed. Check your desktop capture permissions, then try again.';
        send('status', { message });
      }
    }

    // Follow-up / Recap have nothing to work with before anything was heard —
    // sent to the model anyway, it fabricates plausible generic output that
    // looks like a canned preset. Say so instead, and log how much context
    // every feature actually ran with.
    console.log(`[llm] mode=${mode} transcriptTurns=${contextTranscript.length} capturing=${state.capturing}`);
    if (def.transcriptRequired && contextTranscript.length === 0) {
      send('llm:error', { message: state.capturing
        ? 'Nothing has been transcribed yet — say something (or let the other side talk) and try again.'
        : 'Nothing captured yet — press the listen button first so cue can hear the conversation.' });
      return;
    }

    const settingsForPrompt = store.getSettings();
    let contextBlock = buildInterviewContext(settingsForPrompt, mode, contextTranscript);
    // Summaries of the last few meetings, so "what did we agree last time?"
    // has something to draw on. Never the current meeting, never leetcode.
    const memoryBlock = mode !== 'leetcode' && meetingMemory ? meetingMemory.memoryBlock() : null;
    if (memoryBlock) contextBlock = contextBlock ? contextBlock + '\n\n' + memoryBlock : memoryBlock;
    const baseSystem = def.buildSystem ? def.buildSystem(contextBlock, settingsForPrompt.aiRules || '') : (def.system || '');
    const system = appendModeContext(baseSystem, settings.meetingModes);
    const built = def.build({ transcript: contextTranscript, userText: userText || '' });

    // Watchdog: a provider that stalls mid-stream would otherwise hang the await forever,
    // leaving state.busy = true and wedging every later question until an app restart.
    let watchdog = null;
    let rearm = () => {};
    const stalled = new Promise((_res, reject) => {
      rearm = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => reject(new Error('the model stopped responding (timed out). Please try again.')), STREAM_INACTIVITY_MS);
      };
      rearm();
    });
    try {
      await Promise.race([
        llm.stream({
          system,
          turns: [{ role: 'user', text: built }],
          imageDataUrl,
          onToken: (t) => { if (streamSettled) return; rearm(); send('llm:token', { text: t }); },
          onResponse: settings.provider === publik.PUBLIK_PROVIDER ? (res) => publikNoteHeaders(res && res.headers) : undefined
        }),
        stalled
      ]);
    } finally {
      streamSettled = true;
      clearTimeout(watchdog);
    }
    send('llm:done', {});
    try {
      store.recordModelUse(llm.provider, llm.model);
      send('models:changed', store.modelChoices(llm.provider));
    } catch (_) { /* history persistence must not break a completed answer */ }
    // Streams settle after their headers, so the charge is reconciled from
    // GET /wallet shortly after the answer — one request per answer, debounced.
    if (settings.provider === publik.PUBLIK_PROVIDER) publikScheduleWalletRefresh();
  } catch (e) {
    recordEvent({ level: 'error', event: 'llm_failed', msg: e && e.message ? e.message : String(e), frame: 'runFeature', context: { mode, provider: store.getSettings().provider } });
    const action = e && e.action ? e.action : null;
    send('llm:error', { message: e && e.message ? e.message : String(e), action });
    if (action) publikHandleErrorAction(action);
  } finally {
    streamSettled = true;
    state.busy = false;
  }
}

// -------- IPC --------
// Redact on the way out, strip on the way in: the publik key never enters the
// renderer, and the renderer's whole-object Save can never clobber it.
ipcMain.handle('protection:get', () => protection.state());
ipcMain.handle('protection:set', (event, enabled) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) throw new Error('Screen-share protection is controlled from the Cue toolbar.');
  return setScreenShareProtection(enabled);
});
ipcMain.handle('window:zoom-get', () => windowZoom?.state() || { factor: 1 });
function ensureWindowVisible() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds(), area = screen.getDisplayMatching(windowGeometry.visibleBounds(bounds)).workArea;
  win.setBounds(windowGeometry.fitBounds(bounds, area));
}
ipcMain.on('window:ensure-visible', event => { if (event.sender === win?.webContents) ensureWindowVisible(); });
ipcMain.handle('discovery:refresh', event => {
  if (event.sender !== win?.webContents) throw new Error('Refresh Cue’s listing from Settings.');
  return macDiscovery?.refresh({ force: true }) || { available: false, indexed: false, message: 'Spotlight registration is unavailable.' };
});
function requireModelEditor(event, provider) {
  if (event.sender !== win?.webContents || !modelPreferences.PROVIDERS.includes(provider)) throw new Error('Choose models from Cue Settings.');
}
function requireModeEditor(event) {
  if (event.sender !== win?.webContents) throw new Error('Manage meeting modes from Cue.');
}
function changeMeetingModes(action, payload) {
  const state = store.mutateMeetingModes(action, payload);
  send('modes:changed', state);
  return state;
}
ipcMain.handle('modes:state', event => { requireModeEditor(event); return store.meetingModesState(); });
ipcMain.handle('modes:mutate', (event, action, payload) => {
  requireModeEditor(event);
  if (!['create', 'update', 'activate', 'reorder', 'duplicate', 'remove', 'restore', 'remove-file'].includes(action)) throw new Error('Unknown mode action.');
  return changeMeetingModes(action, payload);
});
const importingModeFiles = new Set();
async function attachModeFiles(event, id, choosePaths) {
  requireModeEditor(event);
  if (!store.meetingModesState().items.some(item => item.id === id)) throw new Error('This mode no longer exists.');
  if (importingModeFiles.has(id)) throw new Error('Wait for this mode’s files to finish importing.');
  importingModeFiles.add(id);
  try {
    const paths = await choosePaths();
    if (!Array.isArray(paths)) throw new Error('Choose supported context files.');
    if (!paths.length) return { state: store.meetingModesState(), added: 0, errors: [], canceled: true };
    const result = await readModeFiles(paths);
    const before = store.meetingModesState().items.find(item => item.id === id)?.files.length || 0;
    const state = result.files.length ? changeMeetingModes('add-files', { id, files: result.files }) : store.meetingModesState();
    const after = state.items.find(item => item.id === id)?.files.length || 0;
    return { state, added: after - before, errors: result.errors, canceled: false };
  } finally { importingModeFiles.delete(id); }
}
ipcMain.handle('modes:pick-files', (event, id) => attachModeFiles(event, id, async () => {
  const result = await dialog.showOpenDialog(win, { title: 'Add mode context files', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Context documents', extensions: MODE_FILE_EXTENSIONS }] });
  return result.canceled ? [] : result.filePaths;
}));
ipcMain.handle('modes:attach-paths', (event, id, paths) => attachModeFiles(event, id, async () => paths));
ipcMain.handle('models:choices', (event, provider) => {
  requireModelEditor(event, provider);
  return store.modelChoices(provider);
});
ipcMain.handle('models:remember', (event, provider, id) => {
  requireModelEditor(event, provider);
  const choices = store.rememberModel(provider, id);
  send('models:changed', choices);
  return choices;
});
ipcMain.handle('models:forget', (event, provider, id) => {
  requireModelEditor(event, provider);
  const choices = store.forgetModel(provider, id);
  send('models:changed', choices);
  return choices;
});
ipcMain.handle('models:catalog', (event, provider, force) => {
  requireModelEditor(event, provider);
  if (provider !== 'openai') return { models: [], live: false, message: '' };
  return modelCatalog.get({ apiKey: store.getSettings().apiKeys.openai, force: force === true });
});
ipcMain.handle('sessions:list', event => {
  if (event.sender !== win?.webContents) throw new Error('Session history is available only in Cue.');
  return listSessions(meetingStore, state.capturing ? meetingMemory?.current?.id : null);
});
ipcMain.handle('sessions:get', (event, id) => {
  if (event.sender !== win?.webContents) throw new Error('Session history is available only in Cue.');
  return getSession(meetingStore, id, state.capturing ? meetingMemory?.current?.id : null);
});
ipcMain.handle('settings:get', () => store.redactForRenderer(store.getSettings()));
function audioConfiguration(settings) {
  const provider = settings.sttProvider || 'auto';
  return JSON.stringify({ provider, meetingAudio: !!settings.meetingAudio,
    local: provider === 'local' ? settings.localWhisper : null,
    baseUrl: provider === 'custom' ? settings.baseUrl : null,
    keys: provider === 'local' ? null : Object.fromEntries(['openai', 'groq', 'gemini', 'deepgram', 'custom'].map(key => [key, settings.apiKeys?.[key] || ''])) });
}
ipcMain.handle('settings:set', async (_e, patch) => {
  const clean = store.stripRendererPatch(patch), previous = store.getSettings();
  const candidate = { ...previous, ...clean, apiKeys: { ...previous.apiKeys, ...clean.apiKeys }, localWhisper: { ...previous.localWhisper, ...clean.localWhisper } };
  if ((state.capturing || desiredCaptureState) && audioConfiguration(previous) !== audioConfiguration(candidate)) {
    desiredCaptureState = false;
    if (win && !win.isDestroyed()) await win.webContents.executeJavaScript('window.CueListening ? window.CueListening.flush() : undefined');
    captureTransition = captureTransition.catch(() => false).then(() => setCapturing(false));
    await captureTransition;
    send('status', { message: 'Audio settings saved. Start a new session to use them.' });
  }
  sttDisabled = false;
  const next = store.setSettings(clean);
  const saveError = store.lastSaveError();
  if (saveError) throw new Error('Could not save Settings: ' + saveError.message);
  send('models:changed', store.modelChoices(next.provider));
  // Restart slide polling with the new interval when capturing (keeps slides).
  if (state.capturing) startSlideLoop();
  return store.redactForRenderer(next);
});

// -------- publik API --------
// Contract: ~/publik-api-research/CONTRACT.md. The key is minted only after
// the disclosure is accepted (publik:accept-disclosure); the balance line is
// fed by the x-publik-* headers on every answer and reconciled from GET /wallet.
let publikWalletTimer = null;
let publikProvisioning = null;

function publikDevice() {
  let deviceName = '';
  try { deviceName = os.hostname(); } catch { /* optional */ }
  return { appVersion: app.getVersion(), platform: process.platform, osVersion: os.release(), arch: process.arch, deviceName };
}

function publikState() {
  const s = store.getSettings();
  const p = s.publik || {};
  const connected = !!s.apiKeys.publik;
  const wallet = p.wallet || null;
  const claimState = (wallet && wallet.claimState) || p.claimState || 'anonymous';
  const view = {
    available: publikBuild.available,
    selected: s.provider === publik.PUBLIK_PROVIDER,
    connected,
    revoked: !!p.revoked,
    disconnected: !!p.disconnected,
    keyId: p.keyId || '',
    claimState,
    claimUrl: p.claimUrl || (wallet && wallet.claimUrl) || '',
    addCreditUrl: (wallet && wallet.addCreditUrl) || '',
    topUpUrl: (wallet && wallet.topUpUrl) || p.claimUrl || '',
    starterMicros: p.starterMicros || 0,
    balanceMicros: p.balanceMicros,
    balanceAt: p.balanceAt || 0,
    balanceLabel: publik.formatMicros(p.balanceMicros),
    wallet,
    disclosureAccepted: p.disclosureAccepted || 0,
    disclosureVersion: publikBuild.disclosureVersion,
    lastError: p.lastError || '',
    cardShown: !!p.cardShown,
    copy: publik.COPY,
    links: publik.LINKS
  };
  view.line = publik.balanceLine(view);
  // CONTRACT §12: the first-run card (shown while connected && !cardShown),
  // the settings button, and the low-starter banner — all computed here so
  // the renderer only paints.
  view.card = publik.ctaView(view);
  view.settingsCta = publik.settingsCta(view);
  view.lowStarter = publik.lowStarterNotice(view);
  return view;
}
function publikPush() { send('publik:state', publikState()); }

async function publikProvision() {
  if (publikProvisioning) return publikProvisioning;
  publikProvisioning = publik.provisionInstall({
    build: publikBuild,
    store,
    device: publikDevice(),
    log: (e) => recordEvent({ level: e.level, event: e.event, msg: e.msg, frame: 'publikProvision', context: e.context || {} })
  }).then((r) => {
    if (r.ok && r.minted) store.setPublik({ disconnected: false });
    publikPush();
    return publikState();
  }).finally(() => { publikProvisioning = null; });
  return publikProvisioning;
}

// x-publik-* headers from a streamed answer: the balance after admission
// (the hold is included), the claim state, the week. Settlement follows.
function publikNoteHeaders(headers) {
  const h = publik.readGatewayHeaders(headers);
  if (!h) return;
  const s = store.getSettings();
  const wallet = { ...(s.publik.wallet || {}) };
  if (h.balanceMicros !== null) wallet.balanceMicros = h.balanceMicros;
  if (h.claimState) wallet.claimState = h.claimState;
  if (h.weekUsedMicros !== null) wallet.weekUsedMicros = h.weekUsedMicros;
  if (h.weekBudgetMicros !== null || h.weekResetsAt) wallet.weekBudgetMicros = h.weekBudgetMicros;
  if (h.weekResetsAt) wallet.weekResetsAt = h.weekResetsAt;
  if (h.starterRemainingMicros !== null) wallet.starterRemainingMicros = h.starterRemainingMicros;
  store.setPublik({
    balanceMicros: h.balanceMicros !== null ? h.balanceMicros : s.publik.balanceMicros,
    balanceAt: Date.now(),
    claimState: h.claimState || s.publik.claimState,
    wallet,
    revoked: false
  });
  publikPush();
}

async function publikRefreshWallet() {
  const s = store.getSettings();
  if (!s.apiKeys.publik) return publikState();
  try {
    const w = await publik.fetchWallet({ baseUrl: s.publik.baseUrl || publikBuild.baseUrl, apiKey: s.apiKeys.publik });
    store.setPublik({
      wallet: w, balanceMicros: w.balanceMicros, balanceAt: Date.now(), claimState: w.claimState,
      claimUrl: w.claimUrl || (w.claimState === 'claimed' ? '' : s.publik.claimUrl), revoked: false, disconnected: false, lastError: ''
    });
  } catch (e) {
    if (e.status === 401) publikHandleRevoked(e);
    else recordEvent({ level: 'warn', event: 'publik_wallet_failed', msg: e.message, frame: 'publikRefreshWallet', context: { status: e.status || null } });
  }
  publikPush();
  return publikState();
}
function publikScheduleWalletRefresh() {
  clearTimeout(publikWalletTimer);
  publikWalletTimer = setTimeout(() => { publikRefreshWallet().catch(() => {}); }, 1500);
}

// 401 key_revoked: reprovision:true (idle sweep) → re-mint on our own with the
// same install_id; reprovision:false (removed from the dashboard) → stay
// disconnected until the user presses Reconnect.
function publikHandleRevoked(e) {
  const revokedType = !!(e && e.type === 'key_revoked');
  const silent = revokedType && e.reprovision === true;
  // "disconnected" is the dashboard/uninstaller removal only; a plain 401
  // (invalid_api_key) just asks for Reconnect.
  store.setPublik({ revoked: true, disconnected: revokedType && !silent, lastError: '' });
  if (silent) publikProvision().catch(() => {});
}
function publikHandleErrorAction(action) {
  if (!action || action.kind !== 'reprovision') return;
  publikHandleRevoked({ type: 'key_revoked', reprovision: true });
}

ipcMain.handle('publik:state', () => publikState());
ipcMain.handle('publik:accept-disclosure', async () => {
  // Consent precedes mint: this is the only path that calls POST /installs
  // for a fresh install. It also selects publik if the user had moved away.
  if (!publikBuild.available) return publikState();
  store.setPublik({ disclosureAccepted: publikBuild.disclosureVersion });
  store.setSettings({ provider: publik.PUBLIK_PROVIDER });
  return publikProvision();
});
ipcMain.handle('publik:reconnect', async () => {
  const s = store.getSettings();
  if (!s.publik.disclosureAccepted) return publikState();
  if (s.apiKeys.publik && !s.publik.revoked) return publikRefreshWallet();
  store.setPublik({ revoked: true });
  return publikProvision();
});
ipcMain.handle('publik:refresh', () => publikRefreshWallet());
ipcMain.handle('publik:disconnect', async () => {
  const s = store.getSettings();
  if (s.apiKeys.publik) {
    try { await publik.revokeInstall({ baseUrl: s.publik.baseUrl || publikBuild.baseUrl, apiKey: s.apiKeys.publik }); } catch (e) { /* the key is dropped locally regardless */ }
  }
  store.setPublik({ apiKey: '', keyId: '', revoked: false, disconnected: true, balanceMicros: null, wallet: null, lastError: '' });
  publikPush();
  return publikState();
});
// "Later" or the primary button on the first-run card: the card was shown for
// this starter grant. Touches publik.cardShown only — the key stays in place
// and the balance is kept (§12.1).
ipcMain.handle('publik:card-seen', () => {
  try { publik.markCardSeen(store); } catch (e) { recordEvent({ level: 'error', event: 'publik_card_seen_failed', msg: e.message, frame: 'publik:card-seen', context: {} }); }
  publikPush();
  return publikState();
});
// The only path a gateway-supplied URL can take out of the app: publikhq.com
// only. A link off that origin is dropped (the stored claim link stands in
// when it is safe); nothing else is ever handed to the system browser.
ipcMain.on('publik:open', (_e, url) => {
  const s = store.getSettings();
  const target = publik.resolveOpenTarget(url, s.publik.claimUrl);
  if (!target) { recordEvent({ level: 'warn', event: 'publik_open_dropped', msg: '', frame: 'publik:open', context: {} }); return; }
  shell.openExternal(target).catch(() => {});
});
ipcMain.handle('capture:toggle', () => {
  const targetState = !desiredCaptureState;
  desiredCaptureState = targetState;
  if (!targetState && !state.capturing && localWhisperTranscriber) {
    localWhisperTranscriber.forceStop().catch(() => {});
  }
  captureTransition = captureTransition
    .catch(() => state.capturing)
    .then(() => setCapturing(targetState));
  return captureTransition;
});
ipcMain.handle('capture:state', () => ({ active: state.capturing }));
ipcMain.handle('whisper:models', () => getWhisperOverview());
ipcMain.handle('whisper:model-download', async (_event, modelId) => {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  const result = await whisperModelManager.download(modelId, (progress) => send('whisper:download-progress', progress));
  send('whisper:models-changed', { modelId });
  return result;
});
ipcMain.handle('whisper:model-cancel', (_event, modelId) => {
  if (!whisperModelManager) return false;
  return whisperModelManager.cancelDownload(modelId);
});
ipcMain.handle('whisper:model-delete', async (_event, modelId) => {
  requireWhisperModel(modelId);
  if (activeWhisperModelId === modelId) {
    throw new Error('Stop listening before deleting the active model.');
  }
  const result = await whisperModelManager.deleteModel(modelId);
  send('whisper:models-changed', { modelId });
  return result;
});
ipcMain.handle('whisper:model-import', async (_event, modelId) => {
  if (!whisperModelManager) throw new Error('The local Whisper model manager is not ready.');
  requireWhisperModel(modelId);
  if (activeWhisperModelId === modelId) {
    throw new Error('Stop listening before replacing the active model.');
  }
  const selection = await dialog.showOpenDialog(win, {
    title: `Import ggml-${modelId}.bin`,
    properties: ['openFile'],
    filters: [{ name: 'whisper.cpp model', extensions: ['bin'] }]
  });
  if (selection.canceled || !selection.filePaths[0]) return { cancelled: true };
  const result = await whisperModelManager.importModel(modelId, selection.filePaths[0]);
  send('whisper:models-changed', { modelId });
  return result;
});
ipcMain.handle('platform:info', () => ({
  platform: process.platform,
  winBuild: WIN_BUILD,
  winSupportsContentProtection: WIN_SUPPORTS_CONTENT_PROTECTION
}));
ipcMain.handle('transcript:clear', () => {
  if (meetingMemory) meetingMemory.end().catch(() => {}); // it stays in history with its notes
  transcript.splice(0, transcript.length);
  resetSlidesSession();
  send('slides:update', { count: 0, last: null });
  return { ok: true };
});
ipcMain.handle('slides:list', () => slideStore.list());
ipcMain.handle('slides:state', () => ({
  ...getSlidesConfig(),
  count: slideStore.count(),
  polling: !!slideTimer,
  disabled: slideDisabled
}));
ipcMain.handle('slides:clear', () => {
  resetSlidesSession();
  send('slides:update', { count: 0, last: null });
  return { ok: true };
});
ipcMain.on('ask', (_e, payload) => runFeature(payload.mode, payload.text));
ipcMain.on('mic:pcm', (_e, arrayBuffer) => { if (state.capturing) routeAudio('you', arrayBuffer); });
ipcMain.on('system:pcm', (_e, arrayBuffer) => { if (state.capturing) routeAudio('them', arrayBuffer); });
ipcMain.on('mouse:ignore', (event, v) => {
  if (win && !win.isDestroyed() && event.sender === win.webContents && !(windowInteraction && v)) win.setIgnoreMouseEvents(!!v, { forward: true });
});
// Main-process screen coordinates avoid drift when the window moves under the
// cursor. Pointer capture in the renderer owns release/cancel; blur and renderer
// teardown are independent backstops so an interrupted gesture never sticks.
let windowInteraction = null;
ipcMain.on('window:interaction-start', (event, gesture) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
  if (gesture?.kind !== 'drag' && !(gesture?.kind === 'resize' && windowGeometry.RESIZE_EDGES.has(gesture.edge))) return;
  stopWindowInteraction();
  const origin = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(windowGeometry.visibleBounds(bounds));
  const area = display.workArea;
  const limits = windowGeometry.sizeLimits(area);
  win.setMinimumSize(limits.minWidth + 2 * SIDE_W, limits.minHeight);
  win.setIgnoreMouseEvents(false);
  let moved = false;
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) { stopWindowInteraction(); return; }
    const cursor = screen.getCursorScreenPoint();
    const dx = cursor.x - origin.x, dy = cursor.y - origin.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);
    const next = gesture.kind === 'resize'
      ? windowGeometry.resizeBounds(bounds, origin, cursor, gesture.edge, area, { screenBounds: display.bounds })
      : windowGeometry.dragBounds(bounds, origin, cursor, cursorDisplay.workArea, { screenBounds: cursorDisplay.bounds });
    const current = win.getBounds();
    if (Object.keys(next).some(key => current[key] !== next[key])) win.setBounds(next);
  }, 16);
  windowInteraction = { timer };
});
ipcMain.on('window:interaction-end', event => {
  if (win && !win.isDestroyed() && event.sender === win.webContents) finishWindowInteraction();
});
function stopWindowInteraction() {
  if (windowInteraction) clearInterval(windowInteraction.timer);
  windowInteraction = null;
}
function fitWindowOnScreen() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(windowGeometry.visibleBounds(bounds));
  const area = display.workArea;
  const limits = windowGeometry.sizeLimits(area);
  win.setMinimumSize(limits.minWidth + 2 * SIDE_W, limits.minHeight);
  win.setBounds(windowGeometry.fitBounds(bounds, area, { allowPartialBottom: true, allowPartialSides: true, screenBounds: display.bounds }));
}
function finishWindowInteraction() {
  if (!windowInteraction) return;
  stopWindowInteraction();
  fitWindowOnScreen();
  saveWindowPosition();
}
ipcMain.on('open-pane', (_e, url) => { shell.openExternal(url).catch(() => {}); });
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('log', (_e, msg) => console.log('[renderer]', msg));
// -------- resume / job-description file import --------
// The dialog runs in MAIN and is filtered to pdf/docx; the renderer never supplies a path.
// The parsed text is RETURNED to the renderer, which drops it into the existing
// #resume-text / #job-description textareas so settings keep a single source of truth.
async function pickAndParseDocument() {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Resume / Job description', extensions: ['pdf', 'docx'] }]
  });
  if (res.canceled || !res.filePaths.length) return null;
  const filePath = res.filePaths[0];
  const text = await parseDocumentFile(filePath);
  return { fileName: path.basename(filePath), text };
}
ipcMain.handle('profile:pickDocument', async () => {
  try {
    const picked = await pickAndParseDocument();
    if (!picked) return { canceled: true };
    return { canceled: false, fileName: picked.fileName, text: picked.text };
  } catch (e) {
    return { canceled: false, error: (e && e.message) || String(e) };
  }
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.handle('applink:state', () => appLinkConsentState());
ipcMain.handle('applink:revoke', (_e, callerId) => {
  // Forgetting a caller also clears its separate slide-caption consent decision,
  // so a caller the user re-approves later is asked about slides again too,
  // rather than silently inheriting whatever it was granted or denied before.
  store.clearSlidesConsent(callerId);
  return revokeAppLinkCaller(callerId);
});

// -------- permissions IPC --------
ipcMain.handle('permissions:check', () => publishPermissionStatus());
ipcMain.handle('permissions:request', event => { requirePermissionWindow(event); return requestPermissions(); });
ipcMain.handle('permissions:details', async event => {
  requirePermissionWindow(event);
  return { version: app.getVersion(), executable: app.getPath('exe'), repairAvailable: screenPermissionRepair.available,
    signing: await signingDetails() };
});
ipcMain.handle('permissions:repair-screen', async event => {
  requirePermissionWindow(event);
  const saved = await win.webContents.executeJavaScript('window.CueMeetingModeUI ? window.CueMeetingModeUI.flush() : true');
  if (!saved) throw new Error('Save your mode edits before restarting Cue.');
  return screenPermissionRepair.repair();
});
ipcMain.on('permissions:show', event => {
  if (win && !win.isDestroyed() && event.sender === win.webContents) createPermissionsWindow();
});
ipcMain.on('permissions:continue', event => {
  if (!permWin || event.sender !== permWin.webContents) return;
  permWin.close();
  if (win && !win.isDestroyed()) { win.show(); win.focus(); }
});
ipcMain.on('app:restart', event => {
  if (event.sender !== win?.webContents && event.sender !== permWin?.webContents) return;
  restartCue();
});

// -------- shortcuts --------
function assistantShortcutsAvailable() {
  return mainWindowVisible() && shortcutRendererReady && shortcutContext.expanded && !shortcutContext.blocked
    && (!permWin || permWin.isDestroyed() || !permWin.isVisible());
}
function syncShortcuts() { shortcutController?.sync(); }
ipcMain.on('window:shortcut-context', (event, context) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents
    || typeof context?.expanded !== 'boolean' || typeof context?.blocked !== 'boolean') return;
  shortcutContext = { expanded: context.expanded, blocked: context.blocked };
  syncShortcuts();
});
function registerShortcuts() {
  if (shortcutController) { syncShortcuts(); return; }
  shortcutController = createShortcutController({
    globalShortcut, state: shortcutState, canRunActions: assistantShortcutsAvailable,
    actions: {
      say: () => runFeature('say', ''), assist: () => runFeature('assist', ''), leetcode: () => runFeature('leetcode', ''),
      hide: () => {
        if (!mainWindowVisible()) showMainWindow();
        else send('hide:toggle', {});
      },
      quit: () => app.quit()
    },
    onUnavailable: name => {
      recordEvent({ level: 'warn', event: 'shortcut_unavailable', msg: 'another application holds the ' + name + ' shortcut', frame: 'registerShortcuts', context: { shortcut: name } });
    },
    onError: (_name, error) => send('status', { message: error.message || String(error) })
  });
  shortcutController.start();
  if (isMac) {
    for (const name of ['NSApplicationDidHideNotification', 'NSApplicationDidUnhideNotification']) {
      shortcutNotifications.push(systemPreferences.subscribeLocalNotification(name, syncWindowAvailability));
    }
  }
}

// -------- permissions --------
function getPermissionStatus() {
  return readPermissionStatus(systemPreferences);
}
function requirePermissionWindow(event) {
  if (event.sender !== win?.webContents && event.sender !== permWin?.webContents) throw new Error('Manage capture access from Cue.');
}
function publishPermissionStatus() {
  const status = getPermissionStatus();
  send('permissions:changed', status);
  if (permWin && !permWin.isDestroyed()) permWin.webContents.send('permissions:changed', status);
  return status;
}
let signingDetailsPromise = null;
function signingDetails() {
  if (!isMac) return Promise.resolve({ kind: 'not-applicable', stable: true });
  if (!signingDetailsPromise) signingDetailsPromise = readSigningInfo(app.isPackaged ? path.resolve(process.resourcesPath, '..', '..') : app.getPath('exe'));
  return signingDetailsPromise;
}
function restartCue(requestScreen = false) {
  app.relaunch({ execPath: app.getPath('exe'), args: relaunchArgs(process.argv, requestScreen) });
  app.quit();
}
const screenPermissionRepair = createScreenPermissionRepair({
  platform: process.platform, isPackaged: app.isPackaged, bundleId: 'com.cue.overlay',
  stopCapture: async () => { desiredCaptureState = false; await setCapturing(false); },
  run: (file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10000, maxBuffer: 8192 }, error => error
      ? reject(new Error('macOS could not refresh Cue’s screen grant. Try removing Cue from Screen Recording in System Settings, then adding it again.')) : resolve());
  }),
  restart: async () => {
    restartCue(true);
  }
});

let pendingPermissionRequest = null;
function requestPermissions() {
  if (!pendingPermissionRequest) {
    pendingPermissionRequest = requestCapturePermissions({ systemPreferences, desktopCapturer })
      .then(status => { send('permissions:changed', status); return status.mic === 'granted' && status.screen === 'granted'; })
      .finally(() => { pendingPermissionRequest = null; });
  }
  return pendingPermissionRequest;
}

function createPermissionsWindow() {
  if (permWin && !permWin.isDestroyed()) { permWin.show(); permWin.focus(); return; }
  const { workArea } = screen.getPrimaryDisplay();
  const W = Math.min(540, workArea.width), H = Math.min(760, workArea.height - 24);
  // An overlay at screen-saver level can cover macOS's own Allow / Touch ID
  // prompts. Keep it at ordinary level while the user reviews capture access.
  win?.setAlwaysOnTop(false);
  permWin = new BrowserWindow({
    width: W,
    height: H,
    minWidth: Math.min(500, W),
    minHeight: Math.min(560, H),
    x: Math.round(workArea.x + (workArea.width - W) / 2),
    y: Math.round(workArea.y + (workArea.height - H) / 2),
    frame: true,
    transparent: false,
    backgroundColor: '#16181e',
    hasShadow: true,
    resizable: true,
    skipTaskbar: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });
  protection.applyToWindow(permWin);
  for (const event of ['show', 'hide', 'minimize', 'restore']) permWin.on(event, syncShortcuts);
  syncShortcuts();
  permWin.loadFile(path.join(__dirname, 'renderer', 'permissions.html'));
  let refreshTimer = null;
  permWin.on('focus', publishPermissionStatus);
  permWin.on('closed', () => {
    clearInterval(refreshTimer); permWin = null;
    syncShortcuts();
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver', 1);
  });
  refreshTimer = setInterval(publishPermissionStatus, 2000);
  permWin.webContents.on('did-finish-load', () => permWin.show());
}

// -------- launch --------
function launchApp() {
  if (appLaunched) {
    // Already launched once (Windows startup runs launchApp() unconditionally
    // even while the permission gate is still showing). Just dismiss the gate
    // and bring the existing main window forward instead of building a second
    // one on top of it.
    if (permWin && !permWin.isDestroyed()) { permWin.close(); permWin = null; }
    if (win && !win.isDestroyed()) { win.showInactive(); }
    return;
  }
  appLaunched = true;

  if (isMac && app.dock) app.dock.hide();

  // Before the app-link snapshot and before the window exists, so a first run
  // boots with provider 'publik'. Runs once per settings file and never moves
  // a user who has a working key. No network call happens here.
  if (store.applyPublikDefault(publikBuild)) {
    recordEvent({ level: 'info', event: 'publik_default_applied', msg: '', frame: 'launchApp', context: {} });
  }

  whisperModelManager = new WhisperModelManager({ userDataPath: app.getPath('userData') });

  meetingStore = createMeetingStore({ file: path.join(app.getPath('userData'), 'meetings.json'), debounceMs: 1500 });
  meetingMemory = createMeetingMemory({
    store: meetingStore,
    llmFactory: () => createLLM(store.getSettings()),
    log: (msg) => console.log('[meetings]', msg)
  });
  restoredTurns = meetingMemory.resumeOpen();
  if (restoredTurns.length) transcript.push(...restoredTurns.slice(-MAX_TRANSCRIPT_TURNS));
  meetingMemory.catchUp().then((n) => { if (n) console.log(`[meetings] wrote notes for ${n} earlier meeting(s)`); }).catch(() => {});

  const allowMedia = (permission) => permission === 'media' || permission === 'microphone' || permission === 'audioCapture' || permission === 'display-capture' || permission === 'screen';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowMedia(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));

  // System-audio loopback for getDisplayMedia: hand back a screen source with 'loopback'
  // audio so the renderer can capture what's playing (Zoom/Meet) using cue's own grant.
  //
  // Two things are true here and both must hold.
  //
  // 1. `audio` must be the string 'loopback' or 'loopbackWithMute' (or a WebFrameMain).
  // Electron's native binding for this callback rejects anything else, including a
  // plain boolean. Windows used to get `true`, which threw synchronously and surfaced
  // to the renderer as AbortError "Error starting capture" ("Meeting audio could not be
  // started"), and also invoked this one-time `callback` a SECOND time. Never pass a
  // boolean on any platform, and invoke `callback` from exactly one place.
  //
  // 2. On macOS the grant is not free: the only route to system audio is a
  // ScreenCaptureKit session over a real display, so while it is held open macOS paints
  // its screen-recording indicator and names cue under Control Center's "Currently
  // Sharing" — pixels every screen-share viewer sees. Nothing app-side suppresses it
  // (an audio-only grant is rejected by Chromium; a window source lights the same
  // indicator), so the honest answer is consent: never open that session on macOS
  // unless the user switched Meeting audio on in Settings > Audio. This guard is the
  // enforcement point and holds even if another renderer path calls getDisplayMedia.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    // The macOS consent gate resolves to an empty source list instead of invoking the
    // one-time reply itself, so this handler keeps exactly one invocation site.
    // test/display-media-audio.test.js counts them, because a second site is how the
    // "One-time callback was called more than once" bug happened before.
    const allowed = !isMac || Boolean(store.getSettings().meetingAudio);
    (allowed ? desktopCapturer.getSources({ types: ['screen'] }) : Promise.resolve([]))
      .then((sources) => (sources.length ? { video: sources[0], audio: 'loopback' } : undefined))
      .catch((err) => {
        console.error('[main] system audio: desktopCapturer.getSources failed:', err);
        return undefined;
      })
      .then((request) => callback(request));
  }, { useSystemPicker: false });

  // Started before the shortcuts so their registration failures are recorded.
  startAppLink({
    snapshot: () => ({
      state,
      transcript,
      settings: store.getSettings(),
      sttDisabled,
      shortcuts: { ...shortcutState },
      windowAlive: !!(win && !win.isDestroyed()),
      slides: slideStore.list(),
    }),
    setCapturing,
    getSlides: () => slideStore.list(),
    getSlidesConsent: (callerId) => store.getSlidesConsent(callerId),
    setSlidesConsent: (callerId, decision) => store.setSlidesConsent(callerId, decision),
    // Looked up rather than captured: the window is recreated on 'activate',
    // so a reference taken at startup goes stale.
    getWindow: () => win,
  });

  createWindow();
  createTray();
  createApplicationMenu();
  registerShortcuts();
}

// -------- lifecycle --------
let readyToQuit = false;
let quitPending = false;
app.on('before-quit', event => {
  if (readyToQuit || !win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  let timer;
  Promise.race([
    win.webContents.executeJavaScript('window.CueMeetingModeUI ? window.CueMeetingModeUI.flush() : true'),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Saving mode edits took too long.')), 5000); })
  ]).then(async saved => {
    if (saved === false) throw new Error('Your mode edits could not be saved. Correct the highlighted field or retry saving before quitting.');
    if (state.capturing) await win.webContents.executeJavaScript('window.CueListening ? window.CueListening.flush() : undefined');
    desiredCaptureState = false;
    await setCapturing(false);
    readyToQuit = true; app.quit();
  }).catch(error => {
    showMainWindow(); send('status', { message: error.message });
  }).finally(() => { clearTimeout(timer); quitPending = false; });
});
app.whenReady().then(async () => {
  if (!ownsInstanceLock) return;
  const onDisplayChange = () => { stopWindowInteraction(); fitWindowOnScreen(); saveWindowPosition(); };
  screen.on('display-removed', onDisplayChange);
  screen.on('display-metrics-changed', onDisplayChange);
  const userDataPath = app.getPath('userData');
  app.setName('Cue');
  app.setPath('userData', userDataPath); // retain the existing profile and keys

  // Capture permissions gate capture features, never the window itself.
  // No capture or access request runs during launch.
  launchApp();
  macDiscovery = createMacDiscovery({
    platform: process.platform, isPackaged: app.isPackaged,
    bundlePath: path.resolve(process.resourcesPath, '..', '..'), version: app.getVersion(),
    readVersion: () => store.getSettings().macRegistrationVersion,
    writeVersion: version => store.setSettings({ macRegistrationVersion: version })
  });
  void macDiscovery.refresh();
  // This flag exists only after the user's explicit Repair action. Consume it
  // before requesting once; ordinary startup remains entirely prompt-free.
  if (screenPermissionRepair.available && app.commandLine.hasSwitch(SCREEN_REPAIR_SWITCH)) {
    app.commandLine.removeSwitch(SCREEN_REPAIR_SWITCH);
    process.argv.splice(1, process.argv.length - 1, ...relaunchArgs(process.argv));
    createPermissionsWindow();
    try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch (_) {}
    publishPermissionStatus();
  }
  app.on('activate', () => showMainWindow());
});

app.on('will-quit', () => {
  shortcutController?.dispose();
  for (const id of shortcutNotifications) systemPreferences.unsubscribeLocalNotification(id);
  trayController?.destroy();
  stopWindowInteraction();
  saveWindowPosition();
  globalShortcut.unregisterAll();
  // Quitting mid-meeting is a pause, not an end: the meeting stays open on disk
  // so a relaunch within the resume window picks it back up (a stale one is
  // closed and its notes written at the next launch). Just get the bytes down.
  if (meetingMemory) meetingMemory.flush();
  // Best effort, deliberately not blocking the quit: the library also removes
  // the instance file from a `process.on('exit')` handler, and a file left
  // behind is harmless anyway because readers check whether the PID is alive.
  // Delaying shutdown to tidy a directory would be the wrong trade.
  stopAppLink();
  stopSlideLoop();
  if (whisperModelManager?.activeDownload) {
    whisperModelManager.cancelDownload(whisperModelManager.activeDownload.modelId);
  }
  if (localWhisperTranscriber) localWhisperTranscriber.forceStop().catch(() => {});
});
app.on('window-all-closed', (e) => {
  // Don't quit while the permissions window is open — the user may be in System Settings
  if (permWin) { e.preventDefault(); return; }
  app.quit();
});
