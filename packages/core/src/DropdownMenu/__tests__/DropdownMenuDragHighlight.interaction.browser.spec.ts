// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuDragHighlight.interaction.browser.spec.ts
 * @input The built Default DropdownMenu story under the harness's phone
 *   profile, with real finger, pen and mouse input (touch.ts, webInput.ts and
 *   Playwright's mouse)
 * @output Interaction proofs that the highlight follows a held pointer
 *   (`spec:AST-094` FR27, FR43). Dragged from the trigger across the rows,
 *   each enabled row lights in turn. Nothing is lit once the pointer leaves
 *   the menu. Under a finger or a pen, the lit row is painted stronger than
 *   a row the keyboard focuses. Under a mouse, it keeps that hover tint.
 *   Under a desktop mouse, a press that begins on one row and drags onto
 *   another leaves the row under it told apart from the first. Under a
 *   desktop pen, only the row under it keeps the pressed overlay.
 * @position Evidence for the lit row's paint in DropdownMenu's rows; the
 *   press model's mark on that row is unit-tested in useMenuPress.test.tsx
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  path,
  PEN_SKIP,
  touchDriver,
  waitForRest,
  webInputDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const ROWS = ['Edit', 'Duplicate', 'Delete'] as const;

/** The element's rendered box; a missing one fails the spec. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('the element has no rendered box');
  }
  return box;
}

interface Layout {
  trigger: Locator;
  /** The trigger's center x and its bottom edge. */
  x: number;
  triggerBottom: number;
  /** The open menu's bottom edge, and each row's vertical center. */
  menuBottom: number;
  rowCenters: Map<string, number>;
  /** The alpha of a row's paint while the keyboard focuses it. */
  keyboardAlpha: number;
}

/** The alpha of a computed `rgb()`/`rgba()` color: 0 for none. */
function alphaOf(color: string): number {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (parts.length < 3) {
    return 0;
  }
  return parts.length >= 4 ? parts[3] : 1;
}

async function paintOf(row: Locator): Promise<string> {
  return row.evaluate(element => getComputedStyle(element).backgroundColor);
}

/**
 * The story with the open menu, measured once its entrance has come to rest.
 * A tap opens the menu, and the keyboard focuses its first row for the paint
 * a keyboard focus gets. Escape then closes it again.
 */
async function openLayout(page: Page): Promise<Layout> {
  await openStory(page, storybook(), 'core-dropdownmenu--default');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Actions'});
  const box = await boxOf(trigger);
  const x = Math.round(box.x + box.width / 2);
  await driver.tap({x, y: Math.round(box.y + box.height / 2)});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const popover = page.locator('[popover]:has([role="menu"])').first();
  await waitForRest(popover);
  const rowCenters = new Map<string, number>();
  for (const name of ROWS) {
    const row = await boxOf(page.getByRole('menuitem', {name}));
    rowCenters.set(name, row.y + row.height / 2);
  }
  const menu = await boxOf(popover);
  await page.keyboard.press('ArrowDown');
  const first = page.getByRole('menuitem', {name: ROWS[0]});
  await expect(first).toBeFocused();
  // Past any color transition.
  await frames(page, 30);
  const keyboardAlpha = alphaOf(await paintOf(first));
  expect(keyboardAlpha).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await waitForRest(popover);
  return {
    trigger,
    x,
    triggerBottom: box.y + box.height,
    menuBottom: menu.y + menu.height,
    rowCenters,
    keyboardAlpha,
  };
}

interface Frame {
  /** The focused row's name, or null. */
  readonly focused: string | null;
  /** Each row's paint alpha, by name. */
  readonly alpha: Readonly<Record<string, number>>;
}

