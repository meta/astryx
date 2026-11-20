// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Whole-page pictures of a batch of pages through one Chrome or
 * Chromium, driven over the DevTools protocol on a pipe, run as its own
 * process by the editor's browser runner.
 * @input argv: the browser, and the batch (JSON: each job's page .html,
 *   picture .png and color mode)
 * @output each whole page, every pixel of its height, at its path, and on
 *   stdout, each line led by its job's place and a tab: the fonts it drew
 *   its text in (font-probe.mjs), the text it draws cut short
 *   (cut-short.mjs), and PICTURE_TAKEN once it is whole; on failure, the
 *   browser's reason on stderr and exit code 1
 * @position run by `screenshot` in api/theme-edit/_preview.mjs through
 *   `runBrowser`, which gives it a temp folder of its own (the browser's
 *   profile goes there), its time bound and its stop
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CUT_SHORT_PREFIX, cutShortText} from './cut-short.mjs';
import {LOW_CONTRAST_PREFIX, lowContrastText} from './drawn-contrast.mjs';
import {NETWORK_URL_PATTERNS, QUIET_BROWSER_ARGS} from './offline.mjs';
import {
  FIT_CELLS,
  PLACE_LAYERS,
  PICTURE_PAGES_AT_ONCE,
  PICTURE_TAKEN,
  PICTURE_WINDOW,
  SETTLE_ANIMATIONS,
  AWAIT_QUIET,
  eachAtOnce,
} from './picture-window.mjs';
import {FONT_PROBE_PREFIX, probeFonts} from './font-probe.mjs';

const [chrome, batch] = process.argv.slice(2);
/** @type {Array<{html: string, png: string, mode: string}>} */
const jobs = JSON.parse(batch);
/** A line for one job of the batch. @param {number} i @param {string} line */
const say = (i, line) => process.stdout.write(`${i}\t${line}\n`);

const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-pipe',
    // The browser's own network off: a picture asks the network for nothing.
    ...QUIET_BROWSER_ARGS,
    `--user-data-dir=${path.join(os.tmpdir(), 'profile')}`,
    'about:blank',
  ],
  // The protocol runs on fds 3 (to the browser) and 4 (from it).
  {stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe']},
);
// Stopped by the runner (its group gets the signal): the browser is closed
// and waited for before this process ends, so nothing still writes to the
// profile in the temp folder the runner then removes.
for (const sig of /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP']))
  process.on(sig, () => {
    if (browser.exitCode != null || browser.signalCode != null) process.exit(1);
    browser.once('close', () => process.exit(1));
    browser.kill('SIGTERM');
  });
let stderr = '';
browser.stderr?.setEncoding('utf8');
browser.stderr?.on('data', d => {
  if (stderr.length < 8000) stderr += d;
});
const toBrowser = /** @type {import('node:stream').Writable} */ (
  browser.stdio[3]
);
const fromBrowser = /** @type {import('node:stream').Readable} */ (
  browser.stdio[4]
);

let next = 1;
/** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
const waiting = new Map();
/** @type {Array<{method: string, sessionId?: string, resolve: (v: any) => void}>} */
const listeners = [];
let buffer = '';
fromBrowser.setEncoding('utf8');
fromBrowser.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    if (msg.id && waiting.has(msg.id)) {
      const w = /** @type {any} */ (waiting.get(msg.id));
      waiting.delete(msg.id);
      if (msg.error) w.reject(new Error(msg.error.message));
      else w.resolve(msg.result);
    } else if (msg.method) {
      const i = listeners.findIndex(
        l => l.method === msg.method && l.sessionId === msg.sessionId,
      );
      if (i >= 0) listeners.splice(i, 1)[0].resolve(msg.params);
    }
  }
});

const gone = new Promise((_, reject) => {
  browser.on('close', code =>
    reject(
      new Error(
        stderr.trim() ||
          `the browser stopped (exit ${code}) before the picture`,
      ),
    ),
  );
  // A browser that cannot be started at all (not there, not runnable).
  browser.on('error', e => reject(e));
});
gone.catch(() => {});
// A browser that ends early closes its pipes: a write to it then fails
// with EPIPE. That is no error of its own: the browser's close (and its
// stderr, which names the cause) is the reason given.
toBrowser.on('error', () => {});
fromBrowser.on('error', () => {});

/**
 * One protocol call, answered or failed with the browser.
 * @param {string} method
 * @param {object} [params]
 * @param {string} [sessionId]
 * @returns {Promise<any>}
 */
function send(method, params = {}, sessionId) {
  const id = next++;
  const answer = new Promise((resolve, reject) =>
    waiting.set(id, {resolve, reject}),
  );
  toBrowser.write(
    `${JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})}\0`,
  );
  return Promise.race([answer, gone]);
}

