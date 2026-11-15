// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file NavigationStackScrollEdge.interaction.browser.spec.ts
 * @input The built "Scrolling" NavigationStack story on the touch phone
 *   profile, programmatic and real-touch scrolls, and the interaction harness
 * @output Proofs of the bar's iOS 26 look under a finger. The bar paints no
 *   background or hairline, and each screen's veil switches at 10px. A push
 *   and a pop keep each screen's veil, and a finger's scroll fades it. A
 *   screen a pop reveals shows the veil for its own scroll. On a large-title
 *   screen the veil comes on as the bar's title takes over. The veil is
 *   hidden from assistive technology. A mouse keeps the bar's surface and
 *   runs no veil.
 * @position Interaction proof for NavigationStack.tsx and Lab's
 *   internal/useScrollEdgeEffect.ts, run by `pnpm test:interaction`. The
 *   phone profile's coarse pointer is the touch case in both engines.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  armHold,
  drag,
  frames,
  openStory,
  releaseAnimations,
  touchDriver,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'lab-navigationstack--scrolling';

const card = (page: Page, screen: string) =>
  page.locator(`[data-navigation-screen="${screen}"]`);
const veil = (page: Page, screen: string) =>
  card(page, screen).locator(':scope > [data-navigation-scroll-edge]');
const scroller = (page: Page, screen: string) =>
  card(page, screen).locator(':scope > :first-child');

async function presentedOpacity(layer: Locator): Promise<number> {
  return layer.evaluate(element => Number(getComputedStyle(element).opacity));
}

/** Scrolls a screen, lets the observer report, waits for the fade to end. */
async function settleAt(page: Page, screen: string, top: number) {
  await scroller(page, screen).evaluate((element, y) => {
    element.scrollTop = y;
  }, top);
  await frames(page, 3);
  await waitForRest(veil(page, screen));
  return presentedOpacity(veil(page, screen));
}

// A report that never comes leaves the finger down for about a second.
const REPORT_FRAMES = 60;

/**
 * Scrolls a screen while a finger rests on its content, and lifts the finger
 * once the observer has reported: the veil then animates or changes. The
 * gesture host reads the scroll as the finger's, so the veil fades. The scroll
 * ends under the resting finger, so a lift before a late report would make
 * the scroll the program's. A page starved of frames reports late. Resolves
 * with the frames from the scroll to the veil's first change, or null when it
 * did not change within REPORT_FRAMES.
 */
