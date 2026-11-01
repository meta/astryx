// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paneSlide.interaction.browser.spec.ts
 * @input Uses @playwright/test and the interaction harness (a built
 *   Storybook): Resizable's sliding-panel stories, a LayoutPanel at the size
 *   of a `useResizable(handleRef, options)` region beside its ResizeHandle,
 *   at the start and at the end of a Layout, and the configuration-object
 *   fixtures: a start LayoutPanel that takes the hook's own `props`, and one
 *   that takes a hand-built `ResizableProps` object
 * @output Proves the pane slides closed and open by spec:AST-105 FR9's edge
 *   reveal from the edge facing its handle, which it never leaves at any
 *   moment of the motion (component:Resizable FR8; component:LayoutPanel
 *   FR7), by every path: collapse() and Enter, a toggle, a controlled
 *   isCollapsed, a double-click, the grow arrow, and a drag past the
 *   threshold, while a drag that reopens follows the pointer with no slide;
 *   and that focus inside the collapsing pane moves to the handle and the
 *   collapsed pane is inert and hidden (component:LayoutPanel AR2), in
 *   Chromium and WebKit, with and without Reduce Motion; the hook's own props
 *   slide the same way, and a hand-built object collapses without a slide but
 *   still moves focus and goes inert
 * @position Interaction proof for packages/core/src/Resizable/createResizable.ts,
 *   resizablePane.ts and packages/core/src/Layout/LayoutPanel.tsx
 */

import {expect, test, type Page} from '@playwright/test';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

type Side = 'start' | 'end';

const STORY = {
  start: 'core-resizable--sliding-start-panel',
  end: 'core-resizable--sliding-end-panel',
  hookProps: 'core-resizable--sliding-panel-with-hook-props',
  handBuilt: 'core-resizable--panel-with-hand-built-props',
  controlled: 'core-resizable--sliding-controlled-panel',
} as const;

/** How many evenly spaced moments of a motion are captured. */
const MOMENTS = 24;

/** One moment's geometry: the pane's shown edge facing the handle, and the handle's. */
interface Frame {
  /** The pane's edge that faces the handle, where its clip shows it end. */
  shownEdge: number;
  /** The handle's edge that faces the pane. */
  handleEdge: number;
  paneWidth: number;
}

/** What a collapse or open did, captured at evenly spaced moments. */
interface Motion {
  /** The rest before the input, then each moment, then the end. */
  frames: Frame[];
  /** Whether the pane got a clip animation and the handle a glide. */
  clips: boolean;
  glides: boolean;
  durationMs: number;
}

/**
 * Installs, in the page, the reader of one moment of the pane and its handle. The pane moves by
 * no transform: its box is its layout, and its clip says where it shows. The
 * handle shows at its layout place, which the pane's margin box ends at in
 * the row, plus its glide at the glide's own time; its own rect is not read,
 * because WebKit reports a compositor-run translate ahead of the frame time,
 * in the rect and in the computed style alike. In Chromium the two readings
 * agree.
 */
interface ReaderWindow {
  __readPaneFrame: (side: Side) => Frame;
}

function installFrameReader(): void {
  (window as unknown as ReaderWindow).__readPaneFrame = (side: Side): Frame => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="sliding-panel"]',
    );
    const handle = document.querySelector<HTMLElement>('[role="separator"]');
    if (pane == null || handle == null) {
      throw new Error('the sliding panel story did not render');
    }
    const pixels = (value: unknown) =>
      [...String(value).matchAll(/(-?[\d.e+-]+)px/g)].map(match =>
        Number(match[1]),
      );
    const glide = handle
      .getAnimations()
      .find(
        animation =>
          animation.effect instanceof KeyframeEffect &&
          animation.effect.getKeyframes().some(k => k.translate != null),
      );
    let glideX = 0;
    const effect = glide?.effect;
    if (glide != null && effect instanceof KeyframeEffect) {
      const keyframes = effect.getKeyframes();
      if (keyframes.length === 1) {
        glideX = pixels(keyframes[0].translate)[0] ?? 0;
      } else if (keyframes.length > 1) {
        const duration = Number(effect.getTiming().duration);
        const at = Math.min(
          1,
          Math.max(0, Number(glide.currentTime ?? 0) / duration),
        );
        let index = 0;
        while (
          index < keyframes.length - 2 &&
          keyframes[index + 1].computedOffset < at
        ) {
          index++;
        }
        const [x0 = 0] = pixels(keyframes[index].translate);
        const [x1 = 0] = pixels(keyframes[index + 1].translate);
        const span =
          keyframes[index + 1].computedOffset - keyframes[index].computedOffset;
        const progress =
          span > 0 ? (at - keyframes[index].computedOffset) / span : 1;
        glideX = x0 + (x1 - x0) * progress;
      }
    }
    const paneRect = pane.getBoundingClientRect();
    const paneStyle = getComputedStyle(pane);
    // inset(top right bottom left): the clip on the edge facing the handle.
    const insets = (paneStyle.clipPath.match(/-?[\d.]+(px|%)?/g) ?? []).map(
      value =>
        value.endsWith('%')
          ? (parseFloat(value) / 100) * paneRect.width
          : parseFloat(value),
    );
    return side === 'start'
      ? {
          shownEdge: paneRect.right - (insets[1] ?? 0),
          handleEdge:
            paneRect.right +
            (parseFloat(paneStyle.marginInlineEnd) || 0) +
            glideX,
          paneWidth: paneRect.width,
        }
      : {
          shownEdge: paneRect.left + (insets[3] ?? 0),
          handleEdge:
            paneRect.left -
            (parseFloat(paneStyle.marginInlineStart) || 0) +
            glideX,
          paneWidth: paneRect.width,
        };
  };
}

