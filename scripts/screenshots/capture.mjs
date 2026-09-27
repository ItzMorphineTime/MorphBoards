#!/usr/bin/env node
/**
 * Regenerates the README screenshots in docs/screenshots/.
 *
 *   npm run screenshots                  build the client, seed, capture
 *   node scripts/screenshots/capture.mjs --contact-sheet out.png
 *                                        render every demo plate on one sheet
 *
 * Starts a throwaway MorphBoards server with its own data directory, seeds the
 * demo boards (demo-content.js), then drives headless Chrome or Edge over the
 * DevTools protocol, including two guest sessions for the collaboration shots.
 * Your real boards are never touched. Pass --keep to keep the demo data.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.DEMO_PORT ?? 3101);
const CDP_PORT = Number(process.env.DEMO_CDP_PORT ?? 9333);
const BASE = `http://127.0.0.1:${PORT}`;
const VIEW = { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false };
const TOPBAR = 52;
const CANVAS = { width: VIEW.width, height: VIEW.height - TOPBAR };
const FORMAT = process.env.SCREENSHOT_FORMAT ?? 'webp';
const KEEP = process.argv.includes('--keep');
const sheetArg = process.argv.indexOf('--contact-sheet');
const CONTACT_SHEET = sheetArg > -1 ? path.resolve(process.argv[sheetArg + 1] ?? 'contact-sheet.png') : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ process

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
  return found;
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

// ---------------------------------------------------------------------- CDP

/** One browser-level socket; pages are flattened sessions on it. */
function connectCdp(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, method } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  return new Promise((resolve, reject) => {
    ws.onerror = () => reject(new Error(`Could not connect to ${url}`));
    ws.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params, sessionId }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej, method }));
        },
        on(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        close() {
          ws.close();
        },
      });
  });
}

let navCounter = 0;

async function openPage(cdp, label, { isolated = false } = {}) {
  const params = { url: 'about:blank' };
  if (isolated) params.browserContextId = (await cdp.send('Target.createBrowserContext')).browserContextId;
  const { targetId } = await cdp.send('Target.createTarget', params);
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, p) => cdp.send(method, p, sessionId);

  const waitEvent = (method, timeoutMs = 30_000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`${label}: timed out waiting for ${method}`));
      }, timeoutMs);
      const off = cdp.on((msg) => {
        if (msg.sessionId === sessionId && msg.method === method) {
          clearTimeout(timer);
          off();
          resolve(msg.params);
        }
      });
    });

  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.warn(`  ! ${label}: ${d.exception?.description ?? d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      console.warn(`  ! ${label}: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', VIEW);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  const page = {
    label,
    sessionId,
    targetId,
    send,
    /** Full navigation (a query nonce avoids same-document hash changes). */
    async goto(pathAndHash) {
      const [p, hash = ''] = pathAndHash.split('#');
      const url = `${BASE}${p}${p.includes('?') ? '&' : '?'}n=${++navCounter}${hash ? `#${hash}` : ''}`;
      const loaded = waitEvent('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(`${label}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      }
      return r.result.value;
    },
    async waitFor(expression, timeoutMs = 20_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (await page.evaluate(expression).catch(() => false)) return;
        await sleep(150);
      }
      throw new Error(`${label}: timed out waiting for ${expression}`);
    },
    async mouse(type, x, y, buttons = 0) {
      await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: type === 'mouseMoved' && !buttons ? 'none' : 'left',
        buttons,
        clickCount: type === 'mouseMoved' ? 0 : 1,
      });
    },
    async move(x, y) {
      await page.mouse('mouseMoved', x, y);
    },
    async click(x, y) {
      await page.mouse('mouseMoved', x, y);
      await page.mouse('mousePressed', x, y, 1);
      await page.mouse('mouseReleased', x, y, 0);
    },
    async key(key, code, keyCode) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    },
    /** Screen-space center of the first element matching a selector. */
    async centerOf(selector) {
      const r = await page.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      })()`);
      if (!r) throw new Error(`${label}: nothing matches ${selector}`);
      return r;
    },
    async screenshot(name) {
      await send('Page.bringToFront');
      await sleep(250);
      const { data } = await send('Page.captureScreenshot', {
        format: FORMAT,
        ...(FORMAT === 'png' ? {} : { quality: 92 }),
      });
      const file = path.join(OUT, `${name}.${FORMAT}`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`  ✓ ${path.relative(ROOT, file)}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
    },
    async close() {
      await cdp.send('Target.closeTarget', { targetId });
    },
  };
  return page;
}

// ----------------------------------------------------------------- viewport

/** Viewport that fits a world region into the canvas area. */
function fit(region, { left = 84, right = 36, top = 44, bottom = 36, width = CANVAS.width, alignTop = false } = {}) {
  const availW = width - left - right;
  const availH = CANVAS.height - top - bottom;
  const zoom = Math.min(availW / region.w, availH / region.h);
  return {
    zoom,
    x: left + (availW - region.w * zoom) / 2 - region.x * zoom,
    y: top + (alignTop ? 0 : (availH - region.h * zoom) / 2) - region.y * zoom,
  };
}