async function fingerScrollTo(
  page: Page,
  screen: string,
  top: number,
): Promise<number | null> {
  return scroller(page, screen).evaluate(
    (element, {y, maxFrames}) =>
      new Promise<number | null>(resolve => {
        const target = element.lastElementChild ?? element;
        const touch = {identifier: 7, clientX: 100, clientY: 400, target};
        const fire = (type: string, touches: (typeof touch)[]) => {
          const event = new Event(type, {bubbles: true, cancelable: true});
          Object.defineProperty(event, 'changedTouches', {value: [touch]});
          Object.defineProperty(event, 'touches', {value: touches});
          target.dispatchEvent(event);
        };
        const layer = element.parentElement?.querySelector(
          ':scope > [data-navigation-scroll-edge]',
        );
        const animationsBefore = new Set(layer?.getAnimations() ?? []);
        const opacityBefore =
          layer == null ? null : getComputedStyle(layer).opacity;
        fire('touchstart', [touch]);
        element.scrollTop = y;
        let frames = 0;
        const liftAfter = (changedAt: number | null) => () => {
          fire('touchend', []);
          resolve(changedAt);
        };
        const check = () => {
          frames += 1;
          const changed =
            layer == null ||
            layer
              .getAnimations()
              .some(animation => !animationsBefore.has(animation)) ||
            getComputedStyle(layer).opacity !== opacityBefore;
          if (changed) {
            requestAnimationFrame(liftAfter(frames));
          } else if (frames >= maxFrames) {
            requestAnimationFrame(liftAfter(null));
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      }),
    {y: top, maxFrames: REPORT_FRAMES},
  );
}

async function openStack(page: Page, story = STORY) {
  await openStory(page, storybook(), story);
  await expect(page.getByTestId('navigation-stack')).toBeVisible();
  await expect(veil(page, 'root')).toBeAttached();
}

test('the bar paints no background and no hairline under a finger', async ({
  page,
}) => {
  await openStack(page);
  const background = await page
    .getByTestId('navigation-stack')
    .evaluate(stack => {
      const bar = stack.firstElementChild as HTMLElement;
      const style = getComputedStyle(bar.firstElementChild as HTMLElement);
      return {
        color: style.backgroundColor,
        border: style.borderBottomWidth,
      };
    });
  expect(background).toEqual({color: 'rgba(0, 0, 0, 0)', border: '0px'});
});

test('a scroll the program drives switches a screen’s veil at once: off through 10px, on beyond, both ways', async ({
  page,
}) => {
  await openStack(page);
  const steps: [number, number][] = [
    [0, 0],
    [5, 0],
    [10, 0],
    [11, 1],
    [200, 1],
    [10, 0],
    [0, 0],
  ];
  const seen: {top: number; opacity: number}[] = [];
  for (const [top, expected] of steps) {
    const opacity = await settleAt(page, 'root', top);
    seen.push({top, opacity});
    expect(opacity, `${top}px under the bar`).toBe(expected);
    // At once: the WebKit workaround (no fade on the program's scroll).
    expect(
      await veil(page, 'root').evaluate(
        element => element.getAnimations().length,
      ),
    ).toBe(0);
  }
  test
    .info()
    .annotations.push({type: 'switch', description: JSON.stringify(seen)});
});

test('a push brings the new screen’s own veil; a pop returns to the scrolled screen’s', async ({
  page,
}) => {
  await openStack(page);
  expect(await settleAt(page, 'root', 300)).toBe(1);
  await page.getByRole('button', {name: /Message 9\b/}).click();
  await expect(card(page, 'screen-Message 9')).toHaveAttribute(
    'data-navigation-top',
    'true',
  );
  await waitForRest(card(page, 'screen-Message 9'));
  await waitForRest(veil(page, 'screen-Message 9'));
  // The new screen sits at its top: its own veil is off. The covered screen
  // keeps its own, on.
  expect(await presentedOpacity(veil(page, 'screen-Message 9'))).toBe(0);
  expect(await presentedOpacity(veil(page, 'root'))).toBe(1);
  await page.getByRole('button', {name: 'Inbox'}).click();
  await expect(card(page, 'root')).toHaveAttribute(
    'data-navigation-top',
    'true',
  );
  await waitForRest(card(page, 'root'));
  expect(await presentedOpacity(veil(page, 'root'))).toBe(1);
});

test('a screen a pop reveals shows the veil for its own scroll: off at its top', async ({
  page,
}) => {
  // The story opens two screens deep, so the root mounts hidden.
  await openStack(page, 'lab-navigationstack--pushed');
  const back = page.locator('[data-navigation-back]');
  await back.click();
  await expect(card(page, 'screen-About')).toHaveCount(0);
  await waitForRest(card(page, 'screen-General'));
  await back.click();
  await expect(card(page, 'root')).toHaveAttribute(
    'data-navigation-top',
    'true',
  );
  await waitForRest(card(page, 'root'));
  await waitForRest(veil(page, 'root'));
  // The veil is there and laid out, so an opacity of 0 is a real reading.
  const box = await veil(page, 'root').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  expect(
    await scroller(page, 'root').evaluate(element => element.scrollTop),
  ).toBe(0);
  expect(await presentedOpacity(veil(page, 'root'))).toBe(0);
});

test('on a large-title screen the veil comes on as the bar’s title takes over', async ({
  page,
}) => {
  await openStack(page, 'lab-navigationstack--large-title');
  const geometry = await card(page, 'root').evaluate(element => {
    const title = element.querySelector('h1');
    const sentinel = element.querySelector(
      '[data-navigation-scroll-edge-sentinel]',
    );
    const bar = document.querySelector('[data-navigation-bar="root"]');
    if (title == null || sentinel == null || bar == null) {
      return null;
    }
    const titleBox = title.getBoundingClientRect();
    const sentinelBox = sentinel.getBoundingClientRect();
    return {
      titleHeight: Math.round(titleBox.height),
      titleBottom: Math.round(titleBox.bottom),
      sentinelBottom: Math.round(sentinelBox.bottom),
      sentinelHeight: Math.round(sentinelBox.height),
      // How far the root scrolls before the large title's bottom meets the
      // bar's, where the bar's title takes over.
      collapseAt: Math.round(
        titleBox.bottom - bar.getBoundingClientRect().bottom,
      ),
    };
  });
  if (geometry == null) {
    throw new Error('no large title, scroll edge sentinel or bar');
  }
  const {collapseAt, ...ends} = geometry;
  expect(ends.titleHeight).toBeGreaterThan(20);
  expect(ends.sentinelHeight).toBe(10);
  expect(ends.sentinelBottom).toBe(ends.titleBottom);
  expect(collapseAt).toBeGreaterThan(10);
  const barTitle = page.locator('[data-navigation-bar="root"] h2');
  // Short of it the large title shows: the bar's title is hidden, no veil.
  expect(await settleAt(page, 'root', collapseAt - 4)).toBe(0);
  await waitForRest(barTitle);
  expect(await presentedOpacity(barTitle)).toBe(0);
  // Past it the bar's title shows, over the veil.
  expect(await settleAt(page, 'root', collapseAt + 4)).toBe(1);
  await waitForRest(barTitle);
  expect(await presentedOpacity(barTitle)).toBe(1);
});

test('a finger scrolling the screen fades the veil in', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native scrolling from injected touches is Chromium-only (harness README)',
  );
  await openStack(page);
  const driver = await touchDriver(page);
  await driver.play(
    drag({x: 200, y: 560}, {x: 200, y: 460}, {durationMs: 300, restMs: 450}),
  );
  await waitForRest(veil(page, 'root'));
  const top = await scroller(page, 'root').evaluate(
    element => element.scrollTop,
  );
  expect(top).toBeGreaterThan(10);
  expect(await presentedOpacity(veil(page, 'root'))).toBe(1);
});

