// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavRailMotion.interaction.browser.spec.ts
 * @input The built Storybook's `Core/AppShell` rail-collapse stories: an
 *   AppShell whose collapsible SideNav's collapsed state the app holds, on a
 *   phone (finger, coarse pointer) and at desktop width (mouse, fine pointer)
 * @output The real-browser frame evidence `component:SideNav` FR6 and
 *   `component:AppShell` FR17 ask for: every frame of a collapse and an
 *   expand keeps the rail's edge on the content's edge with no width
 *   animation, the rail's copy is hidden from assistive technology and gone at
 *   rest, the rail ends icons-only or with its labels, a second press mid-motion
 *   stays continuous, an expand whose old wrap is not copied keeps the edges
 *   together, and Reduce Motion cross-fades under a finger (DR2) and changes at
 *   once under a mouse (DR3), also on a loaded machine: those two cases read
 *   the motion by its own start and end, never at a fixed time. A second press
 *   after a long task starts its fades where the glide carries on.
 * @position Testing; the components' unit cases are
 *   SideNav/SideNavRailMotion.test.tsx
 *
 * SYNC: When modified, update FR6's state cell and Verification row in
 *   SideNav.spec.md and the FR17 Verification row in AppShell.spec.md.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {requireFrames} from '@astryxdesign/interaction-harness';

