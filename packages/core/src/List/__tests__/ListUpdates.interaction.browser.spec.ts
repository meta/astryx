// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListUpdates.interaction.browser.spec.ts
 * @input The built List "Animated Changes" story in the touch phone context,
 *   the interaction harness and the table spring from the UIKit constants
 *   table (motion/uikit/list.ts)
 * @output Interaction and animation proofs for a List with `hasAnimatedChanges`:
 *   after a removal the rows below start where they were and slide up on the
 *   table spring; after an insert the rows below slide down and the new row
 *   fades in once they have cleared its band; a reorder moves rows to their
 *   new places, the row crossing the others riding above them with the
 *   surface behind it; content after the list takes its new place at once,
 *   never translated, a fixed element inside it staying fixed, and after a
 *   removal the rows sliding up are clipped to the list's box; a change
 *   while rows still move makes no jump; under reduced motion a removal, an
 *   insert and a reorder cross-fade, opacity only, within 200 ms
 *   (`design:reduced-motion`); a
 *   theme's table spring times it; a removed row collapses in place, its
 *   bottom edge on the next row's top every frame, and a row swiped away
 *   collapses the same way while the rows below close the gap, as it was on
 *   screen (a compositor animation on its parts kept); the rows keep
 *   moving while the main thread is blocked, with no Layout or Paint; a
 *   storyboard of a removal
 * @position Interaction evidence for List/useListUpdateMotion.ts under a
 *   finger (./touchStory.ts), with an Android case that moves the same way and
 *   a mouse case where the rows land in place with the commit
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  countBetween,
  holdAnimations,
  markElement,
  releaseAnimations,
  seekAnimations,
  startScreencast,
  timeline,
  trackMarker,
  traceRendering,
  waitForAnimation,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {list} from '../../motion/uikit/list';
import {openStory} from './touchStory';
import {expectReducedMotionCrossFade} from './reducedMotion';
import {blockBehindBeacon, installBeacon, sampleVideoPoints} from './rowPixels';

const storybook = withStorybook(test);

const STORY = 'core-list--animated-changes';
const SPRING = toSpring(list.update.tableSpring);
const progress = (t: number) =>
  solveSpring(SPRING, {from: 0, to: 1}).value(t / 1000);
const SETTLE_MS =
  solveSpring(SPRING, {from: 0, to: 1}).settleTime(0.001) * 1000;

// A row of the list, never a removed row's ghost (or the row inside it).
const row = (page: Page, label: string) =>
  page
    .locator(
      '#storybook-root li:not([data-astryx-leaving], [data-astryx-leaving] li)',
    )
    .filter({hasText: label})
    .first();

const translateY = async (element: Locator) =>
  element.evaluate(el => {
    const value = getComputedStyle(el).translate;
    if (value === 'none' || value === '') {
      return 0;
    }
    const [, y = '0px'] = value.split(' ');
    return Number.parseFloat(y);
  });

const opacity = async (element: Locator) =>
  element.evaluate(el => Number(getComputedStyle(el).opacity));

async function open(page: Page) {
  await openStory(page, storybook(), STORY);
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'list changes move under a finger only');
  await expect(row(page, 'Spam')).toBeVisible();
}

async function press(page: Page, name: string) {
  await page.getByRole('button', {name}).click();
}

test('Android: a removal moves the rows the same way (one touch model)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Android is Chromium');
  await openStory(page, storybook(), STORY);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await expect(row(page, 'Spam')).toBeVisible();
  const drafts = row(page, 'Drafts');
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  // The row below starts where it was and springs home, as on iOS.
  expect(
    await drafts.evaluate(el => el.getAnimations().length),
  ).toBeGreaterThan(0);
  await expect.poll(async () => translateY(drafts)).toBe(0);
});

