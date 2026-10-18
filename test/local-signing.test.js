const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { signLocalBundle } = require('../scripts/sign-local-macos.cjs');
const { setupLocalSigning } = require('../scripts/setup-local-signing.cjs');

function fixture(t, fingerprint = 'A'.repeat(40)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-local-signing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const bundle = path.join(dir, 'cue.app'), config = path.join(dir, 'signing.json');
  fs.mkdirSync(path.join(bundle, 'Contents'), { recursive: true }); fs.writeFileSync(path.join(bundle, 'Contents/Info.plist'), 'fixture');
  fs.writeFileSync(config, JSON.stringify({ fingerprint }));
  return { bundle, config, fingerprint };
}

test('local signing requires a specific certificate and verifies continuity with the previous requirement', t => {
  const f = fixture(t), calls = [], requirement = 'identifier "com.cue.overlay" and anchor H"' + f.fingerprint + '"';
  fs.writeFileSync(f.config, JSON.stringify({ fingerprint: f.fingerprint, requirement }));
  const result = signLocalBundle(f.bundle, { platform: 'darwin', configPath: f.config, run(file, args) {
    calls.push([file, args]); if (file.endsWith('PlistBuddy')) return 'com.cue.overlay\n';
    return args[0] === '--display' ? 'Authority=Cue Local Development\ndesignated => ' + requirement : '';
  } });
  assert.equal(result.stable, true);
  assert.ok(calls.some(([, args]) => args.includes('--sign') && args.includes(f.fingerprint)));
  assert.ok(calls.some(([, args]) => args.includes('-R') && args.includes('=' + requirement)), 'literal requirements must use the = prefix rather than being interpreted as file paths');
  assert.ok(!calls.some(([, args]) => args.includes('--sign') && args[args.indexOf('--sign') + 1] === '-'), 'never silently falls back to ad-hoc signing');
});

test('the local signer rejects other apps, malformed identities and hash-only output', t => {
  const f = fixture(t);
  assert.throws(() => signLocalBundle(f.bundle, { platform: 'darwin', configPath: f.config, run: () => 'com.other.app' }), /restricted to Cue/);
  assert.throws(() => signLocalBundle(f.bundle, { platform: 'darwin', configPath: f.config, run: (file, args) => file.endsWith('PlistBuddy') ? 'com.cue.overlay' : args[0] === '--display' ? 'Signature=adhoc\ndesignated => cdhash H"A"' : '' }), /not bound/);
  fs.writeFileSync(f.config, JSON.stringify({ fingerprint: 'invalid' }));
  assert.throws(() => signLocalBundle(f.bundle, { platform: 'darwin', configPath: f.config }), /not configured/);
});

test('persistent signing setup cannot run without explicit acknowledgement and requires macOS', () => {
  assert.throws(() => setupLocalSigning({ platform: 'darwin' }), /User approval is required/);
  assert.throws(() => setupLocalSigning({ platform: 'linux', acknowledged: true }), /requires macOS/);
});
