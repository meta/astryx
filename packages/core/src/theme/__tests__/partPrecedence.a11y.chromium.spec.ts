// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file partPrecedence.a11y.chromium.spec.ts
 * @input The PartPrecedence Storybook story: a plain Text, a Timestamp and a
 *   Timer with each caller prop, under themes with no, a base, type-keyed or
 *   one-key `text` entries, each without `timestamp` and `timer` entries and
 *   with them at the root, in an adaptation and on a dark media surface, and
 *   each with and without a `toggle-button` entry
 * @output Real-Chromium evidence that a part entry on another element, which
 *   turns the theme's sub-layers on, changes nothing a plain Text, a Timestamp
 *   or a Timer draws, for every caller prop
 * @position Browser evidence for parts on another component's element
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-themes-partprecedence--cases';
const ROWS = ['none', 'base', 'keyed', 'onekey'] as const;
const PROPS: Record<string, {color?: string; size?: string}> = {
  none: {},
  accent: {color: 'accent'},
  secondary: {color: 'secondary'},
  sm: {size: 'sm'},
  lg: {size: 'lg'},
};
const PLACES = ['none', 'root', 'adaptation', 'ondark'] as const;

interface Drawn {
  color: string;
  fontSize: string;
}

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function openStory(page: Page): Promise<void> {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page
    .locator('[data-theme-case="onekey-ondark-layered"] .astryx-timer')
    .first()
    .waitFor();
}

/** What each case's element draws under one theme. */
async function drawn(page: Page, id: string): Promise<Record<string, Drawn>> {
  return page.locator(`[data-theme-case="${id}"]`).evaluate(root => {
    const selectors: Record<string, string> = {
      text: '.astryx-text',
      timestamp: '.astryx-timestamp',
      timer: '.astryx-timer',
    };
    const out: Record<string, {color: string; fontSize: string}> = {};
    for (const box of root.querySelectorAll('[data-case]')) {
      const id = box.getAttribute('data-case') ?? '';
      const selector = selectors[id.split('-')[0]];
      const element = box.querySelector(selector);
      if (!element) {
        throw new Error(`no ${selector} in ${id}`);
      }
      const style = getComputedStyle(element);
      out[id] = {color: style.color, fontSize: style.fontSize};
    }
    return out;
  });
}

test.describe('a part entry on another element, against Text, Timestamp and Timer', () => {
  for (const row of ROWS) {
    for (const place of PLACES) {
      test(`changes nothing with ${row} text entries and timestamp and timer entries ${place === 'none' ? 'absent' : place === 'ondark' ? 'on a dark surface' : `in the theme's ${place}`}`, async ({
        page,
      }) => {
        await openStory(page);
        const single = await drawn(page, `${row}-${place}`);
        const layered = await drawn(page, `${row}-${place}-layered`);
        const wrong: string[] = [];
        for (const [id, look] of Object.entries(single)) {
          for (const property of ['color', 'fontSize'] as const) {
            if (layered[id][property] !== look[property]) {
              wrong.push(
                `${id} ${property}: ${layered[id][property]}, expected ${look[property]}`,
              );
            }
          }
        }
        expect(Object.keys(single)).toHaveLength(3 * Object.keys(PROPS).length);
        expect(wrong).toEqual([]);
      });
    }
  }
});
