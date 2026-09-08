// Isolated UI fixture: no real drafts, credentials, or production API calls.
// Run: node tests/private-library-fixture.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const titles = ['年终总结', '我的大二', 'PP：从基础原理到前沿调研', 'Machine Learning', "What’s new?", 'Circuit Principles', 'notes'];
const posts = titles.map((title, index) => ({
  slug: `fixture-${index}`, title, category: ['Life', 'Life', 'AI Infra', 'Notes', 'Notes', 'Notes', 'Notes'][index],
  status: 'published', excerpt: 'Isolated bookshelf test volume.'
}));
posts.push({ draftId: 'fixture-draft', title: '独立测试草稿', status: 'draft', category: 'Notes', updatedAt: '2026-08-31T00:00:00Z' });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const authed = /(?:^|; )fixture-session=1(?:;|$)/.test(req.headers.cookie || '');
  const json = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)); };
  if (url.pathname === '/api/admin/login') {
    let body = ''; for await (const chunk of req) body += chunk;
    if (JSON.parse(body).password !== 'test-only') return json(401, { error: 'Unauthorized' });
    res.setHeader('Set-Cookie', 'fixture-session=1; HttpOnly; SameSite=Strict; Path=/');
    return json(200, { csrfToken: 'fixture' });
  }
  if (url.pathname === '/api/admin/logout') { res.setHeader('Set-Cookie', 'fixture-session=; Max-Age=0; Path=/'); return json(200, {}); }
  if (url.pathname.startsWith('/api/')) {
    if (!authed) return json(401, { error: 'Unauthorized' });
    if (url.pathname === '/api/admin/session') return json(200, { csrfToken: 'fixture' });
    if (url.pathname === '/api/admin/posts') return json(200, { posts: process.env.FIXTURE_EMPTY ? [] : posts });
    return json(404, {});
  }
  if (url.pathname === '/admin.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<h1>Fixture editor destination</h1><p>No production data is edited.</p>');
  }
  if (process.env.FIXTURE_NO_WEBGL_MODULE && url.pathname === '/all-posts-3d.js') { res.writeHead(503); return res.end('fixture module unavailable'); }
  const filename = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!filename.startsWith(root) || url.pathname.includes('/.')) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(filename);
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(Number(process.argv[2] || 8794), '127.0.0.1', () => console.log('Isolated bookshelf fixture ready'));
