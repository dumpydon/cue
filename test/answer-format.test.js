const test = require('node:test');
const assert = require('node:assert/strict');
const { render, toPlainText } = require('../src/answer-format');

test('inline and display LaTeX preserve commands, fractions, sums and complexity symbols', () => {
  const html = render(String.raw`For \(V\) vertices and \(E\) edges, use \(O((V+E)\log V)\) time.

\[
\frac{1}{k}\sum_{i=1}^{k}x_i
\]`);
  assert.equal((html.match(/class="answer-math"/g) || []).length, 3);
  assert.match(html, /class="answer-equation"/); assert.match(html, /<mfrac>/); assert.match(html, /<munderover>/);
  assert.ok(!html.includes('katex-error'));
});
test('dollar math works without interpreting ordinary currency or escaped dollars', () => {
  assert.match(render('Time $O(n)$, display $$x^2 + y^2$$.'), /katex/);
  for (const text of ['Costs $20 and $30.', String.raw`Cost \$20.`, '`$variable`']) {
    assert.ok(!render(text).includes('class="katex"'), text);
  }
});
test('math fenced blocks and equations inside lists render', () => {
  const html = render('```math\n\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}\n```\n\n1. Complexity: \\(O(n)\\).');
  assert.match(html, /answer-equation/); assert.match(html, /<ol>/); assert.ok(!html.includes('katex-error'));
});
test('language aliases produce highlighted code with exact text and indentation', () => {
  for (const [alias, language] of [['python3', 'python'], ['c++', 'cpp'], ['js', 'javascript'], ['java', 'java']]) {
    const html = render('```' + alias + '\ndef example(value):\n    return value + 1\n```');
    assert.match(html, new RegExp('language-' + language));
    assert.match(html, /answer-code-copy/); assert.match(html, /hljs-/);
    assert.match(html, /\n    /);
  }
});
test('code literals and code containing HTML never become math or executable markup', () => {
  const html = render('```html\n<script>alert(1)</script><img src=x onerror=alert(2)> $x$ \\(a\\)\n```');
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('class="katex"'));
  assert.ok(html.includes('&lt;'));
});
test('raw HTML, image links and untrusted TeX cannot initiate external requests', () => {
  const html = render(String.raw`<img src=x onerror=alert(1)>

![track](https://example.com/track.png)

[click](https://example.com)

\(\href{https://example.com}{click}\)

\(\includegraphics{https://example.com/pixel.png}\)`);
  assert.ok(!/<(?:img|script|iframe|a)\b/i.test(html));
  assert.ok(!/<[^>]+\s(?:href|src)=/.test(html));
});
test('unknown language fences and invalid TeX stay readable without throwing', () => {
  const html = render('```unknown-code\nvalue < threshold\n```\n\n\\(\\frac{a}\\)');
  assert.match(html, /language-plaintext/); assert.match(html, /value &lt; threshold/); assert.match(html, /katex-error/);
});
test('headings, ordered steps, tables and unfinished streamed blocks render safely', () => {
  const html = render('## Approach\n1. Build a window.\n2. Slide it.\n\n| Time | Space |\n| --- | --- |\n| O(n) | O(1) |\n\n```python\ndef example(x):');
  assert.match(html, /<h2>Approach<\/h2>/); assert.match(html, /<ol>/); assert.match(html, /answer-table/); assert.match(html, /language-python/);
  assert.doesNotThrow(() => render('Wait \\(\\frac{a'));
});
test('macro expansion and size limits bound untrusted math', () => {
  assert.doesNotThrow(() => render(String.raw`\(\def\loop{\loop}\loop\)`));
  assert.doesNotThrow(() => render(String.raw`\(\rule{999999em}{999999em}\)`));
});

test('plain answer copy preserves steps and code indentation without Markdown markers', () => {
  assert.equal(toPlainText('## Steps\n\n1. **Read** the input.\n2. Return `value`.\n\n```python\ndef solve(value):\n    return value + 1\n```'),
    'Steps\n\n1. Read the input.\n2. Return value.\n\ndef solve(value):\n    return value + 1');
  assert.equal(toPlainText('3. First\n4. Second\n   - A nested choice'), '3. First\n4. Second\n  • A nested choice');
});

test('plain answer copy includes each equation once and readable table rows', () => {
  const text = toPlainText('Time \\(O(n)\\).\n\n\\[\n\\frac{a}{b}\n\\]\n\n| Choice | Cost |\n| --- | --- |\n| A | $O(n)$ |');
  assert.equal(text, 'Time O(n).\n\n\\frac{a}{b}\n\nChoice\tCost\nA\tO(n)');
  assert.ok(!text.includes('katex'));
});

test('plain answer copy keeps text safe and never rewrites code literals', () => {
  assert.equal(toPlainText('[Documentation](https://example.com) &amp; **notes**'), 'Documentation & notes');
  assert.equal(toPlainText('```html\n<script>alert("$x$")</script>\n```'), '<script>alert("$x$")</script>');
});

test('long streaming code defers expensive highlighting while the final answer retains full formatting',()=>{
 const code='```python\n'+('def solve(value):\n    return value + 1\n'.repeat(250))+'```';
 const live=render(code,{streaming:true}),final=render(code);
 assert.match(live,/language-python/);assert.doesNotMatch(live,/hljs-keyword/);assert.match(final,/hljs-keyword/);
 assert.equal(toPlainText(code).split('def solve').length,251);
});
