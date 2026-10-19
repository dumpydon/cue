import release from './release.json' with { type: 'json' };
import film from './film.json' with { type: 'json' };

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'"
};

export function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new RangeError('Unsupported byte range');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new RangeError('Invalid suffix');
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw new RangeError('Invalid range');
  return { start, end };
}

export function sliceBody(body, from, to) {
  const reader=body.getReader();let offset=0,finished=false;
  return new ReadableStream({
    async pull(controller){
      try{while(!finished){const result=await reader.read();if(result.done){finished=true;controller.close();return;}
        const end=offset+result.value.byteLength,start=Math.max(0,from-offset),stop=Math.min(result.value.byteLength,to+1-offset);offset=end;
        if(start<stop){controller.enqueue(result.value.subarray(start,stop));if(offset>to){finished=true;await reader.cancel();controller.close();}return;}
      }}catch(error){controller.error(error);}
    },
    async cancel(reason){finished=true;await reader.cancel(reason);}
  });
}

// Static assets have a per-file size limit. A preview can use verified pieces
// during initial publication; GitHub Releases is the normal permanent host.
// Pulling only on demand bounds memory and stops I/O when a client cancels.
export function streamDownload(parts, assets, origin, range) {
  const selected = [];
  let offset = 0;
  for (const part of parts) {
    const from = Math.max(0, range.start - offset), to = Math.min(part.bytes - 1, range.end - offset);
    if (from <= to && from < part.bytes && to >= 0) selected.push({ ...part, from, to });
    offset += part.bytes;
  }
  let index = 0, reader = null, remaining = 0, cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        while (!cancelled) {
          if (!reader) {
            if (index >= selected.length) { controller.close(); return; }
            const part = selected[index++], partial = part.from !== 0 || part.to !== part.bytes - 1;
            const headers = partial ? { Range: `bytes=${part.from}-${part.to}` } : {};
            const response = await assets.fetch(new Request(new URL(part.path, origin), { headers }));
            if (cancelled) { await response.body?.cancel(); return; }
            if (!response.body || (response.status !== 200 && !(partial && response.status === 206))) throw Error('Preview asset unavailable');
            remaining = part.to - part.from + 1;
            reader = (partial && response.status === 200 ? sliceBody(response.body,part.from,part.to) : response.body).getReader();
          }
          const result = await reader.read();
          if (cancelled) return;
          if (result.done) {
            if (remaining !== 0) throw Error('Incomplete preview asset');
            reader.releaseLock(); reader = null; continue;
          }
          remaining -= result.value.byteLength;
          if (remaining < 0) throw Error('Unexpected preview asset length');
          controller.enqueue(result.value); return;
        }
      } catch (error) { await reader?.cancel().catch(() => {}); controller.error(error); }
    },
    async cancel(reason) { cancelled = true; await reader?.cancel(reason); }
  });
}

export function createHandler(manifest = release) {
  return {
    async fetch(request, env, context) {
      const url = new URL(request.url);
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...securityHeaders, Allow: 'GET, HEAD' } });
      const match = /^\/get\/mac\/(arm64|x64)\/?$/.exec(url.pathname);
      if (match) {
        const asset = manifest.assets?.[match[1]];
        if (!asset?.bytes || !/^[a-f0-9]{64}$/.test(asset.sha256 || '')) return Response.redirect(new URL('/install/', url), 302);
        if (asset.host === 'github' && /^https:\/\/github\.com\/dumpydon\/cue\/releases\/download\//.test(asset.releaseUrl || '')) return Response.redirect(asset.releaseUrl, 302);
        if (!asset.parts?.length || asset.parts.reduce((total, part) => total + part.bytes, 0) !== asset.bytes || asset.parts.some(part => !Number.isSafeInteger(part.bytes) || part.bytes<=0 || part.bytes>25*1024*1024 || !/^\/downloads\/parts\/[a-zA-Z0-9/_.-]+$/.test(part.path) || part.path.includes('..'))) return new Response('Preview is being prepared', { status: 503, headers: { ...securityHeaders, 'Retry-After': '300' } });
        const etag = '"' + asset.sha256 + '"';
        const headers = new Headers({ ...securityHeaders, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${asset.filename.replace(/[^a-zA-Z0-9._-]/g, '')}"`, 'Accept-Ranges': 'bytes', ETag: etag, 'Cache-Control': 'public, max-age=3600' });
        if (request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers });
        let range;
        try { range = byteRange(request.headers.get('If-Range') && request.headers.get('If-Range') !== etag ? null : request.headers.get('Range'), asset.bytes); }
        catch { headers.set('Content-Range', `bytes */${asset.bytes}`); return new Response(null, { status: 416, headers }); }
        const selected = range || { start: 0, end: asset.bytes - 1 };
        headers.set('Content-Length', String(selected.end - selected.start + 1));
        if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${asset.bytes}`);
        let body=request.method==='HEAD'?null:streamDownload(asset.parts,env.ASSETS,url.origin,selected);
        if(body&&typeof FixedLengthStream==='function'){
          const fixed=new FixedLengthStream(selected.end-selected.start+1),pump=body.pipeTo(fixed.writable).catch(()=>{});
          context?.waitUntil(pump);body=fixed.readable;
        }
        return new Response(body, { status: range ? 206 : 200, headers });
      }
      if (url.pathname === '/get' || url.pathname === '/get/') return Response.redirect(new URL('/install/', url), 302);
      const upstream = await env.ASSETS.fetch(request);
      // Some static-asset bindings return the complete MP4 even for Range.
      // Preserve seeking by slicing only the requested bytes in that case.
      const length = Number(upstream.headers.get('Content-Length')) || (url.pathname === film.path ? film.bytes : 0);
      const ifRange = request.headers.get('If-Range');
      if (url.pathname.endsWith('.mp4') && request.headers.has('Range') && upstream.status === 200 && Number.isSafeInteger(length) && length > 0 && (!ifRange || ifRange === upstream.headers.get('ETag') || ifRange === upstream.headers.get('Last-Modified'))) {
        const headers = new Headers(upstream.headers);
        for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
        headers.set('Accept-Ranges', 'bytes'); headers.set('Cache-Control', 'public, max-age=86400');
        let range;
        try { range = byteRange(request.headers.get('Range'), length); }
        catch { await upstream.body?.cancel(); headers.set('Content-Range', `bytes */${length}`); headers.delete('Content-Length'); return new Response(null, { status: 416, headers }); }
        const size = range.end - range.start + 1;
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${length}`); headers.set('Content-Length', String(size));
        let body = request.method === 'HEAD' ? null : sliceBody(upstream.body, range.start, range.end);
        if (body && typeof FixedLengthStream === 'function') {
          const fixed = new FixedLengthStream(size); context?.waitUntil(body.pipeTo(fixed.writable).catch(() => {})); body = fixed.readable;
        }
        return new Response(body, { status: 206, headers });
      }
      const response = new Response(upstream.body, upstream);
      for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
      if (/\.(?:mp4|jpg|png|svg|woff2)$/.test(url.pathname)) response.headers.set('Cache-Control','public, max-age=86400');
      if (url.pathname.endsWith('.mp4')) response.headers.set('Accept-Ranges','bytes');
      if (url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname === '/release.json') response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      return response;
    }
  };
}
export default createHandler();
