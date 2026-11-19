// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetKeyboardInset.interaction.browser.spec.ts
 * @input Playwright, the interaction harness, the Mobile keyboard story, a
 *   stand-in visual viewport the test drives, and Gboard's measured slides
 * @output Tests that a fully expanded Tall sheet makes room for the keyboard
 *   at the end of its body. The sheet brings the focused field above the
 *   keyboard and gives the room back. In Chrome on Android, under a coarse
 *   pointer, the field rides Gboard's show. Through the hide the room stays
 *   while the content rides down, and both clear in one commit at rest.
 *   Under Reduce Motion nothing travels. Under a fine pointer nothing of the
 *   ride attaches.
 * @position Browser tests for BottomSheet's use of the keyboard module
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {cubicBezier} from '../../motion/bezier';
import {keyboard as ANDROID_KEYBOARD} from '../../motion/android/keyboard';
import {
  compareCurve,
  curveOf,
  holdAnimations,
  type HeldAnimation,
  installPageFreeze,
  installTimerGate,
  openStory,
  releaseAnimations,
  sampleCurve,
  thawPage,
  timeline,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The cover Mobile Safari reports on an iPhone 17 Pro (keyboard, accessory
// bar and the floating address bar).
const COVER = 337;

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    // Mobile Safari has no keyboard geometry API.
    Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

const report = async (page: Page, cover: number) =>
  page.evaluate(
    c => (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c),
    cover,
  );

/** The room at the end of the field's scrolling body, and where the field is. */
const readBody = async (field: Locator) =>
  field.evaluate(element => {
    let body = element.parentElement;
    while (body != null) {
      const overflow = getComputedStyle(body).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        break;
      }
      body = body.parentElement;
    }
    if (body == null) {
      throw new Error('no scrolling body');
    }
    const content = body.firstElementChild ?? body;
    const roomOf = (box: Element) =>
      parseFloat(getComputedStyle(box, '::after').blockSize) || 0;
    return {
      room: Math.max(roomOf(body), roomOf(content)),
      style: body.getAttribute('style') ?? '',
      contentStyle: content.getAttribute('style') ?? '',
      contentTranslate: getComputedStyle(content).translate,
      fieldBottom: element.getBoundingClientRect().bottom,
      scrollHeight: body.scrollHeight,
      scrollTop: body.scrollTop,
      clientHeight: body.clientHeight,
    };
  });

/**
 * Keeps the content box at the body's height while its fields overflow it, as
 * Firefox lays it out. Firefox resolves the content's `min-height:
 * min-content` as `auto` in the block axis.
 */
const keepContentBoxAtBodyHeight = async (field: Locator) =>
  field.evaluate(element => {
    let body = element.parentElement;
    while (body != null && getComputedStyle(body).overflowY !== 'auto') {
      body = body.parentElement;
    }
    (body?.firstElementChild as HTMLElement | null)?.style.setProperty(
      'min-height',
      '0',
      'important',
    );
  });

test('a Tall sheet makes room for the keyboard at the end of its body, through its own style', async ({
  page,
}) => {
  await installKeyboard(page);
  await openStory(page, storybook(), 'core-bottomsheet--mobile-keyboard');
  await page.getByRole('button', {name: 'Add a comment'}).click();
  const dialog = page.getByRole('dialog', {name: 'Add a comment'});
  await expect(dialog).toBeVisible();
  // Let the sheet settle fully expanded.
  await page.waitForTimeout(800);
  const field = dialog.getByRole('textbox').last();
  await field.focus();
  await report(page, COVER);
  await expect
    .poll(async () => (await readBody(field)).room, {timeout: 2000})
    .toBeGreaterThan(0);
  const shown = await readBody(field);
  // No CSS custom property of the sheet's own carries the keyboard (FR3).
  expect(shown.style).not.toContain('--_sheet-keyboard-inset');
  expect(shown.contentStyle).not.toContain('--_sheet-keyboard-inset');
  // The sheet scrolls the last field above the keyboard within itself.
  const keyboardTop = await page.evaluate(c => window.innerHeight - c, COVER);
  await expect
    .poll(async () => (await readBody(field)).fieldBottom, {timeout: 2000})
    .toBeLessThanOrEqual(keyboardTop);

  // The keyboard goes: the room goes with it.
  await field.blur();
  await report(page, 0);
  await expect
    .poll(async () => (await readBody(field)).room, {timeout: 2000})
    .toBe(0);
});

test('the last field scrolls above the keyboard where the content box keeps the body\u2019s height, as in Firefox', async ({
  page,
}) => {
  await installKeyboard(page);
  await openStory(page, storybook(), 'core-bottomsheet--mobile-keyboard');
  await page.getByRole('button', {name: 'Add a comment'}).click();
  const dialog = page.getByRole('dialog', {name: 'Add a comment'});
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(800);
  const field = dialog.getByRole('textbox').last();
  await keepContentBoxAtBodyHeight(field);
  await field.focus();
  await report(page, COVER);
  await expect
    .poll(async () => (await readBody(field)).room, {timeout: 2000})
    .toBeGreaterThan(0);
  // The room comes after the content's own fields, so the body can scroll the
  // last of them above the keyboard.
  const keyboardTop = await page.evaluate(c => window.innerHeight - c, COVER);
  await expect
    .poll(async () => (await readBody(field)).fieldBottom, {timeout: 2000})
    .toBeLessThanOrEqual(keyboardTop);
});

/**
 * Chrome on Android: the same driven visual viewport, plus a VirtualKeyboard
 * object the guide must leave alone. The guide then reads Chrome's profile and
 * publishes Gboard's slides.
 */
async function installAndroidKeyboard(page: Page) {
  await page.addInitScript(() => {
    const keyboard = Object.assign(new EventTarget(), {
      overlaysContent: false,
      boundingRect: new DOMRect(0, 0, 0, 0),
    });
    Object.defineProperty(navigator, 'virtualKeyboard', {
      configurable: true,
      value: keyboard,
    });
    const viewport = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      get: () => viewport,
    });
    (window as unknown as {__keyboard: (cover: number) => void}).__keyboard =
      cover => {
        viewport.height = window.innerHeight - cover;
        viewport.dispatchEvent(new Event('resize'));
      };
  });
}

