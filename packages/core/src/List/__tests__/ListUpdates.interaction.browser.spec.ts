// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListUpdates.interaction.browser.spec.ts
 * @input The built List "Animated Changes" stories, in the touch phone
 *   context and in a mouse context
 * @output Browser proofs of a List's animated row updates. They cover a
 *   removal, an insert, a move, Reduce Motion, the last row's exit, no Layout
 *   or Paint per frame, and swiped rows.
 * @position Interaction evidence for List/listLayoutUpdates.ts. The module's
 *   own proofs are motion/__tests__/animatedLayout*.browser.spec.ts.
 *
 * SYNC: When modified, update the Verification rows of
 * /docs/specs/components/List/List.spec.md.
 */

// The stories' List takes the handle that `useAnimatedLayout` returns for a
// container around it and the buttons after it. Each row has an `itemKey`.

import {
  expect,
  test,
  type Browser,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  countBetween,
  openStory,
  releaseAnimations,
  traceRendering,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-list--animated-changes';
const SWIPE_STORY = 'core-list--animated-changes-swipe';

/** A row of the list, never a row put back for its exit. */
const row = (page: Page, label: string) =>
  page
    .locator('#storybook-root li:not([data-astryx-leaving])')
    .filter({hasText: label})
    .first();

/** The row put back for its exit, if any. */
const leaving = (page: Page) =>
  page.locator('#storybook-root li[data-astryx-leaving]');

/**
 * Records the keyframes of every script animation made from now on, however
 * short: a reduced-motion cross-fade can end before a later read sees it.
 */
async function recordMadeAnimations(
  page: Page,
): Promise<() => Promise<Record<string, unknown>[][]>> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __madeAnimations?: Record<string, unknown>[][];
    };
    w.__madeAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      const animation = animate.apply(this, args);
      w.__madeAnimations?.push(
        (animation.effect as KeyframeEffect)
          .getKeyframes()
          .map(frame => ({...frame})),
      );
      return animation;
    };
  });
  return async () =>
    page.evaluate(
      () =>
        (window as unknown as {__madeAnimations: Record<string, unknown>[][]})
          .__madeAnimations,
    );
}

/**
 * Every glide start (px, vertical) and clip running right now, by row label.
 * A button reads as `button:` and its name, and a row put back for its exit
 * as `leaving:` and its label. It reads all of them in one pass right after a
 * change. The glides last under half a second, so reading them one by one
 * would miss the later ones.
 */
async function snapshot(
  page: Page,
): Promise<{glides: Record<string, number>; clipped: string[]}> {
  return page.evaluate(() => {
    const nameOf = (el: Element) => {
      const testId = el.getAttribute('data-testid');
      if (testId != null) {
        return `testid:${testId}`;
      }
      if (el instanceof HTMLButtonElement) {
        return `button:${el.textContent?.trim() ?? ''}`;
      }
      const copy = el.cloneNode(true) as Element;
      for (const panel of copy.querySelectorAll('[data-swipe-panel]')) {
        panel.remove();
      }
      const label = copy.textContent?.trim() ?? '';
      return el.hasAttribute('data-astryx-leaving')
        ? `leaving:${label}`
        : label;
    };
    const glides: Record<string, number> = {};
    const clipped: string[] = [];
    for (const animation of document.getAnimations()) {
      const effect = animation.effect as KeyframeEffect;
      const target = effect.target;
      if (target == null) {
        continue;
      }
      const frames = effect.getKeyframes();
      const first = frames[0]?.translate;
      if (typeof first === 'string') {
        const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(first);
        glides[nameOf(target)] = match == null ? 0 : Number(match[2] ?? 0);
      }
      if (frames.some(frame => frame.clipPath != null)) {
        clipped.push(nameOf(target));
      }
    }
    return {glides, clipped};
  });
}

/**
 * The start times of the animations on the list and its rows, in ms: the
 * update's own, whatever drives them. An animation outside the list (a
 * pressed button's release) is not part of the update.
 */
async function startTimes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const list = document.querySelector('#storybook-root ul');
    return document
      .getAnimations()
      .filter(animation => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return list != null && target != null && list.contains(target);
      })
      .map(animation => Number(animation.startTime))
      .filter(time => Number.isFinite(time));
  });
}

/** The distance between two consecutive rows' tops, in px. */
async function rowGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#storybook-root li')];
    return (
      rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top
    );
  });
}

async function press(page: Page, name: string) {
  await page.getByRole('button', {name}).click();
}

async function open(page: Page, story = STORY) {
  await openStory(page, storybook(), story);
  await expect(row(page, 'Inbox')).toBeVisible();
}

