// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TokenizerGroupScroll.a11y.browser.spec.ts
 * @input Built InputGroup stories and real Chromium/WebKit layout and keys
 * @output Browser evidence that a grouped Tokenizer's scrolling token strip
 *   shows its overflow, restores the native scrollbar in forced colors, and
 *   keeps a keyboard path to every token, enabled or disabled
 * @position Tokenizer-in-InputGroup proof of spec:AST-025 FR12 and FR16
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const END_CONTROLS = 'core-inputgroup--with-tokenizer-overflow-end-controls';
const END_CONTROLS_RTL =
  'core-inputgroup--with-tokenizer-overflow-end-controls-rtl';
const DISABLED = 'core-inputgroup--with-tokenizer-overflow-disabled';

// macOS WebKit defaults to text-field traversal. Option+Tab selects its native
// all-controls traversal, equivalent to enabling Safari's keyboard preference.
function tabKey(browserName: string, reverse = false): string {
  return `${browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : ''}${reverse ? 'Shift+' : ''}Tab`;
}

async function mount(page: Page, story: string) {
  await page.setViewportSize({width: 600, height: 400});
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  await expect(page.locator('.astryx-token').first()).toBeVisible();
  await page.evaluate(async () => document.fonts.ready);
}

// The strip is the row's child that holds the tokens; the end controls are its
// siblings.
function strips(page: Page): Locator {
  return page.locator('.astryx-tokenizer > div:has(.astryx-token)');
}

interface Sides {
  left: boolean;
  right: boolean;
}

// Which physical edges the strip's mask fades out. Each fade is a linear
// gradient across the strip; its transparent end is the faded edge.
async function fadedSides(strip: Locator): Promise<Sides> {
  return strip.evaluate((element): Sides => {
    const style = getComputedStyle(element);
    const mask =
      style.getPropertyValue('mask-image') ||
      style.getPropertyValue('-webkit-mask-image');
    if (mask === '' || mask === 'none') {
      return {left: false, right: false};
    }
    const body = /^linear-gradient\((.*)\)$/.exec(mask.trim())?.[1];
    if (body == null) {
      throw new Error(`Unexpected strip mask: ${mask}`);
    }
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (char === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());
    const [direction, ...stops] = parts;
    const leftward = ['to left', '270deg', '-90deg'].includes(direction);
    if (!leftward && !['to right', '90deg'].includes(direction)) {
      throw new Error(`Unexpected strip mask direction: ${direction}`);
    }
    const isClear = (stop: string) =>
      /^(transparent|rgba\(0, 0, 0, 0\))/.test(stop);
    const first = isClear(stops[0]);
    const last = isClear(stops[stops.length - 1]);
    return leftward ? {left: last, right: first} : {left: first, right: last};
  });
}

/**
 * Scrolls the strip to `place` and waits until it is there. WebKit can drop a
 * scroll request that comes right after mount or under load, so the request
 * repeats until the scroll position arrives. The fades are read only after
 * that, so a dropped request never reads as a wrong fade.
 */
async function scrollStrip(strip: Locator, place: 'start' | 'middle' | 'end') {
  await expect
    .poll(async () =>
      strip.evaluate((element, where) => {
        const max = element.scrollWidth - element.clientWidth;
        const offset =
          where === 'start' ? 0 : where === 'end' ? max : Math.round(max / 2);
        const isThere = () =>
          Math.abs(Math.abs(element.scrollLeft) - offset) <= 1;
        if (isThere()) {
          return true;
        }
        // RTL scroll offsets run negative from the inline start.
        const sign = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
        element.scrollTo({left: sign * offset, behavior: 'instant'});
        // The next poll confirms the position, so a scroll that is accepted
        // and then undone is not counted.
        return false;
      }, place),
    )
    .toBe(true);
}

async function scrollRange(strip: Locator) {
  return strip.evaluate(element => ({
    position: Math.abs(element.scrollLeft),
    max: element.scrollWidth - element.clientWidth,
  }));
}

for (const {story, start, end} of [
  {story: END_CONTROLS, start: 'left', end: 'right'},
  {story: END_CONTROLS_RTL, start: 'right', end: 'left'},
] as const) {
  test(`an overflowing strip fades the side that hides tokens (${start === 'left' ? 'LTR' : 'RTL'})`, async ({
    page,
  }) => {
    await mount(page, story);
    const strip = strips(page);
    await expect(strip).toHaveCount(1);
    expect((await scrollRange(strip)).max).toBeGreaterThan(0);

    // At rest the strip shows its inline start, so only its end hides tokens.
    await expect
      .poll(async () => fadedSides(strip))
      .toEqual({[start]: false, [end]: true});
    await scrollStrip(strip, 'middle');
    await expect
      .poll(async () => fadedSides(strip))
      .toEqual({left: true, right: true});
    await scrollStrip(strip, 'end');
    await expect
      .poll(async () => fadedSides(strip))
      .toEqual({[start]: true, [end]: false});
  });
}

test('forced colors restore a thin native scrollbar and drop the fades', async ({
  page,
}) => {
  await mount(page, END_CONTROLS);
  const strip = strips(page);
  const presentation = async () =>
    strip.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        scrollbarWidth: style.getPropertyValue('scrollbar-width'),
        mask:
          style.getPropertyValue('mask-image') ||
          style.getPropertyValue('-webkit-mask-image'),
      };
    });
  const before = await presentation();
  test.skip(
    before.scrollbarWidth === '',
    'This engine does not implement scrollbar-width',
  );
  expect(before.scrollbarWidth).toBe('none');
  expect(before.mask).not.toBe('none');

  await page.emulateMedia({forcedColors: 'active'});
  test.skip(
    !(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)),
    'This engine does not emulate forced colors',
  );
  await expect
    .poll(presentation)
    .toEqual({scrollbarWidth: 'thin', mask: 'none'});
});

