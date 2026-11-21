// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutLongTask.interaction.browser.spec.ts
 * @input The built Storybook's List "Animated Changes" story, real clicks, and
 *   a later click listener on the document that holds the main thread
 * @output Proof that a layout glide from rest starts at its old place, with
 *   the first frame drawn after its task. A later click listener holds that
 *   task. A glide retargeted mid-motion keeps the motion it carries through
 *   the same block. Chromium only: Linux WebKit hands the glide to its
 *   compositor late
 * @position Browser proof for animatedLayout.ts, run by `pnpm test:interaction`;
 *   the compositor proof is animatedLayoutBusy.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

test.skip(
  ({browserName}) => browserName === 'webkit',
  'Linux WebKit starts the glide on its compositor 30\u2013100 ms late; Apple\u2019s WebKit does not',
);

let storybook: StaticServer | undefined;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/** How long the later listener holds the main thread, ms. */
const BLOCK_MS = 300;

/**
 * The glide's length here, ms, set as `--duration-medium`. It is longer than
 * the theme's, so a block of BLOCK_MS ends well inside the curve.
 */
const GLIDE_MS = 1000;

/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;

/** Loads a story and waits for its first render, its fonts and two frames. */
async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${story}&viewMode=story`,
  );
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.addStyleTag({
    content: `* { --duration-medium: ${GLIDE_MS}ms !important; }`,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** What the page read at one frame after the click's task. */
interface FrameRead {
  /** The follower's top, with its glide applied. */
  drawnTop: number;
  /** Its glide's own time, ms. */
  glideTime: number;
  /**
   * Where the glide that ran before the click puts the follower at this
   * frame's time, on the curve it was on: the motion it carries. Null when
   * no glide ran before the click.
   */
  carriedTop: number | null;
}

/** What the page read around the click's task. */
interface Read {
  /** The follower's glides when the block began, after the change. */
  glidesAtBlock: number;
  /** How long the later listener held the main thread, ms. */
  blockMs: number;
  /** When the block ended, on the page's clock, ms. */
  blockEnd: number;
  /** The follower's top before the click, with any glide applied. */
  topBefore: number;
  /** The start time of the follower's glide, read at the second frame. */
  glideStart: number;
  /**
   * The first and the second frame after the task. After a long task, a
   * frame's time can be that of a frame scheduled before the block. So the
   * judgments of time use the page's clock and the second frame.
   */
  frames: [FrameRead, FrameRead];
}

/**
 * Clicks `trigger` at its current place, with the mouse, so a moving trigger
 * takes the click too. Before the page handles the click, a listener in the
 * capture phase reads `follower` and the glide it is on. After the page
 * handles it, a listener on the document in the bubble phase holds the main
 * thread for BLOCK_MS, in the click's own task. The page reads `follower`
 * again at the first two frames after that task.
 */
async function clickThenHold(
  page: Page,
  trigger: Locator,
  follower: Locator,
): Promise<Read> {
  await follower.evaluate((element, block) => {
    const glidesOf = (target: Element) =>
      target
        .getAnimations()
        .filter(animation =>
          (animation.effect as KeyframeEffect)
            .getKeyframes()
            .some(frame => typeof frame.translate === 'string'),
        );
    // The y of a translate value such as "0px -44px".
    const yOf = (value: unknown) => {
      const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(
        String(value),
      );
      return match == null ? 0 : Number(match[2] ?? 0);
    };
    const state: {
      topBefore?: number;
      carried?: ((time: number) => number) | null;
    } = {};
    const store = window as unknown as {longTaskRead?: unknown};
    store.longTaskRead = undefined;
    document.addEventListener(
      'click',
      () => {
        const box = element.getBoundingClientRect();
        state.topBefore = box.top;
        const [running] = glidesOf(element);
        state.carried = null;
        if (running != null && running.startTime != null) {
          // The follower's place in the layout, its glide taken out, and
          // that glide's curve on the document timeline.
          const layoutTop = box.top - yOf(getComputedStyle(element).translate);
          const effect = running.effect as KeyframeEffect;
          const frames = effect
            .getKeyframes()
            .filter(frame => typeof frame.translate === 'string')
            .map(frame => [frame.computedOffset, yOf(frame.translate)]);
          const duration = Number(effect.getComputedTiming().duration);
          const start = Number(running.startTime);
          state.carried = time => {
            const at = Math.min(1, Math.max(0, (time - start) / duration));
            let next = 1;
            while (next < frames.length - 1 && frames[next][0] < at) {
              next += 1;
            }
            const [fromAt, fromY] = frames[next - 1];
            const [toAt, toY] = frames[next];
            const part = toAt > fromAt ? (at - fromAt) / (toAt - fromAt) : 1;
            return layoutTop + fromY + (toY - fromY) * part;
          };
        }
      },
      {capture: true, once: true},
    );
    document.addEventListener(
      'click',
      () => {
        const glidesAtBlock = glidesOf(element).length;
        const from = performance.now();
        let now = from;
        while (now - from < block) {
          now = performance.now();
        }
        const readFrame = () => {
          const time = Number(document.timeline.currentTime);
          const [glide] = glidesOf(element);
          return {
            read: {
              drawnTop: element.getBoundingClientRect().top,
              glideTime: Number(glide?.currentTime ?? Number.NaN),
              carriedTop: state.carried == null ? null : state.carried(time),
            },
            start: Number(glide?.startTime ?? Number.NaN),
          };
        };
        requestAnimationFrame(() => {
          const first = readFrame();
          requestAnimationFrame(() => {
            const second = readFrame();
            store.longTaskRead = {
              glidesAtBlock,
              blockMs: now - from,
              blockEnd: now,
              topBefore: state.topBefore ?? Number.NaN,
              glideStart: second.start,
              frames: [first.read, second.read],
            };
          });
        });
      },
      {once: true},
    );
  }, BLOCK_MS);
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('clickThenHold: the trigger has no box');
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const read = await page.waitForFunction(
    () => (window as unknown as {longTaskRead?: Read}).longTaskRead,
    undefined,
    {timeout: 5000},
  );
  return (await read.jsonValue()) as Read;
}

test.describe('spec:AST-105 FR3, FR4: a glide shows its first frame where its content was, however long the task that made it runs', () => {
  test('a glide from rest starts with the first frame after a later listener holds the page', async ({
    page,
  }) => {
    await openStory(page, 'core-list--animated-changes');
    const read = await clickThenHold(
      page,
      page.getByRole('button', {name: 'Insert a row second'}),
      page.getByTestId('after-list'),
    );
    const summary = JSON.stringify(read);
    // The glide was made in the click's task, before the block.
    expect(read.glidesAtBlock, summary).toBeGreaterThan(0);
    expect(read.blockMs, summary).toBeGreaterThanOrEqual(BLOCK_MS);
    // It starts with the first frame drawn after the task, not before the
    // block. So it shows that frame at the old place, and by the second frame
    // it has run a few frames at most.
    expect(read.glideStart, summary).toBeGreaterThanOrEqual(
      read.blockEnd - FRAME_MS - 1,
    );
    expect(
      Math.abs(read.frames[0].drawnTop - read.topBefore),
      summary,
    ).toBeLessThanOrEqual(1);
    expect(read.frames[1].glideTime, summary).toBeLessThanOrEqual(3 * FRAME_MS);
  });

  test('a glide retargeted mid-motion keeps the motion it carries through a later listener\u2019s block', async ({
    page,
  }) => {
    await openStory(page, 'core-list--animated-changes');
    const trigger = page.getByRole('button', {name: 'Insert a row second'});
    const follower = page.getByTestId('after-list');
    await trigger.click();
    // After the first glide has run 35% of its length, the second insert
    // retargets it.
    await follower.evaluate(
      async (element, length) =>
        new Promise<void>((resolve, reject) => {
          const deadline = performance.now() + 5000;
          const tick = () => {
            const glide = element
              .getAnimations()
              .find(animation =>
                (animation.effect as KeyframeEffect)
                  .getKeyframes()
                  .some(frame => typeof frame.translate === 'string'),
              );
            const time = Number(glide?.currentTime ?? 0);
            if (glide != null && !glide.pending && time >= length * 0.35) {
              resolve();
            } else if (performance.now() > deadline) {
              reject(new Error('the first glide never reached 35 %'));
            } else {
              requestAnimationFrame(tick);
            }
          };
          requestAnimationFrame(tick);
        }),
      GLIDE_MS,
    );
    const read = await clickThenHold(page, trigger, follower);
    const summary = JSON.stringify(read);
    expect(read.glidesAtBlock, summary).toBeGreaterThan(0);
    expect(read.blockMs, summary).toBeGreaterThanOrEqual(BLOCK_MS);
    // The follower moves down through both inserts. Through the block the
    // compositor kept the first glide running. At the second frame after the
    // block, the follower is never above where that glide had it then.
    const [, second] = read.frames;
    expect(second.carriedTop, summary).not.toBeNull();
    expect(second.drawnTop, summary).toBeGreaterThanOrEqual(
      (second.carriedTop ?? Number.NaN) - 1,
    );
  });
});
