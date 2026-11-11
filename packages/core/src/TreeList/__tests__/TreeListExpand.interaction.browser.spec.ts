// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TreeListExpand.interaction.browser.spec.ts
 * @input The built TreeList stories, real touch and mouse input, and the
 *   interaction harness
 * @output Proofs for a TreeList row's expand and collapse. Under a finger the
 *   rows below glide on the shared layout glide, and the group fades on the
 *   same timing. No frame shows a blank band, and the guide lines show and
 *   hide with the group. A mouse changes at once.
 * @position Interaction evidence for TreeList's expansion motion, with an
 *   Android case, a mouse case and an animatedLayout handle case
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
  blockMainThread,
  busyWindowProof,
  MARKER_RGB,
  openStory,
  releaseAnimations,
  requireFrames,
  seekAnimations,
  startBusyControl,
  startCompositorTrace,
  startScreencast,
  touchDriver,
  trackMarker,
  withStorybook,
  writeEvidence,
  type Box,
  type CastFrame,
  type HeldAnimation,
  watchAnimations,
} from '@astryxdesign/interaction-harness';
import {expectReducedMotionCrossFade} from '../../List/__tests__/reducedMotion';

const storybook = withStorybook(test);

const STORY = 'core-treelist--basic';

/** A tree row by its item id (an ancestor row contains its label too). */
const treeItem = (page: Page, id: string) =>
  page.locator(`[role="treeitem"][data-tree-id="${id}"]`);

/** The "components" folder's toggle, group and chevron, a child, a row below. */
function parts(page: Page) {
  const parent = treeItem(page, 'components');
  return {
    parent,
    // Its own toggle, group and chevron: not a descendant row's.
    toggle: parent.locator(':scope > :not([role="group"]) [data-tree-toggle]'),
    group: parent.locator(':scope > [role="group"]'),
    // The chevron's Icon, which turns: its own target, around the glyph.
    chevron: parent.locator(
      ':scope > :not([role="group"]) [data-tree-toggle] .astryx-icon',
    ),
    child: treeItem(page, 'button'),
    below: treeItem(page, 'app'),
  };
}

/** The `y` of an element's `translate`, as the engine presents it. */
const translateY = async (element: Locator) =>
  element.evaluate(el => {
    const value = getComputedStyle(el).translate;
    if (value === 'none' || value === '') {
      return 0;
    }
    const [, y = '0px'] = value.split(' ');
    return Number.parseFloat(y);
  });

/**
 * The chevron's angle on screen, degrees, read from its transform. The angle
 * of `b` over `d` reads the same with the right-to-left mirror.
 */
const rotation = async (element: Locator) =>
  element.evaluate(el => {
    const matrix = /matrix\(([^)]+)\)/.exec(getComputedStyle(el).transform);
    const [, b = 0, , d = 1] =
      matrix == null ? [] : matrix[1].split(',').map(Number);
    return (Math.atan2(b, d) * 180) / Math.PI;
  });

async function tapToggle(page: Page) {
  const {toggle} = parts(page);
  const box = await toggle.boundingBox();
  if (box == null) {
    throw new Error('no toggle');
  }
  const driver = await touchDriver(page);
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
}

async function open(page: Page, story = STORY) {
  await openStory(page, storybook(), story);
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'the expansion moves under a finger only');
  await expect(parts(page).below).toBeVisible();
}

/** What one frame of an expand or a collapse shows, in px. */
interface Frame {
  readonly t: number;
  /** The bottom of the folder's own row. */
  readonly parentBottom: number;
  /**
   * The group's top, its height, the part of it that shows, its opacity, and
   * whether it is inert.
   */
  readonly group: {
    readonly top: number;
    readonly height: number;
    readonly shown: number;
    readonly opacity: number;
    readonly isInert: boolean;
  } | null;
  /** The top of the first row below the folder, with its motion. */
  readonly belowTop: number;
  /** The bottom of the folder's last sibling's own row, with its motion. */
  readonly lastBottom: number;
  /** The lowest point the folder's guide column paints. */
  readonly guideBottom: number;
  /** The tree's box, top and bottom. */
  readonly treeTop: number;
  readonly treeBottom: number;
  /** How far past its top and bottom edges the tree paints; null: no clip. */
  readonly paint: {readonly top: number; readonly bottom: number} | null;
  /** The bottom of the tree's last row, with its motion. */
  readonly lowestBottom: number;
  /** The focused row's focus ring, top and bottom; null: no ring. */
  readonly ring: {readonly top: number; readonly bottom: number} | null;
}

/**
 * Records every frame the page presents while `act` runs and for `ms` after.
 * The part of the group that shows is its box less its clip and the slide of
 * its rows. A blank band then reads as a gap above the row below.
 */
