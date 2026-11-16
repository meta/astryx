// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file One picture of a page through the project's Playwright, run as its
 * own process by the editor's browser runner.
 * @input argv: the Playwright entry file, the page (.html), the picture
 *   (.png), the color mode, and a browser to use instead of Playwright's own
 * @output the picture at the path given, and on stdout the fonts it drew
 *   its text in (font-probe.mjs) and the text it draws cut short
 *   (cut-short.mjs); on failure, Playwright's error on stderr and exit
 *   code 1
 * @position run by `screenshot` in api/theme-edit/_preview.mjs through
 *   `runBrowser`, which gives it a temp folder of its own, its time bound and its stop
 */

import {pathToFileURL} from 'node:url';
import {CUT_SHORT_PREFIX, cutShortText} from './cut-short.mjs';
import {LOCAL_URL, QUIET_BROWSER_ARGS} from './offline.mjs';
import {PICTURE_WINDOW} from './picture-window.mjs';
import {FONT_PROBE_PREFIX, probeFonts} from './font-probe.mjs';

const [entry, html, png, mode, executablePath] = process.argv.slice(2);
try {
  const pw = await import(pathToFileURL(entry).href);
  const chromium = pw.chromium ?? pw.default?.chromium;
  // The browser's own network off, as for the Chrome picture script.
  const browser = await chromium.launch({
    args: [...QUIET_BROWSER_ARGS],
    ...(executablePath ? {executablePath} : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: {...PICTURE_WINDOW},
      colorScheme: mode === 'dark' ? 'dark' : 'light',
    });
    // The page loads its own files only: a remote stylesheet, font or image
    // fails at once instead of holding the load on a network.
    await page.route(
      (/** @type {URL} */ url) => !LOCAL_URL.test(url.href),
      (/** @type {{abort: (why: string) => Promise<void>}} */ route) =>
        route.abort('blockedbyclient'),
    );
    await page.goto(pathToFileURL(html).href, {waitUntil: 'load'});
    // An overlay drawn open plays its opening animation (a fade-in) as the
    // page loads: the picture is taken with each animation that ends run
    // to its end, so it shows the overlay as it looks open.
    await page.screenshot({path: png, fullPage: true, animations: 'disabled'});
    // The fonts the picture drew its text in, for the editor's note.
    const fonts = await (async () => {
      const cdp = await page.context().newCDPSession(page);
      return probeFonts((method, params) => cdp.send(method, params));
    })().catch(() => null);
    if (fonts)
      process.stdout.write(`${FONT_PROBE_PREFIX}${JSON.stringify(fonts)}\n`);
    // The text the picture draws cut short, measured on the page as the
    // picture shows it. A page that runs no script measures nothing, and
    // the picture stands: nothing is said.
    try {
      const cut = await page.evaluate(cutShortText);
      process.stdout.write(`${CUT_SHORT_PREFIX}${JSON.stringify(cut)}\n`);
    } catch {
      // Not measured.
    }
  } finally {
    await browser.close();
  }
} catch (e) {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
