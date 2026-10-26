// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuLift.interaction.browser.spec.ts
 * @input The built "Touch / long press" ContextMenu story, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness, the
 *   context-menu constants and springs
 * @output Interaction and animation proofs for the lift presentation: a held
 *   card lifts itself (no copy) to UIKit's size about its center over the
 *   theme's backdrop colour with the theme's shadow, its spot in the page
 *   held, with the menu 16 px below it and centered; open adds the lift
 *   layer, its anchor and the placeholder and nothing else; a card near the
 *   bottom gets its menu above; a card at the left edge lifts 16 px in with
 *   its menu flush; the card grows on from the press, and the backdrop fades
 *   in, on springs.contextMenuLift frame by frame; the menu fades in on
 *   morphSpring with no blur; closing returns the card to the page as it was
 *   and clears the backdrop; the card keeps growing on every frame through a
 *   blocked main thread; under Reduce Motion the card cross-fades in place;
 *   a storyboard of the lift
 * @position Interaction specs of packages/core/src/ContextMenu, beside
 *   ContextMenuLongPress.interaction.browser.spec.ts (the press timeline)
 */

import {expect, test, type Page} from '@playwright/test';
import {
  animationStoryboard,
  busyWindowProof,
  castStoryboard,
  holdAnimations,
  openStory,
  releaseAnimations,
  seekAnimations,
  startScreencast,
  tap,
  timeline,
  touchDriver,
  trackMarker,
  withStorybook,
  writeEvidence,
  type BusyWindow,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {springs} from '../../motion/uikit';
import {contextMenu} from '../../motion/uikit/contextMenu';

const storybook = withStorybook(test);
const {menuDisplayMs} = contextMenu.press;
const {menuGap} = contextMenu.lift;
// The layer runtime's viewport gutter in these pages (spec:AST-059): the
// spacing-4 step, with no safe area and no app-declared inset.
const GUTTER = 16;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LiftStory {
  driver: TouchDriver;
  center: {x: number; y: number};
}

/**
 * Opens the story; `moveCard` gets the card's box and returns the offset
 * (CSS px) to move it by, for the placement cases.
 */
async function openLiftStory(
  page: Page,
  moveCard?: (
    box: Box,
    viewport: {width: number; height: number},
  ) => {
    dx: number;
    dy: number;
  },
): Promise<LiftStory> {
  // One touch model: the engine's own finger (a coarse pointer) lifts.
  await openStory(page, storybook(), 'core-contextmenu--touch-long-press');
  const trigger = page.getByTestId('touch-context-menu');
  // The touch layer, the lift included, loads on demand; it marks the
  // trigger pressable once it runs.
  await expect(trigger).toHaveAttribute('data-astryx-pressable', '', {
    timeout: 10_000,
  });
  let box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  if (moveCard != null) {
    const viewport = page.viewportSize();
    if (viewport == null) {
      throw new Error('no viewport');
    }
    const {dx, dy} = moveCard(box, viewport);
    await trigger.evaluate(
      (el, offset) => {
        const host = el as HTMLElement;
        host.style.position = 'relative';
        host.style.left = `${offset.dx}px`;
        host.style.top = `${offset.dy}px`;
      },
      {dx, dy},
    );
    box = await trigger.boundingBox();
    if (box == null) {
      throw new Error('no trigger');
    }
  }
  return {
    driver: await touchDriver(page),
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

/**
 * The card's spot in the page (its placeholder while it is lifted), the
 * lifted card, the menu's popover and the backdrop, now.
 */
async function readLift(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null | undefined) => {
      if (el == null) {
        return null;
      }
      const r = el.getBoundingClientRect();
      return {x: r.x, y: r.y, width: r.width, height: r.height};
    };
    const trigger = document.querySelector(
      '[data-testid="touch-context-menu"]',
    );
    const isLifted = trigger?.matches(':popover-open') ?? false;
    const placeholder = document.querySelector(
      '[data-astryx-context-menu-lift-placeholder]',
    );
    // The tint is the lift layer's ::backdrop; the shadow is a box in it.
    const layer = document.querySelector('[data-astryx-context-menu-lift]');
    const tint = layer == null ? null : getComputedStyle(layer, '::backdrop');
    return {
      card: rect(placeholder ?? trigger),
      cardOpacity: trigger == null ? null : getComputedStyle(trigger).opacity,
      preview: isLifted ? rect(trigger) : null,
      menu: rect(document.querySelector('[role="menu"]')?.closest('[popover]')),
      backdropColor: tint == null ? null : tint.backgroundColor,
      // The theme's modal overlay where the card is, for comparison.
      overlayColor: (() => {
        const scope = trigger?.parentElement;
        if (scope == null) {
          return null;
        }
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--color-overlay)';
        scope.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      })(),
      shadow: (() => {
        const shadow = document.querySelector(
          '[data-astryx-context-menu-lift-shadow]',
        );
        if (shadow == null) {
          return null;
        }
        const style = getComputedStyle(shadow);
        return {opacity: Number(style.opacity), boxShadow: style.boxShadow};
      })(),
      backdropOpacity: tint == null ? null : Number(tint.opacity),
      layerOpen: layer?.matches(':popover-open') ?? false,
    };
  });
}

/**
 * Marks every element matching `selector` (the component creates them) for
 * the screencast tracker: an inset outline in the harness's marker colour.
 */
async function markSelector(page: Page, selector: string) {
  await page.evaluate(sel => {
    const style = document.createElement('style');
    style.textContent = `${sel}{outline:6px solid rgb(255,0,255) !important;outline-offset:-6px !important;}`;
    document.head.append(style);
  }, selector);
}

/**
 * Holds the main thread `ms` long, `afterMs` after the next touch lands (a
 * timer set in the touch's own task, so it runs on the page's clock). Returns
 * a reader for the window it held, epoch ms.
 */