async function recordFrames(
  page: Page,
  act: () => Promise<void>,
  ms = 700,
): Promise<Frame[]> {
  await page.evaluate(() => {
    const w = window as unknown as {__frames: unknown[]; __record: boolean};
    w.__frames = [];
    w.__record = true;
    const item = (id: string) =>
      document.querySelector<HTMLElement>(
        `[role="treeitem"][data-tree-id="${id}"]`,
      );
    // A row's own box: the part of its item that holds its content.
    const rowBox = (li: Element) =>
      [...li.children].find(
        child =>
          child.tagName === 'DIV' &&
          child.querySelector('.astryx-tree-list-item') != null,
      ) ?? li;
    const insetBottom = (clip: string) => {
      const match = /inset\(([^)]*)\)/.exec(clip);
      if (match == null) {
        return 0;
      }
      const sides = match[1].trim().split(/\s+/).map(Number.parseFloat);
      return sides.length >= 3 ? sides[2] : sides[0];
    };
    const translateOf = (el: Element) => {
      const value = getComputedStyle(el).translate;
      return value === 'none' || value === ''
        ? 0
        : Number.parseFloat(value.split(' ')[1] ?? '0');
    };
    const tick = () => {
      const parent = item('components');
      const below = item('app');
      const last = item('index');
      if (parent == null || below == null || last == null) {
        return;
      }
      const group = parent.querySelector<HTMLElement>(
        ':scope > [role="group"]',
      );
      let shownGroup = null;
      if (group != null) {
        const box = group.getBoundingClientRect();
        const style = getComputedStyle(group);
        const first = group.querySelector(':scope > [role="treeitem"]');
        const slide = first == null ? 0 : Math.min(0, translateOf(first));
        shownGroup = {
          top: box.top,
          height: box.height,
          shown: Math.max(
            0,
            Math.min(box.height, box.height - insetBottom(style.clipPath)) +
              slide,
          ),
          opacity: Number(style.opacity),
          isInert: group.inert,
        };
      }
      const column = below
        .querySelector('.astryx-tree-list-guide')
        ?.getBoundingClientRect();
      const columnX = column == null ? 0 : column.left + column.width / 2;
      let guideBottom = 0;
      for (const line of document.querySelectorAll(
        '[role="tree"] .astryx-tree-list-guide',
      )) {
        const box = line.getBoundingClientRect();
        if (
          box.height === 0 ||
          Math.abs(box.left + box.width / 2 - columnX) > 1
        ) {
          continue;
        }
        const bottom =
          group != null && shownGroup != null && group.contains(line)
            ? Math.min(box.bottom, shownGroup.top + shownGroup.shown)
            : box.bottom;
        guideBottom = Math.max(guideBottom, bottom);
      }
      const tree = parent.closest<HTMLElement>('[role="tree"]');
      const treeBox = tree?.getBoundingClientRect();
      const treeClip = tree == null ? 'none' : getComputedStyle(tree).clipPath;
      const sides = /inset\(([^)]*)\)/
        .exec(treeClip)?.[1]
        .trim()
        .split(/\s+/)
        .map(Number.parseFloat);
      const rows = tree?.querySelectorAll('[role="treeitem"]') ?? [];
      const lowest = rows[rows.length - 1];
      // The ring is the outline of the part of the focused row that draws it.
      const focused = document.activeElement?.closest('[role="treeitem"]');
      const ringOwner =
        focused == null
          ? null
          : [rowBox(focused), ...rowBox(focused).querySelectorAll('*')].find(
              el => Number.parseFloat(getComputedStyle(el).outlineWidth) > 0,
            );
      let ring = null;
      if (ringOwner != null) {
        const style = getComputedStyle(ringOwner);
        const reach =
          Number.parseFloat(style.outlineWidth) +
          Number.parseFloat(style.outlineOffset);
        const box = ringOwner.getBoundingClientRect();
        ring = {top: box.top - reach, bottom: box.bottom + reach};
      }
      w.__frames.push({
        t: performance.now(),
        parentBottom: rowBox(parent).getBoundingClientRect().bottom,
        group: shownGroup,
        belowTop: below.getBoundingClientRect().top,
        lastBottom: rowBox(last).getBoundingClientRect().bottom,
        guideBottom,
        treeTop: treeBox?.top ?? 0,
        treeBottom: treeBox?.bottom ?? 0,
        paint:
          sides == null || treeBox == null
            ? null
            : {
                top: treeBox.top + sides[0],
                bottom:
                  treeBox.bottom - (sides.length >= 3 ? sides[2] : sides[0]),
              },
        lowestBottom:
          lowest == null ? 0 : rowBox(lowest).getBoundingClientRect().bottom,
        ring,
      });
      if (w.__record) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await act();
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as {__frames: Frame[]; __record: boolean};
    w.__record = false;
    return w.__frames;
  });
}

/** The gap above the row below that no row of the group fills, per frame. */
const blankBands = (frames: ReadonlyArray<Frame>) =>
  frames.map(frame =>
    frame.group == null
      ? frame.belowTop - frame.parentBottom
      : frame.belowTop - (frame.group.top + frame.group.shown),
  );

/** How far a frame may put the rows that glide off the group's shown part. */
const BAND_ALLOWANCE = 1.5;

/**
 * Whether a frame shows the row below inside its travel, between a tenth and
 * nine tenths of the way. A jump shows it there at no frame rate.
 */
const insideTravel = (from: number, to: number) => {
  const margin = Math.abs(to - from) / 10;
  const low = Math.min(from, to) + margin;
  const high = Math.max(from, to) - margin;
  return (frame: Pick<Frame, 'belowTop'>) =>
    frame.belowTop > low && frame.belowTop < high;
};

