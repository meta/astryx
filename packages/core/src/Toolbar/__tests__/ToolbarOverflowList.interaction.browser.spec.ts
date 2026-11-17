// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToolbarOverflowList.interaction.browser.spec.ts
 * @input The built Toolbar overflow-actions, nested-actions and table-filter
 *   template stories, and the OverflowList content-sized story, at set widths
 * @output Real-browser evidence that an OverflowList that is the start lane's
 *   own child folds beside the end lane with its trigger whole, down to 320 px;
 *   that a list nested deeper and the table-filter template keep their width;
 *   and that a list in a content-sized parent, or with one item, keeps the
 *   width of its items
 * @position Browser proof of Toolbar FR2's two-slot lanes with an OverflowList
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

test.use({viewport: {width: 1400, height: 900}});

async function openStory(page: Page, id: string, frame: string) {
  await page.goto(`${storybook.origin}/iframe.html?id=${id}&viewMode=story`);
  await page.locator(`[data-testid="${frame}"] [role="toolbar"]`).waitFor();
}

interface Row {
  /** Visible list labels, the trigger included. */
  labels: string[];
  /** Hidden measure copy's item count (the indicator excluded). */
  itemCount: number;
  /** The start lane's content reaches into the end lane. */
  overlaps: boolean;
  /** The end lane reaches past the frame's end edge. */
  endOutside: boolean;
  /** The list clips part of its last visible child. */
  clipsTrigger: boolean;
  startFlexBasis: string;
}

/** Sets the frame's width and reads the toolbar row after the list settles. */
async function rowAt(page: Page, frame: string, width: number): Promise<Row> {
  await page.evaluate(
    ([testId, w]) => {
      const box = document.querySelector<HTMLElement>(
        `[data-testid="${testId}"]`,
      );
      if (box == null) {
        throw new Error(`No frame ${testId}`);
      }
      box.style.width = `${w}px`;
    },
    [frame, width] as const,
  );
  // Two frames: the resize observer delivers, then the folded set renders.
  await page.evaluate(async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
  return page.evaluate(testId => {
    const toolbar = document.querySelector<HTMLElement>(
      `[data-testid="${testId}"] [role="toolbar"]`,
    );
    const list = toolbar?.querySelector<HTMLElement>('.astryx-overflow-list');
    if (toolbar == null || list == null) {
      throw new Error('No toolbar list');
    }
    // The toolbar's own children are its lanes.
    const lanes = [...toolbar.children].filter(
      (lane): lane is HTMLElement =>
        lane instanceof HTMLElement && lane.getBoundingClientRect().width > 0,
    );
    const start = lanes.find(lane => lane.contains(list));
    if (start == null) {
      throw new Error('No start lane');
    }
    // A toolbar with only a start lane has nothing to overlap.
    const end = lanes.find(lane => lane !== start);
    const listRect = list.getBoundingClientRect();
    // The start lane's own children, the list clamped to its clip.
    const startRight = Math.max(
      ...[...start.children]
        .filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            !child.hasAttribute('inert') &&
            child.getBoundingClientRect().width > 0,
        )
        .map(child => child.getBoundingClientRect().right),
    );
    const endRect = end?.getBoundingClientRect();
    // Edge compensation lets a lane reach into the toolbar's padding by
    // design, so the frame's edge is the limit.
    const frameRect = document
      .querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
      .getBoundingClientRect();
    const last = list.lastElementChild?.getBoundingClientRect();
    const measure = list.previousElementSibling as HTMLElement | null;
    const measured = measure?.children.length ?? 0;
    const hasMeasuredIndicator =
      measure?.lastElementChild?.tagName === 'DIV' &&
      !(measure.lastElementChild as HTMLElement).matches('button');
    return {
      labels: [...list.children].map(child =>
        (child as HTMLElement).innerText.trim(),
      ),
      itemCount: hasMeasuredIndicator ? measured - 1 : measured,
      overlaps: endRect != null && startRight > endRect.left + 0.5,
      endOutside: endRect != null && endRect.right > frameRect.right + 0.5,
      clipsTrigger: last != null && last.right > listRect.right + 0.5,
      startFlexBasis: getComputedStyle(start).flexBasis,
    };
  }, frame);
}

const BROKEN = (row: Row) => row.overlaps || row.endOutside || row.clipsTrigger;

