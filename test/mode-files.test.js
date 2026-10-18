const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { readModeFiles } = require('../src/mode-files');
const { LIMITS } = require('../src/meeting-modes');

test('mode imports read text locally, identify duplicate content and report truncation explicitly', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cue-mode-files-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const files = ['resume.txt', 'notes.md', 'long.txt'].map(name => path.join(dir, name));
  await fs.writeFile(files[0], 'Real fixture project.'); await fs.writeFile(files[1], 'Real fixture project.'); await fs.writeFile(files[2], 'x'.repeat(LIMITS.fileText + 100));
  const result = await readModeFiles(files);
  assert.equal(result.errors.length, 0); assert.equal(result.files.length, 3);
  assert.equal(result.files[0].digest, result.files[1].digest);
  assert.equal(result.files[2].text.length, LIMITS.fileText);
  assert.equal(result.files[2].originalCharacters, LIMITS.fileText + 100);
  assert.equal(result.files[2].truncated, true);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('unreadable, unsupported, empty and oversized imports do not block valid files or leak paths', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cue-mode-files-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const names = ['valid.txt', 'bad.png', 'empty.pdf', 'broken.docx', 'large.txt'];
  for (const name of names) await fs.writeFile(path.join(dir, name), name === 'large.txt' ? Buffer.alloc(LIMITS.fileBytes + 1) : name);
  const result = await readModeFiles(names.map(name => path.join(dir, name)), { parse: async file => { if (file.endsWith('.pdf')) return ''; throw new Error('Secret parser error at ' + dir); } });
  assert.equal(result.files.length, 1); assert.equal(result.errors.length, 4);
  assert.match(result.errors.find(error => error.name === 'large.txt').message, /5 MB/);
  assert.match(result.errors.find(error => error.name === 'empty.pdf').message, /text layer/);
  assert.doesNotMatch(JSON.stringify(result), /Secret parser error|cue-mode-files-/);
  await assert.rejects(readModeFiles(['relative.txt']), /Choose/);
});