/** Records, each frame, the focused row and every row's paint alpha. */
async function recordFrames(page: Page) {
  await page.evaluate(
    names => {
      const log: Frame[] = [];
      (window as unknown as {__frames: Frame[]}).__frames = log;
      const tick = () => {
        const alpha: Record<string, number> = {};
        let focused: string | null = null;
        for (const row of document.querySelectorAll<HTMLElement>(
          '[role="menuitem"]',
        )) {
          const name = row.textContent?.trim() ?? '';
          if (!names.includes(name)) {
            continue;
          }
          const parts =
            getComputedStyle(row)
              .backgroundColor.match(/[\d.]+/g)
              ?.map(Number) ?? [];
          alpha[name] =
            parts.length >= 4 ? parts[3] : parts.length === 3 ? 1 : 0;
          if (row === document.activeElement) {
            focused = name;
          }
        }
        log.push({focused, alpha});
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    ROWS as unknown as string[],
  );
}

async function readFrames(page: Page): Promise<ReadonlyArray<Frame>> {
  return page.evaluate(
    () => (window as unknown as {__frames: Frame[]}).__frames,
  );
}

/**
 * Each enabled row lit in turn, and no row lit or painted once the pointer has
 * left the menu. A `pressed` row is painted stronger than a keyboard focus; a
 * `hover` one, as strong as it.
 */
function expectLitInTurn(
  log: ReadonlyArray<Frame>,
  keyboardAlpha: number,
  paint: 'pressed' | 'hover',
) {
  const order: string[] = [];
  const peak = new Map<string, number>();
  for (const frame of log) {
    if (frame.focused == null) {
      continue;
    }
    if (order.at(-1) !== frame.focused) {
      order.push(frame.focused);
    }
    peak.set(
      frame.focused,
      Math.max(peak.get(frame.focused) ?? 0, frame.alpha[frame.focused] ?? 0),
    );
  }
  expect(order).toEqual([...ROWS]);
  for (const name of ROWS) {
    const lit = peak.get(name) ?? 0;
    if (paint === 'pressed') {
      expect(lit, `${name}'s paint while lit`).toBeGreaterThan(keyboardAlpha);
    } else {
      expect(lit, `${name}'s paint while lit`).toBeCloseTo(keyboardAlpha, 3);
    }
  }
  const last = log.at(-1);
  expect(last?.focused).toBeNull();
  for (const name of ROWS) {
    expect(last?.alpha[name], `${name}'s paint off the menu`).toBe(0);
  }
}

test('a held finger dragged from the trigger across the rows lights each enabled row in turn, and none off the menu', async ({
  page,
}) => {
  const layout = await openLayout(page);
  const driver = await touchDriver(page);
  await recordFrames(page);
  const start = {x: layout.x, y: Math.floor(layout.triggerBottom) - 1};
  const endY = Math.ceil(layout.menuBottom) + 40;
  // The finger holds until the menu has opened under it. Then it slides down
  // across every row and off the menu, and rests there before the lift.
  await driver.play(
    path(
      progress =>
        progress === 0
          ? start
          : {x: layout.x, y: start.y + (endY - start.y) * progress},
      {holdMs: 1200, durationMs: 1800, hz: 30, restMs: 400},
    ),
  );
  expectLitInTurn(await readFrames(page), layout.keyboardAlpha, 'pressed');
});

test('a held pen dragged from the trigger across the rows lights each enabled row in turn, and none off the menu', async ({
  page,
}) => {
  const layout = await openLayout(page);
  const pen = await webInputDriver(page);
  test.skip(!pen.pens, PEN_SKIP);
  await recordFrames(page);
  const startY = Math.floor(layout.triggerBottom) - 1;
  const endY = Math.ceil(layout.menuBottom) + 40;
  const points = [
    {x: layout.x, y: startY, t: 0},
    {x: layout.x, y: startY, t: 1200},
  ];
  for (let step = 1; step <= 54; step++) {
    points.push({
      x: layout.x,
      y: startY + ((endY - startY) * step) / 54,
      t: 1200 + step * 33,
    });
  }
  points.push({x: layout.x, y: endY, t: 1200 + 54 * 33 + 400});
  await pen.pen(points);
  expectLitInTurn(await readFrames(page), layout.keyboardAlpha, 'pressed');
});

test('a held mouse dragged from the trigger across the rows lights each enabled row in turn on the hover tint, and none off the menu', async ({
  page,
}) => {
  const layout = await openLayout(page);
  await recordFrames(page);
  const triggerBox = await boxOf(layout.trigger);
  await page.mouse.move(layout.x, triggerBox.y + triggerBox.height / 2);
  await page.mouse.down();
  await expect(layout.trigger).toHaveAttribute('aria-expanded', 'true');
  for (const name of ROWS) {
    await page.mouse.move(layout.x, layout.rowCenters.get(name) ?? 0, {
      steps: 6,
    });
    await frames(page, 20);
  }
  await page.mouse.move(layout.x, Math.ceil(layout.menuBottom) + 40, {
    steps: 6,
  });
  await frames(page, 20);
  const log = await readFrames(page);
  await page.mouse.up();
  expectLitInTurn(log, layout.keyboardAlpha, 'hover');
});

test.describe('under a desktop mouse', () => {
  // A desktop pointer hovers, so the row the press began on keeps its own
  // `:active` paint while the press drags on.
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 720},
    deviceScaleFactor: 1,
  });

  test('a press that begins on a row and drags onto another lights the row under it on the hover tint, told apart from the first', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    const trigger = page.getByRole('button', {name: 'Actions'});
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitForRest(page.locator('[popover]:has([role="menu"])').first());
    // The paint a keyboard focus gets, for the hover tint.
    await page.keyboard.press('ArrowDown');
    const first = page.getByRole('menuitem', {name: ROWS[0]});
    await expect(first).toBeFocused();
    await frames(page, 30);
    const keyboardAlpha = alphaOf(await paintOf(first));
    expect(keyboardAlpha).toBeGreaterThan(0);
    const centerOf = async (name: string) => {
      const box = await boxOf(page.getByRole('menuitem', {name}));
      return {x: box.x + box.width / 2, y: box.y + box.height / 2};
    };
    const edit = await centerOf('Edit');
    const duplicate = await centerOf('Duplicate');
    await page.mouse.move(edit.x, edit.y);
    await page.mouse.down();
    await frames(page, 20);
    await page.mouse.move(duplicate.x, duplicate.y, {steps: 6});
    await frames(page, 20);
    const paints = {
      Edit: alphaOf(await paintOf(page.getByRole('menuitem', {name: 'Edit'}))),
      Duplicate: alphaOf(
        await paintOf(page.getByRole('menuitem', {name: 'Duplicate'})),
      ),
    };
    const focused = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? null,
    );
    await page.mouse.up();
    expect(focused).toBe('Duplicate');
    expect(paints.Duplicate).toBeCloseTo(keyboardAlpha, 3);
    // The row the release acts on must not share the paint of the row the
    // press began on.
    expect(paints.Duplicate).not.toBeCloseTo(paints.Edit, 3);
  });
});

