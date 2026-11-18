// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TextFieldFocusTiming.interaction.browser.spec.ts
 * @input The built text field stories, tapped in the touch phone context, and
 *   clicked and tabbed to in a mouse context of the same viewport
 * @output Proofs that a tapped text field shows its focus look at once, while
 *   a mouse click and the keyboard still fade it in
 * @position Interaction evidence for the text field timing in
 *   Field/inputStyles.stylex.ts, which ChatComposer and RichTextEditor share
 */

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  type ArmedHold,
  openStory,
  releaseAnimations,
  seekAnimations,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const FIELDS = [
  'core-textinput--default',
  'core-textarea--default',
  'core-numberinput--default',
  'core-tokenizer--default',
  'core-typeahead--default',
  'core-chatcomposer--simplest',
  'richtext-richtexteditor--default',
] as const;

/**
 * What each field fades under a mouse. `properties` names properties of its
 * focus look; each border side fades as its own run. `clickFadeOn` names the
 * input that shows the look on a click. ChatComposer's hover look is its focus
 * look, so the pointer shows it before a click.
 */
const MOUSE_FADE: Record<
  (typeof FIELDS)[number],
  {
    readonly properties: ReadonlyArray<string>;
    readonly clickFadeOn: 'press' | 'hover';
  }
> = {
  'core-textinput--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
  'core-textarea--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
  'core-numberinput--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
  'core-tokenizer--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
  'core-typeahead--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
  'core-chatcomposer--simplest': {
    properties: ['box-shadow'],
    clickFadeOn: 'hover',
  },
  'richtext-richtexteditor--default': {
    properties: ['border-top-color', 'box-shadow'],
    clickFadeOn: 'press',
  },
};

/** A text entry element, wherever it renders (a sheet's field included). */
const TEXT_ENTRY =
  ':is(input:not([type="hidden"]), textarea, [contenteditable="true"])';

/** The story's field: its text entry, or under a finger the button that opens its sheet. */
const ENTRY = `#storybook-root ${TEXT_ENTRY}`;
const TAP_TARGET = `#storybook-root :is(${TEXT_ENTRY}, button)`;

/** One read of the field's look, ms after the read at focus. */
interface LookSample {
  readonly t: number;
  readonly look: string;
}

/** The looks read from focus on, and the fade's duration, ms. */
interface FocusLook {
  readonly samples: ReadonlyArray<LookSample>;
  readonly durationMs: number;
}

/**
 * Records the field's look from the moment focus enters it. It reads once at
 * focus, then on each of the next 24 frames, with each read's time. The look
 * is the box-shadow and border colour of the element that fades them. A fade
 * shows in-between looks; a look shown at once shows only its last value.
 */
