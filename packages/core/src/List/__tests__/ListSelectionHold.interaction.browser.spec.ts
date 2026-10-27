// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListSelectionHold.interaction.browser.spec.ts
 * @input The built List "Selection Hold" story (buttons and a slider standing
 *   in for a navigation stack), real touch input, the interaction harness,
 *   and the in-transition deselect clock (motion/uikit/list.ts)
 * @output Interaction and animation proofs for a row kept selected through a
 *   push: the tapped row stays selected after its press would have faded; a
 *   pop deselects it on UIKit's 350 ms linear curve, then the row's control
 *   has focus, with the keyboard ring only after a keyboard's pop; a scrub
 *   sets the highlight from the progress and a cancel selects the row again
 *   at once; the slider follows a running deselect, so a finger takes it over
 *   from the value on screen; the deselect keeps advancing while the
 *   main thread is blocked (judged on the frames the screencast delivers,
 *   in both engines, whatever their rate), with no Layout or Paint; under
 *   reduced motion
 *   the deselect cross-fades, opacity only, within 200 ms
 *   (`design:reduced-motion`); a storyboard of the deselect
 * @position Interaction evidence for List/selectionHold.ts on Item rows, in
 *   the one touch model (./touchStory.ts), with an Android case that holds the
 *   same way and a mouse case where there is no
 *   hold
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  blockMainThread,
  castStoryboard,
  compareCurve,
  countBetween,
  holdAnimations,
  releaseAnimations,
  seekAnimations,
  startScreencast,
  timeline,
  touchDriver,
  traceRendering,
  waitForAnimation,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {openStory} from './touchStory';
import {expectReducedMotionCrossFade} from './reducedMotion';
import {list} from '../../motion/uikit/list';
import {samplePixel} from './rowPixels';

const storybook = withStorybook(test);

const STORY = 'core-list--selection-hold';
const POP_MS = list.deselect.navigationPopMs;
/** Highlight = 1 − progress; the in-transition deselect is linear. */
const expectedHighlight = (t: number) =>
  1 - Math.min(1, Math.max(0, t / POP_MS));

const row = (page: Page) =>
  page.locator('[data-astryx-pressable]').filter({hasText: 'Sent'}).first();

/** The press layer's strength: 0 while the row has no layer box (at rest). */
const layerOpacity = async (target: Locator) =>
  target.evaluate(el => {
    const before = getComputedStyle(el, '::before');
    return before.content === 'none' || before.content === 'normal'
      ? 0
      : Number(before.opacity);
  });

const pressState = async (target: Locator) =>
  target.evaluate(el => el.getAttribute('data-astryx-press'));

/** Taps "Sent" with a finger: the activation pushes, and the row is held. */
async function push(page: Page) {
  await openStory(page, storybook(), STORY);
  const target = row(page);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const driver = await touchDriver(page);
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect(page.getByTestId('pushed-screen')).toBeVisible();
  return {
    target,
    probe: {
      x: Math.round(box.x + box.width - 3),
      y: Math.round(box.y + box.height / 2),
    },
  };
}

test('a row tapped again during its slow deselect is held again, with nothing marking it deselecting', async ({
  page,
}) => {
  const {target} = await push(page);
  await page.getByRole('button', {name: 'Back, slowly'}).click();
  const deselecting = async () =>
    target.evaluate(el => el.hasAttribute('data-astryx-deselecting'));
  await expect.poll(deselecting).toBe(true);
  // A finger taps the row again mid-deselect: the new push holds it.
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const driver = await touchDriver(page);
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await expect.poll(async () => pressState(target)).toBe('held');
  // Fully held: its dividers stay hidden, as for the first hold.
  expect(await deselecting()).toBe(false);
  await expect.poll(async () => layerOpacity(target)).toBe(1);
});