async function blockAfterTouch(
  page: Page,
  afterMs: number,
  ms: number,
): Promise<() => Promise<BusyWindow>> {
  await page.evaluate(
    ({at, length}) => {
      addEventListener(
        'touchstart',
        () => {
          setTimeout(() => {
            const from = performance.timeOrigin + performance.now();
            const end = performance.now() + length;
            while (performance.now() < end) {
              // Held: no task, frame or event runs.
            }
            (window as unknown as {__busy: BusyWindow}).__busy = {
              from,
              to: performance.timeOrigin + performance.now(),
            };
          }, at);
        },
        {once: true, capture: true, passive: true},
      );
    },
    {at: afterMs, length: ms},
  );
  return async () =>
    page.evaluate(() => (window as unknown as {__busy: BusyWindow}).__busy);
}

/** A finger held until the menu shows, then lifted (the menu stays). */
/**
 * Until the lift has grown: the layer runtime's hold, which keeps touches off
 * the lift layer while it grows (AST-094 FR35), has ended.
 */
async function untilGrown(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const layer = document.querySelector(
            '[data-astryx-context-menu-lift]',
          );
          return (
            layer != null &&
            ![...layer.children].some(child =>
              child.matches('div[popover]:popover-open'),
            )
          );
        }),
      {timeout: 4000},
    )
    .toBe(true);
}

async function liftAndSettle(page: Page, {driver, center}: LiftStory) {
  await driver.play(tap(center, {holdMs: menuDisplayMs + 100}));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  // The lift settles within about half a second (Linux WebKit starts a
  // page's first animations late, so wait for the shadow to be in, too).
  await page.waitForTimeout(800);
  await expect
    .poll(async () => (await readLift(page)).shadow?.opacity, {timeout: 4000})
    .toBe(1);
  await page.waitForTimeout(200);
  return readLift(page);
}

test('under a finger the story has the fine pointer’s element count at rest, and open adds only the lift layer, its shadow and anchor, and the placeholder, whatever the card holds (INV7, AST-017 FR60)', async ({
  page,
  browser,
}) => {
  const count = async (target: Page) =>
    target.evaluate(() => document.body.querySelectorAll('*').length);
  // The fine pointer's counts, in a context without touch.
  const fineContext = await browser.newContext({
    viewport: page.viewportSize() ?? {width: 402, height: 874},
    hasTouch: false,
    isMobile: false,
  });
  const fine = await fineContext.newPage();
  await openStory(fine, storybook(), 'core-contextmenu--touch-long-press');
  // A fine pointer in this context, before any count.
  expect(
    await fine.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  const fineRest = await count(fine);
  const fineBox = await fine.getByTestId('touch-context-menu').boundingBox();
  if (fineBox == null) {
    throw new Error('no trigger');
  }
  await fine.mouse.click(
    fineBox.x + fineBox.width / 2,
    fineBox.y + fineBox.height / 2,
    {button: 'right'},
  );
  await expect(fine.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  const fineOpen = await count(fine);
  await fineContext.close();

  const story = await openLiftStory(page);
  const coarseRest = await count(page);
  const settled = await liftAndSettle(page, story);
  const coarseOpen = await count(page);
  const lift = await page.evaluate(() => {
    const layer = document.querySelector('[data-astryx-context-menu-lift]');
    const trigger = document.querySelector(
      '[data-testid="touch-context-menu"]',
    );
    return {
      // The layer holds the shadow and the box the menu is placed against,
      // nothing else.
      layerChildren: layer == null ? -1 : layer.children.length,
      hasAnchor:
        layer?.querySelector('[data-astryx-context-menu-lift-anchor]') != null,
      // The card lifts itself: no copy of it anywhere.
      copies: document.querySelectorAll('[data-astryx-context-menu-preview]')
        .length,
      isLifted: trigger?.matches(':popover-open') ?? false,
      placeholderAfterTrigger:
        trigger?.nextElementSibling?.hasAttribute(
          'data-astryx-context-menu-lift-placeholder',
        ) ?? false,
      triggerDescendants:
        trigger == null ? -1 : trigger.querySelectorAll('*').length,
    };
  });
  const detail = JSON.stringify({
    fineRest,
    fineOpen,
    coarseRest,
    coarseOpen,
    lift,
  });
  expect(coarseRest, detail).toBe(fineRest);
  expect(lift.layerChildren, detail).toBe(2);
  expect(lift.hasAnchor, detail).toBe(true);
  expect(lift.copies, detail).toBe(0);
  expect(lift.isLifted, detail).toBe(true);
  expect(lift.placeholderAfterTrigger, detail).toBe(true);
  // The layer, the shadow, the anchor and the placeholder: 4, within the 5
  // an open layer may add under touch (AST-017 FR60, DEC-29), however many
  // elements the card holds.
  expect(coarseOpen - fineOpen, detail).toBe(4);
  // A tap on the tint, on the card's own spot clear of the lifted card.
  if (settled.card == null) {
    throw new Error(detail);
  }
  await story.driver.play(
    tap({
      x: settled.card.x + 10,
      y: settled.card.y + settled.card.height + 8,
    }),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  await expect.poll(async () => count(page), {timeout: 3000}).toBe(coarseRest);
});

test('a held card lifts itself to UIKit’s size about its center over the theme’s dim and shadow, its spot in the page held, its menu 16 px below and centered', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  // Closed, the lift layer takes no room and no touches.
  await expect(page.locator('[data-astryx-context-menu-lift]')).toBeHidden();
  const lift = await liftAndSettle(page, story);
  const {card, preview, menu} = lift;
  if (card == null || preview == null || menu == null) {
    throw new Error(JSON.stringify(lift));
  }
  const detail = JSON.stringify(lift);
  // 200 × 120 lifts by 26 pt on its longer side: 226 × 135.6.
  expect(preview.width, detail).toBeCloseTo(226, 0);
  expect(preview.height, detail).toBeCloseTo(135.6, 0);
  expect(preview.x + preview.width / 2, detail).toBeCloseTo(
    card.x + card.width / 2,
    0,
  );
  expect(preview.y + preview.height / 2, detail).toBeCloseTo(
    card.y + card.height / 2,
    0,
  );
  expect(lift.cardOpacity, detail).toBe('1');
  // The theme's modal overlay (`--color-overlay`), fully faded in.
  expect(lift.overlayColor, detail).not.toBeNull();
  expect(lift.backdropColor, detail).toBe(lift.overlayColor);
  // The theme's high shadow, faded in under the card.
  expect(lift.shadow?.opacity, detail).toBeCloseTo(1, 2);
  expect(lift.shadow?.boxShadow, detail).not.toBe('none');
  expect(lift.backdropOpacity, detail).toBeCloseTo(1, 2);
  expect(menu.y, detail).toBeCloseTo(preview.y + preview.height + menuGap, 0);
  expect(menu.x + menu.width / 2, detail).toBeCloseTo(
    preview.x + preview.width / 2,
    0,
  );
});

test('a card near the bottom gets its menu above, and stays inside the layer runtime’s gutter', async ({
  page,
}) => {
  const story = await openLiftStory(page, (box, viewport) => ({
    dx: 0,
    // The card's bottom 10 px from the viewport's.
    dy: viewport.height - 10 - (box.y + box.height),
  }));
  const lift = await liftAndSettle(page, story);
  const {preview, menu} = lift;
  if (preview == null || menu == null) {
    throw new Error(JSON.stringify(lift));
  }
  const viewport = page.viewportSize();
  const detail = JSON.stringify({lift, viewport});
  expect(preview.y + preview.height, detail).toBeCloseTo(
    (viewport?.height ?? NaN) - GUTTER,
    0,
  );
  expect(menu.y + menu.height, detail).toBeCloseTo(preview.y - menuGap, 0);
});

test('a card at the left edge lifts 16 px in, and its menu is flush with it', async ({
  page,
}) => {
  const story = await openLiftStory(page, box => ({dx: 4 - box.x, dy: 0}));
  const lift = await liftAndSettle(page, story);
  const {preview, menu} = lift;
  if (preview == null || menu == null) {
    throw new Error(JSON.stringify(lift));
  }
  const detail = JSON.stringify(lift);
  expect(preview.x, detail).toBeCloseTo(GUTTER, 0);
  expect(menu.x, detail).toBeCloseTo(GUTTER, 0);
});

test('in a right-to-left page a card at the left edge keeps its menu flush with that edge (the alignment is logical)', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  const center = await page.getByTestId('touch-context-menu').evaluate(el => {
    document.documentElement.dir = 'rtl';
    const host = el as HTMLElement;
    host.style.position = 'relative';
    host.style.left = '0px';
    const box = host.getBoundingClientRect();
    host.style.left = `${4 - box.x}px`;
    const moved = host.getBoundingClientRect();
    return {x: moved.x + moved.width / 2, y: moved.y + moved.height / 2};
  });
  const lift = await liftAndSettle(page, {...story, center});
  const {preview, menu} = lift;
  if (preview == null || menu == null) {
    throw new Error(JSON.stringify(lift));
  }
  const detail = JSON.stringify(lift);
  expect(preview.x, detail).toBeCloseTo(GUTTER, 0);
  expect(menu.x, detail).toBeCloseTo(GUTTER, 0);
});

test('the menu shows above the lifted card and takes the finger: its rows are on top', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  await liftAndSettle(page, story);
  const share = await page.getByRole('menuitem', {name: 'Share'}).boundingBox();
  if (share == null) {
    throw new Error('no Share row');
  }
  const hit = await page.evaluate(
    ([x, y]) =>
      document.elementFromPoint(x, y)?.closest('[role="menuitem"]')
        ?.textContent ?? null,
    [share.x + share.width / 2, share.y + share.height / 2],
  );
  expect(hit).toContain('Share');
});