test('a mouse: a removal and an insert land in place with the commit', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 900},
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await expect(row(page, 'Spam')).toBeVisible();
    const drafts = row(page, 'Drafts');
    const button = page.getByRole('button', {name: 'Remove the second row'});
    await press(page, 'Remove the second row');
    await expect(row(page, 'Sent')).toHaveCount(0);
    // Nothing animates: the rows and the content below are already in place.
    const motions = async (element: Locator) =>
      element.evaluate(el => el.getAnimations().length);
    expect(await translateY(drafts)).toBe(0);
    expect(await motions(drafts)).toBe(0);
    expect(await translateY(button)).toBe(0);
    expect(await motions(button)).toBe(0);
    await press(page, 'Insert a row second');
    const inserted = page.locator('#storybook-root li').nth(1);
    await expect(inserted).toBeVisible();
    expect(await opacity(inserted)).toBe(1);
    expect(await motions(inserted)).toBe(0);
  } finally {
    await context.close();
  }
});

test('a removal: the rows below start where they were and slide up on the table spring', async ({
  page,
}, testInfo) => {
  await open(page);
  const drafts = row(page, 'Drafts');
  const layoutTop = async () =>
    drafts.evaluate(el => (el as HTMLElement).offsetTop);
  const before = await layoutTop();
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  const after = await layoutTop();
  const gap = await drafts.evaluate(el => {
    // The row above, never a removed row's ghost.
    let previous = el.previousElementSibling as HTMLElement | null;
    while (previous?.hasAttribute('data-astryx-leaving') === true) {
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    return previous == null
      ? 0
      : (el as HTMLElement).offsetTop - previous.offsetTop;
  });
  const samples: {t: number; value: number}[] = [];
  for (const t of timeline(SETTLE_MS)) {
    await seekAnimations(page, t);
    samples.push({t, value: await translateY(drafts)});
  }
  await releaseAnimations(page, {finish: true});
  const expected = (t: number) => gap * (1 - progress(t));
  const comparison = compareCurve(samples, expected, 0.5);
  await writeEvidence(
    'curves/list-update-removal',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {spring: list.update.tableSpring, gap, samples, comparison},
        null,
        2,
      ),
    },
    testInfo,
  );
  // On screen at its old place first: one row lower than its new layout.
  expect(samples[0].value).toBeCloseTo(gap, 0);
  // Layout moved it up by one row; the motion put it back on screen.
  expect(before - after).toBeCloseTo(gap, 0);
  expect(comparison.maxError, JSON.stringify(comparison.worst)).toBeLessThan(
    0.5,
  );
  await expect.poll(async () => translateY(drafts)).toBe(0);
});

test("a removal: the removed row collapses in place, its bottom edge on the next row's top every frame, then goes", async ({
  page,
}) => {
  await open(page);
  const sent = row(page, 'Sent');
  const before = await sent.boundingBox();
  if (before == null) {
    throw new Error('no row');
  }
  await press(page, 'Remove the second row');
  await holdAnimations(page);
  const ghost = page.locator('#storybook-root [data-astryx-leaving]');
  await expect(ghost).toHaveCount(1);
  expect(await ghost.getAttribute('aria-hidden')).toBe('true');
  const inside = ghost.locator('li').filter({hasText: 'Sent'});
  const drafts = row(page, 'Drafts');
  const heights: number[] = [];
  for (const t of [0, 40, 80, 120, 200, 300]) {
    await seekAnimations(page, t);
    const [clip, content, next] = await Promise.all([
      ghost.evaluate(el => el.getBoundingClientRect().toJSON() as DOMRect),
      inside.boundingBox(),
      drafts.boundingBox(),
    ]);
    if (content == null || next == null) {
      throw new Error('no box');
    }
    // Its content stays where it was while its bottom edge rises with the
    // next row's top: one motion, as UIKit collapses a deleted cell.
    expect(content.y, `t=${t}`).toBeCloseTo(before.y, 0);
    expect(clip.bottom, `t=${t}`).toBeCloseTo(next.y, 0);
    heights.push(clip.bottom - before.y);
  }
  expect(heights[0]).toBeCloseTo(before.height, 0);
  for (let i = 1; i < heights.length; i++) {
    expect(heights[i], JSON.stringify(heights)).toBeLessThan(heights[i - 1]);
  }
  await releaseAnimations(page, {finish: true});
  await expect(ghost).toHaveCount(0);
});