test("a busy first frame delays the pop's deselect instead of skipping into it", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'WebKit starts an animation created just before a block at its last frame time (motion/animator.ts, known limits)',
  );
  const {target} = await push(page);
  expect(await layerOpacity(target)).toBe(1);
  // Back's handler starts the deselect; 150 ms of script then hold the main
  // thread before the first frame. The deselect starts when the browser
  // commits it, so the first frame due after the block shows it at most one
  // frame in.
  const first = await target.evaluate(
    async row =>
      new Promise<number>(resolve => {
        document.addEventListener(
          'click',
          () => {
            const until = performance.now() + 150;
            while (performance.now() < until) {
              // Busy: the main thread is held.
            }
            // The first frame due after the block: a frame scheduled
            // before it runs with that earlier time.
            const read = () => {
              if ((document.timeline.currentTime as number) < until) {
                requestAnimationFrame(read);
                return;
              }
              resolve(Number(getComputedStyle(row, '::before').opacity));
            };
            requestAnimationFrame(read);
          },
          {once: true},
        );
        [...document.querySelectorAll('button')]
          .find(button => button.textContent?.trim() === 'Back')
          ?.click();
      }),
  );
  // At most one frame into the 350 ms deselect (1 − 17/350 ≈ 0.95); a start
  // pinned before the block would show it about half done.
  expect(first).toBeGreaterThan(0.9);
  await expect.poll(async () => layerOpacity(target)).toBe(0);
});

test('Android: the same hold; Back deselects the row (one touch model)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Android is Chromium');
  const {target} = await push(page);
  expect(await pressState(target)).toBe('held');
  expect(await layerOpacity(target)).toBe(1);
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await expect(page.getByTestId('pushed-screen')).toHaveCount(0);
  await expect.poll(async () => layerOpacity(target)).toBe(0);
});

test('a mouse: no hold; the press releases and Back just pops', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const target = row(page);
    await expect(target).toBeVisible();
    await target.click();
    await expect(page.getByTestId('pushed-screen')).toBeVisible();
    expect(await pressState(target)).toBeNull();
    await page.getByRole('button', {name: 'Back', exact: true}).click();
    await expect(page.getByTestId('pushed-screen')).toHaveCount(0);
    expect(await pressState(target)).toBeNull();
  } finally {
    await context.close();
  }
});

test('the tapped row stays selected while the pushed screen covers it', async ({
  page,
}) => {
  const {target} = await push(page);
  // Well past the press's own release clock: the hold keeps it selected.
  await page.waitForTimeout(list.highlight.releaseMs + 300);
  expect(await pressState(target)).toBe('held');
  expect(await layerOpacity(target)).toBe(1);
});

test('the dividers around a held row stay hidden while it is covered, return when the deselect begins, and hide again on a cancel', async ({
  page,
}) => {
  const {target} = await push(page);
  const dividers = async () =>
    page
      .locator('li[data-astryx-pressable]')
      .evaluateAll(elements =>
        elements.map(el => getComputedStyle(el).borderBottomColor),
      );
  const hidden = 'rgba(0, 0, 0, 0)';
  // Sent is the second row: its own divider and Inbox's above it.
  await page.waitForTimeout(list.highlight.releaseMs + 300);
  const covered = await dividers();
  expect(covered[0]).toBe(hidden);
  expect(covered[1]).toBe(hidden);
  // An interactive pop begins: both come back in its first frame while the
  // highlight is still mostly on.
  await page.getByLabel('Pop progress').fill('0.1');
  await expect.poll(async () => layerOpacity(target)).toBeCloseTo(0.9, 2);
  const deselecting = await dividers();
  expect(deselecting[0]).not.toBe(hidden);
  expect(deselecting[1]).not.toBe(hidden);
  // A cancel selects the row again, and the dividers hide again.
  await page.getByRole('button', {name: 'Cancel pop'}).click();
  await expect.poll(async () => layerOpacity(target)).toBe(1);
  const reselected = await dividers();
  expect(reselected[0]).toBe(hidden);
  expect(reselected[1]).toBe(hidden);
  // The pop: back in its first frame, and they stay once it ends.
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await holdAnimations(page, target);
  await seekAnimations(page, 0);
  const popStart = await dividers();
  expect(popStart[0]).not.toBe(hidden);
  expect(popStart[1]).not.toBe(hidden);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => pressState(target)).toBeNull();
  expect(await dividers()).toEqual(popStart);
});

