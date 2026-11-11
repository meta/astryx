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
  FRAME_STARVATION_MS,
  freezePageWhen,
  holdInputUntil,
  installPageFreeze,
  installTimerGate,
  openStory,
  requireFrames,
  tap,
  thawPage,
  touchDriver,
  webInputDriver,
  WHEEL_SCROLL_END_MS,
  withStorybook,
  type InputHold,
} from '@astryxdesign/interaction-harness';

import {paging} from '../../motion/uikit/paging';
import {solvePaging} from '../../motion/paging';
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

    // Three per view, the drag goes past half a page, so the lift moves on.
    for (const [story, px, dragPx] of [
      ['snap-paging-partial-last-page', 1, 60],
      ['snap-paging-three-up', 100, 90],
    ] as const) {
      test(`a ${px} px resize while a finger holds the row at its end: the lift rests where the row ends (${story})`, async ({
        page,
      }) => {
        const {scroller} = await open(page, story, mode);
        for (let i = 0; i < 7; i++) {
          await swipe(page, scroller, {px: 80, ms: 80});
          await settled(scroller);
        }
        // The row narrows under the finger, at its third move.
        await scroller.evaluate((el, by) => {
          let moves = 0;
          el.addEventListener(
            'touchmove',
            () => {
              moves += 1;
              if (moves === 3) {
                el.style.width = `${el.clientWidth - by}px`;
              }
            },
            {passive: true},
          );
        }, px);
        const box = await scroller.boundingBox();
        if (box == null) {
          throw new Error('no scroller');
        }
        const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
        const driver = await touchDriver(page);
        await driver.play(
          drag(
            from,
            {x: from.x - dragPx, y: from.y},
            {durationMs: 200, restMs: 120},
          ),
        );
        await settled(scroller);
        expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
        // The last item's end meets the row's end, with no pixel cut off.
        expect(
          await scroller.evaluate(el => {
            const last = el.lastElementChild as HTMLElement;
            return (
              el.getBoundingClientRect().right -
              last.getBoundingClientRect().right
            );
          }),
        ).toBeGreaterThan(-0.5);
      });
    }

    test('a row narrowed 1 px a frame under a held finger, its items a share of its width: the lift rests where the row ends', async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-three-up', mode);
      // Items 40 % of the row wide: each pixel the row narrows takes 2.6 px
      // off its travel.
      await scroller.evaluate(el => {
        for (const child of Array.from(el.children)) {
          (child as HTMLElement).style.width = '40%';
        }
      });
      for (let i = 0; i < 12; i++) {
        if (
          Math.abs((await offset(scroller)) - (await travel(scroller))) < 0.5
        ) {
          break;
        }
        await swipe(page, scroller, {px: 80, ms: 80});
        await settled(scroller);
      }
      expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
      // From the drag's first move, the row narrows 1 px a frame for 20
      // frames. The page records how far the last item ends inside the row
      // on each frame of the hold.
      await scroller.evaluate(el => {
        const last = el.lastElementChild as HTMLElement;
        const record = window as unknown as {heldGaps: number[]};
        record.heldGaps = [];
        const isHeld = () =>
          Array.from(el.children).some(
            child => (child as HTMLElement).style.translate !== '',
          );
        const sample = () => {
          if (isHeld()) {
            record.heldGaps.push(
              el.getBoundingClientRect().right -
                last.getBoundingClientRect().right,
            );
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        let frames = 0;
        const narrow = () => {
          el.style.width = `${el.clientWidth - 1}px`;
          frames += 1;
          if (frames < 20) {
            requestAnimationFrame(narrow);
          }
        };
        el.addEventListener('touchmove', () => requestAnimationFrame(narrow), {
          once: true,
          passive: true,
        });
      });
      const box = await scroller.boundingBox();
      if (box == null) {
        throw new Error('no scroller');
      }
      const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const driver = await touchDriver(page);
      await driver.play(
        drag(from, {x: from.x - 90, y: from.y}, {durationMs: 500, restMs: 150}),
      );
      await settled(scroller);
      const heldGaps = await page.evaluate(
        () => (window as unknown as {heldGaps: number[]}).heldGaps,
      );
      expect(heldGaps.at(-1)).toBeGreaterThan(-0.5);
      expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
      expect(
        await scroller.evaluate(el => {
          const last = el.lastElementChild as HTMLElement;
          return (
            el.getBoundingClientRect().right -
            last.getBoundingClientRect().right
          );
        }),
      ).toBeGreaterThan(-0.5);
    });

    test('a 100 px widening while a finger holds the row at its end: the settle ends where the row ends, with no jump at the hand-back', async ({
      page,
    }) => {
      const {scroller} = await open(page, 'snap-paging-three-up', mode);
      for (let i = 0; i < 7; i++) {
        await swipe(page, scroller, {px: 80, ms: 80});
        await settled(scroller);
      }
      // The frame widens under the finger, at its third move, so the row's
      // travel drops below its scroll offset. The page records how far the
      // last item ends inside the row on each frame of the hold.
      await scroller.evaluate(el => {
        const frame = el.closest('[role="region"]')?.parentElement;
        if (frame == null) {
          throw new Error('no frame');
        }
        const last = el.lastElementChild as HTMLElement;
        const record = window as unknown as {heldGaps: number[]};
        record.heldGaps = [];
        const isHeld = () =>
          Array.from(el.children).some(
            child => (child as HTMLElement).style.translate !== '',
          );
        const sample = () => {
          if (isHeld()) {
            record.heldGaps.push(
              el.getBoundingClientRect().right -
                last.getBoundingClientRect().right,
            );
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        let moves = 0;
        el.addEventListener(
          'touchmove',
          () => {
            moves += 1;
            if (moves === 3) {
              frame.style.width = `${frame.clientWidth + 100}px`;
            }
          },
          {passive: true},
        );
      });
      const box = await scroller.boundingBox();
      if (box == null) {
        throw new Error('no scroller');
      }
      const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const driver = await touchDriver(page);
      await driver.play(
        drag(from, {x: from.x - 90, y: from.y}, {durationMs: 200, restMs: 120}),
      );
      await settled(scroller);
      // The last frame of the hold shows the row at its end, as the hand-back
      // leaves it.
      const heldGaps = await page.evaluate(
        () => (window as unknown as {heldGaps: number[]}).heldGaps,
      );
      expect(heldGaps.at(-1)).toBeGreaterThan(-0.5);
      expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
      expect(
        await scroller.evaluate(el => {
          const last = el.lastElementChild as HTMLElement;
          return (
            el.getBoundingClientRect().right -
            last.getBoundingClientRect().right
          );
        }),
      ).toBeGreaterThan(-0.5);
    });

    test('a narrowing that splits the last page from the stop before it while the row settles back onto its end: it rests where the row ends', async ({
      page,
    }) => {
      const {scroller} = await open(
        page,
        'snap-paging-partial-last-page',
        mode,
      );
      // The row starts at its end, natively.
      await scroller.evaluate(el => {
        el.scrollTo({
          left: el.scrollWidth - el.clientWidth,
          behavior: 'instant',
        });
      });
      await expect
        .poll(async () => offset(scroller), {
          message: 'the row starts at its end',
          timeout: 5000,
        })
        .toBeCloseTo(await travel(scroller), 0);
      // A drag past the end and a still lift settle back onto it, whatever
      // the release's pacing. The page narrows the row by 60 px 60 ms after
      // the lift, while it settles. The fifth item's stop then sits 60 px
      // before the new end, more than half its step: the last page splits
      // from it.
      await scroller.evaluate(el => {
        const flags = window as unknown as {
          heldAtResize?: boolean;
          shownAtResize?: number;
        };
        el.addEventListener(
          'touchend',
          () => {
            setTimeout(() => {
              flags.heldAtResize = Array.from(el.children).some(
                child => (child as HTMLElement).style.translate !== '',
              );
              el.style.width = `${el.clientWidth - 60}px`;
            }, 60);
          },
          {once: true},
        );
      });
      const box = await scroller.boundingBox();
      if (box == null) {
        throw new Error('no scroller');
      }
      const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const driver = await touchDriver(page);
      await driver.play(
        drag(from, {x: from.x - 60, y: from.y}, {durationMs: 160, restMs: 120}),
      );
      await expect
        .poll(
          async () =>
            page.evaluate(
              () =>
                (window as unknown as {heldAtResize?: boolean}).heldAtResize,
            ),
          {
            message: 'the resize lands while the paging holds the row',
            timeout: 5000,
          },
        )
        .toBe(true);
      await settled(scroller);
      expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
      expect(
        await scroller.evaluate(el => {
          const last = el.lastElementChild as HTMLElement;
          return (
            el.getBoundingClientRect().right -
            last.getBoundingClientRect().right
          );
        }),
      ).toBeGreaterThan(-0.5);
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
        // 40 steps, 7 and 6 px in turn, one a frame: a trackpad's continuous
        // scroll of 260 px, past half of a view. WebKit delivers whole px. A
        // step that reaches the page after the scroll ended would start a
        // second, shorter swipe, which settles back. So that gap fails here,
        // by name.
        await input.wheelBurst({
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          steps: Array.from({length: 40}, (_, i) => ({
            dx: i % 2 === 0 ? 7 : 6,
          })),
          maxGapMs: WHEEL_SCROLL_END_MS.horizontal,
        });
        await settled(scroller);
        await expect
          .poll(async () => offset(scroller))
          .toBeCloseTo(stops[mode === 'paging' ? 3 : 1], 0);
      });
    }
  });
}

