// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderHandleOptions.interaction.browser.spec.ts
 * @input The built List "Reorder Handle Options" and "Reorder In Card"
 *   stories, with a mouse and in the touch phone context
 * @output Browser proofs of createReorderable's `handle` option in List. By
 *   default a handle always shows and ends its row, inside it. At the start
 *   it starts its row, and a row that stays put keeps the handles' room, so
 *   every label starts in one column. One that shows on hover or focus is
 *   hidden at rest, shows when its row is hovered, and hangs outside the
 *   row's content, so the labels keep their places. A card never cuts a
 *   hanging handle. After a list marker, and under a finger, it shows in its
 *   row
 * @position Interaction evidence for List/ListReorderHandle.tsx's layout,
 *   ListItem's handle placement and List's room for hanging handles
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

async function geometry(page: Page, rowSelector = ROW): Promise<RowGeometry[]> {
  return page.evaluate(selector => {
    const rows = Array.from(document.querySelectorAll(selector));
    return rows.map(row => {
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
    });
  }, rowSelector);
}

async function openOptions(
  page: Page,
  origin: string,
  visibility: 'always' | 'hover',
  placement: 'start' | 'end',
) {
  await openStory(page, origin, STORY, {visibility, placement});
  await page
    .locator(`${ROW} button[data-astryx-list-reorder]`)
    .first()
    .waitFor();
  await page.mouse.move(1, 1);
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('by default a handle always shows and ends its row, inside it', async ({
    page,
  }) => {
    await openOptions(page, storybook(), 'always', 'end');
    const rows = await geometry(page);
    const detail = JSON.stringify(rows);
    expect(
      rows.filter(row => row.handle != null),
      detail,
    ).toHaveLength(MOVABLE.length);
    for (const row of rows) {
      if (row.handle != null) {
        expect(row.handle.opacity, detail).toBe(1);
        expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.labelRight);
        expect(row.handle.right, detail).toBeLessThanOrEqual(
          row.rowRight + 0.5,
        );
      }
    }
    expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
  });

  test('at the start a handle that always shows starts its row, inside it, and a row that stays put keeps its room', async ({
    page,
  }) => {
    await openOptions(page, storybook(), 'always', 'start');
    const rows = await geometry(page);
    const detail = JSON.stringify(rows);
    for (const row of rows) {
      if (row.handle != null) {
        expect(row.handle.opacity, detail).toBe(1);
        expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.rowLeft);
        expect(row.handle.right, detail).toBeLessThanOrEqual(
          row.labelLeft + 0.5,
        );
      }
    }
    // Trash has no handle, and its label lines up with the others.
    expect(rows.find(row => row.label === 'Trash')?.handle, detail).toBeNull();
    expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
  });

  for (const placement of ['start', 'end'] as const) {
    test(`at the ${placement}, a handle that shows on hover is hidden at rest and hangs outside the row when its row is hovered`, async ({
      page,
    }) => {
      await openOptions(page, storybook(), 'hover', placement);
      const rest = await geometry(page);
      const detail = JSON.stringify(rest);
      for (const row of rest) {
        if (row.handle != null) {
          expect(row.handle.opacity, detail).toBe(0);
        }
      }
      // The labels keep their places: one column, the handles taking none.
      expect(spread(rest.map(row => row.labelLeft)), detail).toBeLessThan(1);
      const sent = page.locator(ROW).filter({hasText: 'Sent'}).first();
      await sent.hover();
      await expect
        .poll(async () => {
          const rows = await geometry(page);
          return rows.find(row => row.label === 'Sent')?.handle?.opacity;
        })
        .toBe(1);
      const hovered = (await geometry(page)).find(row => row.label === 'Sent');
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
      // The pointer reaches the shown handle: nothing covers or cuts it.
      const reached = await page.evaluate(
        ([x, y]) =>
          document
            .elementFromPoint(x, y)
            ?.closest('button[data-astryx-list-reorder]')
            ?.getAttribute('aria-labelledby') != null,
        [
          (box.left + box.right) / 2,
          await sent.evaluate(row => {
            const rect = row.getBoundingClientRect();
            return rect.top + rect.height / 2;
          }),
        ] as [number, number],
      );
      expect(reached, JSON.stringify(hovered)).toBe(true);
    });
  }
});

test.describe('in a card', () => {
  test.use({hasTouch: false, isMobile: false});

  for (const edge of ['padded', 'flush'] as const) {
    test(`under edge "${edge}", a hanging handle stays inside the card`, async ({
      page,
    }) => {
      await openStory(page, storybook(), 'core-list--reorder-in-card');
      const card = page.locator(`[data-edge="${edge}"]`);
      const row = card.locator('li').filter({hasText: 'Sent'}).first();
      await row.hover();
      const handle = card.getByRole('button', {
        name: 'Reorder Sent',
        exact: true,
      });
      await expect
        .poll(async () =>
          handle.evaluate(element => Number(getComputedStyle(element).opacity)),
        )
        .toBe(1);
      const [handleBox, cardBox] = await Promise.all([
        handle.boundingBox(),
        card.boundingBox(),
      ]);
      if (handleBox == null || cardBox == null) {
        throw new Error('no box');
      }
      expect(handleBox.x, JSON.stringify({handleBox, cardBox})).toBeGreaterThan(
        cardBox.x,
      );
      // The handle paints where it stands: no ancestor clips it.
      const reached = await handle.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return (
          document
            .elementFromPoint(rect.left + 1, rect.top + rect.height / 2)
            ?.closest('button') === element
        );
      });
      expect(reached).toBe(true);
    });
  }

  test("a numbered row that stays put keeps the room its neighbours' handles take after the marker, so every label lines up", async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-list--reorder-in-card');
    const card = page.locator('[data-edge="numbered"]');
    const labelLeft = async (label: string) =>
      card
        .getByText(label, {exact: true})
        .evaluate(element => element.getBoundingClientRect().left);
    const [inbox, sent, drafts] = await Promise.all([
      labelLeft('Inbox'),
      labelLeft('Sent'),
      labelLeft('Drafts'),
    ]);
    // Sent stays put and has no handle.
    await expect(card.getByRole('button', {name: 'Reorder Sent'})).toHaveCount(
      0,
    );
    expect(Math.abs(sent - inbox), `${inbox} ${sent}`).toBeLessThan(1);
    expect(Math.abs(drafts - inbox), `${inbox} ${drafts}`).toBeLessThan(1);
  });
});

test.describe('with a finger', () => {
  for (const placement of ['start', 'end'] as const) {
    test(`at the ${placement}, a handle that shows on hover always shows on a touch screen, inside its row`, async ({
      page,
    }) => {
      await openOptions(page, storybook(), 'hover', placement);
      const rows = await geometry(page);
      const detail = JSON.stringify(rows);
      for (const row of rows) {
        if (row.handle != null) {
          expect(row.handle.opacity, detail).toBe(1);
          expect(row.handle.left, detail).toBeGreaterThanOrEqual(row.rowLeft);
          expect(row.handle.right, detail).toBeLessThanOrEqual(
            row.rowRight + 0.5,
          );
        }
      }
      expect(spread(rows.map(row => row.labelLeft)), detail).toBeLessThan(1);
    });
  }
});
