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
      .querySelector<HTMLElement>(`[data-testid="${testId}"]`)
      ?.getBoundingClientRect();
    if (frameRect == null) {
      throw new Error(`No frame ${testId}`);
    }
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
/** Whether the row shows a "+N" trigger, which the label count includes. */
const SHOWS_TRIGGER = (row: Row) =>
  row.labels.some(label => /^\+\d+$/.test(label));

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

  test('folds before the content beside it in the start lane truncates (#8804, 380 px)', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    await rowAt(page, 'overflow-actions-frame', 380);
    const cut = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>(
        '[data-testid="overflow-actions-frame"] .astryx-overflow-list',
      );
      const lane = list?.parentElement;
      if (list == null || lane == null) {
        throw new Error('missing story parts');
      }
      // Text the lane shows outside the list, cut by its own box.
      return [...lane.querySelectorAll<HTMLElement>('*')]
        .filter(
          element =>
            !list.contains(element) &&
            element.closest('[aria-hidden="true"]') == null &&
            element.scrollWidth > element.clientWidth + 0.5,
        )
        .map(element => element.textContent?.trim() ?? '');
    });
    expect(cut).toEqual([]);
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

  test('holds one fold across frames at 565 px, the edge of its share', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--overflow-actions',
      'overflow-actions-frame',
    );
    await rowAt(page, 'overflow-actions-frame', 565);
    await page.waitForTimeout(300);
    const samples: string[][] = [];
    for (let frame = 0; frame < 10; frame += 1) {
      samples.push((await rowAt(page, 'overflow-actions-frame', 565)).labels);
    }
    test.info().annotations.push({
      type: 'edge-565',
      description: JSON.stringify(samples[0]),
    });
    for (const sample of samples) {
      expect(sample).toEqual(samples[0]);
    }
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
    expect(SHOWS_TRIGGER(row)).toBe(false);
    expect(BROKEN(row)).toBe(false);
  });

  test('keeps the start lane on one line beside a content-width end lane, in a wide theme gap and at a phone width', async ({
    page,
  }) => {
    const cases = [
      {theme: 'y2k', width: 1280},
      {theme: 'matcha', width: 1280},
      {theme: 'neutral', width: 390},
    ];
    const reads: string[] = [];
    for (const {theme, width} of cases) {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-toolbar--overflow-actions&viewMode=story&globals=astryxTheme:${theme}`,
      );
      await page
        .locator('[data-testid="overflow-actions-frame"] [role="toolbar"]')
        .waitFor();
      const row = await rowAt(page, 'overflow-actions-frame', width);
      const lanes = await page.evaluate(() => {
        const toolbar = document.querySelector<HTMLElement>(
          '[data-testid="overflow-actions-frame"] [role="toolbar"]',
        );
        const list = toolbar?.querySelector<HTMLElement>(
          '.astryx-overflow-list',
        );
        const start = [...(toolbar?.children ?? [])].find(lane =>
          lane.contains(list ?? null),
        ) as HTMLElement | undefined;
        const end = [...(toolbar?.children ?? [])].find(
          lane =>
            lane !== start &&
            lane instanceof HTMLElement &&
            lane.getBoundingClientRect().width > 0,
        ) as HTMLElement | undefined;
        if (start == null || end == null || list == null) {
          return null;
        }
        // The badge and the list share one line when their vertical centers
        // match. The hidden measure copy has no height and is left out.
        const centers = [...start.children]
          .filter(
            (child): child is HTMLElement =>
              child instanceof HTMLElement &&
              child.getAttribute('aria-hidden') !== 'true' &&
              child.getBoundingClientRect().height > 0,
          )
          .map(child => {
            const rect = child.getBoundingClientRect();
            return rect.top + rect.height / 2;
          });
        const endContent = [...end.children].reduce(
          (sum, child) => sum + child.getBoundingClientRect().width,
          0,
        );
        return {
          oneLine:
            centers.length > 1 &&
            Math.max(...centers) - Math.min(...centers) < 4,
          endSlack: end.getBoundingClientRect().width - endContent,
        };
      });
      reads.push(
        `${theme} ${width}: ${JSON.stringify({labels: row.labels, lanes})}`,
      );
      expect(lanes, `${theme} ${width}`).not.toBeNull();
      expect(lanes?.oneLine, `${theme} ${width}: one line`).toBe(true);
      // The end lane keeps its content width; the start lane takes the rest.
      expect(lanes?.endSlack ?? 0, `${theme} ${width}: end lane`).toBeLessThan(
        24,
      );
      expect(BROKEN(row), `${theme} ${width}`).toBe(false);
      if (width >= 1280) {
        expect(row.labels, `${theme} ${width}: every action`).toHaveLength(
          row.itemCount,
        );
        expect(SHOWS_TRIGGER(row), `${theme} ${width}: no trigger`).toBe(false);
      }
    }
    test
      .info()
      .annotations.push({type: 'lanes', description: reads.join(' | ')});
  });

  test('a two-lane start lane without a list keeps its content width and its wrap', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-toolbar--two-lane-narrow&viewMode=story`,
    );
    const toolbar = page.locator('#storybook-root [role="toolbar"]').first();
    await toolbar.waitFor();
    const start = await toolbar.evaluate(element => {
      const lane = [...element.children].find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          child.getBoundingClientRect().width > 0,
      );
      if (lane == null) {
        return null;
      }
      const style = getComputedStyle(lane);
      return {
        minWidth: style.minWidth,
        flexWrap: style.flexWrap,
        flexGrow: style.flexGrow,
      };
    });
    expect(start).toEqual({
      minWidth: 'fit-content',
      flexWrap: 'wrap',
      flexGrow: '0',
    });
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
    expect(
      SHOWS_TRIGGER(await rowAt(page, 'overflow-actions-frame', 900)),
    ).toBe(false);
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

  // 597 and 901 px sit at the edge of a list's share, where a rounding
  // mismatch once folded and unfolded it each frame.
  for (const width of [380, 530, 597, 900, 901]) {
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

  test('both fold into their own triggers at 380 px and stay folded', async ({
    page,
  }) => {
    await openStory(
      page,
      'core-toolbar--two-overflow-lists',
      'two-lists-frame',
    );
    const row = await rowAt(page, 'two-lists-frame', 380);
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
      type: 'two-lists-fold-380',
      description: JSON.stringify({row, lists: samples[0]}),
    });
    // The end lane stays inside the toolbar, and each list folds its share.
    expect((await rowAt(page, 'two-lists-frame', 380)).endOutside).toBe(false);
    for (const sample of samples) {
      expect(sample).toEqual(samples[0]);
      for (const list of sample) {
        expect(list.labels).toMatch(/\+\d+$/);
        expect(list.clips).toBe(false);
      }
    }
  });
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
    // No wider than its one item, to the sub-pixel: the floor adds no width.
    expect(sizes.oneItem.width).toBeCloseTo(sizes.oneItem.span, 1);
  });
});

