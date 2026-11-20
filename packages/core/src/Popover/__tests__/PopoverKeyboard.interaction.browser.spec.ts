// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverKeyboard.interaction.browser.spec.ts
 * @input The built Keyboard Avoidance and Default Popover stories, a
 *   stand-in visual viewport that reports a software keyboard, real touch
 *   input and the interaction harness
 * @output Proofs for the layer runtime's keyboard clearance, through
 *   Popover. A tall popover takes its shorter height once the rising
 *   keyboard has arrived. It ends 10 px above the keyboard, with its content
 *   scrollable and its last control reachable. It takes its full height back
 *   as the keyboard starts down. One opened while the keyboard is already up
 *   is clear of it from the first frame that shows it. One taller than both
 *   sides of its trigger keeps its block-start edge, and its field, through
 *   the cap, as does a hardware keyboard's shortcut bar. A popover clear of
 *   the keyboard is left alone. A storyboard shows both states.
 * @position Browser proofs for Layer/useLayerKeyboardClearance.ts.
 *   Headless browsers have no software keyboard. So the page's
 *   `visualViewport` is replaced by one the test shrinks the way Mobile
 *   Safari does (one `resize`, final height). Mobile Safari itself is proven
 *   on the iOS simulator.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  frames,
  freezePageWhen,
  installPageFreeze,
  installTimerGate,
  openStory,
  thawPage,
  touchDriver,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {LAYER_KEYBOARD_CLEARANCE_PX} from '../../Layer/layerKeyboardClearance';
import {timing} from '../../motion/uikit/timing';

const storybook = withStorybook(test);

// The cover Mobile Safari reports on an iPhone 17 Pro (keyboard, accessory
// bar and the floating address bar over a 714 px layout viewport).
const COVER = 337;
// The cover an iPad on iOS 26.2 reports for a hardware keyboard's shortcut
// bar: the visual viewport ends 71 px higher.
const SHORTCUT_BAR = 71;
// The story's popover with 700 px more content below its field: taller than
// the room on both sides of its trigger.
const TALLER = '[data-layer-anchored] button { margin-block-start: 700px; }';

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does. The keyboard module measures the visual
 * viewport wherever one exists, Chrome's `navigator.virtualKeyboard`
 * included (spec:AST-099 FR6, DEC-4). By default the page has no
 * `navigator.virtualKeyboard`, as in Mobile Safari; `chrome` keeps it.
 */
async function installKeyboard(page: Page, {chrome = false} = {}) {
  await page.addInitScript(keepVirtualKeyboard => {
    if (!keepVirtualKeyboard) {
      Reflect.deleteProperty(Navigator.prototype, 'virtualKeyboard');
    }
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
  }, chrome);
}

const keyboard = async (page: Page, cover: number) =>
  page.evaluate(
    value =>
      (window as unknown as {__keyboard: (cover: number) => void}).__keyboard(
        value,
      ),
    cover,
  );

interface Opened {
  surface: Locator;
  trigger: Locator;
}

async function openPopover(
  page: Page,
  story: string,
  name: string,
  options: {chrome?: boolean; style?: string} = {},
): Promise<Opened> {
  await installKeyboard(page, options);
  await openStory(page, storybook(), story);
  if (options.style != null) {
    await page.addStyleTag({content: options.style});
  }
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error(`no trigger named ${name}`);
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const layer = page.locator('[popover]:has(.astryx-popover)').first();
  await waitForRest(layer);
  return {surface: layer.locator('.astryx-popover'), trigger};
}

/**
 * A screenshot of the page with the stand-in keyboard drawn over its cover
 * (headless browsers draw no keyboard): a grey block, for the evidence only.
 */
async function shotWithKeyboard(page: Page, cover: number) {
  await page.evaluate(value => {
    // A manual popover of its own, so it paints over the popover under test
    // in the top layer, as the keyboard paints over the page.
    const block = document.createElement('div');
    block.id = 'stand-in-keyboard';
    block.setAttribute('popover', 'manual');
    Object.assign(block.style, {
      position: 'fixed',
      inset: 'auto 0 0 0',
      margin: '0',
      border: '0',
      padding: '0',
      width: '100%',
      height: `${value}px`,
      background: 'rgb(209, 211, 217)',
      pointerEvents: 'none',
    });
    document.body.append(block);
    block.showPopover();
  }, cover);
  const viewport = page.viewportSize() ?? {width: 402, height: 714};
  const shot = await page.screenshot({
    clip: {x: 0, y: 0, width: viewport.width, height: viewport.height},
  });
  await page.evaluate(() =>
    document.getElementById('stand-in-keyboard')?.remove(),
  );
  return shot;
}

