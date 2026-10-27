// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorderMode.interaction.browser.spec.ts
 * @input The built List "Reorderable" and "Reorder From Your UI" stories,
 *   with a mouse and in the touch phone context, and the interaction
 *   harness's touch driver
 * @output Browser proofs of reorder mode and its hint (spec:AST-103 FR4,
 *   FR4a), in each engine: a mouse click on a handle turns the mode on and
 *   shows the hint's moves and Done, with the focus on the handle and no drop
 *   announced; Space or Enter turns it on, each arrow commits a move at once
 *   with the focus on the handle, and Escape ends it keeping the moves,
 *   announcing where the row is; an Escape with the focus in the hint ends
 *   the mode too, and the focus goes back to the handle; start(key) from a
 *   button or a context menu enters the same mode with the focus on the
 *   handle; under a finger, taps alone reorder (the handle, the moves, then
 *   Done), a drag leaves the mode off, and each of the hint's buttons is a
 *   44 px target centered on what it shows, none covering its neighbour
 * @position Interaction evidence for List/listReorderEngine.tsx (reorder
 *   mode and its hint) and List/ListReorderHandle.tsx
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  drag,
  openStory,
  tap,
  touchDriver,
  withStorybook,
  type Point,
} from '@astryxdesign/interaction-harness';
import {reorder} from '../../motion/uikit/reorder';

const storybook = withStorybook(test);

const STORY = 'core-list--reorderable';
const START_STORY = 'core-list--reorder-from-your-ui';
const ROWS = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash'];
const HOLD_MS = reorder.claim.delayMs + 80;

/**
 * The list's rows, without the reorder's insertion line and drag preview:
 * inert, aria-hidden ghosts of the list (`data-astryx-leaving`).
 */
const ROW = '#storybook-root li:not([data-astryx-leaving])';

const row = (page: Page, label: string) =>
  page.locator(ROW).filter({hasText: label}).first();

const handle = (page: Page, label: string) =>
  page.getByRole('button', {name: `Reorder ${label}`, exact: true});

const labels = async (page: Page) =>
  page
    .locator(ROW)
    .evaluateAll(rows => rows.map(element => element.textContent ?? ''));

const translateY = async (element: Locator) =>
  element.evaluate(el => {
    const value = getComputedStyle(el).translate;
    if (value === 'none' || value === '') {
      return 0;
    }
    const [, y = '0px'] = value.split(' ');
    return Number.parseFloat(y);
  });

/** Everything the page's live regions say right now. */
const announced = async (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[aria-live], [role="status"]'))
      .map(element => element.textContent ?? '')
      .join(' '),
  );

