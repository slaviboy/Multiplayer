// Minimal static file server for local development and the e2e tests.
//   node scripts/serve.mjs [--port 8080] [--root .] [--base /repo/]
// --base mimics a GitHub Pages project site (https://<user>.github.io/<repo>/).
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const port = Number(opt('port', process.env.PORT || 8080));
const root = resolve(opt('root', '.'));
let base = opt('base', '/');
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base = `${base}/`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.fnt': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = decodeURIComponent(url.pathname);
  if (path === base.slice(0, -1)) {
    res.writeHead(301, { location: base });
    return res.end();
  }
  if (!path.startsWith(base)) return send(res, 404, 'Not found');
  path = path.slice(base.length);

  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'Forbidden');

  let stat;
  try {
    stat = statSync(file);
    if (stat.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { location: `${url.pathname}/${url.search}` });
        return res.end();
      }
      file = join(file, 'index.html');
      stat = statSync(file);
    }
  } catch {
    return send(res, 404, 'Not found');
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
});

server.listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}${base}`);
});
