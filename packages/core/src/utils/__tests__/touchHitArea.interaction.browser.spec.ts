// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.interaction.browser.spec.ts
 * @input The built "Touch reach" Button story on a phone-sized touch context,
 *   real touch input, and counters on layout reads and observers
 * @output Browser proofs of the touch band (spec:AST-094 FR42): a 24 px
 *   button takes taps 10 px past its edge and not 11 px; a group's 4 px gap
 *   splits at its middle; a tap on a link right before an InfoTip opens the
 *   link, not the tip; a page reads no layout and starts no observer for
 *   hit areas before a press; and a visible box under the finger wins over a
 *   band: a List row beside a Switch end control, the last row above a
 *   button, and each of two loose buttons 4 px apart take their own taps
 * @position Browser layer of utils/touchHitArea.ts and
 *   internal/touchHitArea.stylex.ts; the unit layer is touchHitArea.test.tsx
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'core-button--touch-reach';

async function tapAt(
  driver: TouchDriver,
  at: {x: number; y: number},
): Promise<void> {
  if (driver.engine === 'webkit') {
    await driver.tap(at);
  } else {
    await driver.play(tap(at, {holdMs: 50}));
  }
}

async function boxOf(page: Page, testId: string) {
  return page
    .locator('#storybook-root')
    .getByTestId(testId)
    .evaluate(element => {
      const r = element.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    });
}

/** The test id of the button a tap at (x, y) lands on, or null. */
async function buttonAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest('button')?.dataset.testid ??
      null,
    [x, y] as const,
  );
}