/**
 * Holds the page's IntersectionObserver reports from `holdObserverReports()`
 * until the finger's scroll has ended. That is after the `scrollend` that
 * follows the lift, or after the lift when the scroll ended under the resting
 * finger. A busy page runs a report that late. Each entry keeps its own
 * `time`. `releasedReports` counts the reports held, so a test can see the
 * hold.
 */
async function holdReportsPastTheScroll(page: Page) {
  await page.addInitScript(() => {
    const Observer = window.IntersectionObserver;
    const held: Array<() => void> = [];
    let isHolding = false;
    let isLifted = false;
    let hasScrollEnded = false;
    const release = () => {
      isHolding = false;
      // After the gesture host and the finger-scroll watch hear the event.
      setTimeout(() => {
        const runs = held.splice(0);
        Object.assign(window, {releasedReports: runs.length});
        for (const run of runs) {
          run();
        }
      });
    };
    Object.assign(window, {
      releasedReports: 0,
      holdObserverReports: () => {
        isHolding = true;
        isLifted = false;
        hasScrollEnded = false;
      },
    });
    document.addEventListener(
      'touchend',
      () => {
        if (isHolding) {
          isLifted = true;
          if (hasScrollEnded) {
            release();
          }
        }
      },
      true,
    );
    document.addEventListener(
      'scrollend',
      () => {
        if (isHolding) {
          hasScrollEnded = true;
          if (isLifted) {
            release();
          }
        }
      },
      true,
    );
    window.IntersectionObserver = class extends Observer {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super((entries, observer) => {
          if (isHolding) {
            held.push(() => callback(entries, observer));
          } else {
            callback(entries, observer);
          }
        }, options);
      }
    };
  });
}

