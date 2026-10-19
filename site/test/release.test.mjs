import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseMetadata, validateAssetMetadata } from '../scripts/publish-preview.mjs';
import { verifiedParts } from '../build.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
test('release recovery rejects a stable release, changed source, or mismatched existing bytes', () => {
  const source = 'a'.repeat(40), tag = 'v0.4.14-preview.1';
  const draft = { tag_name: tag, prerelease: true, draft: true, target_commitish: source };
  assert.doesNotThrow(() => validateReleaseMetadata(draft, tag, source));
  assert.throws(() => validateReleaseMetadata({ ...draft, prerelease: false }, tag, source));
  assert.throws(() => validateReleaseMetadata({ ...draft, target_commitish: 'b'.repeat(40) }, tag, source));
  const expected = { filename: 'cue-preview.zip', bytes: 200, sha256: 'c'.repeat(64) };
  const asset = { size: 200, state: 'uploaded', digest: 'sha256:' + expected.sha256 };
  assert.doesNotThrow(() => validateAssetMetadata(asset, expected));
  assert.throws(() => validateAssetMetadata({ ...asset, state: 'starter' }, expected));
  assert.throws(() => validateAssetMetadata({ ...asset, size: 100 }, expected));
  assert.throws(() => validateAssetMetadata({ ...asset, digest: 'sha256:' + 'd'.repeat(64) }, expected));
});
test('a deployable bootstrap requires exact present pieces, and rejects damaged or missing files', async () => {
  const staging = await mkdtemp(path.join(os.tmpdir(), 'cue-site-build-'));
  const data = Buffer.from('verified download bytes'), relative = 'parts/0.4.14/arm64/part-001.bin';
  const part = { path: '/downloads/' + relative, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  const release = { version: '0.4.14', assets: { arm64: { host: 'worker-preview', bytes: data.length, parts: [part] } } };
  try {
    await assert.rejects(verifiedParts(release, staging), /missing or incomplete/);
    await mkdir(path.dirname(path.join(staging, relative)), { recursive: true });
    await writeFile(path.join(staging, relative), data);
    assert.equal((await verifiedParts(release, staging)).length, 1);
    await writeFile(path.join(staging, relative), Buffer.alloc(data.length));
    await assert.rejects(verifiedParts(release, staging), /checksum mismatch/);
    part.path = '/downloads/parts/../../outside';
    await assert.rejects(verifiedParts(release, staging), /Invalid download piece/);
  } finally { await rm(staging, { recursive: true, force: true }); }
});
