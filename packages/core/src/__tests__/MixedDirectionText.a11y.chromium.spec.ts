// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MixedDirectionText.a11y.chromium.spec.ts
 * @input The `Core/InputGroup` With Prefix, `Core/Badge` Default and
 *   `Core/Token` Default stories in a built Storybook, in Chromium, with the
 *   page's direction set to RTL and to LTR through the Storybook direction
 *   global.
 * @output Real-layout proof that caller text in an InputGroupText, a Badge
 *   label and a Token label keeps its character order under RTL: a URL
 *   scheme, a domain suffix, a count, a handle and a tag read in the order
 *   they were written, and under LTR nothing changes (design:bidirectionality
 *   DR2). The order is read from each character's rendered position, not
 *   from the DOM, because the DOM order never changes.
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

/** Caller text whose weak and neutral characters RTL inference reorders. */
const TEXTS = ['https://', '.com', '+3', '@alice'];

const SURFACES = [
  {name: 'InputGroupText', story: 'core-inputgroup--with-prefix'},
  {name: 'Badge', story: 'core-badge--default'},
  {name: 'Token', story: 'core-token--default'},
] as const;

type SurfaceName = (typeof SURFACES)[number]['name'];

async function open(page: Page, story: string, direction: 'ltr' | 'rtl') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${story}&viewMode=story&globals=direction:${direction}`,
  );
  await page.waitForFunction(
    dir => document.documentElement.getAttribute('dir') === dir,
    direction,
  );
  await page.evaluate(async () => document.fonts.ready);
}

/**
 * Put `text` in the surface's text element and read its characters left to
 * right by their rendered positions.
 */
async function visualOrder(
  page: Page,
  surface: SurfaceName,
  text: string,
): Promise<string> {
  return page.evaluate(
    ({name, value}) => {
      const root = document.getElementById('storybook-root');
      // The element that holds the caller's text in each component.
      let element: Element | null | undefined;
      if (name === 'InputGroupText') {
        element = root?.querySelector('.astryx-input-group-text');
      } else if (name === 'Badge') {
        element = root?.querySelector('.astryx-badge')?.lastElementChild;
      } else {
        element = [
          ...(root?.querySelector('.astryx-token')?.querySelectorAll('span') ??
            []),
        ].find(
          span =>
            span.children.length === 0 &&
            (span.textContent ?? '').trim() !== '',
        );
      }
      if (element == null) {
        throw new Error(`no text element in ${name}`);
      }
      element.textContent = value;
      const node = element.firstChild as Text;
      const chars: {ch: string; x: number}[] = [];
      for (let i = 0; i < node.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        chars.push({ch: node.data[i], x: range.getBoundingClientRect().left});
      }
      return chars
        .sort((a, b) => a.x - b.x)
        .map(c => c.ch)
        .join('');
    },
    {name: surface, value: text},
  );
}

for (const surface of SURFACES) {
  for (const direction of ['rtl', 'ltr'] as const) {
    test(`${surface.name} keeps caller text in its written order under ${direction.toUpperCase()} (design:bidirectionality DR2)`, async ({
      page,
    }) => {
      await open(page, surface.story, direction);
      const seen: Record<string, string> = {};
      for (const text of TEXTS) {
        seen[text] = await visualOrder(page, surface.name, text);
      }
      expect(seen).toEqual(Object.fromEntries(TEXTS.map(t => [t, t])));
    });
  }
}