/** A context with a mouse and no touch, for the every-pointer cases. */
async function withMouse<T>(
  browser: Browser,
  run: (page: Page) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 900},
  });
  const page = await context.newPage();
  try {
    return await run(page);
  } finally {
    await context.close();
  }
}

test('a removal: the removed row stays in place, inert and out of the accessibility tree, and conceals while the rows after it and the content after the list glide up from their old places', async ({
  page,
}) => {
  await open(page);
  const gap = await rowGap(page);
  // The exit lasts as long as the glides. The page holds it from its first
  // frame, so the row is still there for each read below, however late a
  // loaded runner sends it. The hold takes the list only. The pressed
  // button's own press can start first, and would meet the hold's count.
  const hold = await armHold(page, page.locator('#storybook-root ul'), {
    judges: {target: leaving(page), property: 'clip-path'},
    newOnly: true,
  });
  await press(page, 'Remove the second row');
  const {glides, clipped} = await snapshot(page);
  await hold.held();
  // The rows after it, and the content after the list, start where they were.
  // So do the buttons: the pressed one glides with its neighbors, never onto
  // them.
  for (const label of [
    'Drafts',
    'Archive',
    'Spam',
    'testid:after-list',
    'button:Insert a row second',
    'button:Remove the second row',
    'button:Move the last row first',
  ]) {
    expect(glides[label], `${label} ${JSON.stringify(glides)}`).toBeCloseTo(
      gap,
      0,
    );
  }
  expect(glides.Inbox).toBeUndefined();
  // It conceals on the same motion.
  expect(clipped).toEqual(['leaving:Sent']);
  // Back where it was for its exit: inert, hidden from assistive technology.
  const exit = leaving(page);
  await expect(exit).toHaveCount(1);
  await expect(exit).toHaveAttribute('inert', '');
  await expect(exit).toHaveAttribute('aria-hidden', 'true');
  await expect(
    page.getByRole('listitem').filter({hasText: 'Sent'}),
  ).toHaveCount(0);
  // Then it goes.
  await releaseAnimations(page);
  await expect(exit).toHaveCount(0, {timeout: 3000});
});

test('an insert: the new row enters in the same frame the rows after it and the content after the list start gliding down', async ({
  page,
}) => {
  await open(page);
  const gap = await rowGap(page);
  await press(page, 'Insert a row second');
  const {glides, clipped} = await snapshot(page);
  const starts = await startTimes(page);
  expect(clipped).toEqual(['Folder 1']);
  expect(glides['Folder 1']).toBeUndefined();
  for (const label of [
    'Sent',
    'Drafts',
    'Archive',
    'Spam',
    'testid:after-list',
    'button:Insert a row second',
    'button:Remove the second row',
    'button:Move the last row first',
  ]) {
    expect(glides[label], `${label} ${JSON.stringify(glides)}`).toBeCloseTo(
      -gap,
      0,
    );
  }
  // One frame: the new row's entrance and the glides of the four rows after
  // it started together.
  expect(starts.length, JSON.stringify(starts)).toBe(5);
  expect(
    Math.max(...starts) - Math.min(...starts),
    JSON.stringify(starts),
  ).toBeLessThan(1);
});

