// Isolated GPU regression checks. Uses public product data, no user profile or devices.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'cue-particle-qa-')));
const target = process.env.CUE_SITE_QA_URL || 'http://127.0.0.1:8793/';
const output = path.resolve('.cache/ios-particle-qa'); fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.join(__dirname, '../public/js/vendor/raisedhand-grain-engine.js'), 'utf8');
const shader = name => {
  const match = new RegExp('const ' + name + ' = `([\\s\\S]*?)`;').exec(source);
  if (!match) throw Error('Missing production shader: ' + name);
  return match[1];
};
const shaders = { vertex: shader('VS_QUAD'), down: shader('FS_DOWN'), blur: shader('FS_BLUR') };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 400; i++) { if (await check()) return; await pause(25); }
  throw Error('Timed out: ' + label);
}
const deadline = setTimeout(() => { console.error('Particle GPU QA timeout'); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 390, height: 844, show: false, useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const wc = win.webContents, errors = [], requests = [];
  wc.setBackgroundThrottling(false);
  wc.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const allowed = new URL(details.url).origin === new URL(target).origin;
    if (!allowed) requests.push(details.url); callback({ cancel: !allowed });
  });
  const js = code => wc.executeJavaScript(code, true);
  try {
    await win.loadURL('about:blank');
    wc.debugger.attach('1.3');
    const results = [];
    for (const [name, width, height, scale, touch] of [
      ['phone-portrait', 390, 844, 3, true], ['phone-landscape', 844, 390, 3, true],
      ['desktop', 1440, 900, 2, false]
    ]) {
      win.setContentSize(width, height);
      wc.enableDeviceEmulation({ screenPosition: touch ? 'mobile' : 'desktop',
        screenSize: { width, height }, viewPosition: { x: 0, y: 0 },
        deviceScaleFactor: scale, viewSize: { width, height }, scale: 1 });
      await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
      await win.loadURL(target);
      await until(() => js("document.querySelector('[data-site-particles]').dataset.ready === 'true'"), name + ' dunes');
      await pause(400);
      const frame = () => js(`new Promise(resolve => requestAnimationFrame(() => {
        const canvas = document.querySelector('[data-site-particles] canvas'), gl = canvas.getContext('webgl2');
        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let grains = 0, opaqueBlue = 0, invalidPremultiplied = 0, hash = 2166136261;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i + 3] > 4) grains++;
          if (pixels[i + 2] > 180 && pixels[i + 2] > pixels[i] * 1.4 && pixels[i + 3] > 160) opaqueBlue++;
          if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > pixels[i + 3] + 2) invalidPremultiplied++;
          if (i % 64 === 0) hash = Math.imul(hash ^ pixels[i] ^ pixels[i + 3], 16777619) >>> 0;
        }
        resolve({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,coarse:matchMedia('(pointer: coarse)').matches,
          canvas:[canvas.width,canvas.height],grains,premultiplied:gl.getContextAttributes().premultipliedAlpha,
          invalidPremultiplied,opaqueBlueRatio:opaqueBlue/(canvas.width*canvas.height),hash,error:gl.getError()});
      }))`);
      const first = await frame(); await pause(180); const next = await frame();
      assert.equal(first.width, width); assert.equal(first.coarse, touch);
      assert.equal(first.canvas[0], width * scale, name + ' retains native retina resolution');
      assert.equal(first.error, 0, name + ' has no WebGL errors');
      assert.equal(first.premultiplied, true, name + ' uses the portable browser compositing path');
      assert.equal(first.invalidPremultiplied, 0, name + ' never emits RGB brighter than alpha');
      assert.ok(first.grains > 100, name + ' renders individual particles');
      assert.ok(first.opaqueBlueRatio < .015, name + ' must not become an opaque blue sheet: ' + JSON.stringify(first));
      assert.notEqual(first.hash, next.hash, name + ' keeps animating');
      assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true);
      fs.writeFileSync(path.join(output, name + '.png'), (await wc.capturePage()).toPNG());
      await js("document.querySelector('#film').scrollIntoView({block:'start',behavior:'instant'})");
      await pause(150); const scrolled = await frame();
      assert.equal(scrolled.error, 0); assert.ok(scrolled.opaqueBlueRatio < .015);
      results.push({ name, ...first, scrolledBlueRatio: scrolled.opaqueBlueRatio });
    }
    // Run the actual downsample/blur shaders on a known HDR color. Values above
    // 1 and small channels must survive the glow passes without clipping/tinting.
    const hdr = await js(`(() => {
      const shaders = ${JSON.stringify(shaders)}, canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const gl = canvas.getContext('webgl2'); if (!gl?.getExtension('EXT_color_buffer_float')) throw Error('HDR test requires float targets');
      const input = [4, .03125, .0078125, 1];
      function texture(data) { const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,data);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);return t; }
      const src=texture(new Float32Array(input)),dst=texture(null),fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,dst,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('HDR framebuffer incomplete');
      function compile(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
      const out={};gl.viewport(0,0,1,1);gl.bindVertexArray(gl.createVertexArray());
      for(const name of ['down','blur']) { const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,shaders.vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,shaders[name]));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,src);gl.uniform1i(gl.getUniformLocation(program,'u_src'),0);for(const key of ['u_srcTexel','u_dstRes','u_res'])gl.uniform2f(gl.getUniformLocation(program,key),1,1);gl.uniform2f(gl.getUniformLocation(program,'u_dir'),1,0);gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Float32Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,pixel);out[name]=Array.from(pixel);if(gl.getError())throw Error('HDR draw/readback failed'); }
      gl.getExtension('WEBGL_lose_context')?.loseContext();return out;
    })()`);
    for (const color of Object.values(hdr)) for (const [i, value] of [4, .03125, .0078125].entries())
      assert.ok(Math.abs(color[i] - value) < .0001, 'HDR channels are preserved: ' + JSON.stringify(hdr));
    assert.deepEqual(errors, []); assert.deepEqual(requests, []);
    fs.writeFileSync(path.join(output, 'gpu-regression.json'), JSON.stringify({ results, hdr }, null, 2));
    console.log('PASS: retina touch portrait/landscape and desktop particles, no opaque blue sheet, animation, scroll, and production HDR glow shaders.');
    clearTimeout(deadline); app.quit();
  } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); }
});
