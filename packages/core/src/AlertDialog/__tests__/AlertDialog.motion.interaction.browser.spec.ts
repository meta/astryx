// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.motion.interaction.browser.spec.ts
 * @input The built AlertDialog stories on the phone profile, a desktop
 *   pointer profile, real touch input and the interaction harness
 * @output Proofs of the alert's touch motion in Chromium and WebKit: the
 *   scale and the fades on the theme's entrance and exit tokens, a
 *   theme's own tokens, the viewport start and the phone width, a turn back
 *   from where it is, input during either transition, frames through a
 *   blocked main thread, reduced motion, a toast that the alert's action
 *   raises, and a mouse's theme entrance
 * @position Motion lane of AlertDialog, beside the touch-tracking spec. Run
 *   with `pnpm test:interaction AlertDialog`.
 */

import {
  expect,
  test,
  type ElementHandle,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  blockMainThread,
  compareCurve,
  CONTROL_RGB,
  countBetween,
  frames,
  freezeTimers,
  installTimerGate,
  openStory,
  releaseAnimations,
  startBusyControl,
  startScreencast,
  thawTimers,
  timeline,
  touchDriver,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type CastFrame,
  type Point,
  type TouchDriver,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';
import {cubicBezier} from '../../motion/bezier';
import {parseCssEasing, parseMotionRoleValue} from '../../motion/roles';

const storybook = withStorybook(test);

/** iOS's alert starts at 1.2 times its size. */
const SCALE_FROM = 1.2;

/** iOS's alert width on a phone, in every theme. */
const PHONE_WIDTH = 320;

/** The theme's entrance timing, which the presentation plays. */
const ENTRANCE = {duration: '--duration-medium-max', easing: '--ease-entrance'};

/** The exit every overlay shares, which the dismissal plays. */
const EXIT = {duration: '--duration-exit', easing: '--ease-exit'};

/** The entrance and the exit in the busy-main-thread proof, ms. */
const BUSY_MS = 2000;

// The animator bakes curves into keyframes within 0.002 (opacity) and 0.0002
// (scale) of the curve; the engines round computed values on top of that.
const OPACITY_TOLERANCE = 0.004;
const SCALE_TOLERANCE = 0.001;

const centerOf = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
};

interface Opened {
  driver: TouchDriver;
  trigger: Locator;
  dialog: Locator;
}

/** Opens a story with the alert closed, in the neutral theme or `theme`. */
async function openPage(
  page: Page,
  {story = 'delete', theme}: {story?: string; theme?: string} = {},
): Promise<Opened> {
  const id = `core-alertdialog--${story}`;
  await openStory(page, storybook(), id);
  if (theme != null) {
    await page.goto(`${page.url()}&globals=astryxTheme:${theme}`);
    await page.getByRole('button', {name: 'Delete item'}).waitFor();
  }
  return {
    driver: await touchDriver(page),
    trigger: page.getByRole('button', {name: 'Delete item'}),
    dialog: page.getByRole('alertdialog', {name: 'Delete item?'}),
  };
}

/**
 * Sets a theme token on every element, over the theme's own value: the theme
 * sets its tokens on its element below the root. Call it once the story is
 * open: a navigation drops the style.
 */
async function setToken(page: Page, name: string, value: string) {
  await page.addStyleTag({content: `* { ${name}: ${value} !important; }`});
}

/**
 * The duration (ms) and the eased progress that the story's theme gives
 * `tokens`, read where the dialog is.
 */
async function themeTiming(
  page: Page,
  tokens: {duration: string; easing: string},
) {
  const [duration, easing] = await page.locator('dialog').evaluate(
    (element, names) => {
      const style = getComputedStyle(element);
      return names.map(name => style.getPropertyValue(name).trim());
    },
    [tokens.duration, tokens.easing],
  );
  const ms = parseMotionRoleValue('duration', duration);
  const points = parseCssEasing(easing);
  if (ms == null || points == null) {
    throw new Error(
      `the story theme gives no playable timing: ${duration}, ${easing}`,
    );
  }
  const ease = cubicBezier(points);
  return {ms, at: (t: number) => (t >= ms ? 1 : ease(Math.max(0, t) / ms))};
}

interface AnimateCall {
  pseudoElement: string | null;
  /** The properties its keyframes animate. */
  properties: string[];
  /** When every property has reached its end, ms after the start. */
  settleMs: number;
}

/**
 * Records every Web Animations call on the dialog and its `::backdrop`: what
 * the browser was asked to run, however short it is.
 */
async function recordAnimateCalls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const calls: unknown[] = [];
    (window as unknown as {__animateCalls: unknown[]}).__animateCalls = calls;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const animation = original.call(this, keyframes, options);
      if (this.tagName === 'DIALOG') {
        const effect = animation.effect as KeyframeEffect;
        const frameList = effect.getKeyframes();
        const properties = [
          ...new Set(
            frameList.flatMap(frame =>
              Object.keys(frame).filter(
                key =>
                  !['offset', 'computedOffset', 'easing', 'composite'].includes(
                    key,
                  ),
              ),
            ),
          ),
        ].sort();
        const duration = Number(effect.getTiming().duration);
        let settleMs = 0;
        for (const property of properties) {
          const end = frameList[frameList.length - 1][property];
          let reached = frameList.length - 1;
          while (reached > 0 && frameList[reached - 1][property] === end) {
            reached -= 1;
          }
          settleMs = Math.max(
            settleMs,
            frameList[reached].computedOffset * duration,
          );
        }
        calls.push({
          // What the call asked for: an engine may report the target's
          // pseudo-element differently (Linux WebKit answers '').
          pseudoElement:
            typeof options === 'object'
              ? (options.pseudoElement ?? null)
              : null,
          properties,
          settleMs,
        });
      }
      return animation;
    };
  });
}

