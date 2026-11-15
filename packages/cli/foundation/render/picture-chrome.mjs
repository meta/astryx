// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One whole-page picture of a page through a Chrome or Chromium,
 * driven over the DevTools protocol on a pipe, run as its own process by the
 * editor's browser runner.
 * @input argv: the browser, the page (.html), the picture (.png), the color
 *   mode
 * @output the whole page, every pixel of its height, at the path given; on
 *   failure, the browser's reason on stderr and exit code 1
 * @position run by `screenshot` in api/theme-edit/_preview.mjs through
 *   `runBrowser`, which gives it a temp folder of its own (the browser's
 *   profile goes there), its time bound and its stop
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const [chrome, html, png, mode] = process.argv.slice(2);

const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-pipe',
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

try {
  const {targetId} = await send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });
  await send('Page.enable', {}, sessionId);
  await send(
    'Emulation.setDeviceMetricsOverride',
    {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false},
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
  const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
  const size = metrics.cssContentSize ?? metrics.contentSize;
  const {data} = await send(
    'Page.captureScreenshot',
    {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: 1280,
        height: Math.max(1, Math.ceil(size.height)),
        scale: 1,
      },
    },
    sessionId,
  );
  fs.writeFileSync(png, Buffer.from(data, 'base64'));
  await send('Browser.close').catch(() => {});
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
  browser.kill('SIGKILL');
}
