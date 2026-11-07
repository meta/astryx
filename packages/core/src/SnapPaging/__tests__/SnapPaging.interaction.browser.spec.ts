// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SnapPaging.interaction.browser.spec.ts
 * @input The built Carousel snap-paging stories, real touch and wheel input
 *   (Chromium CDP / WebKit's injected events) and the interaction harness
 * @output Proof that snap paging pages a carousel under a finger and on a
 *   trackpad swipe under a coarse and a fine primary pointer, on native snap's
 *   stops and mirrored in RTL. A mouse wheel and a mouse drag keep native
 *   scrolling. An edge press or Shift+wheel during a settle moves the row on
 *   from where it shows. A held touch stops that move. Dropping the value
 *   mid-settle hands the row back
 * @position Browser proof for snap paging, run by `pnpm test:interaction`
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  freezePageWhen,
  installPageFreeze,
  installTimerGate,
  openStory,
  tap,
  thawPage,
  touchDriver,
  webInputDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

import {paging} from '../../motion/uikit/paging';
import {nearestStop} from '../snapPagingValue';

const storybook = withStorybook(test);

type Mode = 'snap' | 'paging' | 'item';

type Story =
  | 'snap-paging-one-up'
  | 'snap-paging-three-up'
  | 'snap-paging-partial-last-page';

async function open(
  page: Page,
  story: Story,
  mode: Mode,
  {rtl = false, freeze = false}: {rtl?: boolean; freeze?: boolean} = {},
) {
  // A proof that stops the scene needs the page's clock before the story loads.
  if (freeze) {
    await installPageFreeze(page);
  }
  if (rtl) {
    await page.goto(
      `${storybook()}/iframe.html?id=core-carousel--${story}&viewMode=story&args=mode:${mode}&globals=direction:rtl`,
    );
    await page.getByRole('region').waitFor();
  } else {
    await openStory(page, storybook(), `core-carousel--${story}`, {mode});
  }
  const scroller = page.getByRole('region').getByRole('group').first();
  return {scroller};
}

/** The row's native scroll offset, toward the end in either direction. */
const offset = async (scroller: Locator) =>
  scroller.evaluate(el => Math.abs(el.scrollLeft));

/** The row's travel: how far it scrolls. */
const travel = async (scroller: Locator) =>
  scroller.evaluate(el => el.scrollWidth - el.clientWidth);

/** Each item's snap stop: its start edge, from the row's start, at rest. */
const stopsOf = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const rtl = getComputedStyle(el).direction === 'rtl';
    const box = el.getBoundingClientRect();
    const end = el.scrollWidth - el.clientWidth;
    return Array.from(el.children).map(child => {
      const rect = child.getBoundingClientRect();
      const start = rtl ? box.right - rect.right : rect.left - box.left;
      return Math.min(start + Math.abs(el.scrollLeft), end);
    });
  });

/** Whether any item still carries the paging's translate. */
const isTakenOver = async (scroller: Locator) =>
  scroller.evaluate(el =>
    Array.from(el.children).some(
      child => (child as HTMLElement).style.translate !== '',
    ),
  );

/** Waits until the paging hands the row back to native scrolling. */
async function settled(scroller: Locator) {
  await expect.poll(async () => isTakenOver(scroller)).toBe(false);
}

/** Sets the open story's `mode` arg, as the preview's control does. */
async function setMode(page: Page, story: Story, mode: Mode) {
  await page.evaluate(
    ({storyId, updatedArgs}) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            emit: (event: string, payload: unknown) => void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      channel.emit('updateStoryArgs', {storyId, updatedArgs});
    },
    {storyId: `core-carousel--${story}`, updatedArgs: {mode}},
  );
}

/**
 * A drag toward the end of the row (right to left in LTR) of `px`, over `ms`,
 * held still for `restMs` before the lift.
 */
async function swipe(
  page: Page,
  scroller: Locator,
  {
    px,
    ms,
    restMs = 0,
    rtl = false,
  }: {px: number; ms: number; restMs?: number; rtl?: boolean},
) {
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const half = px / 2;
  const from = {x: box.x + box.width / 2 + (rtl ? -half : half), y};
  const to = {x: from.x + (rtl ? px : -px), y};
  const driver = await touchDriver(page);
  // The paging reads a scrolling surface's release and pages from
  // `advanceSpeed`. A release the page reads on the other side of it from
  // the script fails by name, never as the paging's verdict.
  await driver.play(drag(from, to, {durationMs: ms, restMs}), {
    release: 'scroll',
    boundaries: {releasePxPerS: paging.release.advanceSpeed},
  });
}

