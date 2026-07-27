import { createServer } from 'node:http';

const PORT = process.env.MOCK_PORT ?? 5001;

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const fail = url.searchParams.get('fail') === '1';
  const status = fail ? 500 : 200;

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    console.log(`[mock] ${req.method} ${req.url} -> ${status} ${body.slice(0, 200)}`);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: !fail }));
  });
}).listen(PORT, () => {
  console.log(`Mock subscriber on http://localhost:${PORT}/deliver (fail mode: ?fail=1)`);
});
