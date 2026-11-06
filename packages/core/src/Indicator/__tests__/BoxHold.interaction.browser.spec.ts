// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file BoxHold.interaction.browser.spec.ts
 * @input The built CheckboxInput, CheckboxList, RadioList and Switch stories,
 *   the A11y/BoxHold fixture, real touch input and the interaction harness
 * @output Proofs that a finger held on a control's box refuses a selection
 *   of the text beside it until the lift. The lift toggles the control
 *   exactly once. A long press that opens a ContextMenu, that a row around the
 *   box runs, or whose contextmenu opens a row's menu, leaves it unchanged. A
 *   hold that moves away activates nothing. A tap stays the browser's own: its
 *   lift is not cancelled, its click activates, and focus moves as on a plain
 *   checkbox. A finger held on the label and a mouse held on the box keep
 *   their native behavior.
 * @position Real-engine layer; the unit layers are utils/boxHold.test.ts and
 *   Indicator/boxHold.test.tsx
 */

import {
  expect,
  test,
  type Browser,
  type Page,
  type TestInfo,
} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {BROWSER_CLICK_WAIT_MS} from '../../utils/browserClickWait';

const storybook = withStorybook(test);

/** Longer than a long press, so iOS would select instead of clicking. */
const HOLD_MS = 900;

interface Control {
  readonly story: string;
  readonly role: 'checkbox' | 'radio' | 'switch';
  readonly index: number;
}

const CONTROLS: ReadonlyArray<Control> = [
  {story: 'core-checkboxinput--default', role: 'checkbox', index: 0},
  {story: 'core-checkboxlist--default', role: 'checkbox', index: 1},
  {story: 'core-radiolist--default', role: 'radio', index: 1},
  {story: 'core-switch--default', role: 'switch', index: 0},
];

interface Point {
  x: number;
  y: number;
}

/** The centre of the control's box and a point on the text beside it. */
async function pointsOf(page: Page, control: Control) {
  return page
    .getByRole(control.role)
    .nth(control.index)
    .evaluate(input => {
      const box = input.parentElement?.getBoundingClientRect();
      if (box == null) {
        throw new Error('the control has no box');
      }
      return {
        box: {x: box.x + box.width / 2, y: box.y + box.height / 2},
        text: {x: box.right + 24, y: box.y + box.height / 2},
      };
    });
}

/**
 * Counts the control's activations: every `change` of its input from now on.
 */
async function countChanges(page: Page, control: Control): Promise<void> {
  await page
    .getByRole(control.role)
    .nth(control.index)
    .evaluate(input => {
      const host = window as unknown as {__boxHoldChanges: number};
      host.__boxHoldChanges = 0;
      input.addEventListener('change', () => {
        host.__boxHoldChanges += 1;
      });
    });
}

/**
 * How a test finger reaches the page. Touch events sent to the page get the
 * browser's click after a long hold, as on iOS. Chromium's own gesture path
 * sends none, as on Android.
 */
type TouchPath = 'touch events' | 'gesture';

/** The paths each engine offers: the gesture path is Chromium's. */
function touchPaths(browserName: string): ReadonlyArray<TouchPath> {
  return browserName === 'chromium'
    ? ['touch events', 'gesture']
    : ['touch events'];
}

/**
 * A finger held `ms` on `at`, then lifted, resolving once the page has the
 * lift.
 */
async function longTouch(
  page: Page,
  path: TouchPath,
  at: Point,
  ms: number,
): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as {__boxHoldLifted: boolean};
    host.__boxHoldLifted = false;
    document.addEventListener(
      'pointerup',
      () => {
        host.__boxHoldLifted = true;
      },
      {capture: true, once: true},
    );
  });
  if (path === 'gesture') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizeTapGesture', {
      x: at.x,
      y: at.y,
      duration: ms,
      tapCount: 1,
      gestureSourceType: 'touch',
    });
    await cdp.detach();
  } else {
    const driver = await touchDriver(page);
    await driver.play([
      {t: 0, fingers: [{id: 1, ...at}]},
      {t: ms, fingers: []},
    ]);
  }
  await page.waitForFunction(
    () => (window as unknown as {__boxHoldLifted: boolean}).__boxHoldLifted,
  );
}