/**
 * The times, ms into the glide, at which the theme's move curve covers each
 * share of the way. The glide samples that curve (`--ease-move`) over its
 * duration. The browser evaluates the curve here on a probe of its own. So
 * at these times a glide that jumps is at its end, not inside its travel.
 */
async function timesAtShares(
  page: Page,
  ms: number,
  shares: ReadonlyArray<number>,
): Promise<number[]> {
  return page.locator('[role="tree"]').evaluate(
    (tree, {duration, wanted}) => {
      const easing = getComputedStyle(tree)
        .getPropertyValue('--ease-move')
        .trim();
      const probe = document.createElement('div');
      document.body.append(probe);
      const curve = probe.animate([{opacity: 0}, {opacity: 1}], {
        duration: 1000,
        easing,
        fill: 'both',
      });
      curve.pause();
      const shareAt = (fraction: number) => {
        curve.currentTime = fraction * 1000;
        return Number(getComputedStyle(probe).opacity);
      };
      const times = wanted.map(share => {
        let low = 0;
        let high = 1;
        for (let step = 0; step < 30; step++) {
          const middle = (low + high) / 2;
          if (shareAt(middle) < share) {
            low = middle;
          } else {
            high = middle;
          }
        }
        return ((low + high) / 2) * duration;
      });
      curve.cancel();
      probe.remove();
      return times;
    },
    {duration: ms, wanted: shares},
  );
}

/** The shares of the travel at which the held glide is read. */
const SHARES = [0.2, 0.4, 0.6, 0.8];

/**
 * Seeks the held motion to each time in `times`, offset from the held origin
 * like the rows' glide. At each point it reads the row below's top and the
 * group, while the group shows.
 */
async function seekThroughGlide(
  page: Page,
  held: ReadonlyArray<HeldAnimation>,
  times: ReadonlyArray<number>,
) {
  const glide = held.find(
    animation =>
      animation.kind === 'Animation' &&
      animation.keyframes.some(frame => 'translate' in frame),
  );
  if (glide == null) {
    throw new Error(`no glide held: ${JSON.stringify(held)}`);
  }
  const {below, group} = parts(page);
  const points = [];
  for (const time of times) {
    await seekAnimations(page, time + glide.offsetMs);
    points.push({
      time,
      belowTop: (await below.boundingBox())?.y ?? 0,
      group:
        (await group.count()) === 0
          ? null
          : await group.evaluate(el => ({
              opacity: Number(getComputedStyle(el).opacity),
              isInert: (el as HTMLElement).inert,
            })),
    });
  }
  return points;
}

/**
 * The glide's duration in the two cases that record every frame, ms. WebKit
 * can present no frame for about 70 ms while it first composites a newly
 * animated layer, longer on a loaded runner. The stock 300 ms glide eases out
 * and is mid-travel for only about 113 ms, so one such stall can leave a
 * single frame there. At 1200 ms the same curve is mid-travel for about
 * 450 ms. A theme may set any duration; the stock one is checked on its own.
 */
const RECORDED_GLIDE_MS = 1200;

/** How long the page is held past a glide's end, ms. */
const TAIL_BLOCK_MS = 500;

/** A pixel darker than this, on a 0 to 255 grey, is ink. */
const INK_BELOW = 230;

/**
 * How many ink pixels of each frame inside `box`, and of `rest`, have no ink
 * within one pixel in the other. A motion drawn within half a pixel of its
 * end matches, as does text a layer draws a shade lighter. Two frames of one
 * scene count 0 in both engines. Frames are decoded in a scratch page, as
 * trackMarker decodes them.
 */
async function inkOffRest(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  rest: CastFrame,
  box: Box,
): Promise<number[]> {
  const scratch = await page.context().newPage();
  try {
    const counts: number[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      counts.push(
        ...(await scratch.evaluate(
          async ({items, base, area, below}) => {
            const inkOf = async (frame: typeof base) => {
              const blob = await (
                await fetch(`data:image/${frame.format};base64,${frame.data}`)
              ).blob();
              const bitmap = await createImageBitmap(blob);
              const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
              const context = canvas.getContext('2d');
              if (context == null) {
                throw new Error('no 2d context');
              }
              context.drawImage(bitmap, 0, 0);
              const scale = bitmap.width / frame.viewportWidth;
              const {data, width, height} = context.getImageData(
                Math.floor(area.x * scale),
                Math.floor(area.y * scale),
                Math.ceil(area.width * scale),
                Math.ceil(area.height * scale),
              );
              const ink = new Uint8Array(width * height);
              for (let p = 0; p < ink.length; p += 1) {
                const grey =
                  (data[p * 4] + data[p * 4 + 1] + data[p * 4 + 2]) / 3;
                ink[p] = grey < below ? 1 : 0;
              }
              return {ink, width, height};
            };
            // Ink in `a` with no ink in `b` within one pixel.
            const missing = (
              a: Uint8Array,
              b: Uint8Array,
              width: number,
              height: number,
            ) => {
              let count = 0;
              for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                  if (a[y * width + x] === 0) {
                    continue;
                  }
                  let isNear = false;
                  for (let dy = -1; dy <= 1 && !isNear; dy += 1) {
                    for (let dx = -1; dx <= 1 && !isNear; dx += 1) {
                      const ny = y + dy;
                      const nx = x + dx;
                      isNear =
                        ny >= 0 &&
                        ny < height &&
                        nx >= 0 &&
                        nx < width &&
                        b[ny * width + nx] === 1;
                    }
                  }
                  if (!isNear) {
                    count += 1;
                  }
                }
              }
              return count;
            };
            const at = await inkOf(base);
            const out: number[] = [];
            for (const item of items) {
              const {ink} = await inkOf(item);
              out.push(
                missing(ink, at.ink, at.width, at.height) +
                  missing(at.ink, ink, at.width, at.height),
              );
            }
            return out;
          },
          {
            items: frames.slice(i, i + 12).map(f => ({
              data: f.data,
              format: f.format,
              viewportWidth: f.viewportWidth,
            })),
            base: {
              data: rest.data,
              format: rest.format,
              viewportWidth: rest.viewportWidth,
            },
            area: box,
            below: INK_BELOW,
          },
        )),
      );
    }
    return counts;
  } finally {
    await scratch.close();
  }
}

