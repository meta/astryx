// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The page templates people share as a file read correctly with no
 * script. Each one is rendered to static HTML with `astryx experimental
 * render`, the form a shared page takes, and shown in Chromium with
 * JavaScript off at a phone's and a desktop's width. On that first paint:
 *
 * - the page is no wider than the screen;
 * - no side region sits beside the page's sections on a phone, squeezing
 *   them into a narrow column;
 * - every in-page link points at a section the page has;
 * - no copy button shows, since copying needs script.
 *
 * CI runs it in node-browser-contracts' "Template no-script first paint
 * browser case" step, after the Chromium install.
 */

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../packages/cli/test-utils/linked-fixture.mjs';
import {scaffoldAndRender} from '../../packages/cli/test-utils/render-template-slices.mjs';

const BROWSER_STEP = process.env.ASTRYX_TEMPLATE_NOSCRIPT_BROWSER === '1';
const {chromium} = createRequire(import.meta.url)('playwright');

/**
 * The content templates build starts for a page someone writes once and sends
 * to others: an article, a documentation landing or reference, and a record's
 * detail page.
 */
const SHARED_TEMPLATES = [
  'documentation-technical',
  'documentation',
  'documentation-design',
  'detail-page',
  'work-item-detail',
];

/** A phone and a desktop, in CSS pixels. */
const WIDTHS = [
  {name: 'phone', width: 390, height: 844},
  {name: 'desktop', width: 1280, height: 900},
];

describe.runIf(BROWSER_STEP)('shared page templates with no script', () => {
  /** @type {string} */
  let home;
  /** @type {any} */
  let browser;

  beforeAll(async () => {
    home = makeLinkedFixture('astryx-template-noscript-', [
      '@astryxdesign',
      '@stylexjs',
      '@heroicons',
      'lucide-react',
      'react',
      'react-dom',
      'recharts',
    ]);
    const failed = await scaffoldAndRender(home, SHARED_TEMPLATES);
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

  it.each(SHARED_TEMPLATES)(
    '%s reads correctly on its first paint',
    async id => {
      /** @type {string[]} */
      const problems = [];
      for (const size of WIDTHS) {
        const page = await browser.newPage({
          viewport: {width: size.width, height: size.height},
          javaScriptEnabled: false,
        });
        // A shared file carries its own styles; nothing it fetches counts.
        await page.route('**/*', (/** @type {any} */ route) =>
          route.request().url().startsWith('file:')
            ? route.continue()
            : route.abort(),
        );
        try {
          await page.goto(
            pathToFileURL(path.join(home, 'templates', id, 'page.html')).href,
            {waitUntil: 'domcontentloaded'},
          );
          const found = await page.evaluate(() => {
            // This runs in the page, where the browser's globals are.
            const {document} = /** @type {any} */ (globalThis);
            const root = document.documentElement;
            const box = (/** @type {any} */ e) => e.getBoundingClientRect();
            // A side region beside the sections: its column and theirs do
            // not overlap. Stacked above or below them, the columns overlap.
            const besides = (/** @type {any} */ a, /** @type {any} */ b) =>
              a.right <= b.left || b.right <= a.left;
            const headings = [...document.querySelectorAll('h2')].map(box);
            const regions = [
              ...document.querySelectorAll('[role="complementary"], aside'),
            ]
              .map(box)
              .filter((/** @type {any} */ r) => r.width > 0 && r.height > 0);
            const brokenLinks = [...document.querySelectorAll('a[href^="#"]')]
              .map((/** @type {any} */ a) => a.getAttribute('href').slice(1))
              .filter(
                (/** @type {string} */ target) =>
                  target && !document.getElementById(target),
              );
            const copyButtons = [...document.querySelectorAll('button')].filter(
              (/** @type {any} */ b) =>
                /^copy\b/i.test(
                  (b.getAttribute('aria-label') || b.textContent || '').trim(),
                ),
            ).length;
            return {
              width: root.scrollWidth,
              screen: root.clientWidth,
              sideBySide: regions.some((/** @type {any} */ r) =>
                headings.some((/** @type {any} */ h) => besides(r, h)),
              ),
              brokenLinks,
              copyButtons,
            };
          });
          if (found.width > found.screen)
            problems.push(`${size.name}: ${found.width} px wide`);
          if (size.name === 'phone' && found.sideBySide)
            problems.push(
              `${size.name}: a side region sits beside the sections`,
            );
          for (const target of found.brokenLinks)
            problems.push(`${size.name}: link to #${target} has no section`);
          if (found.copyButtons > 0)
            problems.push(
              `${size.name}: ${found.copyButtons} copy button(s) that need script`,
            );
        } finally {
          await page.close();
        }
      }
      expect(problems).toEqual([]);
    },
    300_000,
  );
});
