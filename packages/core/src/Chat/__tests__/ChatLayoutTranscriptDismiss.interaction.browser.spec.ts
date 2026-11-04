// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatLayoutTranscriptDismiss.interaction.browser.spec.ts
 * @input The Core/ChatLayout full AI chat story, a visual viewport the test
 *   drives as Mobile Safari's keyboard does, and the harness's touch driver
 * @output Proves the drag-to-dismiss in real browsers. A finger's drag down
 *   the transcript that lifts at the composer dismisses the keyboard. One that
 *   stays above it, or starts in the composer's text, keeps it. The composer
 *   follows a drag past its top and returns to rest after any lift. A mouse
 *   drag selects the transcript's text, with nothing prevented or captured.
 * @position Interaction proofs for ChatLayout's FR10, run in Chromium and
 *   WebKit
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  path,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The cover Mobile Safari reports on an iPhone 17 Pro (keyboard, accessory
// bar and the floating address bar over a 714 px layout viewport).
const COVER = 337;

/**
 * Replaces `window.visualViewport` before the page loads with one the test
 * drives: `__keyboard(cover)` shrinks it from the bottom and fires one
 * `resize`, as Mobile Safari does.
 */
async function installKeyboard(page: Page) {
  await page.addInitScript(() => {
    // Mobile Safari has no keyboard geometry API (spec:AST-099 FR6).
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

interface Chat {
  composer: Locator;
  editable: Locator;
}

async function openChat(page: Page): Promise<Chat> {
  await installKeyboard(page);
  await openStory(page, storybook(), 'core-chatlayout--full-ai-chat');
  const editable = page.locator('[contenteditable="true"]').first();
  await expect(editable).toBeVisible();
  // Name the composer's box: the sticky dock's child that holds the text.
  await editable.evaluate(element => {
    let box: HTMLElement | null = element as HTMLElement;
    while (
      box?.parentElement != null &&
      getComputedStyle(box.parentElement).position !== 'sticky'
    ) {
      box = box.parentElement;
    }
    box?.setAttribute('data-testid', 'chat-composer-box');
  });
  const composer = page.getByTestId('chat-composer-box');
  await expect(composer).toBeVisible();
  // The story opens at its newest message.
  await page.waitForTimeout(300);
  return {composer, editable};
}

async function keyboardUp(page: Page, {composer, editable}: Chat) {
  await editable.focus();
  await page.evaluate(
    c => (window as unknown as {__keyboard: (c: number) => void}).__keyboard(c),
    COVER,
  );
  await expect(editable).toBeFocused();
  const composerBox = await composer.boundingBox();
  const textBox = await editable.boundingBox();
  if (composerBox == null || textBox == null) {
    throw new Error('The composer has no box.');
  }
  return {
    x: textBox.x + textBox.width / 2,
    // Above everything the composer holds.
    aboveComposer: composerBox.y - 40,
    // Inside the composer's text.
    inComposer: textBox.y + 4,
  };
}

const transcriptScroll = async (composer: Locator) =>
  composer.evaluate(el => {
    let scroller: HTMLElement | null = el.parentElement;
    while (
      scroller != null &&
      !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    return (scroller ?? document.scrollingElement)?.scrollTop ?? 0;
  });

test('a drag that stays above the composer scrolls and keeps the keyboard', async ({
  page,
}) => {
  const chat = await openChat(page);
  const rows = await keyboardUp(page, chat);
  const driver = await touchDriver(page);
  const before = await transcriptScroll(chat.composer);
  await driver.play(
    drag(
      {x: rows.x, y: 120},
      {x: rows.x, y: rows.aboveComposer},
      {durationMs: 300},
    ),
  );
  await expect(chat.editable).toBeFocused();
  if (driver.drivesNativeGestures) {
    expect(await transcriptScroll(chat.composer)).toBeLessThan(before);
  }
});

test('a drag that reaches the composer dismisses the keyboard, and focus moves nowhere else', async ({
  page,
}) => {
  const chat = await openChat(page);
  const rows = await keyboardUp(page, chat);
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      {x: rows.x, y: 120},
      {x: rows.x, y: rows.inComposer},
      {durationMs: 300},
    ),
  );
  await expect(chat.editable).not.toBeFocused();
  // The dismissal only blurs the composer's text (FR10).
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'BODY',
  );
});

test('a drag that starts in the composer’s text keeps the keyboard', async ({
  page,
}) => {
  const chat = await openChat(page);
  const rows = await keyboardUp(page, chat);
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      {x: rows.x, y: rows.inComposer},
      {x: rows.x, y: rows.inComposer + 30},
      {durationMs: 300},
    ),
  );
  await expect(chat.editable).toBeFocused();
});