async function animateCalls(page: Page): Promise<AnimateCall[]> {
  return page.evaluate(
    () => (window as unknown as {__animateCalls: AnimateCall[]}).__animateCalls,
  );
}

/**
 * Pauses every animation started on a dialog the moment it is created, so a
 * slow read still sees it whole. `sampleAlert` seeks them, and
 * `releaseAnimations` plays them.
 */
async function holdDialogAnimationsAtCreation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as {
      __harnessHeld?: Animation[];
      __ownAnimate?: Element['animate'];
    };
    record.__harnessHeld = [];
    const animate = record.__ownAnimate ?? Element.prototype.animate;
    record.__ownAnimate = animate;
    Element.prototype.animate = function hold(
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const animation = animate.apply(this, args);
      if (this instanceof HTMLDialogElement) {
        animation.pause();
        record.__harnessHeld = [...(record.__harnessHeld ?? []), animation];
      }
      return animation;
    };
  });
}

/** Stops holding new animations: the page's own `animate` again. */
async function stopHoldingAtCreation(page: Page): Promise<void> {
  await page.evaluate(() => {
    const own = (window as unknown as {__ownAnimate?: Element['animate']})
      .__ownAnimate;
    if (own != null) {
      Element.prototype.animate = own;
    }
  });
}

interface AlertSample {
  t: number;
  scale: number;
  opacity: number;
  dim: number;
}

/**
 * Seeks the held animations to each time and reads the presented scale,
 * opacity and dimming opacity there.
 */
async function sampleAlert(
  page: Page,
  times: ReadonlyArray<number>,
): Promise<AlertSample[]> {
  return page.evaluate(ts => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog == null) {
      throw new Error('no open dialog');
    }
    const held = (window as unknown as {__harnessHeld: Animation[]})
      .__harnessHeld;
    const scaleOf = (value: string) =>
      value === 'none' ? 1 : Number(value.split(' ')[0]);
    return ts.map(t => {
      for (const animation of held) {
        animation.currentTime = t;
      }
      const own = getComputedStyle(dialog);
      return {
        t,
        scale: scaleOf(own.scale),
        opacity: Number(own.opacity),
        dim: Number(getComputedStyle(dialog, '::backdrop').opacity),
      };
    });
  }, times);
}

/** A 30 fps film of `ms`, with its end. */
const filmTimes = (ms: number) => {
  const times = timeline(ms, 1000 / 30);
  return times.at(-1) === ms ? times : [...times, ms];
};

/** Waits until the page has made and held the alert's animations. */
async function whenHeld(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ((window as unknown as {__harnessHeld?: Animation[]}).__harnessHeld ?? [])
        .length > 0,
  );
}

const channel = (
  samples: ReadonlyArray<AlertSample>,
  key: 'scale' | 'opacity' | 'dim',
) => samples.map(s => ({t: s.t, value: s[key]}));

/**
 * Opens the alert and closes it 100 ms into its presentation, inside the page
 * on its own clock. Returns the presented opacity where the fade starts, the
 * fade's first keyframe, and the alert's opacity at every frame until it
 * closes.
 */
async function closeMidPresentation(page: Page) {
  const {trigger} = await openPage(page);
  await trigger.evaluate(opener => (opener as HTMLElement).click());
  return page.evaluate(async () => {
    const element = document.querySelector('dialog') as HTMLElement;
    const opacityAnimations = () =>
      element.getAnimations().filter(animation => {
        const effect = animation.effect as KeyframeEffect;
        return (
          effect.target === element &&
          effect.pseudoElement == null &&
          effect.getKeyframes().some(keyframe => 'opacity' in keyframe)
        );
      });
    const present = await new Promise<Animation>((resolve, reject) => {
      const giveUp = performance.now() + 2000;
      const look = () => {
        const found = opacityAnimations().find(
          animation => animation.startTime != null,
        );
        if (found != null) {
          resolve(found);
        } else if (performance.now() > giveUp) {
          reject(new Error('the alert did not present'));
        } else {
          requestAnimationFrame(look);
        }
      };
      look();
    });
    const presentEffect = present.effect as KeyframeEffect;
    const keyframes = presentEffect.getKeyframes().map(keyframe => ({
      offset: keyframe.computedOffset,
      value: Number(keyframe.opacity),
    }));
    const span = Number(presentEffect.getTiming().duration);
    const presentStart = Number(present.startTime);
    // The presentation's value at a time, as the browser computes it from
    // its keyframes (linear between them).
    const presentedAt = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - presentStart) / span));
      for (let i = 1; i < keyframes.length; i += 1) {
        const a = keyframes[i - 1];
        const b = keyframes[i];
        if (progress <= b.offset) {
          return b.offset === a.offset
            ? b.value
            : a.value +
                ((b.value - a.value) * (progress - a.offset)) /
                  (b.offset - a.offset);
        }
      }
      return keyframes[keyframes.length - 1].value;
    };
    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, presentStart + 100 - performance.now())),
    );
    // The page's clock as each animation on the dialog is made. The leave
    // reads the value on screen at its call, before it makes its fade.
    const madeAt = new Map<Animation, number>();
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const time = performance.now();
      const animation = animate.apply(this, args);
      if (this === element) {
        madeAt.set(animation, time);
      }
      return animation;
    };
    const play = Animation.prototype.play;
    Animation.prototype.play = function (this: Animation) {
      const time = performance.now();
      play.call(this);
      if (
        (this.effect as KeyframeEffect | null)?.target === element &&
        !madeAt.has(this)
      ) {
        madeAt.set(this, time);
      }
    };
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    // The leave starts in the effects of the commit that closes the alert.
    const fade = await new Promise<Animation>((resolve, reject) => {
      const giveUp = performance.now() + 1000;
      const look = () => {
        const found = opacityAnimations().find(
          animation => animation !== present,
        );
        if (found != null) {
          resolve(found);
        } else if (performance.now() > giveUp) {
          reject(new Error('no fade after the close'));
        } else {
          requestAnimationFrame(look);
        }
      };
      look();
    });
    const from = Number(
      (fade.effect as KeyframeEffect).getKeyframes()[0].opacity,
    );
    Element.prototype.animate = animate;
    Animation.prototype.play = play;
    // The leave reads the value at its call. That instant lies between the
    // fade's start time and the moment the fade is made: Chromium dates the
    // start at the call, and WebKit at its last frame before the call's task.
    const presentedAtClose = presentedAt(Number(fade.startTime));
    const presentedByClose = presentedAt(Number(madeAt.get(fade)));
    const framesSeen: number[] = [];
    let openFrames = 0;
    await new Promise<void>(resolve => {
      const tick = () => {
        framesSeen.push(Number(getComputedStyle(element).opacity));
        const isOpen = element.matches('[open]');
        openFrames += isOpen ? 1 : 0;
        if (isOpen && framesSeen.length < 90) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    return {
      presentedAtClose,
      presentedByClose,
      from,
      frames: framesSeen,
      openFrames,
    };
  });
}