test('the scroll offset holds through a swipe, and the settle hands it on', async ({
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
  // The row pages from the release the page reads. A release it reads on the
  // other side of the advance speed from the script fails by name.
  await driver.play(drag(from, to, {durationMs: 80, restMs: 0}), {
    release: 'scroll',
    boundaries: {releasePxPerS: paging.release.advanceSpeed},
  });
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

/** The fifth item's native snap alignment. */
const fifthAlign = async (scroller: Locator) =>
  scroller.evaluate(el => getComputedStyle(el.children[4]).scrollSnapAlign);

/**
 * The partial last page with its row 1 px narrower. The fifth item's stop sits
 * 1.37 px before the row's end, within half its step of it.
 */
async function openSplitEnd(page: Page, mode: Mode) {
  const {scroller} = await open(page, 'snap-paging-partial-last-page', mode);
  const before = await travel(scroller);
  await scroller.evaluate(el => {
    el.style.width = `${el.clientWidth - 1}px`;
  });
  await expect
    .poll(async () => travel(scroller), {
      message: 'the row is 1 px narrower',
      timeout: 5000,
    })
    .toBe(before + 1);
  // The paging writes the skip in a frame after the resize. Ten frames are
  // its budget.
  const isSkipped = await scroller.evaluate(async el => {
    const fifth = el.children[4];
    for (let frame = 0; frame < 10; frame++) {
      if (getComputedStyle(fifth).scrollSnapAlign === 'none') {
        return true;
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    return getComputedStyle(fifth).scrollSnapAlign === 'none';
  });
  expect(isSkipped, 'paging never wrote the skip').toBe(true);
  return scroller;
}

/** Adds an eighth item to the row, a copy of its last. */
async function addItem(scroller: Locator) {
  await scroller.evaluate(el => {
    el.append((el.lastElementChild as HTMLElement).cloneNode(true));
  });
}

/**
 * A flick of the row toward its start (`back`) or its end. Past the pan's
 * start, its 70 px still move the row more than half a step. So the rest page
 * is the same whatever speed the page reads at the lift.
 */
async function flick(
  page: Page,
  scroller: Locator,
  direction: 'back' | 'forward',
) {
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const from = {x: box.x + box.width / 2, y};
  const to = {x: from.x + (direction === 'back' ? 70 : -70), y};
  const driver = await touchDriver(page);
  await driver.play(drag(from, to, {durationMs: 60}), {pacing: 'spacing'});
}

test('a stop within half its step of the end is the end page: a flick back from the end moves a full step', async ({
  page,
}) => {
  const scroller = await openSplitEnd(page, 'item');
  const stops = await stopsOf(scroller);
  await scroller.evaluate(el => {
    el.scrollTo({left: el.scrollWidth - el.clientWidth, behavior: 'instant'});
  });
  await expect
    .poll(async () => offset(scroller), {
      message: 'the row starts at its end',
      timeout: 5000,
    })
    .toBeCloseTo(await travel(scroller), 0);
  await flick(page, scroller, 'back');
  await settled(scroller);
  expect(await offset(scroller)).toBeCloseTo(stops[3], 0);
});

test('a stop within half its step of the end is the end page: a flick onto it rests where the row ends', async ({
  page,
}) => {
  const scroller = await openSplitEnd(page, 'item');
  const stops = await stopsOf(scroller);
  await scroller.evaluate((el, left) => {
    el.scrollTo({left, behavior: 'instant'});
  }, stops[3]);
  await expect
    .poll(async () => offset(scroller), {
      message: 'the row starts one step before its end page',
      timeout: 5000,
    })
    .toBeCloseTo(stops[3], 0);
  await flick(page, scroller, 'forward');
  await settled(scroller);
  expect(await offset(scroller)).toBeCloseTo(await travel(scroller), 0);
});

test('a resize that moves the stop further from the end than half its step gives it back to native snap and to flicks', async ({
  page,
}) => {
  const scroller = await openSplitEnd(page, 'item');
  await expect
    .poll(async () => fifthAlign(scroller), {
      message: "native snap skips the fifth item's stop",
      timeout: 5000,
    })
    .toBe('none');
  // 59 px narrower still: the fifth item's stop sits 60 px before the end.
  const before = await travel(scroller);
  await scroller.evaluate(el => {
    el.style.width = `${el.clientWidth - 59}px`;
  });
  await expect
    .poll(async () => travel(scroller), {
      message: 'the row is 59 px narrower still',
      timeout: 5000,
    })
    .toBe(before + 59);
  await expect
    .poll(async () => fifthAlign(scroller), {
      message: "native snap takes the fifth item's stop back",
      timeout: 5000,
    })
    .toMatch(/^start/);
  const stops = await stopsOf(scroller);
  await scroller.evaluate(el => {
    el.scrollTo({left: el.scrollWidth - el.clientWidth, behavior: 'instant'});
  });
  await expect
    .poll(async () => offset(scroller), {
      message: 'the row starts at its end',
      timeout: 5000,
    })
    .toBeCloseTo(await travel(scroller), 0);
  await flick(page, scroller, 'back');
  await settled(scroller);
  expect(await offset(scroller)).toBeCloseTo(stops[4], 0);
});

test('an item added while the row settles: once it rests, native snap follows the new stops', async ({
  page,
}) => {
  const scroller = await openSplitEnd(page, 'item');
  await expect
    .poll(async () => fifthAlign(scroller), {
      message: "native snap skips the fifth item's stop",
      timeout: 5000,
    })
    .toBe('none');
  const stops = await stopsOf(scroller);
  await scroller.evaluate((el, left) => {
    el.scrollTo({left, behavior: 'instant'});
  }, stops[3]);
  await expect
    .poll(async () => offset(scroller), {
      message: 'the row starts one step before its end page',
      timeout: 5000,
    })
    .toBeCloseTo(stops[3], 0);
  // The page adds an eighth item 60 ms after the lift, while the row
  // settles. The fifth item's stop then sits a full step from the end.
  await scroller.evaluate(el => {
    el.addEventListener(
      'touchend',
      () => {
        setTimeout(() => {
          (window as unknown as {heldAtAdd?: boolean}).heldAtAdd = Array.from(
            el.children,
          ).some(child => (child as HTMLElement).style.translate !== '');
          el.append((el.lastElementChild as HTMLElement).cloneNode(true));
        }, 60);
      },
      {once: true},
    );
  });
  await flick(page, scroller, 'forward');
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => (window as unknown as {heldAtAdd?: boolean}).heldAtAdd,
        ),
      {message: 'the item lands while the paging holds the row', timeout: 5000},
    )
    .toBe(true);
  await settled(scroller);
  await expect
    .poll(async () => fifthAlign(scroller), {
      message:
        "native snap takes the fifth item's stop back once the row rests",
      timeout: 5000,
    })
    .toMatch(/^start/);
  // The hand-back snaps on the new stops: the row rests on the fifth item.
  await expect
    .poll(async () => offset(scroller), {
      message: "the row rests on the fifth item's stop",
      timeout: 5000,
    })
    .toBeCloseTo(stops[4], 0);
});

// Items as wide as the row scale with it, so a widening keeps the pages and
// the settle keeps the item it was heading to. The held row's stops must come
// from what it draws. Rects plus the animator's position put the moved items'
// stops ahead, and the settle turned back to the item it left.
test('a widening while a row of items as wide as the row settles: the settle ends on the item it was heading to', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-one-up', 'paging');
  // These items follow the row's width.
  await scroller.evaluate(el => {
    for (const item of Array.from(el.children) as HTMLElement[]) {
      item.style.flex = '0 0 100%';
      item.style.width = '100%';
    }
  });
  await swipe(page, scroller, {px: 80, ms: 80});
  await settled(scroller);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(300, 0);
  // The next flick heads for the third item. About 100 ms into its
  // settle, the page widens the row by half.
  await scroller.evaluate(el => {
    const first = el.firstElementChild as HTMLElement;
    const flags = window as unknown as {isWidened?: boolean; isLate?: boolean};
    el.addEventListener(
      'touchend',
      () => {
        let settleFrames = 0;
        const watch = () => {
          if (first.getAnimations().length > 0) {
            settleFrames += 1;
          } else if (settleFrames > 0) {
            // A starved page can show the whole settle in one frame.
            flags.isLate = true;
            return;
          }
          if (settleFrames < 6) {
            requestAnimationFrame(watch);
            return;
          }
          el.style.minWidth = `${el.clientWidth * 1.5}px`;
          flags.isWidened = true;
        };
        requestAnimationFrame(watch);
      },
      {once: true},
    );
  });
  await swipe(page, scroller, {px: 80, ms: 80});
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const flags = window as unknown as {
            isWidened?: boolean;
            isLate?: boolean;
          };
          return flags.isWidened === true || flags.isLate === true;
        }),
      {message: 'the widening comes while the row settles', timeout: 5000},
    )
    .toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as {isLate?: boolean}).isLate),
    'the row still settles at the widening',
  ).not.toBe(true);
  await settled(scroller);
  const stops = await stopsOf(scroller);
  expect(
    await offset(scroller),
    'the settle ends on the third item (px)',
  ).toBeCloseTo(stops[2], 0);
});