for (const mode of ['paging', 'item'] as const) {
  test.describe(`under a finger, ${mode === 'paging' ? 'the default (one view)' : '{pages: "item"}'}`, () => {
    test('one item per view: a flick moves one item, and the row rests natively there', async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-one-up', mode);
      expect(await offset(scroller)).toBe(0);
      await swipe(page, scroller, {px: 80, ms: 80});
      await settled(scroller);
      await expect.poll(async () => offset(scroller)).toBeCloseTo(300, 0);
    });

    test(`three items per view: a flick moves ${mode === 'paging' ? 'one view, to the item start edge nearest one viewport on' : 'one item'}`, async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-three-up', mode);
      const stops = await stopsOf(scroller);
      await swipe(page, scroller, {px: 80, ms: 80});
      await settled(scroller);
      await expect
        .poll(async () => offset(scroller))
        .toBeCloseTo(stops[mode === 'paging' ? 3 : 1], 0);
    });

    test('a partial last page rests where the row ends, with no empty space', async ({
      page,
    }) => {
      const {scroller} = await open(
        page,
        'snap-paging-partial-last-page',
        mode,
      );
      const end = await travel(scroller);
      for (let i = 0; i < 7; i++) {
        await swipe(page, scroller, {px: 80, ms: 80});
        await settled(scroller);
      }
      await expect.poll(async () => offset(scroller)).toBeCloseTo(end, 0);
      // The last item's end meets the row's end.
      expect(
        await scroller.evaluate(el => {
          const last = el.lastElementChild as HTMLElement;
          return (
            el.getBoundingClientRect().right -
            last.getBoundingClientRect().right
          );
        }),
      ).toBeLessThan(1);
    });

    test('right-to-left: a flick toward the inline end moves forward, mirrored', async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-three-up', mode, {
        rtl: true,
      });
      const stops = await stopsOf(scroller);
      await swipe(page, scroller, {px: 80, ms: 80, rtl: true});
      await settled(scroller);
      await expect
        .poll(async () => scroller.evaluate(el => el.scrollLeft))
        .toBeCloseTo(-stops[mode === 'paging' ? 3 : 1], 0);
    });

    test('a short flick over 300 pt/s moves a page', async ({page}) => {
      const {scroller} = await open(page, 'snap-paging-one-up', mode);
      // 40 px in 40 ms: about 1,000 px/s.
      await swipe(page, scroller, {px: 40, ms: 40});
      await settled(scroller);
      await expect.poll(async () => offset(scroller)).toBeCloseTo(300, 0);
    });

    test('a slow release before half a page stays; past half a page moves', async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-one-up', mode);
      // 120 px over 600 ms, held still: under half of the 300 px page.
      await swipe(page, scroller, {px: 120, ms: 600, restMs: 200});
      await settled(scroller);
      await expect.poll(async () => offset(scroller)).toBe(0);
      // 180 px over 600 ms, held still: past half of it.
      await swipe(page, scroller, {px: 180, ms: 600, restMs: 200});
      await settled(scroller);
      await expect.poll(async () => offset(scroller)).toBeCloseTo(300, 0);
    });
  });
}

// Chromium's CDP input sends wheels without a trackpad's legacy `wheelDelta`,
// so the gesture engine reads them as a mouse's wheel. The trackpad cases run
// in WebKit, whose injected wheels carry it.
const TRACKPAD_IN_CHROMIUM =
  "Chromium's CDP wheels read as a mouse's wheel; the trackpad cases run in WebKit";

/**
 * Reports a coarse primary pointer to script, before the story loads: a
 * tablet with a trackpad, whose wheels a desktop context can inject.
 */
function coarsePrimaryPointer() {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query: string) => {
    if (!query.includes('pointer: coarse')) {
      return real(query);
    }
    const list: MediaQueryList = {
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    return list;
  };
}

for (const pointer of ['coarse', 'fine'] as const) {
  test.describe(`where the primary pointer is ${pointer} and a trackpad scrolls`, () => {
    // WebKit's mobile emulation has no wheel input. A desktop context stands
    // for a laptop, and with a coarse primary pointer for a tablet with a
    // trackpad.
    test.use({hasTouch: false, isMobile: false});

    for (const mode of ['paging', 'item'] as const) {
      test(`${mode === 'paging' ? 'the default' : '{pages: "item"}'}: a trackpad swipe pages`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName === 'chromium', TRACKPAD_IN_CHROMIUM);
        if (pointer === 'coarse') {
          await page.addInitScript(coarsePrimaryPointer);
        }
        const {scroller} = await open(page, 'snap-paging-three-up', mode);
        const stops = await stopsOf(scroller);
        const box = await scroller.boundingBox();
        if (box == null) {
          throw new Error('no scroller');
        }
        const input = await webInputDriver(page);
        // 40 steps of 6.5 px, a trackpad's continuous scroll: 260 px, past half
        // of a view.
        for (let i = 0; i < 40; i++) {
          await input.wheel({
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            dx: 6.5,
          });
        }
        await settled(scroller);
        await expect
          .poll(async () => offset(scroller))
          .toBeCloseTo(stops[mode === 'paging' ? 3 : 1], 0);
      });
    }
  });
}

