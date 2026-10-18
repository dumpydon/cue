// Run with Electron: electron scripts/smoke-window.cjs
// Uses an isolated, keyless profile and a virtual cursor; never captures the
// desktop, records audio, or sends a model request.
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, systemPreferences } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const geometry = require('../src/window-geometry');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-window-smoke-'));
app.setPath('userData', profile);
process.env.LOCALAPPDATA = profile;
const testProtection = process.env.CUE_SMOKE_PROTECTION === '1';
if (testProtection) delete process.env.CUE_NO_PROTECT;
else process.env.CUE_NO_PROTECT = '1';
fs.writeFileSync(path.join(profile, 'cue-data.json'), JSON.stringify({ onboarded: true }), { mode: 0o600 });

// No permission prompts in this test: it exercises geometry and DOM only.
const permissionDenied = process.env.CUE_SMOKE_DENIED === '1';
systemPreferences.getMediaAccessStatus = () => permissionDenied ? 'denied' : 'granted';
systemPreferences.askForMediaAccess = () => { throw new Error('Startup must not request microphone access'); };
desktopCapturer.getSources = () => { throw new Error('Startup and permission checks must not capture the desktop'); };
let cursor = { x: 0, y: 0 };
app.whenReady().then(() => { screen.getCursorScreenPoint = () => ({ ...cursor }); });
const appLink = require('../vendor/app-link');
const { AppLinkServer } = appLink;
appLink.AppLinkServer = class extends AppLinkServer {
  constructor(options) { super({ ...options, appId: `${options.appId}.window-smoke-${process.pid}` }); }
};

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let gestureStarts = 0, gestureEnds = 0;
ipcMain.on('window:interaction-start', () => queueMicrotask(() => { gestureStarts++; }));
ipcMain.on('window:interaction-end', () => queueMicrotask(() => { gestureEnds++; }));
async function until(predicate, description) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for ' + description);
    await pause(10);
  }
}
const errors = [];
const timeout = setTimeout(() => fail(new Error('Window smoke test timed out')), 25000);
function fail(error) { clearTimeout(timeout); console.error(error); app.exit(1); }
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