test('the card itself lifts into the top layer while its spot in the page holds, and is back in the page as it was once the menu closes', async ({
  page,
}) => {
  const {driver, center} = await openLiftStory(page);
  const trigger = page.getByTestId('touch-context-menu');
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  const before = await trigger.evaluate(el => {
    const r = el.getBoundingClientRect();
    return {
      style: (el as HTMLElement).style.cssText,
      box: [r.x, r.y, r.width, r.height],
      next: (() => {
        const sibling = el.parentElement?.nextElementSibling;
        if (sibling == null) {
          return null;
        }
        const n = sibling.getBoundingClientRect();
        return [n.x, n.y];
      })(),
    };
  });
  await driver.play(tap(center, {holdMs: menuDisplayMs + 100}));
  await expect(menu).toBeVisible();
  const lifted = await trigger.evaluate(el => {
    const placeholder = document.querySelector(
      '[data-astryx-context-menu-lift-placeholder]',
    );
    const r = placeholder?.getBoundingClientRect();
    const sibling = el.parentElement?.nextElementSibling;
    const n = sibling?.getBoundingClientRect();
    return {
      isOpen: el.matches(':popover-open'),
      spot: r == null ? null : [r.x, r.y, r.width, r.height],
      next: n == null ? null : [n.x, n.y],
      visibility: getComputedStyle(el).visibility,
    };
  });
  const detail = JSON.stringify({before, lifted});
  expect(lifted.isOpen, detail).toBe(true);
  expect(lifted.visibility, detail).toBe('visible');
  for (let i = 0; i < 4; i++) {
    expect(lifted.spot?.[i] ?? NaN, detail).toBeCloseTo(before.box[i], 0);
  }
  // Nothing after the card moved.
  expect(lifted.next, detail).toEqual(before.next);
  // Once the lift has grown (it takes no touch before, AST-094 FR35), a tap
  // on the tint, far from the card and the menu.
  await untilGrown(page);
  await driver.play(tap({x: 24, y: 24}));
  await expect(menu).toBeHidden();
  await expect
    .poll(async () => trigger.evaluate(el => el.matches(':popover-open')), {
      timeout: 3_000,
    })
    .toBe(false);
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          document.querySelector('[data-astryx-context-menu-lift]'),
        ),
      {timeout: 3_000},
    )
    .toBeNull();
  // The card is back as it was: no popover, and nothing of the lift inline.
  const after = await trigger.evaluate(el => ({
    popover: el.getAttribute('popover'),
    style: (el as HTMLElement).style.cssText,
    placeholder:
      document.querySelector('[data-astryx-context-menu-lift-placeholder]') !=
      null,
  }));
  expect(after.popover).toBeNull();
  expect(after.style).toBe(before.style);
  expect(after.placeholder).toBe(false);
});

