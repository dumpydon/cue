const { execFile } = require('node:child_process');

function parseSigningInfo(output) {
  const requirement = /designated => (.+)/.exec(output)?.[1] || '';
  const authorities = Array.from(output.matchAll(/^Authority=(.+)$/gm), match => match[1]);
  const adHoc = /Signature=adhoc/.test(output) || /^cdhash\b/.test(requirement);
  const certificateBound = /\b(?:anchor|certificate)\b/.test(requirement);
  const stable = !!requirement && !adHoc && certificateBound;
  const developerId = authorities.some(authority => authority.startsWith('Developer ID Application:'));
  return { kind: adHoc ? 'ad-hoc' : developerId ? 'developer-id' : stable ? 'development' : 'unknown', stable, requirement,
    authority: authorities[0] || '' };
}

function readSigningInfo(bundlePath, { run } = {}) {
  const execute = run || ((file, args) => new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5000, maxBuffer: 65536 }, (error, stdout, stderr) => error ? reject(error) : resolve(stdout + stderr));
  }));
  return execute('/usr/bin/codesign', ['--display', '--verbose=4', '-r-', bundlePath]).then(parseSigningInfo)
    .catch(() => ({ kind: 'unknown', stable: false, requirement: '', authority: '' }));
}

module.exports = { parseSigningInfo, readSigningInfo };
