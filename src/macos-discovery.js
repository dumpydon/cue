const { execFile } = require('node:child_process');
const path = require('node:path');
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

function createMacDiscovery({ platform, isPackaged, bundlePath, version, readVersion, writeVersion, run } = {}) {
  const available = platform === 'darwin' && isPackaged && typeof bundlePath === 'string' && path.isAbsolute(bundlePath) && bundlePath.endsWith('.app');
  let pending = null;
  const execute = run || ((file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 10000, maxBuffer: 65536 }, (error, stdout) => error ? reject(error) : resolve(stdout));
  }));
  const canonical = value => value.trim().replace(/^\/System\/Volumes\/Data(?=\/)/, '').toLowerCase();
  async function indexed() {
    const output = await execute('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "com.cue.overlay"']);
    return String(output).split('\n').some(item => canonical(item) === canonical(bundlePath));
  }
  async function refresh({ force = false } = {}) {
    if (!available) return { available: false, indexed: false, message: 'Spotlight registration is available in the installed macOS app.' };
    if (pending) return pending;
    const operation = (async () => {
      try {
        if (!force && readVersion() === version && await indexed()) return { available: true, indexed: true, message: 'Cue is listed in Spotlight.' };
        // Register only this application. Never reset a disk index or request
        // administrator access as part of installing / launching Cue.
        await execute(LSREGISTER, ['-f', bundlePath]);
        await execute('/usr/bin/mdimport', ['-i', bundlePath]);
        writeVersion(version);
        const found = await indexed();
        return { available: true, indexed: found, message: found ? 'Cue is listed in Spotlight.' : 'Refresh requested. macOS has not indexed Cue yet.' };
      } catch (_) {
        return { available: true, indexed: false, message: 'macOS could not refresh Cue’s Spotlight listing. Check Spotlight settings.' };
      }
    })();
    pending = operation;
    try { return await operation; } finally { if (pending === operation) pending = null; }
  }
  return { refresh };
}

module.exports = { createMacDiscovery };
