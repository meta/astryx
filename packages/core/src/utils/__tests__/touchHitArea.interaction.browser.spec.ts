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
    // A finger on the band reads the pressed control at the tap's click. The
    // scroll above can move the button out of view, so bring it back first.
    await page.evaluate(() => window.scrollTo(0, 0));
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

  for (const order of [
    'the second over the first',
    'the first over the second',
  ]) {
    test(`in the empty gap between two loose 24 px buttons, a tap goes to the nearer box, ${order}`, async ({
      page,
    }) => {
      await openStory(page, storybook(), STORY);
      if (order === 'the first over the second') {
        // The first button paints over the second, so its band is on top.
        await page
          .locator('#storybook-root')
          .getByTestId('cut')
          .evaluate(element => {
            (element as HTMLElement).style.zIndex = '1';
          });
      }
      const cut = await boxOf(page, 'cut');
      const copy = await boxOf(page, 'copy');
      expect(copy.left - cut.right).toBeCloseTo(4, 0);
      const y = Math.round((cut.top + cut.bottom) / 2);
      const output = page.locator(
        '#storybook-root output[aria-label="Reach taps"]',
      );
      const driver = await touchDriver(page);
      // 1 px past Cut's edge, in the gap: Cut's box is nearer.
      await tapAt(driver, {x: Math.round(cut.right + 1), y});
      await expect(output).toHaveText('Lone 0, Link 0, Cut 1, Copy 0');
      // 1 px before Copy's edge, in the gap: Copy's box is nearer.
      await tapAt(driver, {x: Math.round(copy.left - 1), y});
      await expect(output).toHaveText('Lone 0, Link 0, Cut 1, Copy 1');
    });
  }

  test('a tap 1 px before a button 4 px after a small Switch presses the button; a tap on the Switch’s own box turns it on', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const sync = root.getByRole('switch', {name: 'Sync'});
    const output = root.locator('output[aria-label="Sync taps"]');
    // The visible switch: the box the grown input sits in.
    const track = await sync.evaluate(element => {
      const r = element.parentElement!.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom};
    });
    const next = await boxOf(page, 'next');
    expect(next.left - track.right).toBeCloseTo(4, 0);
    const y = Math.round((next.top + next.bottom) / 2);
    const driver = await touchDriver(page);
    await tapAt(driver, {x: Math.round(next.left - 1), y});
    await expect(output).toHaveText('Next 1, Sync off');
    await tapAt(driver, {
      x: Math.round((track.left + track.right) / 2),
      y: Math.round((track.top + track.bottom) / 2),
    });
    await expect(output).toHaveText('Next 1, Sync on');
  });

  test('a tap on the visible part of an absolutely positioned button that reaches past its parent presses that button, under a neighbour’s band', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const output = root.locator('output[aria-label="Overhang taps"]');
    const pin = await boxOf(page, 'pin');
    const mark = await boxOf(page, 'mark');
    const parent = await root.getByTestId('pin').evaluate(element => {
      const r = element.parentElement!.getBoundingClientRect();
      return {left: r.left, right: r.right};
    });
    // Pin reaches 20 px past its parent; Mark paints over it, and Mark's
    // band lies over the end of that part, nearer Mark than Pin's parent.
    expect(pin.right - parent.right).toBeCloseTo(20, 0);
    expect(mark.left - pin.right).toBeLessThan(10);
    const y = Math.round((pin.top + pin.bottom) / 2);
    const driver = await touchDriver(page);
    await tapAt(driver, {x: Math.round(pin.right - 2), y});
    await expect(output).toHaveText('Pin 1, Mark 0');
  });

  test('a tap on a text field’s edge under a neighbour’s band focuses the field, and the neighbour gets no click', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const field = root.getByRole('textbox', {name: 'Search'});
    const output = root.locator('output[aria-label="Field taps"]');
    // The field's frame: the box around its text entry.
    const edge = await field.evaluate(element => {
      const r = element.parentElement!.getBoundingClientRect();
      return {right: r.right, top: r.top, bottom: r.bottom};
    });
    const go = await boxOf(page, 'go');
    // Go's band lies over the frame's last pixels.
    expect(go.left - edge.right).toBeLessThan(8);
    const driver = await touchDriver(page);
    await tapAt(driver, {
      x: Math.floor(edge.right) - 2,
      y: Math.round((edge.top + edge.bottom) / 2),
    });
    await expect(field).toBeFocused();
    await expect(output).toHaveText(
      'Go 0, Clear 0, Agree off, Apply 0, Pick none',
    );
  });

  test('a tap 1 to 5 px inside a native date field’s edge under a neighbour’s band focuses the date field and asks for its picker, and the neighbour gets no click', async ({
    page,
  }) => {
    // Counts the picker requests; the headless browser draws no picker.
    await page.addInitScript(() => {
      const calls = {count: 0};
      Object.defineProperty(window, '__pickerCalls', {value: calls});
      const original = HTMLInputElement.prototype.showPicker;
      HTMLInputElement.prototype.showPicker = function () {
        calls.count += 1;
        try {
          original.call(this);
        } catch {
          // No picker in a headless browser.
        }
      };
    });
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const entry = root.locator('input[type="date"]');
    const output = root.locator('output[aria-label="Field taps"]');
    // The field's frame: the box around the slot that holds the entry.
    const frame = await entry.evaluate(element => {
      const r = element.parentElement!.parentElement!.getBoundingClientRect();
      return {right: r.right, top: r.top, bottom: r.bottom};
    });
    const apply = await boxOf(page, 'apply');
    // Apply's band lies over the frame's last pixels.
    expect(apply.left - frame.right).toBeLessThan(10);
    const y = Math.round((frame.top + frame.bottom) / 2);
    const driver = await touchDriver(page);
    for (const inset of [1, 3, 5]) {
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await tapAt(driver, {x: Math.floor(frame.right) - inset, y});
      await expect(entry, `${inset} px inside`).toBeFocused();
    }
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__pickerCalls: {count: number}}).__pickerCalls
            .count,
      ),
    ).toBe(3);
    await expect(output).toContainText('Apply 0');
  });

  test('a tap on a field’s status message under a neighbour’s band presses the neighbour and leaves the field unfocused', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const field = root.getByRole('textbox', {name: 'Email'});
    const message = root.getByText('Enter an email');
    const output = root.locator('output[aria-label="Status taps"]');
    const at = await message.evaluate(element => {
      const r = element.getBoundingClientRect();
      return {right: r.right, top: r.top, bottom: r.bottom};
    });
    const check = await boxOf(page, 'check');
    const frame = await field.evaluate(element => {
      const r = element.parentElement!.getBoundingClientRect();
      return {right: r.right};
    });
    // Check's band reaches back past the frame's edge, over the space where
    // the message sits.
    const x = Math.max(Math.round(at.right) - 1, Math.round(frame.right) + 1);
    expect(check.left - x).toBeLessThan(10);
    const driver = await touchDriver(page);
    await tapAt(driver, {x, y: Math.round((at.top + at.bottom) / 2)});
    await expect(output).toHaveText('Check 1');
    await expect(field).not.toBeFocused();
  });

  test('a tap on a checkbox’s edge under a neighbour’s band toggles it once, and the neighbour gets no click', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    const root = page.locator('#storybook-root');
    const box = await root
      .getByRole('checkbox', {name: 'Agree'})
      .evaluate(element => {
        const r = element.getBoundingClientRect();
        return {right: r.right, top: r.top, bottom: r.bottom};
      });
    const output = root.locator('output[aria-label="Field taps"]');
    const driver = await touchDriver(page);
    await tapAt(driver, {
      x: Math.floor(box.right) - 1,
      y: Math.round((box.top + box.bottom) / 2),
    });
    await expect(output).toHaveText(
      'Go 0, Clear 0, Agree on, Apply 0, Pick none',
    );
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