// A widening can shorten the row's travel below where the held row stands.
// The browser then clamps the scroll offset. The row lands on its page at
// once, as at rest, and stays there: no creep and no step at the hand-back.
test('a widening that leaves a settling row past its new last page lands it there at once and it stays', async ({
  page,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
  const end = await travel(scroller);
  await scroller.evaluate((el, x) => {
    el.scrollLeft = x;
  }, end);
  await expect.poll(async () => offset(scroller)).toBeCloseTo(end, 0);
  // From the lift, the page records each frame where the row shows and
  // whether the paging still moves it. Two frames into the settle, it widens
  // the row by half.
  await scroller.evaluate(el => {
    const first = el.firstElementChild as HTMLElement;
    const flags = window as unknown as {
      frames?: {shown: number; isMoving: boolean}[];
      isWidened?: boolean;
      isLate?: boolean;
      widenedAt?: number;
    };
    const frames: {shown: number; isMoving: boolean}[] = [];
    flags.frames = frames;
    el.addEventListener(
      'touchend',
      () => {
        let settleFrames = 0;
        const watch = () => {
          const isMoving = first.getAnimations().length > 0;
          frames.push({
            shown:
              el.getBoundingClientRect().left -
              first.getBoundingClientRect().left,
            isMoving,
          });
          if (flags.isWidened !== true) {
            if (isMoving) {
              settleFrames += 1;
            } else if (settleFrames > 0) {
              // A starved page can show the whole settle in one frame.
              flags.isLate = true;
              return;
            }
            if (settleFrames >= 2) {
              el.style.minWidth = `${el.clientWidth * 1.5}px`;
              flags.isWidened = true;
              flags.widenedAt = frames.length;
            }
          }
          if (frames.length < 240) {
            requestAnimationFrame(watch);
          }
        };
        requestAnimationFrame(watch);
      },
      {once: true},
    );
  });
  await swipe(page, scroller, {px: -80, ms: 80});
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const flags = window as unknown as {
            isWidened?: boolean;
            isLate?: boolean;
          };
          return flags.isWidened === true || flags.isLate === true;
        }),
      {message: 'the widening comes while the row settles', timeout: 5000},
    )
    .toBe(true);
  expect(
    await page.evaluate(() => (window as unknown as {isLate?: boolean}).isLate),
    'the row still settles at the widening',
  ).not.toBe(true);
  await settled(scroller);
  const frames = await page.evaluate(
    () =>
      (window as unknown as {frames: {shown: number; isMoving: boolean}[]})
        .frames,
  );
  const widenedAt = await page.evaluate(
    () => (window as unknown as {widenedAt: number}).widenedAt,
  );
  const landed = frames.findIndex(
    (frame, i) => i > 0 && frames[i - 1].isMoving && !frame.isMoving,
  );
  expect(landed, 'the row goes back to native scrolling').toBeGreaterThan(0);
  expect(
    landed - widenedAt,
    'frames from the widening to the rest',
  ).toBeLessThanOrEqual(1);
  const rest = await offset(scroller);
  // Every frame from the first one at rest shows the rest.
  const drift = Math.max(
    ...frames.slice(landed).map(frame => Math.abs(frame.shown - rest)),
  );
  expect(drift, 'the row moves after it lands (px)').toBeLessThanOrEqual(1);
  const stops = await stopsOf(scroller);
  expect(
    Math.min(...stops.map(stop => Math.abs(stop - rest))),
    'the row rests on a stop (px)',
  ).toBeLessThanOrEqual(0.5);
});

