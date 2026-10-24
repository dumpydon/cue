import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { versionAssets, output } from '../build.mjs';

test('a particle-engine update invalidates the complete module graph, including its worker cycle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cue-asset-versions-'));
  const files = {
    'js/site.js': "import './particles.js';",
    'js/particles.js': "import('./vendor/engine.js');",
    'js/vendor/engine.js': "new Worker(new URL('./worker.js', import.meta.url), {type:'module'});",
    'js/vendor/worker.js': "import { build } from './engine.js';",
    'styles/site.css': 'body{background:#05070b}'
  };
  async function reset(suffix = '') {
    for (const [name, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, name)), { recursive: true });
      await writeFile(path.join(root, name), source + (name.endsWith('engine.js') ? suffix : ''));
    }
  }
  try {
    await reset(); const first = await versionAssets(root);
    for (const [file, source] of Object.entries(files).filter(([file]) => file.endsWith('.js'))) {
      const compiled = await readFile(path.join(root, file), 'utf8');
      assert.match(compiled, new RegExp('\\.js\\?v=' + first));
      assert.equal(compiled.replaceAll('?v=' + first, ''), source);
    }
    await reset(); assert.equal(await versionAssets(root), first, 'unchanged source has a stable revision');
    await reset('\n// updated compositor');
    const second = await versionAssets(root);
    assert.notEqual(second, first);
    assert.match(await readFile(path.join(root, 'js/site.js'), 'utf8'), new RegExp(second));
    assert.match(await readFile(path.join(root, 'js/vendor/worker.js'), 'utf8'), new RegExp(second));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('built pages and the real particle worker use the same versioned asset graph', async () => {
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  const revision = /src="\/js\/site\.js\?v=([a-f0-9]{16})"/.exec(html)?.[1];
  assert.ok(revision, 'homepage has a content-versioned entry module');
  assert.match(html, new RegExp('/styles/particles\\.css\\?v=' + revision));
  for (const file of ['js/site.js', 'js/particle-background.js', 'js/vendor/raisedhand-grain-engine.js', 'js/vendor/raisedhand-grain-worker.js']) {
    const text = await readFile(path.join(output, file), 'utf8');
    const imports = [...text.matchAll(/['"](\.{1,2}\/[^'"\s]+\.js(?:\?v=[a-f0-9]+)?)['"]/g)];
    assert.ok(imports.length > 0, file + ' has its imports versioned');
    for (const [, ref] of imports) {
      assert.ok(ref.endsWith('?v=' + revision), file + ': ' + ref);
      const filePath = path.resolve(path.dirname(path.join(output, file)), ref.split('?')[0]);
      assert.ok((await readFile(filePath)).length > 0);
    }
  }
});