test.describe('under a desktop pen', () => {
  // A desktop pointer hovers, so a row a press began on would keep its own
  // `:active` paint while a pen drags on.
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 720},
    deviceScaleFactor: 1,
  });

  test('a press that begins on a row and drags onto another leaves only the row under it at the pressed overlay', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-dropdownmenu--default');
    const pen = await webInputDriver(page);
    test.skip(!pen.pens, PEN_SKIP);
    const trigger = page.getByRole('button', {name: 'Actions'});
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitForRest(page.locator('[popover]:has([role="menu"])').first());
    const centerOf = async (name: string) => {
      const box = await boxOf(page.getByRole('menuitem', {name}));
      return {x: box.x + box.width / 2, y: box.y + box.height / 2};
    };
    const edit = await centerOf('Edit');
    const duplicate = await centerOf('Duplicate');
    // Each frame's paints until the lift, which ends every row's `:active`.
    await page.evaluate(() => {
      const state = {isDown: true, frames: [] as [number, number][]};
      (window as unknown as {__pen: typeof state}).__pen = state;
      window.addEventListener(
        'pointerup',
        () => {
          state.isDown = false;
        },
        {capture: true, once: true},
      );
      const alpha = (name: string) => {
        const row = [
          ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        ].find(each => each.textContent?.trim() === name);
        const parts =
          (row ? getComputedStyle(row).backgroundColor : '')
            .match(/[\d.]+/g)
            ?.map(Number) ?? [];
        return parts.length >= 4 ? parts[3] : parts.length === 3 ? 1 : 0;
      };
      const tick = () => {
        if (!state.isDown) {
          return;
        }
        state.frames.push([alpha('Edit'), alpha('Duplicate')]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const points = [
      {x: edit.x, y: edit.y, t: 0},
      {x: edit.x, y: edit.y, t: 300},
    ];
    for (let step = 1; step <= 12; step++) {
      points.push({
        x: edit.x + ((duplicate.x - edit.x) * step) / 12,
        y: edit.y + ((duplicate.y - edit.y) * step) / 12,
        t: 300 + step * 33,
      });
    }
    points.push({x: duplicate.x, y: duplicate.y, t: 300 + 12 * 33 + 500});
    await pen.pen(points);
    const frames = await page.evaluate(
      () =>
        (window as unknown as {__pen: {frames: [number, number][]}}).__pen
          .frames,
    );
    // The last frame before the lift: the pen rests on Duplicate.
    const [editAlpha, duplicateAlpha] = frames.at(-1) ?? [Number.NaN, 0];
    expect(duplicateAlpha).toBeGreaterThan(0);
    expect(editAlpha).toBe(0);
  });
});