test('a pop deselects the row on the in-transition curve, then its control has focus', async ({
  page,
}, testInfo) => {
  const {target} = await push(page);
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  const held = await holdAnimations(page, target);
  // The deselect on the row's layer. (The motion foundation keeps a
  // pseudo-element's animation in effect past the curve, holding its end
  // value until script runs: only the first POP_MS are the curve.)
  const deselect = held.find(a => a.target?.startsWith('li'));
  expect(deselect, JSON.stringify(held)).toBeDefined();
  const samples: {t: number; value: number}[] = [];
  for (const t of timeline(POP_MS)) {
    await seekAnimations(page, t);
    samples.push({t, value: await layerOpacity(target)});
  }
  await releaseAnimations(page, {finish: true});
  const comparison = compareCurve(samples, expectedHighlight, 0.01);
  await writeEvidence(
    'curves/list-selection-hold-pop',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {popMs: POP_MS, held, samples, comparison},
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(
    comparison.maxError,
    JSON.stringify(comparison.worst),
  ).toBeLessThanOrEqual(0.01);
  // The pop completed: the row is deselected and its own control has focus,
  // where a screen reader lands back, with no keyboard ring after a pointer's
  // pop (UIKit draws none for a finger).
  await expect.poll(async () => pressState(target)).toBeNull();
  expect(await layerOpacity(target)).toBe(0);
  expect(await target.evaluate(el => el.contains(document.activeElement))).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.activeElement?.matches(':focus-visible') ?? null,
    ),
  ).toBe(false);
});

test("under reduced motion a pop's deselect cross-fades: opacity only, within 200 ms", async ({
  page,
}) => {
  // design:reduced-motion DR1 and DR2, under a finger.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {target} = await push(page);
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  const held = await holdAnimations(page, target);
  expectReducedMotionCrossFade(held);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => layerOpacity(target)).toBe(0);
});

test('a pop from the keyboard returns focus to the row with the keyboard ring', async ({
  page,
}) => {
  const {target} = await push(page);
  const back = page.getByRole('button', {name: 'Back', exact: true});
  await back.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => pressState(target)).toBeNull();
  await expect(page.getByTestId('pushed-screen')).toHaveCount(0);
  expect(await target.evaluate(el => el.contains(document.activeElement))).toBe(
    true,
  );
  expect(
    await page.evaluate(
      () => document.activeElement?.matches(':focus-visible') ?? null,
    ),
  ).toBe(true);
});

test('a scrub sets the highlight from the progress; a cancel selects the row again at once', async ({
  page,
}) => {
  const {target} = await push(page);
  await page.getByLabel('Pop progress').fill('0.4');
  await expect.poll(async () => layerOpacity(target)).toBeCloseTo(0.6, 2);
  await page.getByLabel('Pop progress').fill('0.7');
  await expect.poll(async () => layerOpacity(target)).toBeCloseTo(0.3, 2);
  await page.getByRole('button', {name: 'Cancel pop'}).click();
  // Back to selected once the cancel settles, and still held for the next pop.
  await expect.poll(async () => layerOpacity(target)).toBe(1);
  expect(await pressState(target)).toBe('held');
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  await expect.poll(async () => pressState(target)).toBeNull();
});

test('while the deselect runs, the slider shows where it is, so a finger takes it over from the value on screen', async ({
  page,
}) => {
  const {target} = await push(page);
  await page.getByRole('button', {name: 'Back, slowly'}).click();
  // About a third of the way through the slow, linear 3 s deselect.
  await page.waitForTimeout(1000);
  const slider = page.getByLabel('Pop progress');
  const read = async () => {
    const [value, opacity] = await Promise.all([
      slider.evaluate(el => Number((el as HTMLInputElement).value)),
      layerOpacity(target),
    ]);
    return {value, opacity};
  };
  const {value, opacity} = await read();
  // The thumb sits at the deselect's progress (1 − the highlight), not at 0,
  // where a finger landing on it would snap the highlight back to full.
  expect(value).toBeGreaterThan(0.15);
  expect(value).toBeLessThan(0.85);
  expect(value).toBeCloseTo(1 - opacity, 1);
  // And it keeps following.
  await page.waitForTimeout(400);
  const later = await read();
  expect(later.value).toBeGreaterThan(value);
  expect(later.value).toBeCloseTo(1 - later.opacity, 1);
});

/**
 * Pops a held row and blocks the main thread for 600 ms while its deselect
 * runs, capturing the frames the screencast delivers. The proof is judged on
 * the delivered frames inside the block, up to the deselect's own end (the
 * animation holds its end value past it, and the Linux WebKit build hands an
 * animation that ends inside a block back to its last committed value), and
 * counts none: a loaded machine's screencast delivers fewer frames than the
 * compositor presents, so a missing frame is not a skipped one.
 */
