// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderValueTooltip.interaction.browser.spec.ts
 * @input The built Slider "Default" and "Vertical orientation" stories,
 *   Playwright's mouse, real touch input and the interaction harness
 * @output Proofs that the value tooltip stays on its thumb in every frame of
 *   a mouse drag, of a finger's drag and of its coast. Each runs left to
 *   right, right to left and vertical. They read where the page places the
 *   two and where the screen draws them. Its anchor box stays put until the
 *   end, so no layout moves it per frame.
 * @position Browser layer of Slider's value tooltip. The touch model's own
 *   proofs are in SliderTouch.interaction.browser.spec.ts.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  castStep,
  CONTROL_RGB,
  flick,
  FRAME_STARVATION_MS,
  frames,
  FrameStarvationError,
  MARKER_RGB,
  openStory,
  startScreencast,
  touchDriver,
  trackMarkers,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The largest gap the page may place between the two, CSS px. */
const PLACED_GAP = 0.5;

/** Each direction of travel, and the screen direction that raises the value. */
const LAYOUTS = [
  {
    name: 'left to right',
    story: 'core-slider--default',
    rtl: false,
    axis: 'x',
    toward: {x: 1, y: 0},
  },
  {
    name: 'right to left',
    story: 'core-slider--default',
    rtl: true,
    axis: 'x',
    toward: {x: -1, y: 0},
  },
  {
    name: 'vertical',
    story: 'core-slider--vertical-orientation',
    rtl: false,
    axis: 'y',
    toward: {x: 0, y: -1},
  },
] as const;

type Layout = (typeof LAYOUTS)[number];

async function openLayout(page: Page, layout: Layout): Promise<void> {
  if (layout.rtl) {
    await page.goto(
      `${storybook()}/iframe.html?id=${layout.story}&viewMode=story&globals=direction:rtl`,
    );
    await page.getByRole('slider').first().waitFor();
    await frames(page, 2);
  } else {
    await openStory(page, storybook(), layout.story);
  }
}

interface Gaps {
  /** Frames the page drew while the tooltip was open. */
  readonly frames: number;
  /** Each frame's gap, CSS px, in drawing order. */
  readonly gaps: number[];
  /** Frames with a running translate animation on the thumb: the coast. */
  readonly coastFrames: number;
}

/**
 * Starts recording, once per frame, how far the open tooltip's center has
 * moved from the thumb's center since rest, along the travel. Each element
 * is read where the page draws it: its anchor or its own box, at rest, plus
 * its live computed translate. A compositor animation's client rect is
 * stale in some engines, but its computed translate is current in all.
 */
