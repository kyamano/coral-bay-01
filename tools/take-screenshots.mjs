// Coral Bay — screenshot tool (development only, not part of the game).
// Serves game/ on a local port, opens each staged scene (?shot=...) in
// headless Chromium at 1280x720, waits for the scene to settle, and saves
// the four competition screenshots as JPEGs into screenshots/.
// Also loads the plain title screen and reports any console/page errors,
// and clicks NEW GAME to prove the title flow works.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// playwright-core lives in the shared shot-tools install, not in this repo
// (the game itself must stay dependency-free static files).
const requireFromShotTools = createRequire('/home/hatch/workspace/makefun/shot-tools/package.json');
const { chromium } = requireFromShotTools('playwright-core');
const repoRoot = join(here, '..');
const gameRoot = join(repoRoot, 'game');
const outDir = join(repoRoot, 'screenshots');
mkdirSync(outDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const path = join(gameRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((resolve) => server.listen(8907, resolve));

const exe = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

const errors = [];
async function openPage(url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${url} console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`${url} pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: 'load' });
  return page;
}

const shots = [
  ['1-cover.jpg', 'index.html?shot=cover&seed=1'],
  ['2-street.jpg', 'index.html?shot=street&seed=1'],
  ['3-mission.jpg', 'index.html?shot=mission&seed=1'],
  ['4-chase.jpg', 'index.html?shot=chase&seed=1'],
];

for (const [name, query] of shots) {
  const page = await openPage(`http://127.0.0.1:8907/${query}`);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(outDir, name), type: 'jpeg', quality: 72 });
  console.log('shot', name);
  await page.close();
}

// Title screen + NEW GAME flow, with a state probe.
const title = await openPage('http://127.0.0.1:8907/index.html?seed=1');
await title.waitForTimeout(900);
await title.screenshot({ path: '/tmp/coral-title.png' });
await title.mouse.click(640, 447);
await title.waitForTimeout(700);
const screen = await title.evaluate(() => window.__coralBay && window.__coralBay.screen);
console.log('after NEW GAME click, screen =', screen);
await title.keyboard.down('KeyW');
await title.waitForTimeout(500);
await title.keyboard.up('KeyW');
const moved = await title.evaluate(() => {
  const s = window.__coralBay;
  return { x: Math.round(s.player.x), y: Math.round(s.player.y), screen: s.screen };
});
console.log('after W hold, player =', JSON.stringify(moved));
await title.close();

await browser.close();
server.close();

if (errors.length > 0) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('no console/page errors');
}
