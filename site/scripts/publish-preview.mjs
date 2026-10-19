// Resume interrupted uploads without replacing already published bytes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repository = 'dumpydon/cue';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(site, '../.cache/release-publish');
function gh(...args) { return execFileSync('gh', [...args, '--repo', repository], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function api(endpoint, optional = false) {
  try { return JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${endpoint}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })); }
  catch (error) { if (optional && /HTTP 404/.test(String(error.stderr))) return null; throw error; }
}
async function digest(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

// GitHub's by-tag endpoint can return 404 for an unpublished draft. Drafts
// are discoverable in the authenticated release collection before tagging.
export function findRelease(tag, readApi = api) {
  const published = readApi('releases/tags/' + encodeURIComponent(tag), true);
  if (published) return published;
  for (let page = 1; page <= 10; page++) {
    const releases = readApi(`releases?per_page=100&page=${page}`);
    const matches = releases.filter(release => release.tag_name === tag);
    if (matches.length > 1) throw Error('Multiple drafts use this preview tag');
    if (matches.length) return matches[0];
    if (releases.length < 100) return null;
  }
  throw Error('Could not safely resolve preview release among existing drafts');
}

export function validateReleaseMetadata(release, tag, source) {
  if (release.tag_name !== tag || release.prerelease !== true) throw Error('Existing release is not the expected developer prerelease');
  if (release.draft && release.target_commitish !== source) throw Error('Draft points to different source; refusing to reuse it');
}
export function validateAssetMetadata(asset, expected) {
  if (asset.size !== expected.bytes || asset.state !== 'uploaded') throw Error('Existing release asset is incomplete or has a different size: ' + expected.filename);
  if (asset.digest && asset.digest !== 'sha256:' + expected.sha256) throw Error('Existing release asset has a different checksum: ' + expected.filename);
}

async function verifyTag(tag, source, required) {
  let ref = api(`git/ref/tags/${encodeURIComponent(tag)}`, !required);
  if (!ref) return;
  let object = ref.object;
  for (let depth = 0; object.type === 'tag' && depth < 4; depth++) object = api('git/tags/' + object.sha).object;
  if (object.type !== 'commit' || object.sha !== source) throw Error('Preview tag points to a different source commit');
}
async function verifyAsset(remote, expected, tag) {
  validateAssetMetadata(remote, expected);
  if (remote.digest) return;
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cue-release-verify-'));
  try {
    gh('release', 'download', tag, '--pattern', expected.filename, '--dir', temp);
    if (await digest(path.join(temp, expected.filename)) !== expected.sha256) throw Error('Existing asset checksum differs: ' + expected.filename);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
export async function publish() {
  const manifest = JSON.parse(await readFile(path.join(site, 'release.json'), 'utf8'));
  if (manifest.status !== 'developer-preview' || manifest.signing !== 'local-development' || manifest.notarized !== false || manifest.appleDeveloperId !== false || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '')) throw Error('A verified developer-preview manifest is required');
  const tag = `v${manifest.version}-preview.1`, source = manifest.sourceCommit;
  const expected = Object.values(manifest.assets).map(asset => ({ filename: asset.filename, bytes: asset.bytes, sha256: asset.sha256 }));
  if (!expected.length) throw Error('No preview artifacts');
  const sums = path.join(directory, 'SHA256SUMS.txt');
  expected.push({ filename: 'SHA256SUMS.txt', bytes: (await stat(sums)).size, sha256: await digest(sums) });
  for (const asset of expected) {
    if (!/^(?:cue-[a-zA-Z0-9._-]+\.zip|SHA256SUMS\.txt)$/.test(asset.filename) || !/^[a-f0-9]{64}$/.test(asset.sha256) || (await stat(path.join(directory, asset.filename))).size !== asset.bytes || await digest(path.join(directory, asset.filename)) !== asset.sha256) throw Error('Local release artifact failed integrity verification');
  }
  let release = findRelease(tag);
  await verifyTag(tag, source, false);
  if (!release) {
    gh('release', 'create', tag, '--draft', '--prerelease', '--target', source, '--title', `Cue ${manifest.version} — Developer Preview`, '--notes-file', path.join(directory, 'release-notes.md'));
    release = findRelease(tag);
    if (!release) throw Error('Created draft is not visible through the release collection');
  }
  validateReleaseMetadata(release, tag, source);
  const names = new Set(expected.map(asset => asset.filename));
  if (release.assets.some(asset => !names.has(asset.name))) throw Error('Unexpected existing release assets; refusing to alter them');
  for (const asset of expected) {
    const existing = release.assets.find(item => item.name === asset.filename);
    if (existing) await verifyAsset(existing, asset, tag);
    else gh('release', 'upload', tag, path.join(directory, asset.filename));
  }
  release = api('releases/' + release.id);
  for (const asset of expected) {
    const remote = release.assets.find(item => item.name === asset.filename);
    if (!remote) throw Error('Release upload did not complete');
    await verifyAsset(remote, asset, tag);
  }
  if (release.draft) gh('release', 'edit', tag, '--draft=false', '--prerelease', '--latest=false');
  release = api('releases/' + release.id);
  validateReleaseMetadata(release, tag, source);
  if (release.draft || !release.published_at) throw Error('Preview is still unpublished');
  await verifyTag(tag, source, true);
  console.log('Published and verified: ' + release.html_url);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await publish();
