// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file partPrecedence.a11y.chromium.spec.ts
 * @input The PartPrecedence Storybook story: a plain Text, a Timestamp and a
 *   Timer with each caller prop, under themes with no, a base, type-keyed or
 *   one-key `text` entries, each without `timestamp` and `timer` entries and
 *   with them at the root, in an adaptation and on a dark media surface
 * @output Real-Chromium evidence that a part on Text's element changes only
 *   what its caller left unset: a plain Text draws the same with or without
 *   the part entries, and a color or size the caller passes to a Timestamp or
 *   a Timer draws as it would with no part entry
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
const LIGHT_PARTS = {
  timestamp: {color: 'rgb(176, 0, 0)', fontSize: '20px'},
  timer: {color: 'rgb(128, 0, 128)', fontSize: '21px'},
};
const DARK_PARTS = {
  timestamp: {color: 'rgb(255, 176, 176)', fontSize: '20px'},
  timer: {color: 'rgb(255, 176, 255)', fontSize: '21px'},
};
/** Where the part entries sit, the theme case without them, and what they draw. */
const PLACES = {
  root: {baseline: '', parts: LIGHT_PARTS},
  adaptation: {baseline: '', parts: LIGHT_PARTS},
  ondark: {baseline: '-surface', parts: DARK_PARTS},
};

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
    .locator('[data-theme-case="onekey-ondark"] .astryx-timer')
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

test.describe("a part on Text's element, against Text's entries and props", () => {
  for (const row of ROWS) {
    for (const [place, {baseline, parts}] of Object.entries(PLACES)) {
      test(`with ${row} text entries and part entries ${place === 'ondark' ? 'on a dark surface' : `in the theme's ${place}`}`, async ({
        page,
      }) => {
        await openStory(page);
        const without = await drawn(page, `${row}${baseline}`);
        const withParts = await drawn(page, `${row}-${place}`);
        const wrong: string[] = [];
        const check = (id: string, property: keyof Drawn, expected: string) => {
          const got = withParts[id][property];
          if (got !== expected) {
            wrong.push(`${id} ${property}: ${got}, expected ${expected}`);
          }
        };
        for (const [prop, props] of Object.entries(PROPS)) {
          // A plain Text: the part entries change nothing.
          check(`text-${prop}`, 'color', without[`text-${prop}`].color);
          check(`text-${prop}`, 'fontSize', without[`text-${prop}`].fontSize);
          for (const [part, look] of Object.entries(parts)) {
            const id = `${part}-${prop}`;
            // A color the caller sets draws as with no part entry; the parts'
            // default color is no choice of the caller's.
            const colorSet = props.color != null && props.color !== 'secondary';
            check(id, 'color', colorSet ? without[id].color : look.color);
            check(
              id,
              'fontSize',
              props.size != null ? without[id].fontSize : look.fontSize,
            );
          }
        }
        expect(wrong).toEqual([]);
      });
    }
  }
});