/**
 * The next event of a kind in a session.
 * @param {string} method
 * @param {string} sessionId
 */
function event(method, sessionId) {
  return Promise.race([
    new Promise(resolve => listeners.push({method, sessionId, resolve})),
    gone,
  ]);
}

/**
 * One page of the batch in a tab of its own: drawn, pictured whole, and
 * measured.
 * @param {{html: string, png: string, mode: string}} job
 * @param {number} i
 */
async function picture({html, png, mode}, i) {
  // Each page in a window of its own: a page in a background tab runs
  // no animation frames, so a chart drawn over frames never finishes.
  const {targetId} = await send('Target.createTarget', {url: 'about:blank', newWindow: true});
  const {sessionId} = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  await send('Page.enable', {}, sessionId);
  // The page loads its own files only: a remote stylesheet, font or image
  // fails at once instead of holding the load on a network.
  await send('Network.enable', {}, sessionId);
  await send('Network.setBlockedURLs', {urls: NETWORK_URL_PATTERNS}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    {...PICTURE_WINDOW, deviceScaleFactor: 1, mobile: false},
    sessionId,
  );
  await send(
    'Emulation.setEmulatedMedia',
    {
      features: [
        {
          name: 'prefers-color-scheme',
          value: mode === 'dark' ? 'dark' : 'light',
        },
      ],
    },
    sessionId,
  );
  const loaded = event('Page.loadEventFired', sessionId);
  await send('Page.navigate', {url: pathToFileURL(html).href}, sessionId);
  await loaded;
  // The page draws, at the window's size, until it is quiet (a chart's
  // drawing over frames ends).
  await send('Runtime.evaluate', {expression: AWAIT_QUIET, awaitPromise: true}, sessionId);
  // An overlay drawn open plays its opening animation (a fade-in) as the
  // page loads: it is run to its end, and a looping one held at a frame a
  // person sees (SETTLE_ANIMATIONS), before the picture.
  await send('Runtime.evaluate', {expression: SETTLE_ANIMATIONS}, sessionId);
  // Text a part cuts when narrow gets the room it needs (FIT_CELLS).
  await send('Runtime.evaluate', {expression: FIT_CELLS}, sessionId);
  // An overlay drawn after its part sits under its opener (PLACE_LAYERS).
  await send('Runtime.evaluate', {expression: PLACE_LAYERS}, sessionId);
  const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
  const size = metrics.cssContentSize ?? metrics.contentSize;
  // A picture beyond the window makes the page see a resize; a part that
  // redraws on it (a responsive chart) would start over and be pictured
  // empty. The page's script is held while the picture is taken; the page
  // stays laid out for the window (its vh, fixed parts and media queries).
  await send('Emulation.setScriptExecutionDisabled', {value: true}, sessionId);
  const {data} = await send(
    'Page.captureScreenshot',
    {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        // The whole page: a part wider than the window (the page lays it out
        // past the window's edge) is pictured whole, never cut at it.
        width: Math.max(PICTURE_WINDOW.width, Math.ceil(size.width)),
        height: Math.max(1, Math.ceil(size.height)),
        scale: 1,
      },
    },
    sessionId,
  );
  fs.writeFileSync(png, Buffer.from(data, 'base64'));
  await send('Emulation.setScriptExecutionDisabled', {value: false}, sessionId);
  // The fonts the picture drew its text in, for the editor's note.
  const fonts = await probeFonts((method, params) =>
    send(method, params, sessionId),
  ).catch(() => null);
  if (fonts) say(i, `${FONT_PROBE_PREFIX}${JSON.stringify(fonts)}`);
  // The text the picture draws cut short, measured on the page as the
  // picture shows it. A measurement that does not run says nothing, and
  // the picture stands.
  const measured = await send(
    'Runtime.evaluate',
    {expression: `(${cutShortText})()`, returnByValue: true},
    sessionId,
  ).catch(() => null);
  if (Array.isArray(measured?.result?.value) && !measured.exceptionDetails)
    say(i, `${CUT_SHORT_PREFIX}${JSON.stringify(measured.result.value)}`);
  // The text the picture draws too faint to read, measured the same way.
  const faint = await send(
    'Runtime.evaluate',
    {expression: `(${lowContrastText})()`, returnByValue: true},
    sessionId,
  ).catch(() => null);
  if (Array.isArray(faint?.result?.value) && !faint.exceptionDetails)
    say(i, `${LOW_CONTRAST_PREFIX}${JSON.stringify(faint.result.value)}`);
  await send('Target.closeTarget', {targetId}).catch(() => {});
  say(i, PICTURE_TAKEN);
}

try {
  // One browser for every page of the batch, a few tabs at a time.
  await eachAtOnce(jobs, PICTURE_PAGES_AT_ONCE, picture);
  await send('Browser.close').catch(() => {});
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
  browser.kill('SIGKILL');
}