async function recordFocusLook(page: Page): Promise<void> {
  await page.evaluate(entrySelector => {
    const record: {samples: LookSample[]; durationMs: number} = {
      samples: [],
      durationMs: -1,
    };
    (window as unknown as {__focusLook: typeof record}).__focusLook = record;
    const onFocus = (event: FocusEvent) => {
      // Tab may pass other controls first: only the text entry counts.
      if (!(event.target as Element).matches(entrySelector)) {
        return;
      }
      document.removeEventListener('focusin', onFocus, true);
      let found = event.target as HTMLElement | null;
      while (
        found != null &&
        !/box-shadow|border-color/.test(
          getComputedStyle(found).transitionProperty,
        )
      ) {
        found = found.parentElement;
      }
      if (found == null) {
        return;
      }
      const wrapper = found;
      const duration = getComputedStyle(wrapper)
        .transitionDuration.split(',')[0]
        .trim();
      record.durationMs = duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
      const start = performance.now();
      const read = () => {
        const style = getComputedStyle(wrapper);
        record.samples.push({
          t: performance.now() - start,
          look: `${style.boxShadow} | ${style.borderColor}`,
        });
      };
      read();
      let frames = 0;
      const tick = () => {
        read();
        if (++frames < 24) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    };
    document.addEventListener('focusin', onFocus, true);
  }, TEXT_ENTRY);
}

/** The recorded looks, once all 25 reads are in. */
async function focusLook(page: Page): Promise<FocusLook> {
  const read = async () =>
    page.evaluate(
      () => (window as unknown as {__focusLook: FocusLook}).__focusLook,
    );
  await page
    .waitForFunction(
      () =>
        (window as unknown as {__focusLook: FocusLook}).__focusLook.samples
          .length >= 25,
      undefined,
      {timeout: 10_000},
    )
    .catch(async () => {
      const {samples} = await read();
      throw new Error(
        `the focus look was read ${samples.length} of 25 times in 10 s: focus never reached the text entry, or the page drew too few frames`,
      );
    });
  return read();
}

async function restingLook(page: Page): Promise<string> {
  return page
    .locator(ENTRY)
    .first()
    .evaluate(entry => {
      let wrapper = entry as HTMLElement | null;
      while (
        wrapper != null &&
        !/box-shadow|border-color/.test(
          getComputedStyle(wrapper).transitionProperty,
        )
      ) {
        wrapper = wrapper.parentElement;
      }
      if (wrapper == null) {
        return 'no wrapper';
      }
      const style = getComputedStyle(wrapper);
      return `${style.boxShadow} | ${style.borderColor}`;
    });
}

/**
 * The element that fades the field's look: the text entry or its nearest
 * ancestor whose transition names box-shadow or border-color.
 */
async function fadeOf(page: Page): Promise<Locator> {
  const found = await page
    .locator(ENTRY)
    .first()
    .evaluate(entry => {
      let element = entry as HTMLElement | null;
      while (
        element != null &&
        !/box-shadow|border-color/.test(
          getComputedStyle(element).transitionProperty,
        )
      ) {
        element = element.parentElement;
      }
      element?.setAttribute('data-focus-fade', '');
      return element != null;
    });
  if (!found) {
    throw new Error("no element fades the field's look");
  }
  return page.locator('[data-focus-fade]');
}

/** The box-shadow and border colour that `fade` presents now. */
async function lookOf(fade: Locator): Promise<string> {
  return fade.evaluate(element => {
    const style = getComputedStyle(element);
    return `${style.boxShadow} | ${style.borderColor}`;
  });
}

/** A mouse page of the touch page's viewport and scale. */
async function mousePage(browser: Browser, touch: Page): Promise<Page> {
  const viewport = touch.viewportSize() ?? {width: 390, height: 844};
  const context = await browser.newContext({
    viewport,
    hasTouch: false,
    isMobile: false,
  });
  return context.newPage();
}

for (const story of FIELDS) {
  test(`${story}: a tap shows the focus look at once`, async ({page}) => {
    await openStory(page, storybook(), story);
    const target = page.locator(TAP_TARGET).first();
    await expect(target).toBeVisible();
    const tapsAnEntry = await target.evaluate(
      (node, entry) => node.matches(entry),
      TEXT_ENTRY,
    );
    // A field that opens a sheet under a finger has no resting text entry.
    const rest = tapsAnEntry ? await restingLook(page) : null;
    await recordFocusLook(page);
    const box = await target.boundingBox();
    if (box == null) {
      throw new Error('no field box');
    }
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // Some engines leave a tapped contenteditable unfocused; the timing under
    // test is the same for any focus under this pointer.
    const focused = async () =>
      page.evaluate(
        entry => document.activeElement?.matches(entry) ?? false,
        TEXT_ENTRY,
      );
    if (tapsAnEntry && !(await focused())) {
      await target.focus();
    }
    if (!tapsAnEntry) {
      // The button opened the field's sheet: tap the sheet's own text entry.
      const field = page.locator(`${TEXT_ENTRY}:visible`).first();
      await expect(field).toBeInViewport();
      // Wait for the sheet to come to rest before aiming at its field.
      let fieldBox = await field.boundingBox();
      let rested = false;
      for (let i = 0; i < 40 && !rested; i++) {
        await page.waitForTimeout(100);
        const next = await field.boundingBox();
        rested = next != null && next.y === fieldBox?.y;
        fieldBox = next;
      }
      if (!rested) {
        throw new Error(
          `the sheet's text entry never came to rest in 4 s (last top ${fieldBox?.y})`,
        );
      }
      if (fieldBox == null) {
        throw new Error('no sheet field box');
      }
      await page.touchscreen.tap(
        fieldBox.x + fieldBox.width / 2,
        fieldBox.y + fieldBox.height / 2,
      );
    }
    await expect
      .poll(focused, {
        message: 'the tapped field passes focus to its text entry',
        timeout: 5_000,
      })
      .toBe(true);
    const {samples} = await focusLook(page);
    const last = samples[samples.length - 1].look;
    const looks = JSON.stringify({rest, samples});
    // The focus look is present: it differs from the resting look, or for a
    // sheet's field, it draws its focus ring.
    if (rest != null) {
      expect(last, looks).not.toBe(rest);
    } else {
      expect(last.split(' | ')[0], looks).not.toBe('none');
    }
    // And it shows at once: every read, from the one at focus on, is the
    // focus look.
    expect(
      samples.filter(sample => sample.look !== last),
      looks,
    ).toEqual([]);
  });

  test(`${story}: a mouse click and the Tab key still fade the focus look in`, async ({
    page,
    browser,
  }) => {
    const {properties, clickFadeOn} = MOUSE_FADE[story];
    for (const how of ['click', 'Tab'] as const) {
      const mouse = await mousePage(browser, page);
      await openStory(mouse, storybook(), story);
      const entry = mouse.locator(ENTRY).first();
      await expect(entry).toBeVisible();
      const fade = await fadeOf(mouse);
      const durationMs = await fade.evaluate(element => {
        const duration = getComputedStyle(element)
          .transitionDuration.split(',')[0]
          .trim();
        return duration.endsWith('ms')
          ? Number.parseFloat(duration)
          : Number.parseFloat(duration) * 1000;
      });
      expect(durationMs, 'the fade duration under a mouse').toBeGreaterThan(0);
      await waitForRest(fade);
      const rest = await lookOf(fade);
      const judges = properties.map(property => ({target: fade, property}));
      const isFocused = async () =>
        entry.evaluate(node => node === document.activeElement);
      const press = async () => {
        await mouse.mouse.down();
        await mouse.mouse.up();
      };
      let hold: ArmedHold;
      if (how === 'Tab') {
        await mouse.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.blur(),
        );
        await waitForRest(fade);
        hold = await armHold(mouse, fade, {judges});
        // Tab from the top of the page until the text entry has focus.
        for (let i = 0; i < 12 && !(await isFocused()); i++) {
          await mouse.keyboard.press('Tab');
        }
        expect(await isFocused(), 'Tab reaches the text entry').toBe(true);
      } else if (clickFadeOn === 'hover') {
        // The pointer shows this field's focus look as it arrives, so the
        // fade that a click shows is the hover run before it.
        hold = await armHold(mouse, fade, {judges});
        await entry.hover();
      } else {
        // A click hovers, then focuses, and the focus run cancels the hover
        // run. So the field comes to rest under the pointer first.
        await entry.hover();
        await waitForRest(fade);
        hold = await armHold(mouse, fade, {judges});
        await press();
      }
      const held = await hold.held();
      const runs = held.map(run => ({
        name: run.name,
        durationMs: run.durationMs,
        delayMs: run.delayMs,
      }));
      // Each run on the field is held, so the reads below are its own.
      const runsOnField = async () =>
        fade.evaluate(element => {
          const animations = element.getAnimations();
          return {
            unheld: animations
              .filter(animation => animation.playState !== 'paused')
              .map(animation => animation.constructor.name),
            count: animations.length,
          };
        });
      const before = await runsOnField();
      expect(
        before.unheld,
        'a run on the field that the hold did not take',
      ).toEqual([]);
      const lookAt = async (timeMs: number) => {
        await seekAnimations(mouse, timeMs);
        return lookOf(fade);
      };
      const start = await lookAt(0);
      const mid = await lookAt(durationMs / 2);
      const end = await lookAt(durationMs + 1);
      const looks = JSON.stringify({how, rest, start, mid, end, runs});
      // A seek skips a run that a retarget cancelled: the same held runs,
      // and no other, are on the field after the reads.
      expect(
        await runsOnField(),
        `the runs on the field after the reads; ${looks}`,
      ).toEqual(before);
      // Each run starts with no delay and lasts the fade duration.
      for (const run of runs) {
        expect(run.delayMs, `the ${run.name} fade's delay; ${looks}`).toBe(0);
        expect(
          run.durationMs,
          `the ${run.name} fade's duration; ${looks}`,
        ).toBe(durationMs);
      }
      // Halfway through, the look is between its start and its end.
      expect(mid, `the look halfway through the fade; ${looks}`).not.toBe(
        start,
      );
      expect(mid, `the look halfway through the fade; ${looks}`).not.toBe(end);
      expect(end, `the look at the end of the fade; ${looks}`).not.toBe(rest);
      await releaseAnimations(mouse, {finish: true});
      // The focus look stays once the fade is over.
      const focusLook = await lookOf(fade);
      expect(focusLook, `the focus look after the fade; ${looks}`).not.toBe(
        rest,
      );
      if (how === 'click' && clickFadeOn === 'hover') {
        // The click itself shows no look beyond the hover look.
        await press();
        await waitForRest(fade);
        expect(
          await lookOf(fade),
          `the look after a click on the hovered field; ${looks}`,
        ).toBe(focusLook);
      }
      expect(await isFocused(), `the ${how} focuses the text entry`).toBe(true);
      await mouse.context().close();
    }
  });
}