test('a narrowing while the row settles toward the last view: the settle plays on from where it shows, at its velocity, to the new last page', async ({
  page,
  browserName,
}) => {
  const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
  const stops = await stopsOf(scroller);
  // The row starts one view on, natively.
  await scroller.evaluate((el, left) => {
    el.scrollTo({left, behavior: 'instant'});
  }, stops[3]);
  await expect
    .poll(async () => offset(scroller), {
      message: 'the row starts one view on',
      timeout: 5000,
    })
    .toBeCloseTo(stops[3], 0);
  // A drag past half a view and a still lift head the row for the last view,
  // whatever the release's pacing. The page narrows the row by 100 px at
  // least 150 ms after the lift, while it settles, once eight frames show the settle.
  // From the lift until the hand-back, it samples each frame: where the row
  // shows, when the read ran, and each settle's own clock. A resize observer made after the
  // pager's runs right after the pager's own resize work. It records that
  // frame, that time, and the settle the work started.
  await scroller.evaluate(el => {
    const first = el.firstElementChild as HTMLElement;
    type Frame = {
      time: number;
      readStart: number;
      readEnd: number;
      shown: number;
      translate: number;
      scroll: number;
      beforeTime: number | null;
      afterTime: number | null;
    };
    const flags = window as unknown as {
      heldAtResize?: boolean;
      shownAtResize?: number;
      shownFrames?: Frame[];
      resizeFrame?: number;
      resizeCall?: number;
      settleBefore?: {
        start: number;
        duration: number;
        keyframes: {offset: number; x: number}[];
      };
      settleAfter?: {start: number; end: number};
    };
    const animations: {before?: Animation; after?: Animation} = {};
    const translateSettle = (except?: Animation) =>
      first
        .getAnimations()
        .find(
          animation =>
            animation !== except &&
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some(keyframe => keyframe.translate != null),
        );
    const clock = (animation?: Animation) =>
      animation?.currentTime == null ? null : Number(animation.currentTime);
    const frames: Frame[] = [];
    flags.shownFrames = frames;
    const startWidth = el.clientWidth;
    new ResizeObserver(() => {
      if (flags.resizeFrame == null && el.clientWidth !== startWidth) {
        flags.resizeFrame = frames.length - 1;
        flags.resizeCall = performance.now();
        animations.after = translateSettle(animations.before);
      }
    }).observe(el);
    const sample = (time: number) => {
      animations.before ??= translateSettle();
      // The new settle can start in a frame after the resize work.
      if (flags.resizeFrame != null) {
        animations.after ??= translateSettle(animations.before);
      }
      const beforeTime = clock(animations.before);
      const afterTime = clock(animations.after);
      const readStart = performance.now();
      const shown =
        el.getBoundingClientRect().left - first.getBoundingClientRect().left;
      const readEnd = performance.now();
      frames.push({
        time,
        readStart,
        readEnd,
        shown,
        translate: Number.parseFloat(getComputedStyle(first).translate) || 0,
        scroll: Math.abs(el.scrollLeft),
        beforeTime,
        afterTime,
      });
      const after = animations.after;
      const effect = after?.effect as KeyframeEffect | null | undefined;
      if (after?.startTime != null && effect != null) {
        flags.settleAfter = {
          start: Number(after.startTime),
          end: Number.parseFloat(
            String(effect.getKeyframes().at(-1)?.translate),
          ),
        };
      }
      const handedBack =
        frames.length > 2 &&
        frames.slice(-2).every(frame => frame.translate === 0);
      if (frames.length < 120 && !(frames.length >= 40 && handedBack)) {
        requestAnimationFrame(sample);
      }
    };
    el.addEventListener(
      'touchend',
      () => {
        requestAnimationFrame(sample);
        setTimeout(() => {
          flags.heldAtResize = Array.from(el.children).some(
            child => (child as HTMLElement).style.translate !== '',
          );
          flags.shownAtResize =
            el.getBoundingClientRect().left -
            first.getBoundingClientRect().left;
          const before = animations.before;
          const effect = before?.effect as KeyframeEffect | null | undefined;
          if (before?.startTime != null && effect != null) {
            flags.settleBefore = {
              start: Number(before.startTime),
              duration: Number(effect.getComputedTiming().duration),
              keyframes: effect.getKeyframes().map(keyframe => ({
                offset: keyframe.computedOffset,
                x: Number.parseFloat(String(keyframe.translate)),
              })),
            };
          }
          const resize = () => {
            if (frames.filter(frame => frame.beforeTime != null).length < 8) {
              setTimeout(resize, 8);
              return;
            }
            el.style.width = `${el.clientWidth - 100}px`;
          };
          resize();
        }, 150);
      },
      {once: true},
    );
  });
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      {x: box.x + box.width * 0.7, y},
      {x: box.x + box.width * 0.07, y},
      {durationMs: 200, restMs: 120},
    ),
  );
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => (window as unknown as {heldAtResize?: boolean}).heldAtResize,
        ),
      {
        message: 'the resize lands while the paging holds the row',
        timeout: 5000,
      },
    )
    .toBe(true);
  await settled(scroller);
  const shown = await page.evaluate(
    () =>
      (window as unknown as {shownAtResize?: number}).shownAtResize ?? Infinity,
  );
  const at = await offset(scroller);
  // The settle never runs back behind where the row showed.
  expect(at).toBeGreaterThan(shown - 0.5);
  // A settle toward the last page ends on the last page: the row's end.
  expect(at).toBeCloseTo(await travel(scroller), 0);
  // A new target keeps the current velocity (`spec:AST-094` FR6). So from
  // the resize on, every frame shows the paging integrator's curve to the new
  // last page, on that settle's own clock. The curve starts where the settle
  // before stood when the new one started, at its velocity then.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const frames =
            (window as unknown as {shownFrames?: {translate: number}[]})
              .shownFrames ?? [];
          return (
            frames.length >= 120 ||
            (frames.length >= 40 &&
              frames.slice(-2).every(frame => frame.translate === 0))
          );
        }),
      {message: 'the recorder samples until the hand-back', timeout: 5000},
    )
    .toBe(true);
  const {frames, resized, call, before, after} = await page.evaluate(() => {
    const flags = window as unknown as {
      shownFrames?: {
        time: number;
        readStart: number;
        readEnd: number;
        shown: number;
        translate: number;
        scroll: number;
        beforeTime: number | null;
        afterTime: number | null;
      }[];
      resizeFrame?: number;
      resizeCall?: number;
      settleBefore?: {
        start: number;
        duration: number;
        keyframes: {offset: number; x: number}[];
      };
      settleAfter?: {start: number; end: number};
    };
    return {
      frames: flags.shownFrames ?? [],
      resized: flags.resizeFrame ?? -1,
      call: flags.resizeCall ?? Number.NaN,
      before: flags.settleBefore ?? null,
      after: flags.settleAfter ?? null,
    };
  });
  expect(before, 'the page reads the settle before the resize').not.toBeNull();
  expect(after, 'the resize plays the settle on').not.toBeNull();
  if (before == null || after == null) {
    return;
  }
  expect(
    frames.length - resized,
    'the sampled frames go on three frames after the resize',
  ).toBeGreaterThanOrEqual(4);
  // While the paging holds the row, the row keeps its native offset, and an
  // item shows at that offset less its translate.
  const map = frames[resized].scroll;
  // The settle before the resize is the paging integrator's curve from its
  // first keyframe to its last. Its start velocity is the one whose curve
  // runs through every keyframe.
  const shownOf = (x: number) => map - x;
  const firstShown = shownOf(before.keyframes[0].x);
  const lastShown = shownOf(before.keyframes[before.keyframes.length - 1].x);
  const keyframeMiss = (velocity: number) => {
    const curve = solvePaging({from: firstShown, velocity, to: lastShown});
    return Math.max(
      ...before.keyframes.map(keyframe =>
        Math.abs(
          curve.at((keyframe.offset * before.duration) / 1000) -
            shownOf(keyframe.x),
        ),
      ),
    );
  };
  let low = -20000;
  let high = 20000;
  for (let step = 0; step < 80; step++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    if (keyframeMiss(a) < keyframeMiss(b)) {
      high = b;
    } else {
      low = a;
    }
  }
  expect(
    keyframeMiss(low),
    'the integrator reproduces the settle before the resize',
  ).toBeLessThanOrEqual(0.5);
  const settleBefore = solvePaging({
    from: firstShown,
    velocity: low,
    to: lastShown,
  });
  // Chromium shows a frame at that frame's clock. WebKit shows it at the time
  // of the read, which it reads to the millisecond. So a WebKit frame stands
  // for its read's span, plus half a millisecond either side.
  const resolution = browserName === 'webkit' ? 1 : 0;
  const span = (frame: (typeof frames)[number], time: number) =>
    resolution === 0
      ? [time, time]
      : [
          time + frame.readStart - frame.time - resolution / 2,
          time + frame.readEnd - frame.time + resolution / 2,
        ];
  const missOn = (
    curve: {at: (time: number) => number},
    shownThen: number,
    [from, until]: number[],
  ) => {
    const a = curve.at(from / 1000);
    const b = curve.at(until / 1000);
    return shownThen < Math.min(a, b)
      ? Math.min(a, b) - shownThen
      : Math.max(0, shownThen - Math.max(a, b));
  };
  // The frames before the resize check that reading: each shows the settle
  // before it within 1 px.
  const checked = frames
    .slice(0, resized + 1)
    .flatMap(frame =>
      frame.beforeTime != null &&
      Math.abs(settleBefore.velocity(frame.beforeTime / 1000)) > 100
        ? [missOn(settleBefore, frame.shown, span(frame, frame.beforeTime))]
        : [],
    );
  expect(
    checked.length,
    'six moving frames before the resize check the reading',
  ).toBeGreaterThanOrEqual(6);
  if (Math.max(...checked) > 1) {
    throw new Error(
      `the frames before the resize miss their own settle by ${Math.max(...checked).toFixed(2)} px`,
    );
  }
  // The new settle ends on its last keyframe. It starts where the settle
  // before stands at the new settle's start, at its velocity then.
  const to = map - after.end;
  const earliest = after.start - before.start - resolution;
  const latest = after.start - before.start + resolution;
  const resizeFrame = frames[resized];
  const missesFrom = (seed: number) => {
    const curve = solvePaging({
      from: settleBefore.at(seed / 1000),
      velocity: settleBefore.velocity(seed / 1000),
      to,
    });
    let hasStarted = false;
    return frames.slice(resized + 1).map((frame, index) => {
      if (frame.translate === 0) {
        return 0;
      }
      if (frame.afterTime == null) {
        // Once the new settle ends, the held row shows its end. Before it
        // starts, only the first frame may show the settle before it.
        if (hasStarted) {
          return Math.abs(frame.shown - to);
        }
        return index === 0 && frame.beforeTime != null
          ? missOn(settleBefore, frame.shown, span(frame, frame.beforeTime))
          : Infinity;
      }
      hasStarted = true;
      const onAfter = span(frame, frame.afterTime);
      const miss = missOn(curve, frame.shown, onAfter);
      if (index > 0) {
        return miss;
      }
      // A browser can commit the new settle inside the first frame after the
      // resize (`spec:AST-094` FR6). So that frame may still show the settle
      // before it, or the new curve anywhere from its start to its clock.
      const beforeClock =
        frame.beforeTime ??
        Number(resizeFrame.beforeTime) + frame.time - resizeFrame.time;
      return Math.min(
        miss,
        missOn(settleBefore, frame.shown, span(frame, beforeClock)),
        missOn(curve, frame.shown, [0, onAfter[1]]),
      );
    });
  };
  const seeds = Array.from(
    {length: 41},
    (_, i) => earliest + ((latest - earliest) * i) / 40,
  );
  const [seed, misses] = seeds
    .map(time => [time, missesFrom(time)] as const)
    .reduce((a, b) => (Math.max(...b[1]) < Math.max(...a[1]) ? b : a));
  test.info().annotations.push({
    type: 'prescription',
    description: `hand-back ${JSON.stringify(
      frames
        .slice(
          Math.max(
            0,
            frames.findIndex(
              (frame, i) => i > resized && frame.translate === 0,
            ) - 1,
          ),
        )
        .slice(0, 2)
        .map(frame => [
          Math.round(frame.shown * 100) / 100,
          frame.translate,
          frame.scroll,
        ]),
    )}; raw ${JSON.stringify(frames.slice(resized + 1).flatMap((frame, i) => (misses[i] > 0.5 ? [[i, Math.round(frame.shown * 100) / 100, frame.translate, frame.scroll, Math.round(frame.readStart - frame.time), Math.round(frame.readEnd - frame.time), frame.afterTime]] : [])))}; call ${(call - before.start).toFixed(1)} ms, start ${(after.start - before.start).toFixed(1)} ms, seed ${seed.toFixed(1)} ms; to ${to.toFixed(2)}, rest ${at}; before ${Math.max(...checked).toFixed(2)} px; frames ${frames
      .slice(resized + 1)
      .map(
        (frame, i) =>
          `${i}:${frame.afterTime == null ? 'end' : frame.afterTime.toFixed(0)}:${misses[i].toFixed(2)}`,
      )
      .join(' ')}`,
  });
  // Chromium's frames are exact to its clock, so they hold 0.5 px.
  expect(Math.max(...misses)).toBeLessThanOrEqual(resolution === 0 ? 0.5 : 1);
});