// The vertical part of a computed `translate` (`none`, or `Xpx Ypx`).
const translateYOf = (translate: string) =>
  parseFloat(translate.split(' ')[1] ?? '') || 0;

// The content box's ride among what a hold takes on it: the one script
// animation that moves `translate`.
function rideOf(held: ReadonlyArray<HeldAnimation>): HeldAnimation {
  const ride = held.find(
    a => a.kind === 'Animation' && a.keyframes.some(k => 'translate' in k),
  );
  if (ride == null) {
    throw new Error(`no ride among ${JSON.stringify(held)}`);
  }
  return ride;
}

test.describe('Chrome on Android, on Gboard\u2019s slides (spec:AST-099 FR8)', () => {
  test.use({hasTouch: true, isMobile: true});
  test.skip(
    ({browserName}) => browserName !== 'chromium',
    'Chrome\u2019s keyboard profile needs the VirtualKeyboard API',
  );

  // Reports the keyboard's cover and returns the report's time. With `freeze`,
  // the scene freezes in the report's own task, before the page hears the
  // report. What the report starts is then held where it stands at the
  // report, on the scene's own clock, however slowly the runner runs. Thaw
  // with `thawPage`.
  const reportAt = async (page: Page, cover: number, {freeze = false} = {}) =>
    page.evaluate(
      ({c, freezes}) => {
        if (freezes) {
          const w = window as unknown as {
            __harnessFreeze: {freeze(): void};
            __harnessTimerGate: {freeze(isClockStopped: boolean): void};
          };
          w.__harnessFreeze.freeze();
          w.__harnessTimerGate.freeze(true);
        }
        let at = 0;
        const view = window.visualViewport as unknown as EventTarget;
        view.addEventListener(
          'resize',
          event => {
            at = event.timeStamp;
          },
          {once: true},
        );
        (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c);
        return at;
      },
      {c: cover, freezes: freeze},
    );

  // Opens the sheet with its body scrolled to the end, so the last field's
  // reveal scrolls into the keyboard room. `freezable` installs the page clock
  // and the timer gate that a freeze at the report needs.
  async function openAtLastField(page: Page, {freezable = false} = {}) {
    if (freezable) {
      await installPageFreeze(page);
    }
    await installAndroidKeyboard(page);
    await openStory(page, storybook(), 'core-bottomsheet--mobile-keyboard');
    await page.getByRole('button', {name: 'Add a comment'}).click();
    const dialog = page.getByRole('dialog', {name: 'Add a comment'});
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(800);
    const field = dialog.getByRole('textbox').last();
    await field.evaluate(element => {
      let body = element.parentElement;
      while (body != null && getComputedStyle(body).overflowY !== 'auto') {
        body = body.parentElement;
      }
      if (body == null) {
        throw new Error('no scrolling body');
      }
      body.scrollTop = body.scrollHeight;
      body.firstElementChild?.setAttribute('data-sheet-content', '');
    });
    const content = page.locator('[data-sheet-content]');
    const keyboardTop = await page.evaluate(c => window.innerHeight - c, COVER);
    if (freezable) {
      await installTimerGate(page);
    }
    return {field, content, keyboardTop};
  }

  test('the last field clears the keyboard\u2019s top in the report\u2019s own commit, then rides the rest on Gboard\u2019s show, dated back to Gboard\u2019s start', async ({
    page,
  }) => {
    const {field, content, keyboardTop} = await openAtLastField(page, {
      freezable: true,
    });
    await field.focus();
    const before = await readBody(field);
    // The ride lasts the rest of Gboard's slide, under 200 ms. A hold sent
    // after the report can come after it ends on a loaded runner, so the
    // scene freezes before the page hears the report.
    const reported = await reportAt(page, COVER, {freeze: true});
    // The body lands at once in the report's event. The content starts 4 px
    // above the keyboard's top and rides the rest of Gboard's slide up.
    const landed = await readBody(field);
    const distance = landed.scrollTop - before.scrollTop;
    expect(distance).toBeGreaterThan(100);
    const start = await content.evaluate(el =>
      Math.max(
        ...el.getAnimations().map(a => Number(a.startTime ?? -Infinity)),
      ),
    );
    expect(
      Math.abs(start - (reported - ANDROID_KEYBOARD.showReportLagMs)),
    ).toBeLessThan(2);
    const ride = rideOf(
      await holdAnimations(page, content, {
        judges: {target: content, property: 'translate'},
      }),
    );
    const samples = curveOf(
      await sampleCurve(content, timeline(ride.offsetMs + ride.curveEndMs)),
      'translateY',
    );
    await releaseAnimations(page);
    await thawPage(page);
    // At rest: no translate is left, the body did not scroll again, and the
    // field rests above the keyboard.
    await waitForRest(content);
    const rest = await readBody(field);
    expect(translateYOf(rest.contentTranslate)).toBeCloseTo(0, 1);
    expect(rest.scrollTop).toBe(landed.scrollTop);
    expect(rest.fieldBottom).toBeLessThanOrEqual(keyboardTop);
    // Chrome pans the page itself if the field is still below the keyboard's
    // top 100 to 170 ms after the report. The field sits 4 px above that top
    // from the report's own commit, and only that last stretch rides.
    const within = keyboardTop - rest.fieldBottom - 4;
    const fromReport = ride.offsetMs + (reported - start);
    const late = samples.filter(sample => sample.t >= fromReport);
    expect(late.length).toBeGreaterThan(0);
    for (const sample of late) {
      expect(sample.value, JSON.stringify(late)).toBeLessThanOrEqual(
        within + 0.5,
      );
    }
    // That stretch rides on Gboard's own curve, from the slide's start.
    const ease = cubicBezier(ANDROID_KEYBOARD.showCurve);
    const result = compareCurve(
      samples,
      t =>
        within *
        (1 -
          ease(
            Math.min(
              1,
              Math.max(0, (t - ride.offsetMs) / ANDROID_KEYBOARD.showMs),
            ),
          )),
      0.5,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.5,
    );
  });

  test('a report the page reads after Gboard\u2019s slide has ended lands the last field above the keyboard at once', async ({
    page,
  }) => {
    const {field, keyboardTop} = await openAtLastField(page);
    await field.focus();
    // A busy page reads the report 350 ms after the browser sent it, past the
    // 267 ms slide.
    const bottoms = await field.evaluate(async (element, c) => {
      const view = window.visualViewport as unknown as EventTarget & {
        height: number;
      };
      view.height = window.innerHeight - c;
      const report = new Event('resize');
      const until = performance.now() + 350;
      while (performance.now() < until) {
        // The page is busy.
      }
      view.dispatchEvent(report);
      const out: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        await new Promise<void>(resolve =>
          requestAnimationFrame(() => resolve()),
        );
        out.push(element.getBoundingClientRect().bottom);
      }
      return out;
    }, COVER);
    for (const bottom of bottoms) {
      expect(bottom, JSON.stringify(bottoms)).toBeLessThanOrEqual(keyboardTop);
    }
  });

  test('through Gboard\u2019s hide the room stays while the content rides down by the scroll its drop takes back, and both clear in one commit at rest', async ({
    page,
  }) => {
    const {field, content} = await openAtLastField(page, {freezable: true});
    await field.focus();
    await reportAt(page, COVER);
    await waitForRest(content);
    await page.waitForTimeout(100);
    const shown = await readBody(field);
    // How far the body has scrolled into the room: the scroll its drop takes
    // back.
    const intoRoom =
      shown.scrollTop - (shown.scrollHeight - shown.room - shown.clientHeight);
    expect(intoRoom).toBeGreaterThan(100);

    // Back: Chrome reports the keyboard gone while the field keeps focus.
    // The guide dates the hide back by the lag measured on blurs. The scene
    // freezes before the page hears the report, so the ride is held where it
    // stands at the report, however late this process reacts.
    const reported = await reportAt(page, 0, {freeze: true});
    const held = await readBody(field);
    expect(held.room).toBe(shown.room);
    expect(held.scrollTop).toBe(shown.scrollTop);
    const start = await content.evaluate(el =>
      Math.max(
        ...el.getAnimations().map(a => Number(a.startTime ?? -Infinity)),
      ),
    );
    expect(
      Math.abs(start - (reported - ANDROID_KEYBOARD.hideReportLagMs)),
    ).toBeLessThan(2);
    const ride = rideOf(
      await holdAnimations(page, content, {
        judges: {target: content, property: 'translate'},
      }),
    );
    const samples = curveOf(
      await sampleCurve(content, timeline(ride.offsetMs + ride.curveEndMs)),
      'translateY',
    );
    await releaseAnimations(page);
    await thawPage(page);
    const ease = cubicBezier(ANDROID_KEYBOARD.hideCurve);
    const result = compareCurve(
      samples,
      t =>
        intoRoom *
        ease(
          Math.min(
            1,
            Math.max(0, (t - ride.offsetMs) / ANDROID_KEYBOARD.hideMs),
          ),
        ),
      0.5,
    );
    expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
      0.5,
    );

    // At rest, in one commit, the room is gone and the body's scroll gave back
    // what the content rode. No translate remains, and the page draws the
    // field where the ride took it.
    await waitForRest(content);
    await page.waitForTimeout(100);
    const rest = await readBody(field);
    expect(rest.room).toBe(0);
    expect(translateYOf(rest.contentTranslate)).toBeCloseTo(0, 1);
    expect(rest.scrollTop).toBeCloseTo(shown.scrollTop - intoRoom, 0);
    expect(rest.fieldBottom).toBeCloseTo(shown.fieldBottom + intoRoom, 0);
  });

  // The field's drawn bottom, the content box's opacity and the room. Each is
  // read before the test reports `cover`, in the report's own task, and on
  // every animation frame for `ms` after it. The scene is frozen from before
  // the page hears the report until that read. So the read sees what the
  // report started as it stands at the report, however slowly the runner
  // runs. Open the sheet with `freezable`.
  const sampleAfterReport = async (field: Locator, cover: number, ms: number) =>
    field.evaluate(
      async (element, {c, until}) => {
        let body = element.parentElement;
        while (body != null && getComputedStyle(body).overflowY !== 'auto') {
          body = body.parentElement;
        }
        const content = body?.firstElementChild ?? body;
        const read = () => ({
          bottom: element.getBoundingClientRect().bottom,
          opacity: Number(getComputedStyle(content as Element).opacity),
          room:
            parseFloat(
              getComputedStyle(content as Element, '::after').blockSize,
            ) || 0,
        });
        const {__harnessFreeze: scene, __harnessTimerGate: gate} =
          window as unknown as {
            __harnessFreeze: {freeze(): void; thaw(): void};
            __harnessTimerGate: {
              freeze(isClockStopped: boolean): void;
              thaw(): void;
            };
          };
        const out = [read()];
        scene.freeze();
        gate.freeze(true);
        (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c);
        const atReport = read();
        scene.thaw();
        gate.thaw();
        const end = performance.now() + until;
        await new Promise<void>(resolve => {
          const sample = () => {
            out.push(read());
            if (performance.now() < end) {
              requestAnimationFrame(sample);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(sample);
        });
        return {atReport, frames: out};
      },
      {c: cover, until: ms},
    );

  // Chrome on the Android emulator pans the visual viewport to the focused
  // field a few frames after the report, while the content still rides. The
  // page gets no frame until that pan ends. This freezes the scene and then
  // reports the keyboard, in one task. The ride then stands where it is at
  // the report, on the scene's own clock, however slowly the runner runs.
  // Then it moves the stand-in viewport down by 30 px on each of `frames`
  // real frames, and thaws the scene. It returns each frame the hook put the
  // pan back in, with the content's ride offset at that moment. Open the
  // sheet with `freezable`.
  const panAfterReport = async (page: Page, cover: number, frames: number) =>
    page.evaluate(
      async ([c, n]) => {
        const viewport = window.visualViewport as unknown as EventTarget & {
          offsetTop: number;
        };
        const {__harnessFreeze: scene, __harnessTimerGate: gate} =
          window as unknown as {
            __harnessFreeze: {freeze(): void; thaw(): void};
            __harnessTimerGate: {
              freeze(isClockStopped: boolean): void;
              thaw(): void;
              frame: typeof requestAnimationFrame;
            };
          };
        const content = document.querySelector(
          '[data-sheet-content]',
        ) as HTMLElement;
        const putBacks: {frame: number; ride: number}[] = [];
        let frame = -1;
        const scrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (
          this: Element,
          options?: boolean | ScrollIntoViewOptions,
        ) {
          if (this instanceof HTMLDialogElement) {
            const translate = getComputedStyle(content).translate;
            putBacks.push({
              frame,
              ride: parseFloat(translate.split(' ')[1] ?? '') || 0,
            });
            viewport.offsetTop = 0;
          }
          scrollIntoView.call(this, options);
        };
        // The page's real frames: the gate holds the page's own callbacks.
        const nextFrame = async () => {
          await new Promise<void>(resolve => gate.frame(() => resolve()));
        };
        scene.freeze();
        gate.freeze(true);
        (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c);
        await nextFrame();
        for (frame = 0; frame < n; frame += 1) {
          viewport.offsetTop += 30;
          viewport.dispatchEvent(new Event('scroll'));
          await nextFrame();
        }
        Element.prototype.scrollIntoView = scrollIntoView;
        scene.thaw();
        gate.thaw();
        return putBacks;
      },
      [cover, frames] as const,
    );

  test('puts the browser\u2019s reveal pan back in its first frame, while the content still rides', async ({
    page,
  }) => {
    const {field} = await openAtLastField(page, {freezable: true});
    await field.focus();
    const putBacks = await panAfterReport(page, COVER, 6);
    expect(putBacks.length, JSON.stringify(putBacks)).toBeGreaterThan(0);
    expect(putBacks[0].frame, JSON.stringify(putBacks)).toBe(0);
    expect(putBacks[0].ride).toBeGreaterThan(1);
  });

  test('Reduce Motion: puts the browser\u2019s reveal pan back in its first frame, during the cross-fade', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {field} = await openAtLastField(page, {freezable: true});
    await field.focus();
    const putBacks = await panAfterReport(page, COVER, 6);
    expect(putBacks.length, JSON.stringify(putBacks)).toBeGreaterThan(0);
    expect(putBacks[0].frame, JSON.stringify(putBacks)).toBe(0);
  });

  test('Reduce Motion: the sheet never travels with Gboard; it cross-fades, and the room drops once at rest (design:reduced-motion)', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const {field} = await openAtLastField(page, {freezable: true});
    await field.focus();
    const {atReport, frames: show} = await sampleAfterReport(field, COVER, 900);
    const shown = show.at(-1) as (typeof show)[number];
    // The field rests from the report's first frame, so Chrome has nothing to
    // pan to, and only the fade changes.
    expect(
      show
        .slice(1)
        .filter(frame => Math.abs(frame.bottom - shown.bottom) >= 0.5),
      JSON.stringify(show.map(f => Math.round(f.bottom))),
    ).toEqual([]);
    // Every frame draws the field where it was or where it rests, and the
    // change is a fade.
    for (const frame of show) {
      expect(
        Math.abs(frame.bottom - show[0].bottom) < 0.5 ||
          Math.abs(frame.bottom - shown.bottom) < 0.5,
        JSON.stringify(show.map(f => Math.round(f.bottom))),
      ).toBe(true);
    }
    // The fade is under way at the report. A frame on a loaded runner can come
    // after it has ended.
    expect(atReport.opacity).toBeLessThan(1);
    expect(shown.opacity).toBe(1);

    const {frames: hide} = await sampleAfterReport(field, 0, 900);
    const rest = hide.at(-1) as (typeof hide)[number];
    for (const frame of hide) {
      expect(
        Math.abs(frame.bottom - hide[0].bottom) < 0.5 ||
          Math.abs(frame.bottom - rest.bottom) < 0.5,
        JSON.stringify(hide.map(f => Math.round(f.bottom))),
      ).toBe(true);
    }
    // The room holds through the hide, then drops once.
    const rooms = hide.map(f => Math.round(f.room));
    expect(rooms[0]).toBeGreaterThan(0);
    expect(rest.room).toBe(0);
    expect(
      rooms.filter((room, i) => i > 0 && room !== rooms[i - 1]),
    ).toHaveLength(1);
    expect(rest.opacity).toBe(1);
  });

  test.describe('under a fine pointer', () => {
    test.use({hasTouch: false, isMobile: false});

    test('nothing of the ride attaches: the room drops at Chrome\u2019s hide report', async ({
      page,
    }) => {
      const {field, content} = await openAtLastField(page);
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await field.focus();
      await reportAt(page, COVER);
      await expect
        .poll(async () => (await readBody(field)).room, {timeout: 2000})
        .toBeGreaterThan(0);
      await page.waitForTimeout(800);
      await reportAt(page, 0);
      expect((await readBody(field)).room).toBe(0);
      expect(await content.evaluate(el => el.getAnimations().length)).toBe(0);
    });
  });
});
