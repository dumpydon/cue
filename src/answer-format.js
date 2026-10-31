// Shared answer formatting for the overlay and saved notes. Bundled locally
// for the renderer; model output never loads scripts, images or remote fonts.
const MarkdownIt = require('markdown-it');
const katex = require('katex');
const hljs = require('highlight.js/lib/common');
const AUTO_LANGUAGES = ['python', 'javascript', 'typescript', 'cpp', 'java', 'csharp', 'go', 'rust', 'sql', 'bash', 'json'];
const LABELS = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript', cpp: 'C++', c: 'C',
  java: 'Java', csharp: 'C#', go: 'Go', rust: 'Rust', sql: 'SQL', bash: 'Shell', json: 'JSON',
  xml: 'HTML / XML', css: 'CSS', swift: 'Swift', kotlin: 'Kotlin', plaintext: 'Plain text' };
const ALIASES = { py: 'python', python3: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', sh: 'bash', shell: 'bash', html: 'xml', text: 'plaintext', txt: 'plaintext' };
const escape = text => String(text).replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));

function math(source, display) {
  try {
    const html = katex.renderToString(source, { displayMode: display, throwOnError: false, trust: false,
      strict: 'ignore', maxExpand: 1000, maxSize: 12, errorColor: '#ffb4bc', output: 'htmlAndMathml' });
    return `<span class="answer-math${display ? ' answer-math-display' : ''}">${html}</span>`;
  } catch (_) { return `<code class="answer-math-fallback">${escape(source)}</code>`; }
}

