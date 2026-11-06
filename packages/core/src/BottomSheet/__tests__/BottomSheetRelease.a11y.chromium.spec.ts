// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetRelease.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP), each
 *   event with its own timestamp
 * @output Browser evidence for a touch drag's close: the close and its
 *   scrim's running fade play on one clock and end together. That holds at
 *   each tempo, from the top snap point, and in a switcher flow. A mouse
 *   close under reduced motion moves no further.
 * @position Chromium proof for the drag's close and its scrim. The page reads
 *   the events' timestamps, so load cannot change the release speed.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {END_HOLD_MS} from '../../motion/animator';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

async function openFilters(page: Page) {
  return openSheet(page, 'showcase', 'Open sheet', 'Filters');
}

async function openSheet(
  page: Page,
  story: string,
  opener: string | null,
  name: string,
  component = 'bottomsheet',
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-${component}--${story}&viewMode=story`,
  );
  if (opener != null) {
    await page.getByRole('button', {name: opener}).click();
  }
  const dialog = page.getByRole('dialog', {name});
  await expect(dialog).toBeVisible();
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  // At rest: nothing runs, and the sheet holds still between two frames.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const running = document
          .getAnimations()
          .some(animation => animation.playState === 'running');
        const top = () =>
          document
            .querySelector('.astryx-bottom-sheet')
            ?.getBoundingClientRect().top ?? 0;
        const before = top();
        await new Promise(resolve => requestAnimationFrame(resolve));
        return !running && Math.abs(top() - before) < 0.5;
      }),
    )
    .toBe(true);
  return {dialog, sheet};
}

/** A drag on the grabber of `distance` px in `ms`, each event timestamped. */
async function drag(
  cdp: CDPSession,
  sheet: Locator,
  distance: number,
  ms: number,
) {
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  const base = Date.now();
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{x, y}],
    timestamp: base / 1000,
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{x, y: y + (distance * i) / steps}],
      timestamp: (base + (ms * i) / steps) / 1000,
    });
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
    timestamp: (base + ms + 1) / 1000,
  });
}

test('a mouse close under reduced motion moves the sheet no further', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {dialog, sheet} = await openFilters(page);
  const rest = await sheet.evaluate(el => el.getBoundingClientRect());
  // Every frame's sheet top, and the time the button comes up.
  await page.evaluate(() => {
    const frames = {
      samples: [] as [number, number][],
      upAt: Number.POSITIVE_INFINITY,
      done: false,
    };
    (window as unknown as {sheetFrames: typeof frames}).sheetFrames = frames;
    window.addEventListener(
      'pointerup',
      () => {
        frames.upAt = performance.now();
      },
      {capture: true},
    );
    const record = (now: number) => {
      const panel = document.querySelector('.astryx-bottom-sheet');
      if (panel == null || document.querySelector('dialog[open]') == null) {
        frames.done = true;
        return;
      }
      frames.samples.push([now, panel.getBoundingClientRect().top]);
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  const x = rest.x + rest.width / 2;
  const y = rest.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 150, {steps: 5});
  await page.mouse.up();
  // While the dialog closes, no drag exit plays: no inline transition and no
  // animation moves the sheet.
  const exitPlayed = await page.evaluate(async () => {
    let played = false;
    for (let frame = 0; frame < 10; frame += 1) {
      const panel = document.querySelector<HTMLElement>('.astryx-bottom-sheet');
      if (panel == null || document.querySelector('dialog[open]') == null) {
        break;
      }
      played ||=
        panel.style.transitionDuration !== '' ||
        panel
          .getAnimations()
          .some(
            animation =>
              animation.effect instanceof KeyframeEffect &&
              animation.effect
                .getKeyframes()
                .some(key => key.translate != null),
          );
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return played;
  });
  expect(exitPlayed).toBe(false);
  await expect(dialog).toBeHidden({timeout: 2_000});
  const read = async () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            sheetFrames: {
              samples: [number, number][];
              upAt: number;
              done: boolean;
            };
          }
        ).sheetFrames,
    );
  await expect
    .poll(async () => (await read()).done, {timeout: 2_000})
    .toBe(true);
  const {samples, upAt} = await read();
  const before = samples.filter(([at]) => at <= upAt).map(([, top]) => top);
  const released = Math.max(...before);
  // Reduced motion runs no transform motion: after the release, no frame
  // shows the sheet on its way between where the drag left it and rest.
  const between = samples.filter(
    ([at, top]) => at > upAt && top > rest.top + 2 && top < released - 2,
  );
  const trace = samples.map(([, top]) => Math.round(top)).join(' ');
  expect(released - rest.top).toBeGreaterThan(100);
  expect(between, trace).toEqual([]);
});

interface CloseWatch {
  /** The backdrop's running opacity transition, ms. */
  fade: number;
  /** The close's curve, ms. */
  close: number;
  /** Where each started, on the page's clock. */
  fadeStart: number;
  closeStart: number;
  /** When the dialog closed, on the page's clock. */
  closedAt: number;
}

/**
 * The first step of the deprecated switcher's flow, which a swipe closes. The
 * story opens the flow itself.
 */
async function openFlow(page: Page) {
  return openSheet(
    page,
    'capped',
    null,
    'Set up notifications',
    'bottomsheetswitcher',
  );
}

/**
 * A flick that closes Filters, or `open`'s sheet, at `tempo` or the theme's
 * own: 60 px in `dragMs`, 3,000 px/s by default. It reads what runs: the
 * backdrop's opacity transition and the close's curve.
 */
async function dragClose(
  page: Page,
  tempo: number | null,
  open: typeof openFilters = openFilters,
  dragMs = 20,
) {
  const {dialog, sheet} = await open(page);
  if (tempo != null) {
    // The private property a theme that sets tempo writes, on the sheet
    // itself: the story's theme writes tempo 1 nearer the sheet than :root.
    await page.addStyleTag({
      content: `.astryx-bottom-sheet { --_astryx-motion-tempo: ${tempo} !important; }`,
    });
  }
  // Each frame until the dialog closes, keep the latest backdrop fade and the
  // close's animation. A drag can start fades of its own before the close.
  await dialog.evaluate((element, holdMs) => {
    const watch: CloseWatch = {
      fade: Number.NaN,
      close: Number.NaN,
      fadeStart: Number.NaN,
      closeStart: Number.NaN,
      closedAt: Number.NaN,
    };
    Object.assign(window, {closeWatch: watch});
    const look = () => {
      // A switcher step's dialog can hide without a close event.
      if (
        !(element as HTMLDialogElement).open ||
        element.getClientRects().length === 0
      ) {
        watch.closedAt = performance.now();
        return;
      }
      const fades = document.getAnimations().filter(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        return (
          animation instanceof CSSTransition &&
          animation.transitionProperty === 'opacity' &&
          effect?.target === element &&
          effect.pseudoElement === '::backdrop'
        );
      });
      const fade = fades[fades.length - 1];
      if (fade?.startTime != null) {
        watch.fade = Number(fade.effect?.getTiming().duration);
        watch.fadeStart = Number(fade.startTime);
      }
      const close = element
        .querySelector('.astryx-bottom-sheet')
        ?.getAnimations()[0];
      if (close?.startTime != null) {
        // The animator holds the end state for holdMs after the curve.
        watch.close =
          Number(close.effect?.getComputedTiming().duration) - holdMs;
        watch.closeStart = Number(close.startTime);
      }
      if (Number.isNaN(watch.closedAt)) {
        requestAnimationFrame(look);
      }
    };
    requestAnimationFrame(look);
  }, END_HOLD_MS);
  const cdp = await page.context().newCDPSession(page);
  await drag(cdp, sheet, 60, dragMs);
  const read = async () =>
    page.evaluate(
      () => (window as unknown as {closeWatch: CloseWatch}).closeWatch,
    );
  // A switcher step leaves the accessibility tree at once, and its dialog
  // closes once the close ends.
  await expect
    .poll(async () => Number.isFinite((await read()).closedAt), {
      timeout: 5_000,
    })
    .toBe(true);
  return read();
}

/** Expects the scrim's running fade to play on the close's own clock. */
function expectFadeWithClose(watch: CloseWatch) {
  const fadeEnd = watch.fadeStart + watch.fade;
  expect(Math.abs(watch.fade - watch.close)).toBeLessThan(2);
  // The two end within one frame of each other.
  expect(Math.abs(fadeEnd - (watch.closeStart + watch.close))).toBeLessThan(17);
  // The dialog closes a commit after the close ends. So the page is never
  // clear for long while the dialog still takes taps.
  expect(watch.closedAt - fadeEnd).toBeLessThan(150);
}

for (const tempo of [0.75, 1, 1.5]) {
  test(`a drag's close and its scrim's fade end together, at tempo ${tempo}`, async ({
    page,
  }) => {
    const atOne = await dragClose(page, null);
    const atTempo = await dragClose(page, tempo);
    expectFadeWithClose(atTempo);
    // The close's own curve scales with the tempo, within 5 %. The release
    // speed, the same for both closes, shapes it a little.
    const ratio = atTempo.close / atOne.close;
    expect(ratio).toBeGreaterThan(tempo * 0.95);
    expect(ratio).toBeLessThan(tempo * 1.05);
  });
}

test("a switcher flow's drag close and its scrim's fade end together", async ({
  page,
}) => {
  expectFadeWithClose(await dragClose(page, null, openFlow));
});

test("a hard flick's close from the top snap point and its scrim's fade end together", async ({
  page,
}) => {
  // 4,000 px/s. Snap points styles its fade only on the next frame.
  expectFadeWithClose(
    await dragClose(
      page,
      null,
      async p =>
        openSheet(p, 'snap-points', 'Open nearby places', 'Nearby places'),
      15,
    ),
  );
});
