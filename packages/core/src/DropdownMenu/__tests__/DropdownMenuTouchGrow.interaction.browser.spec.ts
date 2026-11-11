// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuTouchGrow.interaction.browser.spec.ts
 * @input The built Default DropdownMenu and Popover stories, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness, and
 *   UIKit's popover values
 * @output Interaction proofs for the touch grow. A finger's first tap after
 *   the page loads grows the menu out of its trigger. In Chromium its first
 *   painted frame is the grow's collapsed start. A tap in scrolling
 *   page content, which opens the menu at its lift, grows it too, and so does
 *   a held finger. The grow follows Popover's path and timing, frame by
 *   frame. A mouse keeps the layer's own entrance. On a phone the menu opens
 *   beside its trigger.
 * @position Evidence for DropdownMenu's touch grow (Popover's surface motion
 *   on the rect morph); which opens grow is unit-tested in
 *   DropdownMenuTouchGrow.test.tsx
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  frames,
  openStory,
  releaseAnimations,
  seekAnimations,
  tap,
  timeline,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {popover} from '../../motion/uikit/popover';

const storybook = withStorybook(test);

const MENU_SURFACE = '[popover]:has([role="menu"]) > *';
const POPOVER_SURFACE = '[popover]:not(:has([role="menu"])) > *';

interface Frame {
  scaleX: number;
  scaleY: number;
  opacity: number;
}

/** The surface's scale and opacity now. */
async function readFrame(surface: Locator): Promise<Frame> {
  return surface.evaluate(element => {
    const style = getComputedStyle(element);
    const matrix = new DOMMatrix(
      style.transform === 'none' ? undefined : style.transform,
    );
    const [x, y = x] =
      style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
    return {
      scaleX: x * matrix.a,
      scaleY: y * matrix.d,
      opacity: Number(style.opacity),
    };
  });
}

/**
 * The grow's frames, every 1/60 s from its start. `act` opens the surface,
 * and the hold takes the grow as it starts. Each frame is a seek, so the
 * engine's own frame timing plays no part.
 */
async function heldGrow(
  page: Page,
  surface: Locator,
  act: () => Promise<void>,
  judged: 'scale' | 'opacity' = 'scale',
): Promise<Frame[]> {
  // Scoped to the layer: the trigger's own press animation runs too.
  const hold = await armHold(page, surface.locator('xpath=..'), {
    judges: {target: surface, property: judged},
    newOnly: true,
  });
  await act();
  await hold.held();
  const grown: Frame[] = [];
  for (const t of timeline(400)) {
    await seekAnimations(page, t);
    grown.push(await readFrame(surface));
  }
  await releaseAnimations(page, {finish: true});
  return grown;
}

/**
 * Records the surface's scale and opacity once per frame. Each read runs
 * after that frame's own callbacks, so it sees what the frame painted.
 */
async function recordSurface(page: Page, selector: string) {
  await page.evaluate(surfaceSelector => {
    const painted: Frame[] = [];
    const read = () => {
      const surface = document.querySelector<HTMLElement>(surfaceSelector);
      const layer = surface?.closest('[popover]');
      if (surface == null || layer?.matches(':popover-open') !== true) {
        return;
      }
      const style = getComputedStyle(surface);
      const matrix = new DOMMatrix(
        style.transform === 'none' ? undefined : style.transform,
      );
      const [x, y = x] =
        style.scale === 'none' ? [1, 1] : style.scale.split(' ').map(Number);
      painted.push({
        scaleX: x * matrix.a,
        scaleY: y * matrix.d,
        opacity: Number(style.opacity),
      });
    };
    const loop = () => {
      requestAnimationFrame(() => {
        setTimeout(read, 0);
        if ((window as {__growDone?: boolean}).__growDone !== true) {
          loop();
        }
      });
    };
    (window as {__grow?: Frame[]}).__grow = painted;
    (window as {__growDone?: boolean}).__growDone = false;
    loop();
  }, selector);
}

/** The frames that painted the surface, once it rests. */
async function paintedFrames(page: Page): Promise<Frame[]> {
  await frames(page, 48);
  return page.evaluate(() => {
    (window as {__growDone?: boolean}).__growDone = true;
    return ((window as {__grow?: Frame[]}).__grow ?? []).filter(
      frame => frame.opacity > 0.01,
    );
  });
}

async function openOnPhone(page: Page, storyId: string, name: string) {
  await openStory(page, storybook(), storyId);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  return {driver, trigger, box, center};
}

/** Lets the page scroll without moving the centered story. */
async function makePageScroll(page: Page) {
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.position = 'absolute';
    spacer.style.insetBlockStart = '0';
    spacer.style.inlineSize = '1px';
    spacer.style.blockSize = '4000px';
    document.body.append(spacer);
  });
  await frames(page, 2);
}

