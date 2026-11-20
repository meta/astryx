// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paneSlide.interaction.browser.spec.ts
 * @input The a11y-spec Playwright entry and the interaction harness:
 *   Resizable's sliding-panel stories and their props fixtures
 * @output Proves the pane slides closed and open from the edge facing its
 *   handle, by every path, and nothing inside it moves, a scrolled pane
 *   included. Focus leaves a collapsing pane, which goes inert. It runs in
 *   Chromium and WebKit, with and without Reduce Motion
 * @position Interaction proof for createResizable.ts, resizablePane.ts and
 *   LayoutPanel.tsx
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';
import {settlingDuration, toSpring} from '../../motion/spring';
import {springs} from '../../motion/uikit/springs';

const storybook = withStorybook(test);

type Side = 'start' | 'end';

const STORY = {
  start: 'core-resizable--sliding-start-panel',
  end: 'core-resizable--sliding-end-panel',
  hookProps: 'core-resizable--sliding-panel-with-hook-props',
  handBuilt: 'core-resizable--panel-with-hand-built-props',
  controlled: 'core-resizable--sliding-controlled-panel',
  scrolled: 'core-resizable--sliding-scrolled-panel-fixture',
  defaultMinimum: 'core-resizable--sliding-panel-at-default-minimum-fixture',
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
  /** Where the pane's first child starts, along the row. */
  inside: number;
  /** How far the pane is scrolled down. */
  scrollTop: number;
  /** Whether a press on the handle where it shows lands on the handle. */
  pressTaken: boolean;
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
 * Installs, in the page, the reader of one moment of the pane and its handle.
 * The pane moves by no transform: its box is its layout, and its clip says
 * where it shows. The handle shows at its layout place plus its glide at the
 * glide's own time. The pane's margin box ends at that layout place in the
 * row. The handle's own rect is not read. WebKit reports a compositor-run
 * translate ahead of the frame time, in the rect and in the computed style
 * alike. In Chromium the two readings agree.
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
    const inside = pane.firstElementChild?.getBoundingClientRect().left ?? 0;
    const handleEdge =
      side === 'start'
        ? paneRect.right + (parseFloat(paneStyle.marginInlineEnd) || 0) + glideX
        : paneRect.left -
          (parseFloat(paneStyle.marginInlineStart) || 0) +
          glideX;
    // The middle of the handle where it shows, which a finger aims at.
    const handleRect = handle.getBoundingClientRect();
    const pressAt = document.elementFromPoint(
      handleEdge + ((side === 'start' ? 1 : -1) * handle.offsetWidth) / 2,
      handleRect.top + handleRect.height / 2,
    );
    return {
      shownEdge:
        side === 'start'
          ? paneRect.right - (insets[1] ?? 0)
          : paneRect.left + (insets[3] ?? 0),
      handleEdge,
      paneWidth: paneRect.width,
      inside,
      scrollTop: pane.scrollTop,
      pressTaken: pressAt != null && handle.contains(pressAt),
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
  __collapsedTextBefore?: string | null;
}

/**
 * Captures the collapse or open the input `trigger` starts at evenly spaced
 * moments. Every animation the change starts is paused as it is created and
 * held there. The module starts each one by setting its start time to the
 * timeline's current time, which would set it running. So none advances
 * while the test waits for a starved page. Then, in one task,
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
    capture.__collapsedTextBefore = document
      .querySelector('[role="separator"]')
      ?.getAttribute('aria-valuetext');
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
      // Wait until the change commits: an animation starts, or the handle
      // says the collapse state changed. Two more frames let a later commit
      // start its motion. Frames, not time, so a starved page only takes
      // longer. Nothing it starts can run meanwhile.
      const nextFrame = async () =>
        new Promise(resolve => requestAnimationFrame(resolve));
      const collapsedText = () =>
        document
          .querySelector('[role="separator"]')
          ?.getAttribute('aria-valuetext');
      while (
        animations.length === 0 &&
        collapsedText() === capture.__collapsedTextBefore
      ) {
        await nextFrame();
      }
      for (let frame = 0; frame < 2 && animations.length === 0; frame++) {
        await nextFrame();
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
 * Starts the motion the input `trigger` starts, paused at `atMs` into it, the
 * way `captureMotion` pauses it. It holds there until `releaseMotion`.
 */
async function holdMotionAt(
  page: Page,
  atMs: number,
  trigger: () => Promise<void>,
): Promise<void> {
  await page.evaluate(() => {
    const capture = window as unknown as CaptureWindow;
    const animations: Animation[] = [];
    capture.__paneAnimations = animations;
    capture.__collapsedTextBefore = document
      .querySelector('[role="separator"]')
      ?.getAttribute('aria-valuetext');
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
  const held = await page.evaluate(async at => {
    const capture = window as unknown as CaptureWindow;
    const animations = capture.__paneAnimations;
    // As in `captureMotion`: frames until the change commits, then two more.
    const nextFrame = async () =>
      new Promise(resolve => requestAnimationFrame(resolve));
    const collapsedText = () =>
      document
        .querySelector('[role="separator"]')
        ?.getAttribute('aria-valuetext');
    while (
      animations.length === 0 &&
      collapsedText() === capture.__collapsedTextBefore
    ) {
      await nextFrame();
    }
    for (let frame = 0; frame < 2 && animations.length === 0; frame++) {
      await nextFrame();
    }
    if (capture.__paneAnimate != null) {
      Element.prototype.animate = capture.__paneAnimate;
      capture.__paneAnimate = undefined;
    }
    for (const animation of animations) {
      Reflect.deleteProperty(animation, 'startTime');
      animation.currentTime = at;
    }
    return animations.length;
  }, atMs);
  expect(held).toBeGreaterThan(0);
}

/** Lets a held motion finish. */
async function releaseMotion(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const animation of (window as unknown as CaptureWindow)
      .__paneAnimations) {
      animation.finish();
    }
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
}

/**
 * Every captured moment keeps the pane's shown edge where it sits beside the
 * handle once the motion ends. No gap opens, and the edge never runs ahead.
 * A panel without a divider overlaps its handle by its collapse spacing only
 * while open. That overlap lies under the content's own spacing, and it
 * changes in the first moment.
 */
function expectEdgeOnHandle(frames: Frame[]): void {
  const end = frames[frames.length - 1];
  const settled = end.shownEdge - end.handleEdge;
  frames.forEach((frame, index) => {
    // The first frame is the rest before the input.
    if (index > 0 && frame.paneWidth > 0) {
      expect(
        Math.abs(frame.shownEdge - frame.handleEdge - settled),
        `moment ${index} of ${frames.length}: ${JSON.stringify(frame)}, at the end ${settled}`,
      ).toBeLessThanOrEqual(1.5);
    }
  });
}

/**
 * Nothing inside the pane moves while it shows. Its first child stays where
 * it is in `still`: the rest a pane conceals from, or the end it reveals to.
 */
function expectInsideStill(frames: Frame[], still: Frame): void {
  frames.forEach((frame, index) => {
    if (frame.paneWidth > 0) {
      expect(
        Math.abs(frame.inside - still.inside),
        `moment ${index} of ${frames.length}: ${JSON.stringify(frame)}`,
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
 * Proves one pane's slide. A button inside the pane collapses it: focus moves
 * to the handle, and the pane ends inert. Then the handle opens it, and no
 * focus moves. The shown edge stays on the handle at every captured moment of
 * both.
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
  // A slide, not a jump: the pane clips and the handle glides. The handle is
  // on its way at many captured moments, though not all: a spring settles its
  // last pixel late ...
  expect(closing.clips).toBe(true);
  expect(closing.glides).toBe(true);
  expect(travelling(closing.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
  // ... and the pane's shown edge stays on it throughout, with nothing inside
  // the pane moving.
  expectEdgeOnHandle(closing.frames);
  expectInsideStill(closing.frames, closing.frames[0]);
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
  expectInsideStill(opening.frames, opening.frames[opening.frames.length - 1]);
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

test("a panel that takes the hook's own props slides the same way", async ({
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

test('a scrolled panel keeps its scroll offset while it slides closed', async ({
  page,
}) => {
  await openFixture(page, STORY.scrolled);
  const pane = page.getByTestId('sliding-panel');
  await pane.evaluate(element => {
    element.scrollTop = 120;
  });
  const closing = await captureMotion(page, 'start', async () => {
    await page.getByRole('button', {name: 'Toggle panel'}).click();
  });
  expect(closing.clips).toBe(true);
  closing.frames.forEach((frame, index) => {
    if (frame.paneWidth > 0) {
      expect(
        frame.scrollTop,
        `moment ${index} of ${closing.frames.length}`,
      ).toBe(120);
    }
  });
  expectInsideStill(closing.frames, closing.frames[0]);
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

test('a key step under the collapsed size slides the panel closed on the theme curve, as a collapse does, not on the release spring', async ({
  page,
}) => {
  await openFixture(page, STORY.defaultMinimum);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  // A collapse from inside plays the theme's curve: the reference.
  await page.getByRole('button', {name: 'Close panel'}).focus();
  const collapse = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  await handle.focus();
  await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  // Down to the minimum, 50 px, in large steps: 150, 100, 50.
  for (const width of [150, 100, 50]) {
    await page.keyboard.press('Shift+ArrowLeft');
    await expect
      .poll(async () => (await pane.boundingBox())?.width ?? 0, {
        message: `the pane steps to ${width} px`,
        timeout: 2_000,
      })
      .toBeCloseTo(width, 0);
  }
  // One more step ends at 0, under the collapsed size (40 px).
  const closing = await captureMotion(page, 'start', async () => {
    await page.keyboard.press('Shift+ArrowLeft');
  });
  expectSlid(closing);
  expect(closing.durationMs).toBeCloseTo(collapse.durationMs, -1);
  expect(closing.durationMs).toBeLessThan(
    settlingDuration(toSpring(springs.settle)) * 1000 - 100,
  );
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  await expect(pane).toHaveAttribute('inert', '');
});

test('a lift past the threshold slides the panel closed on the settle spring, and a drag that reopens it follows the pointer with no slide', async ({
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
  await page.mouse.move(start.x + start.width / 2 - 190, y, {steps: 4});
  // Still before the lift, so it releases with no velocity.
  await page.waitForTimeout(200);
  await expect(pane).not.toHaveAttribute('inert', '');
  const closing = await captureMotion(page, 'start', async () => {
    await page.mouse.up();
  });
  expectSlid(closing);
  // It closes on the settle spring from the release velocity, here none.
  expect(closing.durationMs).toBeCloseTo(
    settlingDuration(toSpring(springs.settle)) * 1000,
    -1,
  );
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

/** Presses the handle where it shows and returns that point. */
async function pressHandle(page: Page): Promise<{x: number; y: number}> {
  const box = await page
    .getByRole('separator', {name: 'Resize panel'})
    .boundingBox();
  if (box == null) {
    throw new Error('the handle is not laid out');
  }
  const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  return at;
}

interface EdgeFrame {
  laidOut: number;
  buttonWidth: number;
  drawnEdge: number;
  handle: number;
  contentStart: number;
}

/** Records the pane, its first button, its handle and the content each frame. */
async function recordEdgeFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="sliding-panel"]',
    );
    const content = document.querySelector('[data-testid="sliding-content"]');
    const handle = document.querySelector(
      '[role="separator"][aria-label="Resize panel"]',
    );
    const button = pane?.querySelector('button');
    const frames: EdgeFrame[] = [];
    (window as unknown as {edgeFrames: EdgeFrame[]}).edgeFrames = frames;
    const step = () => {
      if (pane == null || content == null || handle == null || button == null) {
        return;
      }
      const handleBox = handle.getBoundingClientRect();
      frames.push({
        laidOut: pane.offsetWidth,
        buttonWidth: button.offsetWidth,
        drawnEdge: pane.getBoundingClientRect().right,
        handle: handleBox.left + handleBox.width / 2,
        contentStart: content.getBoundingClientRect().left,
      });
      if (frames.length < 2000) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
}

/**
 * Waits until no motion runs in the story, then two more frames, so the
 * frames end at rest. It waits on the motion, not on time.
 */
async function waitForSettledMotion(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.getElementById('storybook-root');
    return document
      .getAnimations()
      .every(
        animation =>
          animation.playState !== 'running' ||
          !(animation.effect instanceof KeyframeEffect) ||
          !(animation.effect.target instanceof Node) ||
          root?.contains(animation.effect.target) !== true,
      );
  });
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function edgeFrames(page: Page): Promise<EdgeFrame[]> {
  return page.evaluate(
    () => (window as unknown as {edgeFrames: EdgeFrame[]}).edgeFrames,
  );
}

test('past the maximum the edge moves at most 8 px, the pane never reflows, and the edge springs back after the lift', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const at = await pressHandle(page);
  const rest = at.x + 120;
  await recordEdgeFrames(page);
  // 200 px plus 260 px of pull would be 460 px against a 320 px maximum.
  await page.mouse.move(at.x + 260, at.y, {steps: 6});
  await page.waitForTimeout(100);
  await page.mouse.up();
  await waitForSettledMotion(page);
  const frames = await edgeFrames(page);
  const past = frames.filter(frame => frame.laidOut === 320);
  expect(past.length).toBeGreaterThan(2);
  // The pane keeps its laid-out width and its button never reflows.
  expect(new Set(past.map(frame => frame.buttonWidth)).size).toBe(1);
  expect(Math.max(...frames.map(frame => frame.laidOut))).toBe(320);
  // The edge stands past the limit by at most 8 px, then returns to it.
  const furthest = Math.max(...past.map(frame => frame.handle));
  expect(furthest).toBeGreaterThan(rest + 1);
  expect(furthest).toBeLessThanOrEqual(rest + 8.5);
  expect(frames.at(-1)?.handle).toBeCloseTo(rest, 0);
  await expect(
    page.getByRole('separator', {name: 'Resize panel'}),
  ).toHaveAttribute('aria-valuenow', '320');
});

test('past the maximum the handle alone moves, over the content beside it: the pane and the content keep their places', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const at = await pressHandle(page);
  await recordEdgeFrames(page);
  await page.mouse.move(at.x + 260, at.y, {steps: 6});
  await page.waitForTimeout(100);
  await page.mouse.up();
  await waitForSettledMotion(page);
  const frames = await edgeFrames(page);
  const past = frames.filter(frame => frame.laidOut === 320);
  expect(past.length).toBeGreaterThan(2);
  const spread = (values: number[]) =>
    Math.max(...values) - Math.min(...values);
  // The pane's drawn edge and the content's start stay where they lie.
  expect(spread(past.map(frame => frame.drawnEdge))).toBeLessThanOrEqual(0.5);
  expect(spread(past.map(frame => frame.contentStart))).toBeLessThanOrEqual(
    0.5,
  );
  // The handle passes over the content by at most 8 px.
  const restHandle = past.at(-1)?.handle ?? 0;
  const furthest = Math.max(...past.map(frame => frame.handle));
  expect(furthest).toBeGreaterThan(restHandle + 1);
  expect(furthest).toBeLessThanOrEqual(restHandle + 8.5);
});

test("a panel at the hook's size alone stops at the maximum, and nothing springs back after the lift", async ({
  page,
}) => {
  await openFixture(page, 'core-resizable--horizontal-split');
  const handle = page.getByRole('separator', {name: 'Resize sidebar'});
  await expect(handle).toHaveAttribute('aria-valuenow', '250');
  const start = await handle.boundingBox();
  if (start == null) {
    throw new Error('the handle is not laid out');
  }
  const at = {x: start.x + start.width / 2, y: start.y + start.height / 2};
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  // 250 px plus 400 px of pull would be 650 px against a 500 px maximum.
  await page.mouse.move(at.x + 400, at.y, {steps: 6});
  const pulled = await handle.boundingBox();
  expect(Math.round((pulled?.x ?? 0) - start.x)).toBe(250);
  await page.mouse.up();
  const lifted = await handle.boundingBox();
  expect(Math.round((lifted?.x ?? 0) - start.x)).toBe(250);
  await expect(handle).toHaveAttribute('aria-valuenow', '500');
});

test('a spring-back past a limit lays out no frame: the edge glides back over the held pane', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const at = await pressHandle(page);
  await page.mouse.move(at.x + 260, at.y, {steps: 6});
  // Each frame from here on: the pane's laid-out width and the handle's
  // drawn middle.
  await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="sliding-panel"]',
    );
    const handle = document.querySelector(
      '[role="separator"][aria-label="Resize panel"]',
    );
    const trace: {laidOut: number; drawn: number}[] = [];
    (window as unknown as {springTrace: typeof trace}).springTrace = trace;
    const startedAt = performance.now();
    const step = () => {
      if (pane == null || handle == null) {
        return;
      }
      const box = handle.getBoundingClientRect();
      trace.push({laidOut: pane.offsetWidth, drawn: box.x + box.width / 2});
      if (performance.now() - startedAt < 1200) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  });
  await page.mouse.up();
  await page.waitForTimeout(1300);
  const trace = await page.evaluate(
    () =>
      (
        window as unknown as {
          springTrace: {laidOut: number; drawn: number}[];
        }
      ).springTrace,
  );
  // The pane keeps the width it was pulled to until it takes the maximum,
  // once: no frame in between lays the row out.
  const widths = [...new Set(trace.map(frame => frame.laidOut))];
  expect(widths.length).toBeLessThanOrEqual(2);
  expect(widths.at(-1)).toBe(320);
  // The edge still passes through the places in between.
  const first = trace[0]?.drawn ?? 0;
  const last = trace.at(-1)?.drawn ?? 0;
  const between = trace.filter(
    frame => frame.drawn < first - 1 && frame.drawn > last + 1,
  );
  expect(between.length).toBeGreaterThanOrEqual(3);
});

for (const [label, waitMs] of [
  ['at once', 0],
  ['50 ms after', 50],
  ['mid-settle', 120],
] as const) {
  test(`a re-grab ${label} the lift past the maximum moves the edge 1:1 from where it shows`, async ({
    page,
  }) => {
    await openFixture(page, STORY.start);
    await expectPresent(page);
    const handle = page.getByRole('separator', {name: 'Resize panel'});
    const at = await pressHandle(page);
    // 200 px plus 260 px of pull would be 460 px against a 320 px maximum.
    await page.mouse.move(at.x + 260, at.y, {steps: 6});
    await page.mouse.up();
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    const shown = await handle.boundingBox();
    if (shown == null) {
      throw new Error('the handle is not laid out');
    }
    const grab = {x: shown.x + shown.width / 2, y: at.y};
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 40, grab.y, {steps: 4});
    // The edge left from where it showed, past the maximum. It followed the
    // finger 40 px back, so the pane is about 40 px under it. A spring-back
    // from an outward release can carry the edge a few px past the band.
    const now = Number(await handle.getAttribute('aria-valuenow'));
    expect(now).toBeLessThan(295);
    expect(now).toBeGreaterThan(270);
    await page.mouse.up();
  });
}

/** The handle's drawn middle, the pane's shown edge and the content's start. */
async function shownParts(page: Page): Promise<{
  handle: number;
  paneEdge: number;
  paneStart: number;
  content: number;
}> {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="sliding-panel"]',
    );
    const handle = document.querySelector(
      '[role="separator"][aria-label="Resize panel"]',
    );
    const content = document.querySelector('[data-testid="sliding-content"]');
    if (pane == null || handle == null || content == null) {
      throw new Error('the sliding panel story did not render');
    }
    const box = pane.getBoundingClientRect();
    // inset(top right bottom left): the clip on the edge facing the handle.
    const insets = (
      getComputedStyle(pane).clipPath.match(/-?[\d.]+(px|%)?/g) ?? []
    ).map(value =>
      value.endsWith('%')
        ? (parseFloat(value) / 100) * box.width
        : parseFloat(value),
    );
    const handleBox = handle.getBoundingClientRect();
    return {
      handle: handleBox.left + handleBox.width / 2,
      paneEdge: box.right - (insets[1] ?? 0),
      paneStart: box.left,
      content: content.getBoundingClientRect().left,
    };
  });
}

/** The script motions still on the row's children: none once a slide lands. */
async function rowMotions(page: Page): Promise<number> {
  return page.evaluate(() => {
    const row = document.querySelector(
      '[data-testid="sliding-panel"]',
    )?.parentElement;
    return [...(row?.children ?? [])]
      .flatMap(child => child.getAnimations())
      .filter(
        motion =>
          !('transitionProperty' in motion) && !('animationName' in motion),
      ).length;
  });
}

/** Lifts past the threshold with no velocity and holds the close `atMs` in. */
async function liftToCloseAndHold(
  page: Page,
  atMs: number,
): Promise<{x: number; y: number}> {
  const at = await pressHandle(page);
  // 200 px less 190 px is 10 px: under the 40 px collapse threshold.
  await page.mouse.move(at.x - 190, at.y, {steps: 4});
  // Still before the lift, so it releases with no velocity.
  await page.waitForTimeout(200);
  await holdMotionAt(page, atMs, async () => {
    await page.mouse.up();
  });
  return at;
}

test('a re-grab while the panel slides shut holds it where it shows, and the finger moves the slide, with no jump', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  // Open, the pane overlaps its handle by its collapse spacing; while it
  // slides it does not.
  const open = await shownParts(page);
  const at = await liftToCloseAndHold(page, 120);
  await expect(pane).toHaveAttribute('inert', '');
  const held = await shownParts(page);
  // The size the handle stands at: the pane opens at 200 px.
  const sizeAt = (handleX: number) => 200 + handleX - open.handle;
  const heldSize = sizeAt(held.handle);
  expect(heldSize).toBeLessThan(110);
  await page.mouse.move(held.handle, at.y);
  await page.mouse.down();
  await page.mouse.move(held.handle + 10, at.y, {steps: 2});
  // Nothing finished the held slide: the finger moved it 10 px.
  const moved = await shownParts(page);
  expect(Math.abs(moved.handle - (held.handle + 10))).toBeLessThan(1);
  // The pane's shown edge and the content keep their places beside the handle.
  expect(
    Math.abs(moved.handle - moved.paneEdge - (held.handle - held.paneEdge)),
  ).toBeLessThan(1);
  expect(
    Math.abs(moved.content - moved.handle - (held.content - held.handle)),
  ).toBeLessThan(1);
  await expect(pane).toHaveAttribute('inert', '');
  // Past the 120 px minimum the pane opens at the finger's size, with no
  // slide left to play over it.
  const travel = 120 - heldSize + 20;
  await page.mouse.move(held.handle + travel, at.y, {steps: 4});
  await expect(pane).not.toHaveAttribute('inert', '');
  const opened = await shownParts(page);
  expect(Math.abs(opened.handle - (held.handle + travel))).toBeLessThan(1);
  expect(
    Math.abs(opened.handle - opened.paneEdge - (open.handle - open.paneEdge)),
  ).toBeLessThan(1);
  expect(
    Math.abs(opened.content - opened.handle - (open.content - open.handle)),
  ).toBeLessThan(1);
  expect(
    Math.abs(
      Number(await handle.getAttribute('aria-valuenow')) - (heldSize + travel),
    ),
  ).toBeLessThan(1.5);
  expect(await rowMotions(page)).toBe(0);
  await page.mouse.up();
});

for (const side of ['start', 'end'] as const) {
  test(`a closing lift slides the ${side} panel's handle shut from where it shows, never back toward open`, async ({
    page,
  }) => {
    await openFixture(page, STORY[side]);
    await expectPresent(page);
    // Toward closed is left for a start panel and right for an end one.
    const towardOpen = side === 'start' ? 1 : -1;
    const at = await pressHandle(page);
    // 190 px toward closed: past the minimum, where the handle bands, and
    // under the 40 px collapse threshold.
    await page.mouse.move(at.x - towardOpen * 190, at.y, {steps: 4});
    // Still before the lift, so it releases with no velocity.
    await page.waitForTimeout(250);
    await recordEdgeFrames(page);
    await page.waitForTimeout(50);
    await page.mouse.up();
    await waitForSettledMotion(page);
    const frames = await page.evaluate(
      () => (window as unknown as {edgeFrames: EdgeFrame[]}).edgeFrames,
    );
    expect(frames.length).toBeGreaterThan(10);
    for (let index = 1; index < frames.length; index++) {
      expect(
        towardOpen * (frames[index].handle - frames[index - 1].handle),
      ).toBeLessThan(0.5);
    }
  });
}

test('a lift while a re-grab holds the closing panel shuts it under the collapse threshold', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const open = await shownParts(page);
  const at = await liftToCloseAndHold(page, 120);
  const held = await shownParts(page);
  // The size the handle stands at: the pane opens at 200 px.
  const heldSize = 200 + held.handle - open.handle;
  await page.mouse.move(held.handle, at.y);
  await page.mouse.down();
  // Down to about 20 px, under the 40 px threshold.
  await page.mouse.move(held.handle - (heldSize - 20), at.y, {steps: 3});
  await page.mouse.up();
  await waitForSettledMotion(page);
  await expect(pane).toHaveAttribute('inert', '');
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
});

test('a lift while a re-grab holds the closing panel above the collapse threshold opens it to the minimum', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  const open = await shownParts(page);
  const at = await liftToCloseAndHold(page, 120);
  const held = await shownParts(page);
  await page.mouse.move(held.handle, at.y);
  await page.mouse.down();
  await page.mouse.move(held.handle + 5, at.y, {steps: 2});
  await page.mouse.up();
  await waitForSettledMotion(page);
  await expect(pane).not.toHaveAttribute('inert', '');
  await expect(handle).toHaveAttribute('aria-valuenow', '120');
  const rest = await shownParts(page);
  expect(
    Math.abs(rest.handle - rest.paneEdge - (open.handle - open.paneEdge)),
  ).toBeLessThan(1);
  expect(
    Math.abs(rest.content - rest.handle - (open.content - open.handle)),
  ).toBeLessThan(1);
  // No paused motion of the held slide is left to hold a stale transform.
  expect(await rowMotions(page)).toBe(0);
});