test('a reorder: the row moved to the top glides up from its old place riding above the rows it crosses, and they glide down', async ({
  page,
}) => {
  await open(page);
  const gap = await rowGap(page);
  await press(page, 'Move the last row first');
  const {glides} = await snapshot(page);
  const spam = row(page, 'Spam');
  const travelling = await spam.evaluate(el =>
    el.hasAttribute('data-astryx-travelling'),
  );
  expect(glides.Spam, JSON.stringify(glides)).toBeCloseTo(4 * gap, 0);
  expect(travelling).toBe(true);
  // It rides on the list's surface, in this list with dividers too.
  expect(await spam.evaluate(el => getComputedStyle(el).boxShadow)).toContain(
    'inset',
  );
  for (const label of ['Inbox', 'Sent', 'Drafts', 'Archive']) {
    expect(glides[label], `${label} ${JSON.stringify(glides)}`).toBeCloseTo(
      -gap,
      0,
    );
  }
  // The list's height did not change: nothing after it moves. Present
  // first: the content after the list is on screen.
  const afterList = page.getByTestId('after-list');
  await expect(afterList).toBeVisible();
  expect((await afterList.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  expect(glides['testid:after-list']).toBeUndefined();
  // It rides above them only while it glides.
  await expect(spam).not.toHaveAttribute('data-astryx-travelling', /.*/, {
    timeout: 3000,
  });
});

test('a mouse gets the same motion: a removal glides the rows after it (every pointer)', async ({
  browser,
}) => {
  await withMouse(browser, async page => {
    await open(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const gap = await rowGap(page);
    await press(page, 'Remove the second row');
    const {glides, clipped} = await snapshot(page);
    expect(glides.Drafts, JSON.stringify(glides)).toBeCloseTo(gap, 0);
    expect(clipped).toEqual(['leaving:Sent']);
  });
});

test('under Reduce Motion: a finger cross-fades with no travel, a mouse changes at once', async ({
  page,
  browser,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  // Present first: the row the removal takes, on screen.
  await expect(row(page, 'Sent')).toBeVisible();
  const made = await recordMadeAnimations(page);
  await press(page, 'Remove the second row');
  const {glides, clipped} = await snapshot(page);
  expect(glides).toEqual({});
  expect(clipped).toEqual([]);
  // Every animation the removal made, however short: at least one plays, a
  // fade, and none of them travels.
  const animations = await made();
  const summary = JSON.stringify(animations);
  expect(animations.length, summary).toBeGreaterThan(0);
  expect(
    animations.some(frames => frames.some(frame => frame.opacity != null)),
    summary,
  ).toBe(true);
  expect(
    animations.every(frames =>
      frames.every(frame => frame.translate == null && frame.clipPath == null),
    ),
    summary,
  ).toBe(true);
  await withMouse(browser, async mouse => {
    await mouse.emulateMedia({reducedMotion: 'reduce'});
    await open(mouse);
    await expect(row(mouse, 'Sent')).toBeVisible();
    await press(mouse, 'Remove the second row');
    await expect(row(mouse, 'Sent')).toHaveCount(0);
    await expect(leaving(mouse)).toHaveCount(0);
    expect(await mouse.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test('under Reduce Motion, an inserted row fades in where it lands under a finger, and lands at once with a mouse', async ({
  page,
  browser,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  await press(page, 'Insert a row second');
  const fades = await page.evaluate(() => {
    const inserted = [...document.querySelectorAll('#storybook-root li')].find(
      li => li.textContent?.trim() === 'Folder 1',
    );
    return (inserted?.getAnimations() ?? []).map(animation => {
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      return {
        from: Number(frames[0]?.opacity ?? 1),
        to: Number(frames.at(-1)?.opacity ?? 1),
        travels: frames.some(
          frame =>
            frame.translate != null ||
            frame.transform != null ||
            frame.clipPath != null,
        ),
      };
    });
  });
  // The row's own fade, from transparent to opaque, with no travel.
  expect(fades.length, JSON.stringify(fades)).toBeGreaterThan(0);
  for (const fade of fades) {
    expect(fade.travels, JSON.stringify(fades)).toBe(false);
    expect(fade.from, JSON.stringify(fades)).toBeLessThan(1);
    expect(fade.to, JSON.stringify(fades)).toBeCloseTo(1, 2);
  }
  await withMouse(browser, async mouse => {
    await mouse.emulateMedia({reducedMotion: 'reduce'});
    await open(mouse);
    await press(mouse, 'Insert a row second');
    await expect(row(mouse, 'Folder 1')).toBeVisible();
    expect(await mouse.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test('removing the last row: its exit never paints over the content after the list', async ({
  page,
}) => {
  await open(page);
  // Removing the second row three times leaves the second row the last one.
  for (let i = 0; i < 3; i++) {
    await press(page, 'Remove the second row');
    await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
  }
  await press(page, 'Remove the second row');
  const samples = await page.evaluate(() => {
    const animations = document.getAnimations();
    for (const animation of animations) {
      animation.pause();
    }
    const duration = Math.max(
      ...animations.map(animation =>
        Number(animation.effect?.getComputedTiming().endTime ?? 0),
      ),
    );
    const exit = document.querySelector<HTMLElement>(
      '#storybook-root li[data-astryx-leaving]',
    );
    const after = document.querySelector<HTMLElement>('#storybook-root ul + *');
    if (exit == null || after == null) {
      return {
        duration,
        rows: [] as {t: number; exit: number; exitTop: number; after: number}[],
      };
    }
    // The element a positioned or in-flow box is clipped by: its containing
    // blocks, up the page.
    const containingBlock = (node: Element): Element | null => {
      const position = getComputedStyle(node).position;
      if (position === 'fixed') {
        return null;
      }
      let parent = node.parentElement;
      if (position === 'absolute') {
        while (
          parent != null &&
          getComputedStyle(parent).position === 'static' &&
          getComputedStyle(parent).transform === 'none'
        ) {
          parent = parent.parentElement;
        }
      }
      return parent;
    };
    // Where the exit's painted part ends: its box, less its clip-path inset,
    // within the boxes that clip it.
    const paintedBottom = (element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      let bottom = rect.bottom;
      const inset = /^inset\(([^)]*)\)/.exec(
        getComputedStyle(element).clipPath,
      );
      if (inset != null) {
        const parts = inset[1]
          .replace(/round.*$/, '')
          .trim()
          .split(/\s+/);
        const value = parts.length >= 3 ? parts[2] : parts[0];
        bottom -= value.endsWith('%')
          ? (rect.height * Number.parseFloat(value)) / 100
          : Number.parseFloat(value);
      }
      for (
        let block = containingBlock(element);
        block != null && block !== document.body;
        block = containingBlock(block)
      ) {
        if (getComputedStyle(block).overflowY !== 'visible') {
          bottom = Math.min(bottom, block.getBoundingClientRect().bottom);
        }
      }
      return bottom;
    };
    const rows = [0, 0.1, 0.25, 0.5, 0.75, 0.95].map(fraction => {
      const t = duration * fraction;
      for (const animation of animations) {
        animation.currentTime = t;
      }
      return {
        t,
        exit: paintedBottom(exit),
        exitTop: exit.getBoundingClientRect().top,
        after: after.getBoundingClientRect().top,
      };
    });
    for (const animation of animations) {
      animation.play();
    }
    return {duration, rows};
  });
  expect(samples.rows.length, JSON.stringify(samples)).toBe(6);
  // Present first: an exit plays, and it starts on screen, painted.
  expect(samples.duration, JSON.stringify(samples)).toBeGreaterThan(0);
  expect(
    samples.rows[0].exit - samples.rows[0].exitTop,
    JSON.stringify(samples),
  ).toBeGreaterThan(1);
  for (const sample of samples.rows) {
    expect(sample.exit, JSON.stringify(samples)).toBeLessThanOrEqual(
      sample.after + 1,
    );
  }
  await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
});

for (const [change, button] of [
  ['an insert', 'Insert a row second'],
  ['a removal', 'Remove the second row'],
  ['a reorder', 'Move the last row first'],
] as const) {
  test(`${change}: the motion does no Layout or Paint per frame`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
    await open(page);
    let window = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      await press(page, button);
      const starts = await startTimes(page);
      const durations = await page.evaluate(() =>
        document
          .getAnimations()
          .map(animation => Number(animation.effect?.getTiming().duration)),
      );
      const from = Math.min(...starts);
      window = {from, to: from + Math.max(...durations)};
      await page.waitForTimeout(Math.max(...durations) + 100);
    });
    const during = countBetween(trace, window.from + 30, window.to - 30);
    expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
    expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  });
}

/**
 * Presses one of the swipe story's move buttons and freezes the motion
 * halfway. Then it reports which row the browser hit-tests where the moved
 * row overlaps a row it crosses.
 */
async function crossingHit(page: Page, button: string) {
  await press(page, button);
  return page.evaluate(() => {
    const list = document.querySelector('#storybook-root ul');
    for (const animation of document.getAnimations()) {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      if (list != null && target != null && list.contains(target)) {
        animation.pause();
        animation.currentTime =
          Number(animation.effect?.getComputedTiming().duration) / 2;
      }
    }
    const label = (row: Element | null | undefined) => {
      if (row == null) {
        return null;
      }
      const copy = row.cloneNode(true) as Element;
      for (const panel of copy.querySelectorAll('[data-swipe-panel]')) {
        panel.remove();
      }
      return copy.textContent?.trim() ?? '';
    };
    const rows = [...document.querySelectorAll('#storybook-root li')];
    const moved = rows.find(row => row.hasAttribute('data-astryx-travelling'));
    if (moved == null) {
      return null;
    }
    const m = moved.getBoundingClientRect();
    const crossed = rows.find(row => {
      const r = row.getBoundingClientRect();
      return row !== moved && r.top < m.bottom - 4 && r.bottom > m.top + 4;
    });
    if (crossed == null) {
      return {moved: label(moved), crossed: null, hit: null};
    }
    const c = crossed.getBoundingClientRect();
    const y = (Math.max(m.top, c.top) + Math.min(m.bottom, c.bottom)) / 2;
    const hit = document.elementFromPoint(m.left + 40, y)?.closest('li');
    return {moved: label(moved), crossed: label(crossed), hit: label(hit)};
  });
}

test('a reorder among swipeable rows: the moved row rides above the rows it crosses, under a finger and with a mouse', async ({
  page,
  browser,
}) => {
  await open(page, SWIPE_STORY);
  const touch = await crossingHit(page, 'Move Archive first');
  expect(touch?.moved, JSON.stringify(touch)).toBe('Archive');
  expect(touch?.crossed, JSON.stringify(touch)).not.toBeNull();
  expect(touch?.hit, JSON.stringify(touch)).toBe('Archive');
  const mouse = await withMouse(browser, async mousePage => {
    await open(mousePage, SWIPE_STORY);
    return crossingHit(mousePage, 'Move Archive first');
  });
  expect(mouse?.crossed, JSON.stringify(mouse)).not.toBeNull();
  expect(mouse?.hit, JSON.stringify(mouse)).toBe('Archive');
});

test('a row without swipe actions, moved across swipeable rows, rides above them, under a finger and with a mouse', async ({
  page,
  browser,
}) => {
  await open(page, SWIPE_STORY);
  // Notes has no swipe actions; the rows it crosses do, and under a finger
  // each of them is raised.
  await expect(row(page, 'Notes')).toBeVisible();
  await expect(row(page, 'Notes').locator('[data-swipe-panel]')).toHaveCount(0);
  const touch = await crossingHit(page, 'Move Notes first');
  expect(touch?.moved, JSON.stringify(touch)).toBe('Notes');
  expect(touch?.crossed, JSON.stringify(touch)).not.toBeNull();
  expect(touch?.hit, JSON.stringify(touch)).toBe('Notes');
  const mouse = await withMouse(browser, async mousePage => {
    await open(mousePage, SWIPE_STORY);
    return crossingHit(mousePage, 'Move Notes first');
  });
  expect(mouse?.crossed, JSON.stringify(mouse)).not.toBeNull();
  expect(mouse?.hit, JSON.stringify(mouse)).toBe('Notes');
});

test('a row swiped away with a removal action exits in place as it was on screen, as itself with no element added, while the rows after it glide up', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the swipe is driven with Chromium touch events (CDP)',
  );
  await open(page, SWIPE_STORY);
  const sent = row(page, 'Sent');
  await expect(sent).toBeVisible();
  const gap = await rowGap(page);
  const box = await sent.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  // From the frame where Sent is put back for its exit, record what exits and
  // where its content and its action show. Also record where Drafts starts
  // its glide.
  await page.evaluate(() => {
    const samples: {
      offset: number;
      glide: number | null;
      nested: boolean;
      added: number;
      rowLeft: number;
      panelRight: number | null;
    }[] = [];
    (window as unknown as {__samples: typeof samples}).__samples = samples;
    const tick = () => {
      const exit = document.querySelector<HTMLElement>(
        '#storybook-root li[data-astryx-leaving]',
      );
      if (exit != null && samples.length === 0) {
        const drafts = [
          ...document.querySelectorAll('#storybook-root li'),
        ].find(
          li =>
            !li.hasAttribute('data-astryx-leaving') &&
            li.textContent?.includes('Drafts'),
        );
        let glide: number | null = null;
        for (const animation of drafts?.getAnimations() ?? []) {
          const first = (animation.effect as KeyframeEffect).getKeyframes()[0]
            ?.translate;
          if (typeof first === 'string') {
            glide = Number(first.split(' ')[1]?.replace('px', '') ?? 0);
          }
        }
        // What exits is the row itself: no row nested in another element the
        // list made, and nothing beside the rows but it.
        const list = exit.parentElement;
        const content = exit.querySelector<HTMLElement>(
          ':scope > :not([data-swipe-panel])',
        );
        const panel = exit.querySelector<HTMLElement>(
          '[data-swipe-panel="trailing"]',
        );
        samples.push({
          // Where its content shows against its own box: carried away by the
          // swipe.
          offset:
            (content?.getBoundingClientRect().left ?? 0) -
            exit.getBoundingClientRect().left,
          glide,
          nested: exit.querySelector('li') != null,
          added: [...(list?.children ?? [])].filter(
            child => child.tagName !== 'LI',
          ).length,
          rowLeft: exit.getBoundingClientRect().left,
          panelRight: panel?.getBoundingClientRect().right ?? null,
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await expect(sent.locator('[data-swipe-panel="trailing"]')).toBeAttached();
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
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {__samples: unknown[]}).__samples.length,
      ),
    )
    .toBe(1);
  const [sample] = await page.evaluate(
    () =>
      (
        window as unknown as {
          __samples: {
            offset: number;
            glide: number | null;
            nested: boolean;
            added: number;
            rowLeft: number;
            panelRight: number | null;
          }[];
        }
      ).__samples,
  );
  // The row itself exits, at its own place: no element added for it.
  expect(sample.nested, JSON.stringify(sample)).toBe(false);
  expect(sample.added, JSON.stringify(sample)).toBe(0);
  expect(sample.rowLeft, JSON.stringify(sample)).toBeCloseTo(box.x, 0);
  // It still shows swiped toward the inline start, its action out in its
  // place.
  expect(sample.offset, JSON.stringify(sample)).toBeLessThan(-box.width / 4);
  expect(
    sample.panelRight ?? -1e3,
    JSON.stringify(sample),
  ).toBeGreaterThanOrEqual(box.x + box.width - 2);
  // Drafts starts where it was.
  expect(sample.glide ?? 0, JSON.stringify(sample)).toBeCloseTo(gap, 0);
  await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
});

/**
 * Presses `button` with a click that has no pointer. It counts the style
 * recalculations and layouts in that task: the click, React's commit and the
 * microtasks after it, before the next frame. With `isMarkSkipped`, no row is
 * marked to ride above others. It also says whether a row rides then.
 */
async function workInPress(
  page: Page,
  button: string,
  isMarkSkipped: boolean,
): Promise<{work: number; isRiding: boolean}> {
  let press = {from: 0, to: 0, isRiding: false};
  const trace = await traceRendering(page, async () => {
    press = await page.evaluate(
      async ({name, skip}) => {
        const target = [...document.querySelectorAll('button')].find(
          element => element.textContent?.trim() === name,
        );
        const setAttribute = Element.prototype.setAttribute;
        if (skip) {
          Element.prototype.setAttribute = function (key, value) {
            if (key !== 'data-astryx-travelling') {
              setAttribute.call(this, key, value);
            }
          };
        }
        const from = performance.timeOrigin + performance.now();
        target?.click();
        // Resolved promises keep the task open, so no frame runs meanwhile.
        for (let hop = 0; hop < 8; hop++) {
          await Promise.resolve();
        }
        const to = performance.timeOrigin + performance.now();
        Element.prototype.setAttribute = setAttribute;
        return {
          from,
          to,
          isRiding:
            document.querySelector(
              '#storybook-root li[data-astryx-travelling]',
            ) != null,
        };
      },
      {name: button, skip: isMarkSkipped},
    );
  });
  const counts = countBetween(trace, press.from, press.to);
  return {
    work: (counts.UpdateLayoutTree ?? 0) + (counts.Layout ?? 0),
    isRiding: press.isRiding,
  };
}

test('a reorder with a row riding across others restyles and lays out the page in its commit no more often than with no row marked to ride', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Chromium traces layouts through CDP');
  await open(page);
  const skipped = await workInPress(page, 'Move the last row first', true);
  await open(page);
  const marked = await workInPress(page, 'Move the last row first', false);
  expect(skipped.isRiding).toBe(false);
  expect(marked.isRiding).toBe(true);
  expect(
    marked.work,
    `with the row marked: ${marked.work}; with no mark: ${skipped.work}`,
  ).toBe(skipped.work);
});

test('a change with a row swiped open lays the page out no more often than the same change with none', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Chromium counts layouts and drives the swipe through CDP',
  );
  const layoutsFor = async (isSwiped: boolean) => {
    await open(page, SWIPE_STORY);
    const cdp = await page.context().newCDPSession(page);
    if (isSwiped) {
      const sent = row(page, 'Sent');
      await expect(
        sent.locator('[data-swipe-panel="trailing"]'),
      ).toBeAttached();
      const box = await sent.boundingBox();
      if (box == null) {
        throw new Error('no row');
      }
      const y = box.y + box.height / 2;
      const startX = box.x + box.width - 24;
      await cdp.send('Input.dispatchTouchEvent', {
        touchPoints: [{x: startX, y}],
        type: 'touchStart',
      });
      for (const fraction of [0.02, 0.05, 0.1, 0.15, 0.2, 0.25]) {
        await cdp.send('Input.dispatchTouchEvent', {
          touchPoints: [{x: startX - box.width * fraction, y}],
          type: 'touchMove',
        });
        await page.waitForTimeout(40);
      }
      await cdp.send('Input.dispatchTouchEvent', {
        touchPoints: [],
        type: 'touchEnd',
      });
      await expect
        .poll(async () =>
          sent.evaluate(
            el => new DOMMatrix(getComputedStyle(el).transform).m41,
          ),
        )
        .toBeLessThan(-20);
    }
    await expect
      .poll(async () => page.evaluate(() => document.getAnimations().length))
      .toBe(0);
    await cdp.detach();
    // Counted on the page's own clock, from the click through the next two
    // frames. A count read over the runner's round trips also takes a layout
    // of other page work in them. A story that just opened can do such work.
    let change = {from: 0, to: 0};
    const trace = await traceRendering(page, async () => {
      // A click with no pointer, so no swipe closes and no hover restyles.
      change = await page.evaluate(async () => {
        const button = [...document.querySelectorAll('button')].find(
          element => element.textContent?.trim() === 'Move Archive first',
        );
        const from = performance.timeOrigin + performance.now();
        button?.click();
        // The third frame's callback runs once the second frame has laid
        // out, so the window holds both frames' work.
        await new Promise<void>(resolve => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        return {from, to: performance.timeOrigin + performance.now()};
      });
    });
    return countBetween(trace, change.from, change.to).Layout ?? 0;
  };
  const none = await layoutsFor(false);
  const swiped = await layoutsFor(true);
  expect(swiped, `with a row swiped open: ${swiped}; with none: ${none}`).toBe(
    none,
  );
});

test('a row swiped away lays the page out no more often than the same swipe with no translation on the row, and never glides sideways', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Chromium counts layouts and drives the swipe through CDP',
  );
  const swipeAway = async (isTranslated: boolean) => {
    await open(page, SWIPE_STORY);
    const cdp = await page.context().newCDPSession(page);
    const sent = row(page, 'Sent');
    await expect(sent.locator('[data-swipe-panel="trailing"]')).toBeAttached();
    if (!isTranslated) {
      // The same gesture and removal, with no translation on the row.
      await sent.evaluate(el => {
        el.style.setProperty('transform', 'none', 'important');
      });
    }
    const box = await sent.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    // From the frame where Sent is put back for its exit, it counts the glides
    // that would move it sideways.
    await page.evaluate(() => {
      const state = {sideways: -1};
      (window as unknown as {__exit: typeof state}).__exit = state;
      const tick = () => {
        const exit = document.querySelector(
          '#storybook-root li[data-astryx-leaving]',
        );
        if (exit != null) {
          // A glide that moves it in the list keeps x at 0.
          state.sideways = exit
            .getAnimations()
            .filter(animation =>
              (animation.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some(
                  frame =>
                    'translate' in frame &&
                    !String(frame.translate).startsWith('0px'),
                ),
            ).length;
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 24;
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [{x: startX, y}],
      type: 'touchStart',
    });
    for (const fraction of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) {
      await cdp.send('Input.dispatchTouchEvent', {
        touchPoints: [{x: startX - box.width * fraction, y}],
        type: 'touchMove',
      });
      await page.waitForTimeout(40);
    }
    await cdp.send('Performance.enable');
    const layouts = async () => {
      const {metrics} = await cdp.send('Performance.getMetrics');
      return metrics.find(metric => metric.name === 'LayoutCount')?.value ?? 0;
    };
    const before = await layouts();
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd',
    });
    await expect(leaving(page)).toHaveCount(1, {timeout: 3000});
    await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
    const after = await layouts();
    const sideways = await page.evaluate(
      () => (window as unknown as {__exit: {sideways: number}}).__exit.sideways,
    );
    await cdp.detach();
    return {layouts: after - before, sideways};
  };
  const plain = await swipeAway(false);
  const swiped = await swipeAway(true);
  // The leaving row exits where it was: nothing glides it sideways.
  expect(swiped.sideways, JSON.stringify({plain, swiped})).toBe(0);
  // Its settle costs no layout of its own.
  expect(swiped.layouts, JSON.stringify({plain, swiped})).toBeLessThanOrEqual(
    plain.layouts,
  );
});

/**
 * Swipes `label` away, and in the first frame that shows its exit presses
 * `button`. Once the press commits, in the same task, it reads the rows' order
 * and the leaving row's glides and top. It also returns the row's top as its
 * exit started.
 */
async function secondChangeDuringExit(
  page: Page,
  label: string,
  button: string,
): Promise<{
  starts: string[];
  order: string[];
  topBefore: number;
  topAfter: number;
}> {
  await open(page, SWIPE_STORY);
  const target = row(page, label);
  await expect(target.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  const box = await target.boundingBox();
  if (box == null) {
    throw new Error('no row');
  }
  await page.evaluate(
    ({button}) => {
      (window as unknown as {__second: object | null}).__second = null;
      const labelOf = (li: Element) => {
        const copy = li.cloneNode(true) as Element;
        for (const panel of copy.querySelectorAll('[data-swipe-panel]')) {
          panel.remove();
        }
        return copy.textContent?.trim() ?? '';
      };
      const tick = () => {
        const exit = document.querySelector(
          '#storybook-root li[data-astryx-leaving]',
        );
        if (exit == null) {
          requestAnimationFrame(tick);
          return;
        }
        const topBefore = exit.getBoundingClientRect().top;
        // The exit lasts under half a second. A timer or a frame between this
        // frame and the reads can come after it ends on a loaded runner. So
        // the press lands now, and the reads follow React's commit of it,
        // which runs in a microtask before this frame renders.
        [...document.querySelectorAll('button')]
          .find(element => element.textContent?.trim() === button)
          ?.click();
        const read = () => {
          (window as unknown as {__second: object}).__second = {
            starts: exit.getAnimations().flatMap(animation => {
              const first = (
                animation.effect as KeyframeEffect | null
              )?.getKeyframes()[0]?.translate;
              return typeof first === 'string' ? [first] : [];
            }),
            order: [...document.querySelectorAll('#storybook-root li')].map(
              li =>
                `${li.hasAttribute('data-astryx-leaving') ? 'leaving:' : ''}${labelOf(li)}`,
            ),
            topBefore,
            topAfter: exit.getBoundingClientRect().top,
          };
        };
        // After the microtasks that the commit queues in turn.
        queueMicrotask(() => queueMicrotask(() => queueMicrotask(read)));
      };
      requestAnimationFrame(tick);
    },
    {button},
  );
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + box.width - 24;
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [{x: startX, y}],
    type: 'touchStart',
  });
  for (const fraction of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9]) {
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [{x: startX - box.width * fraction, y}],
      type: 'touchMove',
    });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd',
  });
  await expect
    .poll(async () =>
      page.evaluate(
        () => (window as unknown as {__second: object | null}).__second != null,
      ),
    )
    .toBe(true);
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __second: {
            starts: string[];
            order: string[];
            topBefore: number;
            topAfter: number;
          };
        }
      ).__second,
  );
}

test('a row swiped away and still exiting stays in its place when a row moves above it, and no glide moves it sideways', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the swipe is driven with Chromium touch events (CDP)',
  );
  const second = await secondChangeDuringExit(
    page,
    'Sent',
    'Move Archive first',
  );
  for (const start of second.starts) {
    expect(start.split(' ')[0], JSON.stringify(second)).toBe('0px');
  }
  // One staying row came before it, so it stays second, where it showed.
  expect(second.order.indexOf('leaving:Sent'), JSON.stringify(second)).toBe(1);
  expect(second.topAfter, JSON.stringify(second)).toBeCloseTo(
    second.topBefore,
    0,
  );
  await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
});