async function changes(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as {__boxHoldChanges: number}).__boxHoldChanges,
  );
}

/**
 * Whether a selection that starts at `at` is refused. Each engine refuses
 * one its own way: a style on iOS WebKit, a cancelled `selectstart`
 * elsewhere.
 */
async function refusesSelectionAt(page: Page, at: Point): Promise<boolean> {
  return page.evaluate(({x, y}) => {
    const target = document.elementFromPoint(x, y);
    if (target == null) {
      throw new Error('nothing at the text point');
    }
    if (CSS.supports('(-webkit-touch-callout: none)')) {
      const style = getComputedStyle(target);
      return (
        (style.getPropertyValue('-webkit-user-select') ||
          style.getPropertyValue('user-select')) === 'none'
      );
    }
    const event = new Event('selectstart', {bubbles: true, cancelable: true});
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, at);
}

/**
 * Resolves after a timer of `ms` queued now on the page. A stand-in click
 * waits on a page timer queued at the lift, before this one. With the same
 * delay, this one runs after it, however late the page runs.
 */
async function afterPageTimer(page: Page, ms: number): Promise<void> {
  await page.evaluate(async delay => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, delay);
    });
  }, ms);
}

/** Holds a finger at `at`, reading `during` while it is down. */
async function holdFinger<T>(
  page: Page,
  at: Point,
  during: () => Promise<T>,
): Promise<T> {
  const driver = await touchDriver(page);
  let read: T | undefined;
  let isRead = false;
  await driver.play(
    [
      {t: 0, fingers: [{id: 1, ...at}]},
      {t: HOLD_MS, fingers: []},
    ],
    {
      onEvent: async step => {
        if (step.type === 'touchStart') {
          read = await during();
          isRead = true;
        }
      },
    },
  );
  if (!isRead) {
    throw new Error('the hold was not read');
  }
  return read as T;
}

/** Where focus is: on the text field, on the tapped control, or elsewhere. */
type FocusKind = 'field' | 'control' | 'other';

/**
 * Adds a text field and a plain checkbox, which no component owns, at the
 * page's foot. The plain checkbox's tap is the engine's own tap.
 */
async function addFieldAndPlainCheckbox(page: Page): Promise<Point> {
  return page.evaluate(() => {
    const field = document.createElement('input');
    field.type = 'text';
    field.id = 'box-hold-field';
    field.style.cssText = 'position:fixed;left:16px;bottom:200px;width:160px';
    const plain = document.createElement('input');
    plain.type = 'checkbox';
    plain.id = 'box-hold-plain';
    plain.style.cssText =
      'position:fixed;left:16px;bottom:140px;width:24px;height:24px;margin:0';
    document.body.append(field, plain);
    const r = plain.getBoundingClientRect();
    return {x: r.x + r.width / 2, y: r.y + r.height / 2};
  });
}

/** Focuses the text field, taps at `at`, and says where focus went. */
async function tapFromField(
  page: Page,
  at: Point,
  control: string,
): Promise<FocusKind> {
  await page.evaluate(() => document.getElementById('box-hold-field')?.focus());
  const driver = await touchDriver(page);
  await driver.tap(at);
  await page.waitForTimeout(400);
  return page.evaluate(selector => {
    const active = document.activeElement;
    if (active?.id === 'box-hold-field') {
      return 'field';
    }
    return active != null && active === document.querySelector(selector)
      ? 'control'
      : 'other';
  }, control);
}

