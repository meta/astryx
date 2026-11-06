// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AlertDialog.motion.interaction.browser.spec.ts
 * @input The built "Delete" AlertDialog story on the phone profile, a desktop
 *   pointer profile, real touch input and the interaction harness
 * @output Proofs of the alert's touch presentation in Chromium and WebKit.
 *   They cover UIKit's look on the theme's dialog entrance and exit, the
 *   viewport start and taps during either transition. They also cover frames
 *   through a blocked main thread, reduced motion, and a mouse's theme
 *   entrance. They also cover a toast the alert's action raises: it stays
 *   live, and it enters once
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
  blockMainThread,
  CONTROL_RGB,
  frames,
  openStory,
  startBusyControl,
  startScreencast,
  trackMarker,
  touchDriver,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type CastFrame,
  type Point,
  type TouchDriver,
  type TrackedFrame,
} from '@astryxdesign/interaction-harness';
import {alertController} from '../../motion/uikit/alert';

const storybook = withStorybook(test);

const {scaleFrom} = alertController.present;

/** A theme's longer exit, ms, in the proofs that need one. */
const EXIT_MS = 300;

/** The entrance and the exit in the busy-main-thread proof, ms. */
const BUSY_MS = 2000;

/** The touch exit's duration and curve, as the alert spells them. */
const EXIT_TIMING = {
  duration: 'var(--duration-exit, var(--duration-fast))',
  easing: 'var(--ease-exit)',
};

/** Dialog's entrance duration and curve. */
const ENTRANCE_TIMING = {
  duration: 'var(--duration-medium-max)',
  easing: 'var(--ease-standard)',
};

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

/** Opens the story with the alert closed. */
async function openPage(page: Page): Promise<Opened> {
  await openStory(page, storybook(), 'core-alertdialog--delete');
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
  await page.addStyleTag({
    content: `* { ${name}: ${value} !important; }`,
  });
}

/** A CSS time in ms. */
const msOf = (time: string): number =>
  time.endsWith('ms')
    ? Number.parseFloat(time)
    : Number.parseFloat(time) * 1000;

/** The dialog's and its backdrop's animation duration and curve. */
async function timingOf(dialog: Locator) {
  return dialog.evaluate(element => {
    const own = getComputedStyle(element);
    const dim = getComputedStyle(element, '::backdrop');
    return {
      duration: own.animationDuration,
      easing: own.animationTimingFunction,
      dimDuration: dim.animationDuration,
      dimEasing: dim.animationTimingFunction,
    };
  });
}

/**
 * A duration and a curve as the dialog's animation computes them: a probe
 * beside the dialog resolves both in the browser's own form.
 */
async function tokenTiming(
  dialog: Locator,
  timing: {duration: string; easing: string},
) {
  return dialog.evaluate((element, values) => {
    const probe = element.ownerDocument.createElement('div');
    probe.style.animationDuration = values.duration;
    probe.style.animationTimingFunction = values.easing;
    element.parentElement?.append(probe);
    const style = getComputedStyle(probe);
    const resolved = {
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
    };
    probe.remove();
    return resolved;
  }, timing);
}

/**
 * Pauses the dialog's CSS animations and its backdrop's as the browser makes
 * them, before any frame, so a slow read still sees them whole.
 * `sampleDialog` seeks them, and `release` resumes them.
 */
async function holdAtStart(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = window as unknown as {__held: Animation[]};
    record.__held = [];
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('dialog');
      const made = document
        .getAnimations()
        .filter(a => (a.effect as KeyframeEffect | null)?.target === dialog);
      if (made.length > 0) {
        observer.disconnect();
        record.__held = made;
        for (const animation of made) {
          animation.pause();
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}

async function whenHeld(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as {__held: Animation[]}).__held.length > 0,
  );
}

interface Look {
  scale: number;
  opacity: number;
  dim: number;
}

/**
 * Seeks the held animations to each time and reads what the screen shows
 * there.
 */