const boxOf = async (locator: Locator) =>
  locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const el = element as HTMLElement;
    const layer = el.closest<HTMLElement>('[popover]');
    // The cap the layer's own style declares while the keyboard caps it, in
    // px; an uncapped layer declares a limit out of reach instead.
    const declared =
      layer == null
        ? ''
        : getComputedStyle(layer)
            .getPropertyValue('--_layer-keyboard-max-block-size')
            .trim();
    return {
      top: rect.top,
      bottom: rect.bottom,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      keyboardCap: declared.endsWith('px') ? declared : '',
      innerHeight: window.innerHeight,
    };
  });

/**
 * Resolves once the surface reads the same box, scroll range, scroll
 * position and cap for three frames in a row, the still frames waitForRest
 * counts. A surface still moving after 5 s fails the wait by name.
 */
const surfaceAtRest = async (surface: Locator) =>
  surface.evaluate(async element => {
    await new Promise<void>((resolve, reject) => {
      const layer = element.closest<HTMLElement>('[popover]');
      const deadline = performance.now() + 5_000;
      let last = '';
      let still = 0;
      const tick = () => {
        const rect = element.getBoundingClientRect();
        const cap =
          layer == null
            ? ''
            : getComputedStyle(layer).getPropertyValue(
                '--_layer-keyboard-max-block-size',
              );
        const now = [
          rect.top,
          rect.bottom,
          element.scrollHeight,
          element.clientHeight,
          element.scrollTop,
          cap,
        ].join(' ');
        still = now === last ? still + 1 : 0;
        last = now;
        if (still >= 3) {
          resolve();
        } else if (performance.now() > deadline) {
          reject(
            new Error(
              `surfaceAtRest: the surface never held still (last: ${now})`,
            ),
          );
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  });

test('a tall popover shrinks to stay 10 px above the keyboard once it has arrived, and grows back as it goes down', async ({
  page,
}, testInfo) => {
  const {surface} = await openPopover(
    page,
    'core-popover--keyboard-avoidance',
    'Add note',
  );
  const field = page.getByRole('textbox', {name: 'Title'});
  await field.focus();
  const before = await boxOf(surface);
  const keyboardTop = before.innerHeight - COVER;
  // The story's popover runs under the keyboard's resting top.
  expect(before.bottom).toBeGreaterThan(keyboardTop);

  await keyboard(page, COVER);
  // On its way up the keyboard covers the difference: nothing changes yet.
  await page.waitForTimeout(timing.keyboardNotificationMs / 2);
  expect((await boxOf(surface)).keyboardCap).toBe('');
  const covered = await shotWithKeyboard(page, COVER);
  await page.waitForTimeout(timing.keyboardNotificationMs);
  const avoiding = await boxOf(surface);
  expect(avoiding.top).toBeCloseTo(before.top, 0);
  expect(
    Math.abs(avoiding.bottom - (keyboardTop - LAYER_KEYBOARD_CLEARANCE_PX)),
  ).toBeLessThanOrEqual(1);
  // Its content scrolls, and the last control can be reached above the
  // keyboard.
  expect(avoiding.scrollHeight).toBeGreaterThan(avoiding.clientHeight);
  await expect(field).toBeFocused();
  await surface.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  const save = await page
    .getByRole('button', {name: 'Save note'})
    .evaluate(element => element.getBoundingClientRect().bottom);
  expect(save).toBeLessThanOrEqual(keyboardTop - LAYER_KEYBOARD_CLEARANCE_PX);
  await surface.evaluate(element => {
    element.scrollTop = 0;
  });
  const clear = await shotWithKeyboard(page, COVER);
  await writeEvidence(
    'keyboard/popover-avoidance',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {cover: COVER, keyboardTop, before, avoiding, save},
        null,
        1,
      ),
      [`${testInfo.project.name}-keyboard-rising.png`]: covered,
      [`${testInfo.project.name}-keyboard-up.png`]: clear,
    },
    testInfo,
  );

  // Going down: the full height comes back at once, behind the keyboard.
  await keyboard(page, 0);
  const restored = await boxOf(surface);
  expect(restored.keyboardCap).toBe('');
  expect(restored.bottom).toBeCloseTo(before.bottom, 0);
});

test("where Chrome's navigator.virtualKeyboard exists, the visual viewport still sets the cap", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    "navigator.virtualKeyboard is Chrome's",
  );
  const {surface} = await openPopover(
    page,
    'core-popover--keyboard-avoidance',
    'Add note',
    {chrome: true},
  );
  expect(await page.evaluate(() => 'virtualKeyboard' in navigator)).toBe(true);
  await page.getByRole('textbox', {name: 'Title'}).focus();
  const before = await boxOf(surface);
  const keyboardTop = before.innerHeight - COVER;
  expect(before.bottom).toBeGreaterThan(keyboardTop);
  await keyboard(page, COVER);
  await page.waitForTimeout(timing.keyboardNotificationMs * 1.5);
  const avoiding = await boxOf(surface);
  expect(avoiding.top).toBeCloseTo(before.top, 0);
  expect(
    Math.abs(avoiding.bottom - (keyboardTop - LAYER_KEYBOARD_CLEARANCE_PX)),
  ).toBeLessThanOrEqual(1);
});