for (const rtl of [false, true]) {
  test(`a narrowing while the row settles onto its second view: the settle ends on that view's stop${rtl ? ', right to left' : ''}`, async ({
    page,
    browserName,
  }) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging', {
      rtl,
    });
    const stops = await stopsOf(scroller);
    // A drag of 70% of a view and a still lift settle the row onto its second
    // view. The page narrows the row by 30 px once two frames show the settle.
    // A resize observer made after the pager's runs right after the pager's own
    // resize work. It records where the settle that work started ends and the
    // settle's speed. It also times the rect and style reads between the
    // narrowing and that observer. It times the gap from the second view's
    // first item's rect read to its style read too.
    await scroller.evaluate(el => {
      const first = el.firstElementChild as HTMLElement;
      const viewStart = el.children[3];
      // A held child's translate runs toward the end in the row's direction.
      const toward = getComputedStyle(el).direction === 'rtl' ? -1 : 1;
      const flags = window as unknown as {
        settleEnd?: number | null;
        isLate?: boolean;
        readSpan?: number;
        pairGap?: number;
        speed?: number;
      };
      const startWidth = el.clientWidth;
      const shown: {time: number; at: number}[] = [];
      const reads: number[] = [];
      const rectAt = new Map<Element, number>();
      let pairGap = 0;
      const readRect = Element.prototype.getBoundingClientRect;
      const readStyle = window.getComputedStyle;
      const timeReads = (isOn: boolean) => {
        Element.prototype.getBoundingClientRect = isOn
          ? function (this: Element) {
              const now = performance.now();
              reads.push(now);
              rectAt.set(this, now);
              return readRect.call(this);
            }
          : readRect;
        window.getComputedStyle = isOn
          ? (element, pseudo) => {
              const now = performance.now();
              reads.push(now);
              const rectTime = rectAt.get(element);
              if (element === viewStart && rectTime != null) {
                pairGap = Math.max(pairGap, now - rectTime);
              }
              return readStyle.call(window, element, pseudo);
            }
          : readStyle;
      };
      new ResizeObserver(() => {
        if (flags.settleEnd !== undefined || el.clientWidth === startWidth) {
          return;
        }
        timeReads(false);
        const keyframes = first
          .getAnimations()
          .map(
            animation =>
              (animation.effect as KeyframeEffect | null)?.getKeyframes() ?? [],
          )
          .filter(frames => frames.some(frame => frame.translate != null))
          .at(-1);
        const last = keyframes?.at(-1);
        flags.readSpan =
          reads.length === 0 ? 0 : Math.max(...reads) - Math.min(...reads);
        flags.pairGap = pairGap;
        const [before, after] = shown.slice(-2);
        flags.speed =
          before == null || after == null || after.time === before.time
            ? Infinity
            : Math.abs((after.at - before.at) / (after.time - before.time));
        flags.settleEnd =
          last == null
            ? null
            : Math.abs(el.scrollLeft) -
              toward * (Number.parseFloat(String(last.translate)) || 0);
      }).observe(el);
      el.addEventListener(
        'touchend',
        () => {
          let settleFrames = 0;
          const watch = () => {
            shown.push({
              time: performance.now(),
              at:
                Math.abs(el.scrollLeft) -
                toward *
                  (Number.parseFloat(getComputedStyle(first).translate) || 0),
            });
            if (first.getAnimations().length > 0) {
              settleFrames += 1;
            } else if (settleFrames > 0) {
              // A starved page can show the whole settle in one frame.
              flags.isLate = true;
              return;
            }
            if (settleFrames < 2) {
              requestAnimationFrame(watch);
              return;
            }
            timeReads(true);
            el.style.width = `${el.clientWidth - 30}px`;
          };
          requestAnimationFrame(watch);
        },
        {once: true},
      );
    });
    const view = await scroller.evaluate(el => el.clientWidth);
    await swipe(page, scroller, {
      px: Math.round(view * 0.7),
      ms: 200,
      restMs: 120,
      rtl,
    });
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const flags = window as unknown as {
              settleEnd?: number | null;
              isLate?: boolean;
            };
            return flags.isLate === true || flags.settleEnd !== undefined;
          }),
        {message: 'the narrowing retargets the settle', timeout: 5000},
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => (window as unknown as {isLate?: boolean}).isLate,
      ),
      'the row still settles at the narrowing',
    ).not.toBe(true);
    const {end, readSpan, pairGap, speed} = await page.evaluate(() => {
      const flags = window as unknown as {
        settleEnd?: number | null;
        readSpan?: number;
        pairGap?: number;
        speed?: number;
      };
      return {
        end: flags.settleEnd,
        readSpan: flags.readSpan ?? Infinity,
        pairGap: flags.pairGap ?? Infinity,
        speed: flags.speed ?? Infinity,
      };
    });
    test.info().annotations.push({
      type: 'settle-end',
      description: JSON.stringify({
        end,
        stop: stops[3],
        readSpan,
        pairGap,
        speed,
      }),
    });
    expect(end, 'the narrowing plays a settle').not.toBeNull();
    // Each item's translate is read right after its rect, so the stop holds to
    // 0.002 px. WebKit resolves each read at its own time, to the millisecond:
    // the stop's item, read a tick apart, adds the settle's speed times that
    // gap. A stop of a rect plus the animator's position mixes two clocks, so
    // it misses by 0.003 px or more in WebKit too.
    let bound = 0.002;
    if (browserName === 'webkit') {
      expect(
        pairGap,
        "the stop's item's rect and style reads lie within a frame (ms)",
      ).toBeLessThanOrEqual(1000 / 60);
      bound += speed * pairGap;
    }
    expect(
      Math.abs((end ?? Infinity) - stops[3]),
      "the settle ends on the second view's stop (px)",
    ).toBeLessThanOrEqual(bound);
    await settled(scroller);
    expect(await offset(scroller)).toBeCloseTo(stops[3], 0);
  });
}

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
 * Drags the row past half a view, toward the start with `back`. Then it
 * presses the edge button while the paging still holds the row past `until`.
 * True if it was held.
 */
