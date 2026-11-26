// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/hooks/(useScrollableArea|scrollGeometry|scrollOwnerRegistry)|packages/core/src/utils/sharedResizeObserver|apps/storybook/stories/ScrollableArea)

/**
 * @file ScrollableAreaKeyboard.a11y.browser.spec.ts
 * @input The built Storybook's ScrollableArea stories, driven with trusted
 *   key presses in Chromium and WebKit
 * @output Real-browser proof that the viewport takes a tab stop only while it
 *   scrolls, that the keyboard then reaches its whole scroll range in both
 *   directions, and that losing overflow keeps focus where it is
 * @position Ongoing browser check for ScrollableArea; jsdom cannot drive
 *   native keyboard scrolling
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

const CONDITIONAL = '[data-evidence="conditional-tabindex"]';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

// macOS WebKit defaults to text-field traversal. Option+Tab selects its native
// all-controls traversal, equivalent to enabling Safari's keyboard preference.
function tabKey(browserName: string): string {
  return `${browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : ''}Tab`;
}

/** The part of Storybook's preview this spec reads: the story render's phase. */
interface StorybookPreviewWindow extends Window {
  __STORYBOOK_PREVIEW__?: {currentRender?: {phase?: string}};
}

async function open(page: Page, story: string, direction = 'ltr') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-scrollablearea--${story}&viewMode=story&globals=astryxTheme:neutral;colorMode:light;direction:${direction}`,
    {waitUntil: 'load'},
  );
  // The stories' play functions toggle, focus and scroll the viewports. Wait
  // until Storybook has finished the render, play included, so none of their
  // steps land inside a case.
  await page.waitForFunction(
    () =>
      (window as StorybookPreviewWindow).__STORYBOOK_PREVIEW__?.currentRender
        ?.phase === 'finished',
  );
}

async function nextFrames(page: Page) {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** Reads a scroll offset once it has stopped moving. */
async function settledOffset(
  page: Page,
  viewport: Locator,
  read: (element: HTMLElement) => number,
): Promise<number> {
  let previous = await viewport.evaluate(read);
  for (let attempt = 0; attempt < 40; attempt++) {
    await nextFrames(page);
    const current = await viewport.evaluate(read);
    if (current === previous) {
      return current;
    }
    previous = current;
  }
  return previous;
}

async function makeOverflow(page: Page): Promise<Locator> {
  await page.getByRole('button', {name: 'Make content overflow'}).click();
  const viewport = page.locator(CONDITIONAL);
  await expect(viewport).toHaveAttribute('data-scrollable-block', 'true');
  await expect(viewport).toHaveAttribute('tabindex', '0');
  return viewport;
}

test('the viewport takes a tab stop only while its content overflows', async ({
  page,
  browserName,
}) => {
  await open(page, 'conditional-keyboard-access');
  const viewport = page.locator(CONDITIONAL);
  await expect(viewport).not.toHaveAttribute('data-scrollable-block');
  await expect(viewport).not.toHaveAttribute('tabindex');
  await page.getByRole('button', {name: 'Make content overflow'}).focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(viewport).not.toBeFocused();

  await makeOverflow(page);
  await page.getByRole('button', {name: 'Make content fit'}).focus();
  await page.keyboard.press(tabKey(browserName));
  await expect(
    page.getByRole('region', {name: 'Conditional activity list'}),
  ).toBeFocused();
});

test('the keyboard reaches the whole block scroll range of the focused viewport', async ({
  page,
}) => {
  await open(page, 'conditional-keyboard-access');
  const viewport = await makeOverflow(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  const scrollTop = (element: HTMLElement) => element.scrollTop;
  const pageHeight = await viewport.evaluate(element => element.clientHeight);

  await page.keyboard.press('ArrowDown');
  const afterArrow = await settledOffset(page, viewport, scrollTop);
  expect(afterArrow).toBeGreaterThan(0);
  await page.keyboard.press('PageDown');
  const afterPage = await settledOffset(page, viewport, scrollTop);
  expect(afterPage - afterArrow).toBeGreaterThan(pageHeight / 2);
  await page.keyboard.press('End');
  await expect(viewport).toHaveAttribute('data-scroll-block-end', 'true');

  await page.keyboard.press('PageUp');
  const afterPageUp = await settledOffset(page, viewport, scrollTop);
  await page.keyboard.press('ArrowUp');
  const afterArrowUp = await settledOffset(page, viewport, scrollTop);
  expect(afterArrowUp).toBeLessThan(afterPageUp);
  await page.keyboard.press('Home');
  await expect(viewport).toHaveAttribute('data-scroll-block-start', 'true');
});

test('an arrow key scrolls an inline viewport toward its inline end in both directions', async ({
  page,
}) => {
  for (const direction of ['ltr', 'rtl'] as const) {
    await open(page, 'rtl-behavior-probe', direction);
    const viewport = page.locator('[data-rtl-scroll-probe="true"]');
    await expect(viewport).toHaveAttribute('data-scrollable-inline', 'true');
    await expect(viewport).toHaveAttribute('tabindex', '0');
    // The play function scrolled toward the inline end; start from the
    // inline start.
    await viewport.evaluate(element => {
      element.scrollLeft = 0;
    });
    await expect(viewport).toHaveAttribute('data-scroll-inline-start', 'true');
    await viewport.focus();
    await expect(viewport).toBeFocused();
    await page.keyboard.press(direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    const scrollLeft = await settledOffset(
      page,
      viewport,
      element => element.scrollLeft,
    );
    if (direction === 'rtl') {
      expect(scrollLeft).toBeLessThan(0);
    } else {
      expect(scrollLeft).toBeGreaterThan(0);
    }
  }
});

test('losing overflow keeps focus on the viewport and drops its future tab stop', async ({
  page,
}) => {
  await open(page, 'conditional-keyboard-access');
  const viewport = await makeOverflow(page);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  // A pointer click on the toggle would move focus. A dispatched click
  // changes the content while the viewport keeps focus.
  await page
    .getByRole('button', {name: 'Make content fit'})
    .dispatchEvent('click');
  await expect(viewport).toHaveAttribute('tabindex', '-1');
  await nextFrames(page);
  await expect(viewport).toBeFocused();
});