async function sampleDialog(
  page: Page,
  times: ReadonlyArray<number>,
): Promise<{
  /** Each held animation: a CSS animation, and its length in ms. */
  held: {css: boolean; duration: number}[];
  looks: Look[];
}> {
  return page.evaluate(ts => {
    const held = (window as unknown as {__held: Animation[]}).__held;
    const dialog = (held[0]?.effect as KeyframeEffect | null)?.target;
    if (!(dialog instanceof Element)) {
      throw new Error('no held dialog animation');
    }
    const scaleOf = (value: string) =>
      value === 'none' ? 1 : Number(value.split(' ')[0]);
    const looks = ts.map(t => {
      for (const animation of held) {
        animation.currentTime = t;
      }
      return {
        scale: scaleOf(getComputedStyle(dialog).scale),
        opacity: Number(getComputedStyle(dialog).opacity),
        dim: Number(getComputedStyle(dialog, '::backdrop').opacity),
      };
    });
    return {
      held: held.map(animation => ({
        css: 'animationName' in animation,
        duration: Number(animation.effect?.getComputedTiming().duration),
      })),
      looks,
    };
  }, times);
}

async function release(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of (window as unknown as {__held: Animation[]})
      .__held) {
      animation.play();
    }
  });
}

interface NextAnimations {
  /** When the browser made them, ms on the page's clock. */
  madeAt: number;
  /** When the dialog closed, ms on the page's clock; 0 while open. */
  closedAt: number;
  animations: {
    css: boolean;
    duration: number;
    properties: string[];
    opacities: number[];
  }[];
  easing: string;
}

/**
 * Records the dialog's next CSS animations as the browser makes them,
 * without holding them, and when the dialog closes.
 */
async function recordNextAnimations(dialog: Locator): Promise<void> {
  await dialog.evaluate(element => {
    const log: NextAnimations = {
      madeAt: 0,
      closedAt: 0,
      animations: [],
      easing: '',
    };
    (window as unknown as {__next: NextAnimations}).__next = log;
    const observer = new MutationObserver(() => {
      const made = document
        .getAnimations()
        .filter(a => (a.effect as KeyframeEffect | null)?.target === element);
      if (made.length === 0) {
        return;
      }
      observer.disconnect();
      log.madeAt = performance.now();
      log.easing = getComputedStyle(element).animationTimingFunction;
      log.animations = made.map(animation => {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        const meta = new Set([
          'offset',
          'computedOffset',
          'easing',
          'composite',
        ]);
        return {
          css: 'animationName' in animation,
          duration: Number(animation.effect?.getComputedTiming().duration),
          properties: [
            ...new Set(
              frames.flatMap(frame =>
                Object.keys(frame).filter(key => !meta.has(key)),
              ),
            ),
          ],
          opacities: frames.map(frame => Number(frame.opacity)),
        };
      });
    });
    observer.observe(element, {attributes: true});
    element.addEventListener('close', () => {
      log.closedAt = performance.now();
    });
  });
}

async function nextAnimations(page: Page): Promise<NextAnimations> {
  return page.evaluate(
    () => (window as unknown as {__next: NextAnimations}).__next,
  );
}

/** The midpoint's progress on each channel: they share one curve. */
function progressAt(look: Look, from: Look, to: Look) {
  const part = (key: keyof Look) =>
    (look[key] - from[key]) / (to[key] - from[key]);
  return {
    scale: from.scale === to.scale ? null : part('scale'),
    opacity: part('opacity'),
    dim: part('dim'),
  };
}

/**
 * The mean luminance of `region` (CSS px) in each screencast frame. Decoding
 * runs in a scratch page of the same browser, as `trackMarker`'s does.
 */
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
 * Judges the alert against the compositor control in one busy window, as
 * `busyWindowProof` judges a moving element against it. Both are read from
 * the same screencast frames. The alert changes on every frame the control
 * moved, and stalls no longer than the control does. On a two-core runner the
 * block's spin starves the compositor and the screencast alike, so a frame
 * rate is no reference there.
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

