import http from 'node:http';
import path from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { watch, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { build, output } from '../build.mjs';
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8793);
await build();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.vtt': 'text/vtt; charset=utf-8' };
const peers = new Set();
let timer, pending = Promise.resolve();
watch(path.join(here, 'public'), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => { pending = pending.then(build).then(() => { for (const peer of peers) peer.write('data: refresh\n\n'); }).catch(console.error); }, 600);
});
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__preview/live.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' });
      res.end('new EventSource("/__preview/events").onmessage = () => location.reload();'); return;
    }
    if (url.pathname === '/__preview/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': ready\n\n'); peers.add(res); req.on('close', () => peers.delete(res)); return;
    }
    if (url.pathname === '/get' || url.pathname.startsWith('/get/')) {
      const manifest = JSON.parse(await readFile(path.join(output,'release.json'),'utf8'));
      const { createHandler } = await import('../worker.mjs');
      const origin=`http://127.0.0.1:${port}`;
      const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers});
      const response=await createHandler(manifest).fetch(request,{ASSETS:{fetch:assetRequest=>fetch(assetRequest)}});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const target = path.resolve(output, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!target.startsWith(output + path.sep)) { res.writeHead(403).end(); return; }
    let info;
    try { info = await stat(target); if (!info.isFile()) throw Error(); }
    catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Page not found'); return; }
    const contentType = types[path.extname(target)] || 'application/octet-stream';
    if (target.endsWith('.html')) {
      let html = await readFile(target, 'utf8');
      html = html.replace('</body>', '<script src="/__preview/live.js"></script></body>');
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store' }).end(html); return;
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const headers = { 'content-type': contentType, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
    if (range) {
      const start = Number(range[1]), end = Math.min(info.size - 1, range[2] ? Number(range[2]) : info.size - 1);
      if (start > end || start >= info.size) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }).end(); return; }
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
      createReadStream(target, { start, end }).pipe(res); return;
    }
    res.writeHead(200, { ...headers, 'content-length': info.size }); createReadStream(target).pipe(res);
  } catch { res.writeHead(500).end('Preview error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Cue preview: http://127.0.0.1:${port}`));