async function pressInSettle(
  page: Page,
  scroller: Locator,
  until: number,
  back = false,
  beforeThaw?: () => Promise<void>,
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
  await logShown(scroller);
  // A drag past half a view that rests before the lift releases at 0, so the
  // row settles on the nearest page, the next one. A flick's release reads
  // its speed from when the touches arrive, and a starved page receives
  // them late.
  const view = await scroller.evaluate(el => el.clientWidth);
  await swipe(page, scroller, {
    px: Math.round(view * 0.6),
    ms: 240,
    restMs: 100,
    rtl: back,
  });
  // The scene stops in the first frame where the paging holds the row past
  // `until`. A read from this process comes a round trip late, and a loaded
  // runner can miss the whole pass in that time. A settle that hands the row
  // back first fails here, by name.
  await freezeWhenHeldIn(
    page,
    back ? -Infinity : until,
    back ? until : Infinity,
  );
  const held = await isTakenOver(scroller);
  await page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await beforeThaw?.();
  await thawPage(page);
  return held;
}

type Shown = {t: number; held: boolean; shown: number};

/**
 * Logs, on every real frame from now on, where the row shows and whether the
 * paging holds it. The freeze checks the same frames.
 */
async function logShown(scroller: Locator) {
  await scroller.evaluate(el => {
    const log: Shown[] = [];
    (window as unknown as {__shownLog: Shown[]}).__shownLog = log;
    const freeze = (
      window as unknown as {
        __harnessFreeze?: {frame: (callback: () => void) => number};
      }
    ).__harnessFreeze;
    const frame = (callback: () => void) =>
      freeze == null ? requestAnimationFrame(callback) : freeze.frame(callback);
    const items = Array.from(el.children) as HTMLElement[];
    const read = () => {
      log.push({
        t: performance.now(),
        held: items.some(item => item.style.translate !== ''),
        shown:
          el.getBoundingClientRect().left -
          items[0].getBoundingClientRect().left,
      });
      if (log.length < 2000) {
        frame(read);
      }
    };
    frame(read);
  });
}