test('an insert: the rows below slide down, and the new row fades in once they have cleared its band', async ({
  page,
}) => {
  await open(page);
  await press(page, 'Insert a row second');
  const inserted = row(page, 'Folder 1');
  await expect(inserted).toBeVisible();
  await holdAnimations(page);
  const sent = row(page, 'Sent');
  const height = await inserted.evaluate(
    el => el.getBoundingClientRect().height,
  );
  await seekAnimations(page, 0);
  expect(await translateY(sent)).toBeLessThan(-1);
  // While Sent's label is within half a row of the new row's (Sent starts
  // in the new row's band), the new row shows nothing: rows have no
  // background, and the two labels would overlap. Then it fades in.
  let crossing = 0;
  let previous = 0;
  for (let t = 0; t <= SETTLE_MS; t += 10) {
    await seekAnimations(page, t);
    const y = await translateY(sent);
    const shown = await opacity(inserted);
    if (y < -height / 2 - 0.5) {
      expect(shown, `t=${t}`).toBeCloseTo(0, 3);
      crossing += 1;
    }
    expect(shown, `t=${t}`).toBeGreaterThanOrEqual(previous - 0.001);
    previous = shown;
  }
  expect(crossing).toBeGreaterThan(2);
  await seekAnimations(page, SETTLE_MS * 0.6);
  expect(await opacity(inserted)).toBeGreaterThan(0.5);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => opacity(inserted)).toBe(1);
  await expect.poll(async () => translateY(sent)).toBe(0);
});

test('a reorder: each row slides from its old place to its new one', async ({
  page,
}) => {
  await open(page);
  const spam = row(page, 'Spam');
  const inbox = row(page, 'Inbox');
  await press(page, 'Move the last row first');
  await holdAnimations(page);
  await seekAnimations(page, 0);
  // Spam starts four rows down (where it was) and Inbox one row up.
  expect(await translateY(spam)).toBeGreaterThan(1);
  expect(await translateY(inbox)).toBeLessThan(-1);
  // Spam crosses the rows moving down: it rides above them with the list's
  // surface behind it, so their labels never show through each other.
  const paint = async (element: Locator) =>
    element.evaluate(node => {
      // The surface: an inset shadow across the row's padding box.
      const shadow = getComputedStyle(node).boxShadow;
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--color-background-surface)';
      node.parentElement?.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        zIndex: getComputedStyle(node).zIndex,
        layer:
          shadow === 'none' || !shadow.includes('inset')
            ? null
            : (/^rgba?\([^)]*\)/.exec(shadow)?.[0] ?? shadow),
        surface,
      };
    });
  await seekAnimations(page, SETTLE_MS / 4);
  const travelling = await paint(spam);
  expect(travelling.zIndex).toBe('1');
  expect(travelling.layer).toBe(travelling.surface);
  expect((await paint(inbox)).layer).toBeNull();
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => translateY(spam)).toBe(0);
  await expect.poll(async () => translateY(inbox)).toBe(0);
  // At rest it is a row like the others again.
  await expect.poll(async () => (await paint(spam)).layer).toBeNull();
  expect((await paint(spam)).zIndex).toBe('auto');
});

test('content after the list takes its place by layout at once, with no translate, and a fixed element inside it stays fixed', async ({
  page,
}) => {
  await open(page);
  const button = page.getByRole('button', {name: 'Insert a row second'});
  const spam = row(page, 'Spam');
  // More content after the list, holding a position: fixed element, which
  // stays where the viewport puts it as long as nothing transforms its
  // ancestors.
  await button.evaluate(el => {
    const after = document.createElement('div');
    after.style.height = '20px';
    const fixed = document.createElement('div');
    fixed.setAttribute('data-test-fixed', '');
    fixed.style.cssText =
      'position: fixed; top: 10px; left: 10px; width: 8px; height: 8px;';
    after.append(fixed);
    el.insertAdjacentElement('afterend', after);
  });
  const fixedTop = async () =>
    page
      .locator('[data-test-fixed]')
      .evaluate(el => el.getBoundingClientRect().top);
  const rest = (await button.boundingBox())?.y ?? 0;
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  await seekAnimations(page, 0);
  // Its new layout at once, a row higher, with nothing on it.
  expect(await button.evaluate(el => getComputedStyle(el).translate)).toBe(
    'none',
  );
  expect(rest - ((await button.boundingBox())?.y ?? 0)).toBeGreaterThan(1);
  expect(await fixedTop()).toBeCloseTo(10, 0);
  // The rows inside the list still start where they were.
  expect(await translateY(spam)).toBeGreaterThan(1);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => translateY(spam)).toBe(0);
  expect(await button.evaluate(el => getComputedStyle(el).translate)).toBe(
    'none',
  );
});

