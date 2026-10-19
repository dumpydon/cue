import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
export const output = path.resolve(here, '../dist/site');
export async function verifiedParts(release, staging) {
  const files = [];
  for (const [architecture, asset] of Object.entries(release.assets || {})) {
    if (asset.host !== 'worker-preview') continue;
    if (!['arm64', 'x64'].includes(architecture) || !/^\d+\.\d+\.\d+$/.test(release.version) || !asset.parts?.length || asset.parts.reduce((sum, part) => sum + part.bytes, 0) !== asset.bytes) throw Error('Invalid bootstrap download manifest');
    for (let index = 0; index < asset.parts.length; index++) {
      const part = asset.parts[index];
      const expected = `/downloads/parts/${release.version}/${architecture}/part-${String(index + 1).padStart(3, '0')}.bin`;
      if (part.path !== expected || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > 25 * 1024 ** 2 || !/^[a-f0-9]{64}$/.test(part.sha256)) throw Error('Invalid download piece');
      const relative = part.path.slice('/downloads/'.length), file = path.join(staging, relative);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile() || info.size !== part.bytes) throw Error('Required preview piece is missing or incomplete: ' + part.path);
      const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
      if (hash.digest('hex') !== part.sha256) throw Error('Preview piece checksum mismatch: ' + part.path);
      files.push({ file, relative });
    }
  }
  return files;
}
export async function build({ sourceCheck = false } = {}) {
  const release = JSON.parse(await readFile(path.join(here, 'release.json'), 'utf8'));
  const downloadStaging = path.resolve(here, '../.cache/cue-site-downloads/downloads');
  const pieces = sourceCheck ? [] : await verifiedParts(release, downloadStaging);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(path.join(here, 'public'), output, { recursive: true });
  for (const piece of pieces) {
    const target = path.join(output, 'downloads', piece.relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(piece.file, target);
  }
  await writeFile(path.join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  console.log('Cue website built: ' + output);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build({ sourceCheck: process.argv.includes('--source-check') || process.env.CUE_SITE_SOURCE_CHECK === '1' });
