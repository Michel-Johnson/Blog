#!/usr/bin/env node
/* Verify representative Kenji Endo source interactions are live locally.
 * This is intentionally runtime-focused: the static verifier proves that the
 * generated pages/vendor code match the captured source under deterministic
 * local rewrites; this script proves the key original animation entry points
 * execute in a browser.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'verify-kenji-interactions');
const BASE = process.env.KENJI_VERIFY_BASE || 'http://127.0.0.1:8081';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const failures = [];
const results = [];

function ok(name, detail = '') {
  results.push({ status: 'OK', name, detail });
  console.log(`OK   ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failures.push(`${name}${detail ? `: ${detail}` : ''}`);
  results.push({ status: 'FAIL', name, detail });
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}
function assert(name, condition, detail = '') {
  if (condition) ok(name, detail);
  else fail(name, detail);
}
async function screenshot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  ok(`screenshot ${name}`, path.relative(ROOT, file));
}
async function waitLoaded(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('loaded'), null, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(800);
}
async function pageState(page) {
  return page.evaluate(() => {
    const css = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, display: s.display, visibility: s.visibility, opacity: s.opacity, transform: s.transform, background: s.backgroundColor };
    };
    return {
      href: location.href,
      title: document.title,
      htmlClass: document.documentElement.className,
      bodyClass: document.body.className,
      hasJquery: !!window.jQuery,
      hasPjax: !!window.jQuery?.pjax,
      canvas: css('#kenjiendo'),
      createT: css('.create_t'),
      panel: css('#panel'),
      mask: css('#mask'),
      toggle: css('.toggle'),
      borders: document.querySelectorAll('.borders path').length,
      triggers: document.querySelectorAll('.trigger').length,
      bxSlider: !!document.querySelector('.bx-wrapper, .bx-viewport'),
    };
  });
}
async function firstVisibleBox(page, selector) {
  return page.evaluate((selector) => {
    for (const e of document.querySelectorAll(selector)) {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      if (r.width > 2 && r.height > 2 && s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0) {
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }
    }
    return null;
  }, selector);
}
async function canvasSignature(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#kenjiendo');
    if (!c || !c.width || !c.height) return null;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = Math.min(c.width, 800);
    const h = Math.min(c.height, 900);
    const data = ctx.getImageData(0, 0, w, h).data;
    let sum = 0;
    let nonzero = 0;
    for (let i = 0; i < data.length; i += 16) {
      const v = data[i] + data[i + 1] * 3 + data[i + 2] * 7 + data[i + 3] * 11;
      sum = (sum + v * ((i % 997) + 1)) >>> 0;
      if (data[i + 3]) nonzero++;
    }
    return { sum, nonzero, width: c.width, height: c.height };
  });
}
async function verifyHome(page) {
  await page.goto(`${BASE}/kenji-exact-home.html?v=interaction-verify`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitLoaded(page);
  const state = await pageState(page);
  assert('exact mirror home route is active', /kenji-exact-home\.html/.test(state.href), state.href);
  assert('home keeps original title', state.title === 'KENJI ENDO', state.title);
  assert('original runtime class nowonhome is active', /nowonhome/.test(state.htmlClass), state.htmlClass);
  assert('jQuery PJAX runtime exists', state.hasJquery && state.hasPjax, `jQuery=${state.hasJquery} pjax=${state.hasPjax}`);
  assert('source title canvas exists and is visible', !!state.canvas && state.canvas.rect.w > 0 && state.canvas.rect.h > 0 && state.canvas.visibility !== 'hidden', JSON.stringify(state.canvas));
  assert('source create_t layer exists', !!state.createT && state.createT.rect.w === 800, JSON.stringify(state.createT));
  assert('panel/mask source layers exist', !!state.panel && !!state.mask && !!state.toggle, `panel=${!!state.panel} mask=${!!state.mask} toggle=${!!state.toggle}`);
  await screenshot(page, 'home-idle');

  const before = await canvasSignature(page);
  const box = await firstVisibleBox(page, '#kenjiendo');
  if (box) {
    await page.mouse.move(box.x + box.w * 0.52, Math.min(box.y + 180, box.y + box.h - 10));
    await page.waitForTimeout(450);
  }
  const after = await canvasSignature(page);
  assert('title canvas hover animation changes pixels', before && after && before.nonzero > 0 && before.sum !== after.sum, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  await screenshot(page, 'home-title-hover');
}
async function verifyPanel(page) {
  await page.click('.toggle');
  await page.waitForTimeout(450);
  let s = await pageState(page);
  assert('menu toggle adds original toggled class', /toggled/.test(s.htmlClass), s.htmlClass);
  assert('panel opens with visible opacity', s.panel && s.panel.visibility === 'visible' && Number(s.panel.opacity) > 0.5, JSON.stringify(s.panel));
  assert('mask opens with original dark overlay opacity', s.mask && s.mask.visibility === 'visible' && Number(s.mask.opacity) > 0.5, JSON.stringify(s.mask));
  const panelBefore = await page.evaluate(() => {
    const li = document.querySelector('#panel > ul > li');
    const front = li?.querySelector('.front');
    const back = li?.querySelector('.back');
    const path = li?.querySelector('svg path');
    const cs = (e) => e ? getComputedStyle(e) : null;
    return { front: cs(front)?.transform, frontOpacity: cs(front)?.opacity, back: cs(back)?.transform, backOpacity: cs(back)?.opacity, dash: cs(path)?.strokeDashoffset };
  });
  const liBox = await firstVisibleBox(page, '#panel > ul > li');
  if (liBox) {
    await page.mouse.move(liBox.x + liBox.w / 2, liBox.y + liBox.h / 2);
    await page.waitForTimeout(650);
  }
  const panelAfter = await page.evaluate(() => {
    const li = document.querySelector('#panel > ul > li');
    const front = li?.querySelector('.front');
    const back = li?.querySelector('.back');
    const path = li?.querySelector('svg path');
    const cs = (e) => e ? getComputedStyle(e) : null;
    return { front: cs(front)?.transform, frontOpacity: cs(front)?.opacity, back: cs(back)?.transform, backOpacity: cs(back)?.opacity, dash: cs(path)?.strokeDashoffset };
  });
  assert('panel item hover flips front/back', panelBefore && panelAfter && (panelBefore.front !== panelAfter.front || panelBefore.back !== panelAfter.back || panelBefore.frontOpacity !== panelAfter.frontOpacity || panelBefore.backOpacity !== panelAfter.backOpacity), `before=${JSON.stringify(panelBefore)} after=${JSON.stringify(panelAfter)}`);
  assert('panel svg draw transition is initialized', panelAfter && panelAfter.dash !== undefined && panelAfter.dash !== null, JSON.stringify(panelAfter));
  await screenshot(page, 'panel-open-hover');
  // Click a mask area outside the centered panel grid; the panel cards intentionally
  // sit above #mask and intercept clicks in the center.
  await page.mouse.click(24, 860);
  await page.waitForTimeout(420);
  s = await pageState(page);
  assert('mask click closes menu', !/toggled/.test(s.htmlClass), s.htmlClass);
}
async function verifyBordersAndScroll(page) {
  await page.goto(`${BASE}/kenji-exact-home.html?v=interaction-verify-borders`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitLoaded(page);
  await page.evaluate(() => window.scrollTo(0, 650));
  await page.waitForTimeout(700);
  const target = await page.evaluate(() => {
    const items = [];
    document.querySelectorAll('.trigger').forEach((trigger, index) => {
      const path = trigger.querySelector('.borders path');
      if (!path) return;
      const r = trigger.getBoundingClientRect();
      const s = getComputedStyle(path);
      if (r.width > 10 && r.height > 10 && r.bottom > 0 && r.top < innerHeight) {
        items.push({ index, x: r.x, y: r.y, w: r.width, h: r.height, before: s.strokeDashoffset, count: trigger.querySelectorAll('.borders path').length });
      }
    });
    return items[0] || null;
  });
  assert('visible trigger with source border paths found', !!target, JSON.stringify(target));
  if (target) {
    await page.mouse.move(target.x + target.w / 2, target.y + target.h / 2);
    await page.waitForTimeout(700);
    const after = await page.evaluate((idx) => {
      const trigger = document.querySelectorAll('.trigger')[idx];
      const path = trigger?.querySelector('.borders path');
      return path ? getComputedStyle(path).strokeDashoffset : null;
    }, target.index);
    assert('border hover drives dashoffset toward original active state', after !== null && after !== target.before, `before=${target.before} after=${after}`);
    await screenshot(page, 'border-hover');
  }

  const scrollBefore = await page.evaluate(() => ({ y: scrollY, on: [...document.querySelectorAll('.sidenav li')].findIndex((li) => li.classList.contains('on')) }));
  await page.click('.sidenav li:nth-child(3) a');
  await page.waitForTimeout(1200);
  const scrollAfter = await page.evaluate(() => ({ y: scrollY, on: [...document.querySelectorAll('.sidenav li')].findIndex((li) => li.classList.contains('on')) }));
  assert('sidenav click runs source scroll behavior', Math.abs(scrollAfter.y - scrollBefore.y) > 100 || scrollAfter.on !== scrollBefore.on, `before=${JSON.stringify(scrollBefore)} after=${JSON.stringify(scrollAfter)}`);
}
async function verifySubpages(page) {
  const pages = [
    ['about', `${BASE}/kenji-exact-about.html?v=interaction-verify-about`],
    ['news', `${BASE}/kenji-exact-news.html?v=interaction-verify-news`],
    ['album', `${BASE}/kenji-exact-album.html?v=interaction-verify-album`],
  ];
  for (const [name, url] of pages) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitLoaded(page);
    const state = await pageState(page);
    assert(`${name} page uses original subpage runtime class`, /nowonsubpages/.test(state.htmlClass), state.htmlClass);
    assert(`${name} page keeps panel source layer`, !!state.panel && !!state.mask && !!state.toggle, `panel=${!!state.panel} mask=${!!state.mask}`);
    if (name === 'news') {
      assert('news page source has no border/svg system by design', state.borders === 0, `borders=${state.borders}`);
    } else {
      assert(`${name} page has original border/svg system`, state.borders > 0, `borders=${state.borders}`);
    }
    if (name === 'album') {
      const albumState = await page.evaluate(() => ({
        albumItems: document.querySelectorAll('a.album').length,
        albumImages: document.querySelectorAll('a.album img').length,
        btnBoxes: document.querySelectorAll('.albumL.btn_box').length,
        viewinCome: document.querySelectorAll('.albumL.viewin.come').length,
      }));
      assert('album page uses original album list markup, not slider markup', !state.bxSlider && albumState.albumItems > 0 && albumState.btnBoxes > 0, JSON.stringify(albumState));
    }
    await screenshot(page, `subpage-${name}`);
  }
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: existsSync(CHROME) ? CHROME : undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => fail('browser page error', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') results.push({ status: 'INFO', name: 'console error', detail: msg.text() });
  });
  try {
    await verifyHome(page);
    await verifyPanel(page);
    await verifyBordersAndScroll(page);
    await verifySubpages(page);
  } finally {
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ base: BASE, failures, results }, null, 2));
    await browser.close();
  }
  if (failures.length) {
    console.log('\nInteraction verification failed:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('\nInteraction verification passed: representative original Kenji animations are active locally.');
}

main().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
