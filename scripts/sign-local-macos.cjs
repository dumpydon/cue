// Sign only after all bundle contents are finalized. The key itself lives in
// the user's Keychain, never in this repository or a downloaded app.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { parseSigningInfo } = require('../src/macos-signing');

function signLocalBundle(bundlePath, { configPath = path.join(os.homedir(), 'Library/Application Support/Cue Development/local-signing.json'), run, platform = process.platform } = {}) {
  if (platform !== 'darwin') throw new Error('Local macOS signing must run on a Mac.');
  const bundle = path.resolve(bundlePath);
  if (!bundle.endsWith('.app') || !fs.existsSync(path.join(bundle, 'Contents/Info.plist'))) throw new Error('Choose a built Cue .app bundle.');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!/^[A-Fa-f0-9]{40}$/.test(config.fingerprint || '')) throw new Error('The local signing certificate is not configured.');
  const execute = run || ((file, args) => {
    try { return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { throw new Error('Local signing failed: ' + (error.stderr?.toString() || error.message)); }
  });
  const id = execute('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(bundle, 'Contents/Info.plist')]).trim();
  if (id !== 'com.cue.overlay') throw new Error('This signer is restricted to Cue bundles.');
  execute('/usr/bin/codesign', ['--force', '--deep', '--sign', config.fingerprint, '--options', 'runtime', '--timestamp=none',
    '--entitlements', path.resolve(__dirname, '../build-resources/entitlements.mac.plist'), bundle]);
  execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
  // codesign's display information is sent to stderr.
  const output = run ? execute('/usr/bin/codesign', ['--display', '--verbose=4', '-r-', bundle]) : (() => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', '-r-', bundle], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Could not verify the final signing identity.');
    return result.stdout + result.stderr;
  })();
  const signature = parseSigningInfo(output);
  if (!signature.stable || !signature.requirement.toLowerCase().includes(config.fingerprint.toLowerCase())) throw new Error('The final code identity is not bound to the configured local certificate.');
  if (config.requirement) execute('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', config.requirement, bundle]);
  if (!config.requirement) fs.writeFileSync(configPath, JSON.stringify({ ...config, requirement: signature.requirement }, null, 2) + '\n', { mode: 0o600 });
  return { bundle, authority: signature.authority, stable: true, requirement: signature.requirement };
}

if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/sign-local-macos.cjs /path/to/cue.app');
    console.log(JSON.stringify(signLocalBundle(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { signLocalBundle };