/** Sets the glide's duration where the tree reads it, as a theme does. */
const lengthenGlide = async (page: Page, ms: number) =>
  page
    .locator('[role="tree"]')
    .evaluate(
      (tree, duration) =>
        (tree as HTMLElement).style.setProperty(
          '--duration-medium',
          `${duration}ms`,
        ),
      ms,
    );

/** Waits until nothing in the tree animates. */
const treeAtRest = async (page: Page) =>
  expect
    .poll(async () =>
      page
        .locator('[role="tree"]')
        .evaluate(tree => tree.getAnimations({subtree: true}).length),
    )
    .toBe(0);

/** The theme's glide duration where the tree is, in ms. */
const glideMs = async (page: Page) =>
  page.locator('[role="tree"]').evaluate(tree => {
    const probe = document.createElement('div');
    probe.style.transitionDuration = 'var(--duration-medium)';
    tree.append(probe);
    const value = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return value.endsWith('ms')
      ? Number.parseFloat(value)
      : Number.parseFloat(value) * 1000;
  });

/**
 * The property each part of the expand animates itself. A watch also reports
 * runs inside its element, such as the group's rows' glides.
 */
const OWN_MOTION = {
  group: 'opacity',
  below: 'translate',
  chevron: 'transform',
} as const;

/**
 * Watches the expand's parts before a tap, so the durations of the motion it
 * starts are read even once it has ended. Await it before the tap, and await
 * what it returns after.
 */
async function watchStartedDurations(
  page: Page,
  names: ReadonlyArray<'group' | 'below' | 'chevron'> = [
    'group',
    'below',
    'chevron',
  ],
) {
  const all = parts(page);
  const watches = await Promise.all(
    names.map(async name => [name, await watchAnimations(all[name])] as const),
  );
  return async () =>
    Object.fromEntries(
      await Promise.all(
        watches.map(
          async ([name, watch]) =>
            [
              name,
              (await watch.started())
                .filter(run =>
                  run.keyframes.some(frame => OWN_MOTION[name] in frame),
                )
                .map(run => run.durationMs),
            ] as const,
        ),
      ),
    ) as Partial<Record<'group' | 'below' | 'chevron', number[]>>;
}

test('expand under a finger: the rows below glide while the group fades in, and no frame shows a blank band', async ({
  page,
}) => {
  await open(page);
  await lengthenGlide(page, RECORDED_GLIDE_MS);
  const before = (await parts(page).below.boundingBox())?.y ?? 0;
  const frames = await recordFrames(
    page,
    async () => tapToggle(page),
    RECORDED_GLIDE_MS + 400,
  );
  const moving = frames.filter(frame => frame.group != null);
  expect(moving.length, 'frames with the group').toBeGreaterThan(4);
  const height = moving[0].group?.height ?? 0;
  // The checks below judge at least two frames of the glide. A page starved
  // of frames fails by name.
  requireFrames(frames, {
    min: 2,
    during: 'the rows below glide down',
    where: insideTravel(before, before + height),
  });
  // Every frame: the row below sits right under the part of the group that
  // shows. A blank band between them is the flicker.
  for (const [i, band] of blankBands(moving).entries()) {
    expect(band, `frame ${i}: ${JSON.stringify(moving[i])}`).toBeLessThan(
      BAND_ALLOWANCE,
    );
  }
  // The group fades in from its first frame: it does not show at rest first.
  expect(moving[0].group?.opacity ?? 1).toBeLessThan(1);
  expect(frames[frames.length - 1].belowTop - before).toBeCloseTo(height, 0);
  // The row below passes through its travel, not one jump. How many frames
  // land inside it depends on the runner. So the glide's own timeline is read
  // too: the row moves down through its travel as the glide's time runs.
  const {below, group} = parts(page);
  await tapToggle(page);
  await expect(group).toHaveCount(0);
  await treeAtRest(page);
  const times = await timesAtShares(page, await glideMs(page), SHARES);
  const glide = await armHold(page, below, {
    judges: {target: below, property: 'translate'},
  });
  await tapToggle(page);
  const points = await seekThroughGlide(page, await glide.held(), times);
  for (const [i, point] of points.entries()) {
    expect(
      insideTravel(before, before + height)(point),
      JSON.stringify(points),
    ).toBe(true);
    if (i > 0) {
      expect(point.belowTop, JSON.stringify(points)).toBeGreaterThan(
        points[i - 1].belowTop,
      );
    }
  }
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => translateY(below)).toBe(0);
});

