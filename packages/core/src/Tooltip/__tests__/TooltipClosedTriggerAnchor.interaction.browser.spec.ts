// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TooltipClosedTriggerAnchor.interaction.browser.spec.ts
 * @input The Core/Tooltip default and Core/TopNavMenu mega menu stories, the
 *   interaction harness's screencast, main-thread block and compositor control
 * @output Proves a closed tooltip's trigger is no CSS anchor, so a surface that
 *   moves around it keeps animating through a busy main thread. A shown
 *   tooltip's trigger is its anchor until the tooltip hides. A mega menu that
 *   fades out stays placed against its anchor until the fade ends.
 * @position Interaction proofs for the layer runtime's anchor names, run in
 *   Chromium and WebKit
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  blockMainThread,
  busyWindowProof,
  controlColor,
  markElement,
  MARKER_RGB,
  openStory,
  startBusyControl,
  startScreencast,
  trackMarkers,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface Surface {
  readonly surface: Locator;
  readonly trigger: Locator;
}

// The story's root box moves, with the tooltip's trigger inside it. It rests
// `top` px down, clear of the strip the compositor control crosses.
async function openSurface(page: Page, top: number): Promise<Surface> {
  await openStory(page, storybook(), 'core-tooltip--default');
  const trigger = page.getByRole('button', {name: 'Hover me'});
  await expect(trigger).toBeVisible();
  const surface = page.locator('#storybook-root');
  await surface.evaluate((el, px) => {
    (el as HTMLElement).style.marginTop = `${px}px`;
  }, top);
  await expect(surface).toBeVisible();
  return {surface, trigger};
}

const anchorNameOf = async (element: Locator) =>
  element.evaluate(el => getComputedStyle(el).getPropertyValue('anchor-name'));

test('a surface around a closed tooltip trigger keeps moving through a 500 ms main-thread block', async ({
  page,
}) => {
  const {surface, trigger} = await openSurface(page, 60);
  test.info().annotations.push({
    type: 'closed trigger anchor-name',
    description: await anchorNameOf(trigger),
  });
  await markElement(surface);
  // Before the surface moves, so the control is on the compositor first.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  await surface.evaluate(el => {
    const box = el as HTMLElement;
    box.style.willChange = 'translate';
    // About 4 px a frame, so every frame shows a whole-pixel step.
    box.animate([{translate: '0px 0px'}, {translate: '0px 560px'}], {
      duration: 2000,
      easing: 'linear',
      fill: 'both',
    });
  });
  // Two frames, so the browser has committed the animation before the block.
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const block = await blockMainThread(page, 500, {
    during: surface,
    minProgressMs: 70,
  });
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  const [tracked, control] = await trackMarkers(page, frames, {
    colors: [MARKER_RGB, controlColor()],
  });
  // Judged against the compositor control in the same frames: the surface
  // moves on every frame the control does.
  const proof = busyWindowProof(tracked, block, {settledWithin: 2, control});
  test.info().annotations.push({
    type: 'busy main thread',
    description: proof.summary,
  });
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.monotonic).toBe(true);
});