test('a finger’s scroll fades the veil even when its report runs after the scroll ended', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native scrolling from injected touches is Chromium-only (harness README)',
  );
  await holdReportsPastTheScroll(page);
  await openStack(page);
  const layer = veil(page, 'root');
  const hold = await armHold(page, layer, {
    judges: {target: layer, property: 'opacity'},
    newOnly: true,
  });
  const driver = await touchDriver(page);
  await page.evaluate(() =>
    (
      window as unknown as {holdObserverReports: () => void}
    ).holdObserverReports(),
  );
  await driver.play(
    drag({x: 200, y: 560}, {x: 200, y: 460}, {durationMs: 300, restMs: 450}),
  );
  // A switch at once runs no animation, so the hold finds none.
  await hold.held();
  expect(
    await page.evaluate(
      () => (window as unknown as {releasedReports: number}).releasedReports,
    ),
  ).toBeGreaterThan(0);
  await releaseAnimations(page, {finish: true});
  expect(await presentedOpacity(layer)).toBe(1);
});

test('the veil and its sentinel are hidden from assistive technology', async ({
  page,
}) => {
  await openStack(page);
  const hidden = await card(page, 'root').evaluate(element => {
    const layer = element.querySelector('[data-navigation-scroll-edge]');
    const sentinel = element.querySelector(
      '[data-navigation-scroll-edge-sentinel]',
    );
    return {
      layer: layer?.getAttribute('aria-hidden'),
      sentinel: sentinel?.getAttribute('aria-hidden'),
      pointer: layer == null ? null : getComputedStyle(layer).pointerEvents,
    };
  });
  expect(hidden).toEqual({layer: 'true', sentinel: 'true', pointer: 'none'});
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the bar keeps its surface and hairline and runs no veil', async ({
    page,
  }) => {
    await openStack(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const background = await page
      .getByTestId('navigation-stack')
      .evaluate(stack => {
        const bar = stack.firstElementChild as HTMLElement;
        const style = getComputedStyle(bar.firstElementChild as HTMLElement);
        return {color: style.backgroundColor, border: style.borderBottomWidth};
      });
    expect(background.color).not.toBe('rgba(0, 0, 0, 0)');
    expect(background.border).toBe('1px');
    await scroller(page, 'root').evaluate(element => {
      element.scrollTop = 200;
    });
    await frames(page, 5);
    expect(
      await veil(page, 'root').evaluate(element => ({
        display: getComputedStyle(element).display,
        running: element.getAnimations().length,
      })),
    ).toEqual({display: 'none', running: 0});
  });
});

test(
  'storyboard: a screen’s veil fading in',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await openStack(page);
    const layer = veil(page, 'root');
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: 120};
    const hold = await armHold(page, layer, {
      judges: {target: layer, property: 'opacity'},
      newOnly: true,
    });
    const reportFrames = await fingerScrollTo(page, 'root', 120);
    // How long the finger rested: a slow reaction to the scroll shows here.
    testInfo.annotations.push({
      type: 'veil report frames',
      description: String(reportFrames),
    });
    const held = await hold.held();
    const {storyboard} = await animationStoryboard(page, {
      held,
      name: 'navigation-stack-scroll-edge-appear',
      clip,
      measure: async () => ({opacity: await presentedOpacity(layer)}),
      columns: 6,
      cellScale: 0.5,
    });
    await releaseAnimations(page, {finish: true});
    await storyboard.write(testInfo);
    const ins = storyboard.frames.map(f => f.data.opacity as number);
    expect(ins[0]).toBeLessThan(0.05);
    expect(ins.every((o, i) => i === 0 || o >= ins[i - 1] - 0.002)).toBe(true);
    expect(ins.at(-1)).toBeGreaterThan(0.99);
  },
);