test('an arrow key at the maximum moves nothing past it: no band, no spring-back', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await handle.focus();
  await page.keyboard.press('End');
  const max = await handle.getAttribute('aria-valuemax');
  await expect(handle).toHaveAttribute('aria-valuenow', max ?? '');
  await page.keyboard.press('ArrowRight');
  // The handle carries no drawn offset and plays no motion of its own.
  const drawn = await handle.evaluate(node => ({
    translate: getComputedStyle(node).translate,
    motions: node.getAnimations().length,
  }));
  expect(drawn).toEqual({translate: 'none', motions: 0});
  await expect(handle).toHaveAttribute('aria-valuenow', max ?? '');
});

test('below the minimum the edge moves at most 8 px, the pane keeps its minimum, and a slow lift above the threshold springs the edge back', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const at = await pressHandle(page);
  const minimum = at.x - 80;
  await recordEdgeFrames(page);
  // 200 px less 130 px is 70 px: under the 120 px minimum, over the 40 px
  // collapse threshold.
  await page.mouse.move(at.x - 130, at.y, {steps: 6});
  await page.waitForTimeout(200);
  await page.mouse.up();
  await waitForSettledMotion(page);
  const frames = await edgeFrames(page);
  expect(Math.min(...frames.map(frame => frame.laidOut))).toBe(120);
  const nearest = Math.min(...frames.map(frame => frame.handle));
  expect(nearest).toBeLessThan(minimum - 1);
  expect(nearest).toBeGreaterThanOrEqual(minimum - 8.5);
  expect(frames.at(-1)?.handle).toBeCloseTo(minimum, 0);
  await expect(pane).not.toHaveAttribute('inert', '');
});