test('the card grows on from the press, and the backdrop fades in, on springs.contextMenuLift, frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, center} = await openLiftStory(page);
  const playing = driver.play(tap(center, {holdMs: menuDisplayMs + 600}));
  const lifted = page.locator('[data-testid="touch-context-menu"][popover]');
  await expect(lifted).toBeAttached({timeout: 5_000});
  await holdAnimations(page);
  const samples: {t: number; scale: number; backdrop: number}[] = [];
  for (const t of timeline(450)) {
    await seekAnimations(page, t);
    samples.push({
      t,
      ...(await page.evaluate(() => {
        const card = document.querySelector(
          '[data-testid="touch-context-menu"]',
        );
        const layer = document.querySelector('[data-astryx-context-menu-lift]');
        const scale = card == null ? 'none' : getComputedStyle(card).scale;
        return {
          scale: scale === 'none' ? 1 : Number.parseFloat(scale),
          backdrop:
            layer == null
              ? NaN
              : Number(getComputedStyle(layer, '::backdrop').opacity),
        };
      })),
    });
  }
  await releaseAnimations(page);
  await playing;
  const from = samples[0].scale;
  const scale = solveSpring(toSpring(springs.contextMenuLift), {
    from,
    to: 1.13,
  });
  const fade = solveSpring(toSpring(springs.contextMenuLift), {from: 0, to: 1});
  const errors = samples.map(s => ({
    t: s.t,
    widthErrorPx: Math.abs(s.scale - scale.value(s.t / 1000)) * 200,
    // Opacity stops at 1: the spring's 1.5% overshoot (UIKit's alpha peaks
    // at 1.0145 too) presents as 1.
    backdropError: Math.abs(s.backdrop - Math.min(1, fade.value(s.t / 1000))),
  }));
  await writeEvidence(
    'curves/contextmenu-lift',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {from, samples, errors},
        null,
        1,
      ),
    },
    testInfo,
  );
  // The press left the card at about 1.06 (UIKit: 1.0618 at 733 ms).
  expect(from).toBeGreaterThan(1.04);
  expect(from).toBeLessThan(1.07);
  expect(Math.max(...errors.map(e => e.widthErrorPx))).toBeLessThan(0.3);
  expect(Math.max(...errors.map(e => e.backdropError))).toBeLessThan(0.01);
  // It overshoots, as UIKit's does (226.39 pt at +279 ms).
  expect(Math.max(...samples.map(s => s.scale))).toBeGreaterThan(1.13);
});

test('the menu grows out of the finger on morphSpring, translate, scale and opacity only: at the press at first, its frame at rest, nothing left inline (AST-094 FR5)', async ({
  page,
}) => {
  const {driver, center} = await openLiftStory(page);
  const playing = driver.play(tap(center, {holdMs: menuDisplayMs + 600}));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  // The menu's own animations, timed from the menu's start.
  await holdAnimations(page, page.locator('[popover]:has([role="menu"])'));
  const read = async (t: number) => {
    await seekAnimations(page, t);
    return page.evaluate(() => {
      const popover = document
        .querySelector('[role="menu"]')
        ?.closest<HTMLElement>('[popover]');
      if (popover == null) {
        return null;
      }
      const style = getComputedStyle(popover);
      const r = popover.getBoundingClientRect();
      const moving = new Set<string>();
      for (const animation of popover.getAnimations()) {
        const frames =
          (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
        const properties = new Set(frames.flatMap(frame => Object.keys(frame)));
        for (const property of properties) {
          if (
            !['offset', 'computedOffset', 'easing', 'composite'].includes(
              property,
            ) &&
            new Set(frames.map(frame => String(frame[property]))).size > 1
          ) {
            moving.add(property);
          }
        }
      }
      return {
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        width: r.width,
        opacity: Number(style.opacity),
        filter: style.filter,
        moving: [...moving].sort(),
      };
    });
  };
  const start = await read(0);
  const middle = await read(100);
  const end = await read(600);
  await releaseAnimations(page);
  await playing;
  const curve = solveSpring(toSpring(contextMenu.lift.morphSpring), {
    from: 0,
    to: 1,
  });
  const detail = JSON.stringify({center, start, middle, end});
  // At the press, UIKit's blob wide, clear.
  expect(start?.width ?? NaN, detail).toBeCloseTo(
    contextMenu.lift.morphStartWidth,
    0,
  );
  expect(start?.x ?? NaN, detail).toBeCloseTo(center.x, 0);
  expect(start?.y ?? NaN, detail).toBeCloseTo(center.y, 0);
  expect(start?.opacity, detail).toBeCloseTo(0, 2);
  // Its opacity follows the growth's own progress.
  expect(middle?.opacity, detail).toBeCloseTo(curve.value(0.1), 1);
  expect(end?.opacity, detail).toBeCloseTo(1, 2);
  expect(end?.width ?? 0, detail).toBeGreaterThan(150);
  for (const sample of [start, middle, end]) {
    expect(sample?.filter, detail).toBe('none');
  }
  expect(start?.moving, detail).toEqual(['opacity', 'scale', 'translate']);
  // Once grown, nothing of the growth is left inline on the menu.
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => {
      const popover = document
        .querySelector('[role="menu"]')
        ?.closest<HTMLElement>('[popover]');
      return [popover?.style.translate, popover?.style.scale];
    }),
  ).toEqual(['', '']);
});