/** The mean luma of `region` in each cast frame, read in a scratch page. */
async function trackLuma(
  page: Page,
  castFrames: ReadonlyArray<CastFrame>,
  region: {x: number; y: number; width: number; height: number},
): Promise<{t: number; luma: number}[]> {
  const scratch = await page.context().newPage();
  try {
    const out: {t: number; luma: number}[] = [];
    for (let i = 0; i < castFrames.length; i += 12) {
      const batch = castFrames.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, box}) => {
          const results: number[] = [];
          for (const item of items) {
            const blob = await (
              await fetch(`data:image/${item.format};base64,${item.data}`)
            ).blob();
            const bitmap = await createImageBitmap(blob);
            const scale = bitmap.width / item.viewportWidth;
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const {data} = context.getImageData(
              Math.round(box.x * scale),
              Math.round(box.y * scale),
              Math.max(1, Math.round(box.width * scale)),
              Math.max(1, Math.round(box.height * scale)),
            );
            let sum = 0;
            for (let o = 0; o < data.length; o += 4) {
              sum +=
                0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
            }
            results.push(sum / (data.length / 4));
          }
          return results;
        },
        {
          items: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          box: region,
        },
      );
      values.forEach((luma, k) => out.push({t: batch[k].t, luma}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

/**
 * Judges the alert against the compositor control in one busy window. Both
 * are read from the same screencast frames. The alert changes on every frame
 * the control moved, and stalls no longer than the control does. On a
 * two-core runner the block's spin starves the compositor and the screencast
 * alike, so a frame rate is no reference there.
 */
function judgeAgainstControl(
  alert: ReadonlyArray<{t: number; luma: number}>,
  control: ReadonlyArray<TrackedFrame>,
  window: {from: number; to: number},
) {
  let controlMoved = 0;
  let missed = 0;
  let alertStall = 0;
  let controlStall = 0;
  let longestAlertStall = 0;
  let longestControlStall = 0;
  for (let i = 1; i < alert.length; i += 1) {
    if (alert[i].t < window.from || alert[i].t > window.to) {
      continue;
    }
    const before = control[i - 1].box;
    const now = control[i].box;
    const controlMoves =
      before != null && now != null && Math.abs(now.x - before.x) > 0.5;
    const alertMoves = Math.abs(alert[i].luma - alert[i - 1].luma) > 0.05;
    controlStall = controlMoves ? 0 : controlStall + 1;
    alertStall = alertMoves ? 0 : alertStall + 1;
    longestControlStall = Math.max(longestControlStall, controlStall);
    longestAlertStall = Math.max(longestAlertStall, alertStall);
    if (controlMoves) {
      controlMoved += 1;
      if (!alertMoves) {
        missed += 1;
      }
    }
  }
  return {controlMoved, missed, longestAlertStall, longestControlStall};
}

/** Records when the dialog loses `open`: the end of the alert's fade. */
async function recordClose(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as {__closedAt: number};
    record.__closedAt = 0;
    const dialog = document.querySelector('dialog');
    if (dialog == null) {
      throw new Error('no dialog');
    }
    new MutationObserver((_, observer) => {
      if (!dialog.open) {
        record.__closedAt = performance.now();
        observer.disconnect();
      }
    }).observe(dialog, {attributes: true, attributeFilter: ['open']});
  });
}

const closedAt = async (page: Page) =>
  page.evaluate(() => (window as unknown as {__closedAt: number}).__closedAt);

