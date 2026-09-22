// Proxy mínimo: expone PostgREST bajo /rest/v1, como hace Supabase, para usar supabase-js tal cual.
import http from 'node:http';

const target = new URL(process.env.PGRST_URL ?? 'http://127.0.0.1:3100');
const port = Number(process.env.PROXY_PORT ?? 54399);

http
  .createServer((req, res) => {
    if (!req.url?.startsWith('/rest/v1')) return res.writeHead(404).end();
    const upstream = http.request(
      { host: target.hostname, port: target.port, path: req.url.slice('/rest/v1'.length) || '/', method: req.method, headers: { ...req.headers, host: target.host } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    upstream.on('error', (e) => res.writeHead(502).end(String(e)));
    req.pipe(upstream);
  })
  .listen(port, '127.0.0.1');