test('closing shrinks the menu back into the finger on the layer runtime’s exit copy, translate, scale and opacity only, while the card returns, on UIKit’s dismissal spring (AST-094 FR31)', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  await liftAndSettle(page, story);
  // The menu's frame as laid out (its popover's box).
  const menuBox = await page.evaluate(() => {
    const r = document
      .querySelector('[role="menu"]')
      ?.closest('[popover]')
      ?.getBoundingClientRect();
    return r == null
      ? null
      : {x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width};
  });
  await page.keyboard.press('Escape');
  await holdAnimations(page);
  const read = async (t: number) => {
    await seekAnimations(page, t);
    return page.evaluate(() => {
      const copy = document.querySelector<HTMLElement>(
        '[data-astryx-context-menu-lift-exit]',
      );
      const card = document.querySelector('[data-testid="touch-context-menu"]');
      const box = copy?.getBoundingClientRect();
      const scale = card == null ? 'none' : getComputedStyle(card).scale;
      const moving = new Set<string>();
      for (const animation of copy?.getAnimations() ?? []) {
        const frames =
          (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
        for (const property of ['translate', 'scale', 'opacity', 'filter']) {
          if (new Set(frames.map(frame => String(frame[property]))).size > 1) {
            moving.add(property);
          }
        }
      }
      return {
        copy:
          box == null || copy == null
            ? null
            : {
                x: box.x + box.width / 2,
                y: box.y + box.height / 2,
                width: box.width,
                opacity: Number(getComputedStyle(copy).opacity),
                inert: copy.inert,
              },
        moving: [...moving].sort(),
        cardScale: scale === 'none' ? 1 : Number.parseFloat(scale),
      };
    });
  };
  const start = await read(0);
  const middle = await read(120);
  await releaseAnimations(page);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    exit:
      document.querySelector('[data-astryx-context-menu-lift-exit]') != null,
    layer: document.querySelector('[data-astryx-context-menu-lift]') != null,
  }));
  const returning = solveSpring(toSpring(springs.contextMenuDismiss), {
    from: 1.13,
    to: 1,
  });
  const detail = JSON.stringify({
    menuBox,
    center: story.center,
    start,
    middle,
    after,
  });
  // It starts as the menu stands, opaque and inert.
  expect(start.copy?.x, detail).toBeCloseTo(menuBox?.x ?? NaN, 0);
  expect(start.copy?.y, detail).toBeCloseTo(menuBox?.y ?? NaN, 0);
  expect(start.copy?.width, detail).toBeCloseTo(menuBox?.width ?? NaN, 0);
  expect(start.copy?.opacity, detail).toBeCloseTo(1, 2);
  expect(start.copy?.inert, detail).toBe(true);
  // Partway: smaller, nearer the finger, fading.
  expect(middle.copy?.width ?? Infinity, detail).toBeLessThan(
    (menuBox?.width ?? 0) * 0.8,
  );
  expect(
    Math.abs((middle.copy?.y ?? NaN) - story.center.y),
    detail,
  ).toBeLessThan(Math.abs((menuBox?.y ?? NaN) - story.center.y));
  expect(middle.copy?.opacity ?? 1, detail).toBeLessThan(1);
  expect(middle.moving, detail).toEqual(['opacity', 'scale', 'translate']);
  expect(middle.cardScale, detail).toBeCloseTo(returning.value(0.12), 2);
  // Done: the exit copy and the lift are gone.
  expect(after, detail).toEqual({exit: false, layer: false});
});

test('a close while the menu is still growing shrinks it back from where it stands, with no jump to its full size (AST-094 FR6)', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  // The finger lifts just after the menu shows (it stays open).
  await story.driver.play(tap(story.center, {holdMs: menuDisplayMs + 40}));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  // In one task: the menu's drawn width as the close comes, the close
  // (Escape on the menu), and the width its exit copy starts from.
  const {entrance, exitStart} = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    const popover = menu?.closest<HTMLElement>('[popover]');
    const drawn = popover?.getBoundingClientRect().width ?? null;
    const full = popover?.offsetWidth ?? null;
    menu?.dispatchEvent(
      new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}),
    );
    return {
      entrance: {drawn, full},
      exitStart:
        document
          .querySelector('[data-astryx-context-menu-lift-exit]')
          ?.getBoundingClientRect().width ?? null,
    };
  });
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    exit: document.querySelectorAll('[data-astryx-context-menu-lift-exit]')
      .length,
    style:
      document
        .querySelector('[role="menu"]')
        ?.closest('[popover]')
        ?.getAttribute('style') ?? '',
    layer: document.querySelector('[data-astryx-context-menu-lift]') != null,
  }));
  const detail = JSON.stringify({entrance, exitStart, after});
  // Mid-growth the menu is still smaller than its frame; the exit continues
  // from the growth's curve where it stands now (at most a frame on from the
  // frame last drawn), not from the frame.
  expect(entrance.drawn ?? Infinity, detail).toBeLessThan(
    (entrance.full ?? 0) - 10,
  );
  expect(exitStart ?? 0, detail).toBeGreaterThan((entrance.drawn ?? 0) - 2);
  expect(exitStart ?? Infinity, detail).toBeLessThan((entrance.full ?? 0) - 10);
  expect(after.exit, detail).toBe(0);
  expect(after.layer, detail).toBe(false);
  expect(after.style, detail).not.toMatch(/translate|scale/u);
});