test.describe("a start lane's own OverflowList", () => {
  test('folds beside the end lane at 380 px with its trigger whole (#8804)', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    const row = await rowAt(page, 'overflow-actions-frame', 380);
    test
      .info()
      .annotations.push({type: 'row-380', description: JSON.stringify(row)});
    expect(row.labels.at(-1)).toMatch(/^\+\d+$/);
    expect(row.labels.length).toBeLessThan(row.itemCount);
    expect(row.endOutside).toBe(false);
    expect(row.overlaps).toBe(false);
    expect(row.clipsTrigger).toBe(false);
  });

  test('keeps the lanes apart at 320 px, the smallest supported width', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    expect(BROKEN(await rowAt(page, 'overflow-actions-frame', 320))).toBe(
      false,
    );
  });

  test('shows every action and no trigger when the row has room', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    const row = await rowAt(page, 'overflow-actions-frame', 900);
    expect(row.labels).toHaveLength(row.itemCount);
    expect(BROKEN(row)).toBe(false);
  });

  test('unfolds again when the row widens after a fold', async ({page}) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    const narrow = await rowAt(page, 'overflow-actions-frame', 320);
    expect(narrow.labels.at(-1)).toMatch(/^\+\d+$/);
    await expect
      .poll(
        async () => (await rowAt(page, 'overflow-actions-frame', 900)).labels,
      )
      .toHaveLength(narrow.itemCount);
  });

  test('reports the width where the lanes first meet', async ({page}) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    let firstBroken: number | null = null;
    for (let width = 400; width >= 160; width -= 2) {
      if (BROKEN(await rowAt(page, 'overflow-actions-frame', width))) {
        firstBroken = width;
        break;
      }
    }
    test.info().annotations.push({
      type: 'first-broken-width',
      description: String(firstBroken),
    });
    expect(firstBroken ?? 0).toBeLessThan(320);
  });
});

test.describe('two lists in one row', () => {
  /** Each list's visible labels, and whether it clips its last child. */
  async function lists(page: Page) {
    return page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="two-lists-frame"] .astryx-overflow-list',
        ),
      ].map(list => {
        const last = list.lastElementChild?.getBoundingClientRect();
        return {
          labels: [...list.children]
            .map(child => (child as HTMLElement).innerText.trim())
            .join(' '),
          clips:
            last != null &&
            last.right > list.getBoundingClientRect().right + 0.5,
        };
      }),
    );
  }

  for (const width of [380, 530, 900]) {
    test(`settle without clipping or flicker at ${width} px`, async ({
      page,
    }) => {
      await openStory(
        page,
        'core-toolbar--two-overflow-lists',
        'two-lists-frame',
      );
      await rowAt(page, 'two-lists-frame', 320);
      await rowAt(page, 'two-lists-frame', width);
      // Let any measuring cycle run, then sample several frames.
      await page.waitForTimeout(300);
      const samples = [];
      for (let frame = 0; frame < 6; frame += 1) {
        samples.push(await lists(page));
        await page.evaluate(
          async () =>
            new Promise<void>(resolve => {
              requestAnimationFrame(() => {
                resolve();
              });
            }),
        );
      }
      test.info().annotations.push({
        type: `two-lists-${width}`,
        description: JSON.stringify(samples[0]),
      });
      for (const sample of samples) {
        expect(sample).toEqual(samples[0]);
        expect(sample.map(list => list.clips)).toEqual([false, false]);
      }
    });
  }
});

test.describe('a list that is not the lane’s own child', () => {
  test('a nested list keeps its lane at content width with every action shown', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--nested-overflow-actions',
      'nested-overflow-frame',
    );
    const row = await rowAt(page, 'nested-overflow-frame', 1280);
    expect(row.startFlexBasis).toBe('auto');
    expect(row.labels).toHaveLength(row.itemCount);
  });

  test('the table filter template shows every clause at 1280 px', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--table-filter-template',
      'table-filter-frame',
    );
    const row = await rowAt(page, 'table-filter-frame', 1280);
    // Its list is not the lane's own child, so the lane rule does not apply
    // and every clause shows at desktop width, as on main.
    test.info().annotations.push({
      type: 'template-clauses-1280',
      description: `${row.labels.length} of ${row.itemCount}: ${row.labels.join(', ')}`,
    });
    expect(row.labels).toHaveLength(row.itemCount);
  });

  test('reports the width where the table filter template lanes first meet', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--table-filter-template',
      'table-filter-frame',
    );
    let firstBroken: number | null = null;
    for (let width = 600; width >= 200; width -= 4) {
      const row = await rowAt(page, 'table-filter-frame', width);
      if (row.overlaps || row.endOutside) {
        firstBroken = width;
        break;
      }
    }
    test.info().annotations.push({
      type: 'first-broken-width',
      description: String(firstBroken),
    });
    expect(firstBroken ?? 0).toBeLessThan(320);
  });
});

test.describe('a list outside a toolbar', () => {
  test('keeps the width of its items in a content-sized parent, and with one item', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--content-sized-parent&viewMode=story`,
    );
    await page
      .locator('[data-testid="one-item"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const sizes = await page.evaluate(() => {
      const read = (testId: string) => {
        const list = document.querySelector<HTMLElement>(
          `[data-testid="${testId}"] .astryx-overflow-list`,
        );
        if (list == null) {
          throw new Error(`No list in ${testId}`);
        }
        const children = [...list.children] as HTMLElement[];
        const first = children[0].getBoundingClientRect();
        const last = children[children.length - 1].getBoundingClientRect();
        return {
          width: list.getBoundingClientRect().width,
          span: last.right - first.left,
          labels: children.map(child => child.innerText.trim()),
        };
      };
      return {contentSized: read('content-sized'), oneItem: read('one-item')};
    });
    expect(sizes.contentSized.labels).toHaveLength(6);
    expect(sizes.contentSized.width).toBeCloseTo(sizes.contentSized.span, 0);
    expect(sizes.oneItem.labels).toEqual(['Go']);
    expect(sizes.oneItem.width).toBeCloseTo(sizes.oneItem.span, 0);
  });
});
