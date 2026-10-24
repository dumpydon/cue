import { cp, mkdir, readFile, rm, writeFile, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
export const output = path.resolve(here, '../dist/site');
function escapeHTML(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
async function renderPages(directory, snippets, release, mediaVersions, assetRevision) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await renderPages(file, snippets, release, mediaVersions, assetRevision); continue; }
    if (!entry.name.endsWith('.html')) continue;
    let html = await readFile(file, 'utf8');
    for (const [name, snippet] of Object.entries(snippets)) html = html.replaceAll(`<!-- ${name} -->`, snippet);
    for (const [asset, version] of Object.entries(mediaVersions)) html = html.replaceAll(asset + '"', asset + '?v=' + version + '"');
    html = html.replace(/((?:src|href)="\/(?:js|styles)\/[^"?]+\.(?:js|css))"/g, '$1?v=' + assetRevision + '"');
    if (html.includes('<!-- RELEASE_DOWNLOADS -->')) {
      const cards = Object.entries(release.assets || {}).map(([arch, asset]) => {
        if (!['arm64','x64'].includes(arch) || asset.url !== '/get/mac/' + arch || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw Error('Invalid public download metadata');
        return `<div class="release-card"><h3>${arch === 'arm64' ? 'Apple silicon' : 'Intel Mac'}</h3><p>Cue ${escapeHTML(release.version)} · ${Math.ceil(asset.bytes / 1048576)} MB ZIP</p><a class="btn" href="${asset.url}">Download for ${arch === 'arm64' ? 'Apple silicon' : 'Intel'}</a><code class="checksum">SHA-256<br>${asset.sha256}</code></div>`;
      });
      html = html.replace('<!-- RELEASE_DOWNLOADS -->', `<div class="release-cards">${cards.join('')}</div>`);
    }
    await writeFile(file, html);
  }
}
export async function versionAssets(directory) {
  const files = [];
  async function collect(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) await collect(file);
      else if (/\.(?:js|css)$/.test(entry.name)) files.push(file);
    }
  }
  await collect(directory);
  files.sort();
  const hash = createHash('sha256');
  const sources = new Map();
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    sources.set(file, source);
    hash.update(path.relative(directory, file)).update('\0').update(source).update('\0');
  }
  // One content revision for the graph also handles the engine/worker cycle.
  // An updated engine always gives the entry point AND every import a new URL.
  const revision = hash.digest('hex').slice(0, 16);
  for (const [file, source] of sources) {
    if (!file.endsWith('.js')) continue;
    const revised = source.replace(/(['"])(\.{1,2}\/[^'"\s?]+\.js)\1/g,
      (_match, quote, url) => quote + url + '?v=' + revision + quote);
    await writeFile(file, revised);
  }
  return revision;
}
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
  const assetRevision = await versionAssets(output);
  const snippets = {};
  for (const [name, file] of Object.entries({ SITE_NAV: 'nav', SITE_FOOTER: 'footer', DOWNLOAD_MENU: 'download-menu', FILM_PLAYER: 'film-player', DESKTOP_DEMO: 'desktop-demo', PRICING: 'pricing' })) snippets[name] = await readFile(path.join(here, 'components', file + '.html'), 'utf8');
  const film = JSON.parse(await readFile(path.join(here, 'film.json'), 'utf8'));
  const poster = await readFile(path.join(here, 'public/media/cue-launch-poster.jpg'));
  const mediaVersions = { '/media/cue-launch.mp4': film.sha256.slice(0, 12), '/media/cue-launch.vtt': film.sha256.slice(0, 12), '/media/cue-launch-poster.jpg': createHash('sha256').update(poster).digest('hex').slice(0, 12) };
  await renderPages(output, snippets, release, mediaVersions, assetRevision);
  for (const piece of pieces) {
    const target = path.join(output, 'downloads', piece.relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(piece.file, target);
  }
  await writeFile(path.join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  console.log('Cue website built: ' + output);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build({ sourceCheck: process.argv.includes('--source-check') || process.env.CUE_SITE_SOURCE_CHECK === '1' });