test('collapse under a finger: the group fades out as the rows below glide up, with no jump and no blank band', async ({
  page,
}) => {
  await open(page);
  await tapToggle(page);
  await expect(parts(page).child).toBeVisible();
  await page.waitForTimeout(700);
  await lengthenGlide(page, RECORDED_GLIDE_MS);
  const expanded = (await parts(page).below.boundingBox())?.y ?? 0;
  const height = (await parts(page).group.boundingBox())?.height ?? Number.NaN;
  const frames = await recordFrames(
    page,
    async () => tapToggle(page),
    RECORDED_GLIDE_MS + 400,
  );
  // The checks below judge at least two frames of the glide, three of the
  // fade and five of the leaving group. A page starved of frames fails by name.
  requireFrames(frames, {
    min: 2,
    during: 'the rows below glide up',
    where: insideTravel(expanded, expanded - height),
  });
  requireFrames(frames, {
    min: 5,
    during: 'the group leaves',
    where: frame => frame.group != null,
  });
  const fading = requireFrames(frames, {
    min: 3,
    during: 'the group fades out',
    where: frame => frame.group != null && frame.group.opacity < 1,
  });
  // It takes no input while it fades out, on every frame that shows it.
  for (const frame of fading) {
    expect(frame.group?.isInert, JSON.stringify(frame)).toBe(true);
  }
  for (const [i, band] of blankBands(frames).entries()) {
    expect(band, `frame ${i}: ${JSON.stringify(frames[i])}`).toBeLessThan(1.5);
  }
  expect(expanded - frames[frames.length - 1].belowTop).toBeCloseTo(height, 0);
  await expect(parts(page).group).toHaveCount(0);
  // How many frames land inside the collapse depends on the runner, so its
  // own timeline is read too. As its time runs, the group still shows, inert
  // and fading, and the row below moves up through its travel.
  const {group, below} = parts(page);
  await tapToggle(page);
  await expect(parts(page).child).toBeVisible();
  await treeAtRest(page);
  const times = await timesAtShares(page, await glideMs(page), SHARES);
  const collapse = await armHold(page, page.locator('[role="tree"]'), {
    count: 2,
    judges: [
      {target: group, property: 'opacity'},
      {target: below, property: 'translate'},
    ],
  });
  await tapToggle(page);
  const points = await seekThroughGlide(page, await collapse.held(), times);
  for (const [i, point] of points.entries()) {
    const summary = JSON.stringify(points);
    expect(point.group?.isInert, summary).toBe(true);
    expect(point.group?.opacity ?? 0, summary).toBeGreaterThan(0.05);
    expect(point.group?.opacity ?? 1, summary).toBeLessThan(0.95);
    expect(insideTravel(expanded, expanded - height)(point), summary).toBe(
      true,
    );
    if (i > 0) {
      expect(point.belowTop, summary).toBeLessThan(points[i - 1].belowTop);
      expect(point.group?.opacity ?? 1, summary).toBeLessThan(
        points[i - 1].group?.opacity ?? 0,
      );
    }
  }
  await releaseAnimations(page, {finish: true});
  await expect(group).toHaveCount(0);
});

test('collapse under a finger: a long task over the end of the glide draws the tree as it rests, its leaving rows and chevron included', async ({
  page,
}) => {
  await open(page);
  await tapToggle(page);
  await expect(parts(page).child).toBeVisible();
  await treeAtRest(page);
  await lengthenGlide(page, RECORDED_GLIDE_MS);
  const {below, group} = parts(page);
  // The compositor's own box keeps frames coming while the page is held.
  const control = await startBusyControl(page);
  const cast = await startScreencast(page);
  await expect
    .poll(() => cast.frameCount(), {
      message: 'the screencast delivers frames',
      timeout: 5000,
    })
    .toBeGreaterThan(0);
  // The page holds its main thread from nine tenths of the glide to past its
  // end, like a long task as a collapse ends.
  const blocked = blockMainThread(page, TAIL_BLOCK_MS, {
    during: below,
    minProgressMs: RECORDED_GLIDE_MS * 0.9,
  });
  await tapToggle(page);
  const block = await blocked;
  await treeAtRest(page);
  await expect(group).toHaveCount(0);
  // One more frame once the tree rests, while the control still moves.
  const atRest = cast.frameCount();
  await expect
    .poll(() => cast.frameCount(), {
      message: 'a frame of the tree at rest',
      timeout: 5000,
    })
    .toBeGreaterThan(atRest);
  const frames = await cast.stop();
  await control.remove();
  // The glide ends at most a tenth of it after the block begins. Each frame
  // two frames past that, while the page is held, is judged.
  const ended = block.from + RECORDED_GLIDE_MS * 0.1 + 34;
  const held = requireFrames(frames, {
    min: 3,
    during: 'the page is held past the end of the glide',
    where: frame => frame.t > ended && frame.t < block.to,
  });
  // Each held frame draws the tree as its frame at rest does: the rows below
  // at their place, no leaving row, the chevron turned.
  const box = await page.locator('[role="tree"]').boundingBox();
  if (box == null) {
    throw new Error('the tree has no box');
  }
  const off = await inkOffRest(page, held, frames[frames.length - 1], box);
  for (const [index, count] of off.entries()) {
    expect(
      count,
      JSON.stringify({frame: Math.round(held[index].t - block.from), off}),
    ).toBe(0);
  }
});