/** The same story with a mouse: the phone's viewport and scale, a fine pointer. */
async function withMouse<T>(
  browser: Browser,
  testInfo: TestInfo,
  run: (mousePage: Page) => Promise<T>,
): Promise<T> {
  const {viewport, deviceScaleFactor} = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    hasTouch: false,
    isMobile: false,
  });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test.describe('a finger held on a control’s box', () => {
  for (const control of CONTROLS) {
    test(`${control.story}: refuses a selection beside the box until the lift, which toggles it once`, async ({
      page,
    }) => {
      await openStory(page, storybook(), control.story);
      const points = await pointsOf(page, control);
      await countChanges(page, control);
      expect(await refusesSelectionAt(page, points.text)).toBe(false);
      const whileHeld = await holdFinger(page, points.box, async () =>
        refusesSelectionAt(page, points.text),
      );
      expect(whileHeld).toBe(true);
      await expect.poll(async () => changes(page)).toBe(1);
      expect(await refusesSelectionAt(page, points.text)).toBe(false);
      // Nothing activates it a second time once the press has ended.
      await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
      expect(await changes(page)).toBe(1);
    });
  }

  test('a tap on the box is the browser’s own: its lift is not cancelled, and its click activates', async ({
    page,
  }) => {
    for (const control of CONTROLS) {
      await openStory(page, storybook(), control.story);
      const points = await pointsOf(page, control);
      await countChanges(page, control);
      await page.evaluate(() => {
        const seen = {prevented: null as boolean | null};
        Object.assign(window, {__tapEnd: seen});
        // Bubbling to the window, the lift has passed every handler below.
        window.addEventListener('touchend', event => {
          seen.prevented = event.defaultPrevented;
        });
      });
      const driver = await touchDriver(page);
      await driver.tap(points.box);
      // Before the fallback's wait ends, so only the browser's click counts.
      await page.waitForTimeout(150);
      expect(await changes(page), control.story).toBe(1);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as {__tapEnd: {prevented: boolean | null}})
              .__tapEnd.prevented,
        ),
        control.story,
      ).toBe(false);
      await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
      expect(await changes(page), control.story).toBe(1);
    }
  });

  test('a tap on a checkbox’s box moves focus as a plain checkbox’s tap does', async ({
    page,
  }) => {
    // These boxes are their inputs, so the plain checkbox is the baseline.
    for (const control of CONTROLS.slice(0, 2)) {
      await openStory(page, storybook(), control.story);
      const plain = await addFieldAndPlainCheckbox(page);
      const points = await pointsOf(page, control);
      await countChanges(page, control);
      const native = await tapFromField(page, plain, '#box-hold-plain');
      // The plain checkbox comes last in the page, so the index still holds.
      await page
        .getByRole(control.role)
        .nth(control.index)
        .evaluate(input => input.setAttribute('data-box-hold-target', ''));
      const own = await tapFromField(
        page,
        points.box,
        '[data-box-hold-target]',
      );
      expect(own, control.story).toBe(native);
      expect(await changes(page), control.story).toBe(1);
    }
  });

  test('a hold on one box, then a tap on the next box inside the wait, activates the held box once', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-checkboxlist--default');
    const boxes = page.getByRole('checkbox');
    const first = {story: '', role: 'checkbox', index: 0} as const;
    const second = {story: '', role: 'checkbox', index: 1} as const;
    const at = [await pointsOf(page, first), await pointsOf(page, second)];
    await boxes.evaluateAll(inputs => {
      const counts = [0, 0];
      Object.assign(window, {__boxHoldEach: counts});
      inputs.slice(0, 2).forEach((input, index) => {
        input.addEventListener('change', () => {
          counts[index] += 1;
        });
      });
    });
    const driver = await touchDriver(page);
    await driver.play([
      {t: 0, fingers: [{id: 1, ...at[0].box}]},
      {t: HOLD_MS, fingers: []},
      {t: HOLD_MS + 100, fingers: [{id: 2, ...at[1].box}]},
      {t: HOLD_MS + 150, fingers: []},
    ]);
    const counts = async () =>
      page.evaluate(
        () => (window as unknown as {__boxHoldEach: number[]}).__boxHoldEach,
      );
    await expect.poll(async () => (await counts())[0]).toBe(1);
    await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
    const [held, tapped] = await counts();
    expect(held).toBe(1);
    // The tap's own activation is the engine's. Chromium clicks it, and
    // WebKit sends no click this soon after the hold, as on main.
    expect(tapped).toBeLessThanOrEqual(1);
  });

  test('a long press that opens a ContextMenu over a box leaves the box unchanged', async ({
    page,
    browserName,
  }) => {
    const cases = [
      {story: 'a11y-boxhold--in-context-menu', index: 0},
      {story: 'a11y-boxhold--in-context-menu', index: 2},
      {story: 'a11y-boxhold--in-popover-context-menu', index: 0},
    ];
    for (const path of touchPaths(browserName)) {
      for (const ms of [HOLD_MS, 1200]) {
        for (const {story, index} of cases) {
          await openStory(page, storybook(), story);
          const control = {story, role: 'checkbox', index} as const;
          const points = await pointsOf(page, control);
          await countChanges(page, control);
          await longTouch(page, path, points.box, ms);
          await expect(page.getByText('Rename').first()).toBeVisible();
          await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
          expect
            .soft(
              await changes(page),
              `${path}: ${story} box ${index}, ${ms} ms`,
            )
            .toBe(0);
        }
      }
    }
  });

  test('a hold in a long-press row runs the row’s long press and leaves the box unchanged', async ({
    page,
    browserName,
  }) => {
    const story = 'a11y-boxhold--in-long-press-row';
    for (const path of touchPaths(browserName)) {
      for (const ms of [HOLD_MS, 1200]) {
        await openStory(page, storybook(), story);
        const control = {story, role: 'checkbox', index: 0} as const;
        const points = await pointsOf(page, control);
        await countChanges(page, control);
        await longTouch(page, path, points.box, ms);
        await expect(page.getByText('Long presses: 1')).toBeVisible();
        await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
        expect.soft(await changes(page), `${path}, ${ms} ms`).toBe(0);
      }
    }
  });

  test('a hold in an onContextMenu row opens the row’s menu and leaves the box unchanged', async ({
    page,
    browserName,
  }) => {
    // Chromium on Android sends a long press as a contextmenu, and no click
    // follows. No engine here sends one for a touch. So the page sends it
    // 600 ms into the hold, on paths with no click after a long press.
    const story = 'a11y-boxhold--in-on-context-menu-row';
    const path: TouchPath =
      browserName === 'chromium' ? 'gesture' : 'touch events';
    await openStory(page, storybook(), story);
    const control = {story, role: 'checkbox', index: 0} as const;
    const points = await pointsOf(page, control);
    await countChanges(page, control);
    await page
      .getByRole('checkbox')
      .first()
      .evaluate(input => {
        input.addEventListener(
          'pointerdown',
          () => {
            setTimeout(() => {
              input.dispatchEvent(
                new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }, 600);
          },
          {once: true},
        );
      });
    await longTouch(page, path, points.box, 1500);
    await expect(page.getByText('Row menu: open')).toBeVisible();
    await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
    expect(await changes(page), path).toBe(0);
  });

  test('a hold that moves away activates nothing and leaves no lock', async ({
    page,
  }) => {
    for (const control of CONTROLS.slice(0, 3)) {
      await openStory(page, storybook(), control.story);
      const points = await pointsOf(page, control);
      await countChanges(page, control);
      const away = {x: points.box.x + 60, y: points.box.y};
      const driver = await touchDriver(page);
      await driver.play([
        {t: 0, fingers: [{id: 1, ...points.box}]},
        {t: 600, fingers: [{id: 1, ...points.box}]},
        {t: 700, fingers: [{id: 1, ...away}]},
        {t: HOLD_MS, fingers: []},
      ]);
      await afterPageTimer(page, BROWSER_CLICK_WAIT_MS);
      expect(await changes(page), control.story).toBe(0);
      expect(await refusesSelectionAt(page, points.text), control.story).toBe(
        false,
      );
    }
  });

  test('a finger held on the label takes no lock, so the label keeps native selection', async ({
    page,
  }) => {
    const control = CONTROLS[0];
    await openStory(page, storybook(), control.story);
    const points = await pointsOf(page, control);
    const whileHeld = await holdFinger(page, points.text, async () =>
      refusesSelectionAt(page, points.text),
    );
    expect(whileHeld).toBe(false);
  });

  test('a mouse held on the box takes no lock and toggles once, as before', async ({
    browser,
  }, testInfo) => {
    await withMouse(browser, testInfo, async mousePage => {
      for (const control of CONTROLS) {
        await openStory(mousePage, storybook(), control.story);
        const points = await pointsOf(mousePage, control);
        await countChanges(mousePage, control);
        await mousePage.mouse.move(points.box.x, points.box.y);
        await mousePage.mouse.down();
        await mousePage.waitForTimeout(HOLD_MS);
        expect(
          await refusesSelectionAt(mousePage, points.text),
          control.story,
        ).toBe(false);
        await mousePage.mouse.up();
        await expect.poll(async () => changes(mousePage)).toBe(1);
      }
    });
  });
});