app.on('browser-window-created', (_event, win) => {
  win.protectionCalls = [];
  const setContentProtection = win.setContentProtection.bind(win);
  win.setContentProtection = enabled => { setContentProtection(enabled); win.protectionCalls.push(enabled); };
  win.showInactive = () => {}; // keep the user's installed app undisturbed
  win.show = () => {};
  win.webContents.setBackgroundThrottling(false);
  win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
  win.webContents.once('did-finish-load', async () => {
    if (!win.webContents.getURL().endsWith('/renderer/index.html')) return;
    try {
      const wc = win.webContents;
      async function screenshot(name) {
        const directory = process.env.CUE_WINDOW_QA_DIR;
        if (!directory) return;
        fs.mkdirSync(directory, { recursive: true });
        const size = win.getBounds();
        const image = await wc.capturePage({ x: 300, y: 0, width: size.width - 600, height: size.height });
        fs.writeFileSync(path.join(directory, name + '.png'), image.toPNG());
      }
      const js = async source => {
        try { return await wc.executeJavaScript(source, true); }
        catch (error) { throw new Error(`Smoke evaluation failed: ${source.slice(0,120)}\n${error.message}`); }
      };
      await js(`new Promise((resolve, reject) => {
        const deadline = Date.now() + 4000;
        const timer = setInterval(() => {
          if (document.querySelector('#messages .ai-text')) { clearInterval(timer); resolve(); }
          else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('renderer did not initialize')); }
        }, 25);
      })`);
      assert.equal(await js('window.cue.settingsGet().then(s => Object.values(s.apiKeys).every(key => !key))'), true);
      assert.equal(await js("document.querySelector('.drag-pill') === null"), true);
      assert.equal(await js("document.querySelectorAll('.window-resize-handle').length"), 8);
      assert.equal(BrowserWindow.getAllWindows().length, 1, 'capture permission does not gate startup');
      await js('window.cue.permissionsCheck()');
      assert.equal(await js("document.querySelector('#permissions-btn').classList.contains('hidden')"), !permissionDenied);
      const display = screen.getPrimaryDisplay();
      const area = display.workArea;
      const screenBounds = display.bounds;
      const initial = geometry.restoreBounds({ windowX: area.x + 200, windowY: area.y + 90, windowWidth: 650, windowHeight: 550 }, area);
      const reset = async () => { win.setBounds(initial); await pause(70); };
      await reset();

      async function waitForProtection(iconName) {
        await js(`new Promise((resolve, reject) => {
          const deadline = Date.now() + 3000;
          const timer = setInterval(() => {
            const button = document.querySelector('#protection-btn');
            if (button.dataset.icon === ${JSON.stringify(iconName)} && !button.disabled) { clearInterval(timer); resolve(); }
            else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('Protection toggle did not settle')); }
          }, 20);
        })`);
      }
      if (testProtection) {
        const protectionBounds = win.getBounds();
        async function protectionLayout() {
          await pause(220);
          return js(`(() => {
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect();
              return { x:r.x, y:r.y, width:r.width, height:r.height }; };
            const outline = getComputedStyle(document.querySelector('#panel-wrap > .incognito-outline'));
            const dots = getComputedStyle(document.querySelector('#panel-wrap > .incognito-outline rect'));
            return { frame:rect('#panel-wrap'), panel:rect('#panel'), toolbar:rect('#toolbar'),
              outline:rect('#panel-wrap > .incognito-outline'),
              path:rect('#panel-wrap > .incognito-outline rect'),
              font:getComputedStyle(document.querySelector('.ai-text')).fontSize,
              hidden:document.documentElement.classList.contains('incognito-mode'),
              diameter:dots.strokeWidth, spacing:dots.strokeDasharray, color:dots.stroke,
              opacity:outline.opacity, pointerEvents:outline.pointerEvents };
          })()`);
        }
        await waitForProtection('hat-glasses');
        const hiddenLayout = await protectionLayout();
        assert.equal(hiddenLayout.hidden, true);
        assert.equal(hiddenLayout.diameter, '3.06px');
        assert.ok(Math.abs(parseFloat(hiddenLayout.spacing.split(',')[1]) - 1000 / 121) < 0.0001);
        assert.equal(hiddenLayout.color, 'rgb(37, 40, 36)');
        assert.equal(hiddenLayout.opacity, '1');
        assert.equal(hiddenLayout.pointerEvents, 'none', 'outline never intercepts controls');
        assert.deepEqual(hiddenLayout.outline, hiddenLayout.frame, 'dots stay anchored to the original border');
        assert.equal(hiddenLayout.path.width, hiddenLayout.frame.width - 2);
        assert.equal(hiddenLayout.path.height, hiddenLayout.frame.height - 2);
        assert.equal(hiddenLayout.panel.x - hiddenLayout.frame.x, 7);
        assert.equal(hiddenLayout.panel.y - hiddenLayout.frame.y, 7);
        assert.equal(hiddenLayout.frame.width - hiddenLayout.panel.width, 14);
        assert.equal(hiddenLayout.frame.height - hiddenLayout.panel.height, 14);
        assert.deepEqual(win.getBounds(), protectionBounds, 'incognito leaves native geometry unchanged');
        assert.equal(win.protectionCalls.at(-1), true, 'startup sets the native protection flag');
        assert.equal(await js("document.querySelector('#protection-btn').getAttribute('aria-pressed')"), 'true');
        await screenshot('hidden-mode');
        await js("document.body.style.background='#fff'"); await screenshot('incognito-white');
        await js("document.body.style.background='#16181e'"); await screenshot('incognito-dark');
        await js("document.body.style.background=''");
        await js("document.querySelector('#protection-btn').click()");
        await waitForProtection('eye');
        const visibleLayout = await protectionLayout();
        assert.equal(visibleLayout.hidden, false);
        assert.equal(visibleLayout.opacity, '0');
        assert.deepEqual(visibleLayout.panel, visibleLayout.frame, 'visible mode restores the full panel');
        assert.deepEqual(visibleLayout.frame, hiddenLayout.frame, 'dotted border marks the original bounds');
        assert.deepEqual(visibleLayout.toolbar, hiddenLayout.toolbar, 'toolbar controls stay in place');
        assert.equal(visibleLayout.font, hiddenLayout.font, 'inset never scales text');
        assert.deepEqual(win.getBounds(), protectionBounds, 'leaving incognito preserves native geometry');
        assert.equal(win.protectionCalls.at(-1), false, 'visible mode clears native protection');
        assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8')).screenShareProtection, false);
        await screenshot('visible-mode');
        const loaded = new Promise(resolve => wc.once('did-finish-load', resolve));
        wc.reload(); await loaded;
        await waitForProtection('eye');
        assert.equal(await js("document.documentElement.classList.contains('incognito-mode')"), false);
        const before = win.protectionCalls.length;
        await js("document.querySelector('#protection-btn').click(); document.querySelector('#protection-btn').click()");
        await waitForProtection('hat-glasses');
        assert.equal(win.protectionCalls.length, before + 1, 'rapid clicks do not toggle twice');
        assert.equal(win.protectionCalls.at(-1), true);
        assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8')).screenShareProtection, true);
      }

      async function point(selector, fractionX = 0.5, fractionY = 0.5) {
        return js(`(() => {
          const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
          return { x: Math.round(r.left + r.width * ${fractionX}), y: Math.round(r.top + r.height * ${fractionY}) };
        })()`);
      }
      function input(type, point, extra = {}) { wc.sendInputEvent({ type, ...point, ...extra }); }
      async function press(point) {
        const bounds = win.getBounds();
        cursor = { x: bounds.x + point.x, y: bounds.y + point.y };
        input('mouseMove', point);
        input('mouseDown', point, { button: 'left', clickCount: 1 });
        await pause(45);
      }
      async function release(point) {
        input('mouseUp', point, { button: 'left', clickCount: 1 });
        await pause(45);
      }
      async function gesture(selector, dx, dy, fx, fy) {
        const pointAtStart = await point(selector, fx, fy);
        const started = gestureStarts, ended = gestureEnds;
        const startBounds = win.getBounds();
        await press(pointAtStart);
        // Wait for IPC admission before moving the virtual cursor. Fixed
        // sleeps race Electron's event delivery when a build is running.
        await until(() => gestureStarts > started, 'gesture start at ' + selector);
        cursor = { x: cursor.x + dx, y: cursor.y + dy };
        try {
          await until(() => JSON.stringify(win.getBounds()) !== JSON.stringify(startBounds), 'window movement at ' + selector);
        } catch (error) {
          const state = await js('({gesture: document.documentElement.dataset.windowInteraction, focused: document.hasFocus()})');
          throw new Error(`${error.message}; renderer=${JSON.stringify(state)}, starts=${gestureStarts}, ends=${gestureEnds}, cursor=${JSON.stringify(cursor)}`);
        }
        const b = win.getBounds();
        await release({ x: cursor.x - b.x, y: cursor.y - b.y });
        await until(() => gestureEnds > ended, 'gesture release at ' + selector);
        return win.getBounds();
      }

      // The old implementation only moved from the top bar. Exercise blank
      // answer space, panel padding, composer padding and settings headings.
      await js("document.querySelector('#messages').replaceChildren()");
      for (const [selector, fx, fy] of [['#messages', .5, .5], ['#panel', .02, .4], ['#composer', .02, .5]]) {
        await reset();
        const b = await gesture(selector, 25, 20, fx, fy);
        assert.equal(b.x, initial.x + 25, `drag ${selector}`);
        assert.equal(b.y, initial.y + 20, `drag ${selector}`);
        assert.equal(b.width, initial.width);
        assert.equal(b.height, initial.height);
      }

      for (const edge of geometry.RESIZE_EDGES) {
        await reset();
        const originBounds = win.getBounds();
        const handle = await point(`[data-resize="${edge}"]`);
        const startCursor = { x: originBounds.x + handle.x, y: originBounds.y + handle.y };
        const expected = geometry.resizeBounds(originBounds, startCursor, { x: startCursor.x + 25, y: startCursor.y + 20 }, edge, area);
        const b = await gesture(`[data-resize="${edge}"]`, 25, 20);
        assert.deepEqual(b, expected, `resize ${edge}`);
      }

      await reset();
      assert.equal(win.isVisible(), true, 'parking is checked on a visible native window');
      const toolbarPoint = await point('#toolbar .tb-divider');
      const toolbarScreenY = win.getBounds().y + toolbarPoint.y;
      // A real pointer stops at the display edge. Do not let a virtual cursor
      // far beyond the desktop make the test pass when physical dragging fails.
      const parked = await gesture('#toolbar .tb-divider', 0, screenBounds.y + screenBounds.height - 1 - toolbarScreenY);
      assert.equal(parked.y, screenBounds.y + screenBounds.height - geometry.visibleHeight(initial.height, screenBounds.height));
      assert.equal(parked.height, initial.height, 'parking does not resize the window');
      await pause(550);
      assert.deepEqual(win.getBounds(), parked, 'release and delayed bounds saving do not snap the window back');
      const parkedSettings = JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8'));
      assert.deepEqual(geometry.restoreBounds(parkedSettings, area, { screenBounds }), parked, 'parked position survives relaunch');
      await gesture('#toolbar .tb-divider', 0, -200);
      assert.equal(win.getBounds().y, parked.y - 200, 'visible toolbar can pull the parked window back');

      for (const direction of [-1, 1]) for (const corner of [false, true]) {
        await reset();
        const fraction = direction < 0 ? .97 : .03;
        const grab = await point('#panel', fraction, .08);
        const cursorX = initial.x + grab.x, cursorY = initial.y + grab.y;
        const targetX = direction < 0 ? screenBounds.x : screenBounds.x + screenBounds.width - 1;
        const targetY = corner ? screenBounds.y + screenBounds.height - 1 : cursorY;
        const b = await gesture('#panel', targetX - cursorX, targetY - cursorY, fraction, .08);
        const strip = geometry.visibleWidth(initial.width - 600, screenBounds.width);
        assert.equal(b.x + 300, direction < 0 ? screenBounds.x - (initial.width - 600) + strip : screenBounds.x + screenBounds.width - strip);
        assert.equal(b.y, corner ? screenBounds.y + screenBounds.height - geometry.visibleHeight(initial.height, screenBounds.height) : initial.y);
        assert.equal(b.width, initial.width);
        assert.equal(b.height, initial.height);
        await pause(550);
        assert.deepEqual(win.getBounds(), b, 'side parking survives releasing the mouse');
        const savedSide = JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8'));
        assert.deepEqual(geometry.restoreBounds(savedSide, area, { screenBounds }), b, 'side / corner position survives relaunch');
        await gesture('#panel', -direction * 200, corner ? -200 : 0, fraction, .08);
        assert.equal(win.getBounds().x, b.x - direction * 200, 'exposed panel can be dragged back from either side');
        assert.equal(win.getBounds().y, b.y - (corner ? 200 : 0));
      }

      // Typing, selectable answers, buttons and wheel scrolling must retain
      // native behavior; none may enter a window-movement gesture.
      await reset();
      const smart = await point('#smart-toggle');
      const wasSmart = await js("document.querySelector('#smart-toggle').classList.contains('on')");
      await press(smart); await release(smart);
      assert.equal(await js("document.querySelector('#smart-toggle').classList.contains('on')"), !wasSmart);
      assert.deepEqual(win.getBounds(), initial);
      const inputPoint = await point('#input');
      await press(inputPoint); await release(inputPoint);
      wc.insertText('Typing still works');
      assert.equal(await js("document.querySelector('#input').value"), 'Typing still works');
      assert.deepEqual(win.getBounds(), initial);
      await js("document.querySelector('#messages').innerHTML = '<div class=\"ai-text\">' + '<p>Selectable test response with enough text to scroll.</p>'.repeat(35) + '</div>'");
      const answer = await js(`(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('#messages p'));
        const r = range.getClientRects()[0];
        return { x: Math.round(r.left + 2), y: Math.round(r.top + r.height / 2) };
      })()`);
      await press(answer);
      assert.equal(await js('document.documentElement.dataset.windowInteraction === undefined'), true, 'selecting text is not dragging');
      input('mouseMove', { x: answer.x + 75, y: answer.y }, { movementX: 75, movementY: 0, modifiers: ['leftButtonDown'] });
      await release({ x: answer.x + 75, y: answer.y });
      assert.deepEqual(win.getBounds(), initial);
      assert.ok(await js('window.getSelection().toString().length > 0'), 'response text stays selectable');
      assert.equal(await js('document.documentElement.dataset.windowInteraction === undefined'), true);
      if (permissionDenied) {
        await js('window.cue.permissionsShow()');
        await until(() => BrowserWindow.getAllWindows().length === 2, 'permission review');
        const review = BrowserWindow.getAllWindows().find(window => window !== win);
        if (review.webContents.isLoading()) await new Promise(resolve => review.webContents.once('did-finish-load', resolve));
        if (testProtection) {
          assert.equal(review.protectionCalls.at(-1), true, 'new permission windows inherit hidden mode');
          await js('window.cue.protectionSet(false)');
          assert.equal(review.protectionCalls.at(-1), false, 'toggle also updates existing permission windows');
          await js('window.cue.protectionSet(true)');
        }
        assert.equal(await review.webContents.executeJavaScript("document.querySelector('#continue-btn').disabled"), false, 'Return to Cue is always available');
        for (let i = 0; i < 3; i++) await review.webContents.executeJavaScript('window.cue.permissionsCheck()');
        await review.webContents.executeJavaScript("document.querySelector('#continue-btn').click()");
        await until(() => review.isDestroyed(), 'return from permission review');
        assert.equal(BrowserWindow.getAllWindows().length, 1);
      }
      input('mouseWheel', answer, { deltaX: 0, deltaY: -150, canScroll: true });
      await pause(70);
      assert.ok(await js("document.querySelector('#messages').scrollTop > 0"), 'responses scroll');

      // At minimum size, long answers and multi-line input cannot push the
      // composer or Stop/Hide/Quit off screen.
      win.setBounds(geometry.restoreBounds({ windowX: area.x + 100, windowY: area.y + 80, windowWidth: 520, windowHeight: 360 }, area));
      await pause(80);
      await js("document.querySelector('#input').value = 'A long multi-line question.\\n'.repeat(15); document.querySelector('#input').dispatchEvent(new Event('input'))");
      const metrics = await js(`(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; };
        return { panel: rect('#panel'), messages: rect('#messages'), composer: rect('#composer'), send: rect('#send-btn'), toolbar: rect('#toolbar'), height: innerHeight };
      })()`);
      assert.ok(metrics.send.bottom <= metrics.panel.bottom, JSON.stringify(metrics));
      assert.ok(metrics.toolbar.top >= 0 && metrics.panel.bottom <= metrics.height, JSON.stringify(metrics));
      assert.ok(metrics.messages.height > 0, JSON.stringify(metrics));
      await screenshot('minimum-size');

      await js("document.querySelector('#tb-settings-btn').click()");
      await pause(80);
      const beforeSettingsDrag = win.getBounds();
      await gesture('.s-title', 18, 12);
      assert.equal(win.getBounds().x, beforeSettingsDrag.x + 18, 'settings background draggable');
      assert.equal(await js("document.querySelector('#settings').getBoundingClientRect().bottom <= innerHeight"), true);
      await screenshot('minimum-settings');
      await js("document.querySelector('#s-close').click()");
      await pause(100);

      await reset();
      await js("document.querySelector('#history-btn').click()");
      await pause(250);
      assert.equal(await js("document.querySelector('#transcript-sidebar').classList.contains('open')"), true);
      await gesture('.ts-title', 15, 10);
      assert.equal(win.getBounds().x, initial.x + 15, 'transcript header draggable');
      await js("document.querySelector('#close-sidebar-btn').click(); document.querySelector('#hide-btn').click()");
      await pause(70);
      const collapsedBounds = win.getBounds();
      await gesture('#toolbar .tb-divider', 15, 10);
      assert.equal(win.getBounds().x, collapsedBounds.x + 15, 'collapsed toolbar draggable');
      await js("document.querySelector('#hide-btn').click()");

      await reset();
      await gesture('[data-resize="se"]', 28, 24);
      await screenshot('expanded');
      await pause(550);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'cue-data.json'), 'utf8'));
      assert.deepEqual(geometry.restoreBounds(saved, area), win.getBounds(), 'size and position restore');
      const finished = win.getBounds();
      cursor.x += 100; cursor.y += 100;
      await pause(80);
      assert.deepEqual(win.getBounds(), finished, 'released window cannot keep following the cursor');
      assert.equal(await js('document.documentElement.dataset.windowInteraction === undefined'), true);
      assert.deepEqual(errors, [], 'no renderer errors');
      clearTimeout(timeout);
      console.log('PASS: window interactions, permission checks' + (testProtection ? ', native protection toggling, icons, rapid clicks, persistence and all windows.' : '.'));
      app.quit();
    } catch (error) { fail(error); }
  });
});

require('../main.js');