test('collapse under a finger: no row of the tree paints past its bottom edge onto the content after it', async ({
  page,
}) => {
  await open(page, 'core-treelist--with-content-below');
  await tapToggle(page);
  await expect(parts(page).child).toBeVisible();
  await page.waitForTimeout(700);
  const frames = await recordFrames(page, async () => tapToggle(page));
  expect(
    frames.some(frame => frame.lowestBottom > frame.treeBottom + 1),
    'frames where the last row lies past the tree',
  ).toBe(true);
  for (const [i, frame] of frames.entries()) {
    // The rows gliding up show only as they enter the tree's box. Past it,
    // only a focus ring's reach paints: 5 px in the default theme.
    expect(
      Math.min(frame.lowestBottom, frame.paint?.bottom ?? Infinity),
      `frame ${i}: ${JSON.stringify(frame)}`,
    ).toBeLessThan(frame.treeBottom + 5.5);
  }
  // At rest the tree takes no clip.
  expect(frames[frames.length - 1].paint).toBeNull();
});

test('a focus ring on a row at the edge of a moving tree stays whole, while the tree moves and at rest', async ({
  page,
}) => {
  await open(page, 'core-treelist--with-content-below');
  const {toggle} = parts(page);
  // A click from the page toggles the folder and leaves focus where it is.
  const toggleFromPage = async () =>
    toggle.evaluate(el => {
      (el as HTMLElement).click();
    });
  // The last row, at the tree's bottom edge, while an expand moves the tree.
  await page.keyboard.press('Tab');
  await page.keyboard.press('End');
  const expand = await recordFrames(page, toggleFromPage);
  // The first row, at its top edge, while a collapse moves it.
  await page.keyboard.press('Home');
  const collapse = await recordFrames(page, toggleFromPage);
  for (const frames of [expand, collapse]) {
    expect(
      frames.some(frame => frame.paint != null),
      'frames with the clip',
    ).toBe(true);
    for (const [i, frame] of frames.entries()) {
      expect(frame.ring, `frame ${i}: no ring`).not.toBeNull();
      if (frame.ring != null && frame.paint != null) {
        expect(
          frame.ring.top,
          `frame ${i}: ${JSON.stringify(frame)}`,
        ).toBeGreaterThanOrEqual(frame.paint.top - 0.5);
        expect(
          frame.ring.bottom,
          `frame ${i}: ${JSON.stringify(frame)}`,
        ).toBeLessThanOrEqual(frame.paint.bottom + 0.5);
      }
    }
    expect(frames[frames.length - 1].paint).toBeNull();
  }
});

test('the guide lines beside a group show and hide with it: none runs past the last row it joins', async ({
  page,
}) => {
  await open(page);
  const expand = await recordFrames(page, async () => tapToggle(page));
  const collapse = await recordFrames(page, async () => tapToggle(page));
  for (const phase of [expand, collapse]) {
    for (const [i, frame] of phase.entries()) {
      expect(
        frame.guideBottom,
        `frame ${i}: ${JSON.stringify(frame)}`,
      ).toBeLessThan(frame.lastBottom + BAND_ALLOWANCE);
    }
  }
});

test('the rows below, the group and the chevron move on one timing: the theme’s glide', async ({
  page,
}) => {
  await open(page);
  const ms = await glideMs(page);
  const durations = await watchStartedDurations(page);
  await tapToggle(page);
  const started = await durations();
  expect(started.group, JSON.stringify(started)).toContain(ms);
  expect(started.below, JSON.stringify(started)).toContain(ms);
  expect(started.chevron, JSON.stringify(started)).toContain(ms);
});

for (const [written, value] of [
  ['a length', '600ms'],
  ['calc()', 'calc(300ms * 2)'],
] as const) {
  test(`a theme that lengthens the glide, written as ${written}, lengthens the expand`, async ({
    page,
  }) => {
    await open(page);
    // A theme sets its tokens on an ancestor: the tree reads them where it is.
    await page
      .locator('[role="tree"]')
      .evaluate(
        (tree, duration) =>
          (tree as HTMLElement).style.setProperty(
            '--duration-medium',
            duration,
          ),
        value,
      );
    expect(await glideMs(page)).toBe(600);
    const durations = await watchStartedDurations(page, ['group', 'below']);
    await tapToggle(page);
    const started = await durations();
    expect(started.group, JSON.stringify(started)).toContain(600);
    expect(started.below, JSON.stringify(started)).toContain(600);
  });
}

async function expandWithHandle(page: Page) {
  await openStory(page, storybook(), 'core-animated-layout--animated-layout');
  const folder = page.locator('[role="treeitem"][data-tree-id="photos"]');
  const toggle = folder.locator(
    ':scope > :not([role="group"]) [data-tree-toggle]',
  );
  return folder.evaluate(
    async (row, button) => {
      (button as HTMLElement).click();
      await new Promise(requestAnimationFrame);
      const tree = row.closest('[role="tree"]');
      const group = row.querySelector(':scope > [role="group"]');
      return document.getAnimations().map(animation => {
        const effect = animation.effect as KeyframeEffect | null;
        const target = effect?.target ?? null;
        const moves = [
          ...new Set(
            (effect?.getKeyframes() ?? []).flatMap(frame =>
              Object.keys(frame).filter(
                key =>
                  !['offset', 'computedOffset', 'easing', 'composite'].includes(
                    key,
                  ),
              ),
            ),
          ),
        ];
        const where =
          target == null
            ? 'none'
            : group?.contains(target)
              ? 'group'
              : tree?.contains(target)
                ? 'tree'
                : 'after';
        return {where, moves};
      });
    },
    await toggle.elementHandle(),
  );
}