/** Reads one moment now. */
async function readNow(page: Page, side: Side): Promise<Frame> {
  return page.evaluate(
    sideArg => (window as unknown as ReaderWindow).__readPaneFrame(sideArg),
    side,
  );
}

/** Opens a fixture with the frame reader installed. */
async function openFixture(page: Page, storyId: string): Promise<void> {
  await page.addInitScript(installFrameReader);
  await openStory(page, storybook(), storyId);
}

interface CaptureWindow extends ReaderWindow {
  __paneAnimations: Animation[];
  __paneAnimate?: Element['animate'];
}

/**
 * Captures the collapse or open the input `trigger` starts at evenly spaced
 * moments. Every animation the change starts is paused the moment it is
 * created and held there (the module starts each one on the timeline's
 * current time by setting its start time, which would set it running), so
 * none advances while the test waits for a starved page. Then, in one task,
 * each is set to the same moment before the geometry is read, and they
 * finish. Neither a renderer that skips frames nor a page that answers late
 * can hide a slide or fake one.
 */
async function captureMotion(
  page: Page,
  side: Side,
  trigger: () => Promise<void>,
): Promise<Motion> {
  const rest = await readNow(page, side);
  await page.evaluate(() => {
    const capture = window as unknown as CaptureWindow;
    const animations: Animation[] = [];
    capture.__paneAnimations = animations;
    const animate = Element.prototype.animate;
    capture.__paneAnimate = animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const animation = animate.apply(this, args);
      animation.pause();
      Object.defineProperty(animation, 'startTime', {
        configurable: true,
        get: () => null,
        set: () => {},
      });
      animations.push(animation);
      return animation;
    };
  });
  await trigger();
  const motion = await page.evaluate(
    async ({sideArg, moments}) => {
      const capture = window as unknown as CaptureWindow;
      const animations = capture.__paneAnimations;
      // The change commits in the input's own task; give a later commit time
      // to land before deciding nothing animates. Nothing it starts can run
      // meanwhile.
      for (
        let waited = 0;
        waited < 1000 && animations.length === 0;
        waited += 50
      ) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (capture.__paneAnimate != null) {
        Element.prototype.animate = capture.__paneAnimate;
        capture.__paneAnimate = undefined;
      }
      for (const animation of animations) {
        Reflect.deleteProperty(animation, 'startTime');
      }
      const pane = document.querySelector('[data-testid="sliding-panel"]');
      const handle = document.querySelector('[role="separator"]');
      const keyframesOf = (animation: Animation) =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes()
          : [];
      const targetOf = (animation: Animation) =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.target
          : null;
      const clips = animations.some(
        a =>
          targetOf(a) === pane && keyframesOf(a).some(k => k.clipPath != null),
      );
      const glides = animations.some(
        a =>
          targetOf(a) === handle &&
          keyframesOf(a).some(k => k.translate != null),
      );
      const durationMs =
        animations.length === 0
          ? 0
          : Math.max(
              ...animations.map(a =>
                Number(a.effect?.getComputedTiming().endTime),
              ),
            );
      const frames: Frame[] = [];
      // One task: no frame passes between setting a moment and reading it.
      // Moments up to, not at, the end: a motion's effects stop applying at
      // their end, before its finish drops what it holds.
      for (let moment = 0; durationMs > 0 && moment < moments; moment++) {
        for (const animation of animations) {
          animation.currentTime = (durationMs * moment) / moments;
        }
        frames.push(capture.__readPaneFrame(sideArg));
      }
      for (const animation of animations) {
        animation.finish();
      }
      // What a finished motion leaves behind, once its holds are dropped.
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      frames.push(capture.__readPaneFrame(sideArg));
      return {frames, clips, glides, durationMs};
    },
    {sideArg: side, moments: MOMENTS},
  );
  return {...motion, frames: [rest, ...motion.frames]};
}

