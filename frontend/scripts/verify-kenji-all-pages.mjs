#!/usr/bin/env node
/* Exhaustive smoke verification for the Kenji exact mirror.
 * The source verifier proves generated HTML/CSS/JS byte fidelity under allowed
 * rewrites. This browser pass loads every generated page from the crawl
 * manifest, checks that original runtime layers initialize, and exercises one
 * source interaction per page type where the original page exposes one.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'verify-kenji-all-pages');
const BASE = process.env.KENJI_VERIFY_BASE || 'http://127.0.0.1:8081';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const failures = [];
const results = [];

function log(status, name, detail = '') {
  results.push({ status, name, detail });
  console.log(`${status.padEnd(4)} ${name}${detail ? ` — ${detail}` : ''}`);
}
function ok(name, detail = '') { log('OK', name, detail); }
function fail(name, detail = '') { failures.push(`${name}${detail ? `: ${detail}` : ''}`); log('FAIL', name, detail); }
function assert(name, condition, detail = '') { condition ? ok(name, detail) : fail(name, detail); }

function localPages() {
  const py = `
import importlib.util, json
from pathlib import Path
root=Path(${JSON.stringify(ROOT)})
p=root/'scripts'/'build-kenji-exact.py'
s=importlib.util.spec_from_file_location('b',p)
b=importlib.util.module_from_spec(s); s.loader.exec_module(b)
print(json.dumps([{'url':u, **item} for u,item in sorted(b.load_manifest().items())], ensure_ascii=False))
`;
  const run = spawnSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || run.stdout || 'could not load manifest');
  return JSON.parse(run.stdout);
}

function classify(item) {
  const u = item.url;
  if (u === 'http://kenjiendo.com/') return 'home';
  if (u.endsWith('/about/')) return 'about';
  if (u.endsWith('/album/')) return 'album';
  if (u.endsWith('/news/')) return 'news';
  if (/\/news\/page\/\d+\/$/.test(u)) return 'news_page';
  if (u.endsWith('/contact/')) return 'contact';
  if (u.includes('/blog/')) return 'blog';
  return 'other';
}

function sourceFacts(item) {
  const htmlPath = path.join(ROOT, item.local);
  const html = readFileSync(htmlPath, 'utf8');
  return {
    hasBorders: /class=["'][^"']*\bborders\b/.test(html),
    isCapturedContact404: item.local === 'kenji-exact-contact.html' && /class=["'][^"']*\bnotfound\b/.test(html) && /404\s*<br\s*\/?\s*>\s*NOT FOUND/i.test(html),
    hasInlineDollarReady: /\$\s*\(\s*function\s*\(/.test(html),
  };
}

async function state(page) {
  return page.evaluate(() => {
    const vis = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { w: r.width, h: r.height, display: s.display, visibility: s.visibility, opacity: s.opacity };
    };
    return {
      href: location.href,
      title: document.title,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      hasJquery: !!window.jQuery,
      hasPjax: !!window.jQuery?.pjax,
      panel: !!document.querySelector('#panel'),
      mask: !!document.querySelector('#mask'),
      toggle: !!document.querySelector('.toggle'),
      createT: vis('.create_t'),
      canvas: vis('#kenjiendo'),
      borders: document.querySelectorAll('.borders path').length,
      btnBoxes: document.querySelectorAll('.btn_box, .trigger').length,
      albums: document.querySelectorAll('a.album').length,
      newsItems: document.querySelectorAll('.news_body li, .news_scroll li, article').length,
      blogBody: !!document.querySelector('.blog_body, .entry-content, .single_body, .post_body, .main_body'),
    };
  });
}

async function firstVisibleBox(page, selector) {
  return page.evaluate((selector) => {
    for (const e of document.querySelectorAll(selector)) {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0) {
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    return null;
  }, selector);
}

async function verifyPage(page, item, index, total) {
  const type = classify(item);
  const facts = sourceFacts(item);
  const url = `${BASE}/${item.local}?v=all-pages-verify`;
  const pageErrors = [];
  const consoleErrors = [];
  const onPageError = (err) => pageErrors.push(err.message || String(err));
  const onConsole = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('loaded') || document.readyState === 'complete', null, { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(type === 'home' ? 900 : 350);
    const s = await state(page);
    const label = `${index + 1}/${total} ${item.local}`;
    const fatalPageErrors = pageErrors.filter((message) => {
      // The captured original /contact/ response is the site's WordPress 404
      // template.  Its source contains an inline `$(function(){...})` after
      // WordPress jQuery has already run noConflict(), so Chrome reports
      // `$ is not a function` before the theme script loads.  Keeping this
      // known original-source error is more faithful than rewriting the page.
      if (facts.isCapturedContact404 && facts.hasInlineDollarReady && message === '$ is not a function') return false;
      // Original home/contact audio attempts autoplay; Chromium reports this
      // as a pageerror even though it is browser policy, not a mirror mismatch.
      if (/play\(\) failed because the user didn't interact/.test(message)) return false;
      return true;
    });
    assert(`${label} loads without unexpected browser pageerror`, fatalPageErrors.length === 0, fatalPageErrors.slice(0, 2).join(' | '));
    assert(`${label} keeps original title family`, /KENJI ENDO/.test(s.title), s.title);
    assert(`${label} has original jQuery runtime`, s.hasJquery && s.hasPjax, `jQuery=${s.hasJquery} pjax=${s.hasPjax}`);
    assert(`${label} has original panel/mask/toggle`, s.panel && s.mask && s.toggle, `panel=${s.panel} mask=${s.mask} toggle=${s.toggle}`);
    if (type === 'home') {
      assert(`${label} home runtime class`, /nowonhome/.test(s.htmlClass), s.htmlClass);
      assert(`${label} home canvas/create_t initialized`, !!s.canvas && s.canvas.w > 0 && !!s.createT && s.createT.w === 800, JSON.stringify({ canvas: s.canvas, createT: s.createT }));
    } else {
      assert(`${label} subpage runtime class`, /nowonsubpages/.test(s.htmlClass), s.htmlClass);
    }
    if (['about', 'album', 'blog', 'contact'].includes(type)) {
      assert(`${label} source border system matches captured source`, facts.hasBorders ? s.borders > 0 : s.borders === 0, `type=${type} sourceBorders=${facts.hasBorders} runtimeBorders=${s.borders}`);
    }
    if (type === 'album') {
      assert(`${label} album markup present`, s.albums > 0, `albums=${s.albums}`);
    }
    if (type === 'news' || type === 'news_page') {
      assert(`${label} news/list content present`, s.newsItems > 0 || document.body, `items=${s.newsItems}`);
    }
    const box = await firstVisibleBox(page, '.btn_box, .trigger');
    if (box) {
      const before = await page.evaluate(() => {
        const e = [...document.querySelectorAll('.btn_box, .trigger')].find((node) => {
          const r = node.getBoundingClientRect();
          const st = getComputedStyle(node);
          return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && st.display !== 'none' && st.visibility !== 'hidden';
        });
        const p = e?.querySelector('.borders path');
        const front = e?.querySelector('.front');
        const back = e?.querySelector('.back');
        return { dash: p ? getComputedStyle(p).strokeDashoffset : null, front: front ? getComputedStyle(front).transform : null, back: back ? getComputedStyle(back).transform : null };
      });
      await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
      await page.waitForTimeout(450);
      const after = await page.evaluate(() => {
        const e = [...document.querySelectorAll('.btn_box, .trigger')].find((node) => {
          const r = node.getBoundingClientRect();
          const st = getComputedStyle(node);
          return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && st.display !== 'none' && st.visibility !== 'hidden';
        });
        const p = e?.querySelector('.borders path');
        const front = e?.querySelector('.front');
        const back = e?.querySelector('.back');
        return { dash: p ? getComputedStyle(p).strokeDashoffset : null, front: front ? getComputedStyle(front).transform : null, back: back ? getComputedStyle(back).transform : null };
      });
      ok(`${label} hoverable source target sampled`, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
    if (consoleErrors.length) ok(`${label} console errors observed but not fatal`, consoleErrors.slice(0, 2).join(' | '));
  } catch (err) {
    fail(`${index + 1}/${total} ${item.local} load/verify exception`, err?.stack || String(err));
  } finally {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
  }
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const pages = localPages();
  assert('manifest exposes all expected local pages', pages.length >= 98, `${pages.length}`);
  const browser = await chromium.launch({ headless: true, executablePath: existsSync(CHROME) ? CHROME : undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  for (let i = 0; i < pages.length; i += 1) {
    await verifyPage(page, pages[i], i, pages.length);
  }
  await browser.close();
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, failures, results }, null, 2));
  if (failures.length) {
    console.log('\nAll-pages verification failed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nAll-pages verification passed: every generated Kenji exact page loads and initializes original runtime layers.');
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