test('with the keyboard up, a tap on the scrolled-in Save note clicks it', async ({
  page,
}) => {
  const {surface} = await openPopover(
    page,
    'core-popover--keyboard-avoidance',
    'Add note',
  );
  const field = page.getByRole('textbox', {name: 'Title'});
  await field.focus();
  await keyboard(page, COVER);
  // The keyboard has arrived once the layer declares its cap. In the frames
  // after it, the layer keeps the focused field in view: on a busy page, a
  // scroll made before those frames is undone. Scroll once it holds still.
  await expect
    .poll(async () => (await boxOf(surface)).keyboardCap)
    .not.toBe('');
  await surfaceAtRest(surface);
  await surface.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  const save = page.getByRole('button', {name: 'Save note'});
  await save.evaluate(element => {
    const counter = window as unknown as {__saveClicks: number};
    counter.__saveClicks = 0;
    element.addEventListener('click', () => {
      counter.__saveClicks += 1;
    });
  });
  const box = await save.boundingBox();
  if (box == null) {
    throw new Error('no Save note');
  }
  // The tap moves focus off the field, and the keyboard starts down: the
  // popover keeps its height until the tap's click has landed on Save.
  const driver = await touchDriver(page);
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {__saveClicks: number}).__saveClicks,
      ),
    )
    .toBe(1);
});

test('a person who scrolls the capped popover before its field reveal keeps the content where they put it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    "WebKit's injected touches do not scroll (README: engine limits)",
  );
  await installPageFreeze(page);
  const {surface} = await openPopover(
    page,
    'core-popover--keyboard-avoidance',
    'Add note',
  );
  await installTimerGate(page);
  await page.getByRole('textbox', {name: 'Title'}).focus();
  // The scene stops in the first frame that shows the cap, before the layer
  // keeps the focused field in view, however late this process reacts.
  const capped = freezePageWhen(
    page,
    () => {
      const layer = document.querySelector('[popover]:has(.astryx-popover)');
      return (
        layer != null &&
        getComputedStyle(layer)
          .getPropertyValue('--_layer-keyboard-max-block-size')
          .trim()
          .endsWith('px')
      );
    },
    null,
  );
  await keyboard(page, COVER);
  await capped;
  // The person pans the content up as far as it goes, then lifts at rest.
  const box = await surface.boundingBox();
  if (box == null) {
    throw new Error('no popover surface');
  }
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height * 0.8);
  const driver = await touchDriver(page);
  await driver.play(
    drag({x, y}, {x, y: y - 200}, {durationMs: 300, hz: 60, restMs: 100}),
  );
  const placed = await surface.evaluate(element => element.scrollTop);
  expect(placed).toBeGreaterThan(0);
  // The held frames run, the field reveal's among them.
  await thawPage(page);
  await frames(page, 4);
  expect(await surface.evaluate(element => element.scrollTop)).toBe(placed);
});