test('a shown tooltip is placed against its trigger, which stays its anchor until the tooltip hides, also as the surface moves', async ({
  page,
}) => {
  // Room for the tooltip above its trigger.
  const {surface, trigger} = await openSurface(page, 200);
  // Keyboard focus shows the tooltip and holds it while the surface moves
  // away from the pointer.
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  expect(await anchorNameOf(trigger)).toMatch(/^--astryx-layer-/);

  // Boxes read once the tooltip's entry animation has ended.
  const boxes = async () => {
    await tooltip.evaluate(async el => {
      await Promise.all(
        el
          .getAnimations({subtree: true})
          .map(async animation => animation.finished.catch(() => undefined)),
      );
    });
    const shown = await tooltip.boundingBox();
    const anchor = await trigger.boundingBox();
    if (shown == null || anchor == null) {
      throw new Error('The tooltip or its trigger has no box.');
    }
    return {shown, anchor, gap: anchor.y - (shown.y + shown.height)};
  };
  // Above its trigger, over the trigger's centre. The viewport gutter can
  // slide it along the inline axis, so it need not be centred.
  const before = await boxes();
  expect(before.gap).toBeGreaterThanOrEqual(0);
  expect(before.gap).toBeLessThan(24);
  const centre = before.anchor.x + before.anchor.width / 2;
  expect(before.shown.x).toBeLessThanOrEqual(centre);
  expect(before.shown.x + before.shown.width).toBeGreaterThanOrEqual(centre);

  // The surface moves while the tooltip is shown: the tooltip follows its
  // anchor and keeps its gap.
  await surface.evaluate(el => {
    (el as HTMLElement).style.translate = '0px 120px';
  });
  await page.evaluate(
    async () =>
      new Promise(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const moved = await boxes();
  expect(moved.anchor.y - before.anchor.y).toBeCloseTo(120, 0);
  expect(moved.shown.y - before.shown.y).toBeCloseTo(120, 0);
  expect(moved.shown.x).toBeCloseTo(before.shown.x, 0);
  expect(moved.gap).toBeCloseTo(before.gap, 0);

  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  expect(await anchorNameOf(trigger)).toBe('none');
});

test.describe('a layer that fades out', () => {
  // A desktop window, where TopNav shows its mega menu.
  test.use({
    viewport: {width: 1280, height: 800},
    isMobile: false,
    hasTouch: false,
  });

  test('stays placed against its anchor through the fade, and only then takes the anchor name away', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit',
      'WebKit paints no close fade: the panel has display: none on the first frame after it closes.',
    );
    await openStory(page, storybook(), 'core-topnavmenu--mega-menu');
    // TopNav places its mega menus against its <nav>.
    const anchor = page.getByRole('navigation', {name: 'Marketing navigation'});
    await page.getByRole('button', {name: 'Products'}).click();
    const panel = page.locator('[popover]:popover-open', {
      hasText: 'Analytics',
    });
    await expect(panel).toBeVisible();
    expect(await anchorNameOf(anchor)).toMatch(/^--astryx-layer-/);
    await panel.evaluate(async el => {
      el.setAttribute('data-fading-layer', '');
      await Promise.all(
        el
          .getAnimations({subtree: true})
          .map(async animation => animation.finished.catch(() => undefined)),
      );
    });
    const open = await page.locator('[data-fading-layer]').boundingBox();
    if (open == null) {
      throw new Error('The open panel has no box.');
    }
    // Every frame from just before the close until the fade has ended: the
    // panel's box, its opacity and whether it is still shown.
    await page.evaluate(() => {
      const el = document.querySelector('[data-fading-layer]') as HTMLElement;
      const frames: number[][] = [];
      (window as unknown as {__fade: number[][]}).__fade = frames;
      const start = performance.now();
      const tick = () => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        frames.push([
          box.x,
          box.y,
          Number(style.opacity),
          el.matches(':popover-open') ? 1 : 0,
          style.display === 'none' ? 0 : 1,
        ]);
        if (performance.now() - start < 1500) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1600);
    const frames = await page.evaluate(
      () => (window as unknown as {__fade: number[][]}).__fade,
    );
    const fading = frames.filter(
      ([, , opacity, shown, displayed]) =>
        shown === 0 && displayed === 1 && opacity > 0.05,
    );
    // The fade is painted: closed, still displayed and still visible.
    expect(fading.length).toBeGreaterThan(0);
    for (const [x, y] of fading) {
      expect(Math.abs(x - open.x)).toBeLessThan(2);
      // The fade lifts the panel 4 px.
      expect(Math.abs(y - open.y)).toBeLessThan(8);
    }
    await expect.poll(async () => anchorNameOf(anchor)).toBe('none');
  });
});
