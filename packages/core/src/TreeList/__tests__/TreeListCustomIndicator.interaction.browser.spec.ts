// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListCustomIndicator.interaction.browser.spec.ts
 * @input The built TreeList custom-indicator stories and the Fully Expanded
 *   story in a real browser, at the default and a doubled root font size
 * @output Proof that a renderExpandIcon result renders in the default
 *   Chevron's box: 1em artwork fills it, a larger Icon never widens the
 *   column, and the label keeps the default gap
 * @position Layout evidence for TreeList's custom indicator geometry
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

interface Row {
  box: {left: number; right: number; width: number; height: number};
  glyph: {left: number; right: number; width: number; height: number} | null;
  labelGap: number;
}

async function openStory(page: Page, id: string, rootSize: string) {
  const params = new URLSearchParams({id, viewMode: 'story'});
  await page.goto(`${storybook.origin}/iframe.html?${params}`);
  await page.locator('.astryx-tree-list').waitFor();
  await page.evaluate(size => {
    document.documentElement.style.fontSize = size;
  }, rootSize);
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Each row's indicator box, the artwork in it, and the gap to the label. */
async function measureRows(page: Page): Promise<Row[]> {
  return page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {left: r.left, right: r.right, width: r.width, height: r.height};
    };
    return Array.from(
      document.querySelectorAll<HTMLElement>('.astryx-tree-list-item'),
    ).flatMap(row => {
      const toggle = row.querySelector('.astryx-tree-list-chevron');
      const box =
        row.querySelector('span[aria-hidden="true"][inert]') ??
        toggle?.firstElementChild ??
        null;
      const label = row.querySelector('.astryx-tree-list-item-label');
      if (box == null || label == null) {
        return [];
      }
      const glyph = box.querySelector('svg');
      return [
        {
          box: rect(box),
          glyph: glyph == null ? null : rect(glyph),
          labelGap: label.getBoundingClientRect().left - rect(box).right,
        },
      ];
    });
  });
}

for (const rootSize of ['100%', '200%']) {
  test.describe(`at a ${rootSize} root font size`, () => {
    test('1em artwork fills the default Chevron box, and the label keeps its gap', async ({
      page,
    }) => {
      await openStory(page, 'core-treelist--fully-expanded', rootSize);
      const [defaultRow] = await measureRows(page);
      expect(defaultRow).toBeDefined();

      await openStory(page, 'core-treelist--custom-expand-icons', rootSize);
      const rows = await measureRows(page);
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(row.box.width).toBeCloseTo(defaultRow.box.width, 0);
        expect(row.glyph).not.toBeNull();
        expect(row.glyph!.width).toBeCloseTo(row.box.width, 0);
        expect(row.glyph!.height).toBeCloseTo(row.box.height, 0);
        expect(row.labelGap).toBeCloseTo(defaultRow.labelGap, 0);
      }
    });

    test('a larger, unsized Icon never widens the column', async ({page}) => {
      await openStory(page, 'core-treelist--fully-expanded', rootSize);
      const [defaultRow] = await measureRows(page);

      await openStory(
        page,
        'core-treelist--custom-expand-icon-unsized',
        rootSize,
      );
      const rows = await measureRows(page);
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(row.box.width).toBeCloseTo(defaultRow.box.width, 0);
        expect(row.labelGap).toBeCloseTo(defaultRow.labelGap, 0);
      }
    });
  });
}