/**
 * Freezes the scene in the first real frame where the paging holds the row
 * shown in `[from, to)`. A row that passed that window between two frames
 * more than the starvation gap apart was starved of frames, which fails by
 * name. Needs `logShown` first.
 */
async function freezeWhenHeldIn(page: Page, from: number, to: number) {
  try {
    await freezePageWhen(
      page,
      ({lo, hi}) => {
        const el = document.querySelector('[data-press-in-settle]');
        const items = Array.from(el?.children ?? []) as HTMLElement[];
        if (el == null || items.length === 0) {
          return false;
        }
        const shown =
          el.getBoundingClientRect().left -
          items[0].getBoundingClientRect().left;
        const isHeld = items.some(item => item.style.translate !== '');
        return isHeld && shown >= lo && shown < hi;
      },
      {lo: from, hi: to},
    );
  } catch (error) {
    const log = await page.evaluate(
      () => (window as unknown as {__shownLog: Shown[]}).__shownLog,
    );
    const side = ({shown}: Shown) => (shown < from ? -1 : shown >= to ? 1 : 0);
    // The row crossed the window between a frame that held it short of the
    // window and the next, which shows it past or handed back.
    for (let i = 1; i < log.length; i++) {
      const [before, after] = [log[i - 1], log[i]];
      const isCrossed =
        before.held &&
        side(before) !== 0 &&
        (side(after) === -side(before) ||
          (!after.held && side(after) !== side(before)));
      if (isCrossed && after.t - before.t > FRAME_STARVATION_MS) {
        requireFrames([before, after], {
          min: 1,
          during: 'the row held in its freeze window',
          where: sample => sample.held && side(sample) === 0,
        });
      }
    }
    throw error;
  }
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
  // At least one stop past the drag's own target.
  expect(at).toBeGreaterThan(stops[4] - 0.5);
  expect(Math.min(...stops.map(stop => Math.abs(stop - at)))).toBeLessThan(1);
});