test('a press during the close lands on the fading dim and, held past the close’s end, still reaches nothing: nothing opens, and the layer waits for the lift', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  await liftAndSettle(page, story);
  await page.evaluate(() => {
    const w = window as unknown as {__cardEvents: string[]};
    w.__cardEvents = [];
    const card = document.querySelector('[data-testid="touch-context-menu"]');
    for (const type of ['touchstart', 'pointerdown', 'click']) {
      card?.addEventListener(type, () => w.__cardEvents.push(type), {
        capture: true,
        passive: true,
      });
    }
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  // The close holds the layer (the layer runtime's input hold): a
  // shield in the top layer covers it until the hold ends.
  const heldState = async () =>
    page.evaluate(() => {
      const layer = document.querySelector('[data-astryx-context-menu-lift]');
      return {
        exit:
          document.querySelector('[data-astryx-context-menu-lift-exit]') !=
          null,
        held:
          layer != null &&
          [...layer.children].some(child =>
            child.matches('div[popover]:popover-open'),
          ),
      };
    });
  const during = await heldState();
  // A new finger held on the card while it is still on its way back, and on
  // well past the close's end: the layer stays up (bare) under it.
  const holdMs = menuDisplayMs + 200;
  const playing = story.driver.play(tap(story.center, {holdMs}));
  await page.waitForTimeout(holdMs - 150);
  const heldPastExit = await readLift(page);
  const heldWhilePressed = await heldState();
  await playing;
  await page.waitForTimeout(600);
  const after = await readLift(page);
  const heldAfter = await heldState();
  const cardEvents = await page.evaluate(
    () => (window as unknown as {__cardEvents: string[]}).__cardEvents,
  );
  const detail = JSON.stringify({
    during,
    heldPastExit,
    heldWhilePressed,
    after,
    heldAfter,
    cardEvents,
  });
  expect(during, detail).toEqual({exit: true, held: true});
  expect(heldWhilePressed.held, detail).toBe(true);
  expect(heldAfter.held, detail).toBe(false);
  expect(heldPastExit.layerOpen, detail).toBe(true);
  expect(heldPastExit.preview, detail).toBeNull();
  expect(cardEvents, detail).toEqual([]);
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  expect(after.preview, detail).toBeNull();
  expect(after.layerOpen, detail).toBe(false);
});

test('picking an action closes the menu the same way: it shrinks back into the finger and the card returns', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  await liftAndSettle(page, story);
  await page.evaluate(() => {
    const w = window as unknown as {__picked: string[]};
    w.__picked = [];
    document.addEventListener(
      'click',
      event => {
        const row = (event.target as Element).closest('[role="menuitem"]');
        if (row != null) {
          w.__picked.push(row.textContent ?? '');
        }
      },
      {capture: true},
    );
  });
  const share = await page.getByRole('menuitem', {name: 'Share'}).boundingBox();
  if (share == null) {
    throw new Error('no Share row');
  }
  await story.driver.play(
    tap({x: share.x + share.width / 2, y: share.y + share.height / 2}),
  );
  const exiting = await page.evaluate(
    () =>
      document.querySelector('[data-astryx-context-menu-lift-exit]') != null,
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  await page.waitForTimeout(900);
  const after = await readLift(page);
  const picked = await page.evaluate(
    () => (window as unknown as {__picked: string[]}).__picked,
  );
  const detail = JSON.stringify({exiting, after, picked});
  expect(picked, detail).toEqual(['Share']);
  expect(exiting, detail).toBe(true);
  expect(after.preview, detail).toBeNull();
  expect(after.layerOpen, detail).toBe(false);
});

test('closing returns the card to its place and clears the backdrop', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  const lifted = await liftAndSettle(page, story);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  await page.waitForTimeout(900);
  const after = await readLift(page);
  const detail = JSON.stringify({lifted, after});
  expect(after.preview, detail).toBeNull();
  expect(after.layerOpen, detail).toBe(false);
  expect(after.cardOpacity, detail).toBe('1');
  // Back on its spot.
  expect(after.card?.x ?? NaN, detail).toBeCloseTo(lifted.card?.x ?? NaN, 0);
  expect(after.card?.y ?? NaN, detail).toBeCloseTo(lifted.card?.y ?? NaN, 0);
  expect(after.card?.width ?? NaN, detail).toBeCloseTo(
    lifted.card?.width ?? NaN,
    0,
  );
});

test('a tap on the tint while the lift is still growing is swallowed: the menu finishes and stays open, and nothing beneath gets it (AST-094 FR35)', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  await page.evaluate(() => {
    const w = window as unknown as {__clicked?: string[]};
    w.__clicked = [];
    document.addEventListener(
      'click',
      event => {
        const target = event.target as Element;
        w.__clicked?.push(
          target.closest('[data-astryx-context-menu-lift]')
            ? 'layer'
            : target.tagName.toLowerCase(),
        );
      },
      {capture: true},
    );
  });
  await story.driver.play(tap(story.center, {holdMs: menuDisplayMs + 100}));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  // At once, while the card grows and the menu fades in: a tap on the tint.
  await story.driver.play(tap({x: 12, y: 12}));
  await page.waitForTimeout(1200);
  const lift = await readLift(page);
  const clicked = await page.evaluate(
    () => (window as unknown as {__clicked?: string[]}).__clicked ?? [],
  );
  const detail = JSON.stringify({lift, clicked});
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  expect(lift.layerOpen, detail).toBe(true);
  expect(lift.backdropOpacity, detail).toBeCloseTo(1, 2);
  expect(
    clicked.filter(target => target !== 'layer'),
    detail,
  ).toEqual([]);
  // Settled, a tap on the tint closes it as before.
  await story.driver.play(tap({x: 12, y: 12}));
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
});

test('a tap on the backdrop closes the menu and reaches nothing under it', async ({
  page,
}) => {
  const story = await openLiftStory(page);
  const lift = await liftAndSettle(page, story);
  if (lift.card == null) {
    throw new Error(JSON.stringify(lift));
  }
  await page.evaluate(() => {
    const w = window as unknown as {__clicked?: string[]};
    w.__clicked = [];
    document.addEventListener(
      'click',
      event => {
        const target = event.target as Element;
        w.__clicked?.push(
          target.closest('[data-astryx-context-menu-lift]')
            ? 'backdrop'
            : target.closest('[data-testid="touch-context-menu"]')
              ? 'card'
              : target.tagName.toLowerCase(),
        );
      },
      {capture: true},
    );
  });
  // On the card's own spot, under the backdrop, clear of the lifted card.
  await story.driver.play(
    tap({x: lift.card.x + 10, y: lift.card.y + lift.card.height + 8}),
  );
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeHidden();
  const clicked = await page.evaluate(
    () => (window as unknown as {__clicked?: string[]}).__clicked ?? [],
  );
  expect(clicked.filter(target => target !== 'backdrop')).toEqual([]);
});