// The frame evidence is Chromium's: CI's interaction proofs run the chromium
// project, and these cases have not been run in WebKit.
test.skip(
  ({browserName}) => browserName === 'webkit',
  'Chromium frame evidence; not yet verified in WebKit',
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

const PHONE_STORY = 'core-appshell--rail-collapse-motion-phone';
const DESKTOP_STORY = 'core-appshell--rail-collapse-motion';

/** Loads a story and waits for its first render, its fonts and two frames. */
async function openStory(page: Page, story: string): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${story}&viewMode=story`,
  );
  await page.locator('[role="main"]').first().waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** What the frames of one motion showed, sampled every animation frame. */
interface Frames {
  /**
   * Positions of the content's glide judged on its own clock, one every 50 ms.
   * The sampler holds the page's animations and seeks them to each position.
   * The count does not depend on how many frames a loaded runner draws.
   */
  readonly heldPositions: number;
  /** The content glide's end on its own clock, in ms. */
  readonly glideEndMs: number;
  /** The largest distance between the rail's shown edge and the content's. */
  readonly maxGap: number;
  /** Whether any running animation changed a width. */
  readonly animatesWidth: boolean;
  /** Whether every rail copy seen was inert and hidden from AT. */
  readonly copiesHidden: boolean;
  /** Rail copies seen during the motion. */
  readonly copiesSeen: number;
  /** Other inert copies seen: the content's old wrap. */
  readonly wrapCopiesSeen: number;
  /**
   * Distinct positions the edge passes through, on the motion's own clock:
   * more than a few means it moved. Read from the glide's keyframes, not from
   * the frames sampled, which a loaded runner can deliver too few of.
   */
  readonly edges: number;
}

/**
 * Presses the rail's collapse/expand button (`press` runs the press itself:
 * a tap or a click) after `delays` ms each, then samples every frame until
 * the motion has ended on its own clock.
 */
async function sampleMotion(
  page: Page,
  press: () => Promise<void>,
  {presses = 1, gapMs = 0} = {},
): Promise<Frames> {
  await page.evaluate(() => {
    const state = {
      heldPositions: 0,
      glideEndMs: 0,
      held: false,
      maxGap: 0,
      animatesWidth: false,
      copiesHidden: true,
      copiesSeen: 0,
      wrapCopiesSeen: 0,
      edges: new Set<number>(),
      running: true,
    };

    (window as unknown as {railFrames: typeof state}).railFrames = state;
    const panel = document.querySelector('.astryx-layout-panel');
    const main = document.querySelector('[role="main"]');
    if (panel == null || main == null) {
      return;
    }
    let column = main;
    while (
      column.parentElement != null &&
      !column.parentElement.contains(panel)
    ) {
      column = column.parentElement;
    }
    const shownRight = (element: Element) => {
      const inset = /inset\(0px ([\d.]+)px/.exec(
        getComputedStyle(element).clipPath,
      );
      return (
        element.getBoundingClientRect().right - (inset ? Number(inset[1]) : 0)
      );
    };
    const railCopies = () =>
      [...document.querySelectorAll('[inert]')].filter(
        element => element.querySelector('nav') != null,
      );
    // The sampler judges the glide once, on its own clock, as soon as it
    // rides. It holds every running animation and seeks each one by its own
    // start. Their offsets then match what a frame at that time shows.
    const holdAndRead = () => {
      if (state.held || !state.running) {
        return;
      }
      const glide = column
        .getAnimations()
        .find(
          animation =>
            animation.playState === 'running' && animation.startTime != null,
        );
      const end = Number(glide?.effect?.getComputedTiming().endTime);
      if (glide == null || !Number.isFinite(end)) {
        return;
      }
      state.held = true;
      state.glideEndMs = end;
      const start = Number(glide.startTime);
      // A script pause overrides a CSS animation's play state permanently, so
      // the hold skips CSS animations and transitions.
      const held = document
        .getAnimations()
        .filter(
          animation =>
            animation.playState === 'running' &&
            animation.startTime != null &&
            !('animationName' in animation) &&
            !('transitionProperty' in animation),
        )
        .map(animation => ({
          animation,
          startTime: Number(animation.startTime),
        }));
      for (const {animation} of held) {
        animation.pause();
      }
      for (let time = 0; time <= end; time += 50) {
        for (const {animation, startTime} of held) {
          animation.currentTime = start + time - startTime;
        }
        const edge = Math.max(
          shownRight(panel),
          ...railCopies().map(shownRight),
        );
        state.maxGap = Math.max(
          state.maxGap,
          Math.abs(edge - column.getBoundingClientRect().left),
        );
        state.heldPositions++;
      }
      // Each animation gets its own start time back, so it plays on where it
      // would have been. The hold does not delay it.
      for (const {animation, startTime} of held) {
        animation.startTime = startTime;
      }
    };
    // Read the glide in the press's own task, once the change's animations
    // ride. On a loaded runner, the collapse's work can hold the main thread
    // for the whole glide, so the page draws no frame of it. If the glide is
    // not riding yet, the next frame reads it.
    window.addEventListener(
      'click',
      () => {
        queueMicrotask(holdAndRead);
      },
      {once: true},
    );
    const glides = new WeakSet<Animation>();
    const sample = () => {
      if (!state.running) {
        return;
      }
      holdAndRead();
      const copies = railCopies();
      state.copiesSeen = Math.max(state.copiesSeen, copies.length);
      state.wrapCopiesSeen = Math.max(
        state.wrapCopiesSeen,
        document.querySelectorAll('[inert]').length - copies.length,
      );
      for (const copy of copies) {
        if (copy.getAttribute('aria-hidden') !== 'true') {
          state.copiesHidden = false;
        }
      }
      const edge = Math.max(shownRight(panel), ...copies.map(shownRight));
      // The positions the edge passes through, on the motion's own clock: the
      // content column's glide keyframes, which the compositor plays whether
      // or not a loaded page samples its frames. The edge stays on the column
      // on every sampled frame (maxGap), so it passes through them too.
      for (const animation of column.getAnimations()) {
        if (glides.has(animation)) {
          continue;
        }
        glides.add(animation);
        for (const frame of (
          animation.effect as KeyframeEffect
        ).getKeyframes()) {
          const offset = /(-?[\d.]+)px/.exec(
            String(frame.translate ?? frame.transform ?? ''),
          );
          if (offset != null) {
            state.edges.add(Math.round(Number(offset[1])));
          }
        }
      }
      state.maxGap = Math.max(
        state.maxGap,
        Math.abs(edge - column.getBoundingClientRect().left),
      );
      for (const animation of document.getAnimations()) {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        if (frames.some(frame => 'width' in frame || 'inlineSize' in frame)) {
          state.animatesWidth = true;
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  for (let index = 0; index < presses; index++) {
    if (index > 0) {
      await page.waitForTimeout(gapMs);
    }
    await press();
  }
  // Until the motion has ended on its own clock: no animation it runs is still
  // running, then two more frames, so what its end commits has landed. A
  // loaded runner changes how long this takes, not what the frames read.
  await toggleButton(page).evaluate(async toggle => {
    const frame = async () =>
      new Promise(resolve => {
        requestAnimationFrame(resolve);
      });
    const running = () =>
      document.getAnimations().some(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        // Animations on the toggle element itself are its press feedback.
        return (
          effect != null &&
          effect.target !== toggle &&
          animation.playState === 'running' &&
          Number.isFinite(Number(effect.getComputedTiming().endTime))
        );
      });
    await frame();
    while (running()) {
      await frame();
    }
    await frame();
    await frame();
  });
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        railFrames: Omit<Frames, 'edges'> & {
          running: boolean;
          edges: Set<number>;
        };
      }
    ).railFrames;
    state.running = false;
    const {heldPositions, glideEndMs, maxGap, animatesWidth} = state;
    const {copiesHidden, copiesSeen} = state;
    const {wrapCopiesSeen} = state;
    const edges = state.edges.size;
    return {
      heldPositions,
      glideEndMs,
      maxGap,
      animatesWidth,
      copiesHidden,
      copiesSeen,
      wrapCopiesSeen,
      edges,
    };
  });
}

/**
 * The rail's width, whether its labels show, and what still runs, at rest.
 * Animations on the toggle element itself are its press feedback, not the
 * rail's motion, as in `sampleMotion` and `recordMotion`. On a loaded runner,
 * that feedback can still run after the rail's motion ends.
 */
async function railAtRest(page: Page) {
  return toggleButton(page).evaluate(toggle => {
    const panel = document.querySelector('.astryx-layout-panel') as HTMLElement;
    const label = [...panel.querySelectorAll('span, div')].find(
      element =>
        element.children.length === 0 && element.textContent === 'Analytics',
    );
    const shown =
      label != null &&
      label.getBoundingClientRect().width > 0 &&
      label.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      }) &&
      label.getBoundingClientRect().right <=
        panel.getBoundingClientRect().right + 0.5;
    return {
      width: Math.round(panel.getBoundingClientRect().width),
      labelsShown: shown,
      copies: document.querySelectorAll('[inert]').length,
      running: document
        .getAnimations()
        .filter(
          animation =>
            (animation.effect as KeyframeEffect | null)?.target !== toggle,
        ).length,
    };
  });
}

function toggleButton(page: Page) {
  return page.getByRole('button', {name: /^(Collapse|Expand) sidebar$/});
}

/**
 * A loaded machine, made repeatable: Chromium's CPU throttle slows the page's
 * main thread four times, or its animation clock runs every animation at a
 * quarter of its speed, as when frames come late. Neither changes what the
 * motion is; both move when it starts and ends in real time.
 */
const LOADS = ['idle', 'a slow CPU', 'slow frames'] as const;
type Load = (typeof LOADS)[number];

async function applyLoad(page: Page, load: Load): Promise<void> {
  if (load === 'idle') {
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  if (load === 'a slow CPU') {
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4});
  } else {
    await cdp.send('Animation.enable');
    await cdp.send('Animation.setPlaybackRate', {playbackRate: 0.25});
  }
}

/** The test-name suffix for a load: nothing when idle. */
function underLoad(load: Load): string {
  return load === 'idle' ? '' : `, with ${load}`;
}

/** One animation of the rail's motion: what it animates and when it ends. */
interface MotionPart {
  readonly properties: ReadonlyArray<string>;
  /**
   * When it ends on its own clock, in ms: its delay, every iteration and its
   * end delay, so a delayed or repeated fade counts in full.
   */
  readonly endTime: number;
  /** Whether it animates an element holding the page's main content. */
  readonly holdsPage: boolean;
}

/**
 * One press feedback animation `recordMotion` keeps apart: the toggle's own,
 * or on a copy of it the old state holds (`onCopy`). `name` is a CSS
 * animation's; `startTime` is read while it runs, since a cancelled animation
 * drops it. `firstSeen` and `goneAt` are the record's frame times when it
 * first saw the animation and first missed it.
 */
interface PressPart {
  readonly onCopy: boolean;
  readonly name: string | null;
  startTime: number | null;
  readonly firstSeen: number;
  goneAt: number | null;
}

/** The record `recordMotion` keeps on the page, for `settledMotion`. */
interface MotionRecord {
  readonly seen: Map<Animation, MotionPart>;
  /** Press feedback, apart from the motion. */
  readonly press: Map<Animation, PressPart>;
  /** The time of each frame the record sampled. */
  readonly frames: {t: number}[];
  readonly collect: (at?: number) => void;
  sampling: boolean;
}

/**
 * Starts recording the motion a press of the toggle causes: every animation
 * running on any frame from now on, described when first seen. Animations on
 * the toggle element itself are its press feedback, not the rail's: its
 * highlight's release fade runs on the button. So are those on any element
 * the press model marks (`data-astryx-press`), such as the toggle in the copy
 * the old state holds. That copy shows the press as the toggle did. They are
 * kept apart, as press feedback. Everything inside the toggle, its chevron
 * included, stays in. `settledMotion` ends the record.
 */
async function recordMotion(page: Page): Promise<void> {
  await toggleButton(page).evaluate(toggle => {
    const seen = new Map<Animation, MotionPart>();
    const press = new Map<Animation, PressPart>();
    const frames: {t: number}[] = [];
    const collect = (at?: number) => {
      const now = at ?? performance.now();
      const present = new Set<Animation>();
      for (const animation of document.getAnimations()) {
        const effect = animation.effect;
        const known = press.get(animation);
        if (known != null) {
          present.add(animation);
          if (animation.startTime != null) {
            known.startTime = Number(animation.startTime);
          }
          continue;
        }
        if (seen.has(animation) || !(effect instanceof KeyframeEffect)) {
          continue;
        }
        if (
          effect.target === toggle ||
          effect.target?.hasAttribute('data-astryx-press') === true
        ) {
          press.set(animation, {
            onCopy: effect.target !== toggle,
            name:
              animation instanceof CSSAnimation
                ? animation.animationName
                : null,
            startTime:
              animation.startTime == null ? null : Number(animation.startTime),
            firstSeen: now,
            goneAt: null,
          });
          present.add(animation);
          // The start resolves on the frame that first draws the animation.
          // On a busy page, that frame's callbacks can run after the copy
          // is gone, so the start is also read as the animation turns ready.
          animation.ready.then(
            ready => {
              const part = press.get(ready);
              if (part != null && ready.startTime != null) {
                part.startTime = Number(ready.startTime);
              }
            },
            () => undefined,
          );
          continue;
        }
        const properties = new Set<string>();
        for (const frame of effect.getKeyframes()) {
          for (const key of Object.keys(frame)) {
            if (
              !['offset', 'computedOffset', 'easing', 'composite'].includes(key)
            ) {
              properties.add(key);
            }
          }
        }
        seen.set(animation, {
          properties: [...properties],
          endTime: Number(effect.getComputedTiming().endTime),
          holdsPage:
            effect.target instanceof Element &&
            effect.target.contains(document.querySelector('[role="main"]')),
        });
      }
      for (const [animation, part] of press) {
        if (part.goneAt == null && !present.has(animation)) {
          part.goneAt = now;
        }
      }
    };
    const record: MotionRecord = {
      seen,
      press,
      frames,
      collect,
      sampling: true,
    };
    (window as unknown as {railMotion: MotionRecord}).railMotion = record;
    const sample = () => {
      if (record.sampling) {
        // One time for the frame and what it saw, so the frame that first
        // misses an animation is not counted as holding it.
        const t = performance.now();
        frames.push({t});
        collect(t);
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
}

/**
 * Ends the record once the motion has ended on its own clock: every recorded
 * animation has finished or been cancelled, and two more frames have passed
 * without a new one, so what its end commits has landed. One that never ends
 * (endless iterations) is not waited for; it is returned with an `endTime`
 * of Infinity, for the cases to fail on. It never waits a fixed time: a loaded
 * machine changes how long this takes, not what it reads.
 */
async function settledMotion(page: Page): Promise<ReadonlyArray<MotionPart>> {
  return page.evaluate(async () => {
    const record = (window as unknown as {railMotion: MotionRecord}).railMotion;
    const isRunning = (animation: Animation) =>
      animation.playState === 'running' &&
      Number.isFinite(Number(animation.effect?.getComputedTiming().endTime));
    const twoFrames = async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    for (;;) {
      record.collect();
      const running = [...record.seen.keys()].filter(isRunning);
      if (running.length > 0) {
        await Promise.all(
          running.map(async animation =>
            animation.finished.catch(() => undefined),
          ),
        );
        continue;
      }
      const seenBefore = record.seen.size;
      await twoFrames();
      record.collect();
      if (
        record.seen.size === seenBefore &&
        ![...record.seen.keys()].some(isRunning)
      ) {
        break;
      }
    }
    record.sampling = false;
    return [...record.seen.values()];
  });
}

/**
 * The press feedback the record kept apart from the motion, once it has
 * settled. For each: where it ran (the toggle, or a copy of it), a CSS
 * animation's name, and its start time as read while it ran.
 */
async function pressFeedback(page: Page): Promise<
  ReadonlyArray<{
    onCopy: boolean;
    name: string | null;
    startTime: number;
    firstSeen: number;
    goneAt: number | null;
  }>
> {
  return page.evaluate(() => {
    const record = (window as unknown as {railMotion: MotionRecord}).railMotion;
    return [...record.press.values()].map(
      ({onCopy, name, startTime, firstSeen, goneAt}) => ({
        onCopy,
        name,
        startTime: startTime ?? Number.NaN,
        firstSeen,
        goneAt,
      }),
    );
  });
}

/** The time of each frame the record sampled. */
async function recordedFrames(page: Page): Promise<ReadonlyArray<{t: number}>> {
  return page.evaluate(
    () => (window as unknown as {railMotion: MotionRecord}).railMotion.frames,
  );
}

test.describe('component:SideNav FR6 and component:AppShell FR17 under a finger', () => {
  test('a tap collapses and expands the rail with its edge on the content on every frame, no width animation, and a hidden copy gone at rest', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    const expanded = await railAtRest(page);
    expect(expanded.labelsShown).toBe(true);

    const collapse = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    // The sampler judges the whole glide on its own clock, every 50 ms. It
    // also judges every frame the page draws, however many the runner gets.
    expect(collapse.glideEndMs).toBeGreaterThan(0);
    expect(collapse.heldPositions).toBe(
      Math.floor(collapse.glideEndMs / 50) + 1,
    );
    expect(collapse.maxGap).toBeLessThanOrEqual(1);
    expect(collapse.edges).toBeGreaterThan(5);
    expect(collapse.animatesWidth).toBe(false);
    expect(collapse.copiesSeen).toBe(1);
    expect(collapse.copiesHidden).toBe(true);
    const collapsed = await railAtRest(page);
    expect(collapsed).toMatchObject({
      labelsShown: false,
      copies: 0,
      running: 0,
    });
    expect(collapsed.width).toBeLessThan(expanded.width);

    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    expect(expand.copiesHidden).toBe(true);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
      running: 0,
    });
  });

  test('a second tap while the motion runs keeps the rail and the content together and lands in the second state', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    const expanded = await railAtRest(page);
    const frames = await sampleMotion(
      page,
      async () => {
        await toggleButton(page).tap();
      },
      {
        presses: 2,
        gapMs: 150,
      },
    );
    expect(frames.maxGap).toBeLessThanOrEqual(1);
    expect(frames.edges).toBeGreaterThan(5);
    expect(frames.animatesWidth).toBe(false);
    expect(frames.copiesSeen).toBeLessThanOrEqual(1);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
      running: 0,
    });
  });

  test('an expand whose old wrap cannot be copied keeps the rail and the content together', async ({
    page,
  }) => {
    await openStory(page, PHONE_STORY);
    await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    // More elements than the swap copies: the old wrap is not copied.
    await page.evaluate(() => {
      const holder = document.createElement('div');
      for (let index = 0; index < 1600; index++) {
        holder.appendChild(document.createElement('span'));
      }
      document.querySelector('[role="main"]')?.appendChild(holder);
    });
    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).tap();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    // The fallback branch ran: no copy of the old wrap was made.
    expect(expand.wrapCopiesSeen).toBe(0);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: true,
      copies: 0,
    });
  });

  for (const load of LOADS) {
    test(`under Reduce Motion a tap only cross-fades, in 200 ms or less, with the page surface still${underLoad(load)} (design:reduced-motion DR2)`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await openStory(page, PHONE_STORY);
      await applyLoad(page, load);
      await recordMotion(page);
      await toggleButton(page).tap();
      await expect(toggleButton(page)).toHaveAccessibleName('Expand sidebar');
      const motion = await settledMotion(page);
      expect(motion.length).toBeGreaterThan(0);
      for (const {properties, endTime, holdsPage} of motion) {
        expect(properties).toEqual(['opacity']);
        expect(endTime).toBeLessThanOrEqual(200);
        expect(holdsPage).toBe(false);
      }
      expect(await railAtRest(page)).toMatchObject({
        labelsShown: false,
        copies: 0,
      });
    });
  }

  test(`under Reduce Motion a press held past its onset still only cross-fades, and the old state's copy shows the toggle's press fading in step with the toggle (design:reduced-motion DR2)`, async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openStory(page, PHONE_STORY);
    await recordMotion(page);
    // Held until the press shows, its release fades the press at once, before
    // the tap's click collapses the rail. So the copy of the old state holds a
    // toggle whose press is fading.
    const box = await toggleButton(page).boundingBox();
    if (box == null) {
      throw new Error('the toggle has no box');
    }
    const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    });
    await expect(toggleButton(page)).toHaveAttribute('data-astryx-press', 'on');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await expect(toggleButton(page)).toHaveAccessibleName('Expand sidebar');
    const motion = await settledMotion(page);
    expect(motion.length).toBeGreaterThan(0);
    for (const {properties, endTime, holdsPage} of motion) {
      expect(properties).toEqual(['opacity']);
      expect(endTime).toBeLessThanOrEqual(200);
      expect(holdsPage).toBe(false);
    }
    // The copy's press fade runs on the toggle's own start, from where the
    // toggle's had got to, not again from its start.
    const press = await pressFeedback(page);
    const onCopy = press.filter(fade => fade.onCopy && fade.name != null);
    expect(onCopy.length).toBeGreaterThan(0);
    for (const fade of onCopy) {
      const own = press.find(
        other => !other.onCopy && other.name === fade.name,
      );
      expect(own, JSON.stringify(press)).toBeDefined();
      if (Number.isNaN(fade.startTime)) {
        // The copy's fade never started. A new animation's start reaches
        // script only after the frame that starts it. So the copy is judged
        // once the page drew two frames while it held the fade. Fewer is
        // starvation when the trace shows a long gap.
        requireFrames(await recordedFrames(page), {
          min: 2,
          during: "the old state's copy held the toggle's press fade",
          where: frame =>
            frame.t > fade.firstSeen &&
            (fade.goneAt == null || frame.t < fade.goneAt),
        });
        throw new Error(
          `the copy's press fade never started while the page drew frames: ${JSON.stringify(press)}`,
        );
      }
      expect(
        Math.abs(fade.startTime - (own?.startTime ?? Number.NaN)),
        JSON.stringify(press),
      ).toBeLessThan(1);
    }
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: false,
      copies: 0,
    });
  });
});