async function popThroughBlock(page: Page, everyNthFrame = 1) {
  const {target, probe} = await push(page);
  const cast = await startScreencast(page, {everyNthFrame});
  await page.waitForTimeout(100);
  await page.getByRole('button', {name: 'Back', exact: true}).click();
  const [started] = await waitForAnimation(target, {minProgressMs: 16});
  const deselect = {from: started.from, to: started.from + POP_MS};
  const block = await blockMainThread(page, 600);
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  const pixels = await samplePixel(page, frames, probe);
  const selected = pixels[0].value;
  const after = pixels.at(-1)?.value ?? 255;
  const highlight = (v: number) => (after - v) / (after - selected);
  const end = Math.min(block.to, deselect.to) - 10;
  const highlights = pixels
    .filter(p => p.t > block.from && p.t <= end)
    .map(p => ({
      t: +(p.t - block.from).toFixed(1),
      highlight: +highlight(p.value).toFixed(3),
    }));
  return {
    frames,
    pixels,
    block,
    deselect,
    selected,
    after,
    highlight,
    highlights,
  };
}

/**
 * The deselect advanced while script could not run: selected before the pop
 * and deselected after; inside the block, two delivered frames at least (a
 * change needs two), each as far along as the one before it, and the row well
 * lighter by the end.
 */
function expectAdvancedThroughBlock({
  selected,
  after,
  highlights,
}: Awaited<ReturnType<typeof popThroughBlock>>): void {
  const summary = JSON.stringify(highlights);
  expect(after - selected).toBeGreaterThan(10);
  expect(highlights.length, summary).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < highlights.length; i++) {
    expect(highlights[i].highlight, summary).toBeLessThanOrEqual(
      highlights[i - 1].highlight + 0.01,
    );
  }
  const last = highlights.at(-1);
  expect(last, summary).toBeDefined();
  expect(highlights[0].highlight, summary).toBeGreaterThan(
    (last?.highlight ?? 1) + 0.3,
  );
}

test('the deselect keeps advancing while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const run = await popThroughBlock(page);
  const {frames, block, deselect, selected, after, highlight, highlights} = run;
  await writeEvidence(
    'busy-main-thread/list-selection-hold-pop',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, deselect, selected, after, highlights},
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, frames, {
    name: `list-selection-hold-pop-busy-main-thread-${testInfo.project.name}`,
    zero: block.from,
    from: deselect.from - 40,
    to: deselect.to + 40,
    columns: 8,
    cellScale: 0.45,
    data: t => {
      const p = run.pixels.find(f => f.t === t);
      return {highlight: p == null ? -1 : +highlight(p.value).toFixed(3)};
    },
  });
  await film.write(testInfo, {block, deselect});
  expectAdvancedThroughBlock(run);
});

test('the same proof holds on a screencast that delivers one frame in four', async ({
  page,
}) => {
  // A loaded machine's screencast keeps a fraction of the frames the
  // compositor presents; the verdict must not depend on how many arrive.
  expectAdvancedThroughBlock(await popThroughBlock(page, 4));
});

test('the deselect does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {target} = await push(page);
  let deselect = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    // Back is activated without a pointer press: on a touch-first device a
    // mouse press paints Back's own press, and the trace measures the row's
    // deselect alone.
    await page
      .getByRole('button', {name: 'Back', exact: true})
      .dispatchEvent('click');
    const [started] = await waitForAnimation(target);
    // The curve's own window (the animation holds its end value past it).
    deselect = {from: started.from, to: started.from + POP_MS};
    await page.waitForTimeout(POP_MS + 100);
  });
  const during = countBetween(trace, deselect.from + 30, deselect.to - 30);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
});

test(
  'storyboard: a held row deselected by a pop',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {target} = await push(page);
    const box = await target.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    await page.getByRole('button', {name: 'Back', exact: true}).click();
    const {storyboard} = await animationStoryboard(page, {
      name: 'list-selection-hold-pop',
      clip: {x: 0, y: box.y - 8, width: 402, height: box.height + 16},
      scope: target,
      times: [0, 50, 100, 175, 250, 300, POP_MS],
      columns: 7,
      cellScale: 0.5,
      measure: async () => ({opacity: await layerOpacity(target)}),
    });
    await releaseAnimations(page, {finish: true});
    await storyboard.write(testInfo);
  },
);
