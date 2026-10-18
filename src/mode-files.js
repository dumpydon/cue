const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { parseDocumentFile } = require('./resume');
const { LIMITS } = require('./meeting-modes');
const EXTENSIONS = ['pdf', 'docx', 'txt', 'md'];

async function readModeFiles(paths, { parse = parseDocumentFile } = {}) {
  if (!Array.isArray(paths) || !paths.length || paths.length > LIMITS.files || paths.some(file => typeof file !== 'string' || !path.isAbsolute(file))) throw new Error('Choose up to ' + LIMITS.files + ' PDF, DOCX, TXT, or Markdown files.');
  const files = [], errors = [];
  for (const filePath of [...new Set(paths)]) {
    const name = path.basename(filePath);
    try {
      const extension = path.extname(filePath).slice(1).toLowerCase();
      if (!EXTENSIONS.includes(extension)) throw new Error('Use PDF, DOCX, TXT, or Markdown.');
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error('Choose a file, not a folder.');
      if (stat.size > LIMITS.fileBytes) throw new Error('Files must be 5 MB or smaller.');
      const bytes = await fs.readFile(filePath);
      if (bytes.length > LIMITS.fileBytes) throw new Error('Files must be 5 MB or smaller.');
      const raw = ['txt', 'md'].includes(extension) ? bytes.toString('utf8') : await parse(filePath);
      const text = String(raw || '').replace(/\u0000/g, '').trim();
      if (!text) throw new Error('No readable text found. Scanned PDFs need a text layer.');
      files.push({ id: randomUUID(), name, text: text.slice(0, LIMITS.fileText), originalCharacters: text.length,
        truncated: text.length > LIMITS.fileText, digest: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) {
      const known = /^(Use |Choose |Files must |No readable text)/.test(error.message || '');
      errors.push({ name, message: known ? error.message : 'Could not read this document. Check the file and try again.' });
    }
  }
  return { files, errors };
}

module.exports = { EXTENSIONS, readModeFiles };