const toScreen = (vp, wx, wy) => ({ x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y + TOPBAR });

async function openBoard(page, route, boardId, vp) {
  await page.evaluate(`localStorage.setItem(${JSON.stringify(`mb.viewport.${boardId}`)}, ${JSON.stringify(JSON.stringify(vp))}); true`);
  // background tabs may defer image decoding and font loads
  await page.send('Page.bringToFront');
  await page.goto(route);
  await page.waitFor(`!!document.querySelector('.status-live')`);
  const ready = `document.fonts.status === 'loaded' && [...document.querySelectorAll('.image-view')].every((img) => img.complete && img.naturalWidth > 0)`;
  try {
    await page.waitFor(ready, 30_000);
  } catch (err) {
    const state = await page.evaluate(`({
      fonts: document.fonts.status,
      images: [...document.querySelectorAll('.image-view')].map((img) => ({ src: img.src.slice(-24), complete: img.complete, w: img.naturalWidth })),
      broken: document.querySelectorAll('.image-broken').length,
    })`);
    console.error(`  ${page.label} not ready:`, JSON.stringify(state));
    throw err;
  }
  await sleep(300);
}

/** Join via a share link as a named guest whose cursor colour isn't taken. */
async function joinAsGuest(cdp, name, token, boardId, vp, takenColors) {
  const page = await openPage(cdp, name, { isolated: true });
  await page.goto('/');
  // guest colours derive from a random id; re-roll the identity on a clash
  for (let attempt = 0; attempt < 12; attempt++) {
    const color = await page.evaluate(`(async () => {
      await fetch('/api/identity', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: ${JSON.stringify(name)} }) });
      const me = await (await fetch('/api/me', { headers: { 'x-share-token': ${JSON.stringify(token)} } })).json();
      return me.actor.color;
    })()`);
    if (!takenColors.has(color)) {
      takenColors.add(color);
      break;
    }
    await page.send('Network.clearBrowserCookies');
  }
  await openBoard(page, `/#/s/${token}`, boardId, vp);
  return page;
}

