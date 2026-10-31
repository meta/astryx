// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DrawerNonModalPageScroll.a11y.chromium.spec.ts
 * @input The built Drawer stories "Row Inspector" (non-modal) and "Showcase"
 *   (modal), real Chromium touch input (CDP `Input.dispatchTouchEvent`) in a
 *   phone context
 * @output Browser evidence that under a finger the page beside an open
 *   non-modal drawer still scrolls, because the panel is no scroll container
 *   whose overscroll containment could hold the drag, while a modal drawer
 *   still holds the page behind its scrim. With `overflow: hidden` on the
 *   panel, Chromium held every such drag while the drawer was open, whether it
 *   had opened from code (a selection, a deep link, an assistive
 *   technology's click) or from a tap.
 * @position Chromium proof for Drawer.tsx's `overflow: clip`; the declaration
 *   itself is pinned in Drawer.test.tsx
 *
 * Each check plays one drag, proves the page received it (a capture-phase
 * touch probe), and measures the page by the visual viewport's place in the
 * document, so a pan that moves only the visual viewport counts too.
 */

import {expect, test, type Page} from '@playwright/test';
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

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: {width: 402, height: 714},
  deviceScaleFactor: 1,
});

/** In the strip the drawer leaves free on the phone. */
const STRIP_X = 20;

async function frames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async n => {
    for (let i = 0; i < n; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }, count);
}

const sleep = async (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * A finger dragging up the strip, 350 px in 200 ms at 60 Hz, then resting
 * 150 ms before it lifts so no fling outlives the pan. Paced in real time, as
 * a finger is: each event goes out at its own time, stamped with it.
 */
async function dragUp(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const from = 600;
  const to = 250;
  const steps = 12;
  const at = (y: number) => [
    {x: STRIP_X, y, id: 0, radiusX: 1, radiusY: 1, force: 1},
  ];
  type Point = {
    x: number;
    y: number;
    id: number;
    radiusX: number;
    radiusY: number;
    force: number;
  };
  const send = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: Point[],
  ) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints,
      timestamp: Date.now() / 1000,
    });
  await send('touchStart', at(from));
  for (let i = 1; i <= steps; i++) {
    await sleep(200 / steps);
    await send('touchMove', at(from + ((to - from) * i) / steps));
  }
  await sleep(150);
  await send('touchEnd', []);
  await cdp.detach();
}

/**
 * Records every touch the page receives, and whether the browser took one to
 * pan something (a `pointercancel`): a window capture listener added before
 * the page's own scripts. Install it before opening the story.
 */
async function installTouchProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as {__touchProbe: string[]}).__touchProbe = seen;
    for (const type of [
      'touchstart',
      'touchmove',
      'touchend',
      'touchcancel',
      'pointercancel',
    ]) {
      window.addEventListener(type, () => seen.push(type), {
        capture: true,
        passive: true,
      });
    }
  });
}

/**
 * Plays one drag up the strip and returns what the page received: its touch
 * events, and whether the browser took the touch to pan something. A drag the
 * page never received shows here, so it cannot pass as one that scrolled
 * nothing.
 */
async function playDrag(
  page: Page,
): Promise<{received: string[]; panned: boolean}> {
  const take = async () =>
    page.evaluate(() =>
      (window as unknown as {__touchProbe: string[]}).__touchProbe.splice(0),
    );
  await take();
  await dragUp(page);
  await frames(page, 4);
  const seen = await take();
  return {
    received: seen.filter(type => type.startsWith('touch')),
    panned: seen.includes('pointercancel'),
  };
}

/** The whole drag reached the page: a touchstart, its moves and its touchend. */
function expectDelivered(played: {received: string[]}): void {
  expect(played.received[0], 'the drag reached the page').toBe('touchstart');
  expect(played.received).toContain('touchmove');
  expect(played.received.at(-1)).toBe('touchend');
}

/**
 * Where the visual viewport is in the document. A page wider than the phone
 * (main's story stage) lets a pan first move the visual viewport inside the
 * layout viewport, which `window.scrollY` does not report.
 */
const pageTop = async (page: Page) =>
  page.evaluate(() => {
    if (window.visualViewport == null) {
      throw new Error('the page has no visual viewport');
    }
    return window.visualViewport.pageTop;
  });

/**
 * Opens the story on a page taller than the screen, checks that a drag
 * scrolls it, then opens the drawer (with a tap, or from code: a click with no
 * input behind it) and waits until it is in.
 */
async function openOnTallPage(
  page: Page,
  story: string,
  opener: string,
  how: 'tap' | 'code' = 'tap',
) {
  await installTouchProbe(page);
  await page.goto(`${storybook.origin}/iframe.html?id=${story}&viewMode=story`);
  const button = page.getByRole('button', {name: opener});
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '300vh';
    document.body.append(spacer);
  });
  const before = await playDrag(page);
  expectDelivered(before);
  expect(before.panned, 'the browser took the drag to scroll').toBe(true);
  expect(
    await pageTop(page),
    'the page scrolls before the drawer opens',
  ).toBeGreaterThan(0);
  await button.evaluate(element => element.scrollIntoView({block: 'center'}));
  await frames(page);

  if (how === 'tap') {
    await button.tap();
  } else {
    await button.evaluate(element => (element as HTMLElement).click());
  }
  const drawer = page.locator('dialog[open], dialog:popover-open');
  await expect(drawer).toHaveCount(1);
  await drawer.evaluate(async element => {
    await Promise.all(
      element.getAnimations().map(async animation =>
        animation.finished.catch((error: unknown) => {
          // A canceled animation's `finished` rejects with an AbortError:
          // it ended. Anything else is a failure, and it surfaces.
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            throw error;
          }
        }),
      ),
    );
  });
  await frames(page);
}

for (const how of ['code', 'tap'] as const) {
  test(`a drag on the page beside a non-modal drawer opened from ${how === 'tap' ? 'a tap' : 'code'} scrolls the page`, async ({
    page,
  }) => {
    await openOnTallPage(
      page,
      'core-drawer--row-inspector',
      'Open drawer',
      how,
    );

    // Measured from where the open left the page: a tap scrolls the opener
    // into view first.
    const start = await pageTop(page);
    const played = await playDrag(page);
    expectDelivered(played);
    expect(played.panned, 'the browser took the drag to scroll').toBe(true);
    expect(await pageTop(page)).toBeGreaterThan(start);
  });
}

test('a modal drawer still holds the page behind its scrim', async ({page}) => {
  await openOnTallPage(page, 'core-drawer--showcase', 'Open inspector');

  // Measured from where the open left the page, whatever the scroll lock
  // reports there.
  const start = await pageTop(page);
  expectDelivered(await playDrag(page));
  expect(await pageTop(page)).toBe(start);
  await expect(
    page.getByRole('dialog', {name: 'Deployment details'}),
  ).toBeVisible();
});

test('the story fits the phone: the page does not scroll sideways', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-drawer--row-inspector&viewMode=story`,
  );
  await expect(page.getByRole('button', {name: 'Open drawer'})).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(402);
});