/** A grow out of the trigger: a collapsed first frame, then rest. */
function expectGrow(grown: Frame[]) {
  const shown = grown.filter(frame => frame.opacity > 0.01);
  expect(shown.length).toBeGreaterThan(4);
  expect(shown[0].scaleX).toBeLessThan(0.5);
  const last = grown.at(-1);
  expect(last?.scaleX).toBeCloseTo(1, 2);
  expect(last?.scaleY).toBeCloseTo(1, 2);
  expect(last?.opacity).toBeCloseTo(1, 2);
}

/**
 * UIKit's popover path: across the axis away from the source, the scale is
 * s₀ + (1 − s₀)·p, and the opacity is p.
 */
function acrossLawGap(frame: Frame): number {
  const s0 = popover.collapsedScale;
  return Math.abs(frame.scaleX - (s0 + (1 - s0) * frame.opacity));
}

test("a finger's first tap after the page loads grows the menu out of its trigger", async ({
  page,
}) => {
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  const surface = page.locator(MENU_SURFACE).first();
  expectGrow(
    await heldGrow(page, surface, async () => story.driver.tap(story.center)),
  );
});

test("the first painted frame after a finger's first tap is the grow's collapsed start", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    "WebKit's container presents a new layer's first frame 450-700 ms late, after the grow has ended; the held proofs cover WebKit",
  );
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  await recordSurface(page, MENU_SURFACE);
  await story.driver.tap(story.center);
  expectGrow(await paintedFrames(page));
});

test('in scrolling page content, a tap opens the menu at its lift and grows it', async ({
  page,
}) => {
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  await makePageScroll(page);
  const surface = page.locator(MENU_SURFACE).first();
  expectGrow(
    await heldGrow(page, surface, async () => story.driver.tap(story.center)),
  );
});

test('a held finger grows the menu out of its trigger', async ({page}) => {
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  await makePageScroll(page);
  const surface = page.locator(MENU_SURFACE).first();
  expectGrow(
    await heldGrow(page, surface, async () => {
      await story.driver.play(tap(story.center, {holdMs: 400}));
    }),
  );
});

test("the menu's grow follows Popover's path and timing, frame by frame", async ({
  page,
}) => {
  const menu = await openOnPhone(page, 'core-dropdownmenu--default', 'Actions');
  const menuFrames = await heldGrow(
    page,
    page.locator(MENU_SURFACE).first(),
    async () => menu.driver.tap(menu.center),
  );
  const pop = await openOnPhone(page, 'core-popover--default', 'Settings');
  const popoverFrames = await heldGrow(
    page,
    page.locator(POPOVER_SURFACE).first(),
    async () => pop.driver.tap(pop.center),
  );
  expectGrow(menuFrames);
  expectGrow(popoverFrames);
  for (const frame of [...menuFrames, ...popoverFrames]) {
    if (frame.opacity > 0.01 && frame.opacity < 0.99) {
      expect(acrossLawGap(frame)).toBeLessThan(0.01);
    }
  }
  // The same duration and easing: the same progress at every frame.
  menuFrames.forEach((frame, index) => {
    expect(Math.abs(frame.opacity - popoverFrames[index].opacity)).toBeLessThan(
      0.02,
    );
  });
});

test("under Reduce Motion, a finger's open lands the menu at its full size and fades it in", async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  const surface = page.locator(MENU_SURFACE).first();
  const faded = await heldGrow(
    page,
    surface,
    async () => story.driver.tap(story.center),
    'opacity',
  );
  const shown = faded.filter(frame => frame.opacity > 0.01);
  expect(shown.length).toBeGreaterThan(0);
  // No frame scales the menu: it is where it rests from the first frame.
  for (const frame of shown) {
    expect(frame.scaleX).toBeCloseTo(1, 3);
    expect(frame.scaleY).toBeCloseTo(1, 3);
  }
  expect(faded.at(-1)?.opacity).toBeCloseTo(1, 2);
});

test("a mouse keeps the layer's own entrance", async ({page}) => {
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  await recordSurface(page, MENU_SURFACE);
  await page.mouse.click(story.center.x, story.center.y);
  const painted = await paintedFrames(page);
  expect(painted.length).toBeGreaterThan(0);
  expect(painted[0].scaleX).toBeGreaterThan(0.9);
});

test('on a phone the menu opens beside its trigger and does not cover it', async ({
  page,
}) => {
  const story = await openOnPhone(
    page,
    'core-dropdownmenu--default',
    'Actions',
  );
  await recordSurface(page, MENU_SURFACE);
  await story.driver.tap(story.center);
  await paintedFrames(page);
  const menu = await page.locator(MENU_SURFACE).first().boundingBox();
  expect(menu).not.toBeNull();
  if (menu != null) {
    expect(menu.y).toBeGreaterThanOrEqual(story.box.y + story.box.height - 1);
    expect(Math.abs(menu.x - story.box.x)).toBeLessThanOrEqual(1);
  }
});
