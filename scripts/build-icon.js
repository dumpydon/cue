// Rebuild raster app / menu-bar icons from the editable SVG masters.
// Electron supplies the same SVG renderer as the app; no image service needed.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(require('electron'), [path.join(__dirname, 'render-icons.cjs')], { env, stdio: 'inherit' });
process.exitCode = result.status || (result.error ? 1 : 0);
