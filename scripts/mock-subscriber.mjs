import { createServer } from 'node:http';

const PORT = process.env.MOCK_PORT ?? 5001;

createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}).listen(PORT, () => {
  console.log(`Mock subscriber on http://localhost:${PORT}/deliver`);
});