test.describe('the touch band (spec:AST-094 FR42), under a finger', () => {
  test('a 24 px button takes taps 10 px past its edge, 44 px in all, and not 11 px', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const lone = await boxOf(page, 'lone');
    expect(lone.bottom - lone.top).toBeCloseTo(24, 0);
    const x = (lone.left + lone.right) / 2;
    // Hit tests at whole pixels: the story places the button on them.
    expect(await buttonAt(page, x, lone.top - 10)).toBe('lone');
    expect(await buttonAt(page, x, lone.top - 11)).toBeNull();
    expect(await buttonAt(page, x, lone.bottom + 9)).toBe('lone');
    expect(await buttonAt(page, x, lone.bottom + 11)).toBeNull();
    expect(await buttonAt(page, lone.left - 10, lone.top + 12)).toBe('lone');
    // A real finger 9 px above the edge presses it.
    const driver = await touchDriver(page);
    await tapAt(driver, {x: Math.round(x), y: Math.round(lone.top) - 9});
    await expect(
      page.locator('#storybook-root output[aria-label="Reach taps"]'),
    ).toHaveText('Lone 1, Link 0, Cut 0, Copy 0');
  });

  test('a group’s 4 px gap splits at its middle', async ({page}) => {
    await openStory(page, storybook(), STORY);
    const bold = await boxOf(page, 'bold');
    const italic = await boxOf(page, 'italic');
    const gap = italic.left - bold.right;
    expect(gap).toBeCloseTo(4, 0);
    // Small toggles grow sideways only up to half the gap toward each other.
    expect(bold.right - bold.left).toBeLessThan(44);
    const y = (bold.top + bold.bottom) / 2;
    expect(await buttonAt(page, bold.right + 1, y)).toBe('bold');
    expect(await buttonAt(page, italic.left - 1, y)).toBe('italic');
  });

  test('a tap on a link right before an InfoTip opens the link, not the tip', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const link = page.locator('#storybook-root').getByRole('link');
    const tip = page
      .locator('#storybook-root')
      .getByRole('button', {name: 'Pricing help'});
    const linkBox = await link.boundingBox();
    if (linkBox == null) {
      throw new Error('the link has no box');
    }
    const driver = await touchDriver(page);
    // The link's last letter, beside the tip.
    await tapAt(driver, {
      x: Math.floor(linkBox.x + linkBox.width - 2),
      y: Math.round(linkBox.y + linkBox.height / 2),
    });
    await expect(
      page.locator('#storybook-root output[aria-label="Reach taps"]'),
    ).toHaveText('Lone 0, Link 1, Cut 0, Copy 0');
    await expect(tip).toHaveAttribute('aria-expanded', 'false');
  });

  test('reads no layout and starts no observer for hit areas before a press', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const counts = {reads: 0, observers: 0};
      Object.defineProperty(window, '__hitAreaCounts', {value: counts});
      const isHitArea = () =>
        (new Error().stack ?? '').includes('touchHitArea');
      const read = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (isHitArea()) {
          counts.reads += 1;
        }
        return read.call(this);
      };
      for (const name of [
        'MutationObserver',
        'ResizeObserver',
        'IntersectionObserver',
      ] as const) {
        const Original = window[name] as unknown as new (
          ...args: never[]
        ) => object;
        Object.defineProperty(window, name, {
          configurable: true,
          value: class extends Original {
            constructor(...args: never[]) {
              super(...args);
              if (isHitArea()) {
                counts.observers += 1;
              }
            }
          },
        });
      }
    });
    await openStory(page, storybook(), STORY);
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.evaluate(
      async () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(
      await page.evaluate(
        () => (window as unknown as {__hitAreaCounts: object}).__hitAreaCounts,
      ),
    ).toEqual({reads: 0, observers: 0});
    // A finger on the band reads the pressed control at the tap's click.
    const lone = await boxOf(page, 'lone');
    const driver = await touchDriver(page);
    await tapAt(driver, {
      x: Math.round((lone.left + lone.right) / 2),
      y: Math.round(lone.top) - 6,
    });
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as {__hitAreaCounts: {reads: number}})
              .__hitAreaCounts.reads,
        ),
      )
      .toBeGreaterThan(0);
  });

  test.describe('a visible box under the finger wins; the band only claims empty space', () => {
    /** Counts clicks on the List row whose text starts with `name`. */
    async function countRowClicks(page: Page, name: string) {
      await page.evaluate(rowName => {
        const counts = {row: 0, other: 0};
        Object.defineProperty(window, '__rowClicks', {value: counts});
        const row = [...document.querySelectorAll('#storybook-root li')].find(
          li => (li.textContent ?? '').trim().startsWith(rowName),
        );
        document.addEventListener(
          'click',
          event => {
            if (row != null && row.contains(event.target as Node)) {
              counts.row += 1;
            } else {
              counts.other += 1;
            }
          },
          true,
        );
      }, name);
    }
    const rowClicks = async (page: Page) =>
      page.evaluate(
        () =>
          (window as unknown as {__rowClicks: {row: number; other: number}})
            .__rowClicks,
      );

    test('a tap 3 px into the row above a Switch end control activates that row, and the switch keeps its state', async ({
      page,
    }) => {
      await openStory(page, storybook(), 'core-list--with-end-controls');
      const root = page.locator('#storybook-root');
      const control = root.getByRole('switch').first();
      const wasOn = await control.isChecked();
      const box = await control.evaluate(element => {
        const r = element.closest('li')!.getBoundingClientRect();
        const s = element.getBoundingClientRect();
        return {rowTop: r.top, x: (s.left + s.right) / 2};
      });
      await countRowClicks(page, 'Network');
      const driver = await touchDriver(page);
      await tapAt(driver, {
        x: Math.round(box.x),
        y: Math.round(box.rowTop - 3),
      });
      await expect.poll(async () => (await rowClicks(page)).row).toBe(1);
      expect((await rowClicks(page)).other).toBe(0);
      expect(await control.isChecked()).toBe(wasOn);
    });

    test('a tap 1 px into the last row, over the band of a button 4 px under the List, activates the row', async ({
      page,
    }) => {
      await openStory(page, storybook(), 'core-list--with-end-controls');
      const more = page
        .locator('#storybook-root')
        .getByRole('button', {name: 'Load more', exact: true});
      const at = await more.evaluate(element => {
        const r = element.getBoundingClientRect();
        const rows = document.querySelectorAll('#storybook-root li');
        const last = rows[rows.length - 1].getBoundingClientRect();
        return {
          x: (r.left + r.right) / 2,
          gap: r.top - last.bottom,
          y: last.bottom - 1,
        };
      });
      expect(at.gap).toBeCloseTo(4, 0);
      await countRowClicks(page, 'Bluetooth');
      const driver = await touchDriver(page);
      await tapAt(driver, {x: Math.round(at.x), y: Math.floor(at.y)});
      await expect.poll(async () => (await rowClicks(page)).row).toBe(1);
      expect((await rowClicks(page)).other).toBe(0);
    });

    test('of two loose 24 px buttons 4 px apart, each takes a tap 1 px inside its own edge', async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      const cut = await boxOf(page, 'cut');
      const copy = await boxOf(page, 'copy');
      expect(copy.left - cut.right).toBeCloseTo(4, 0);
      const y = Math.round((cut.top + cut.bottom) / 2);
      const output = page.locator(
        '#storybook-root output[aria-label="Reach taps"]',
      );
      const driver = await touchDriver(page);
      // Copy's band lies over Cut's edge: Cut's visible box wins.
      await tapAt(driver, {x: Math.floor(cut.right - 1), y});
      await expect(output).toHaveText('Lone 0, Link 0, Cut 1, Copy 0');
      await tapAt(driver, {x: Math.ceil(copy.left + 1), y});
      await expect(output).toHaveText('Lone 0, Link 0, Cut 1, Copy 1');
    });
  });

  test('a NavigationStack push reads no layout and writes no hit size on either screen’s rows, through the frames after it lands', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const counts = {reads: 0, writes: 0};
      const atClick = {reads: -1, writes: -1};
      const stacks: string[] = [];
      Object.defineProperty(window, '__pushCounts', {
        value: {counts, atClick, stacks},
      });
      // A frame in the hit area's chunk. The chunk's file name holds
      // "hitArea" (or "HitArea"); this function's own name is not a file.
      const isHitArea = () =>
        /[hH]itArea[^\s/]*\.js/.test(new Error().stack ?? '');
      const read = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        if (isHitArea()) {
          counts.reads += 1;
          stacks.push(new Error().stack ?? '');
        }
        return read.call(this);
      };
      const HIT_VAR = /--(astryx-hit|_hit)-/;
      const setProperty = CSSStyleDeclaration.prototype.setProperty;
      CSSStyleDeclaration.prototype.setProperty = function (
        name: string,
        value: string | null,
        priority?: string,
      ) {
        if (HIT_VAR.test(name)) {
          counts.writes += 1;
        }
        return setProperty.call(this, name, value, priority);
      };
      new MutationObserver(records => {
        for (const record of records) {
          const style = (record.target as Element).getAttribute('style') ?? '';
          if (HIT_VAR.test(style) || HIT_VAR.test(record.oldValue ?? '')) {
            counts.writes += 1;
          }
        }
      }).observe(document, {
        attributes: true,
        attributeFilter: ['style'],
        attributeOldValue: true,
        subtree: true,
      });
      // The tap's own click may read the pressed row once. Count from after
      // every click listener has run.
      window.addEventListener('click', () =>
        setTimeout(() => Object.assign(atClick, counts)),
      );
    });
    await openStory(page, storybook(), 'lab-navigationstack--settings');
    const row = page
      .locator('#storybook-root')
      .getByRole('listitem')
      .filter({hasText: 'General'})
      .first();
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('the row has no box');
    }
    const driver = await touchDriver(page);
    await tapAt(driver, {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
    });
    await expect(
      page.locator('#storybook-root').getByText('Software Update'),
    ).toBeVisible();
    // The push's spring, its promotion, and the frames after it.
    await page.waitForTimeout(1500);
    const {counts, atClick, stacks} = await page.evaluate(
      () =>
        (
          window as unknown as {
            __pushCounts: {
              counts: {reads: number; writes: number};
              atClick: {reads: number; writes: number};
              stacks: string[];
            };
          }
        ).__pushCounts,
    );
    expect(atClick.reads, 'the tap reached a click').toBeGreaterThanOrEqual(0);
    // On failure, the stack of each read after the tap's click.
    expect(counts, stacks.slice(atClick.reads).join('\n---\n')).toEqual(
      atClick,
    );
  });
});
