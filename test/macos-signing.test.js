const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSigningInfo, readSigningInfo } = require('../src/macos-signing');

test('hash-only ad-hoc signatures are distinguished from certificate-bound identities', () => {
  assert.equal(parseSigningInfo('Signature=adhoc\ndesignated => cdhash H"123456"').stable, false);
  const local = parseSigningInfo('Authority=Cue Local Development\ndesignated => identifier "com.cue.overlay" and anchor H"123456"');
  assert.equal(local.stable, true); assert.equal(local.kind, 'development');
  const release = parseSigningInfo('Authority=Developer ID Application: Example\ndesignated => identifier "com.cue.overlay" and anchor apple generic and certificate leaf[subject.OU] = "TEAM"');
  assert.equal(release.kind, 'developer-id'); assert.equal(release.stable, true);
  assert.equal(parseSigningInfo('designated => identifier "com.cue.overlay"').stable, false, 'an identifier alone does not prove identity');
});

test('signing diagnostics inspect exactly the supplied bundle and fail without claiming stability', async () => {
  const calls = [];
  const result = await readSigningInfo('/Applications/cue.app', { run: async (file, args) => { calls.push([file, args]); return 'Signature=adhoc\ndesignated => cdhash H"123"'; } });
  assert.equal(result.kind, 'ad-hoc'); assert.deepEqual(calls[0][1], ['--display','--verbose=4','-r-','/Applications/cue.app']);
  assert.equal((await readSigningInfo('/Applications/cue.app', { run: async () => { throw new Error('unavailable'); } })).stable, false);
});
