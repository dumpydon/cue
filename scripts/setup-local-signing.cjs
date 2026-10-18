// Explicit, one-time development setup. Never run by Cue or by a normal build.
// Requires the user to approve adding a persistent code-signing trust entry.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const COMMON_NAME = 'Cue Local Development';
const directory = () => path.join(os.homedir(), 'Library/Application Support/Cue Development');
function setupLocalSigning({ acknowledged = false, platform = process.platform } = {}) {
  if (!acknowledged) throw new Error('User approval is required to add a persistent local signing identity and a code-signing-only trust entry.');
  if (platform !== 'darwin') throw new Error('Local signing setup requires macOS.');
  const dir = directory(), configPath = path.join(dir, 'local-signing.json'), pendingPath = path.join(dir, 'pending-signing.json');
  const certificatePath = path.join(dir, 'local-development.pem');
  let password = '';
  function run(file, args) {
    try { return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) {
      let detail = error.stderr?.toString() || 'The operation failed.';
      if (password) detail = detail.replaceAll(password, '[redacted]');
      throw new Error(path.basename(file) + ' ' + args[0] + ' failed: ' + detail.trim());
    }
  }
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!/^[A-Fa-f0-9]{40}$/.test(config.fingerprint || '')) throw new Error('The existing signing configuration is invalid. Restore it rather than generating a new identity.');
    const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
    if (!identities.includes(config.fingerprint.toUpperCase())) throw new Error('The existing local identity is unavailable. Restore its Keychain entry; do not replace it with a new certificate.');
    return { configured: true, reused: true, fingerprint: config.fingerprint, commonName: config.commonName };
  }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.chmodSync(dir, 0o700);
  const keychain = run('/usr/bin/security', ['default-keychain', '-d', 'user']).trim().replace(/^"|"$/g, '');
  let pending;
  if (fs.existsSync(pendingPath)) {
    pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    const cert = new crypto.X509Certificate(fs.readFileSync(certificatePath));
    if (cert.fingerprint.replaceAll(':', '') !== pending.fingerprint) throw new Error('The pending certificate fingerprint does not match.');
  } else {
    const existing = run('/usr/bin/security', ['find-identity', '-p', 'codesigning']);
    if (existing.includes('"' + COMMON_NAME + '"')) throw new Error('A Cue local identity already exists without its configuration. Recover that identity before continuing.');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-local-signing-')); fs.chmodSync(temp, 0o700);
    password = crypto.randomBytes(48).toString('base64url');
    try {
      const secret = path.join(temp, 'password'), config = path.join(temp, 'certificate.cnf');
      fs.writeFileSync(secret, password + '\n' + password + '\n', { mode: 0o600 });
      fs.writeFileSync(config, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=' + COMMON_NAME +
        '\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyCertSign,cRLSign\nextendedKeyUsage=critical,codeSigning\n', { mode: 0o600 });
      const privateKey = path.join(temp, 'private.pem'), certificate = path.join(temp, 'certificate.pem'), p12 = path.join(temp, 'identity.p12');
      run('/usr/bin/openssl', ['req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '3650', '-config', config,
        '-keyout', privateKey, '-out', certificate, '-passout', 'file:' + secret]);
      run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', privateKey, '-in', certificate, '-out', p12,
        '-passin', 'file:' + secret, '-passout', 'file:' + secret, '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1']);
      run('/usr/bin/security', ['import', p12, '-k', keychain, '-P', password, '-x', '-T', '/usr/bin/codesign']);
      fs.copyFileSync(certificate, certificatePath); fs.chmodSync(certificatePath, 0o600);
      const cert = new crypto.X509Certificate(fs.readFileSync(certificatePath));
      pending = { commonName: COMMON_NAME, fingerprint: cert.fingerprint.replaceAll(':', ''), createdAt: new Date().toISOString() };
      fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2) + '\n', { mode: 0o600 });
    } finally { fs.rmSync(temp, { recursive: true, force: true }); password = ''; }
  }
  // User-domain trust for the code-signing policy only. No TLS / SSL trust,
  // system keychain changes, Gatekeeper changes, or TCC grants are applied here.
  run('/usr/bin/security', ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', keychain, certificatePath]);
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
  if (!identities.includes(pending.fingerprint)) throw new Error('The identity is imported, but macOS has not approved it for signing yet. Complete the Keychain authentication and run setup again.');
  fs.writeFileSync(configPath, JSON.stringify(pending, null, 2) + '\n', { mode: 0o600 }); fs.unlinkSync(pendingPath);
  return { configured: true, reused: false, fingerprint: pending.fingerprint, commonName: COMMON_NAME, trustPolicy: 'code-signing-only', privateKey: 'non-extractable Keychain item restricted to codesign' };
}

if (require.main === module) {
  try {
    if (process.argv.includes('--plan')) console.log(JSON.stringify({ commonName: COMMON_NAME, configuration: path.join(directory(), 'local-signing.json'),
      trustPolicy: 'user-domain code signing only', privateKey: 'non-extractable Keychain item restricted to codesign', publicDistribution: false }, null, 2));
    else console.log(JSON.stringify(setupLocalSigning({ acknowledged: process.argv.includes('--acknowledge-local-code-signing-trust') }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { setupLocalSigning };