function escapedAt(text, position) {
  let count = 0;
  for (let i = position - 1; i >= 0 && text[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function mathRules(md) {
  // Run before backslash escaping and emphasis so TeX commands and underscores
  // arrive intact, including the \( ... \) notation used by existing answers.
  md.inline.ruler.before('escape', 'answer_math', (state, silent) => {
    const start = state.pos, source = state.src;
    const open = ['\\(', '\\[', '$$', '$'].find(delimiter => source.startsWith(delimiter, start));
    if (!open || escapedAt(source, start)) return false;
    const display = open === '\\[' || open === '$$', close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
    if (open === '$' && /\s/.test(source[start + 1] || ' ')) return false;
    let end = start + open.length;
    while ((end = source.indexOf(close, end)) !== -1) {
      if (escapedAt(source, end)) { end += close.length; continue; }
      if (open === '$' && (/\s/.test(source[end - 1]) || /\d/.test(source[end + 1] || '') || source[end + 1] === '$')) return false;
      const content = source.slice(start + open.length, end);
      if (!content.trim() || (!display && content.includes('\n'))) return false;
      if (!silent) { const token = state.push(display ? 'answer_math_display' : 'answer_math_inline', '', 0); token.content = content; }
      state.pos = end + close.length;
      return true;
    }
    return false; // Incomplete streamed math stays readable until it closes.
  });
  md.block.ruler.before('fence', 'answer_math_block', (state, startLine, endLine, silent) => {
    const line = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
    const open = line.startsWith('$$') ? '$$' : line.startsWith('\\[') ? '\\[' : null;
    if (!open || state.sCount[startLine] - state.blkIndent >= 4) return false;
    const close = open === '$$' ? '$$' : '\\]';
    const parts = []; let found = false, next = startLine;
    for (; next < endLine; next++) {
      const text = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]);
      const value = next === startLine ? text.slice(open.length) : text;
      const end = value.indexOf(close);
      if (end !== -1 && !escapedAt(value, end)) {
        if (value.slice(end + close.length).trim()) return false;
        parts.push(value.slice(0, end)); found = true; break;
      }
      parts.push(value);
    }
    if (!found) return false;
    if (silent) return true;
    const token = state.push('answer_math_block', '', 0); token.block = true;
    token.content = parts.join('\n').trim(); token.map = [startLine, next + 1];
    state.line = next + 1;
    return true;
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.answer_math_inline = (tokens, index) => math(tokens[index].content, false);
  md.renderer.rules.answer_math_display = (tokens, index) => math(tokens[index].content, true);
  md.renderer.rules.answer_math_block = (tokens, index) => `<div class="answer-equation">${math(tokens[index].content, true)}</div>\n`;
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, maxNesting: 30 });
markdown.use(mathRules);
// Keep the overlay self-contained: links remain readable labels; images remain
// alt text. Model-generated content cannot navigate or initiate remote requests.
markdown.renderer.rules.link_open = () => '<span class="answer-link">';
markdown.renderer.rules.link_close = () => '</span>';
markdown.renderer.rules.image = (tokens, index) => escape(tokens[index].content);
markdown.renderer.rules.table_open = () => '<div class="answer-table"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
markdown.renderer.rules.fence = (tokens, index, _options, environment) => {
  const token = tokens[index], tag = (token.info || '').trim().split(/\s+/)[0].toLowerCase();
  if (['math', 'latex', 'tex'].includes(tag)) return `<div class="answer-equation">${math(token.content.trim(), true)}</div>\n`;
  let language = ALIASES[tag] || tag, value = escape(token.content);
  try {
    if (token.content.length <= (environment?.streaming ? 8000 : 60000)) {
      if (language && hljs.getLanguage(language)) value = hljs.highlight(token.content, { language, ignoreIllegals: true }).value;
      else if (!tag) {
        const detected = hljs.highlightAuto(token.content, AUTO_LANGUAGES);
        if (detected.relevance >= 2) { language = detected.language; value = detected.value; }
      }
    }
  } catch (_) { /* Unrecognized or incomplete code stays escaped plain text. */ }
  if (!hljs.getLanguage(language)) language = 'plaintext';
  const label = LABELS[language] || language;
  return `<div class="answer-code"><div class="answer-code-header"><span class="answer-code-language">${escape(label)}</span><div class="answer-code-actions">` +
    `<button class="answer-code-wrap" type="button" aria-label="Wrap ${escape(label)} code" aria-pressed="false">Wrap</button>` +
    `<button class="answer-code-copy" type="button" aria-label="Copy ${escape(label)} code">Copy code</button></div></div>` +
    `<pre><code class="hljs language-${escape(language)}">${value}</code></pre></div>\n`;
};
markdown.renderer.rules.code_block = markdown.renderer.rules.fence;

function render(text, { streaming = false } = {}) {
  const source = String(text || '');
  try { return markdown.render(source, { streaming }); }
  catch (_) { return `<p class="answer-plain">${escape(source)}</p>`; }
}

// Copy from Markdown tokens rather than the rendered DOM: KaTeX contains both
// visual and accessibility trees, and DOM text would duplicate each equation.
function toPlainText(text) {
  const source = String(text || '');
  try {
    const inline = tokens => tokens.map(token => {
      if (token.type === 'softbreak' || token.type === 'hardbreak') return '\n';
      if (token.type === 'image') return token.content;
      if (token.children) return inline(token.children);
      return token.nesting === 0 ? token.content : '';
    }).join('');
    const lists = [];
    let output = '';
    for (const token of markdown.parse(source, {})) {
      if (token.type === 'inline') output += inline(token.children || []);
      else if (token.type === 'fence' || token.type === 'code_block') output += token.content + '\n';
      else if (token.type === 'answer_math_block') output += token.content + '\n\n';
      else if (token.type === 'bullet_list_open') lists.push({ ordered: false });
      else if (token.type === 'ordered_list_open') lists.push({ ordered: true, next: Number(token.attrGet('start')) || 1 });
      else if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') { lists.pop(); output += '\n'; }
      else if (token.type === 'list_item_open') {
        if (output && !output.endsWith('\n')) output += '\n';
        const list = lists.at(-1);
        output += '  '.repeat(Math.max(0, lists.length - 1)) + (list?.ordered ? `${list.next++}. ` : '• ');
      } else if (token.type === 'paragraph_close') output += lists.length ? '\n' : '\n\n';
      else if (token.type === 'heading_close' || token.type === 'blockquote_close' || token.type === 'table_close') output += '\n\n';
      else if (token.type === 'th_close' || token.type === 'td_close') output += '\t';
      else if (token.type === 'tr_close') output = output.replace(/\t+$/, '') + '\n';
      else if (token.type === 'hr') output += '\n';
    }
    return output.trimEnd();
  } catch (_) { return source; }
}

function setCodeWrap(block, wrapped) {
  block.classList.toggle('wrapped', wrapped);
  const button = block.querySelector('.answer-code-wrap');
  if (button) { button.setAttribute('aria-pressed', String(wrapped)); button.textContent = wrapped ? 'Unwrap' : 'Wrap'; }
}

function installCopy({ document, copyText, onError = () => {} }) {
  document.addEventListener('click', async event => {
    const wrap = event.target.closest?.('.answer-code-wrap');
    if (wrap) { const block = wrap.closest('.answer-code'); if (block) setCodeWrap(block, !block.classList.contains('wrapped')); return; }
    const button = event.target.closest?.('.answer-code-copy, .answer-copy');
    if (!button || button.disabled) return;
    let text;
    if (button.matches('.answer-code-copy')) text = button.closest('.answer-code')?.querySelector('pre code')?.textContent;
    else {
      const answer = button.closest('.answer-actions')?.previousElementSibling;
      if (!answer?.matches('.answer-content')) return;
      text = button.dataset.format === 'markdown' ? answer.dataset.raw : toPlainText(answer.dataset.raw);
    }
    if (text == null) return;
    const label = button.textContent;
    button.disabled = true;
    try { await copyText(text); button.textContent = 'Copied'; }
    catch (error) { button.textContent = 'Try again'; onError(error.message || 'The answer could not be copied.'); }
    finally { setTimeout(() => { button.disabled = false; button.textContent = label; }, 1400); }
  });
}

module.exports = { render, toPlainText, setCodeWrap, installCopy };