test('the scroll offset holds through a swipe, so the edge fades and buttons stay put, and the settle hands it on', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
  const stops = await stopsOf(scroller);
  // Natively at the second view first.
  await scroller.evaluate((el, left) => {
    el.scrollTo({left, behavior: 'instant'});
  }, stops[3]);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(stops[3], 0);
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const from = {x: box.x + box.width / 2 + 40, y};
  const to = {x: from.x - 80, y};
  // The page reads the offset at each move. A read from here holds the lift
  // back, and a lift past the stillness interval releases at rest.
  await scroller.evaluate(el => {
    const seen: number[] = [];
    (window as unknown as {__seen: number[]}).__seen = seen;
    window.addEventListener('touchmove', () => seen.push(el.scrollLeft), {
      passive: true,
    });
  });
  const driver = await touchDriver(page);
  await driver.play(drag(from, to, {durationMs: 80, restMs: 0}));
  const seen = await page.evaluate(
    () => (window as unknown as {__seen: number[]}).__seen,
  );
  expect(seen.length).toBeGreaterThan(0);
  for (const at of seen) {
    expect(Math.abs(at)).toBeCloseTo(stops[3], 0);
  }
  await settled(scroller);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(stops[6], 0);
});

test('an edge button steps about one view: the viewport less half an item, on the nearest stop', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
  const stops = await stopsOf(scroller);
  const step = await scroller.evaluate(
    el =>
      el.clientWidth -
      (el.firstElementChild as HTMLElement).getBoundingClientRect().width / 2,
  );
  const nearest = stops.reduce(
    (best, stop) =>
      Math.abs(stop - step) < Math.abs(best - step) ? stop : best,
    stops[1],
  );
  await page.getByRole('button', {name: /next|right|forward/i}).click();
  await expect
    .poll(async () => offset(scroller))
    .toBeCloseTo(Math.max(nearest, stops[1]), 0);
  expect(await isTakenOver(scroller)).toBe(false);
});

/**
 * Flicks the row (toward the start with `back`), then presses the edge button
 * while the paging still holds the row past `until`. True if it was held.
 */
async function pressInSettle(
  page: Page,
  scroller: Locator,
  until: number,
  back = false,
) {
  const next = await page
    .getByRole('button', {name: /next|right|forward/i})
    .boundingBox();
  if (next == null) {
    throw new Error('no edge button');
  }
  // The settle's frames go through the gate, so the freeze below holds them.
  await installTimerGate(page);
  await scroller.evaluate(el => el.setAttribute('data-press-in-settle', ''));
  await swipe(page, scroller, {px: 80, ms: 80, rtl: back});
  // The scene stops in the first frame where the paging holds the row past
  // `until`. A read from this process comes a round trip late, and a loaded
  // runner can miss the whole pass in that time. A settle that hands the row
  // back first fails here, by name.
  await freezePageWhen(
    page,
    ({at, isBack}) => {
      const el = document.querySelector('[data-press-in-settle]');
      const items = Array.from(el?.children ?? []) as HTMLElement[];
      if (el == null || items.length === 0) {
        return false;
      }
      const shown =
        el.getBoundingClientRect().left - items[0].getBoundingClientRect().left;
      const isHeld = items.some(item => item.style.translate !== '');
      return isHeld && (isBack ? shown < at : shown >= at);
    },
    {at: until, isBack: back},
  );
  const held = await isTakenOver(scroller);
  await page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await thawPage(page);
  return held;
}

/** The row's offset once two reads a while apart agree. */
async function restingOffset(scroller: Locator) {
  await settled(scroller);
  // The first poll only reads. Two reads in one frame agree even while a
  // native smooth scroll runs.
  let at = Number.NaN;
  await expect
    .poll(async () => {
      const before = at;
      at = await offset(scroller);
      return Math.abs(at - before);
    })
    .toBeLessThan(0.5);
  return at;
}