test.describe('component:SideNav FR6 and component:AppShell FR17 under a mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 1280, height: 800},
  });

  test('a click collapses and expands the rail with its edge on the content on every frame and no width animation', async ({
    page,
  }) => {
    await openStory(page, DESKTOP_STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: fine)').matches),
    ).toBe(true);
    const expanded = await railAtRest(page);
    const collapse = await sampleMotion(page, async () => {
      await toggleButton(page).click();
    });
    expect(collapse.maxGap).toBeLessThanOrEqual(1);
    expect(collapse.edges).toBeGreaterThan(5);
    expect(collapse.animatesWidth).toBe(false);
    expect(collapse.copiesHidden).toBe(true);
    expect(await railAtRest(page)).toMatchObject({
      labelsShown: false,
      copies: 0,
      running: 0,
    });
    const expand = await sampleMotion(page, async () => {
      await toggleButton(page).click();
    });
    expect(expand.maxGap).toBeLessThanOrEqual(1);
    expect(expand.edges).toBeGreaterThan(5);
    expect(expand.animatesWidth).toBe(false);
    expect(await railAtRest(page)).toMatchObject({
      width: expanded.width,
      labelsShown: true,
      copies: 0,
    });
  });

  test('a second click after a long task starts the fades where the glide carries on, as the same click without the task does', async ({
    page,
  }) => {
    await openStory(page, DESKTOP_STORY);
    // A collapse, then a click that reverses it 1150 ms later, its handler
    // busy for `blockMs` first. Returns the reversal's fades' first keyframes.
    const reverse = async (blockMs: number) =>
      page.evaluate(async blockMs => {
        const toggle = () =>
          // The leaving copy is inert and sits before the real rail, so its
          // cloned toggle comes first in document order.
          [...document.querySelectorAll('button')].find(
            button =>
              button.closest('[inert]') == null &&
              /^(Collapse|Expand) sidebar$/.test(
                button.getAttribute('aria-label') ?? button.textContent ?? '',
              ),
          ) as HTMLElement;
        const frame = async () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => resolve());
          });
        toggle().click();
        const collapsed = performance.now();
        while (performance.now() - collapsed < 1150 - blockMs) {
          await frame();
        }
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
        // A press's own feedback reads the timeline first. That holds its time
        // for the rest of this task, as on a real page.
        void document.timeline.currentTime;
        const busy = performance.now() + blockMs;
        while (performance.now() < busy) {
          // the click handler's own work
        }
        const before = new Set(document.getAnimations());
        toggle().click();
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
        const main = document.querySelector('[role="main"]');
        const first = (match: (target: Element) => boolean) => {
          const animation = document.getAnimations().find(candidate => {
            const effect = candidate.effect as KeyframeEffect | null;
            const target = effect?.target;
            return (
              !before.has(candidate) &&
              target instanceof Element &&
              match(target) &&
              effect?.getKeyframes().some(frame => frame.opacity != null)
            );
          });
          const opacity = (
            animation?.effect as KeyframeEffect | undefined
          )?.getKeyframes()[0]?.opacity;
          return opacity == null ? null : Number(opacity);
        };
        const copyOf = (target: Element) => target.closest('[inert]');
        return {
          // The content's old wrap, held as its copy, and the new wrap.
          wrapCopy: first(
            target =>
              copyOf(target) === target && target.querySelector('nav') == null,
          ),
          newWrap: first(
            target => copyOf(target) == null && target.parentElement === main,
          ),
          // The rail's old state, held as its copy.
          railCopy: first(
            target =>
              copyOf(target) === target && target.querySelector('nav') != null,
          ),
        };
      }, blockMs);
    const settle = async () => {
      await expect
        .poll(async () => {
          const rest = await railAtRest(page);
          return rest.copies + rest.running;
        })
        .toBe(0);
    };
    const free = await reverse(0);
    await settle();
    const blocked = await reverse(1000);
    await settle();
    test.info().annotations.push({
      type: 'reversal fades (free, blocked)',
      description: JSON.stringify({free, blocked}),
    });
    for (const key of ['wrapCopy', 'newWrap', 'railCopy'] as const) {
      expect(free[key], key).not.toBeNull();
      expect(blocked[key], key).not.toBeNull();
      expect(
        Math.abs(Number(blocked[key]) - Number(free[key])),
        key,
      ).toBeLessThan(0.1);
    }
  });

  for (const load of LOADS) {
    test(`under Reduce Motion a click changes the rail and the page at once${underLoad(load)} (design:reduced-motion DR3)`, async ({
      page,
    }) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
      await openStory(page, DESKTOP_STORY);
      await applyLoad(page, load);
      await recordMotion(page);
      await toggleButton(page).click();
      await expect(toggleButton(page)).toHaveAccessibleName('Expand sidebar');
      expect(await settledMotion(page)).toEqual([]);
      expect(await railAtRest(page)).toMatchObject({
        labelsShown: false,
        copies: 0,
      });
    });
  }
});