test.describe('under a finger', () => {
  test("presents from scale 1.2 and opacity 0 with the dimming, on the theme's entrance timing", async ({
    page,
  }, testInfo) => {
    const {driver, trigger, dialog} = await openPage(page);
    const entrance = await themeTiming(page, ENTRANCE);
    await holdDialogAnimationsAtCreation(page);
    await driver.tap(await centerOf(trigger));
    await whenHeld(page);
    const samples = await sampleAlert(page, timeline(entrance.ms));
    await releaseAnimations(page);
    const scale = compareCurve(
      channel(samples, 'scale'),
      t => SCALE_FROM + (1 - SCALE_FROM) * entrance.at(t),
      SCALE_TOLERANCE,
    );
    const opacity = compareCurve(
      channel(samples, 'opacity'),
      entrance.at,
      OPACITY_TOLERANCE,
    );
    const dim = compareCurve(
      channel(samples, 'dim'),
      entrance.at,
      OPACITY_TOLERANCE,
    );
    await writeEvidence(
      'curves/alertdialog-present',
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {tokens: ENTRANCE, ms: entrance.ms, scale, opacity, dim},
          null,
          1,
        ),
      },
      testInfo,
    );
    expect(scale.maxError, JSON.stringify(scale.worst)).toBeLessThanOrEqual(
      SCALE_TOLERANCE,
    );
    expect(opacity.maxError, JSON.stringify(opacity.worst)).toBeLessThanOrEqual(
      OPACITY_TOLERANCE,
    );
    expect(dim.maxError, JSON.stringify(dim.worst)).toBeLessThanOrEqual(
      OPACITY_TOLERANCE,
    );
    // Nothing moves from the opener: the alert stays centred.
    await waitForRest(dialog);
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    if (box != null && viewport != null) {
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
    }
  });

  test("follows the theme's own tokens: a slower linear entrance and exit play as the theme sets them", async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page);
    await setToken(page, '--duration-medium-max', '1200ms');
    await setToken(page, '--ease-entrance', 'linear');
    await setToken(page, '--duration-exit', '900ms');
    await setToken(page, '--ease-exit', 'linear');
    await holdDialogAnimationsAtCreation(page);
    await driver.tap(await centerOf(trigger));
    await whenHeld(page);
    const [early, middle, end] = await sampleAlert(page, [300, 600, 1200]);
    await releaseAnimations(page);
    await stopHoldingAtCreation(page);
    expect(early.opacity).toBeCloseTo(0.25, 2);
    expect(middle.opacity).toBeCloseTo(0.5, 2);
    expect(middle.scale).toBeCloseTo(1.1, 3);
    expect(middle.dim).toBeCloseTo(0.5, 2);
    expect(end).toMatchObject({scale: 1, opacity: 1, dim: 1});
    await waitForRest(dialog);
    await installTimerGate(page);
    await holdDialogAnimationsAtCreation(page);
    await driver.tap(
      await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
    );
    await whenHeld(page);
    await freezeTimers(page);
    const [exitMiddle, exitEnd] = await sampleAlert(page, [450, 900]);
    await releaseAnimations(page);
    await thawTimers(page);
    expect(exitMiddle.opacity).toBeCloseTo(0.5, 2);
    expect(exitMiddle.dim).toBeCloseTo(0.5, 2);
    expect(exitMiddle.scale).toBe(1);
    expect(exitEnd.opacity).toBeLessThan(0.01);
    await expect(dialog).toBeHidden();
  });

  test('presents again on every open, with its dimming', async ({page}) => {
    await recordAnimateCalls(page);
    const {driver, trigger, dialog} = await openPage(page);
    for (const open of [1, 2, 3]) {
      const before = (await animateCalls(page)).length;
      await driver.tap(await centerOf(trigger));
      await waitForRest(dialog);
      const calls = (await animateCalls(page)).slice(before);
      expect(
        calls.some(
          call =>
            call.pseudoElement == null && call.properties.includes('scale'),
        ),
        `open ${open}: ${JSON.stringify(calls)}`,
      ).toBe(true);
      expect(
        calls.some(
          call =>
            call.pseudoElement === '::backdrop' &&
            call.properties.includes('opacity'),
        ),
        `open ${open}: ${JSON.stringify(calls)}`,
      ).toBe(true);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
      );
      await expect(dialog).toBeHidden();
    }
  });

  test("dismisses with a fade alone on the exit tokens, whatever the theme's dialog exit switch says, stays open while it fades, then closes and returns focus", async ({
    page,
  }, testInfo) => {
    const {driver, trigger, dialog} = await openPage(page);
    for (const dialogExit of ['off', 'on'] as const) {
      if (dialogExit === 'on') {
        // A theme that turns the pointer dialog exit on: the touch exit
        // stays on the exit tokens.
        await setToken(page, '--duration-exit-dialog', '300ms');
      }
      const exit = await themeTiming(page, EXIT);
      expect(exit.ms, dialogExit).toBeGreaterThan(0);
      await driver.tap(await centerOf(trigger));
      await waitForRest(dialog);
      await installTimerGate(page);
      await holdDialogAnimationsAtCreation(page);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
      );
      await whenHeld(page);
      // The exit's backstop timer must not close the dialog while it is held.
      await freezeTimers(page);
      const samples = await sampleAlert(page, timeline(exit.ms));
      // Still presented while it fades: the caller's state is already closed.
      expect(
        await dialog.evaluate(el => (el as HTMLDialogElement).open),
        dialogExit,
      ).toBe(true);
      await releaseAnimations(page);
      await thawTimers(page);
      await stopHoldingAtCreation(page);
      const scale = compareCurve(channel(samples, 'scale'), () => 1, 0);
      const opacity = compareCurve(
        channel(samples, 'opacity'),
        t => 1 - exit.at(t),
        OPACITY_TOLERANCE,
      );
      const dim = compareCurve(
        channel(samples, 'dim'),
        t => 1 - exit.at(t),
        OPACITY_TOLERANCE,
      );
      await writeEvidence(
        'curves/alertdialog-dismiss',
        {
          [`${testInfo.project.name}-${dialogExit}.json`]: JSON.stringify(
            {tokens: EXIT, ms: exit.ms, scale, opacity, dim},
            null,
            1,
          ),
        },
        testInfo,
      );
      expect(scale.maxError, JSON.stringify(scale.worst)).toBe(0);
      expect(
        opacity.maxError,
        JSON.stringify(opacity.worst),
      ).toBeLessThanOrEqual(OPACITY_TOLERANCE);
      expect(dim.maxError, JSON.stringify(dim.worst)).toBeLessThanOrEqual(
        OPACITY_TOLERANCE,
      );
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test('is 320 px wide on a phone and starts inside the viewport: at 1.2 when that fits, from the viewport width on a narrower screen, and clamped to a screen narrower than 320 px', async ({
    page,
  }) => {
    for (const viewportWidth of [402, 360, 300]) {
      await page.setViewportSize({width: viewportWidth, height: 714});
      const {driver, trigger, dialog} = await openPage(page);
      await holdDialogAnimationsAtCreation(page);
      await driver.tap(await centerOf(trigger));
      await whenHeld(page);
      const [start] = await sampleAlert(page, [0]);
      const box = await dialog.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          width: (el as HTMLElement).offsetWidth,
          viewport: document.documentElement.clientWidth,
        };
      });
      await releaseAnimations(page);
      if (viewportWidth > PHONE_WIDTH) {
        expect(box.width).toBe(PHONE_WIDTH);
      } else {
        expect(box.width).toBeLessThan(viewportWidth);
      }
      expect(start.scale).toBeCloseTo(
        Math.min(SCALE_FROM, box.viewport / box.width),
        3,
      );
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(box.viewport + 0.5);
    }
  });

  test('is 320 px wide on a phone in another theme too', async ({page}) => {
    const {driver, trigger, dialog} = await openPage(page, {theme: 'butter'});
    await driver.tap(await centerOf(trigger));
    await waitForRest(dialog);
    expect(await dialog.evaluate(el => (el as HTMLElement).offsetWidth)).toBe(
      PHONE_WIDTH,
    );
  });

  test('closed right after opening, it turns back from where it is: the fade starts at the presented opacity and only falls', async ({
    page,
  }) => {
    // A take in which the renderer painted no frame while the alert faded
    // measured nothing: a loaded WebKit can stall for a second. Such a take
    // is taken again.
    let result = await closeMidPresentation(page);
    for (let take = 1; take < 3 && result.openFrames < 2; take += 1) {
      result = await closeMidPresentation(page);
    }
    const detail = JSON.stringify(result);
    // Closed mid-presentation.
    expect(result.presentedAtClose, detail).toBeGreaterThan(0.05);
    expect(result.presentedAtClose, detail).toBeLessThan(0.99);
    // The fade starts where the presentation was at the close's call, with
    // no jump: between what the screen showed at the fade's start time and
    // when the fade was made.
    expect(result.from, detail).toBeGreaterThanOrEqual(
      result.presentedAtClose - OPACITY_TOLERANCE,
    );
    expect(result.from, detail).toBeLessThanOrEqual(
      result.presentedByClose + OPACITY_TOLERANCE,
    );
    expect(result.openFrames, detail).toBeGreaterThanOrEqual(2);
    // No frame shows more than where the fade started, and none rises again.
    let previous = result.from;
    for (const value of result.frames) {
      expect(value, detail).toBeLessThanOrEqual(previous + OPACITY_TOLERANCE);
      previous = value;
    }
  });

  test('a tap while the alert presents or leaves reaches nothing', async ({
    page,
  }) => {
    // A window capture listener added before the page's own scripts. It
    // hears a touch even when the input hold stops it at the window.
    await page.addInitScript(() => {
      const touches: number[] = [];
      (window as unknown as {__touchTimes: number[]}).__touchTimes = touches;
      window.addEventListener(
        'touchstart',
        event => touches.push(event.timeStamp),
        {capture: true, passive: true},
      );
    });
    const {driver, trigger, dialog} = await openPage(page);
    // A long entrance and exit, so the taps that must land inside them do.
    await setToken(page, '--duration-medium-max', '2000ms');
    await setToken(page, '--duration-exit', '2000ms');
    await driver.tap(await centerOf(trigger));
    const [running] = await waitForAnimation(dialog);
    const cancelPoint = await centerOf(
      dialog.getByRole('button', {name: 'Cancel'}),
    );
    const deletePoint = await centerOf(
      dialog.getByRole('button', {name: 'Delete'}),
    );
    await page.evaluate(() => {
      const touches = (window as unknown as {__touchTimes: number[]})
        .__touchTimes;
      touches.length = 0;
      const clicks: string[] = [];
      (window as unknown as {__clicks: string[]}).__clicks = clicks;
      document.addEventListener(
        'click',
        event => {
          const button = (event.target as Element).closest('button');
          if (button != null) {
            clicks.push(button.textContent ?? '');
          }
        },
        true,
      );
    });
    // A tap on Cancel while the alert presents.
    await driver.tap(cancelPoint);
    const touchTimes = async () =>
      page.evaluate(
        () => (window as unknown as {__touchTimes: number[]}).__touchTimes,
      );
    // The tap must land inside the presentation for this to prove anything.
    expect((await touchTimes())[0]).toBeLessThan(running.from + 2000);
    await waitForRest(dialog);
    await frames(page, 4);
    await expect(dialog).toBeVisible();
    // Presented, Cancel runs. A tap on Delete while the alert fades out runs
    // nothing.
    await recordClose(page);
    await driver.tap(cancelPoint);
    await driver.tap(deletePoint);
    await expect(dialog).toBeHidden({timeout: 5000});
    // The Delete tap landed before the fade ended.
    expect((await touchTimes())[2]).toBeLessThan(await closedAt(page));
    expect(
      await page.evaluate(
        () => (window as unknown as {__clicks: string[]}).__clicks,
      ),
    ).toEqual(['Cancel']);
  });

  test('a key still reaches the alert while it presents: Escape closes it', async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page);
    // A long entrance, so the key lands inside it.
    await setToken(page, '--duration-medium-max', '2000ms');
    await driver.tap(await centerOf(trigger));
    await waitForAnimation(dialog);
    // Presenting: the hold's shield is up, and the key still acts.
    expect(
      await dialog.evaluate(
        el =>
          el.querySelector(':scope > [popover][aria-hidden="true"]') != null,
      ),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({timeout: 5000});
    await expect(trigger).toBeFocused();
  });

  test('while the alert fades out its content is inert: focus leaves the actions, Tab reaches nothing, and focus returns to the opener when it closes', async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page);
    // A long exit, so the checks land inside it.
    await setToken(page, '--duration-exit', '2000ms');
    await driver.tap(await centerOf(trigger));
    await waitForRest(dialog);
    const cancel = dialog.getByRole('button', {name: 'Cancel'});
    await cancel.focus();
    await expect(cancel).toBeFocused();
    await driver.tap(await centerOf(cancel));
    const isOpen = async () =>
      dialog.evaluate(el => (el as HTMLDialogElement).open).catch(() => false);
    // The element with focus, unless it is the page or the dialog itself,
    // which take no key activation.
    const focusedControl = async () =>
      page.evaluate(() => {
        const focused = document.activeElement;
        return focused == null ||
          focused === document.body ||
          focused === document.documentElement ||
          focused === document.querySelector('dialog')
          ? null
          : `${focused.tagName} ${focused.textContent ?? ''}`;
      });
    // Leaving: still open, and no control has focus.
    expect(await isOpen()).toBe(true);
    expect(await focusedControl()).toBeNull();
    await page.keyboard.press('Tab');
    expect(await focusedControl()).toBeNull();
    await page.keyboard.press('Shift+Tab');
    expect(await focusedControl()).toBeNull();
    expect(await isOpen()).toBe(true);
    await expect(dialog).toBeHidden({timeout: 5000});
    await expect(trigger).toBeFocused();
  });

  test('while the alert fades out, a toast its action raised stays live above the hold: a tap on it runs (spec:AST-003 FR16)', async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page, {
      story: 'alert-over-a-toast',
    });
    // A long exit, so the tap on the toast lands inside it.
    await setToken(page, '--duration-exit', '2000ms');
    await driver.tap(await centerOf(trigger));
    await waitForRest(dialog);
    await recordClose(page);
    await driver.tap(
      await centerOf(dialog.getByRole('button', {name: 'Delete'})),
    );
    const undo = page.getByRole('button', {name: 'Undo'});
    await expect(undo).toBeVisible();
    // The toast slides in first: the tap goes where it rests.
    await waitForRest(page.locator('[data-toast-id]'));
    // Leaving: the alert is still open, and the toast is live above it.
    expect(await dialog.evaluate(el => (el as HTMLDialogElement).open)).toBe(
      true,
    );
    expect(await undo.evaluate(element => element.closest('[inert]'))).toBe(
      null,
    );
    await undo.evaluate(element => {
      element.addEventListener('click', () => {
        (window as unknown as {__undoAt: number}).__undoAt = performance.now();
      });
    });
    await driver.tap(await centerOf(undo));
    await expect(page.getByText('Undo taps: 1')).toBeVisible();
    await expect(dialog).toBeHidden({timeout: 5000});
    // The tap ran during the fade.
    const undoAt = await page.evaluate(
      () => (window as unknown as {__undoAt: number}).__undoAt,
    );
    expect(undoAt).toBeLessThan(await closedAt(page));
  });

  test('while the alert fades out, the words of a toast its action raised go to a live region assistive technology can read (spec:AST-086 FR2)', async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page, {
      story: 'alert-over-a-toast',
    });
    const openAndDelete = async () => {
      await driver.tap(await centerOf(trigger));
      await waitForRest(dialog);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Delete'})),
      );
    };
    // The first close announces, so the page's shared live regions exist
    // before the next close holds the alert.
    await openAndDelete();
    await expect(dialog).toBeHidden({timeout: 5000});
    // A long exit, so the words are written while the alert fades.
    await setToken(page, '--duration-exit', '2000ms');
    // Records each write of the words into a live region: whether the alert
    // still fades (its dismissal hold is up), and whether assistive
    // technology can read that region.
    await page.evaluate(() => {
      const writes: {isHeld: boolean; isExposed: boolean}[] = [];
      (
        window as unknown as {
          __writes: {isHeld: boolean; isExposed: boolean}[];
        }
      ).__writes = writes;
      const isLive = (element: Element) =>
        element.hasAttribute('aria-live') ||
        ['status', 'alert', 'log'].includes(element.getAttribute('role') ?? '');
      new MutationObserver(records => {
        for (const record of records) {
          let region =
            record.target instanceof Element
              ? record.target
              : record.target.parentElement;
          while (region != null && !isLive(region)) {
            region = region.parentElement;
          }
          if (region?.textContent?.includes('Item deleted') !== true) {
            continue;
          }
          const alert = document.querySelector('dialog');
          writes.push({
            isHeld:
              alert?.open === true &&
              alert.querySelector(':scope > [inert]') != null,
            isExposed:
              region.closest(
                '[inert], [aria-hidden="true"], dialog:not([open])',
              ) == null,
          });
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    const writes = async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __writes: {isHeld: boolean; isExposed: boolean}[];
            }
          ).__writes,
      );
    await openAndDelete();
    await expect.poll(async () => (await writes()).length).toBeGreaterThan(0);
    const written = await writes();
    // Each write lands while the alert fades, in a region assistive
    // technology can read.
    expect(written).toEqual(
      written.map(() => ({isHeld: true, isExposed: true})),
    );
    await expect(dialog).toBeHidden({timeout: 5000});
  });

  test('present and dismiss keep moving through a 1 s main-thread block, against a compositor control', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      "WebKit's screencast frames are JPEGs, whose noise can hide the one-level change this proof reads; the iOS simulator covers it",
    );
    const {driver, trigger, dialog} = await openPage(page);
    // Both motions run 2 s on straight curves here, so the 1 s block always
    // lands inside them. An opaque dim makes every frame of them change the
    // alert's pixels by over one level, which a lossless cast shows.
    await page.addStyleTag({
      content: `* { --duration-medium-max: ${BUSY_MS}ms !important; --duration-exit: ${BUSY_MS}ms !important; --ease-entrance: linear !important; --ease-exit: linear !important; --color-overlay: rgb(0 0 0) !important; }`,
    });
    // The control shows what the compositor presented in each block.
    const control = await startBusyControl(page);
    const proofs: Record<string, ReturnType<typeof judgeAgainstControl>> = {};
    for (const phase of ['present', 'dismiss'] as const) {
      const cast = await startScreencast(page, {format: 'png'});
      await driver.tap(
        await centerOf(
          phase === 'present'
            ? trigger
            : dialog.getByRole('button', {name: 'Cancel'}),
        ),
      );
      const [running] = await waitForAnimation(dialog, {minProgressMs: 16});
      // Above the alert, which entered the top layer after the control, and
      // presented there before the block holds the main thread.
      await control.raise();
      await frames(page, 3);
      const rest = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      });
      const block = await blockMainThread(page, 1000);
      const castFrames = await cast.stop();
      // The middle of the alert, inside its smallest box.
      const region = {
        x: rest.x + rest.width * 0.3,
        y: rest.y + rest.height * 0.3,
        width: rest.width * 0.4,
        height: rest.height * 0.4,
      };
      proofs[phase] = judgeAgainstControl(
        await trackLuma(page, castFrames, region),
        await trackMarker(page, castFrames, {rgb: CONTROL_RGB}),
        {
          from: block.from + 20,
          to: Math.min(block.to, running.from + BUSY_MS) - 20,
        },
      );
      if (phase === 'present') {
        await waitForRest(dialog, {timeout: 6000});
        await frames(page, 6);
      } else {
        await expect(dialog).toBeHidden({timeout: 6000});
      }
    }
    await control.remove();
    await writeEvidence(
      'busy-main-thread/alertdialog',
      {[`${testInfo.project.name}.json`]: JSON.stringify(proofs, null, 1)},
      testInfo,
    );
    // Enough control frames to judge, the alert changing on every one of
    // them, and no alert stall longer than the control's.
    for (const proof of Object.values(proofs)) {
      expect(proof.controlMoved, JSON.stringify(proofs)).toBeGreaterThanOrEqual(
        4,
      );
      expect(proof.missed, JSON.stringify(proofs)).toBe(0);
      expect(
        proof.longestAlertStall,
        JSON.stringify(proofs),
      ).toBeLessThanOrEqual(proof.longestControlStall);
    }
  });

  test('present and dismiss do no Layout or Paint per frame', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'a rendering trace is Chromium-only in Playwright',
    );
    const {trigger, dialog} = await openPage(page);
    const entrance = await themeTiming(page, ENTRANCE);
    const exit = await themeTiming(page, EXIT);
    const windows: Record<string, {from: number}> = {};
    // Opened by a script click and closed with Escape: a tapped button's own
    // press highlight fades with a paint per frame, which is not the alert's.
    const trace = await traceRendering(page, async () => {
      await trigger.evaluate(el => (el as HTMLElement).click());
      windows.present = (await waitForAnimation(dialog))[0];
      await waitForRest(dialog);
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      windows.dismiss = (await waitForAnimation(dialog))[0];
      await expect(dialog).toBeHidden();
    });
    const counts = Object.fromEntries(
      Object.entries(windows).map(([phase, window]) => [
        phase,
        // The steady part of the curve: the first and last frames may commit.
        countBetween(
          trace,
          window.from + 50,
          window.from + (phase === 'present' ? entrance.ms : exit.ms) - 50,
        ),
      ]),
    );
    for (const during of Object.values(counts)) {
      expect(during.Layout ?? 0, JSON.stringify(counts)).toBe(0);
      expect(during.Paint ?? 0, JSON.stringify(counts)).toBe(0);
    }
  });

  test('under reduced motion it cross-fades in and out, opacity only, settled within 200 ms, with no scale; the dimming too (design:reduced-motion DR1, DR2)', async ({
    page,
  }) => {
    await recordAnimateCalls(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, trigger, dialog} = await openPage(page);
    // A theme's longer exit still fades within the reduced 200 ms.
    await setToken(page, '--duration-exit', '600ms');
    await driver.tap(await centerOf(trigger));
    await waitForRest(dialog);
    const presented = await animateCalls(page);
    expect(presented.length).toBeGreaterThan(0);
    for (const call of presented) {
      expect(call.properties, JSON.stringify(presented)).toEqual(['opacity']);
      expect(call.settleMs, JSON.stringify(presented)).toBeLessThanOrEqual(200);
    }
    expect(
      presented.some(call => call.pseudoElement === '::backdrop'),
      JSON.stringify(presented),
    ).toBe(true);
    const before = presented.length;
    await driver.tap(
      await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
    );
    await expect(dialog).toBeHidden();
    const left = (await animateCalls(page)).slice(before);
    expect(left.length).toBeGreaterThan(0);
    for (const call of left) {
      expect(call.properties, JSON.stringify(left)).toEqual(['opacity']);
      expect(call.settleMs, JSON.stringify(left)).toBeLessThanOrEqual(200);
    }
  });

  test(
    'storyboard: present and dismiss',
    {tag: '@storyboard'},
    async ({page}, testInfo) => {
      const {driver, trigger, dialog} = await openPage(page);
      const entrance = await themeTiming(page, ENTRANCE);
      const exit = await themeTiming(page, EXIT);
      await installTimerGate(page);
      const measure = async () =>
        page.evaluate(() => {
          const element = document.querySelector('dialog[open]');
          if (element == null) {
            return {scale: null, opacity: null, dim: null};
          }
          const own = getComputedStyle(element);
          return {
            scale: own.scale,
            opacity: Number(own.opacity),
            dim: Number(getComputedStyle(element, '::backdrop').opacity),
          };
        });
      await driver.tap(await centerOf(trigger));
      await waitForAnimation(dialog);
      await freezeTimers(page);
      const {storyboard: presentBoard} = await animationStoryboard(page, {
        name: 'alertdialog-present',
        scope: dialog,
        times: filmTimes(entrance.ms),
        judges: {target: dialog, property: 'opacity'},
        measure,
        columns: 7,
        cellScale: 0.35,
      });
      await presentBoard.write(testInfo, {tokens: ENTRANCE, ms: entrance.ms});
      await releaseAnimations(page);
      await thawTimers(page);
      await waitForRest(dialog);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
      );
      await waitForAnimation(dialog);
      await freezeTimers(page);
      const {storyboard: dismissBoard} = await animationStoryboard(page, {
        name: 'alertdialog-dismiss',
        scope: dialog,
        times: filmTimes(exit.ms),
        judges: {target: dialog, property: 'opacity'},
        measure,
        columns: 7,
        cellScale: 0.35,
      });
      await dismissBoard.write(testInfo, {tokens: EXIT, ms: exit.ms});
      await releaseAnimations(page);
      await thawTimers(page);
      await expect(dialog).toBeHidden();
      const first = presentBoard.frames[0].data;
      const last = dismissBoard.frames.at(-1)?.data;
      expect(first).toMatchObject({opacity: 0, dim: 0});
      expect(Number(String(first.scale).split(' ')[0])).toBeCloseTo(
        SCALE_FROM,
        3,
      );
      expect(Number(last?.opacity)).toBeLessThan(0.01);
    },
  );
});