/** One frame of the composer's motion, as `traceMotion` records it. */
interface MotionFrame {
  composer: number;
  edge: number;
  curves: [string, string];
  cue: number;
}

/**
 * Records the composer's offset, the curves the composer and the frosted
 * layer play, and the armed cue's opacity, every frame. `motionTrace` reads
 * them back.
 */
async function traceMotion(page: Page, composer: Locator) {
  await composer.evaluate(dock => {
    const edge = dock.previousElementSibling as HTMLElement;
    const offset = (element: Element) => {
      const translate = getComputedStyle(element).translate;
      const [, y = '0'] = translate === 'none' ? [] : translate.split(' ');
      return Number.parseFloat(y) || 0;
    };
    // A curve's start time and keyframes, the same for two elements on one
    // clock. Two computed styles read in turn can sample a running curve a
    // millisecond apart in WebKit, so the offsets alone cannot compare them.
    const curves = (element: Element) =>
      JSON.stringify(
        element
          .getAnimations()
          .map(animation => [
            animation.startTime,
            (animation.effect as KeyframeEffect | null)?.getKeyframes(),
          ]),
      );
    const frames: MotionFrame[] = [];
    (window as unknown as {__frames: MotionFrame[]}).__frames = frames;
    const tick = () => {
      frames.push({
        composer: offset(dock),
        edge: offset(edge),
        curves: [curves(dock), curves(edge)],
        cue: Number(getComputedStyle(dock, '::after').opacity),
      });
      if (frames.length < 2000) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

const motionTrace = async (page: Page) =>
  page.evaluate(
    () => (window as unknown as {__frames: MotionFrame[]}).__frames,
  );

// Waits until the composer and its cue have rested for 10 frames in a row.
const composerAtRest = async (page: Page) =>
  expect
    .poll(async () =>
      (await motionTrace(page)).slice(-10).every(f => f.composer + f.cue === 0),
    )
    .toBe(true);

test.describe('the composer follows a drag that can dismiss the keyboard', () => {
  test('past its top the composer and the frosted layer move down together, and return to rest after a move back up and a lift there', async ({
    page,
  }) => {
    const chat = await openChat(page);
    const rows = await keyboardUp(page, chat);
    await traceMotion(page, chat.composer);
    const driver = await touchDriver(page);
    // Down past the composer's top, then back up above it.
    const low = rows.inComposer + 30;
    const high = rows.aboveComposer;
    const y = (p: number) =>
      p < 0.6
        ? 120 + (low - 120) * (p / 0.6)
        : low - (low - high) * ((p - 0.6) / 0.4);
    await driver.play(path(p => ({x: rows.x, y: y(p)}), {durationMs: 900}));
    await composerAtRest(page);
    const frames = await motionTrace(page);
    // Presence first: the composer moved while the finger was over it.
    expect(Math.max(...frames.map(frame => frame.composer))).toBeGreaterThan(4);
    // The frosted layer plays the composer's curves, on the same clock.
    expect(frames.filter(frame => frame.curves[0] !== frame.curves[1])).toEqual(
      [],
    );
    await expect(chat.editable).toBeFocused();
  });

  test('an armed lift dismisses the keyboard and the composer returns to rest', async ({
    page,
  }) => {
    const chat = await openChat(page);
    const rows = await keyboardUp(page, chat);
    await traceMotion(page, chat.composer);
    const driver = await touchDriver(page);
    await driver.play(
      drag(
        {x: rows.x, y: 120},
        {x: rows.x, y: rows.inComposer + 20},
        {durationMs: 400},
      ),
    );
    await expect(chat.editable).not.toBeFocused();
    await composerAtRest(page);
    const frames = await motionTrace(page);
    expect(Math.max(...frames.map(frame => frame.composer))).toBeGreaterThan(4);
  });

  test('under Reduce Motion nothing moves, and an armed drag fades the pressed overlay in over the composer until the lift', async ({
    page,
  }) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    const chat = await openChat(page);
    const rows = await keyboardUp(page, chat);
    await traceMotion(page, chat.composer);
    const driver = await touchDriver(page);
    await driver.play(
      drag(
        {x: rows.x, y: 120},
        {x: rows.x, y: rows.inComposer + 20},
        {durationMs: 400, restMs: 150},
      ),
    );
    await expect(chat.editable).not.toBeFocused();
    const frames = await motionTrace(page);
    expect(frames.filter(frame => frame.cue > 0).length).toBeGreaterThan(0);
    expect(frames.filter(frame => frame.composer !== 0)).toEqual([]);
    // It changes opacity only, over the Reduce Motion fade's 200 ms.
    const fade = await chat.composer.evaluate(dock => {
      const style = getComputedStyle(dock, '::after');
      return `${style.transitionProperty} ${style.transitionDuration}`;
    });
    expect(fade).toBe('opacity 0.2s');
    await composerAtRest(page);
  });

  test('ten drags in a row, alternating lifts on the composer and above it, each dismiss or keep as their lift says', async ({
    page,
  }) => {
    const chat = await openChat(page);
    const driver = await touchDriver(page);
    for (let cycle = 0; cycle < 10; cycle++) {
      const rows = await keyboardUp(page, chat);
      const isArmed = cycle % 3 !== 1;
      await driver.play(
        drag(
          {x: rows.x, y: 120},
          {
            x: rows.x,
            y: isArmed ? rows.inComposer + 20 : rows.aboveComposer,
          },
          {durationMs: 300},
        ),
      );
      if (isArmed) {
        await expect(chat.editable).not.toBeFocused();
      } else {
        await expect(chat.editable).toBeFocused();
      }
    }
  });
});

test.describe('a finger where the primary pointer is fine, as on a touch-screen laptop', () => {
  test.use({hasTouch: true, isMobile: false});
  test.beforeEach(async ({page}) => {
    // The primary pointer reads fine while touch input is present.
    await page.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window);
      window.matchMedia = query =>
        /\(pointer:\s*coarse\)/.test(query)
          ? matchMedia('(min-width: 100000px)')
          : /\(pointer:\s*fine\)/.test(query)
            ? matchMedia('(min-width: 0px)')
            : matchMedia(query);
    });
  });

  test('a drag that reaches the composer dismisses the keyboard (spec:AST-094 FR19, FR43)', async ({
    page,
  }) => {
    const chat = await openChat(page);
    expect(
      await page.evaluate(() => window.matchMedia('(pointer: fine)').matches),
    ).toBe(true);
    const rows = await keyboardUp(page, chat);
    const driver = await touchDriver(page);
    await driver.play(
      drag(
        {x: rows.x, y: 120},
        {x: rows.x, y: rows.inComposer},
        {durationMs: 300},
      ),
    );
    await expect(chat.editable).not.toBeFocused();
  });
});