/**
 * How far into an edge button's move the touch lands, ms on the scene's
 * clock. The case needs the catch short of halfway to the move's target.
 */
const CATCH_INTO_MOVE_MS = 100;

for (const holdMs of [150, 40]) {
  test(`during an edge button's move, a ${holdMs} ms touch on the row stops it where it shows, and the row rests on a stop`, async ({
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
    const driver = await touchDriver(page);
    // The page handles the touch on the scene's clock, a set time into the
    // edge button's move, however late this process sends it. A touch that
    // reaches the page after that time fails by name.
    let hold: InputHold | null = null;
    expect(
      await pressInSettle(page, scroller, stops[3] * 0.9, false, async () => {
        hold = await holdInputUntil(page, {
          afterResumeMs: CATCH_INTO_MOVE_MS,
          on: ['touchstart', 'pointerdown'],
        });
      }),
    ).toBe(true);
    if (hold == null) {
      throw new Error('no hold');
    }
    const caught: InputHold = hold;
    await caught.resumed();
    await driver.play(
      tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs}),
    );
    await caught.landed();
    const at = await restingOffset(scroller);
    expect(Math.min(...stops.map(stop => Math.abs(stop - at)))).toBeLessThan(1);
    // A finger stops the pager's own move at the touch, short of its target.
    expect(Math.abs(at - stops[5])).toBeGreaterThan(1);
  });
}

// The touch that stops a scroll view never reaches its content (UIKit).
test.describe("a touch that lands on a flick's settle", () => {
  /** Counts clicks that reach the row's items. */
  async function countItemClicks(scroller: Locator) {
    await scroller.evaluate(el => {
      const w = window as unknown as {__itemClicks: number};
      w.__itemClicks = 0;
      el.addEventListener('click', () => {
        w.__itemClicks += 1;
      });
    });
    return async () =>
      scroller.evaluate(
        () => (window as unknown as {__itemClicks: number}).__itemClicks,
      );
  }

  /** Flicks the row from rest and waits until the paging holds it. */
  async function flickToSettle(page: Page, scroller: Locator) {
    await swipe(page, scroller, {px: 80, ms: 80});
    await expect
      .poll(async () => isTakenOver(scroller), {intervals: [5]})
      .toBe(true);
  }

  test('a tap during the settle clicks no item', async ({page}) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const clicks = await countItemClicks(scroller);
    await flickToSettle(page, scroller);
    const driver = await touchDriver(page);
    // The engine's own tap path: WebKit synthesises a click only from it.
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    await settled(scroller);
    expect(await clicks()).toBe(0);
  });

  test('a 150 ms hold during the settle clicks no item', async ({page}) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const clicks = await countItemClicks(scroller);
    await flickToSettle(page, scroller);
    const driver = await touchDriver(page);
    await driver.play(
      tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs: 150}),
    );
    await settled(scroller);
    // WebKit synthesises a click only from its own tap path, not from a raw
    // touch sequence (harness README, engine limits); Chromium does from both.
    if (driver.engine === 'chromium') {
      expect(await clicks()).toBe(0);
    }
  });

  test('a tap on the resting row still clicks the item', async ({page}) => {
    const {scroller} = await open(page, 'snap-paging-three-up', 'paging');
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const clicks = await countItemClicks(scroller);
    const driver = await touchDriver(page);
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
    await expect.poll(clicks).toBe(1);
  });
});

test.describe('with a finger and a mouse', () => {
  test.use({hasTouch: true, isMobile: false});

  test('native snap skips a stop within half its step of the end: ArrowLeft at the end moves at least a full step', async ({
    page,
  }) => {
    const scroller = await openSplitEnd(page, 'paging');
    const stops = await stopsOf(scroller);
    await scroller.evaluate(el => {
      el.scrollTo({left: el.scrollWidth - el.clientWidth, behavior: 'instant'});
    });
    await expect
      .poll(async () => offset(scroller), {
        message: 'the row starts at its end',
        timeout: 5000,
      })
      .toBeCloseTo(await travel(scroller), 0);
    await scroller.focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => offset(scroller), {
        message: 'ArrowLeft rests a full step back or more',
        timeout: 5000,
      })
      .toBeLessThan(stops[3] + 0.5);
  });

  test('an item added at rest gives the stop before the end back to native snap: ArrowRight steps onto it', async ({
    page,
  }) => {
    const scroller = await openSplitEnd(page, 'paging');
    await expect
      .poll(async () => fifthAlign(scroller), {
        message: "native snap skips the fifth item's stop",
        timeout: 5000,
      })
      .toBe('none');
    await addItem(scroller);
    await expect
      .poll(async () => fifthAlign(scroller), {
        message: "native snap takes the fifth item's stop back",
        timeout: 5000,
      })
      .toMatch(/^start/);
    const stops = await stopsOf(scroller);
    await scroller.evaluate((el, left) => {
      el.scrollTo({left, behavior: 'instant'});
    }, stops[3]);
    await expect
      .poll(async () => offset(scroller), {
        message: 'the row starts at the fourth item',
        timeout: 5000,
      })
      .toBeCloseTo(stops[3], 0);
    await scroller.focus();
    await page.keyboard.press('ArrowRight');
    await expect
      .poll(async () => offset(scroller), {
        message: "ArrowRight rests on the fifth item's stop",
        timeout: 5000,
      })
      .toBeCloseTo(stops[4], 0);
  });

  test('native snap skips a stop within half its step of the end: a wheel back from the end moves at least a full step', async ({
    page,
  }) => {
    const scroller = await openSplitEnd(page, 'paging');
    const stops = await stopsOf(scroller);
    await scroller.evaluate(el => {
      el.scrollTo({left: el.scrollWidth - el.clientWidth, behavior: 'instant'});
    });
    await expect
      .poll(async () => offset(scroller), {
        message: 'the row starts at its end',
        timeout: 5000,
      })
      .toBeCloseTo(await travel(scroller), 0);
    await scroller.hover();
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, -150);
    await page.keyboard.up('Shift');
    await expect
      .poll(async () => offset(scroller), {
        message: 'the wheel rests a full step back or more',
        timeout: 5000,
      })
      .toBeLessThan(stops[3] + 0.5);
  });

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

test('an edge press after a drag back near the end shows no space past the last item', async ({
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
  // Once the drag back widens the overflow by its translate.
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