test('with an animatedLayout handle, expanding a folder glides what follows it, after the tree too, under a finger and with a mouse', async ({
  page,
  browser,
}) => {
  const isGlideAfter = (animation: {where: string; moves: string[]}) =>
    animation.where === 'after' &&
    animation.moves.some(move => move === 'translate' || move === 'transform');
  const touch = await expandWithHandle(page);
  expect(touch.some(isGlideAfter), JSON.stringify(touch)).toBe(true);
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 900},
  });
  try {
    const mouse = await expandWithHandle(await context.newPage());
    expect(mouse.some(isGlideAfter), JSON.stringify(mouse)).toBe(true);
  } finally {
    await context.close();
  }
});

test('Android: a tap expands with the same motion (one touch model)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Android is Chromium');
  await open(page);
  const {child, below} = parts(page);
  const durations = await watchStartedDurations(page, ['below']);
  await tapToggle(page);
  await expect(child).toBeVisible();
  expect((await durations()).below?.length).toBeGreaterThan(0);
  await expect.poll(async () => translateY(below)).toBe(0);
});

test('a mouse: a click expands and collapses in one frame, as before', async ({
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
    const {group, child, below, toggle} = parts(page);
    await expect(below).toBeVisible();
    await toggle.click();
    await expect(child).toBeVisible();
    // No motion: the row below is already in place, nothing animating it.
    expect(await translateY(below)).toBe(0);
    expect(await below.evaluate(el => el.getAnimations().length)).toBe(0);
    expect(
      await group.evaluate(el => el.getAnimations({subtree: true}).length),
    ).toBe(0);
    await toggle.click();
    // The children leave with the click's own commit.
    await page.evaluate(
      async () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
    expect(await group.count()).toBe(0);
    expect(await translateY(below)).toBe(0);
  } finally {
    await context.close();
  }
});

test('a mouse under reduced motion: the group comes and goes at once, and the chevron turns on its own transition', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: false,
    isMobile: false,
    reducedMotion: 'reduce',
    viewport: {width: 900, height: 700},
  });
  const page = await context.newPage();
  try {
    await openStory(page, storybook(), STORY);
    expect(
      await page.evaluate(() => [
        matchMedia('(pointer: coarse)').matches,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
      ]),
    ).toEqual([false, true]);
    const {group, child, toggle, chevron} = parts(page);
    await expect(parts(page).below).toBeVisible();
    // The page holds the chevron's turn as soon as it runs.
    const turn = await armHold(page, chevron, {
      judges: {target: chevron, property: 'transform'},
    });
    await toggle.click();
    await expect(child).toBeVisible();
    const held = await turn.held();
    expect(
      held.map(animation => animation.kind),
      JSON.stringify(held),
    ).toContain('CSSTransition');
    // Nothing in the group moves or fades.
    expect(
      await group.evaluate(el => el.getAnimations({subtree: true}).length),
    ).toBe(0);
    await releaseAnimations(page, {finish: true});
    await expect.poll(async () => rotation(chevron)).toBeCloseTo(90, 1);
    await toggle.click();
    await page.evaluate(
      async () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
    expect(await group.count()).toBe(0);
  } finally {
    await context.close();
  }
});

test('under reduced motion and a finger, an expand cross-fades the group in place, opacity only, and the chevron lands at once', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page);
  const {parent, group, child, chevron, below} = parts(page);
  // The page holds the fade as it starts: a hold sent after the tap can come
  // too late on a busy machine.
  const fadeIn = await armHold(page, parent, {
    judges: {target: group, property: 'opacity'},
  });
  await tapToggle(page);
  await expect(child).toBeVisible();
  expectReducedMotionCrossFade(await fadeIn.held());
  // Nothing travels: the row below takes its place at once.
  expect(await translateY(below)).toBe(0);
  expect(await rotation(chevron)).toBeCloseTo(90, 1);
  await releaseAnimations(page, {finish: true});
  // A collapse fades the group out where it is, and nothing travels.
  const fadeOut = await armHold(page, parent, {
    newOnly: true,
    judges: {target: group, property: 'opacity'},
  });
  await tapToggle(page);
  expectReducedMotionCrossFade(await fadeOut.held());
  expect(await translateY(below)).toBe(0);
  await releaseAnimations(page, {finish: true});
  await expect(child).toHaveCount(0);
});

