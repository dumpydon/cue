const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
function buildAnswerAssets() {
const root = path.resolve(__dirname, '..'), output = path.join(root, 'renderer/vendor/answers');
fs.mkdirSync(output, { recursive: true });
buildSync({ entryPoints: [path.join(root, 'src/answer-format.js')], outfile: path.join(output, 'answer-format.js'),
  bundle: true, minify: true, platform: 'browser', format: 'iife', globalName: 'CueAnswerFormat',
  target: 'chrome130', legalComments: 'eof', charset: 'utf8' });
const katexRoot = path.dirname(require.resolve('katex/package.json'));
const css = fs.readFileSync(path.join(katexRoot, 'dist/katex.min.css'), 'utf8')
  .replace(/src:([^;}]+)/g, (_match, sources) => 'src:' + sources.split(',').find(source => source.includes('.woff2')));
fs.writeFileSync(path.join(output, 'katex.min.css'), css);
const fonts = path.join(output, 'fonts'); fs.mkdirSync(fonts, { recursive: true });
for (const name of fs.readdirSync(fonts)) if (!name.endsWith('.woff2')) fs.unlinkSync(path.join(fonts, name));
for (const name of fs.readdirSync(path.join(katexRoot, 'dist/fonts'))) {
  if (name.endsWith('.woff2')) fs.copyFileSync(path.join(katexRoot, 'dist/fonts', name), path.join(fonts, name));
}
const notices = ['markdown-it', 'katex', 'highlight.js', 'entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'].map(name => {
  const directory = path.join(root, 'node_modules', name);
  const license = ['LICENSE', 'LICENSE.txt', 'LICENSE-MIT.txt'].find(file => fs.existsSync(path.join(directory, file)));
  if (!license) throw new Error('Missing license for bundled dependency ' + name);
  return name + ' ' + JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version + '\n' + fs.readFileSync(path.join(directory, license), 'utf8');
});
fs.writeFileSync(path.join(output, 'THIRD-PARTY-LICENSES.txt'), notices.join('\n\n----------------\n\n'));
console.log('Built local Markdown, syntax highlighting, math renderer and fonts.');
}
if (require.main === module) buildAnswerAssets();
module.exports = { buildAnswerAssets };