async function recordGaps(
  page: Page,
  axis: 'x' | 'y',
): Promise<() => Promise<Gaps>> {
  await page.evaluate(along => {
    const thumb = document.querySelector<HTMLElement>('[role="slider"]');
    const tooltip = document.querySelector<HTMLElement>(':popover-open');
    if (thumb == null || tooltip == null) {
      throw new Error('recordGaps: open the value tooltip first');
    }
    const anchorName =
      getComputedStyle(tooltip).getPropertyValue('position-anchor');
    const anchor = [...document.querySelectorAll<HTMLElement>('*')].find(
      element =>
        getComputedStyle(element).getPropertyValue('anchor-name') ===
        anchorName,
    );
    if (anchor == null) {
      throw new Error(`recordGaps: no element is named ${anchorName}`);
    }
    const centerX = (element: Element) => {
      const box = element.getBoundingClientRect();
      return along === 'x'
        ? box.left + box.width / 2
        : box.top + box.height / 2;
    };
    const translateX = (element: Element) => {
      const translate = getComputedStyle(element).translate;
      const [x = '0', y = '0'] =
        translate === 'none' ? [] : translate.split(' ');
      return parseFloat(along === 'x' ? x : y);
    };
    // At rest no animation runs, so every client rect is current.
    const thumbBox = centerX(thumb) - translateX(thumb);
    const fromAnchor = centerX(tooltip) - centerX(anchor);
    const thumbAt = () => thumbBox + translateX(thumb);
    const tooltipAt = () => centerX(anchor) + fromAnchor + translateX(tooltip);
    const restGap = tooltipAt() - thumbAt();
    const state = {on: true, gaps: [] as number[], coastFrames: 0};
    (window as unknown as {__tooltipGaps: typeof state}).__tooltipGaps = state;
    const read = () => {
      if (!state.on) {
        return;
      }
      if (tooltip.matches(':popover-open')) {
        state.gaps.push(tooltipAt() - thumbAt() - restGap);
        if (
          thumb
            .getAnimations()
            .some(animation =>
              (animation.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some(keyframe => 'translate' in keyframe),
            )
        ) {
          state.coastFrames += 1;
        }
      }
      requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
  }, axis);
  return async () =>
    page.evaluate(() => {
      const state = (
        window as unknown as {
          __tooltipGaps: {on: boolean; gaps: number[]; coastFrames: number};
        }
      ).__tooltipGaps;
      state.on = false;
      return {
        frames: state.gaps.length,
        gaps: state.gaps,
        coastFrames: state.coastFrames,
      };
    });
}

/** The frames whose gap passes `limit`, as "frame: gap" for a message. */
function overLimit(gaps: ReadonlyArray<number>, limit: number): string[] {
  return gaps.flatMap((gap, index) =>
    Math.abs(gap) > limit ? [`${index}: ${gap.toFixed(2)} px`] : [],
  );
}

test.describe('with a mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1,
    viewport: {width: 800, height: 600},
  });

  for (const layout of LAYOUTS) {
    test(`the value tooltip stays on its thumb in every frame of a mouse drag, ${layout.name}`, async ({
      page,
    }) => {
      await openLayout(page, layout);
      const thumb = page.getByRole('slider').first();
      const box = await thumb.boundingBox();
      if (box == null) {
        throw new Error('the thumb has no box');
      }
      const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      // Hovering the thumb opens its tooltip, and the drag keeps it open.
      await page.mouse.move(at.x, at.y);
      await expect(page.getByRole('tooltip')).toBeVisible();
      await frames(page, 20);
      const stop = await recordGaps(page, layout.axis);
      await page.mouse.down();
      for (let step = 1; step <= 30; step++) {
        await page.mouse.move(
          at.x + step * 4 * layout.toward.x,
          at.y + step * 4 * layout.toward.y,
        );
        await frames(page, 1);
      }
      await page.mouse.up();
      await frames(page, 10);
      const {frames: drawn, gaps} = await stop();
      expect(drawn).toBeGreaterThan(30);
      expect(Number(await thumb.getAttribute('aria-valuenow'))).toBeGreaterThan(
        50,
      );
      expect(overLimit(gaps, PLACED_GAP), `${drawn} frames`).toEqual([]);
    });
  }
  test('after a drag, a key that takes the value back to where the drag began brings the tooltip back with its thumb', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-slider--default');
    const thumb = page.getByRole('slider').first();
    await thumb.focus();
    await page.keyboard.press('Home');
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByRole('tooltip')).toBeVisible();
    await frames(page, 20);
    const box = await thumb.boundingBox();
    if (box == null) {
      throw new Error('the thumb has no box');
    }
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const stop = await recordGaps(page, 'x');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let step = 1; step <= 30; step++) {
      await page.mouse.move(at.x + step * 4, at.y);
      await frames(page, 1);
    }
    await page.mouse.up();
    await frames(page, 10);
    expect(Number(await thumb.getAttribute('aria-valuenow'))).toBeGreaterThan(
      0,
    );
    // The value the drag began at: the first render after the drag gives it
    // again.
    await page.keyboard.press('Home');
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');
    await frames(page, 10);
    const {frames: drawn, gaps} = await stop();
    expect(overLimit(gaps, PLACED_GAP), `${drawn} frames`).toEqual([]);
  });
});