test('a flick toward closing from above the threshold closes on its lift', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const at = await pressHandle(page);
  // 110 px is over the threshold; the release velocity carries it past.
  await page.mouse.move(at.x - 90, at.y, {steps: 3});
  await page.mouse.up();
  await expect(pane).toHaveAttribute('inert', '');
});

test('a press where the handle shows lands on it at every moment of a slide, on both sides', async ({
  page,
}) => {
  for (const side of ['start', 'end'] as const) {
    await openFixture(page, STORY[side]);
    await expectPresent(page);
    await page.getByRole('button', {name: 'Toggle panel'}).focus();
    const closing = await captureMotion(page, side, async () => {
      await page.keyboard.press('Enter');
    });
    const opening = await captureMotion(page, side, async () => {
      await page.keyboard.press('Enter');
    });
    for (const motion of [closing, opening]) {
      expect(travelling(motion.frames)).toBeGreaterThanOrEqual(MOMENTS / 3);
      expect(motion.frames.map(frame => frame.pressTaken).indexOf(false)).toBe(
        -1,
      );
    }
  }
});

test('a drag that starts on the handle 40 ms into a slide takes the handle and reopens the pane', async ({
  page,
}) => {
  await openFixture(page, STORY.start);
  await expectPresent(page);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await holdMotionAt(page, 40, async () => {
    await page.getByRole('button', {name: 'Toggle panel'}).click();
  });
  const box = await handle.boundingBox();
  if (box == null) {
    throw new Error('the handle is not laid out');
  }
  const frame = await readNow(page, 'start');
  const x = frame.handleEdge + 0.5;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(handle).toHaveAttribute('data-resizing', 'true');
  await page.mouse.move(x + 160, y, {steps: 4});
  await page.mouse.up();
  await releaseMotion(page);
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