test('opened while the keyboard is already up, it opens clear of the keyboard', async ({
  page,
  browserName,
}) => {
  await installKeyboard(page);
  await openStory(page, storybook(), 'core-popover--keyboard-avoidance');
  const driver = await touchDriver(page);
  // A field on the page brings the keyboard up first.
  const search = page.getByRole('textbox', {name: 'Search notes'});
  await search.focus();
  await keyboard(page, COVER);
  await page.waitForTimeout(timing.keyboardNotificationMs + 100);
  const trigger = page.getByRole('button', {name: 'Add note'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger named Add note');
  }
  // The layer's entrance is slowed through Chromium's DevTools protocol. So
  // the popover is measured mid-flight, under its entrance transform, as on a
  // phone. WebKit measures it as it comes.
  const cdp =
    browserName === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  await cdp?.send('Animation.enable');
  await cdp?.send('Animation.setPlaybackRate', {playbackRate: 0.1});
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(200);
  await cdp?.send('Animation.setPlaybackRate', {playbackRate: 1});
  const layer = page.locator('[popover]:has(.astryx-popover)').first();
  await waitForRest(layer);
  const surface = layer.locator('.astryx-popover');
  const opened = await boxOf(surface);
  const keyboardTop = opened.innerHeight - COVER;
  expect(opened.keyboardCap).not.toBe('');
  expect(
    Math.abs(opened.bottom - (keyboardTop - LAYER_KEYBOARD_CLEARANCE_PX)),
  ).toBeLessThanOrEqual(1);
  expect(opened.scrollHeight).toBeGreaterThan(opened.clientHeight);
});

/** What the page read of the first frame that shows the layer. */
interface FirstFrame {
  /** As the frame begins: the layer's layout bottom, without its entrance. */
  bottom: number;
  /** As the frame begins: the cap the layer declares. */
  cap: string;
  /** After the frame's layout, before it paints: the content overflows. */
  overflows: boolean;
  /** After the frame's layout, before it paints: the surface's overflow. */
  overflowY: string;
}

/**
 * Raises the stand-in keyboard from a field on the page, then taps Add note
 * and reads the first frame that shows the popover.
 */
async function firstFrameOpenedWithKeyboardUp(page: Page): Promise<FirstFrame> {
  await installKeyboard(page);
  await openStory(page, storybook(), 'core-popover--keyboard-avoidance');
  const driver = await touchDriver(page);
  await page.getByRole('textbox', {name: 'Search notes'}).focus();
  await keyboard(page, COVER);
  await page.waitForTimeout(timing.keyboardNotificationMs + 100);
  // The page's own frame loop, started before the tap. Its callback runs
  // ahead of any frame callback the open schedules, so it reads each frame
  // as the frame begins. In the first frame that shows the layer, a
  // ResizeObserver started then reads the surface after that frame's layout.
  await page.evaluate(() => {
    const win = window as unknown as {__firstFrame?: FirstFrame};
    const read = () => {
      const layer = document.querySelector<HTMLElement>(
        '[popover]:has(.astryx-popover)',
      );
      const surface = layer?.querySelector<HTMLElement>('.astryx-popover');
      if (layer?.matches(':popover-open') !== true || surface == null) {
        requestAnimationFrame(read);
        return;
      }
      const bottom = layer.offsetTop + layer.offsetHeight;
      const cap = getComputedStyle(layer)
        .getPropertyValue('--_layer-keyboard-max-block-size')
        .trim();
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        win.__firstFrame = {
          bottom,
          cap,
          overflows: surface.scrollHeight > surface.clientHeight + 1,
          overflowY: getComputedStyle(surface).overflowY,
        };
      });
      observer.observe(surface);
    };
    requestAnimationFrame(read);
  });
  const trigger = page.getByRole('button', {name: 'Add note'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger named Add note');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const firstFrame = async () =>
    page.evaluate(
      () =>
        (window as unknown as {__firstFrame?: FirstFrame}).__firstFrame ?? null,
    );
  await expect.poll(firstFrame).not.toBeNull();
  const first = await firstFrame();
  if (first == null) {
    throw new Error('no frame showed the popover');
  }
  return first;
}

test('opened while the keyboard is already up, it is clear of the keyboard in the first frame that shows it', async ({
  page,
}) => {
  const first = await firstFrameOpenedWithKeyboardUp(page);
  const innerHeight = await page.evaluate(() => window.innerHeight);
  const keyboardTop = innerHeight - COVER;
  expect(first.bottom).toBeLessThanOrEqual(
    keyboardTop - LAYER_KEYBOARD_CLEARANCE_PX + 1,
  );
  expect(first.cap).toMatch(/px$/);
});

test('opened while the keyboard is already up, its content stays inside its box in the first frame that paints it', async ({
  page,
}) => {
  const first = await firstFrameOpenedWithKeyboardUp(page);
  // The capped box is shorter than its content.
  expect(first.overflows).toBe(true);
  // So the surface already clips and scrolls its content in that frame.
  expect(first.overflowY).not.toBe('visible');
});

for (const [what, cover] of [
  ['the software keyboard', COVER],
  ["a hardware keyboard's shortcut bar", SHORTCUT_BAR],
] as const) {
  test(`a popover taller than both sides of its trigger keeps its block-start edge and its field in place as ${what} caps it and goes`, async ({
    page,
  }) => {
    const {surface, trigger} = await openPopover(
      page,
      'core-popover--keyboard-avoidance',
      'Add note',
      {style: TALLER},
    );
    const field = page.getByRole('textbox', {name: 'Title'});
    await field.focus();
    const layer = page.locator('[popover]:has([role="dialog"])').first();
    const before = await boxOf(layer);
    const fieldTop = await field.evaluate(
      element => element.getBoundingClientRect().top,
    );
    // The viewport fit shifts the layer up over its trigger.
    expect(before.top).toBeLessThan((await boxOf(trigger)).bottom);
    // Every frame from here on: the layer's top and the field's.
    await layer.evaluate(element => {
      const input = element.querySelector('input');
      if (input == null) {
        throw new Error('no field in the popover');
      }
      const w = window as unknown as {__tops: number[][]; __track: boolean};
      w.__tops = [];
      w.__track = true;
      const tick = () => {
        if (w.__track) {
          w.__tops.push([
            element.getBoundingClientRect().top,
            input.getBoundingClientRect().top,
          ]);
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });

    await keyboard(page, cover);
    await expect
      .poll(async () => (await boxOf(surface)).keyboardCap)
      .not.toBe('');
    await frames(page, 6);
    const capped = await boxOf(layer);
    expect(Math.abs(capped.top - before.top)).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(
        capped.bottom -
          (before.innerHeight - cover - LAYER_KEYBOARD_CLEARANCE_PX),
      ),
    ).toBeLessThanOrEqual(1);
    await expect(field).toBeFocused();

    // Going down: the full height comes back, and the layer stays where it is.
    await keyboard(page, 0);
    await frames(page, 6);
    const restored = await boxOf(layer);
    expect((await boxOf(surface)).keyboardCap).toBe('');
    expect(Math.abs(restored.top - before.top)).toBeLessThanOrEqual(0.5);

    const tops = await page.evaluate(() => {
      const w = window as unknown as {__tops: number[][]; __track: boolean};
      w.__track = false;
      return w.__tops;
    });
    expect(tops.length).toBeGreaterThan(12);
    for (const [layerTop, inputTop] of tops) {
      expect(Math.abs(layerTop - before.top)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(inputTop - fieldTop)).toBeLessThanOrEqual(0.5);
    }
  });
}

test('a popover clear of the keyboard is left as it is', async ({page}) => {
  const {surface} = await openPopover(
    page,
    'core-popover--default',
    'Settings',
  );
  const before = await boxOf(surface);
  expect(before.bottom).toBeLessThan(
    before.innerHeight - COVER - LAYER_KEYBOARD_CLEARANCE_PX,
  );
  await keyboard(page, COVER);
  await page.waitForTimeout(timing.keyboardNotificationMs + 200);
  const after = await boxOf(surface);
  expect(after.keyboardCap).toBe('');
  expect(after.bottom).toBeCloseTo(before.bottom, 0);
});