test('an edge press late in a settle steps on to a stop', async ({page}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging', {
    freeze: true,
  });
  const stops = await stopsOf(scroller);
  expect(await pressInSettle(page, scroller, stops[3] * 0.9)).toBe(true);
  const at = await restingOffset(scroller);
  // At least one stop past the flick's own target.
  expect(at).toBeGreaterThan(stops[4] - 0.5);
  expect(Math.min(...stops.map(stop => Math.abs(stop - at)))).toBeLessThan(1);
});

for (const holdMs of [150, 40]) {
  test(`during an edge button's move, a ${holdMs} ms touch on the row ${holdMs > 85 ? 'stops it where it shows' : 'lets it run on'}, and the row rests on a stop`, async ({
    page,
  }) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging', {
      freeze: true,
    });
    const stops = await stopsOf(scroller);
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    expect(await pressInSettle(page, scroller, stops[3] * 0.9)).toBe(true);
    const driver = await touchDriver(page);
    // A hold the page reads on the other side of the catch time from the
    // script fails by name.
    await driver.play(
      tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs}),
      {boundaries: {holdMs: paging.catchStopMs}},
    );
    const at = await restingOffset(scroller);
    expect(Math.min(...stops.map(stop => Math.abs(stop - at)))).toBeLessThan(1);
    // Past the pager's catch time, the move stops short of its target.
    expect(Math.abs(at - stops[5]) < 1).toBe(holdMs < paging.catchStopMs);
  });
}

test.describe('with a finger and a mouse', () => {
  test.use({hasTouch: true, isMobile: false});

  test('Shift+wheel during an edge press goes to a stop', async ({page}) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging', {
      freeze: true,
    });
    const stops = await stopsOf(scroller);
    expect(await pressInSettle(page, scroller, stops[3] * 0.9)).toBe(true);
    // Where the row shows at the wheel, and any native scroll while held.
    const probe = scroller.evaluate(async el => {
      const first = el.firstElementChild as HTMLElement;
      const event = (await new Promise<Event>(resolve => {
        el.addEventListener('wheel', resolve, {capture: true, once: true});
      })) as WheelEvent;
      const shown =
        el.getBoundingClientRect().left - first.getBoundingClientRect().left;
      const held = el.scrollLeft;
      let drift = 0;
      while (first.style.translate !== '') {
        drift = Math.max(drift, Math.abs(el.scrollLeft - held));
        await new Promise(requestAnimationFrame);
      }
      return {shown, held, travel: event.deltaX || event.deltaY, drift};
    });
    await scroller.hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 900);
    await page.keyboard.up('Shift');
    const {shown, held, travel, drift} = await probe;
    const expected = nearestStop(stops, shown + travel);
    // A native scroll would move the held offset, and the target is neither
    // the press's own nor a reversed wheel's.
    expect(held + travel).toBeGreaterThan(0.5);
    expect(Math.abs(expected - stops[5])).toBeGreaterThan(1);
    expect(drift).toBe(0);
    expect(await restingOffset(scroller)).toBeCloseTo(expected, 0);
  });

  test('a resize while the row settles back onto its stop hands the row back: a wheel then scrolls it', async ({
    page,
  }) => {
    const {scroller} = await open(
      page,
      'snap-paging-partial-last-page',
      'paging',
    );
    for (let i = 0; i < 7; i++) {
      await swipe(page, scroller, {px: 80, ms: 80});
      await settled(scroller);
    }
    // At the end, a flick settles back onto the same stop. The page narrows
    // the row by 1 px 60 ms after the lift, so the resize lands mid-settle
    // whatever the runner's lag.
    await scroller.evaluate(el => {
      const flags = window as unknown as {heldAtResize?: boolean};
      el.addEventListener(
        'touchend',
        () => {
          setTimeout(() => {
            flags.heldAtResize = Array.from(el.children).some(
              child => (child as HTMLElement).style.translate !== '',
            );
            el.style.width = `${el.clientWidth - 1}px`;
          }, 60);
        },
        {once: true},
      );
    });
    await swipe(page, scroller, {px: 80, ms: 80});
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as {heldAtResize?: boolean}).heldAtResize,
        ),
      )
      .toBe(true);
    await settled(scroller);
    // A row the paging still holds takes the wheel and stays put.
    const at = await offset(scroller);
    await scroller.hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -150);
    await page.keyboard.up('Shift');
    await expect.poll(async () => offset(scroller)).toBeLessThan(at - 1);
  });
});