test('after a removal the rows sliding up into the gap never paint over the content after the list', async ({
  page,
}) => {
  await open(page);
  const list = page.locator('#storybook-root ul').first();
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  await seekAnimations(page, 0);
  // Just under the list's new bottom edge, where the content after it now
  // sits, the last row, still a row lower on its way up, is clipped away.
  const hitsRow = await list.evaluate(el => {
    const box = el.getBoundingClientRect();
    const target = document.elementFromPoint(
      box.left + box.width / 2,
      box.bottom + 4,
    );
    return target != null && el.contains(target);
  });
  expect(hitsRow).toBe(false);
  expect(await list.evaluate(el => getComputedStyle(el).overflowY)).toBe(
    'clip',
  );
  await releaseAnimations(page, {finish: true});
  await expect
    .poll(async () => list.evaluate(el => getComputedStyle(el).overflowY))
    .toBe('visible');
});

test('a change while rows still move: no jump, they keep moving to their new places', async ({
  page,
}) => {
  await open(page);
  // Archive's on-screen top, every frame, from the first change to rest.
  await page.evaluate(() => {
    const target = [...document.querySelectorAll('#storybook-root li')].find(
      li => li.textContent?.trim() === 'Archive',
    ) as HTMLElement;
    const tops: number[] = [];
    (window as unknown as {__tops: number[]}).__tops = tops;
    const tick = () => {
      tops.push(target.getBoundingClientRect().top);
      if (tops.length < 90) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await press(page, 'Remove the second row');
  // A second removal while Archive is still sliding up from the first.
  await page.waitForTimeout(90);
  await press(page, 'Remove the second row');
  await page.waitForTimeout(1200);
  const tops = await page.evaluate(
    () => (window as unknown as {__tops: number[]}).__tops,
  );
  const rowHeight = await row(page, 'Archive').evaluate(el => {
    // The row above, never a removed row's ghost.
    let previous = el.previousElementSibling as HTMLElement | null;
    while (previous?.hasAttribute('data-astryx-leaving') === true) {
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    return previous == null
      ? 0
      : (el as HTMLElement).offsetTop - previous.offsetTop;
  });
  const steps = tops.slice(1).map((top, i) => top - tops[i]);
  // Up two rows in all, never back down, and no frame jumps by a row.
  expect(tops[0] - (tops.at(-1) ?? 0)).toBeCloseTo(2 * rowHeight, 0);
  for (const step of steps) {
    expect(step, JSON.stringify(tops)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(step), JSON.stringify(tops)).toBeLessThan(rowHeight / 2);
  }
  await expect.poll(async () => translateY(row(page, 'Archive'))).toBe(0);
});

test('the update keeps its own table spring, whatever a theme writes', async ({
  page,
}) => {
  await open(page);
  // The table spring is an internal constant: a variable written the way a
  // theme would write one (0.9 s, no bounce, on the root) changes nothing.
  await page.evaluate(() =>
    document.documentElement.style.setProperty(
      '--motion-list-update-table-spring',
      '0.9s 0',
    ),
  );
  const table = solveSpring(SPRING, {from: 0, to: 1});
  const drafts = row(page, 'Drafts');
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  const gap = await drafts.evaluate(el => {
    // The row above, never a removed row's ghost.
    let previous = el.previousElementSibling as HTMLElement | null;
    while (previous?.hasAttribute('data-astryx-leaving') === true) {
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    return previous == null
      ? 0
      : (el as HTMLElement).offsetTop - previous.offsetTop;
  });
  for (const t of [SETTLE_MS / 2, SETTLE_MS]) {
    await seekAnimations(page, t);
    expect(await translateY(drafts)).toBeCloseTo(
      gap * (1 - table.value(t / 1000)),
      0,
    );
  }
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => translateY(drafts)).toBe(0);
});

test('a removed row whose parts run a compositor animation collapses as it was on screen', async ({
  page,
}) => {
  await open(page);
  const sent = row(page, 'Sent');
  await expect(sent).toBeVisible();
  // What a swipe leaves on screen: a running Web Animation of the row's
  // content, here held halfway at 40 px to the left.
  await sent.evaluate(el => {
    const content = el.firstElementChild as HTMLElement;
    content.setAttribute('data-test-swiped', '');
    const animation = content.animate(
      [{translate: '0px'}, {translate: '-80px'}],
      {duration: 1000, fill: 'forwards'},
    );
    animation.pause();
    animation.currentTime = 500;
  });
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  await seekAnimations(page, 0);
  // The collapse's first frame: the leaving row's content where it was.
  const swiped = page.locator(
    '#storybook-root [data-astryx-leaving] [data-test-swiped]',
  );
  await expect(swiped).toHaveCount(1);
  expect(
    await swiped.evaluate(el => {
      const value = getComputedStyle(el).translate;
      return value === 'none' ? 0 : Number.parseFloat(value);
    }),
  ).toBeCloseTo(-40, 0);
  await releaseAnimations(page, {finish: true});
});

test('a removed row collapses as it was on screen even when its parts’ owner resets them as it unmounts', async ({
  page,
}) => {
  await open(page);
  const sent = row(page, 'Sent');
  await expect(sent).toBeVisible();
  await sent.evaluate(el => {
    const content = el.firstElementChild as HTMLElement;
    content.setAttribute('data-test-swiped', '');
    const animation = content.animate(
      [{translate: '0px'}, {translate: '-80px'}],
      {duration: 1000, fill: 'forwards'},
    );
    animation.pause();
    animation.currentTime = 500;
    // The owner's own cleanup runs after the row's and before React removes
    // the row (a swipe gives its row back its translation): it resets the
    // style the row just wrote.
    const list = el.parentElement as HTMLElement;
    const removeChild = list.removeChild.bind(list);
    list.removeChild = <T extends Node>(child: T): T => {
      if ((child as Node) === el) {
        content.style.removeProperty('translate');
      }
      return removeChild(child);
    };
  });
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  await seekAnimations(page, 0);
  const swiped = page.locator(
    '#storybook-root [data-astryx-leaving] [data-test-swiped]',
  );
  await expect(swiped).toHaveCount(1);
  expect(
    await swiped.evaluate(el => {
      const value = getComputedStyle(el).translate;
      return value === 'none' ? 0 : Number.parseFloat(value);
    }),
  ).toBeCloseTo(-40, 0);
  await releaseAnimations(page, {finish: true});
});

test('a removed row a swipe moved sideways on its own root keeps that offset through its collapse', async ({
  page,
}) => {
  await open(page);
  const sent = row(page, 'Sent');
  await expect(sent).toBeVisible();
  await sent.evaluate(el => {
    // What a swipe that moves the row itself leaves on screen: the row
    // translated sideways, which its owner gives back as the row unmounts.
    (el as HTMLElement).style.translate = '-40px';
    el.setAttribute('data-test-swiped-row', '');
    const list = el.parentElement as HTMLElement;
    const removeChild = list.removeChild.bind(list);
    list.removeChild = <T extends Node>(child: T): T => {
      if ((child as Node) === el) {
        (el as HTMLElement).style.removeProperty('translate');
      }
      return removeChild(child);
    };
  });
  await press(page, 'Remove the second row');
  await expect(row(page, 'Sent')).toHaveCount(0);
  await holdAnimations(page);
  await seekAnimations(page, 0);
  const swiped = page.locator(
    '#storybook-root [data-astryx-leaving] [data-test-swiped-row]',
  );
  await expect(swiped).toHaveCount(1);
  // The collapse moves it on y only: the sideways offset stays.
  expect(
    await swiped.evaluate(el => {
      const value = getComputedStyle(el).translate;
      return value === 'none' ? 0 : Number.parseFloat(value.split(' ')[0]);
    }),
  ).toBeCloseTo(-40, 0);
  await releaseAnimations(page, {finish: true});
});

test('under reduced motion a removal, an insert and a reorder cross-fade: opacity only, within 200 ms', async ({
  page,
}) => {
  // design:reduced-motion DR1 and DR2, under a finger: no row travels or
  // collapses; a removed row fades out where it is, a new one fades in.
  await page.emulateMedia({reducedMotion: 'reduce'});
  for (const change of [
    'Remove the second row',
    'Insert a row second',
    'Move the last row first',
  ]) {
    // Each change on a fresh list.
    await open(page);
    // The fades last 200 ms: wait for them in the page, frame by frame,
    // then hold them before the animator retires them.
    await page.evaluate(async name => {
      [...document.querySelectorAll('button')]
        .find(button => button.textContent?.trim() === name)
        ?.click();
      for (
        let frame = 0;
        frame < 60 && document.getAnimations().length === 0;
        frame += 1
      ) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }, change);
    expectReducedMotionCrossFade(await holdAnimations(page));
    await releaseAnimations(page, {finish: true});
  }
});

test('a row swiped away with a removal action collapses in place: the rows below slide up into its gap', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the swipe is driven with Chromium touch events (CDP)',
  );
  await openStory(page, storybook(), 'core-list--animated-changes-swipe');
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'list changes move under a finger only');
  const sent = row(page, 'Sent');
  const drafts = row(page, 'Drafts');
  await expect(sent).toBeVisible();
  const box = await sent.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  const gap = await drafts.evaluate(el => {
    // The row above, never a removed row's ghost.
    let previous = el.previousElementSibling as HTMLElement | null;
    while (previous?.hasAttribute('data-astryx-leaving') === true) {
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    return previous == null
      ? 0
      : (el as HTMLElement).offsetTop - previous.offsetTop;
  });
  // Drafts' translate every frame from the frame Sent leaves the page.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#storybook-root li')];
    // A row's own text: its swipe panels' action labels aside, since the
    // panels may already be in the row.
    const labelOf = (li: Element) => {
      const copy = li.cloneNode(true) as Element;
      for (const panel of copy.querySelectorAll('[data-swipe-panel]')) {
        panel.remove();
      }
      return copy.textContent?.trim();
    };
    const sentRow = rows.find(li => labelOf(li) === 'Sent');
    const target = rows.find(li => labelOf(li) === 'Drafts') as HTMLElement;
    const samples: number[] = [];
    (window as unknown as {__ys: number[]}).__ys = samples;
    const tick = () => {
      // Sent leaves its place: gone, or collapsing in its ghost.
      if (
        sentRow?.isConnected !== true ||
        sentRow.closest('[data-astryx-leaving]') != null
      ) {
        const value = getComputedStyle(target).translate;
        const [, y = '0px'] = value.split(' ');
        samples.push(value === 'none' ? 0 : Number.parseFloat(y));
      }
      if (samples.length < 40) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  // The swipe panel is the sign the row can be dragged.
  await expect(sent.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  // Toward the inline start, most of the row's width: the full swipe fires
  // the outermost entry, Delete, whose removal holds the row out until the
  // story removes it from the data.
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + box.width - 24;
  const finger = async (x: number, type: 'touchStart' | 'touchMove') =>
    cdp.send('Input.dispatchTouchEvent', {touchPoints: [{x, y}], type});
  await finger(startX, 'touchStart');
  for (const fraction of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) {
    await finger(startX - box.width * fraction, 'touchMove');
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
  await expect(sent).toHaveCount(0, {timeout: 5000});
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as {__ys: number[]}).__ys.length),
    )
    .toBeGreaterThan(10);
  const ys = await page.evaluate(
    () => (window as unknown as {__ys: number[]}).__ys,
  );
  // Starts one row low (where it was) and slides up to its place.
  expect(ys[0], JSON.stringify(ys)).toBeCloseTo(gap, 0);
  for (let i = 1; i < ys.length; i++) {
    expect(ys[i], JSON.stringify(ys)).toBeLessThanOrEqual(ys[i - 1] + 0.01);
  }
  await expect.poll(async () => translateY(drafts)).toBe(0);
});

test('the rows keep moving on every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright',
  );
  await open(page);
  const drafts = row(page, 'Drafts');
  const unmark = await markElement(drafts);
  const cast = await startScreencast(page);
  await page.waitForTimeout(100);
  await press(page, 'Remove the second row');
  await waitForAnimation(drafts, {minProgressMs: 16});
  const block = await blockMainThread(page, 300);
  await page.waitForTimeout(250);
  const frames = await cast.stop();
  await unmark();
  const tracked = await trackMarker(page, frames);
  const proof = busyWindowProof(tracked, block, {axis: 'y', settledWithin: 1});
  await writeEvidence(
    'busy-main-thread/list-update-removal',
    {[`${testInfo.project.name}.json`]: JSON.stringify(proof, null, 1)},
    testInfo,
  );
  expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
  expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
  expect(proof.longestStallMs, JSON.stringify(proof)).toBeLessThan(40);
});

