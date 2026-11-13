// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastSwipeScroll.interaction.browser.spec.ts
 * @input The ErrorPersists story, whose toast stays until dismissed, on a
 *   phone page taller than the screen, with a finger, in Chromium and WebKit.
 * @output Tests that a bottom toast decides a touch on its first move. The
 *   test starts from three offsets on the card, slowly and quickly. A first
 *   move toward the edge is the swipe's and never scrolls the page. A first
 *   move away from the edge leaves the page its scroll.
 * @position iOS commits a page scroll on the first move that no listener
 *   prevents, so the first move decides.
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
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({
  viewport: {width: 390, height: 844},
  isMobile: true,
  hasTouch: true,
});

const SCROLLED_TO = 600;
const OFFSETS = [0.25, 0.5, 0.75] as const;
// A quick start toward the edge can be a flick that dismisses the toast.
const STARTS = [
  {label: 'toward the edge, slowly', dy: 24, durationMs: 600, owns: true},
  {label: 'toward the edge, quickly', dy: 40, durationMs: 100, owns: true},
  {label: 'away from the edge, slowly', dy: -60, durationMs: 600, owns: false},
  {label: 'away from the edge, quickly', dy: -60, durationMs: 120, owns: false},
] as const;

type Recorder = {__firstMovePrevented?: boolean | null};

async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
}

/** Waits until the page holds still for 500 ms, so a fling has ended. */
async function waitForStillPage(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        let last = document.scrollingElement?.scrollTop ?? 0;
        let stillSince = performance.now();
        const timer = setInterval(() => {
          const top = document.scrollingElement?.scrollTop ?? 0;
          if (top !== last) {
            last = top;
            stillSince = performance.now();
          } else if (performance.now() - stillSince >= 500) {
            clearInterval(timer);
            resolve();
          }
        }, 50);
      }),
  );
}

/** Scrolls the page back to its start once it holds still. */
async function resetScroll(page: Page): Promise<void> {
  await waitForStillPage(page);
  await page.evaluate(top => window.scrollTo(0, top), SCROLLED_TO);
  await waitForStillPage(page);
  expect(await scrollTop(page)).toBe(SCROLLED_TO);
}

async function showToast(page: Page): Promise<Locator> {
  // A script click, so the scrolled page stays where it is.
  await page
    .getByRole('button', {name: 'Trigger error'})
    .evaluate(element => (element as HTMLElement).click());
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  await waitForRest(card);
  return card;
}

async function openScrolledPage(page: Page): Promise<TouchDriver> {
  await openStory(page, storybook(), 'core-toast--error-persists');
  const driver = await touchDriver(page);
  // A page taller than the screen, scrolled partway down. A passive window
  // listener runs after the card's own and reads whether it prevented the
  // touch's first move.
  await page.evaluate(top => {
    const spacer = document.createElement('div');
    spacer.style.height = '4000px';
    document.body.append(spacer);
    window.scrollTo(0, top);
    const recorder = window as unknown as Recorder;
    recorder.__firstMovePrevented = null;
    window.addEventListener(
      'touchmove',
      event => {
        if (recorder.__firstMovePrevented == null) {
          recorder.__firstMovePrevented = event.defaultPrevented;
        }
      },
      {passive: true},
    );
  }, SCROLLED_TO);
  await expect.poll(async () => scrollTop(page)).toBe(SCROLLED_TO);
  return driver;
}

/** Swipes from `offset` of the card and returns whether the toast prevented the first move. */
async function swipe(
  page: Page,
  driver: TouchDriver,
  card: Locator,
  offset: number,
  start: (typeof STARTS)[number],
): Promise<boolean | null> {
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  const from = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height * offset),
  };
  await page.evaluate(() => {
    (window as unknown as Recorder).__firstMovePrevented = null;
  });
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + start.dy},
      {durationMs: start.durationMs, hz: 60, restMs: 0},
    ),
  );
  return page.evaluate(
    () => (window as unknown as Recorder).__firstMovePrevented ?? null,
  );
}

/**
 * Shows a new toast if the last swipe dismissed it. Under a finger a
 * dismissed card first slides past its edge, and only then leaves the page.
 * So this waits until the card rests on the screen or is gone.
 */
async function restoreToast(page: Page, card: Locator): Promise<Locator> {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const element = document.querySelector('.astryx-toast');
        if (element == null) {
          return 'gone';
        }
        const box = element.getBoundingClientRect();
        const isOnScreen = box.bottom > 0 && box.top < window.innerHeight;
        return isOnScreen && element.getAnimations().length === 0
          ? 'rests'
          : 'moves';
      }),
    )
    .not.toBe('moves');
  if ((await page.locator('.astryx-toast').count()) === 0) {
    return showToast(page);
  }
  await waitForRest(card);
  return card;
}

test('a touch on a bottom toast is decided by its first move', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const driver = await openScrolledPage(page);
  let card = await showToast(page);
  for (const offset of OFFSETS) {
    for (const start of STARTS) {
      const prevented = await swipe(page, driver, card, offset, start);
      expect(prevented, `${start.label}, at ${offset} of the card`).toBe(
        start.owns,
      );
      card = await restoreToast(page, card);
      await resetScroll(page);
    }
  }
});

test('a first move toward the edge never scrolls the page, and one away from it scrolls as usual', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    "Playwright's WebKit scrolls no page from a synthetic touch",
  );
  test.setTimeout(120_000);
  const driver = await openScrolledPage(page);
  // Control: the same swipe on the page itself scrolls it.
  await driver.play(
    drag({x: 195, y: 300}, {x: 195, y: 240}, {durationMs: 600, hz: 60}),
  );
  await expect.poll(async () => scrollTop(page)).toBeGreaterThan(SCROLLED_TO);
  await resetScroll(page);
  let card = await showToast(page);
  for (const offset of OFFSETS) {
    for (const start of STARTS) {
      const before = await scrollTop(page);
      await swipe(page, driver, card, offset, start);
      const label = `${start.label}, at ${offset} of the card`;
      if (start.owns) {
        await waitForStillPage(page);
        expect(await scrollTop(page), label).toBe(before);
      } else {
        await expect
          .poll(async () => scrollTop(page), {message: label})
          .toBeGreaterThan(SCROLLED_TO);
      }
      card = await restoreToast(page, card);
      await resetScroll(page);
    }
  }
});