/**
 * Whether the dialog is still open on the next frame. Takes the element
 * before the close: a closed dialog leaves the accessibility tree.
 */
const openOnNextFrame = async (element: ElementHandle | null) =>
  element?.evaluate(
    async el =>
      new Promise<boolean>(resolve =>
        requestAnimationFrame(() => resolve((el as HTMLDialogElement).open)),
      ),
  );

test.describe("under a finger in Chrome's engine", () => {
  test.beforeEach(({browserName}) => {
    test.skip(browserName !== 'chromium', "Chrome's engine");
  });

  test("a finger gets the same touch motion: the animator's scale and fades, not the theme's entrance keyframes", async ({
    page,
  }) => {
    await recordAnimateCalls(page);
    const {driver, trigger, dialog} = await openPage(page);
    expect(
      await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        ios: CSS.supports('(-webkit-touch-callout: none)'),
      })),
    ).toEqual({coarse: true, ios: false});
    await driver.tap(await centerOf(trigger));
    await expect(dialog).toBeVisible();
    await waitForRest(dialog);
    const calls = await animateCalls(page);
    expect(
      calls.some(
        call => call.pseudoElement == null && call.properties.includes('scale'),
      ),
      JSON.stringify(calls),
    ).toBe(true);
    expect(
      calls.some(call => call.pseudoElement === '::backdrop'),
      JSON.stringify(calls),
    ).toBe(true);
    expect(
      await dialog.evaluate(el => getComputedStyle(el).animationName),
    ).toBe('none');
  });
});

