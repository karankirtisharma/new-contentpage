/* QA screenshot driver — headless Chrome over CDP. Dev-only, never shipped.
 *
 *   node qa/shoot.mjs <url> <out.png> <width> <height> [waitMs] [--eval "<js>"] [--after <ms>]
 *
 * Real wall-clock waiting (the hero's intro is driven by performance.now(),
 * which --virtual-time-budget does not advance), so the capture lands on the
 * settled idle composition rather than frame zero.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, out, w, h, waitMs] = process.argv.slice(2);
const evalIdx = process.argv.indexOf('--eval');
const evalJs = evalIdx > -1 ? process.argv[evalIdx + 1] : null;
const afterIdx = process.argv.indexOf('--after');
const afterMs = afterIdx > -1 ? +process.argv[afterIdx + 1] : 600;

if (!url || !out) { console.error('usage: shoot.mjs <url> <out.png> [w] [h] [waitMs]'); process.exit(2); }
const W = +(w || 1440), H = +(h || 900), WAIT = +(waitMs || 8000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = 9222 + (process.pid % 500);
const profile = `${tmpdir()}\\hero-qa-${PORT}`;
const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  ...(process.argv.includes('--scrollbars') ? [] : ['--hide-scrollbars']),
  '--disable-extensions', '--mute-audio',
  `--user-data-dir=${profile}`,
  '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const msg = { id: ++id, method, params };
  if (sessionId) msg.sessionId = sessionId;
  ws.send(JSON.stringify(msg));
  return new Promise(res => pending.set(msg.id, res));
}

try {
  /* wait for the debugger endpoint */
  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      target = list.find(t => t.type === 'page');
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error('chrome debugger never came up');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(WAIT);

  if (evalJs) {
    const r = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
    if (process.argv.includes('--print')) console.log(JSON.stringify(r.result?.value ?? r, null, 1));
    await sleep(afterMs);
  }

  if (out !== '-') {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`${out}  ${W}x${H}`);
  }
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
}
process.exit(0);
