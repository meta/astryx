// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The pictures of a batch of pages through the project's Playwright,
 * one browser for all, run as its own process by the editor's browser
 * runner.
 * @input argv: the Playwright entry file, the batch (JSON: each job's page
 *   .html, picture .png and color mode), and a browser to use instead of
 *   Playwright's own
 * @output each picture at its path, and on stdout, each line led by its
 *   job's place and a tab: the fonts it drew its text in (font-probe.mjs),
 *   the text it draws cut short (cut-short.mjs), and PICTURE_TAKEN once it
 *   is whole; on failure, Playwright's error on stderr and exit code 1
 * @position run by `screenshot` in api/theme-edit/_preview.mjs through
 *   `runBrowser`, which gives it a temp folder of its own, its time bound and its stop
 */

import {pathToFileURL} from 'node:url';
import {CUT_SHORT_PREFIX, cutShortText} from './cut-short.mjs';
import {LOCAL_URL, QUIET_BROWSER_ARGS} from './offline.mjs';
import {
  FIT_CELLS,
  PICTURE_PAGES_AT_ONCE,
  PICTURE_TAKEN,
  PICTURE_WINDOW,
  SETTLE_ANIMATIONS,
  AWAIT_QUIET,
  eachAtOnce,
} from './picture-window.mjs';
import {FONT_PROBE_PREFIX, probeFonts} from './font-probe.mjs';

const [entry, batch, executablePath] = process.argv.slice(2);
/** @type {Array<{html: string, png: string, mode: string}>} */
const jobs = JSON.parse(batch);
/** A line for one job of the batch. @param {number} i @param {string} line */
const say = (i, line) => process.stdout.write(`${i}\t${line}\n`);
try {
  const pw = await import(pathToFileURL(entry).href);
  const chromium = pw.chromium ?? pw.default?.chromium;
  // One browser for every picture of the batch, its own network off, as
  // for the Chrome picture script.
  const browser = await chromium.launch({
    args: [...QUIET_BROWSER_ARGS],
    ...(executablePath ? {executablePath} : {}),
  });
  try {
    await eachAtOnce(
      jobs,
      PICTURE_PAGES_AT_ONCE,
      async ({html, png, mode}, i) => {
        const page = await browser.newPage({
          viewport: {...PICTURE_WINDOW},
          colorScheme: mode === 'dark' ? 'dark' : 'light',
        });
        // The page loads its own files only: a remote stylesheet, font or
        // image fails at once instead of holding the load on a network.
        await page.route(
          (/** @type {URL} */ url) => !LOCAL_URL.test(url.href),
          (/** @type {{abort: (why: string) => Promise<void>}} */ route) =>
            route.abort('blockedbyclient'),
        );
        await page.goto(pathToFileURL(html).href, {waitUntil: 'load'});
        // The page draws until it is quiet (a chart's drawing over frames
        // ends).
        await page.evaluate(AWAIT_QUIET);
        // An overlay drawn open plays its opening animation (a fade-in) as
        // the page loads: it is run to its end, and a looping one held at a
        // frame a person sees (SETTLE_ANIMATIONS), before the picture.
        // Playwright's own animations: 'disabled' would put a looping one
        // back at its first frame, where a skeleton is faint.
        await page.evaluate(SETTLE_ANIMATIONS);
        // Text a part cuts when narrow gets the room it needs (FIT_CELLS).
        await page.evaluate(FIT_CELLS);
        // A whole-page picture makes the page see a resize; a part that
        // redraws on it (a responsive chart) would start over and be
        // pictured empty. The page's script is held while it is taken.
        const held = await (async () => {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setScriptExecutionDisabled', {value: true});
          return cdp;
        })().catch(() => null);
        await page.screenshot({path: png, fullPage: true, animations: 'allow'});
        await held?.send('Emulation.setScriptExecutionDisabled', {value: false}).catch(() => {});
        // The fonts the picture drew its text in, for the editor's note.
        const fonts = await (async () => {
          const cdp = await page.context().newCDPSession(page);
          return probeFonts((method, params) => cdp.send(method, params));
        })().catch(() => null);
        if (fonts) say(i, `${FONT_PROBE_PREFIX}${JSON.stringify(fonts)}`);
        // The text the picture draws cut short, measured on the page as the
        // picture shows it. A page that runs no script measures nothing, and
        // the picture stands: nothing is said.
        try {
          const cut = await page.evaluate(cutShortText);
          say(i, `${CUT_SHORT_PREFIX}${JSON.stringify(cut)}`);
        } catch {
          // Not measured.
        }
        await page.close?.().catch(() => {});
        say(i, PICTURE_TAKEN);
      },
    );
  } finally {
    await browser.close();
  }
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