test('the lift keeps moving while the main thread is blocked: the card grows on every frame', async ({
  page,
  browserName,
}, testInfo) => {
  // Measured: Linux WebKit's compositor stalls with its main thread (no
  // frames for most of a block, the card frozen). iOS Safari keeps the card
  // growing through the same 1 s block: the simulator recording.
  test.skip(
    browserName !== 'chromium',
    'Linux WebKit’s compositor stalls with its main thread; iOS Safari is the simulator recording',
  );
  const {driver, center} = await openLiftStory(page);
  await markSelector(page, '[data-testid="touch-context-menu"]');
  // Blocked from 20 ms after the menu's moment for 1 s (spec:AST-094's FR5
  // row), past the card's whole growth; the finger lifts after the block.
  const busyWindow = await blockAfterTouch(page, menuDisplayMs + 20, 1000);
  const cast = await startScreencast(page);
  await driver.play(tap(center, {holdMs: menuDisplayMs + 1300}));
  const castFrames = await cast.stop();
  const block = await busyWindow();
  const tracked = await trackMarker(page, castFrames);
  // The screencast reports whole pixels: the spring's tail plateaus within
  // 2 px of the end (the harness's usual settle).
  const proof = busyWindowProof(tracked, block, {
    axis: 'width',
    settledWithin: 2,
  });
  await writeEvidence(
    'busy-main-thread/contextmenu-lift',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            w: f.box?.width ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'contextmenu-lift-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: block.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({w: tracked.find(f => f.t === t)?.box?.width ?? -1}),
  });
  await film.write(testInfo, {block});
  // Frames kept coming and the card kept growing through the block: the
  // harness judges each delivered frame (no stall, no frozen card).
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.monotonic).toBe(true);
  expect((proof.last ?? 0) - (proof.first ?? 0)).toBeGreaterThanOrEqual(4);
});

test('the close keeps going while the main thread is blocked: the menu’s exit copy shrinks on every frame', async ({
  page,
  browserName,
}, testInfo) => {
  // As the lift's own proof: Linux WebKit's compositor stalls with its main
  // thread; iOS Safari is the simulator recording.
  test.skip(
    browserName !== 'chromium',
    'Linux WebKit’s compositor stalls with its main thread; iOS Safari is the simulator recording',
  );
  const story = await openLiftStory(page);
  await liftAndSettle(page, story);
  await markSelector(page, '[data-astryx-context-menu-lift-exit]');
  // A tap on the dim starts the close as its finger lifts (60 ms); blocked
  // from 20 ms into the close, while the copy shrinks.
  const busyWindow = await blockAfterTouch(page, 60 + 20, 200);
  const cast = await startScreencast(page);
  await story.driver.play(tap({x: 24, y: 24}, {holdMs: 60}));
  await page.waitForTimeout(800);
  const castFrames = await cast.stop();
  const block = await busyWindow();
  // The copy fades as it shrinks, so its marker pales: a wider tolerance
  // keeps it tracked while it is still half opaque.
  const tracked = await trackMarker(page, castFrames, {tolerance: 120});
  const proof = busyWindowProof(tracked, block, {
    axis: 'width',
    settledWithin: 2,
  });
  await writeEvidence(
    'busy-main-thread/contextmenu-lift-close',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            w: f.box?.width ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'contextmenu-lift-close-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: block.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({w: tracked.find(f => f.t === t)?.box?.width ?? -1}),
  });
  await film.write(testInfo, {block});
  // Frames kept coming and the copy kept shrinking through the block: the
  // harness judges each delivered frame (no stall, no frozen copy).
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.monotonic).toBe(true);
  expect((proof.first ?? 0) - (proof.last ?? 0)).toBeGreaterThanOrEqual(4);
});

/** The lifted card's box, its opacity and the menu's filter, as the frame shows them. */
type ReducedMotionSample = Awaited<ReturnType<typeof reducedMotionSample>>;

async function reducedMotionSample(page: Page) {
  return page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-testid="touch-context-menu"]',
    );
    const menu = document
      .querySelector('[role="menu"]')
      ?.closest<HTMLElement>('[popover]');
    const box = preview?.getBoundingClientRect();
    return {
      x: box?.x ?? Number.NaN,
      y: box?.y ?? Number.NaN,
      width: box?.width ?? Number.NaN,
      opacity: preview ? Number(getComputedStyle(preview).opacity) : Number.NaN,
      filter: menu ? getComputedStyle(menu).filter : 'none',
      menuOpacity: menu ? Number(getComputedStyle(menu).opacity) : Number.NaN,
      // Still lifted (in the top layer), not yet back in the page.
      lifted: preview?.matches(':popover-open') ?? false,
    };
  });
}

test('under Reduce Motion the lift cross-fades in place, as UIKit’s reduced path does: the card holds its lifted box in every frame, only its opacity moves, and the menu fades in without blur', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, center} = await openLiftStory(page);
  const playing = driver.play(tap(center, {holdMs: menuDisplayMs + 600}));
  const lifted = page.locator('[data-testid="touch-context-menu"][popover]');
  await expect(lifted).toBeAttached({timeout: 5_000});
  await expect(page.getByRole('menu', {name: 'Photo actions'})).toBeVisible();
  // The lift's and the menu's animations, timed from the lift's start (the
  // menu starts in the commit after it).
  await holdAnimations(page);
  const times = timeline(600);
  const samples: ReducedMotionSample[] = [];
  for (const t of times) {
    await seekAnimations(page, t);
    samples.push(await reducedMotionSample(page));
  }
  await releaseAnimations(page);
  await playing;
  const detail = JSON.stringify(samples);
  const last = samples.at(-1);
  expect(last, detail).toBeDefined();
  if (last == null) {
    return;
  }
  for (const sample of samples) {
    // No travel, no growth.
    expect(Math.abs(sample.x - last.x), detail).toBeLessThan(0.5);
    expect(Math.abs(sample.y - last.y), detail).toBeLessThan(0.5);
    expect(Math.abs(sample.width - last.width), detail).toBeLessThan(0.5);
    // No blur.
    expect(sample.filter, detail).toMatch(/^(none|blur\(0(px)?\))$/);
  }
  // The lifted box is the card's lifted size, not its size on the page.
  expect(last.width, detail).toBeGreaterThan(
    (
      await page
        .locator('[data-astryx-context-menu-lift-placeholder]')
        .boundingBox()
    )?.width ?? 0,
  );
  // Only the opacity moves: from (near) clear to opaque, never back, and
  // done within 200 ms (`design:reduced-motion` DR2); the menu's fade too,
  // within 200 ms of its own start.
  expect(samples[0].opacity, detail).toBeLessThan(0.5);
  expect(last.opacity, detail).toBeCloseTo(1, 2);
  const menuStart =
    times[samples.findIndex(sample => sample.menuOpacity > 0.001)] ?? 0;
  for (const [i, t] of times.entries()) {
    if (t >= 200 + 1000 / 60) {
      expect(samples[i].opacity, detail).toBeGreaterThan(0.999);
    }
    if (t >= menuStart + 200 + 1000 / 60) {
      expect(samples[i].menuOpacity, detail).toBeGreaterThan(0.999);
    }
  }
  expect(
    samples.every(
      (s, i) => i === 0 || s.opacity >= samples[i - 1].opacity - 1e-4,
    ),
    detail,
  ).toBe(true);
});

