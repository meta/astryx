// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutBusy.interaction.browser.spec.ts
 * @input The built Storybook's `Core/Animated layout` and Table row
 *   expansion stories, real clicks, and the interaction harness's
 *   screencast, compositor control and main-thread block
 * @output Proof that the animated-layout glide runs on the compositor.
 *   While the page's main thread is blocked for 700 ms, three followers keep
 *   moving with the harness's compositor control. They are the content after
 *   a Collapsible, after a TreeList branch and after a Table row. The
 *   judgment reads the block while the glide's keyframes move a follower by
 *   a cast step or more per frame. Chromium only: Linux WebKit starts the
 *   glide on its compositor late
 * @position Browser proof for animatedLayout.ts and its adopters, run by
 *   `pnpm test:interaction`; the module's own proofs are
 *   animatedLayout.interaction.browser.spec.ts
 */

import {
  type BlockedWindow,
  BUSY_PROOF_LOOKAROUND_MS,
  busyWindowProof,
  BusyWindowTooLateError,
  castStep,
  CONTROL_RGB,
  MARKER_RGB,
  markElement,
  startBusyControl,
  startScreencast,
  trackMarkers,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
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

// Linux WebKit hands the glide to its compositor late. Nothing moves for the
// first 30 to 100 ms of the block, so too little of the curve is left to judge.
// Apple's WebKit (the iOS 26.2 Simulator) moves on every frame from the start.
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

/** How long the page's main thread is blocked, ms. */
const BLOCK_MS = 700;

/**
 * The glide's length here, ms, set as `--duration-medium`. It is longer than
 * the theme's, so the judged part spans about 20 frames. The length changes
 * nothing the proof judges.
 */
const GLIDE_MS = 1000;

/** The fewest frame intervals the judged part of the block must span. */
const MIN_JUDGED_FRAMES = 8;

/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;

/** One translate animation that carries the follower, as the page read it. */
interface GlideRead {
  /** Each keyframe's offset and translate on the judged axis, px. */
  frames: [number, number][];
  durationMs: number;
  delayMs: number;
  /** The animation's own time, ms, at `at`. */
  local: number;
  /** The document timeline's time `local` was read at, in epoch ms. */
  at: number;
}

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

/**
 * Clicks `trigger`, and the page blocks its own main thread for BLOCK_MS from
 * a task queued in a frame after the click. A round trip from the test could
 * miss most of the glide. The block waits until each glide that carries
 * `follower` was present at the frame before and has run 16 ms, as
 * `blockMainThread` waits. Animated layout sets each glide's start time, so
 * its glides are never pending. The frame in between hands them to the
 * compositor. Just before the block, the page reads those glides, for the
 * judgment's expected positions. With no such glide within 5 s of the click,
 * it reports none. A glide that never qualifies fails by name.
 */
async function clickThenBlock(
  page: Page,
  trigger: Locator,
  follower: Locator,
  axis: 'x' | 'y',
): Promise<{busy: BlockedWindow; glides: GlideRead[]}> {
  const handle = await follower.elementHandle();
  await trigger.evaluate(
    (element, {duration, carried, along}) => {
      const offsetOf = (value: unknown) => {
        const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(
          String(value),
        );
        if (match == null) {
          return 0;
        }
        return along === 'x' ? Number(match[1]) : Number(match[2] ?? 0);
      };
      element.addEventListener(
        'click',
        () => {
          const deadline = performance.now() + 5000;
          // The glides that counted at the frame before.
          let seen = new Set<Animation>();
          // The glides of the last frame that had any, for the deadline's message.
          let lastFound: [Animation, ComputedKeyframe[]][] = [];
          const tick = () => {
            const found: [Animation, ComputedKeyframe[]][] = [];
            for (
              let node: Element | null = carried;
              node != null;
              node = node.parentElement
            ) {
              for (const animation of node.getAnimations()) {
                const frames = (animation.effect as KeyframeEffect)
                  .getKeyframes()
                  .filter(frame => typeof frame.translate === 'string');
                if (frames.length >= 2) {
                  found.push([animation, frames]);
                }
              }
            }
            const ready =
              found.length > 0 &&
              found.every(
                ([animation]) =>
                  !animation.pending &&
                  animation.playState === 'running' &&
                  Number(animation.currentTime ?? 0) >= 16 &&
                  seen.has(animation),
              );
            const before = seen;
            seen = new Set(found.map(([animation]) => animation));
            if (found.length > 0) {
              lastFound = found;
            }
            if (!ready) {
              if (performance.now() > deadline) {
                const now = performance.timeOrigin + performance.now();
                const named = found.length > 0 ? found : lastFound;
                const label = (animation: Animation) =>
                  found.length === 0
                    ? 'gone by the deadline'
                    : before.has(animation)
                      ? 'present at the frame before'
                      : 'new at the frame before';
                (window as unknown as {busy: unknown}).busy =
                  named.length === 0
                    ? {busy: {from: now, to: now, spanMs: 0}, glides: []}
                    : {
                        error: `clickThenBlock: within 5 s of the click, the glides that carry the follower never all ran 16 ms on two frames in a row: ${named
                          .map(
                            ([animation]) =>
                              `${animation.playState} at ${Number(animation.currentTime ?? 0).toFixed(0)} ms, ${label(animation)}`,
                          )
                          .join('; ')}`,
                      };
                return;
              }
              requestAnimationFrame(tick);
              return;
            }
            const glides: GlideRead[] = found.map(([animation, frames]) => {
              const effect = animation.effect as KeyframeEffect;
              return {
                frames: frames.map((frame): [number, number] => [
                  frame.computedOffset,
                  offsetOf(frame.translate),
                ]),
                durationMs: Number(effect.getComputedTiming().duration),
                delayMs: effect.getTiming().delay ?? 0,
                local: Number(animation.currentTime ?? 0),
                // The animation's time is on the document timeline, which
                // holds the frame's time through the task.
                at:
                  performance.timeOrigin +
                  Number(document.timeline.currentTime ?? performance.now()),
              };
            });
            setTimeout(() => {
              const from = performance.now();
              let now = from;
              while (now - from < duration) {
                now = performance.now();
              }
              (window as unknown as {busy: unknown}).busy = {
                busy: {
                  from: performance.timeOrigin + from,
                  to: performance.timeOrigin + now,
                  spanMs: now - from,
                },
                glides,
              };
            }, 0);
          };
          requestAnimationFrame(tick);
        },
        {capture: true, once: true},
      );
    },
    {duration: BLOCK_MS, carried: handle, along: axis},
  );
  await trigger.click();
  const signal = await page.waitForFunction(
    () =>
      (
        window as unknown as {
          busy?: {busy: BlockedWindow; glides: GlideRead[]} | {error: string};
        }
      ).busy,
    undefined,
    {polling: 50, timeout: 0},
  );
  const read = (await signal.jsonValue()) as
    {busy: BlockedWindow; glides: GlideRead[]} | {error: string};
  if ('error' in read) {
    throw new Error(read.error);
  }
  return read;
}

/**
 * The follower's translate at epoch ms `t`, from the glides' own keyframes,
 * each running at the page's pace from where the page read it.
 */
function expectedOffset(glides: ReadonlyArray<GlideRead>, t: number): number {
  let sum = 0;
  for (const glide of glides) {
    const time = glide.local + (t - glide.at) - glide.delayMs;
    const offset = Math.min(1, Math.max(0, time / glide.durationMs));
    const after = glide.frames.findIndex(([at]) => at >= offset);
    if (after <= 0) {
      sum += glide.frames[Math.max(0, after)][1];
      continue;
    }
    const [o0, y0] = glide.frames[after - 1];
    const [o1, y1] = glide.frames[after];
    sum += y0 + ((y1 - y0) * (offset - o0)) / Math.max(1e-9, o1 - o0);
  }
  return sum;
}

/**
 * Marks `follower`, clicks `trigger` with the main thread blocked across the
 * glide, and judges the follower's frames against the compositor control's.
 * The judgment stops where the glide's own keyframes move the follower by
 * less than one step of the screencast per frame. That step is 1 px in
 * Chromium's cast and 2 px in WebKit's. An easing tail moves under what the
 * cast can show there.
 */
async function busyGlide(
  page: Page,
  name: string,
  {
    trigger,
    follower,
    axis = 'y',
  }: {trigger: Locator; follower: Locator; axis?: 'x' | 'y'},
) {
  await markElement(follower);
  // Before the glide, so the control is on the compositor first.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  const {busy, glides} = await clickThenBlock(page, trigger, follower, axis);
  expect(glides.length, 'a glide carries the follower').toBeGreaterThan(0);
  // Until every animation but the control's has ended. A count polled
  // against a fixed 5 s measured the starved main thread, not the glide.
  await page.evaluate(async () => {
    for (;;) {
      const left = document
        .getAnimations()
        .filter(
          a =>
            a.playState !== 'finished' &&
            !(
              (a.effect as KeyframeEffect | null)?.target?.closest(
                '[data-harness-control]',
              ) ?? false
            ),
        );
      if (left.length === 0) {
        break;
      }
      await Promise.allSettled(left.map(async a => a.finished));
    }
  });
  // Where the marker rests, read from the page. A glide frozen through the
  // block stays far from it, and a frame after the block can still be stale.
  const settledAt = await follower.evaluate((el, along) => {
    const chip = el.querySelector('[data-harness-marker-chip]');
    if (chip == null) {
      throw new Error('the follower lost its marker chip');
    }
    const box = chip.getBoundingClientRect();
    return along === 'x' ? box.x : box.y;
  }, axis);
  const frames = await cast.stop();
  // The cast's step, from one frame in the block.
  const [probe] = await trackMarkers(
    page,
    [frames.find(f => f.t >= busy.from) ?? frames[frames.length - 1]],
    {colors: [MARKER_RGB]},
  );
  const step = castStep(probe, axis);
  // Where the glide's keyframes first move the follower by less than a cast
  // step in a frame, from the block's start on.
  let readable = busy.from;
  while (
    readable < busy.to &&
    Math.abs(
      expectedOffset(glides, readable + FRAME_MS) -
        expectedOffset(glides, readable),
    ) >= step
  ) {
    readable += 1;
  }
  // Too little of the glide moves a cast step a frame inside the block,
  // because the block began too late. That is when the block ran, not how the
  // glide moved. So it fails under that name, with the numbers.
  if (readable - busy.from < MIN_JUDGED_FRAMES * FRAME_MS) {
    const [glide] = glides;
    const startedMs = glide.local + (busy.from - glide.at) - glide.delayMs;
    throw new BusyWindowTooLateError(
      `${name}: the block began ${startedMs.toFixed(0)} ms into the ${glide.durationMs.toFixed(0)} ms glide, which moves the follower a cast step a frame for only ${(readable - busy.from).toFixed(0)} ms of the block, under the ${MIN_JUDGED_FRAMES} frames the proof judges: the block started too late for the glide. Start the block earlier.`,
      {
        readableMs: readable - busy.from,
        glideStartedMs: startedMs,
        glideDurationMs: glide.durationMs,
      },
    );
  }
  // The part of the block the judgment reads ends there.
  const judgedWindow = {...busy, to: Math.min(busy.to, readable)};
  // Only the frames the proof reads are decoded, each once for both colors.
  // On a loaded machine every decode counts.
  const [tracked, control] = await trackMarkers(
    page,
    frames.filter(f => f.t <= judgedWindow.to + BUSY_PROOF_LOOKAROUND_MS),
    {colors: [MARKER_RGB, CONTROL_RGB]},
  );
  const proof = busyWindowProof(tracked, judgedWindow, {
    axis,
    settledWithinSteps: 2,
    settledAt,
    minJudgedFrames: MIN_JUDGED_FRAMES,
    control,
  });
  const at = (box: (typeof tracked)[number]['box']) =>
    box == null ? null : axis === 'x' ? box.x : box.y;
  await writeEvidence(
    `busy-main-thread/animated-layout-${name}`,
    {
      [`${test.info().project.name}.json`]: JSON.stringify(
        {
          busy,
          step,
          settledAt,
          readableUntil: +(readable - busy.from).toFixed(1),
          glides,
          proof,
          frames: tracked.map((f, i) => ({
            t: +(f.t - busy.from).toFixed(1),
            at: at(f.box),
            control: control[i].box?.x ?? null,
          })),
        },
        null,
        1,
      ),
    },
    test.info(),
  );
  const summary = `judged until +${(readable - busy.from).toFixed(0)} ms (${step} px cast step): ${proof.summary}`;
  test
    .info()
    .annotations.push({type: 'busy-main-thread', description: summary});
  return {busy, proof, summary, glides, readableMs: readable - busy.from};
}

/** Marks the app div whose text starts with `text` for a test to find. */
async function markAppDiv(page: Page, text: string): Promise<Locator> {
  await page.evaluate(t => {
    const element = [...document.querySelectorAll('div')].find(el =>
      el.firstChild?.textContent?.trim().startsWith(t),
    );
    element?.setAttribute('data-test-id', 'follower');
  }, text);
  return page.locator('[data-test-id="follower"]');
}

function expectKeptAdvancing(run: Awaited<ReturnType<typeof busyGlide>>) {
  expect(run.busy.spanMs).toBeGreaterThanOrEqual(BLOCK_MS);
  expect(run.proof.verdict.failures, run.summary).toEqual([]);
  expect(run.proof.monotonic, run.summary).toBe(true);
}

test.describe('spec:AST-094 FR5: the shared glide keeps advancing through a blocked main thread', () => {
  test('the content after a Collapsible keeps moving on the frames the compositor control moves', async ({
    page,
  }) => {
    await openStory(page, 'core-animated-layout--animated-layout');
    const follower = await markAppDiv(page, 'A plain app div');
    expectKeptAdvancing(
      await busyGlide(page, 'collapsible', {
        trigger: page.getByRole('button', {name: 'Shipping details'}),
        follower,
      }),
    );
  });

  test('the rows after a TreeList branch keep moving on the frames the compositor control moves', async ({
    page,
  }) => {
    await openStory(page, 'core-animated-layout--animated-layout');
    expectKeptAdvancing(
      await busyGlide(page, 'treelist', {
        trigger: page.locator('[data-tree-id="docs"] [data-tree-toggle]'),
        follower: page.locator('[data-tree-id="notes"]'),
      }),
    );
  });

  test('the rows after a Table row keep moving on the frames the compositor control moves', async ({
    page,
  }) => {
    await openStory(page, 'core-tablerowexpansion--gliding-rows');
    // A row takes no child, so its first cell, which rides its glide, carries
    // the marker.
    expectKeptAdvancing(
      await busyGlide(page, 'table-row', {
        trigger: page.locator('[data-expansion-toggle]').first(),
        follower: page
          .locator('tr[data-expansion-key]')
          .nth(1)
          .locator('td')
          .first(),
      }),
    );
  });
});