test("right to left: the chevron's quarter turn mirrors", async ({page}) => {
  // Storybook's direction toolbar (a global, not an arg).
  await page.goto(
    `${storybook()}/iframe.html?id=${STORY}&viewMode=story&globals=direction:rtl`,
  );
  await page.locator('#storybook-root > *').first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'the expansion moves under a finger only');
  const {chevron, child} = parts(page);
  await expect(parts(page).below).toBeVisible();
  expect(await chevron.evaluate(el => getComputedStyle(el).direction)).toBe(
    'rtl',
  );
  await tapToggle(page);
  await expect(child).toBeVisible();
  // The mirror lives in the chevron's transform: its horizontal scale is
  // negative, while its angle turns as it does left to right. The sign of
  // the matrix's determinant shows the mirror at every angle, at rest too.
  expect(
    await chevron.evaluate(el => {
      const {a, b, c, d} = new DOMMatrixReadOnly(
        getComputedStyle(el).transform,
      );
      return a * d - b * c;
    }),
  ).toBeLessThan(0);
  await expect.poll(async () => rotation(chevron)).toBeCloseTo(90, 1);
});

test('content after the tree takes its place by layout at once, while the rows below inside the tree glide', async ({
  page,
}) => {
  await open(page, 'core-treelist--with-content-below');
  const button = page.getByRole('button', {name: 'Open folder'});
  const {group, below} = parts(page);
  await expect(button).toBeVisible();
  // More content after the tree, holding a position: fixed element, which
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

  const glide = await armHold(page, page.locator('[role="tree"]'), {
    count: 2,
    judges: {target: below, property: 'translate'},
  });
  await tapToggle(page);
  await glide.held();
  await seekAnimations(page, 0);
  const height = await group.evaluate(el => (el as HTMLElement).offsetHeight);
  // Its new layout at once, one group height down, with nothing on it.
  expect(await button.evaluate(el => getComputedStyle(el).translate)).toBe(
    'none',
  );
  expect(((await button.boundingBox())?.y ?? 0) - rest).toBeCloseTo(height, 0);
  expect(await fixedTop()).toBeCloseTo(10, 0);
  // The row after the group inside the tree starts at its old place.
  expect(await translateY(below)).toBeCloseTo(-height, 0);
  await releaseAnimations(page, {finish: true});
  await expect.poll(async () => translateY(below)).toBe(0);
  expect(await fixedTop()).toBeCloseTo(10, 0);
});

test('the rows below keep moving on every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright',
  );
  await open(page);
  // A longer glide, so the block spans many frames.
  await page
    .locator('[role="tree"]')
    .evaluate(tree =>
      (tree as HTMLElement).style.setProperty('--duration-medium', '900ms'),
    );
  const {below} = parts(page);
  // The row below carries the harness's chip, 16 px, 8 px in from its corner.
  await below.evaluate(
    (row, rgb) => {
      const chip = document.createElement('div');
      chip.setAttribute('data-harness-marker-chip', 'tree-below');
      chip.setAttribute('aria-hidden', 'true');
      chip.style.cssText = `position:absolute;top:8px;left:8px;width:16px;height:16px;background:rgb(${rgb.join(',')});z-index:2147483647;pointer-events:none;`;
      (row as HTMLElement).style.position = 'relative';
      row.append(chip);
    },
    [...MARKER_RGB],
  );
  const cast = await startScreencast(page);
  // The compositor's own record of the frames it presents, so a frame the
  // screencast skips under load is not read as a stall.
  const compositor = await startCompositorTrace(page);
  await page.waitForTimeout(100);
  // The page starts the block itself, once the glide runs: a block the test
  // sends lands later on a busy machine.
  const [block] = await Promise.all([
    blockMainThread(page, 300, {during: below}),
    tapToggle(page),
  ]);
  await page.waitForTimeout(200);
  const presented = await compositor.stop();
  const frames = await cast.stop();
  const tracked = await trackMarker(page, frames);
  const proof = busyWindowProof(tracked, block, {
    axis: 'y',
    settledWithin: 1,
    presented,
  });
  await writeEvidence(
    'busy-main-thread/tree-list-expand',
    {[`${testInfo.project.name}.json`]: JSON.stringify(proof, null, 1)},
    testInfo,
  );
  // The frames the compositor presented in the judged part. A machine that
  // starves the compositor of frames fails here by name, not on the stall
  // bound below.
  requireFrames(
    (presented.length > 0 ? presented : tracked.map(frame => frame.t)).map(
      t => ({t}),
    ),
    {
      min: 8,
      during: 'the block, in its judged part',
      where: ({t}) => t >= proof.judged.from && t <= proof.judged.to,
    },
  );
  // Frames kept coming through the block, each one further down.
  expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
  expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
  expect(proof.longestStallMs, JSON.stringify(proof)).toBeLessThan(40);
});

test(
  'storyboard: a TreeList row expanding under a finger',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await open(page);
    const ms = await glideMs(page);
    // The page holds the expand as it starts: a hold sent after the tap can
    // come too late on a busy machine. It waits for three motions: the
    // group's fade, the rows below and the chevron.
    const hold = await armHold(page, page.locator('[role="tree"]'), {
      count: 3,
      judges: {target: parts(page).below, property: 'translate'},
    });
    await tapToggle(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'tree-list-expand',
      clip: {x: 0, y: 0, width: 402, height: 340},
      times: [0, 1, 2, 3, 4, 5, 6, 7].map(k => Math.round((k * ms) / 7)),
      columns: 8,
      cellScale: 0.45,
      held: await hold.held(),
    });
    await releaseAnimations(page, {finish: true});
    await storyboard.write(testInfo);
  },
);