test('a row swiped away and still exiting stays in its place when the row after it moves', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the swipe is driven with Chromium touch events (CDP)',
  );
  const second = await secondChangeDuringExit(
    page,
    'Drafts',
    'Move Archive first',
  );
  expect(second.order, JSON.stringify(second)).toEqual([
    'Archive',
    'Inbox',
    'leaving:Drafts',
    'Sent',
    'Notes',
  ]);
  expect(second.topAfter, JSON.stringify(second)).toBeCloseTo(
    second.topBefore,
    0,
  );
  await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
});

test('a row a swipe left open, still moving when another row is swiped away, is left as the swipe moves it: the list leaves no transform on it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'the swipe is driven with Chromium touch events (CDP)',
  );
  await open(page, SWIPE_STORY);
  const sent = row(page, 'Sent');
  const drafts = row(page, 'Drafts');
  await expect(sent.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  await expect(drafts.locator('[data-swipe-panel="trailing"]')).toBeAttached();
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (target: typeof sent, fractions: number[]) => {
    const box = await target.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    const y = box.y + box.height / 2;
    const startX = box.x + box.width - 24;
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [{x: startX, y}],
      type: 'touchStart',
    });
    for (const fraction of fractions) {
      await cdp.send('Input.dispatchTouchEvent', {
        touchPoints: [{x: startX - box.width * fraction, y}],
        type: 'touchMove',
      });
      await page.waitForTimeout(40);
    }
    await cdp.send('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd',
    });
  };
  // Sent's actions open part of the way; the next swipe closes them, so
  // Sent is still translated as Drafts leaves.
  await swipe(sent, [0.02, 0.05, 0.1, 0.15, 0.2, 0.25]);
  await expect
    .poll(async () =>
      sent.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41),
    )
    .toBeLessThan(-20);
  await swipe(drafts, [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9]);
  await expect(row(page, 'Drafts')).toHaveCount(0, {timeout: 5000});
  await expect(leaving(page)).toHaveCount(0, {timeout: 3000});
  await expect
    .poll(async () =>
      sent.evaluate(el => el.getAnimations({subtree: true}).length),
    )
    .toBe(0);
  // Sent rests where its swipe leaves it (open or closed), and its content
  // carries no transform the list wrote while Drafts left.
  const after = await sent.evaluate(el => {
    const content = el.querySelector<HTMLElement>(
      ':scope > :not([data-swipe-panel])',
    );
    return {
      own: new DOMMatrix(getComputedStyle(el).transform).m41,
      inline: content?.style.transform ?? null,
      computed: content == null ? null : getComputedStyle(content).transform,
    };
  });
  expect(after.inline, JSON.stringify(after)).toBe('');
  expect(after.computed, JSON.stringify(after)).toBe('none');
});