test('WebKit: the rows keep moving while the main thread is blocked (video)', async ({
  browser,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'webkit',
    'the Chromium screencast test covers Chromium',
  );
  const size = {width: 402, height: 714};
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: {dir: testInfo.outputPath('video'), size},
  });
  const page = await context.newPage();
  await open(page);
  const drafts = row(page, 'Drafts');
  const gap = await drafts.evaluate(el => {
    // The row above, never a removed row's ghost.
    let previous = el.previousElementSibling as HTMLElement | null;
    while (previous?.hasAttribute('data-astryx-leaving') === true) {
      previous = previous.previousElementSibling as HTMLElement | null;
    }
    return previous == null
      ? 0
      : (el as HTMLElement).offsetTop - previous.offsetTop;
  });
  await markElement(drafts);
  const chip = await page.evaluate(() => {
    const el = document.querySelector('[data-harness-marker-chip]');
    const box = el?.getBoundingClientRect();
    return box == null
      ? null
      : {x: box.x + box.width / 2, y: box.y + box.height / 2};
  });
  if (chip == null) {
    throw new Error('no marker chip');
  }
  // Probes every 4 px up the row's path: it slides up by one row.
  const probes = Array.from({length: Math.floor(gap / 4) + 1}, (_, k) => ({
    x: Math.round(chip.x),
    y: Math.round(chip.y - k * 4),
  }));
  await installBeacon(page);
  await page.waitForTimeout(300);
  await press(page, 'Remove the second row');
  await waitForAnimation(drafts, {minProgressMs: 1});
  await blockBehindBeacon(page, 300);
  await page.waitForTimeout(400);
  const video = page.video();
  await context.close();
  const path = await video?.path();
  expect(path).toBeTruthy();
  const samples = await sampleVideoPoints(path as string, probes, size);
  const position = (marker: ReadonlyArray<boolean>) => {
    const hits = marker.flatMap((hit, k) => (hit ? [k] : []));
    return hits.length === 0
      ? null
      : (hits.reduce((a, b) => a + b, 0) / hits.length) * 4;
  };
  const blocked = samples
    .filter(s => s.beacon === 'blocked')
    .map(s => ({t: s.t, y: position(s.marker)}))
    .filter((s): s is {t: number; y: number} => s.y != null);
  const distinct = blocked
    .map(s => Math.round(s.y))
    .filter((v, i, all) => i === 0 || v !== all[i - 1]);
  await writeEvidence(
    'busy-main-thread/list-update-removal-webkit',
    {'webkit.json': JSON.stringify({gap, blocked, distinct}, null, 1)},
    testInfo,
  );
  // The row kept moving up while script could not run.
  expect(distinct.length, JSON.stringify(distinct)).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < distinct.length; i++) {
    expect(distinct[i]).toBeGreaterThan(distinct[i - 1]);
  }
});

test('a removal does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await open(page);
  const drafts = row(page, 'Drafts');
  let window = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    await press(page, 'Remove the second row');
    const [started] = await waitForAnimation(drafts);
    window = {from: started.from, to: started.from + SETTLE_MS};
    await page.waitForTimeout(SETTLE_MS + 100);
  });
  const during = countBetween(trace, window.from + 30, window.to - 30);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
});

test(
  'storyboard: a row removed from a list on an iPhone',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await open(page);
    await press(page, 'Remove the second row');
    const {storyboard} = await animationStoryboard(page, {
      name: 'list-update-removal',
      clip: {x: 0, y: 0, width: 402, height: 420},
      times: [0, 33, 67, 100, 150, 200, 300, Math.round(SETTLE_MS)],
      columns: 8,
      cellScale: 0.45,
    });
    await releaseAnimations(page, {finish: true});
    await storyboard.write(testInfo);
  },
);
