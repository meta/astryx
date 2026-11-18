// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every ready page template fits a 390 px phone: built into one Vite
 * app, run with its scripts, and shown in Chromium's phone emulation (touch,
 * so `(pointer: coarse)` matches and the theme's larger touch text and
 * controls apply) and again with a mouse, the page has no horizontal
 * overflow. Pages copied from a template keep its layout, so an overflowing
 * template makes overflowing pages.
 *
 * The app is what a builder's app is: each template is copied with
 * `astryx template`, compiled with the Vite plugin from @astryxdesign/build,
 * and wrapped in the neutral theme with its stylesheet. Requests that leave
 * the local server are aborted, so a web font or a remote image cannot make
 * the result depend on the network.
 *
 * CI runs it in node-browser-contracts' "Template phone fit browser case"
 * step, after the Chromium install and the build package's build.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../packages/cli/test-utils/linked-fixture.mjs';
import {
  readyPageTemplates,
  scaffoldTemplates,
} from '../../packages/cli/test-utils/render-template-slices.mjs';

const BROWSER_STEP = process.env.ASTRYX_TEMPLATE_PHONE_FIT_BROWSER === '1';
const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const {chromium} = createRequire(import.meta.url)('playwright');

/** A phone's screen in CSS pixels. */
const PHONE = {width: 390, height: 844};

/** The pointers a reader uses: a phone's touch, and a mouse in a narrow window. */
const POINTERS = {
  touch: {isMobile: true, hasTouch: true},
  mouse: {},
};

/** The app's entry: the template named by the URL hash, in the neutral theme. */
const MAIN = `import '@astryxdesign/core/reset.css';
import '@astryxdesign/theme-neutral/theme.css';
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
const pages = import.meta.glob('./templates/*/page.tsx');
const load = pages['./templates/' + location.hash.slice(1) + '/page.tsx'];
load().then(module => {
  createRoot(document.getElementById('root')).render(
    createElement(Theme, {theme: neutralTheme}, createElement(module.default)),
  );
  // Two frames after the first render, effects and media queries have run.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.body.setAttribute('data-ready', '')),
  );
});
`;

const INDEX = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>
`;

/** Content types for the files a Vite build writes. */
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

/** @param {string} dir */
function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      const url = decodeURIComponent((request.url ?? '/').split(/[?#]/)[0]);
      const file = path.join(dir, url === '/' ? 'index.html' : url);
      if (
        !file.startsWith(dir) ||
        !fs.existsSync(file) ||
        fs.statSync(file).isDirectory()
      ) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader(
        'content-type',
        TYPES[path.extname(file)] ?? 'application/octet-stream',
      );
      fs.createReadStream(file).pipe(response);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe.runIf(BROWSER_STEP)(
  'every ready page template on a 390 px phone',
  () => {
    /** @type {string} */
    let home;
    /** @type {string[]} */
    let ready = [];
    /** @type {any} */
    let server;
    /** @type {any} */
    let browser;

    beforeAll(async () => {
      home = makeLinkedFixture('astryx-template-phone-fit-', [
        '@astryxdesign',
        '@stylexjs',
        '@heroicons',
        'lucide-react',
        'react',
        'react-dom',
        'recharts',
      ]);
      ready = await readyPageTemplates(home);
      await scaffoldTemplates(home, ready, ['@astryxdesign/theme-neutral']);
      fs.writeFileSync(path.join(home, 'index.html'), INDEX);
      fs.writeFileSync(path.join(home, 'main.tsx'), MAIN);

      // .github/scripts is outside the workspace, so a bare specifier does not
      // resolve the Vite plugin here. It ships as a build artifact.
      const pluginPath = path.join(REPO_ROOT, 'packages/build/dist/vite.mjs');
      if (!fs.existsSync(pluginPath))
        throw new Error(
          `${pluginPath} is missing: run \`pnpm -F @astryxdesign/build build\` first.`,
        );
      const {astryxStylex} = await import(pathToFileURL(pluginPath).href);
      const {build} = await import('vite');
      const react = (await import('@vitejs/plugin-react')).default;
      const outDir = path.join(path.dirname(home), 'dist');
      await build({
        root: home,
        logLevel: 'error',
        build: {outDir, emptyOutDir: true, chunkSizeWarningLimit: 100_000},
        // The links sit beside the fixture, so the plugin finds the packages there.
        plugins: [
          react(),
          ...astryxStylex({dev: false, rootDir: path.dirname(home)}),
        ],
      });
      server = await serve(outDir);

      const executablePath = chromium.executablePath();
      if (!fs.existsSync(executablePath))
        throw new Error(
          `Playwright's Chromium is not installed at ${executablePath}: run npx playwright install chromium`,
        );
      browser = await chromium.launch();
    }, 900_000);

    afterAll(async () => {
      await browser?.close();
      server?.close();
      if (home) removeLinkedFixture(home);
    });

    it('has no horizontal overflow with touch or a mouse', async () => {
      const origin = `http://127.0.0.1:${server.address().port}`;
      /** @type {string[]} */
      const problems = [];
      for (const [pointer, options] of Object.entries(POINTERS)) {
        const context = await browser.newContext({viewport: PHONE, ...options});
        await context.route('**/*', (/** @type {any} */ route) =>
          route.request().url().startsWith(origin)
            ? route.continue()
            : route.abort(),
        );
        try {
          for (const id of ready) {
            const page = await context.newPage();
            /** @type {string[]} */
            const errors = [];
            page.on('pageerror', (/** @type {Error} */ error) =>
              errors.push(error.message),
            );
            try {
              await page.goto(`${origin}/#${id}`);
              await page.waitForSelector('body[data-ready]', {timeout: 30_000});
              const width = await page.evaluate(() => {
                // This runs in the page, where the browser's globals are.
                const {document} = /** @type {any} */ (globalThis);
                return document.documentElement.scrollWidth;
              });
              if (width > PHONE.width)
                problems.push(`${id} (${pointer}): ${width} px wide`);
            } catch (error) {
              problems.push(
                `${id} (${pointer}): did not render: ${errors[0] ?? /** @type {Error} */ (error).message}`,
              );
            } finally {
              await page.close();
            }
          }
        } finally {
          await context.close();
        }
      }
      expect(problems).toEqual([]);
    }, 900_000);
  },
);
