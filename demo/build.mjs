import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const demoDir = join(root, 'demo');
const distDir = join(demoDir, 'dist');
const fixtures = JSON.parse(await readFile(join(demoDir, 'fixtures.json'), 'utf8'));

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });

const demoApi = `(() => {
  const fixtures = ${JSON.stringify(fixtures, null, 2)};
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, window.location.href);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);

    const key = url.pathname + url.search;
    const fixture = fixtures[key];
    if (fixture) {
      return Promise.resolve(new Response(JSON.stringify(fixture.body), {
        status: fixture.status,
        headers: { 'content-type': 'application/json' }
      }));
    }

    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (method === 'GET') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }));
    }

    return Promise.resolve(new Response(JSON.stringify({
      ok: false,
      error: 'Mode demo: backend tidak aktif. Clone repo dan jalankan server untuk checkout.'
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    }));
  };

  window.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div');
    badge.textContent = 'DEMO MODE · SAMPLE DATA';
    badge.setAttribute('aria-label', 'Demo mode, sample data only');
    badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;background:#B6FF3B;color:#0B0B0C;font:700 10px/1.4 ui-monospace, monospace;letter-spacing:.12em;padding:6px 10px;border-radius:4px;pointer-events:none';
    document.body.appendChild(badge);
  });
})();`;

await writeFile(join(distDir, 'js', 'demo-api.js'), demoApi, 'utf8');

let html = await readFile(join(publicDir, 'index.html'), 'utf8');
html = html.replace(/(href|src)="\//g, '$1="');
html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex">\n<base href="/KICK-STORM/">');
html = html.replace('<script src="js/app.js', '<script src="js/demo-api.js" defer></script>\n<script src="js/app.js');
await writeFile(join(distDir, 'index.html'), html, 'utf8');
await writeFile(join(distDir, '404.html'), html, 'utf8');

for (const file of ['app.js', 'forge.js', 'video_showcase.js', 'admin.js', 'courier.js']) {
  const path = join(distDir, 'js', file);
  let js = await readFile(path, 'utf8').catch(() => null);
  if (!js) continue;
  js = js.replaceAll('"/images/', '"images/').replaceAll("'/images/", "'images/");
  await writeFile(path, js, 'utf8');
}

console.log('Demo built at', distDir);