/**
 * A line of the transcript's text above the composer: the box of a text node
 * outside the composer and any button.
 */
async function transcriptLine(page: Page, composer: Locator) {
  const composerBox = await composer.boundingBox();
  if (composerBox == null) {
    throw new Error('The composer has no box.');
  }
  const line = await page.evaluate(top => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node != null; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (
        parent == null ||
        (node.textContent ?? '').trim().length < 20 ||
        parent.closest('[contenteditable], button, a') != null
      ) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getClientRects()[0];
      if (
        rect != null &&
        rect.width > 120 &&
        rect.top > 40 &&
        rect.bottom < top - 20
      ) {
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
    }
    return null;
  }, composerBox.y);
  if (line == null) {
    throw new Error('The transcript shows no line of text above the composer.');
  }
  return line;
}

test.describe('a mouse drag in a desktop browser', () => {
  // The primary pointer is fine (the projects emulate a phone).
  test.use({hasTouch: false, isMobile: false});

  test('selects the transcript’s text as without the dismissal: nothing is prevented or captured (spec:AST-094 FR43)', async ({
    page,
  }) => {
    const chat = await openChat(page);
    const rows = await keyboardUp(page, chat);
    const line = await transcriptLine(page, chat.composer);
    await page.evaluate(() => {
      const seen = {prevented: [] as string[], captured: [] as string[]};
      (window as unknown as {__seen: typeof seen}).__seen = seen;
      // The window's bubble phase, added last, runs after every other
      // listener of the page.
      for (const type of [
        'pointerdown',
        'mousedown',
        'pointermove',
        'mousemove',
        'pointerup',
        'mouseup',
        'selectstart',
        'dragstart',
      ]) {
        window.addEventListener(type, event => {
          if (event.defaultPrevented) {
            seen.prevented.push(type);
          }
        });
      }
      window.addEventListener(
        'gotpointercapture',
        event => seen.captured.push((event.target as Element).tagName),
        true,
      );
    });
    const y = line.y + line.height / 2;
    // The browser's own press focuses the nearest focusable ancestor of the
    // pressed text, or the page.
    await page.evaluate(
      ({x, y: pointY}) => {
        const pressed = document.elementFromPoint(x, pointY);
        const target =
          pressed?.closest(
            '[tabindex], a[href], button, input, select, textarea, [contenteditable="true"]',
          ) ?? document.body;
        target.setAttribute('data-press-focus', '');
      },
      {x: line.x + 4, y},
    );
    await page.mouse.move(line.x + 4, y);
    await page.mouse.down();
    await page.mouse.move(line.x + line.width - 4, y, {steps: 12});
    // On past the composer's top, where a finger's drag would dismiss.
    await page.mouse.move(line.x + line.width - 4, rows.inComposer, {
      steps: 12,
    });
    await page.mouse.up();
    const result = await page.evaluate(() => ({
      selected: window.getSelection()?.toString() ?? '',
      seen: (
        window as unknown as {
          __seen: {prevented: string[]; captured: string[]};
        }
      ).__seen,
      focusedThePressTarget:
        document.activeElement?.hasAttribute('data-press-focus') ?? false,
    }));
    expect(result.selected.trim().length).toBeGreaterThan(10);
    expect(result.seen.prevented).toEqual([]);
    expect(result.seen.captured).toEqual([]);
    // Focus goes where the browser's own press puts it, as it does without
    // the dismissal.
    expect(result.focusedThePressTarget).toBe(true);
    await expect(chat.editable).not.toBeFocused();
  });

  test('a pen drag reported as pointer events ends with the composer blurred and nothing prevented', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'pen input is dispatched through the Chrome DevTools Protocol',
    );
    const chat = await openChat(page);
    const rows = await keyboardUp(page, chat);
    await page.evaluate(() => {
      const seen = {types: [] as string[], prevented: [] as string[]};
      (window as unknown as {__pen: typeof seen}).__pen = seen;
      window.addEventListener(
        'pointerdown',
        event => seen.types.push(event.pointerType),
        true,
      );
      for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
        window.addEventListener(type, event => {
          if (event.defaultPrevented) {
            seen.prevented.push(type);
          }
        });
      }
    });
    const client = await page.context().newCDPSession(page);
    const pen = async (
      type: 'mousePressed' | 'mouseMoved' | 'mouseReleased',
      y: number,
    ) =>
      client.send('Input.dispatchMouseEvent', {
        type,
        x: rows.x,
        y,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        pointerType: 'pen',
      });
    await pen('mousePressed', 120);
    for (let step = 1; step <= 12; step += 1) {
      await pen('mouseMoved', 120 + ((rows.inComposer - 120) * step) / 12);
    }
    await pen('mouseReleased', rows.inComposer);
    await expect(chat.editable).not.toBeFocused();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__pen: {types: string[]; prevented: string[]}})
            .__pen,
      ),
    ).toEqual({types: ['pen'], prevented: []});
  });
});