/** The menu's exit copy, as the frame shows it: its box and its opacity. */
async function exitCopySample(page: Page) {
  return page.evaluate(() => {
    const copy = document.querySelector<HTMLElement>(
      '[data-astryx-context-menu-lift-exit]',
    );
    const box = copy?.getBoundingClientRect();
    return copy == null || box == null
      ? null
      : {
          x: box.x,
          y: box.y,
          width: box.width,
          opacity: Number(getComputedStyle(copy).opacity),
        };
  });
}

test('under Reduce Motion closing fades the card out where it is, with no return travel', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, center} = await openLiftStory(page);
  await driver.play(tap(center, {holdMs: menuDisplayMs + 600}));
  const menu = page.getByRole('menu', {name: 'Photo actions'});
  await expect(menu).toBeVisible();
  await page.waitForTimeout(700);
  const open = await reducedMotionSample(page);
  // A tap on the dim, far from the card and the menu.
  await driver.play(tap({x: 24, y: 24}));
  await holdAnimations(page);
  const times = timeline(300);
  const samples: ReducedMotionSample[] = [];
  const copies: Awaited<ReturnType<typeof exitCopySample>>[] = [];
  for (const t of times) {
    await seekAnimations(page, t);
    samples.push(await reducedMotionSample(page));
    copies.push(await exitCopySample(page));
  }
  await releaseAnimations(page);
  const detail = JSON.stringify({open, samples, copies});
  // The menu's exit copy fades where it stands too, gone within 200 ms
  // (`spec:AST-094` FR8, `design:reduced-motion` DR2): no shrink, no travel.
  const first = copies.find(copy => copy != null);
  expect(first, detail).toBeDefined();
  for (const [i, t] of times.entries()) {
    const copy = copies[i];
    if (copy == null || first == null) {
      continue;
    }
    expect(Math.abs(copy.x - first.x), detail).toBeLessThan(0.5);
    expect(Math.abs(copy.y - first.y), detail).toBeLessThan(0.5);
    expect(Math.abs(copy.width - first.width), detail).toBeLessThan(0.5);
    if (t >= 200 + 1000 / 60) {
      expect(copy.opacity, detail).toBeLessThan(0.001);
    }
  }
  // While it is lifted the card fades where it is, gone within 200 ms
  // (`design:reduced-motion` DR2); once the close settles it is back in the
  // page, which the samples after that no longer judge.
  const lifted = samples.filter(sample => sample.lifted);
  expect(lifted.length, detail).toBeGreaterThan(times.length / 2);
  for (const [i, t] of times.entries()) {
    if (
      samples[i].lifted &&
      t >= 200 + 1000 / 60 &&
      Number.isFinite(samples[i].opacity)
    ) {
      expect(samples[i].opacity, detail).toBeLessThan(0.001);
    }
  }
  for (const sample of lifted) {
    expect(Math.abs(sample.x - open.x), detail).toBeLessThan(0.5);
    expect(Math.abs(sample.y - open.y), detail).toBeLessThan(0.5);
    expect(Math.abs(sample.width - open.width), detail).toBeLessThan(0.5);
  }
  expect(lifted.at(-1)?.opacity ?? 1, detail).toBeLessThan(0.5);
  expect(
    lifted.every(
      (s, i) => i === 0 || s.opacity <= lifted[i - 1].opacity + 1e-4,
    ),
    detail,
  ).toBe(true);
});

test(
  'storyboard: the lift, from the menu’s moment',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, center} = await openLiftStory(page);
    const playing = driver.play(tap(center, {holdMs: menuDisplayMs + 900}));
    await expect(
      page.locator('[data-testid="touch-context-menu"][popover]'),
    ).toBeAttached({timeout: 5_000});
    const viewport = page.viewportSize();
    const {storyboard} = await animationStoryboard(page, {
      name: 'contextmenu-lift',
      clip: {
        x: 0,
        y: Math.max(0, center.y - 120),
        width: viewport?.width ?? 402,
        height: 360,
      },
      times: timeline(450, 1000 / 30),
      measure: async () =>
        page.evaluate(() => {
          const card = document.querySelector(
            '[data-testid="touch-context-menu"]',
          );
          const layer = document.querySelector(
            '[data-astryx-context-menu-lift]',
          );
          return {
            width: card?.getBoundingClientRect().width.toFixed(1) ?? '-',
            backdrop:
              layer == null
                ? '-'
                : Number(getComputedStyle(layer, '::backdrop').opacity).toFixed(
                    3,
                  ),
          };
        }),
      columns: 5,
      cellScale: 0.5,
    });
    await releaseAnimations(page);
    await playing;
    await storyboard.write(testInfo);
    const widths = storyboard.frames.map(f => Number(f.data.width));
    expect(widths.at(-1)).toBeCloseTo(226, 0);
  },
);
