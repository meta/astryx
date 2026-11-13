// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderHandleOptions.interaction.browser.spec.ts
 * @input The built List "Reorder Handle Options" story with its
 *   `isAlwaysVisible` and `placement` args, with a mouse and in the touch
 *   phone context
 * @output Browser proofs of createReorderable's `handle` option in List. A
 *   handle that always shows sits in its row, at the edge `placement` names,
 *   and a row that stays put keeps the handles' room, so every label starts
 *   in one column. One that shows on hover or focus is hidden at rest, shows
 *   when its row is hovered, and hangs outside the row's content, so the
 *   labels keep their places. Under a finger it always shows, in its row
 * @position Interaction evidence for List/ListReorderHandle.tsx, ListItem's
 *   handle placement and List's room for hanging handles
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-list--reorder-handle-options';
const ROW = '#storybook-root li:not([data-astryx-leaving])';
const MOVABLE = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam'];

type RowGeometry = {
  label: string;
  labelLeft: number;
  labelRight: number;
  rowLeft: number;
  rowRight: number;
  handle: {left: number; right: number; opacity: number} | null;
};

type Geometry = {rows: RowGeometry[]};

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(rowSelector => {
    const rows = Array.from(document.querySelectorAll(rowSelector));
    return {
      rows: rows.map(row => {
        const text = (row.textContent ?? '').trim();
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        let labelBox: DOMRect | null = null;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if ((node.textContent ?? '').trim() !== '') {
            const range = document.createRange();
            range.selectNodeContents(node);
            labelBox = range.getBoundingClientRect();
            break;
          }
        }
        const handle = row.querySelector('button[data-astryx-list-reorder]');
        const handleBox = handle?.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        return {
          label: text,
          labelLeft: labelBox?.left ?? Number.NaN,
          labelRight: labelBox?.right ?? Number.NaN,
          rowLeft: rowBox.left,
          rowRight: rowBox.right,
          handle:
            handle == null || handleBox == null
              ? null
              : {
                  left: handleBox.left,
                  right: handleBox.right,
                  opacity: Number(getComputedStyle(handle).opacity),
                },
        };
      }),
    };
  }, ROW);
}

async function openOptions(
  page: Page,
  origin: string,
  isAlwaysVisible: boolean,
  placement: 'start' | 'end',
) {
  await openStory(page, origin, STORY, {
    isAlwaysVisible: `!${isAlwaysVisible}`,
    placement,
  });
  await page
    .locator(`${ROW} button[data-astryx-list-reorder]`)
    .first()
    .waitFor();
  await page.mouse.move(1, 1);
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('by default the handle always shows in its row, and a row that stays put keeps its room', async ({
    page,
  }) => {
    await openOptions(page, storybook(), true, 'start');
    const {rows} = await geometry(page);
    const detail = JSON.stringify(rows);
    expect(
      rows.filter(row => row.handle != null),
      detail,
    ).toHaveLength(MOVABLE.length);
    for (const row of rows) {
      if (row.handle != null) {
        expect(row.handle.opacity, detail).toBe(1);
        // Inside the row, before its label.
        expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.rowLeft);
        expect(row.handle.right, detail).toBeLessThanOrEqual(
          row.labelLeft + 0.5,
        );
      }
    }
    // Trash has no handle, and its label lines up with the others.
    expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
  });

  test('at the end, a handle that always shows ends its row, inside it', async ({
    page,
  }) => {
    await openOptions(page, storybook(), true, 'end');
    const {rows} = await geometry(page);
    const detail = JSON.stringify(rows);
    for (const row of rows) {
      if (row.handle != null) {
        expect(row.handle.opacity, detail).toBe(1);
        expect(row.handle.right, detail).toBeLessThanOrEqual(
          row.rowRight + 0.5,
        );
        expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.labelRight);
      }
    }
    expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
  });

  for (const placement of ['start', 'end'] as const) {
    test(`at the ${placement}, a handle that shows on hover is hidden at rest and hangs outside the row when its row is hovered`, async ({
      page,
    }) => {
      await openOptions(page, storybook(), false, placement);
      const rest = await geometry(page);
      const detail = JSON.stringify(rest.rows);
      for (const row of rest.rows) {
        if (row.handle != null) {
          expect(row.handle.opacity, detail).toBe(0);
        }
      }
      // The labels keep their places: one column, the handles taking none.
      expect(spread(rest.rows.map(row => row.labelLeft)), detail).toBeLessThan(
        1,
      );
      const sent = page.locator(ROW).filter({hasText: 'Sent'}).first();
      await sent.hover();
      await expect
        .poll(async () => {
          const {rows} = await geometry(page);
          return rows.find(row => row.label === 'Sent')?.handle?.opacity;
        })
        .toBe(1);
      const hovered = (await geometry(page)).rows.find(
        row => row.label === 'Sent',
      );
      const box = hovered?.handle;
      if (hovered == null || box == null) {
        throw new Error('no handle on Sent');
      }
      if (placement === 'start') {
        expect(box.left, JSON.stringify(hovered)).toBeLessThan(hovered.rowLeft);
        expect(box.right, JSON.stringify(hovered)).toBeLessThanOrEqual(
          hovered.labelLeft,
        );
      } else {
        expect(box.right, JSON.stringify(hovered)).toBeGreaterThan(
          hovered.rowRight,
        );
      }
    });
  }
});

test.describe('the target', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the handle is its 16 px grip, and a mouse hits it anywhere in the 24 px square round the grip (WCAG 2.5.8)', async ({
    page,
  }) => {
    await openOptions(page, storybook(), true, 'start');
    const handle = page.getByRole('button', {
      name: 'Reorder Sent',
      exact: true,
    });
    const box = await handle.boundingBox();
    if (box == null) {
      throw new Error('no handle');
    }
    expect(box.width).toBeCloseTo(16, 0);
    expect(box.height).toBeCloseTo(16, 0);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Whether each point lands on this handle.
    const lands = async (points: [number, number][]) =>
      handle.evaluate(
        (element, at) =>
          at.map(
            ([px, py]) =>
              document
                .elementFromPoint(px, py)
                ?.closest('button[data-astryx-list-reorder]') === element,
          ),
        points,
      );
    expect(
      await lands([
        [cx - 11.5, cy],
        [cx + 11.5, cy],
        [cx, cy - 11.5],
        [cx, cy + 11.5],
        [cx - 11.5, cy - 11.5],
        [cx + 11.5, cy + 11.5],
      ]),
    ).toEqual(Array(6).fill(true));
    // Just past the target, the row's own content.
    expect(await lands([[cx + 12.5, cy]])).toEqual([false]);
  });
});

test.describe('with a finger', () => {
  test('a handle that shows on hover always shows on a touch screen, inside its row', async ({
    page,
  }) => {
    await openOptions(page, storybook(), false, 'start');
    const {rows} = await geometry(page);
    const detail = JSON.stringify(rows);
    for (const row of rows) {
      if (row.handle != null) {
        expect(row.handle.opacity, detail).toBe(1);
        expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.rowLeft);
      }
    }
    expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
  });
});
