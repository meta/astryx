// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every ready page template, rendered and shown in Chromium in a 390 px
 * window with no JavaScript, fits the window: the page has no horizontal
 * overflow. With no scripts the page keeps its desktop type and control
 * sizes, so this measures layout at phone width, not a phone's larger touch
 * text. Pages copied from a template keep its layout, so an
 * overflowing template makes overflowing pages. CI runs it in
 * node-browser-contracts' "Render template phone browser case" step.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  readyPageTemplates,
  scaffoldAndRender,
} from '../../test-utils/render-template-slices.mjs';

// The case runs only in node-browser-contracts' "Render template phone
// browser case" step, after the Chromium install; the Node shards list it as
// skipped.
const BROWSER_STEP = process.env.ASTRYX_RENDER_TEMPLATE_PHONE_BROWSER === '1';
const {chromium} = createRequire(import.meta.url)('playwright');

/** A phone-width window: the width a template must fit without sideways scroll. */
const PHONE = {width: 390, height: 844};

/**
 * Templates that overflow a phone screen today, each with the reason. Each one
 * switches to its phone layout only after its scripts run, so the page a
 * reader first sees, and the page with no JavaScript, is the desktop layout
 * at phone width. The list only shrinks: a listed template that fits fails
 * this case until it leaves the list, and a template outside it that
 * overflows fails it too.
 */
const KNOWN_OVERFLOW = {
  'dashboard-alert-rail':
    'the alert rail sits beside the content until a media query folds it under',
  'dashboard-scorecard':
    'the commentary rail sits beside the charts until a media query folds it under',
  'table-inbox':
    'the reading pane sits beside the list until a media query turns it into a sheet',
  'table-tree':
    'the repository header row keeps its desktop actions until a media query trims them',
  'work-item-detail':
    'the property rail sits beside the main column until a media query folds it under',
};

describe.runIf(BROWSER_STEP)(
  'every ready page template at a phone screen',
  () => {
    /** @type {string} */
    let home;
    /** @type {any} */
    let browser;
    /** @type {string[]} */
    let ready = [];

    beforeAll(async () => {
      home = makeLinkedFixture('astryx-render-templates-phone-', [
        '@astryxdesign',
        '@stylexjs',
        '@heroicons',
        'lucide-react',
        'react',
        'react-dom',
        'recharts',
      ]);
      ready = await readyPageTemplates(home);
      const failed = await scaffoldAndRender(home, ready);
      if (failed.length)
        throw new Error(`Templates did not render:\n${failed.join('\n')}`);
      const executablePath = chromium.executablePath();
      if (!fs.existsSync(executablePath))
        throw new Error(
          `Playwright's Chromium is not installed at ${executablePath}: run npx playwright install chromium`,
        );
      browser = await chromium.launch();
    }, 900_000);

    afterAll(async () => {
      await browser?.close();
      if (home) removeLinkedFixture(home);
    });

    it('has no horizontal overflow at 390 px, except the listed templates, which still overflow', async () => {
      /** @type {Record<string, number>} */
      const widths = {};
      for (const id of ready) {
        const page = await browser.newPage({
          viewport: PHONE,
          javaScriptEnabled: false,
        });
        // A rendered page carries its files inline. Anything it fetches from
        // the network (a web font, a remote demo image) is left out, so the
        // measure does not wait on the network or change with it.
        await page.route('**/*', (/** @type {any} */ route) =>
          route.request().url().startsWith('file:')
            ? route.continue()
            : route.abort(),
        );
        try {
          await page.goto(
            pathToFileURL(path.join(home, 'templates', id, 'page.html')).href,
            {
              waitUntil: 'domcontentloaded',
            },
          );
          widths[id] = await page.evaluate(() => {
            // This runs in the page, where the browser's globals are.
            const {document} = /** @type {any} */ (globalThis);
            return document.documentElement.scrollWidth;
          });
        } finally {
          await page.close();
        }
      }
      const overflowing = Object.entries(widths)
        .filter(([, width]) => width > PHONE.width)
        .map(([id, width]) => `${id}: ${width} px wide`);
      const newlyOverflowing = overflowing.filter(
        line => !(line.split(':')[0] in KNOWN_OVERFLOW),
      );
      const nowFitting = Object.keys(KNOWN_OVERFLOW)
        .filter(id => id in widths && widths[id] <= PHONE.width)
        .map(id => `${id} fits now: remove it from KNOWN_OVERFLOW`);
      const gone = Object.keys(KNOWN_OVERFLOW)
        .filter(id => !(id in widths))
        .map(
          id =>
            `${id} is no longer a ready page template: remove it from KNOWN_OVERFLOW`,
        );
      expect([...newlyOverflowing, ...nowFitting, ...gone]).toEqual([]);
    }, 300_000);
  },
);
