const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const assets = path.join(root, 'renderer/assets');
const build = path.join(root, 'build-resources');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-icon-render-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  async function render(file, size) {
    const svg = fs.readFileSync(path.join(assets, file), 'utf8');
    const url = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    const data = await win.webContents.executeJavaScript(`new Promise((resolve,reject) => {
      const image = new Image(); image.onerror = reject;
      image.onload = () => { const c = document.createElement('canvas'); c.width = c.height = ${size}; c.getContext('2d').drawImage(image,0,0,${size},${size}); resolve(c.toDataURL('image/png').split(',')[1]); };
      image.src = ${JSON.stringify(url)};
    })`);
    return Buffer.from(data, 'base64');
  }
  const set = path.join(profile, 'icon.iconset'); fs.mkdirSync(set);
  for (const size of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(set, `icon_${size}x${size}.png`), await render('cue-app.svg', size));
    fs.writeFileSync(path.join(set, `icon_${size}x${size}@2x.png`), await render('cue-app.svg', size * 2));
  }
  if (process.platform === 'darwin') execFileSync('/usr/bin/iconutil', ['-c', 'icns', set, '-o', path.join(build, 'icon.icns')]);
  fs.writeFileSync(path.join(build, 'icon.png'), await render('cue-app.svg', 1024));
  fs.writeFileSync(path.join(assets, 'cue-icon.png'), await render('cue-app.svg', 256));
  fs.writeFileSync(path.join(assets, 'cueTrayTemplate.png'), await render('cue-tray.svg', 18));
  fs.writeFileSync(path.join(assets, 'cueTrayTemplate@2x.png'), await render('cue-tray.svg', 36));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = 6 + 16 * sizes.length;
  const entries = [], payloads = [];
  for (const size of sizes) {
    const png = await render('cue-app.svg', size), entry = Buffer.alloc(16);
    entry[0] = entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(offset, 12);
    offset += png.length; entries.push(entry); payloads.push(png);
  }
  fs.writeFileSync(path.join(build, 'icon.ico'), Buffer.concat([header, ...entries, ...payloads]));
  win.destroy(); fs.rmSync(profile, { recursive: true, force: true });
  console.log('Cue app and monochrome menu-bar icons generated.'); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
