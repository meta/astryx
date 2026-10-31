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
 *   reveal from the edge facing its handle, which it never leaves on any
 *   frame (component:Resizable FR8; component:LayoutPanel FR7), and that
 *   focus inside the collapsing pane moves to the handle and the collapsed
 *   pane is inert and hidden (component:LayoutPanel AR2), in Chromium and
 *   WebKit, with and without Reduce Motion; the hook's own props slide the
 *   same way, and a hand-built object collapses without a slide but still
 *   moves focus and goes inert
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
} as const;

/** One frame's geometry: the pane's shown edge facing the handle, and the handle's. */
interface Frame {
  /** The pane's edge that faces the handle, where its clip shows it end. */
  shownEdge: number;
  /** The handle's edge that faces the pane. */
  handleEdge: number;
  paneWidth: number;
}

/**
 * Samples every frame from now until the pane's, handle's and content's
 * animations have finished, after the input `trigger` sends.
 */
async function framesOf(
  page: Page,
  side: Side,
  trigger: () => Promise<void>,
): Promise<Frame[]> {
  await page.evaluate(sideArg => {
    const pane = document.querySelector<HTMLElement>(
      '[data-testid="sliding-panel"]',
    );
    const handle = document.querySelector<HTMLElement>('[role="separator"]');
    if (pane == null || handle == null) {
      throw new Error('the sliding panel story did not render');
    }
    const frames: Frame[] = [];
    /**
     * The translate an element's glide gives it at the glide's current time,
     * read from the glide's keyframes; 0 with no glide.
     */
    const glideOffset = (element: HTMLElement): number => {
      const glide = element
        .getAnimations()
        .find(
          animation =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect.getKeyframes().some(k => k.translate != null),
        );
      const effect = glide?.effect;
      if (glide == null || !(effect instanceof KeyframeEffect)) {
        return 0;
      }
      const keyframes = effect.getKeyframes();
      const pixels = (value: unknown) =>
        [...String(value).matchAll(/(-?[\d.e+-]+)px/g)].map(match =>
          Number(match[1]),
        );
      if (keyframes.length < 2) {
        return pixels(keyframes[0]?.translate)[0] ?? 0;
      }
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
      return x0 + (x1 - x0) * progress;
    };
    const read = () => {
      // The pane moves by no transform: its box is its layout, and its clip
      // runs on the main thread at the frame time.
      const paneRect = pane.getBoundingClientRect();
      const paneStyle = getComputedStyle(pane);
      // inset(top right bottom left): the clip on the edge facing the handle.
      const insets = (paneStyle.clipPath.match(/-?[\d.]+(px|%)?/g) ?? []).map(
        value =>
          value.endsWith('%')
            ? (parseFloat(value) / 100) * paneRect.width
            : parseFloat(value),
      );
      const right = insets[1] ?? 0;
      const left = insets[3] ?? 0;
      // The handle shows at its layout place, which the pane's margin box
      // ends at in the row, plus its glide at the glide's own time. Its own
      // rect is not read: WebKit reports a compositor-run translate ahead of
      // the frame time, by up to about 1.8 px at the fastest part of a
      // collapse, in the rect and in the computed style alike. In Chromium the
      // two readings agree.
      const glide = glideOffset(handle);
      frames.push(
        sideArg === 'start'
          ? {
              shownEdge: paneRect.right - right,
              handleEdge:
                paneRect.right +
                (parseFloat(paneStyle.marginInlineEnd) || 0) +
                glide,
              paneWidth: paneRect.width,
            }
          : {
              shownEdge: paneRect.left + left,
              handleEdge:
                paneRect.left -
                (parseFloat(paneStyle.marginInlineStart) || 0) +
                glide,
              paneWidth: paneRect.width,
            },
      );
    };
    const state = {frames, isSampling: true};
    (window as unknown as {__paneFrames: typeof state}).__paneFrames = state;
    // The first frame is the rest before the input.
    read();
    const tick = () => {
      read();
      if (state.isSampling) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, side);
  await trigger();
  return page.evaluate(async () => {
    const state = (
      window as unknown as {
        __paneFrames: {frames: Frame[]; isSampling: boolean};
      }
    ).__paneFrames;
    // The motion starts in the commit's frame; wait for it, then for it to end.
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
    const elements = [
      document.querySelector('[data-testid="sliding-panel"]'),
      document.querySelector('[role="separator"]'),
      document.querySelector('[data-testid="sliding-content"]'),
    ].filter((element): element is Element => element != null);
    await Promise.all(
      elements
        .flatMap(element => element.getAnimations())
        .map(async animation => animation.finished),
    );
    await new Promise(resolve => requestAnimationFrame(resolve));
    state.isSampling = false;
    return state.frames;
  });
}

/**
 * Every frame keeps the pane's shown edge where it sits beside the handle at
 * rest (a panel without a divider overlaps its handle by its collapsed
 * spacing): no gap opens and the edge never runs ahead.
 */
function expectEdgeOnHandle(frames: Frame[]): void {
  const rest = frames[0].shownEdge - frames[0].handleEdge;
  frames.forEach((frame, index) => {
    if (frame.paneWidth > 0) {
      expect(
        Math.abs(frame.shownEdge - frame.handleEdge - rest),
        `frame ${index} of ${frames.length}: ${JSON.stringify(frame)}, at rest ${rest}`,
      ).toBeLessThanOrEqual(1.5);
    }
  });
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

/** How many frames show the handle between where it started and ended. */
function travelling(frames: Frame[]): number {
  const from = frames[0].handleEdge;
  const to = frames[frames.length - 1].handleEdge;
  const low = Math.min(from, to) + 1;
  const high = Math.max(from, to) - 1;
  return frames.filter(f => f.handleEdge > low && f.handleEdge < high).length;
}

/**
 * Proves one pane's slide: present and painted first, then collapsed from a
 * button inside it (focus moves to the handle, the pane ends inert), then
 * opened from the handle (no focus moves), its shown edge on the handle on
 * every frame of both.
 */
async function expectSlide(
  page: Page,
  side: Side,
  storyId: string,
): Promise<void> {
  await openStory(page, storybook(), storyId);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  const content = page.getByTestId('sliding-content');
  // Present and painted before anything is measured.
  for (const element of [pane, handle, content]) {
    await expect(element).toHaveCount(1);
    const box = await element.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);

  // Collapse from inside the pane, with focus there.
  const close = page.getByRole('button', {name: 'Close panel'});
  await close.focus();
  const closing = await framesOf(page, side, async () => {
    await page.keyboard.press('Enter');
  });
  expect(closing.length).toBeGreaterThan(5);
  // A slide, not a jump: the handle travels over several frames ...
  expect(travelling(closing)).toBeGreaterThanOrEqual(3);
  // ... and the pane's shown edge stays on it on every frame.
  expectEdgeOnHandle(closing);
  // It ends where the collapsed layout puts it, with nothing held.
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  expect(closing[closing.length - 1].paneWidth).toBeLessThan(
    closing[0].paneWidth,
  );
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  await expect(pane).toHaveAttribute('aria-hidden', 'true');

  // Open from the handle: no focus moves.
  const opening = await framesOf(page, side, async () => {
    await page.keyboard.press('Enter');
  });
  expect(travelling(opening)).toBeGreaterThanOrEqual(3);
  expectEdgeOnHandle(opening);
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
  await openStory(page, storybook(), STORY.handBuilt);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  for (const element of [pane, handle]) {
    await expect(element).toHaveCount(1);
    const box = await element.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await page.getByRole('button', {name: 'Close panel'}).focus();
  const closing = await framesOf(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(closing.length).toBeGreaterThan(0);
  expect(travelling(closing)).toBe(0);
  expect((await pane.boundingBox())?.width).toBeCloseTo(
    await collapsedWidthOf(page),
    0,
  );
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  await expect(pane).toHaveAttribute('aria-hidden', 'true');
  const opening = await framesOf(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(travelling(opening)).toBe(0);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await expect(handle).toBeFocused();
  await expect(pane).not.toHaveAttribute('inert', '');
});

test('under Reduce Motion the pane does not travel, and focus still leaves it', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), STORY.start);
  const pane = page.getByTestId('sliding-panel');
  const handle = page.getByRole('separator', {name: 'Resize panel'});
  await expect(pane).toHaveCount(1);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
  await page.getByRole('button', {name: 'Close panel'}).focus();
  const closing = await framesOf(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(closing.length).toBeGreaterThan(0);
  expect(travelling(closing)).toBe(0);
  await expect(handle).toBeFocused();
  await expect(pane).toHaveAttribute('inert', '');
  const opening = await framesOf(page, 'start', async () => {
    await page.keyboard.press('Enter');
  });
  expect(travelling(opening)).toBe(0);
  expect((await pane.boundingBox())?.width).toBeCloseTo(200, 0);
});