test('an edge press after a flick back near the end shows no space past the last item', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging', {
    freeze: true,
  });
  const stops = await stopsOf(scroller);
  // One stop from the end, where the edge button still shows.
  await scroller.evaluate((el, left) => {
    el.scrollTo({left, behavior: 'instant'});
  }, stops[5]);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(stops[5], 0);
  // The widest space past the last item, on every frame until the hand-back.
  const space = scroller.evaluate(async el => {
    const last = el.lastElementChild as HTMLElement;
    const isHeld = () => last.style.translate !== '';
    let widest = 0;
    let wasHeld = false;
    while (!wasHeld || isHeld()) {
      wasHeld ||= isHeld();
      const box = el.getBoundingClientRect();
      widest = Math.max(widest, box.right - last.getBoundingClientRect().right);
      await new Promise(requestAnimationFrame);
    }
    return widest;
  });
  // Once the flick back widens the overflow by its translate.
  expect(await pressInSettle(page, scroller, stops[5] - 15, true)).toBe(true);
  expect(await space).toBeLessThan(1);
  const at = await restingOffset(scroller);
  expect(Math.min(...stops.map(stop => Math.abs(stop - at)))).toBeLessThan(1);
});

test('hasSnap alone attaches no paging: no gesture claims the row', async ({
  page,
}) => {
  const paging = await open(page, 'snap-paging-one-up', 'paging');
  // The paging claims the row's horizontal pans under a finger.
  expect(
    await paging.scroller.evaluate(el => getComputedStyle(el).touchAction),
  ).toBe('pan-y pinch-zoom');
  const {scroller} = await open(page, 'snap-paging-one-up', 'snap');
  expect(await scroller.evaluate(el => getComputedStyle(el).touchAction)).toBe(
    'auto',
  );
  expect(
    await scroller.evaluate(el => getComputedStyle(el).scrollSnapType),
  ).toContain('mandatory');
});

test('a new page size applies from the next flick: one item, then one view', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'item');
  const stops = await stopsOf(scroller);
  await swipe(page, scroller, {px: 80, ms: 80});
  await settled(scroller);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(stops[1], 0);
  await setMode(page, 'snap-paging-three-up', 'paging');
  await swipe(page, scroller, {px: 80, ms: 80});
  await settled(scroller);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(stops[4], 0);
});

test('dropping the paging value mid-settle hands the row back to native scrolling', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
  const stops = await stopsOf(scroller);
  await swipe(page, scroller, {px: 80, ms: 80});
  // Mid-settle: the row is still taken over.
  expect(await isTakenOver(scroller)).toBe(true);
  // The story now passes hasSnap, so Carousel drops the paging value.
  await setMode(page, 'snap-paging-three-up', 'snap');
  await expect
    .poll(async () => scroller.evaluate(el => getComputedStyle(el).touchAction))
    .toBe('auto');
  // Handed back: no translate, the row at or between its stops, at rest.
  expect(await isTakenOver(scroller)).toBe(false);
  const at = await offset(scroller);
  expect(at).toBeGreaterThanOrEqual(0);
  expect(at).toBeLessThanOrEqual(stops[3] + 1);
});

test.describe('under a fine primary pointer', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a mouse wheel scrolls the row natively: the paging does not run', async ({
    page,
  }) => {
    const {scroller} = await open(page, 'snap-paging-one-up', 'paging');
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(400, 0);
    await expect.poll(async () => offset(scroller)).toBeGreaterThan(0);
    expect(await isTakenOver(scroller)).toBe(false);
  });

  test('a mouse drag leaves the row where it is: only a finger, a pen or a trackpad pages', async ({
    page,
  }) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2 + 75, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 + 75 - 15 * i, y);
    }
    await page.mouse.up();
    expect(await isTakenOver(scroller)).toBe(false);
    expect(await offset(scroller)).toBe(0);
  });

  test('hasSnap alone keeps native snapping under a trackpad swipe', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName === 'chromium', TRACKPAD_IN_CHROMIUM);
    const {scroller} = await open(page, 'snap-paging-three-up', 'snap');
    const stops = await stopsOf(scroller);
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const input = await webInputDriver(page);
    let wasTakenOver = false;
    for (let i = 0; i < 40; i++) {
      await input.wheel({
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        dx: 6.5,
      });
      wasTakenOver ||= await isTakenOver(scroller);
    }
    expect(wasTakenOver).toBe(false);
    // Native snap rests on a stop.
    await expect
      .poll(async () => {
        const at = await offset(scroller);
        return stops.some(stop => Math.abs(stop - at) < 1);
      })
      .toBe(true);
    expect(await offset(scroller)).toBeGreaterThan(0);
  });
});