test.describe('with a finger', () => {
  for (const layout of LAYOUTS) {
    test(`the value tooltip stays on its thumb in every frame of a drag and its coast, ${layout.name}`, async ({
      page,
    }) => {
      await openLayout(page, layout);
      const driver = await touchDriver(page);
      const thumb = page.getByRole('slider').first();
      await expect(thumb).toBeVisible();
      // A focused thumb shows its tooltip through the drag and the coast.
      await thumb.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await frames(page, 20);
      const box = await thumb.boundingBox();
      if (box == null) {
        throw new Error('the thumb has no box');
      }
      const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const stop = await recordGaps(page, layout.axis);
      await driver.play(
        flick(at, {
          velocity: {x: 300 * layout.toward.x, y: 300 * layout.toward.y},
          durationMs: 200,
        }),
      );
      await waitForRest(thumb);
      await frames(page, 10);
      const {frames: drawn, gaps, coastFrames} = await stop();
      expect(Number(await thumb.getAttribute('aria-valuenow'))).toBeGreaterThan(
        50,
      );
      // With the script's timestamps the release velocity is the script's, so
      // the coast always runs. Injected touches carry their real dispatch
      // times, and a scheduling gap before the lift reads as a resting finger
      // (README: engine limits).
      if (driver.scriptedTimestamps) {
        expect(coastFrames).toBeGreaterThan(5);
      }
      expect(overLimit(gaps, PLACED_GAP), `${drawn} frames`).toEqual([]);
    });
  }

  test('the value tooltip’s anchor box stays put through a drag and its coast, and moves once at the end', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-slider--default');
    const driver = await touchDriver(page);
    const thumb = page.getByRole('slider').first();
    await expect(thumb).toBeVisible();
    await thumb.focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await frames(page, 20);
    const box = await thumb.boundingBox();
    if (box == null) {
      throw new Error('the thumb has no box');
    }
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    // Every write to the anchor box, whether the thumb still moved by
    // translate then, and the box's place in every frame.
    await page.evaluate(() => {
      const thumbElement =
        document.querySelector<HTMLElement>('[role="slider"]');
      const tooltip = document.querySelector<HTMLElement>(':popover-open');
      const name = tooltip
        ? getComputedStyle(tooltip).getPropertyValue('position-anchor')
        : '';
      const anchor = [...document.querySelectorAll<HTMLElement>('*')].find(
        element =>
          getComputedStyle(element).getPropertyValue('anchor-name') === name,
      );
      if (anchor == null || thumbElement == null) {
        throw new Error(`no element is named ${name}`);
      }
      const moving = () =>
        thumbElement.style.translate !== '' ||
        thumbElement
          .getAnimations()
          .some(animation =>
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some(keyframe => 'translate' in keyframe),
          );
      const state = {
        on: true,
        writes: [] as boolean[],
        places: [] as number[],
      };
      (window as unknown as {__anchor: typeof state}).__anchor = state;
      new MutationObserver(records => {
        for (const _ of records) {
          state.writes.push(moving());
        }
      }).observe(anchor, {attributes: true});
      const read = () => {
        if (!state.on) {
          return;
        }
        state.places.push(anchor.getBoundingClientRect().left);
        requestAnimationFrame(read);
      };
      requestAnimationFrame(read);
    });
    await driver.play(flick(at, {velocity: {x: 300, y: 0}, durationMs: 300}));
    await waitForRest(thumb);
    await frames(page, 10);
    const {writes, moves} = await page.evaluate(() => {
      const state = (
        window as unknown as {
          __anchor: {on: boolean; writes: boolean[]; places: number[]};
        }
      ).__anchor;
      state.on = false;
      return {
        writes: state.writes,
        moves: state.places.filter(
          (place, index) => index > 0 && place !== state.places[index - 1],
        ).length,
      };
    });
    expect(await thumb.getAttribute('aria-valuenow')).not.toBe('50');
    // One write, once the thumb stopped moving by translate, and one move.
    expect(writes).toEqual([false]);
    expect(moves).toBe(1);
  });

  test('the screen draws the value tooltip on its thumb in every frame of a drag and its coast', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-slider--default');
    const driver = await touchDriver(page);
    const thumb = page.getByRole('slider').first();
    await expect(thumb).toBeVisible();
    await thumb.focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    // A chip at each one's center: the thumb's lift scales it about its
    // center, and the tooltip widens about its center as its text changes.
    for (const [element, rgb] of [
      [thumb, MARKER_RGB],
      [tooltip, CONTROL_RGB],
    ] as const) {
      await element.evaluate((node, color) => {
        const chip = document.createElement('div');
        chip.style.cssText = `position:absolute;left:calc(50% - 3px);top:calc(50% - 3px);width:6px;height:6px;background:rgb(${color.join(',')});z-index:2147483647;pointer-events:none;`;
        node.append(chip);
      }, rgb);
    }
    await frames(page, 20);
    const box = await thumb.boundingBox();
    if (box == null) {
      throw new Error('the thumb has no box');
    }
    const at = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    // The page's own frames, recorded through the cast. A cast sends no frame
    // while the screen is still, so only these frames show a starved page.
    await page.evaluate(() => {
      const record = {on: true, frames: [] as number[]};
      (window as unknown as {__pageFrames: typeof record}).__pageFrames =
        record;
      const frame = () => {
        if (!record.on) {
          return;
        }
        record.frames.push(performance.timeOrigin + performance.now());
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const cast = await startScreencast(page);
    await frames(page, 4);
    const played = await driver.play(
      flick(at, {velocity: {x: 300, y: 0}, durationMs: 300}),
    );
    await waitForRest(thumb);
    const restAt = Date.now();
    await frames(page, 6);
    const shot = await cast.stop();
    const pageFrames = await page.evaluate(() => {
      const record = (
        window as unknown as {__pageFrames: {on: boolean; frames: number[]}}
      ).__pageFrames;
      record.on = false;
      return record.frames;
    });
    const [thumbs, tooltips] = await trackMarkers(page, shot, {
      colors: [MARKER_RGB, CONTROL_RGB],
    });
    const pairs = thumbs.flatMap((frame, index) => {
      const other = tooltips[index]?.box;
      return frame.box != null && other != null
        ? [frame.box.x + frame.box.width / 2 - (other.x + other.width / 2)]
        : [];
    });
    // A starved page draws too few frames to show every frame. Then a gap
    // over FRAME_STARVATION_MS in its own frames, from the touch to the rest,
    // names the failure. The touch and the rest bound the gaps, so a page that
    // drew no frame between them shows one long gap. A short cast from a page
    // that drew every frame fails on the count.
    if (pairs.length <= 30) {
      const from = played[0].dispatchedAt;
      const edges = [
        from,
        ...pageFrames.filter(t => t > from && t < restAt),
        restAt,
      ];
      const longestGapMs = Math.max(
        ...edges.slice(1).map((t, index) => t - edges[index]),
      );
      if (longestGapMs > FRAME_STARVATION_MS) {
        throw new FrameStarvationError({
          during:
            'the thumb and its value tooltip moved through a drag and its coast',
          frames: pairs.length,
          min: 31,
          longestGapMs,
        });
      }
    }
    expect(pairs.length).toBeGreaterThan(30);
    // One step of the cast's position grid: 1 px in Chromium's PNG cast,
    // 2 px in WebKit's JPEG cast.
    const step = castStep(thumbs, 'x');
    const rest = pairs[0];
    expect(
      overLimit(
        pairs.map(gap => gap - rest),
        step,
      ),
      `${pairs.length} frames`,
    ).toEqual([]);
  });
});