test('a disabled strip is a named Tab stop only while it overflows', async ({
  page,
  browserName,
}) => {
  await mount(page, DISABLED);
  const overflowing = strips(page).nth(0);
  const fitting = strips(page).nth(1);
  expect((await scrollRange(overflowing)).max).toBeGreaterThan(0);
  expect((await scrollRange(fitting)).max).toBe(0);

  await expect(overflowing).toHaveAttribute('tabindex', '0');
  await expect(overflowing).toHaveAttribute('role', 'group');
  await expect(overflowing).toHaveAccessibleName('Selections');
  await expect(fitting).not.toHaveAttribute('tabindex', /.*/);
  expect(await fadedSides(fitting)).toEqual({left: false, right: false});

  // A disabled token has no remove button, so the strip is the first stop. It
  // keeps focus: the field's redirect to its input is for skipping remove
  // buttons, and this input (focusable for its disabled reason) comes next.
  await page.keyboard.press(tabKey(browserName));
  await expect(overflowing).toBeFocused();

  // Native scroll keys reach both ends of the range.
  for (let count = 0; count < 100; count++) {
    const {position, max} = await scrollRange(overflowing);
    if (position >= max - 1) {
      break;
    }
    await page.keyboard.press('ArrowRight', {delay: 50});
  }
  await expect
    .poll(async () => {
      const {position, max} = await scrollRange(overflowing);
      return max - position;
    })
    .toBeLessThanOrEqual(1);
  for (let count = 0; count < 100; count++) {
    if ((await scrollRange(overflowing)).position <= 1) {
      break;
    }
    await page.keyboard.press('ArrowLeft', {delay: 50});
  }
  await expect
    .poll(async () => (await scrollRange(overflowing)).position)
    .toBeLessThanOrEqual(1);
  await expect(overflowing).toBeFocused();

  await page.keyboard.press(tabKey(browserName));
  await expect(
    overflowing.getByRole('combobox', {name: 'Favorite fruits Selections'}),
  ).toBeFocused();
  // The fitting field's input is plainly disabled and its strip adds no stop.
  await page.keyboard.press(tabKey(browserName));
  await expect(fitting).not.toBeFocused();
  await expect(overflowing).not.toBeFocused();
});

test('an enabled strip adds no Tab stop: each remove button brings its token clear of the fades', async ({
  page,
  browserName,
}) => {
  await mount(page, END_CONTROLS);
  const strip = strips(page);
  await expect(strip).not.toHaveAttribute('tabindex', /.*/);
  const removeButtons = strip.getByRole('button', {name: /^Remove /});
  const count = await removeButtons.count();
  expect(count).toBe(6);

  // Entering the field lands on its input, which brings the strip's end into
  // view; the remove buttons are reached backwards from there.
  await page.keyboard.press(tabKey(browserName));
  await expect(page.getByRole('combobox')).toBeFocused();
  for (let index = count - 1; index >= 0; index--) {
    await page.keyboard.press(tabKey(browserName, true));
    const button = removeButtons.nth(index);
    await expect(button).toBeFocused();
    // The whole token, label and all, is inside the strip and outside
    // whichever edges are faded.
    await expect
      .poll(async () => {
        const sides = await fadedSides(strip);
        return strip.evaluate(
          (element, {target, faded}) => {
            const token = (target as HTMLElement).closest('.astryx-token');
            if (token == null) {
              throw new Error('A remove button sits outside its token');
            }
            const outer = element.getBoundingClientRect();
            const inner = token.getBoundingClientRect();
            const style = getComputedStyle(element);
            const left =
              outer.left +
              (faded.left ? parseFloat(style.scrollPaddingLeft) || 0 : 0);
            const right =
              outer.right -
              (faded.right ? parseFloat(style.scrollPaddingRight) || 0 : 0);
            return inner.left >= left - 0.5 && inner.right <= right + 0.5;
          },
          {target: await button.elementHandle(), faded: sides},
        );
      })
      .toBe(true);
  }

  // Past the first token focus leaves the field, without stopping on the strip.
  await page.keyboard.press(tabKey(browserName, true));
  await expect(strip).not.toBeFocused();
  expect(
    await page.evaluate(
      () => document.activeElement?.closest('.astryx-tokenizer') == null,
    ),
  ).toBe(true);
});

test("one press on an early token's remove button removes it", async ({
  page,
}) => {
  await mount(page, END_CONTROLS);
  const strip = strips(page);
  expect((await scrollRange(strip)).max).toBeGreaterThan(0);
  const removeButtons = strip.getByRole('button', {name: /^Remove /});
  await expect(removeButtons).toHaveCount(6);
  const first = removeButtons.first();
  const name = await first.getAttribute('aria-label');

  // The strip rests at its inline start, so the first token is in view. One
  // press must remove it: the field must not move focus, and with it the
  // strip, before the press releases.
  await first.click();
  await expect(removeButtons).toHaveCount(5);
  await expect(strip.getByRole('button', {name: name ?? ''})).toHaveCount(0);
});