test.describe('with a mouse', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 1280, height: 800},
  });

  test('keeps the theme entrance and closes at once', async ({page}) => {
    const {trigger, dialog} = await openPage(page);
    // A fine pointer in this context, before anything is checked.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    // Recorded as it starts: a short entrance can end before a poll after the
    // click first reads the page.
    await page.evaluate(() => {
      const record = window as unknown as {__entrance: number};
      record.__entrance = 0;
      document.addEventListener(
        'animationstart',
        event => {
          const {target, pseudoElement} = event;
          if (
            target instanceof Element &&
            target.tagName === 'DIALOG' &&
            !pseudoElement
          ) {
            record.__entrance += 1;
          }
        },
        {capture: true},
      );
    });
    await trigger.click();
    await waitForRest(dialog);
    // The theme's CSS entrance ran on the alert (an animationstart is a CSS
    // animation's).
    expect(
      await page.evaluate(
        () => (window as unknown as {__entrance: number}).__entrance,
      ),
    ).toBeGreaterThan(0);
    // A closed dialog leaves the accessibility tree: hold on to the element.
    const element = await dialog.elementHandle();
    await dialog.getByRole('button', {name: 'Cancel'}).click();
    // No exit: the dialog is closed by the next frame.
    expect(await openOnNextFrame(element)).toBe(false);
  });

  test('keeps its 400 px width at a desktop width, in the default theme and another', async ({
    page,
  }) => {
    for (const theme of ['neutral', 'butter']) {
      const {trigger, dialog} = await openPage(page, {theme});
      await trigger.click();
      await waitForRest(dialog);
      expect(
        await dialog.evaluate(el => (el as HTMLElement).offsetWidth),
        theme,
      ).toBe(400);
      await dialog.getByRole('button', {name: 'Cancel'}).click();
      await expect(dialog).toBeHidden();
    }
  });
});