test.describe('under a finger', () => {
  test("presents from scale 1.2 and opacity 0 with the dimming, on the theme's dialog entrance", async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page);
    await holdAtStart(page);
    await driver.tap(await centerOf(trigger));
    await whenHeld(page);
    const timing = await timingOf(dialog);
    const entrance = await tokenTiming(dialog, ENTRANCE_TIMING);
    const entranceMs = msOf(entrance.duration);
    const {held, looks} = await sampleDialog(page, [
      0,
      entranceMs / 2,
      entranceMs,
    ]);
    await release(page);
    // The alert's own CSS animation and the dimming's, on the entrance
    // tokens.
    expect(held).toEqual([
      {css: true, duration: entranceMs},
      {css: true, duration: entranceMs},
    ]);
    expect(timing).toEqual({
      duration: entrance.duration,
      easing: entrance.easing,
      dimDuration: entrance.duration,
      dimEasing: entrance.easing,
    });
    const [start, mid, end] = looks;
    expect(start).toEqual({scale: scaleFrom, opacity: 0, dim: 0});
    expect(end).toEqual({scale: 1, opacity: 1, dim: 1});
    // Midway, the scale, the opacity and the dimming are as far along.
    const progress = progressAt(mid, start, end);
    expect(progress.opacity).toBeGreaterThan(0);
    expect(progress.opacity).toBeLessThan(1);
    expect(progress.scale ?? 0).toBeCloseTo(progress.opacity, 2);
    expect(progress.dim).toBeCloseTo(progress.opacity, 2);
  });

  test("dismisses with a fade alone on the exit tokens, whatever the theme's dialog exit switch says, then closes and returns focus", async ({
    page,
  }) => {
    const {driver, trigger, dialog} = await openPage(page);
    for (const dialogExit of ['off', 'on'] as const) {
      if (dialogExit === 'on') {
        // A theme that turns the pointer dialog exit on: the touch exit stays.
        // Dialog does not read this switch yet, so this leg repeats the "off"
        // one. It checks the switch once Dialog plays a pointer exit.
        await setToken(page, '--duration-exit-dialog', `${EXIT_MS}ms`);
      }
      await driver.tap(await centerOf(trigger));
      await waitForRest(dialog);
      const exit = await tokenTiming(dialog, EXIT_TIMING);
      await recordNextAnimations(dialog);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
      );
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      const log = await nextAnimations(page);
      const exitMs = msOf(exit.duration);
      // The alert's own fade and the dimming's: opacity alone, from 1 to 0,
      // on the exit tokens.
      const fade = {
        css: true,
        duration: exitMs,
        properties: ['opacity'],
        opacities: [1, 0],
      };
      expect(exitMs, dialogExit).toBeGreaterThan(0);
      expect(log.animations, dialogExit).toEqual([fade, fade]);
      expect(log.easing, dialogExit).toBe(exit.easing);
      // It stays presented until the fade has run its length.
      expect(log.closedAt - log.madeAt, dialogExit).toBeGreaterThanOrEqual(
        exitMs,
      );
    }
  });

  test("starts inside the viewport: on a screen narrower than UIKit's 1.2 start, from the viewport's width", async ({
    page,
  }) => {
    // 360 px: the 320 px alert at 1.2 would be 384 px wide.
    await page.setViewportSize({width: 360, height: 714});
    const {driver, trigger, dialog} = await openPage(page);
    await holdAtStart(page);
    await driver.tap(await centerOf(trigger));
    await whenHeld(page);
    // Seeked to the presentation's first frame.
    const {looks} = await sampleDialog(page, [0]);
    const box = await dialog.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: (el as HTMLElement).offsetWidth,
        viewport: document.documentElement.clientWidth,
      };
    });
    await release(page);
    expect(box.width).toBe(alertController.width);
    expect(looks[0].scale).toBeCloseTo(box.viewport / box.width, 3);
    expect(looks[0].scale).toBeLessThan(scaleFrom);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.viewport + 0.5);
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
    // The entrance's animation, held from its start. A finished animation
    // leaves the document's list, and a slow runner can read the page late.
    await page.evaluate(() => {
      const holder = window as unknown as {__entrance?: Animation};
      document.addEventListener(
        'animationstart',
        event => {
          const {target, pseudoElement} = event;
          if (
            holder.__entrance != null ||
            !(target instanceof HTMLDialogElement) ||
            pseudoElement
          ) {
            return;
          }
          holder.__entrance = target
            .getAnimations()
            .find(
              animation =>
                (animation as CSSAnimation).animationName ===
                event.animationName,
            );
        },
        {capture: true},
      );
    });
    await driver.tap(await centerOf(trigger));
    await waitForAnimation(dialog);
    const cancelPoint = await centerOf(
      dialog.getByRole('button', {name: 'Cancel'}),
    );
    const deletePoint = await centerOf(
      dialog.getByRole('button', {name: 'Delete'}),
    );
    await page.evaluate(() => {
      const dialogElement = document.querySelector('dialog[open]');
      const entrance = (window as unknown as {__entrance?: Animation})
        .__entrance;
      const touches = (window as unknown as {__touchTimes: number[]})
        .__touchTimes;
      touches.length = 0;
      const log = {
        start: Number(entrance?.startTime),
        end: Number(entrance?.effect?.getComputedTiming().endTime),
        closedAt: 0,
        touches,
        clicks: [] as string[],
      };
      (window as unknown as {__tapLog: typeof log}).__tapLog = log;
      dialogElement?.addEventListener('close', () => {
        log.closedAt = performance.now();
      });
      document.addEventListener(
        'click',
        event => {
          const button = (event.target as Element).closest('button');
          if (button != null) {
            log.clicks.push(button.textContent ?? '');
          }
        },
        true,
      );
    });
    const readTapLog = async () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __tapLog: {
                start: number;
                end: number;
                closedAt: number;
                touches: number[];
                clicks: string[];
              };
            }
          ).__tapLog,
      );
    // A tap on Cancel while the alert presents.
    await driver.tap(cancelPoint);
    // The tap must land inside the presentation for this to prove anything.
    const {start, end, touches} = await readTapLog();
    expect(touches[0] - start).toBeLessThan(end);
    await waitForRest(dialog);
    await frames(page, 4);
    await expect(dialog).toBeVisible();
    // Presented, Cancel runs. A tap on Delete while the alert fades out runs
    // nothing.
    await driver.tap(cancelPoint);
    await driver.tap(deletePoint);
    await expect(dialog).toBeHidden();
    const after = await readTapLog();
    // The Delete tap landed before the alert closed.
    expect(after.touches[2]).toBeLessThan(after.closedAt);
    expect(after.clicks).toEqual(['Cancel']);
  });

  test('present and dismiss keep moving through a 1 s main-thread block, against a compositor control', async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright (WebKit: the iOS simulator rig)',
    );
    const {driver, trigger, dialog} = await openPage(page);
    // Both motions run 2 s on straight curves here, so the 1 s block always
    // lands inside them. An opaque dim makes every frame of them change the
    // alert's pixels by over one level, which a lossless cast shows.
    await page.addStyleTag({
      content: `dialog { --duration-medium-max: ${BUSY_MS}ms !important; --duration-exit: ${BUSY_MS}ms !important; --ease-standard: linear !important; --ease-exit: linear !important; --color-overlay: rgb(0 0 0) !important; }`,
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
      if (phase === 'present') {
        // Above the alert, which opened after the control, and presented
        // there before the block holds the main thread.
        await control.raise();
        await frames(page, 3);
      }
      const rest = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
      });
      const block = await blockMainThread(page, 1000);
      const castFrames = await cast.stop();
      expect(msOf((await timingOf(dialog)).duration)).toBe(BUSY_MS);
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
        await waitForRest(dialog);
        await frames(page, 6);
      } else {
        await expect(dialog).toBeHidden();
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

  test('while the alert fades out, a toast its action raised stays live above the hold: a tap on it runs (spec:AST-003 FR16)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-alertdialog--alert-over-a-toast');
    const driver = await touchDriver(page);
    const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
    // A long exit, so the tap on the toast lands inside it.
    await setToken(page, '--duration-exit', '2000ms');
    await driver.tap(
      await centerOf(page.getByRole('button', {name: 'Delete item'})),
    );
    await waitForRest(dialog);
    await driver.tap(
      await centerOf(dialog.getByRole('button', {name: 'Delete'})),
    );
    const undo = page.getByRole('button', {name: 'Undo'});
    await expect(undo).toBeVisible();
    // The toast slides in first: the tap goes where it rests.
    await waitForRest(page.locator('[data-toast-id]'));
    // Leaving: still shown while it fades out, with the toast inside it.
    await expect(dialog).toBeVisible();
    expect(await undo.evaluate(element => element.closest('[inert]'))).toBe(
      null,
    );
    // Records the order of the toast's click and the alert's close.
    await page.evaluate(() => {
      (window as unknown as {__order: string[]}).__order = [];
    });
    await dialog.evaluate(element => {
      element.addEventListener(
        'close',
        () => (window as unknown as {__order: string[]}).__order.push('close'),
        {once: true},
      );
    });
    await undo.evaluate(element => {
      element.addEventListener('click', () =>
        (window as unknown as {__order: string[]}).__order.push('undo'),
      );
    });
    await driver.tap(await centerOf(undo));
    await expect(page.getByText('Undo taps: 1')).toBeVisible();
    await expect(dialog).toBeHidden();
    // The tap ran during the fade, before the alert closed. The dialog's
    // close event comes in a later task than its hiding.
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as {__order: string[]}).__order),
      )
      .toEqual(['undo', 'close']);
  });

  test('a toast the alert raises enters once: repeated alerts move it in and out, and it starts no transition (component:Toast FR12)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-alertdialog--alert-over-a-toast');
    const driver = await touchDriver(page);
    const dialog = page.getByRole('alertdialog', {name: 'Delete item?'});
    const row = page.locator('[data-toast-id]');
    // Records each transition or animation that starts on the toast's row or
    // card.
    await page.evaluate(() => {
      const starts: string[] = [];
      (window as unknown as {__starts: string[]}).__starts = starts;
      const onStart = (event: Event) => {
        const {target} = event;
        if (!(target instanceof Element)) {
          return;
        }
        const part = target.matches('[data-toast-id]')
          ? 'row'
          : target.matches('[data-toast-id] .astryx-toast')
            ? 'card'
            : null;
        if (part == null) {
          return;
        }
        const property =
          event instanceof TransitionEvent
            ? event.propertyName
            : (event as AnimationEvent).animationName;
        starts.push(`${part} ${property}`);
      };
      document.addEventListener('transitionrun', onStart, true);
      document.addEventListener('animationstart', onStart, true);
    });
    const takeStarts = async () =>
      page.evaluate(() => {
        const starts = (window as unknown as {__starts: string[]}).__starts;
        return starts.splice(0, starts.length);
      });
    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await driver.tap(
        await centerOf(page.getByRole('button', {name: 'Delete item'})),
      );
      await waitForRest(dialog);
      await driver.tap(
        await centerOf(dialog.getByRole('button', {name: 'Delete'})),
      );
      await expect(dialog).toBeHidden();
      await waitForRest(row);
      const starts = await takeStarts();
      if (cycle === 1) {
        // The recorder sees the first entrance, so the empty lists below
        // count.
        expect(starts).toEqual(
          expect.arrayContaining(['row grid-template-rows', 'card opacity']),
        );
      } else {
        // The alert moved the toast in and out, and its action updated the
        // toast in place. Nothing started again.
        expect(starts).toEqual([]);
      }
    }
    await expect(row).toHaveCount(1);
  });

  test('while the alert fades out its content is inert: focus leaves the actions, Tab cannot reach them, and focus returns to the opener', async ({
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
    // Leaving: still shown while it fades out.
    await expect(dialog).toBeVisible();
    // WebKit's Tab can focus the dialog element itself, which holds no action.
    const inContent = async () =>
      page.evaluate(() => {
        const open = document.querySelector('dialog[open]');
        const focused = document.activeElement;
        return open != null && focused !== open && open.contains(focused);
      });
    expect(await inContent()).toBe(false);
    await page.keyboard.press('Tab');
    expect(await inContent()).toBe(false);
    await page.keyboard.press('Shift+Tab');
    expect(await inContent()).toBe(false);
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("under reduced motion the alert and the dimming only fade in, over 200 ms, and a theme's exit fades within 200 ms (design:reduced-motion DR1, DR2)", async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {driver, trigger, dialog} = await openPage(page);
    await setToken(page, '--duration-exit', `${EXIT_MS}ms`);
    await holdAtStart(page);
    await driver.tap(await centerOf(trigger));
    await whenHeld(page);
    const timing = await timingOf(dialog);
    const {held, looks} = await sampleDialog(page, [0]);
    await release(page);
    // Dialog's reduced cross-fade on a touch screen, for the alert and the
    // dimming alike.
    expect(held).toEqual([
      {css: true, duration: 200},
      {css: true, duration: 200},
    ]);
    expect(msOf(timing.duration)).toBe(200);
    expect(msOf(timing.dimDuration)).toBe(200);
    expect(looks[0]).toEqual({scale: 1, opacity: 0, dim: 0});
    await waitForRest(dialog);
    // The theme's 300 ms exit fades within the reduced 200 ms.
    await recordNextAnimations(dialog);
    await driver.tap(
      await centerOf(dialog.getByRole('button', {name: 'Cancel'})),
    );
    await expect(dialog).toBeHidden();
    const exit = await nextAnimations(page);
    expect(exit.animations.map(animation => animation.duration)).toEqual([
      200, 200,
    ]);
  });
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

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('keeps the theme entrance and closes at once', async ({page}) => {
    const {trigger, dialog} = await openPage(page);
    // A fine pointer in this context, before anything is checked.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    // Recorded as it starts, because a short entrance can end before a poll
    // after the click first reads the page. On a busy WebKit, that first read
    // takes longer than the entrance.
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
});