async function centerOf(element: Locator): Promise<Point> {
  const box = await element.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

test.describe('with a mouse', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });

  /** This context's primary pointer is fine: a case here is a mouse's. */
  const expectFinePointer = async (page: Page) =>
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);

  /**
   * The open anchored hint: its surface (the theme roles it wears), its
   * anchoring (the layer's placement rules), and where it sits against the
   * element it is anchored to (the element whose `anchor-name` its
   * `position-anchor` names): the gap below it, and which of its edges the
   * hint lines up with (`start`, or `end` where the start would leave the
   * viewport).
   */
  const openHint = async (page: Page) =>
    page.evaluate(() => {
      const hint = Array.from(
        document.querySelectorAll<HTMLElement>('[popover]'),
      ).find(element => element.matches(':popover-open'));
      if (hint == null) {
        return null;
      }
      const name = getComputedStyle(hint)
        .getPropertyValue('position-anchor')
        .trim();
      const anchor = Array.from(
        document.querySelectorAll<HTMLElement>('*'),
      ).find(element =>
        element.style
          .getPropertyValue('anchor-name')
          .split(',')
          .map(part => part.trim())
          .includes(name),
      );
      if (anchor == null) {
        return null;
      }
      const box = hint.getBoundingClientRect();
      const anchorBox = anchor.getBoundingClientRect();
      const style = getComputedStyle(hint);
      return {
        below: box.top - anchorBox.bottom,
        edge:
          Math.abs(box.left - anchorBox.left) < 0.5
            ? 'start'
            : Math.abs(box.right - anchorBox.right) < 0.5
              ? 'end'
              : 'none',
        inView: box.left >= 0 && box.right <= window.innerWidth,
        anchoring: {
          positionArea: style.getPropertyValue('position-area'),
          positionTryFallbacks: style.getPropertyValue(
            'position-try-fallbacks',
          ),
          marginBlockStart: style.marginBlockStart,
        },
        surface: {
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          color: style.color,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          padding: style.padding,
          position: style.position,
        },
      };
    });

  test("reorder mode's hint sits where Core's keyboard hint does and wears the same surface", async ({
    page,
  }) => {
    // Core's keyboard hint: a tab list reached with the keyboard.
    await openStory(page, storybook(), 'core-tablist--default');
    await expectFinePointer(page);
    await page.keyboard.press('Tab');
    await expect.poll(async () => openHint(page)).not.toBeNull();
    await page.waitForTimeout(300);
    const keyboard = await openHint(page);
    // Reorder mode's hint, below the handle whose row is in the mode. The
    // list is narrowed so its handles, at the rows' end, are as far from the
    // viewport's edge as the tab list is: each hint has the room to line up
    // with its anchor's start, and the layer flips neither.
    await openStory(page, storybook(), STORY);
    await page.evaluate(() => {
      const root = document.getElementById('storybook-root');
      if (root != null) {
        root.style.width = '420px';
      }
    });
    await handle(page, 'Inbox').focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', {name: 'Done'})).toBeVisible();
    await page.waitForTimeout(300);
    const reorderHint = await openHint(page);
    // The same layer, anchoring and theme roles (spec:AST-103, FR4 hint): the
    // same surface, the same placement rules, the same gap below the anchor,
    // and the same edge to line up with.
    expect(reorderHint?.surface).toEqual(keyboard?.surface);
    expect(reorderHint?.anchoring).toEqual(keyboard?.anchoring);
    expect(
      Math.abs((reorderHint?.below ?? Number.NaN) - (keyboard?.below ?? 0)),
    ).toBeLessThan(0.5);
    expect(keyboard?.edge).toBe('start');
    expect(reorderHint?.edge).toBe('start');
    expect(reorderHint?.inView).toBe(true);
    await page.keyboard.press('Escape');
  });

  test("a mouse click on a handle turns on reorder mode and shows its hint's moves and Done, and announces no drop", async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    await handle(page, 'Inbox').click();
    await expect(handle(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Move up', 'Move down', 'Done']) {
      await expect(page.getByRole('button', {name})).toBeVisible();
    }
    // A click's focus is the handle's, whatever the engine does with a
    // clicked button.
    await expect(handle(page, 'Inbox')).toBeFocused();
    // Nothing was picked up: the click announces no drop.
    expect(await announced(page)).not.toContain('Dropped');
  });

  for (const key of ['Space', 'Enter']) {
    test(`${key} turns on reorder mode, each arrow commits a move at once with the focus on the handle, and Escape ends the mode keeping the moves`, async ({
      page,
    }) => {
      // spec:AST-103 FR4, in this engine: the key's own activation of the
      // button (Space's comes with its keyup) toggles the mode once.
      await openStory(page, storybook(), STORY);
      await expectFinePointer(page);
      await page.keyboard.press('Shift');
      await handle(page, 'Inbox').focus();
      await page.keyboard.press(key);
      await expect(handle(page, 'Inbox')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('button', {name: 'Done'})).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(async () => labels(page))
        .toEqual(['Sent', 'Inbox', 'Drafts', 'Archive', 'Spam', 'Trash']);
      await expect(handle(page, 'Inbox')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(async () => labels(page))
        .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
      await expect(handle(page, 'Inbox')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(handle(page, 'Inbox')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(page.getByRole('button', {name: 'Done'})).toBeHidden();
      // Leaving announces where the row is.
      await expect
        .poll(async () => announced(page))
        .toContain('Done, Inbox at position 3 of 6');
      // Kept, and at rest: with a mouse nothing travels.
      expect(await labels(page)).toEqual([
        'Sent',
        'Drafts',
        'Inbox',
        'Archive',
        'Spam',
        'Trash',
      ]);
      await expect(handle(page, 'Inbox')).toBeFocused();
      for (const label of ROWS) {
        expect(await translateY(row(page, label))).toBe(0);
      }
    });
  }

  test('an Escape with the focus in the hint ends reorder mode, and the focus goes back to the handle', async ({
    page,
  }) => {
    // A screen reader can move the focus into the hint's buttons; their
    // Escape reaches the shared dismissal stack, not the handle.
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    await handle(page, 'Sent').click();
    await expect(handle(page, 'Sent')).toHaveAttribute('aria-pressed', 'true');
    const up = page.getByRole('button', {name: 'Move up'});
    await up.focus();
    await expect(up).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(handle(page, 'Sent')).toHaveAttribute('aria-pressed', 'false');
    await expect(up).toBeHidden();
    await expect(handle(page, 'Sent')).toBeFocused();
    expect(await labels(page)).toEqual(ROWS);
  });

  for (const from of ['a button', 'the context menu']) {
    test(`start(key) from ${from} turns on reorder mode with the focus on the handle, and the arrows and the hint work`, async ({
      page,
    }) => {
      // spec:AST-103 FR4a: a closing menu restores its trigger's focus; the
      // handle takes it back.
      await openStory(page, storybook(), START_STORY);
      await expectFinePointer(page);
      if (from === 'a button') {
        await page.getByRole('button', {name: 'Move Sent'}).click();
      } else {
        await row(page, 'Drafts').click({button: 'right'});
        await page.getByRole('menuitem', {name: 'Move Sent'}).click();
      }
      await expect(handle(page, 'Sent')).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(handle(page, 'Sent')).toBeFocused();
      await expect(page.getByRole('button', {name: 'Done'})).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await expect
        .poll(async () => labels(page))
        .toEqual(['Inbox', 'Drafts', 'Sent', 'Archive', 'Spam', 'Trash']);
      await page.getByRole('button', {name: 'Move up'}).click();
      await expect.poll(async () => labels(page)).toEqual(ROWS);
      await expect(handle(page, 'Sent')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(handle(page, 'Sent')).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  }
});

test.describe('with a finger', () => {
  /**
   * Opens the story on a touch screen: Chromium's touch emulation is a
   * coarse pointer.
   */
  async function open(page: Page) {
    await openStory(page, storybook(), STORY);
    const touch = await page.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    test.skip(!touch, 'the touch hint runs on a touch screen');
    await expect(handle(page, 'Inbox')).toBeVisible();
  }

  test("taps alone reorder: the handle turns on reorder mode, the hint's moves move the row, and Done ends the mode", async ({
    page,
    browserName,
  }) => {
    // Linux WebKit's injected touches dispatch pointer and touch events but
    // no click, so a tap cannot activate a button there (iOS Safari's tap
    // does).
    test.skip(browserName === 'webkit', 'injected touches synthesize no click');
    await open(page);
    const before = await labels(page);
    const driver = await touchDriver(page);
    await driver.play(tap(await centerOf(handle(page, 'Inbox'))));
    await expect(handle(page, 'Inbox')).toHaveAttribute('aria-pressed', 'true');
    const down = page.getByRole('button', {name: 'Move down'});
    await expect(down).toBeVisible();
    await driver.play(tap(await centerOf(down)));
    await expect
      .poll(async () => labels(page))
      .toEqual([before[1], before[0], ...before.slice(2)]);
    // The focus stayed on the handle through the taps.
    await expect(handle(page, 'Inbox')).toBeFocused();
    await driver.play(
      tap(await centerOf(page.getByRole('button', {name: 'Done'}))),
    );
    await expect(handle(page, 'Inbox')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(down).toBeHidden();
    expect(await labels(page)).toEqual([
      before[1],
      before[0],
      ...before.slice(2),
    ]);
  });

  test('a drag does not also turn on reorder mode', async ({page}) => {
    await open(page);
    const pitch = await row(page, 'Inbox').evaluate(element => {
      const next = element.nextElementSibling as HTMLElement | null;
      return next == null
        ? (element as HTMLElement).offsetHeight
        : next.offsetTop - (element as HTMLElement).offsetTop;
    });
    const from = await centerOf(handle(page, 'Inbox'));
    const driver = await touchDriver(page);
    await driver.play(
      drag(
        from,
        {x: from.x, y: from.y + 1.2 * pitch},
        {holdMs: HOLD_MS, durationMs: 300, restMs: 150},
      ),
    );
    await page.waitForTimeout(400);
    await expect(handle(page, 'Inbox')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByRole('button', {name: 'Done'})).toBeHidden();
  });

  test("each of the hint's buttons is a 44 px target centered on what it shows, and none covers its neighbour", async ({
    page,
    browserName,
  }) => {
    // design:bidirectionality DR8: a target stays centered on its visible
    // control, keeps the required size, and never makes part of another
    // control clickable as itself.
    await open(page);
    await handle(page, 'Sent').focus();
    await page.keyboard.press('Enter');
    await expect(handle(page, 'Sent')).toHaveAttribute('aria-pressed', 'true');
    const names = ['Move up', 'Move down', 'Done'];
    const boxes = [];
    for (const name of names) {
      const button = page.getByRole('button', {name});
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      if (box == null) {
        throw new Error(`no box for ${name}`);
      }
      // What it shows: the glyph (its first element) or its text.
      const glyph = await button.evaluate(element => {
        const rect = (
          element.firstElementChild ?? element
        ).getBoundingClientRect();
        return {left: rect.left, right: rect.right};
      });
      boxes.push({name, box, glyph});
    }
    for (const {name, box, glyph} of boxes) {
      expect(box.width, `${name} is 44 px wide`).toBeGreaterThanOrEqual(44);
      // Centered on what it shows (within a pixel).
      expect(
        Math.abs(box.x + box.width / 2 - (glyph.left + glyph.right) / 2),
        `${name} is centered on its glyph`,
      ).toBeLessThanOrEqual(1);
    }
    // Every point of each glyph hits its own button: no neighbour's target
    // covers it.
    for (const {name, box, glyph} of boxes) {
      const y = box.y + box.height / 2;
      for (const x of [glyph.left + 1, glyph.right - 1]) {
        const hit = await page.evaluate(
          ([px, py]) =>
            document
              .elementFromPoint(px, py)
              ?.closest('button')
              ?.getAttribute('aria-label') ??
            document.elementFromPoint(px, py)?.closest('button')?.textContent ??
            null,
          [x, y] as const,
        );
        expect(hit, `${name} at x=${x.toFixed(1)}`).toBe(name);
      }
    }
    // The 8 px of the up glyph nearest Move down move the row up (a tap
    // activates a button everywhere but Linux WebKit's injected touches).
    if (browserName === 'webkit') {
      return;
    }
    const [up] = boxes;
    const driver = await touchDriver(page);
    await driver.play(
      tap({x: up.glyph.right - 4, y: up.box.y + up.box.height / 2}),
    );
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Inbox', 'Drafts', 'Archive', 'Spam', 'Trash']);
  });
});