/**
 * Every captured moment keeps the pane's shown edge where it sits beside the
 * handle at rest (a panel without a divider overlaps its handle by its
 * collapsed spacing): no gap opens and the edge never runs ahead.
 */
function expectEdgeOnHandle(frames: Frame[]): void {
  const rest = frames[0].shownEdge - frames[0].handleEdge;
  frames.forEach((frame, index) => {
    if (frame.paneWidth > 0) {
      expect(
        Math.abs(frame.shownEdge - frame.handleEdge - rest),
        `moment ${index} of ${frames.length}: ${JSON.stringify(frame)}, at rest ${rest}`,
      ).toBeLessThanOrEqual(1.5);
    }
  });
}

/**
 * How many captured moments show the handle strictly between where it
 * started and where it ended, moving one way.
 */
function travelling(frames: Frame[]): number {
  const from = frames[0].handleEdge;
  const to = frames[frames.length - 1].handleEdge;
  const low = Math.min(from, to) + 1;
  const high = Math.max(from, to) - 1;
  return frames.filter(f => f.handleEdge > low && f.handleEdge < high).length;
}

/**
 * The pane's width once collapsed: its region's size is 0, and a border-box
 * LayoutPanel keeps only its inline padding and borders.
 */
async function collapsedWidthOf(page: Page): Promise<number> {
  return page.getByTestId('sliding-panel').evaluate(element => {
    const style = getComputedStyle(element);
    return [
      style.paddingInlineStart,
      style.paddingInlineEnd,
      style.borderInlineStartWidth,
      style.borderInlineEndWidth,
    ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
  });
}

/** The pane, its handle and the content are present and painted. */
async function expectPresent(page: Page): Promise<void> {
  for (const element of [
    page.getByTestId('sliding-panel'),
    page.getByRole('separator', {name: 'Resize panel'}),
    page.getByTestId('sliding-content'),
  ]) {
    await expect(element).toHaveCount(1);
    const box = await element.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
  expect(
    (await page.getByTestId('sliding-panel').boundingBox())?.width,
  ).toBeCloseTo(200, 0);
}

/**
 * Proves one pane's slide: collapsed from a button inside it (focus moves to
 * the handle, the pane ends inert), then opened from the handle (no focus
 * moves), its shown edge on the handle at every captured moment of both.
 */
async function expectSlide(
  page: Page,
  side: Side,
  storyId: string,
): Promise<void> {
  await openFixture(page, storyId);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});

  await page.getByRole('button', {name: 'Close panel'}).focus();
  const closing = await captureMotion(page, side, async () => {
    await page.keyboard.press('Enter');
  });
  // A slide, not a jump: the pane clips and the handle glides, and the
  // handle is on its way at many captured moments (a spring settles its last
  // pixel late, so not all of them) ...
  expect(closing.clips).toBe(true);
  expect(closing.glides).toBe(true);
  expect(travelling(closing.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  // ... and the pane's shown edge stays on it throughout.
  expectEdgeOnHandle(closing.frames);
  // It ends where the collapsed layout puts it, with nothing held.
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  await expect(pane).toHaveAttribute('aria-hidden', 'true');

  // Open from the handle: no focus moves.
  const opening = await captureMotion(page, side, async () => {
    await page.keyboard.press('Enter');
  });
  expect(opening.glides).toBe(true);
  expect(travelling(opening.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  expectEdgeOnHandle(opening.frames);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await expect(handle).toBeFocused();
  await expect(pane).not.toHaveAttribute('inert', '');
  await expect(pane).not.toHaveAttribute('aria-hidden', 'true');
}

for (const side of ['start', 'end'] as const) {
  test(`a ${side} panel slides closed and open from the edge facing its handle, and focus inside it moves to the handle`, async ({
    page,
  }) => {
    await expectSlide(page, side, STORY[side]);
  });
}

test("a panel that takes the configuration-object hook's own props slides the same way", async ({
  page,
}) => {
  await expectSlide(page, 'start', STORY.hookProps);
});

test('a panel that takes a hand-built ResizableProps object collapses and opens without a slide, and focus still leaves it', async ({
  page,
}) => {
  await openFixture(page, STORY.handBuilt);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await page.getByRole('button', {name: 'Close panel'}).focus();
  const closing = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(closing.clips).toBe(false);
  expect(closing.glides).toBe(false);
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  await expect(pane).toHaveAttribute('aria-hidden', 'true');
  const opening = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(opening.clips).toBe(false);
  expect(opening.glides).toBe(false);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await expect(handle).toBeFocused();
  await expect(pane).not.toHaveAttribute('inert', '');
});

/** A slide: the pane clips and the handle glides, with the edge on the handle. */
function expectSlid(motion: Motion): void {
  expect(motion.clips).toBe(true);
  expect(motion.glides).toBe(true);
  expect(travelling(motion.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  expectEdgeOnHandle(motion.frames);
}

test('a toggle outside the panel slides it closed and open, and keeps its focus', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const toggle = page.getByRole('button', {name: 'Toggle panel'});
  await toggle.focus();
  expectSlid(
    await captureMotion(page, 'start', async () => {
      await page.keyboard.press('Enter');
    }),
  );
  await expect(toggle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  const opening = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(opening.glides).toBe(true);
  expect(travelling(opening.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  expectEdgeOnHandle(opening.frames);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await expect(toggle).toBeFocused();
});

test('a controlled isCollapsed change slides the panel closed and open', async ({
  page,
}) => {
  await openFixture(page, STORY.controlled);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const toggle = page.getByRole('button', {name: 'Toggle panel'});
  await toggle.focus();
  expectSlid(
    await captureMotion(page, 'start', async () => {
      await page.keyboard.press('Enter');
    }),
  );
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  await expect(pane).toHaveAttribute('inert', '');
  const opening = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(opening.glides).toBe(true);
  expect(travelling(opening.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  expectEdgeOnHandle(opening.frames);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await expect(pane).not.toHaveAttribute('inert', '');
});

test('a double-click on the handle slides the panel closed and open', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  expectSlid(
    await captureMotion(page, 'start', async () => {
      await handle.dblclick();
    }),
  );
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  const opening = await captureMotion(page, 'start', async () => {
    await handle.dblclick();
  });
  expect(opening.glides).toBe(true);
  expectEdgeOnHandle(opening.frames);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
});

test('the grow arrow opens a collapsed panel with a slide', async ({page}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await handle.focus();
  await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  const opening = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('ArrowRight');
  });
  expect(opening.glides).toBe(true);
  expect(travelling(opening.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  expectEdgeOnHandle(opening.frames);
  expect((await pane.boundingBox())?.width ?? 0).toBeGreaterThan(100);
});

test('a drag past the threshold slides the panel closed, and a drag that reopens it follows the pointer with no slide', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  const start = await handle.boundingBox();
  if (start == null) {
    throw new Error('the handle is not laid out');
  }
  const y = start.y + start.height / 2;
  await page.mouse.move(start.x + start.width / 2, y);
  await page.mouse.down();
  expectSlid(
    await captureMotion(page, 'start', async () => {
      await page.mouse.move(start.x + start.width / 2 - 190, y, {steps: 4});
    }),
  );
  await page.mouse.up();
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );

  const collapsed = await handle.boundingBox();
  if (collapsed == null) {
    throw new Error('the handle is not laid out');
  }
  await page.mouse.move(collapsed.x + collapsed.width / 2, y);
  await page.mouse.down();
  const reopening = await captureMotion(page, 'start', async () => {
    await page.mouse.move(collapsed.x + collapsed.width / 2 + 160, y, {
      steps: 4,
    });
  });
  await page.mouse.up();
  // The pointer drives the edge: no clip and no glide play.
  expect(reopening.clips).toBe(false);
  expect(reopening.glides).toBe(false);
  expect((await pane.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  await expect(pane).not.toHaveAttribute('inert', '');
});

test('under Reduce Motion the pane does not travel, and focus still leaves it', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await page.getByRole('button', {name: 'Close panel'}).focus();
  const closing = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(closing.glides).toBe(false);
  expect(travelling(closing.frames)).toBe(0);
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  const opening = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(opening.glides).toBe(false);
  expect(travelling(opening.frames)).toBe(0);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
});
