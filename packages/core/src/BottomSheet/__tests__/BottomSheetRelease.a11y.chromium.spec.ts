// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetRelease.a11y.chromium.spec.ts
 * @input Built BottomSheet stories and real Chromium touch input (CDP), each
 *   event with its own timestamp
 * @output Browser evidence for the touch release: a fast short flick closes
 *   a sheet at its lowest detent, and its exit starts at the flick's speed.
 *   From the top snap point, a flick whose projection stops short of the
 *   next one stops there. One whose projection passes it closes the sheet.
 *   A faster release never stops short of a slower one. A short slow
 *   release keeps the sheet open. A quick short mouse drag keeps it open, and
 *   a mouse close under reduced motion moves no further. A drag's close and
 *   its scrim's running fade play on one clock and end together, at each
 *   tempo and in a switcher flow.
 * @position Chromium proof for useSheetGestures' release. The page reads the
 *   events' timestamps, so load cannot change the release speed.
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
import {sheet as sheetTable} from '../../motion/uikit/sheet';

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

test('a fast short flick closes the sheet, which leaves at the speed of the flick', async ({
  page,
}) => {
  const {dialog, sheet} = await openFilters(page);
  const rest = await sheet.evaluate(el => el.getBoundingClientRect());
  // Every frame's sheet top, until the dialog closes.
  await page.evaluate(() => {
    const frames = {tops: [] as number[], done: false};
    (window as unknown as {sheetFrames: typeof frames}).sheetFrames = frames;
    const record = () => {
      const panel = document.querySelector('.astryx-bottom-sheet');
      if (panel == null || document.querySelector('dialog[open]') == null) {
        frames.done = true;
        return;
      }
      frames.tops.push(panel.getBoundingClientRect().top);
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  const cdp = await page.context().newCDPSession(page);
  // 30 px in 15 ms is 2,000 px/s: a flick, and too short to project.
  await drag(cdp, sheet, 30, 15);
  // The exit the page plays: the close spring on the sheet's `translate`.
  // Its first keyframe step gives the speed it starts at. A closing dialog
  // leaves the accessibility tree, so read the panel from the document.
  const startSpeed = await page.evaluate(async () => {
    const panel = document.querySelector<HTMLElement>('.astryx-bottom-sheet');
    const offsetY = (frame: Keyframe) =>
      Number.parseFloat(String(frame.translate ?? '0px').split(' ')[1] ?? '0');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      for (const animation of panel?.getAnimations() ?? []) {
        const effect = animation.effect;
        if (!(effect instanceof KeyframeEffect)) {
          continue;
        }
        const [first, second] = effect.getKeyframes();
        if (first?.translate == null || second == null) {
          continue;
        }
        const duration = Number(effect.getComputedTiming().duration);
        const step =
          ((second.computedOffset ?? 0) - (first.computedOffset ?? 0)) *
          duration;
        return ((offsetY(second) - offsetY(first)) / step) * 1000;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return null;
  });
  expect(startSpeed).not.toBeNull();
  expect(startSpeed ?? 0).toBeGreaterThan(sheetTable.release.fastSpeed);
  await expect(dialog).toBeHidden({timeout: 2_000});
  // A closing dialog leaves the accessibility tree at once, so wait for the
  // dialog itself to close.
  const read = async () =>
    page.evaluate(
      () =>
        (window as unknown as {sheetFrames: {tops: number[]; done: boolean}})
          .sheetFrames,
    );
  await expect
    .poll(async () => (await read()).done, {timeout: 2_000})
    .toBe(true);
  // The sheet slides off from where the finger left it, and never turns back
  // toward rest while any of it shows. The spring settles below the screen.
  const {tops} = await read();
  const shown = tops.filter(top => top < 844);
  expect(shown.length, 'frames drawn before the dialog closed').toBeGreaterThan(
    0,
  );
  const turnsBack = shown.some((top, i) => i > 0 && top < shown[i - 1] - 0.5);
  expect(turnsBack, tops.join(' ')).toBe(false);
  expect(Math.max(...tops) - rest.top).toBeGreaterThan(100);
});

test('a short release under the flick speed keeps the sheet open', async ({
  page,
}) => {
  const {dialog, sheet} = await openFilters(page);
  const cdp = await page.context().newCDPSession(page);
  // 30 px in 150 ms is 200 px/s.
  await drag(cdp, sheet, 30, 150);
  await expect
    .poll(async () => sheet.evaluate(el => getComputedStyle(el).transform), {
      timeout: 2_000,
    })
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  await expect(dialog).toBeVisible();
});

/** The sheet's top, once it holds still for 100 ms. */
async function restingTop(page: Page) {
  let top = 0;
  await expect
    .poll(
      async () => {
        const {before, after} = await page.evaluate(async () => {
          const read = () =>
            document
              .querySelector('.astryx-bottom-sheet')
              ?.getBoundingClientRect().top ?? 0;
          const first = read();
          await new Promise(resolve => setTimeout(resolve, 100));
          return {before: first, after: read()};
        });
        top = after;
        return Math.abs(after - before) < 0.5;
      },
      {timeout: 3_000},
    )
    .toBe(true);
  return top;
}

test('a normal flick from the top snap point stops at the next snap point', async ({
  page,
}) => {
  const {dialog, sheet} = await openSheet(
    page,
    'snap-points',
    'Open nearby places',
    'Nearby places',
  );
  const top = await restingTop(page);
  const cdp = await page.context().newCDPSession(page);
  // 60 px in 40 ms is 1,500 px/s: a flick, whose 0.1 s projection lands
  // short of the half-height snap point.
  await drag(cdp, sheet, 60, 40);
  const settled = await restingTop(page);
  await expect(dialog).toBeVisible();
  expect(settled - top).toBeGreaterThan(200);
});

test('a hard flick from the top snap point closes the sheet', async ({
  page,
}) => {
  const {dialog, sheet} = await openSheet(
    page,
    'snap-points',
    'Open nearby places',
    'Nearby places',
  );
  const cdp = await page.context().newCDPSession(page);
  // 60 px in 6 ms is 10,000 px/s: 0.1 s ahead it lands past the midpoint
  // between the half-height snap point and closed.
  await drag(cdp, sheet, 60, 6);
  await expect(dialog).toBeHidden({timeout: 2_000});
});

test('a flick from the top snap point whose projection passes the next one closes the sheet', async ({
  page,
}) => {
  const {dialog, sheet} = await openSheet(
    page,
    'snap-points',
    'Open nearby places',
    'Nearby places',
  );
  const top = await restingTop(page);
  const height = await page.evaluate(() => window.innerHeight);
  const half = height * 0.5;
  const cdp = await page.context().newCDPSession(page);
  // 60 px in 15 ms is 4,000 px/s. 0.1 s ahead it lands past the
  // half-height snap point, though nearer it than closed.
  const projected = top + 60 + 4000 * sheetTable.release.projectionSeconds;
  expect(projected).toBeGreaterThan(half);
  expect(projected - half).toBeLessThan(height - projected);
  await drag(cdp, sheet, 60, 15);
  await expect(dialog).toBeHidden({timeout: 2_000});
});

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

/** A mouse drag on the grabber of `distance` px in `ms`, each event timestamped. */
async function mouseDrag(
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
  const base = Date.now() / 1000;
  const steps = 6;
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    timestamp: base,
  });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y: y + (distance * i) / steps,
      button: 'left',
      buttons: 1,
      timestamp: base + (ms * i) / steps / 1000,
    });
  }
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y: y + distance,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    timestamp: base + (ms + 1) / 1000,
  });
}

test('a quick short mouse drag keeps the sheet open', async ({page}) => {
  const {dialog, sheet} = await openFilters(page);
  const top = await restingTop(page);
  const cdp = await page.context().newCDPSession(page);
  // 40 px in 20 ms is 2,000 px/s. The flick is a touch gesture, and a mouse
  // release this short does not project.
  await mouseDrag(cdp, sheet, 40, 20);
  const settled = await restingTop(page);
  await expect(dialog).toBeVisible();
  expect(Math.abs(settled - top)).toBeLessThan(1);
});

test('a faster touch release never stops short of a slower one', async ({
  page,
}) => {
  const settledAfter = async (ms: number) => {
    const {sheet} = await openSheet(
      page,
      'snap-points-with-peek',
      'Open route',
      'Route',
    );
    await restingTop(page);
    const cdp = await page.context().newCDPSession(page);
    await drag(cdp, sheet, 60, ms);
    return restingTop(page);
  };
  // 60 px at about 950 px/s and at about 1,050 px/s, from the top.
  const slower = await settledAfter(63);
  const faster = await settledAfter(57);
  expect(faster).toBeGreaterThanOrEqual(slower - 1);
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
