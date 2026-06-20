// app.ts —— HTTP 入口（原生 http 模块）
//   POST /embed   body: {"text":"hello"}   ->  {"dim":384,"vector":[...]}
//   GET  /        ->  使用说明

import http = require('node:http');
import { getEmbedding } from './vector-service';

const PORT = Number(process.env.PORT) || 8787;

type EmbedBody = {
  text?: unknown;
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/embed') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const payload = JSON.parse(body || '{}') as EmbedBody;
      if (typeof payload.text !== 'string' || !payload.text.trim()) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'missing "text"' }));
      }
      const vector = await getEmbedding(payload.text);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ dim: vector.length, vector }));
    } catch (e) {
      console.error('[/embed] error:', e);
      const msg = e instanceof Error ? e.stack || e.message : String(e);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
    return;
  }

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('向量服务已就绪\n用法：POST /embed   body: {"text":"你好世界"}\n');
});

server.listen(PORT, () => {
  console.log(`vector-service listening on http://localhost:${PORT}`);
});