test.describe('a single row’s minimum width', () => {
  /** A list's computed min-width, width, and whether it clips its last child. */
  async function boxOf(page: Page, testId: string, parentWidth: number | null) {
    return page.evaluate(
      async ([id, width]) => {
        const row = document.querySelector<HTMLElement>(
          `[data-testid="${id}"]`,
        );
        const list = row?.querySelector<HTMLElement>('.astryx-overflow-list');
        if (row == null || list == null) {
          throw new Error(`No list in ${id}`);
        }
        if (width != null) {
          row.style.width = `${width}px`;
          row.style.display = 'flex';
        }
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        });
        const children = [...list.children] as HTMLElement[];
        const last = children[children.length - 1].getBoundingClientRect();
        const first = children[0].getBoundingClientRect();
        return {
          minWidth: parseFloat(getComputedStyle(list).minWidth) || 0,
          width: list.getBoundingClientRect().width,
          span: last.right - first.left,
          labels: children.map(child => child.innerText.trim()),
          clips: last.right > list.getBoundingClientRect().right + 0.5,
        };
      },
      [testId, parentWidth] as const,
    );
  }

  test.beforeEach(async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--content-sized-parent&viewMode=story`,
    );
    await page
      .locator('[data-testid="content-sized"] .astryx-overflow-list button')
      .first()
      .waitFor();
  });

  test('in a wide flex row, a list with a set or capped width folds within it and keeps its trigger', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--caller-limited-width&viewMode=story`,
    );
    await page
      .locator('[data-testid="width-capped"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.waitForTimeout(200);
    for (const testId of ['width-set', 'width-capped']) {
      const read = await page.evaluate(id => {
        const list = document.querySelector<HTMLElement>(
          `[data-testid="${id}"] .astryx-overflow-list`,
        );
        if (list == null) {
          throw new Error(`No list in ${id}`);
        }
        const box = list.getBoundingClientRect();
        const buttons = [...list.querySelectorAll('button')].filter(
          button => button.closest('[aria-hidden="true"]') == null,
        );
        return {
          width: box.width,
          labels: buttons.map(button => button.innerText.trim()),
          clipped: buttons.some(
            button => button.getBoundingClientRect().right > box.right + 0.5,
          ),
        };
      }, testId);
      test.info().annotations.push({
        type: testId,
        description: JSON.stringify(read),
      });
      expect(read.width).toBeLessThanOrEqual(200.5);
      // Every visible item keeps its label, the last one is the trigger, and
      // nothing runs past the list's edge.
      expect(read.labels.every(label => label !== '')).toBe(true);
      expect(read.labels.at(-1)).toMatch(/^\+\d+$/);
      expect(read.clipped).toBe(false);
    }
  });

  test('in a row that narrows and widens again, a list folding from the start and one keeping an item unfold', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--row-widens-after-fold&viewMode=story`,
    );
    await page
      .locator('[data-testid="one-kept"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const read = async (width: number) => {
      await page.evaluate(w => {
        const frame = document.querySelector<HTMLElement>(
          '[data-testid="widen-frame"]',
        );
        if (frame != null) {
          frame.style.width = `${w}px`;
        }
      }, width);
      await page.waitForTimeout(300);
      return page.evaluate(() =>
        ['from-start', 'one-kept', 'text-indicator'].map(id =>
          // Nodes, not elements: a plain-text indicator is a text node.
          [
            ...(document.querySelector(
              `[data-testid="${id}"] .astryx-overflow-list`,
            )?.childNodes ?? []),
          ]
            .map(node => (node.textContent ?? '').trim())
            .filter(label => label !== ''),
        ),
      );
    };
    const narrow = await read(140);
    for (const labels of narrow) {
      expect(labels.some(label => /^\+\d+$/.test(label))).toBe(true);
    }
    const wide = await read(900);
    test.info().annotations.push({
      type: 'widen-after-fold',
      description: JSON.stringify({narrow, wide}),
    });
    for (const labels of wide) {
      expect(labels).toHaveLength(10);
    }
  });

  test('a list whose flex basis or width is narrower than its folded width holds that width with its trigger, across frames', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--caller-limited-width&viewMode=story`,
    );
    await page
      .locator('[data-testid="width-narrow"] .astryx-overflow-list > *')
      .first()
      .waitFor();
    await page.waitForTimeout(300);
    for (const testId of ['basis-narrow', 'width-narrow']) {
      const samples: string[][] = [];
      for (let frame = 0; frame < 10; frame += 1) {
        samples.push(
          await page.evaluate(
            id =>
              [
                ...(document.querySelector(
                  `[data-testid="${id}"] .astryx-overflow-list`,
                )?.children ?? []),
              ].map(child => (child as HTMLElement).innerText.trim()),
            testId,
          ),
        );
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
        type: testId,
        description: JSON.stringify(samples[0]),
      });
      for (const sample of samples) {
        expect(sample).toEqual(samples[0]);
      }
      expect(samples[0]).toEqual(['+6']);
    }
  });

  test('a list followed by a button keeps the button whole beside it as the row narrows and widens', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--followed-by-sibling&viewMode=story`,
    );
    await page
      .locator('[data-testid="sibling-frame"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const read = async (width: number) => {
      await page.evaluate(w => {
        const frame = document.querySelector<HTMLElement>(
          '[data-testid="sibling-frame"]',
        );
        if (frame != null) {
          frame.style.width = `${w}px`;
        }
      }, width);
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>(
          '[data-testid="sibling-frame"]',
        );
        const list = frame?.querySelector<HTMLElement>('.astryx-overflow-list');
        const after = [...(frame?.querySelectorAll('button') ?? [])].find(
          button => button.innerText.trim() === 'After',
        );
        if (frame == null || list == null || after == null) {
          throw new Error('missing story parts');
        }
        const listBox = list.getBoundingClientRect();
        const afterBox = after.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        return {
          labels: [...list.children].map(child =>
            (child as HTMLElement).innerText.trim(),
          ),
          listRight: listBox.right,
          afterLeft: afterBox.left,
          afterRight: afterBox.right,
          afterCut: [after, ...after.querySelectorAll<HTMLElement>('*')].some(
            element => element.scrollWidth > element.clientWidth + 0.5,
          ),
          frameRight: frameBox.right,
        };
      });
    };
    const steps = [];
    for (const width of [900, 300, 900]) {
      steps.push(await read(width));
    }
    test.info().annotations.push({
      type: 'sibling',
      description: JSON.stringify(steps),
    });
    const [wide, narrow, wideAgain] = steps;
    expect(wide.labels).toHaveLength(6);
    expect(narrow.labels.at(-1)).toMatch(/^\+\d+$/);
    expect(wideAgain.labels).toHaveLength(6);
    for (const step of steps) {
      expect(step.afterLeft).toBeGreaterThanOrEqual(step.listRight);
      expect(step.afterRight).toBeLessThanOrEqual(step.frameRight);
      // The button's label is whole: the list folds first.
      expect(step.afterCut).toBe(false);
    }
  });

  test('a list in a block parent fills the line, as before', async ({page}) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--followed-by-sibling&viewMode=story`,
    );
    await page
      .locator('[data-testid="block-parent"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.waitForTimeout(300);
    const sizes = await page.evaluate(() => {
      const parent = document.querySelector<HTMLElement>(
        '[data-testid="block-parent"]',
      );
      const list = parent?.querySelector<HTMLElement>('.astryx-overflow-list');
      if (parent == null || list == null) {
        throw new Error('missing story parts');
      }
      return {
        parent: parent.getBoundingClientRect().width,
        list: list.getBoundingClientRect().width,
      };
    });
    expect(sizes.list).toBeCloseTo(sizes.parent, 1);
  });

  test('a list whose parent switches between a flex row and a block follows it', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--followed-by-sibling&viewMode=story`,
    );
    await page
      .locator('[data-testid="sibling-frame"] .astryx-overflow-list button')
      .first()
      .waitFor();
    // A breakpoint: the row is a block at 700 px and a flex row at 900 px.
    const read = async (width: number, display: string) => {
      await page.evaluate(
        ([w, d]) => {
          const frame = document.querySelector<HTMLElement>(
            '[data-testid="sibling-frame"]',
          );
          const row = frame?.querySelector<HTMLElement>(
            '.astryx-overflow-list',
          )?.parentElement;
          if (frame == null || row == null) {
            throw new Error('missing story parts');
          }
          frame.style.width = `${w}px`;
          row.style.display = d;
        },
        [String(width), display] as const,
      );
      await page.waitForTimeout(300);
      return page.evaluate(() => {
        const list = document.querySelector<HTMLElement>(
          '[data-testid="sibling-frame"] .astryx-overflow-list',
        );
        const row = list?.parentElement;
        if (list == null || row == null) {
          throw new Error('missing story parts');
        }
        return {
          list: list.getBoundingClientRect().width,
          row: row.getBoundingClientRect().width,
          labels: [...list.children].map(child =>
            (child as HTMLElement).innerText.trim(),
          ),
        };
      });
    };
    const flex = await read(900, 'flex');
    const block = await read(700, 'block');
    const flexAgain = await read(900, 'flex');
    test.info().annotations.push({
      type: 'display-flip',
      description: JSON.stringify({flex, block, flexAgain}),
    });
    expect(flex.list).toBeLessThan(flex.row - 50);
    expect(block.list).toBeCloseTo(block.row, 1);
    expect(block.labels).toHaveLength(6);
    expect(flexAgain.list).toBeCloseTo(flex.list, 1);
    expect(flexAgain.labels).toHaveLength(6);
  });

  test('a list capped at three items is as wide as those items and its trigger', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--caller-limited-width&viewMode=story`,
    );
    await page
      .locator('[data-testid="count-capped"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.waitForTimeout(300);
    const read = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>(
        '[data-testid="count-capped"] .astryx-overflow-list',
      );
      const last = list?.lastElementChild;
      if (list == null || last == null) {
        throw new Error('missing story parts');
      }
      return {
        labels: [...list.children].map(child =>
          (child as HTMLElement).innerText.trim(),
        ),
        blank:
          list.getBoundingClientRect().right -
          last.getBoundingClientRect().right,
      };
    });
    test.info().annotations.push({
      type: 'count-capped',
      description: JSON.stringify(read),
    });
    expect(read.labels).toEqual(['Save', 'Edit', 'Duplicate', '+3']);
    expect(read.blank).toBeLessThanOrEqual(1);
  });

  test('under an ancestor scaled to one half, a list with room shows every item and one in a 30 px parent keeps its trigger whole', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.waitForTimeout(300);
    const read = await page.evaluate(() =>
      ['scaled-wide', 'scaled-narrow'].map(id => {
        const list = document.querySelector<HTMLElement>(
          `[data-testid="${id}"] .astryx-overflow-list`,
        );
        if (list == null) {
          throw new Error(`No list in ${id}`);
        }
        const lastChild = list.lastElementChild;
        const last = lastChild?.getBoundingClientRect();
        return {
          labels: [...list.children].map(child =>
            (child as HTMLElement).innerText.trim(),
          ),
          // Cut by the list's edge, or its label cut short inside it (more
          // than the pixel that rounding a sub-pixel box can show).
          clipped:
            (last != null &&
              last.right > list.getBoundingClientRect().right + 0.5) ||
            (lastChild != null &&
              [...lastChild.querySelectorAll('*')].some(
                element => element.scrollWidth > element.clientWidth + 1,
              )),
        };
      }),
    );
    test.info().annotations.push({
      type: 'scaled',
      description: JSON.stringify(read),
    });
    const [wide, narrow] = read;
    expect(wide.labels).toHaveLength(6);
    expect(narrow.labels).toEqual(['+6']);
    expect(narrow.clipped).toBe(false);
  });

  test('under an ancestor scaled to one half, a list shows every item at exactly its width, whatever fraction of a pixel that width has', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    // A small letter spacing on every item moves the width of the list and its
    // measure copy through fractions of a pixel, so some widths round down and
    // some round up.
    const style = await page.addStyleTag({content: '/* spacing */'});
    const shown: Record<string, number> = {};
    for (let tenth = 0; tenth < 10; tenth += 1) {
      await style.evaluate((element, spacing) => {
        element.textContent = `[data-testid="scaled-wide"] button { letter-spacing: ${spacing}px; }`;
      }, tenth / 300);
      await page.waitForTimeout(150);
      // The row at exactly the list's unfolded width still fits all six.
      shown[String(tenth)] = await page.evaluate(async () => {
        const row = document.querySelector<HTMLElement>(
          '[data-testid="scaled-wide"]',
        );
        const list = row?.querySelector<HTMLElement>('.astryx-overflow-list');
        if (row == null || list == null) {
          return 0;
        }
        row.style.width = '';
        await new Promise(resolve => setTimeout(resolve, 100));
        row.style.width = getComputedStyle(list).width;
        await new Promise(resolve => setTimeout(resolve, 150));
        const count = list.children.length;
        row.style.width = '';
        return count;
      });
    }
    test.info().annotations.push({
      type: 'scaled-fractions',
      description: JSON.stringify(shown),
    });
    expect(Object.values(shown).every(count => count === 6)).toBe(true);
  });

  test('a list inside a box that scales in from 0.9 shows every item during and after the scale', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const count = async () =>
      page.evaluate(
        () =>
          document.querySelector(
            '[data-testid="scaled-wide"] .astryx-overflow-list',
          )?.children.length ?? 0,
      );
    // A layer that scales in: the list mounts at 0.9, then the scale ends.
    // A transform fires no resize, so the list measures only at 0.9.
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>(
        '[data-testid="scaled-frame"]',
      );
      const row = document.querySelector<HTMLElement>(
        '[data-testid="scaled-wide"]',
      );
      if (frame == null || row == null) {
        throw new Error('missing story parts');
      }
      frame.style.transform = 'scale(0.9)';
      // The row at exactly the list's width resizes, so the list measures
      // again, under the 0.9 scale.
      const list = row.querySelector<HTMLElement>('.astryx-overflow-list');
      if (list != null) {
        row.style.width = getComputedStyle(list).width;
      }
    });
    await page.waitForTimeout(300);
    const during = await count();
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLElement>(
        '[data-testid="scaled-frame"]',
      );
      if (frame != null) {
        frame.style.transform = 'none';
      }
    });
    await page.waitForTimeout(300);
    const after = await count();
    test.info().annotations.push({
      type: 'scale-in',
      description: JSON.stringify({during, after}),
    });
    expect(during).toBe(6);
    expect(after).toBe(6);
  });
  test('a list in a theme whose gap step draws wider than the default publishes a width that holds its drawn gaps', async ({
    page,
  }) => {
    // Matcha draws spacing step 2 at 12 px, where the default table says 8 px.
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story&globals=astryxTheme:matcha`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.addStyleTag({
      content: '[data-testid="scaled-frame"] { transform: none !important; }',
    });
    // A row resize makes the list measure again, now unscaled.
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>(
        '[data-testid="scaled-wide"]',
      );
      if (row != null) {
        row.style.width = '699px';
      }
    });
    await page.waitForTimeout(300);
    const read = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>(
        '[data-testid="scaled-wide"] .astryx-overflow-list',
      );
      if (list == null) {
        return null;
      }
      const items = [...list.children] as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(list).columnGap);
      const itemsWidth = items.reduce(
        (sum, item) => sum + item.getBoundingClientRect().width,
        0,
      );
      // Each item's own width, from a copy sized to its content.
      const short = items.filter(item => {
        const copy = item.cloneNode(true) as HTMLElement;
        copy.style.width = 'max-content';
        copy.style.flex = 'none';
        list.parentElement?.parentElement?.appendChild(copy);
        const own = Number.parseFloat(getComputedStyle(copy).width);
        copy.remove();
        return own - Number.parseFloat(getComputedStyle(item).width) > 0.005;
      }).length;
      return {
        count: items.length,
        gap,
        listWidth: list.getBoundingClientRect().width,
        needed: itemsWidth + gap * Math.max(0, items.length - 1),
        short,
      };
    });
    test.info().annotations.push({
      type: 'matcha-gap',
      description: JSON.stringify(read),
    });
    expect(read).not.toBeNull();
    expect(read?.gap).toBe(12);
    expect(read?.count).toBe(6);
    expect(read?.short).toBe(0);
    expect(read?.listWidth ?? 0).toBeGreaterThanOrEqual(
      (read?.needed ?? 0) - 0.01,
    );
  });
  test('a list under a scale never narrows an item below its text, across fractional item widths', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const style = await page.addStyleTag({content: '/* sweep */'});
    const misses: string[] = [];
    for (const scale of [0.5, 0.9]) {
      for (let step = 0; step <= 20; step += 1) {
        const spacing = step / 100;
        await style.evaluate(
          (element, [value, factor]) => {
            element.textContent = `[data-testid="scaled-frame"] button { letter-spacing: ${value}px; } [data-testid="scaled-frame"] { transform: scale(${factor}) !important; }`;
          },
          [spacing, scale],
        );
        // A row resize makes the list measure again, under the scale.
        await page.evaluate(() => {
          const row = document.querySelector<HTMLElement>(
            '[data-testid="scaled-wide"]',
          );
          if (row != null) {
            row.style.width = row.style.width === '699px' ? '700px' : '699px';
          }
        });
        await page.waitForTimeout(120);
        const read = await page.evaluate(() => {
          const list = document.querySelector<HTMLElement>(
            '[data-testid="scaled-wide"] .astryx-overflow-list',
          );
          const host = document.querySelector<HTMLElement>(
            '[data-testid="scaled-frame"]',
          )?.parentElement;
          if (list == null || host == null) {
            return {count: 0, short: ['missing story parts']};
          }
          const items = [...list.children] as HTMLElement[];
          // Each item's own width: a copy outside the scaled box, sized to
          // its content.
          const short = items.flatMap(item => {
            const copy = item.cloneNode(true) as HTMLElement;
            copy.style.width = 'max-content';
            copy.style.flex = 'none';
            copy.style.maxWidth = 'none';
            copy.style.letterSpacing = getComputedStyle(
              item.querySelector('*') ?? item,
            ).letterSpacing;
            host.appendChild(copy);
            const own = Number.parseFloat(getComputedStyle(copy).width);
            copy.remove();
            const shown = Number.parseFloat(getComputedStyle(item).width);
            return own - shown > 0.005
              ? [`${item.textContent} ${(own - shown).toFixed(4)} px short`]
              : [];
          });
          return {count: items.length, short};
        });
        if (read.count !== 6 || read.short.length > 0) {
          misses.push(
            `scale ${scale}, ${spacing} px: ${read.count} items; ${read.short.join(', ')}`,
          );
        }
      }
    }
    test.info().annotations.push({
      type: 'scaled-sweep',
      description: misses.slice(0, 6).join(' | '),
    });
    expect(misses).toEqual([]);
  });
  test('a list that measures in the last frame of a scale-in, at 0.9995, publishes the width it has unscaled', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--scaled-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="scaled-wide"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const read = await page.evaluate(async () => {
      const frame = document.querySelector<HTMLElement>(
        '[data-testid="scaled-frame"]',
      );
      const row = document.querySelector<HTMLElement>(
        '[data-testid="scaled-wide"]',
      );
      const list = row?.querySelector<HTMLElement>('.astryx-overflow-list');
      if (frame == null || row == null || list == null) {
        throw new Error('missing story parts');
      }
      const settle = async () =>
        new Promise(resolve => {
          setTimeout(resolve, 300);
        });
      frame.style.transform = 'none';
      row.style.width = '';
      await settle();
      const unscaled = Number.parseFloat(getComputedStyle(list).width);
      // The row resizes in the scale-in's last frame, so the list measures
      // under it. A transform alone fires no resize.
      frame.style.transform = 'scale(0.9995)';
      row.style.width = '699px';
      await settle();
      const during = {
        width: Number.parseFloat(getComputedStyle(list).width),
        count: list.children.length,
      };
      frame.style.transform = 'none';
      await settle();
      return {unscaled, during, after: list.children.length};
    });
    test.info().annotations.push({
      type: 'scale-in-0.9995',
      description: JSON.stringify(read),
    });
    // A width measured under the scale and not converted runs short by the
    // scale's fraction (about 0.2 px here), and the list folds once a resize
    // rounds past it. Firefox's layout units leave a few hundredths.
    expect(Math.abs(read.during.width - read.unscaled)).toBeLessThanOrEqual(
      0.05,
    );
    expect(read.during.count).toBe(6);
    expect(read.after).toBe(6);
  });

  test('a list wider than 1000 px holds its width across frames, whatever fraction of a pixel that width has', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--wide-row&viewMode=story`,
    );
    await page
      .locator('[data-testid="wide-row"] .astryx-overflow-list button')
      .first()
      .waitFor();
    const style = await page.addStyleTag({content: '/* spacing */'});
    const changes: Record<string, number> = {};
    for (let step = 0; step < 12; step += 1) {
      await style.evaluate((element, spacing) => {
        element.textContent = `[data-testid="wide-row"] button { letter-spacing: ${spacing}px; }`;
      }, step / 40);
      await page.waitForTimeout(250);
      // Count changes to the list's own attributes over half a second: a list
      // that re-measures every frame republishes its sizes each time.
      changes[String(step)] = await page.evaluate(
        async () =>
          new Promise<number>(resolve => {
            const list = document.querySelector<HTMLElement>(
              '[data-testid="wide-row"] .astryx-overflow-list',
            );
            if (list == null) {
              resolve(-1);
              return;
            }
            let count = 0;
            const observer = new MutationObserver(records => {
              count += records.length;
            });
            observer.observe(list, {attributes: true});
            setTimeout(() => {
              observer.disconnect();
              resolve(count);
            }, 500);
          }),
      );
    }
    const width = await page.evaluate(
      () =>
        document
          .querySelector<HTMLElement>(
            '[data-testid="wide-row"] .astryx-overflow-list',
          )
          ?.getBoundingClientRect().width ?? 0,
    );
    test.info().annotations.push({
      type: 'wide-row',
      description: JSON.stringify({width, changes}),
    });
    expect(width).toBeGreaterThan(1000);
    expect(Object.values(changes).every(count => count === 0)).toBe(true);
  });

  test('a list capped with calc() holds one fold across frames', async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-overflowlist--caller-limited-width&viewMode=story`,
    );
    await page
      .locator('[data-testid="width-calc"] .astryx-overflow-list button')
      .first()
      .waitFor();
    await page.waitForTimeout(300);
    const samples: string[][] = [];
    for (let frame = 0; frame < 12; frame += 1) {
      samples.push(
        await page.evaluate(() =>
          [
            ...(document.querySelector(
              '[data-testid="width-calc"] .astryx-overflow-list',
            )?.children ?? []),
          ].map(child => (child as HTMLElement).innerText.trim()),
        ),
      );
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
      type: 'calc-cap',
      description: JSON.stringify(samples[0]),
    });
    for (const sample of samples) {
      expect(sample).toEqual(samples[0]);
    }
    expect(samples[0].at(-1)).toMatch(/^\+\d+$/);
  });

  test('in a parent narrower than its folded width, keeps the indicator whole', async ({
    page,
  }) => {
    const box = await boxOf(page, 'content-sized', 30);
    test.info().annotations.push({
      type: 'narrow-parent',
      description: JSON.stringify(box),
    });
    expect(box.labels.at(-1)).toMatch(/^\+\d+$/);
    expect(box.clips).toBe(false);
    // The floor is the folded width: the indicator alone.
    expect(box.minWidth).toBeCloseTo(Math.ceil(box.span), 0);
    expect(box.width).toBeGreaterThan(30);
  });

  test('with room, the floor is no wider than the unfolded items', async ({
    page,
  }) => {
    const box = await boxOf(page, 'one-item', null);
    test.info().annotations.push({
      type: 'one-item-floor',
      description: JSON.stringify(box),
    });
    expect(box.labels).toEqual(['Go']);
    expect(box.minWidth).toBeLessThanOrEqual(box.span + 0.05);
    expect(box.width).toBeCloseTo(box.span, 1);
  });
});
