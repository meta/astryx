// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Badge core/Token core/InputGroup core/Field core/FieldStatus ^packages/core/src/utils/textDirection

/**
 * @file MixedDirectionText.a11y.chromium.spec.ts
 * @input The `Core/InputGroup`, `Core/Badge`, `Core/Token` and `Core/Field`
 *   Mixed Direction stories in a built Storybook, in Chromium, with the page's direction set
 *   to RTL and to LTR through the Storybook direction global.
 * @output Real-layout proof that caller text in an InputGroupText, a Badge
 *   label, a Token label, and a Field's label, description and status message
 *   keep a readable character order
 *   (design:bidirectionality DR2): a URL scheme, a domain suffix, a count and
 *   a handle read in the order they were written under both directions, and
 *   right-to-left text that starts with a Latin word still lays out in the
 *   page's direction. The order is read from each character's rendered
 *   position, not from the DOM, because the DOM order never changes.
 * @position Run with `pnpm test:a11y-contract`. Visual character order needs
 *   a real layout engine; jsdom has none.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/** Text with no strong character of its own, in story order. */
const WEAK_TEXTS = ['https://', '.com', '+3', '@alice'];

/** Right-to-left text with a Latin run, in story order after WEAK_TEXTS. */
const MIXED_TEXTS = [
  {text: 'iPhone \u062c\u062f\u064a\u062f', latin: 'iPhone'},
  {text: 'example.com \u0645\u0648\u0642\u0639', latin: 'example.com'},
];

const SURFACES = [
  {
    name: 'InputGroupText',
    story: 'core-inputgroup--mixed-direction',
    selector: '.astryx-input-group-text',
  },
  {
    name: 'Badge',
    story: 'core-badge--mixed-direction',
    selector: '.astryx-badge',
  },
  {
    name: 'Token',
    story: 'core-token--mixed-direction',
    selector: '.astryx-token',
  },
  {
    name: 'Field label',
    story: 'core-field--mixed-direction',
    selector: 'label[for^="mixed-"]',
  },
  {
    name: 'Field description',
    story: 'core-field--mixed-direction',
    selector: '[id^="mixed-"][id$="-desc"]',
  },
  {
    name: 'Field status',
    story: 'core-field--mixed-direction',
    selector: '[id^="mixed-"][id$="-status"]',
  },
] as const;

type Surface = (typeof SURFACES)[number];

async function open(page: Page, story: string, direction: 'ltr' | 'rtl') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${direction}`,
  );
  // The direction global sets `dir` on the story wrapper, not on <html>.
  await page.waitForFunction(
    dir =>
      document.querySelector('#storybook-root [dir]')?.getAttribute('dir') ===
      dir,
    direction,
  );
  await page.evaluate(async () => document.fonts.ready);
}

type Glyph = {ch: string; x: number};

/**
 * The characters of the surface's nth text, each with its rendered left
 * edge, in DOM order.
 */
async function glyphs(
  page: Page,
  surface: Surface,
  index: number,
): Promise<Glyph[]> {
  return page.evaluate(
    ({name, selector, nth}) => {
      const root = document.getElementById('storybook-root');
      const host = root?.querySelectorAll(selector)[nth];
      if (host == null) {
        throw new Error(`no ${name} at ${nth}`);
      }
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
        acceptNode: node =>
          (node.textContent ?? '').trim() === ''
            ? NodeFilter.FILTER_SKIP
            : NodeFilter.FILTER_ACCEPT,
      });
      const node = walker.nextNode() as Text | null;
      if (node == null) {
        throw new Error(`no text in ${name} at ${nth}`);
      }
      const out: {ch: string; x: number}[] = [];
      for (let i = 0; i < node.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        out.push({ch: node.data[i], x: range.getBoundingClientRect().left});
      }
      return out;
    },
    {name: surface.name, selector: surface.selector, nth: index},
  );
}

const leftToRight = (chars: Glyph[]) =>
  [...chars]
    .sort((a, b) => a.x - b.x)
    .map(c => c.ch)
    .join('');

for (const surface of SURFACES) {
  for (const direction of ['rtl', 'ltr'] as const) {
    test(`${surface.name} keeps caller text readable under ${direction.toUpperCase()} (design:bidirectionality DR2)`, async ({
      page,
    }) => {
      await open(page, surface.story, direction);
      const weak: Record<string, string> = {};
      for (const [index, text] of WEAK_TEXTS.entries()) {
        weak[text] = leftToRight(await glyphs(page, surface, index));
      }
      expect(weak).toEqual(Object.fromEntries(WEAK_TEXTS.map(t => [t, t])));

      for (const [offset, {text, latin}] of MIXED_TEXTS.entries()) {
        const chars = await glyphs(page, surface, WEAK_TEXTS.length + offset);
        const latinRun = chars.slice(0, latin.length);
        const firstRtl = chars[latin.length + 1];
        // The Latin run keeps its own order...
        expect(leftToRight(latinRun), text).toBe(latin);
        // ...and sits at the start of the line in the page's direction.
        const latinStart = Math.min(...latinRun.map(c => c.x));
        if (direction === 'rtl') {
          expect(latinStart, text).toBeGreaterThan(firstRtl.x);
        } else {
          expect(latinStart, text).toBeLessThan(firstRtl.x);
        }
      }
    });
  }
}