// --------------------------------------------------------------------- main

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphboards-demo-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'morphboards-chrome-'));
  const children = [];

  const cleanup = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // already gone
      }
    }
  };
  process.on('exit', cleanup);

  console.log('Starting demo server…');
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, MORPH_DATA_DIR: dataDir, MORPH_PORT: String(PORT), MORPH_HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  children.push(server);
  await waitForHttp(`${BASE}/api/health`);

  const browserPath = findBrowser();
  console.log(`Launching ${path.basename(browserPath)} (headless)…`);
  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  children.push(browser);
  const version = await (await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  const cdp = await connectCdp(version.webSocketDebuggerUrl);
  const demoSource = fs.readFileSync(path.join(HERE, 'demo-content.js'), 'utf8');

  try {
    const owner = await openPage(cdp, 'owner');
    await owner.goto('/');
    await owner.evaluate(demoSource);

    if (CONTACT_SHEET) {
      const { width, height } = await owner.evaluate('window.__morphDemo.contactSheet()');
      await owner.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await sleep(300);
      const { data } = await owner.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(CONTACT_SHEET, Buffer.from(data, 'base64'));
      console.log(`Contact sheet → ${CONTACT_SHEET}`);
      return;
    }

    console.log('Seeding demo boards…');
    const seeded = await owner.evaluate('window.__morphDemo.seed()');
    const main = seeded.main;

    // spread "last edited" times so the board list reads like real use
    const Database = createRequire(path.join(ROOT, 'server', 'package.json'))('better-sqlite3');
    const db = new Database(path.join(dataDir, 'morphboards.db'));
    const stamp = db.prepare('UPDATE boards SET updated_at = ?, created_at = ? WHERE id = ?');
    const now = Date.now();
    for (const b of seeded.boards) stamp.run(now - b.ago, now - b.ago - 30 * 86_400_000, b.id);
    db.close();

    const { PITCH, ROW2 } = main.frames;
    console.log('Capturing…');

    // 1 · board list
    await owner.goto('/');
    await owner.waitFor(`document.querySelectorAll('.board-card').length === ${seeded.boards.length}`);
    await owner.waitFor(`[...document.querySelectorAll('.board-thumb img')].every((img) => img.complete && img.naturalWidth > 0)`);
    await owner.move(1400, 880);
    await sleep(300);
    await owner.screenshot('boards');

    // 2 · hero: the whole sequence, two collaborators on the board
    const heroVp = fit({ x: -60, y: -460, w: 3800, h: 1720 }, { top: 36, alignTop: true });
    await openBoard(owner, `/#/b/${main.id}`, main.id, heroVp);
    const takenColors = new Set(['#2f6fe0']); // the owner's
    const maya = await joinAsGuest(cdp, 'Maya Chen', main.shares.commenter, main.id, heroVp, takenColors);
    const leo = await joinAsGuest(cdp, 'Leo Park', main.shares.editor, main.id, heroVp, takenColors);
    const leoSticky = await leo.centerOf(`[data-element-id="${main.leoSticky}"]`);
    await leo.click(leoSticky.x, leoSticky.y);
    await leo.move(leoSticky.x + 70, leoSticky.y + 40);
    const mayaAt = toScreen(heroVp, 30 + 1020 * 0.44, 30 + 574 * 0.36);
    await maya.move(mayaAt.x, mayaAt.y);
    const heroRest = toScreen(heroVp, PITCH - 100, ROW2 - 60);
    await owner.move(heroRest.x, heroRest.y);
    await sleep(1400);
    await owner.screenshot('hero');

    // 3 · collaboration close-up: Leo mid-drag, Maya pointing at the billboard.
    // The left edge sits just past SH020, so only the connector enters from it.
    const collabZoom = 0.85;
    const collabVp = { zoom: collabZoom, x: -(2 * PITCH - 248) * collabZoom, y: 20 + 45 * collabZoom };
    await openBoard(owner, `/#/b/${main.id}`, main.id, collabVp);
    for (const guest of [maya, leo]) await openBoard(guest, `/#/s/${guest === maya ? main.shares.commenter : main.shares.editor}`, main.id, collabVp);
    // grab the sticky by its corner so the cursor doesn't sit on the note text
    const grab = await leo.evaluate(`(() => {
      const b = document.querySelector('[data-element-id="${main.leoSticky}"]').getBoundingClientRect();
      return { x: b.x + 26, y: b.y + 24 };
    })()`);
    await leo.mouse('mouseMoved', grab.x, grab.y);
    await leo.mouse('mousePressed', grab.x, grab.y, 1);
    for (let i = 1; i <= 10; i++) await leo.mouse('mouseMoved', grab.x - i * 9, grab.y - i * 10, 1);
    const boardAt = toScreen(collabVp, 2 * PITCH + 30 + 1020 * 0.6, 30 + 574 * 0.245);
    await maya.move(boardAt.x, boardAt.y);
    const collabRest = toScreen(collabVp, 2 * PITCH + 1300, 700);
    await owner.move(collabRest.x, collabRest.y);
    await sleep(1400);
    await owner.screenshot('collaboration');
    await leo.key('Escape', 'Escape', 27);
    await leo.mouse('mouseReleased', grab.x - 90, grab.y - 100, 0);
    await maya.close();
    await leo.close();

    // 4 · review threads: sidebar + an open thread on SH010
    const commentsVp = fit({ x: -40, y: -80, w: 1160, h: 1010 }, { width: CANVAS.width - 300 });
    await openBoard(owner, `/#/b/${main.id}`, main.id, commentsVp);
    const commentsBtn = await owner.centerOf('button[title="Comments"]');
    await owner.click(commentsBtn.x, commentsBtn.y);
    const pin = await owner.centerOf(`[data-element-id="${main.pinA}"]`);
    await owner.click(pin.x, pin.y);
    await owner.waitFor(`!!document.querySelector('.comment-popover')`);
    await sleep(400);
    await owner.screenshot('comments');
    await owner.key('Escape', 'Escape', 27);

    // 5 · editing: a status pill selected, style panel open
    const editVp = fit({ x: PITCH - 40, y: -80, w: 1160, h: 1010 }, { width: CANVAS.width - 260 });
    await openBoard(owner, `/#/b/${main.id}`, main.id, editVp);
    const pill = await owner.centerOf(`[data-element-id="${main.reviewPill}"]`);
    await owner.click(pill.x, pill.y);
    await owner.move(pill.x + 30, pill.y + 4);
    await owner.waitFor(`!!document.querySelector('.style-panel')`);
    await sleep(500);
    await owner.screenshot('editing');
    await owner.key('Escape', 'Escape', 27);

    // 6 · sharing: the three role links, as a LAN-bound server shows them
    await openBoard(owner, `/#/b/${main.id}`, main.id, heroVp);
    await owner.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/server-info*', requestStage: 'Request' }] });
    const offFetch = cdp.on((msg) => {
      if (msg.sessionId !== owner.sessionId || msg.method !== 'Fetch.requestPaused') return;
      const body = Buffer.from(JSON.stringify({ port: 3001, hosts: ['192.168.1.20'], bound: '0.0.0.0' })).toString('base64');
      void owner.send('Fetch.fulfillRequest', {
        requestId: msg.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'application/json' }],
        body,
      });
    });
    const shareBtn = await owner.centerOf('button[title="Share this board"]');
    await owner.click(shareBtn.x, shareBtn.y);
    await owner.waitFor(`document.querySelectorAll('.share-url').length === 3 && !document.querySelector('.share-warning')`);
    await owner.move(20, 880);
    await sleep(400);
    await owner.screenshot('sharing');
    offFetch();
    await owner.send('Fetch.disable');
  } finally {
    await cdp.send('Browser.close').catch(() => undefined);
    cdp.close();
    await sleep(600);
    cleanup();
    await sleep(600);
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    if (KEEP) console.log(`Demo data kept in ${dataDir}`);
    else fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
