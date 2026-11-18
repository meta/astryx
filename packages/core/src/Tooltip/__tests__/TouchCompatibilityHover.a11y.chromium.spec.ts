// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Tooltip core/HoverCard ^packages/core/src/Layer/useTouchTrigger ^packages/core/src/utils/interactionModality

/**
 * @file TouchCompatibilityHover.a11y.chromium.spec.ts
 * @input The Core/Tooltip and Core/HoverCard default stories in a built
 *   Storybook, with real touch input on a touch-enabled page, and CDP mouse
 *   moves for a mouse and a pen.
 * @output Real-engine proof that a tap whose control moves a Tooltip or
 *   HoverCard trigger under the finger opens nothing: the engine sends the
 *   tap's compatibility mouse events to the trigger, which saw no pointer of
 *   its own. A mouse and a pen that then move onto the trigger still open it.
 * @position The hover-intent rule (`architecture:interaction-modality`
 *   INV11) for behavior that depends on the engine's touch synthesis, which
 *   jsdom does not have. Chromium only: the pen move uses CDP.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

test.use({viewport: {width: 800, height: 600}, hasTouch: true});

const FIXTURES = [
  {name: 'Tooltip', story: 'core-tooltip--default'},
  {name: 'HoverCard', story: 'core-hovercard--default'},
] as const;

// Longer than either story's show delay.
const SETTLE_MS = 1200;

/**
 * Put a control at the left edge. When the finger lifts from it, the control
 * goes away and the story moves so that the trigger's center is where the
 * finger was. Returns that point.
 */
async function armMoveUnderFinger(page: Page): Promise<{x: number; y: number}> {
  return page.evaluate(() => {
    const trigger = Array.from(document.querySelectorAll('button')).find(
      button => button.textContent?.trim() === 'Hover me',
    );
    const root = document.getElementById('storybook-root');
    if (trigger == null || root == null) {
      throw new Error('The story did not render its trigger.');
    }
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.textContent = 'Composer pill';
    Object.assign(pill.style, {
      position: 'fixed',
      left: '16px',
      top: '480px',
      width: '120px',
      height: '48px',
      zIndex: '10',
    });
    document.body.append(pill);
    const pillBox = pill.getBoundingClientRect();
    const x = Math.round(pillBox.left + pillBox.width / 2);
    const y = Math.round(pillBox.top + pillBox.height / 2);
    pill.addEventListener('pointerup', () => {
      const triggerBox = trigger.getBoundingClientRect();
      const dx = x - (triggerBox.left + triggerBox.width / 2);
      const dy = y - (triggerBox.top + triggerBox.height / 2);
      root.style.transform = `translate(${dx}px, ${dy}px)`;
      pill.remove();
    });
    return {x, y};
  });
}

for (const {name, story} of FIXTURES) {
  test(`${name}: a tap that moves the trigger under the finger opens nothing, and a mouse and a pen still hover`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${story}&viewMode=story`,
    );
    const trigger = page.getByRole('button', {name: 'Hover me'});
    await expect(trigger).toBeVisible();
    const open = page.locator(':popover-open');

    const point = await armMoveUnderFinger(page);
    await page.touchscreen.tap(point.x, point.y);
    // The tap's compatibility mouse events reached the moved trigger.
    await expect(trigger).toBeInViewport();
    await page.waitForTimeout(SETTLE_MS);
    await expect(open).toHaveCount(0);

    // A mouse that arrives still hovers.
    await page.mouse.move(4, 4);
    await page.mouse.move(point.x, point.y, {steps: 4});
    await expect(open).toHaveCount(1, {timeout: SETTLE_MS * 2});

    // So does a pen, after the mouse leaves and the layer closes.
    await page.mouse.move(4, 4, {steps: 4});
    await expect(open).toHaveCount(0, {timeout: SETTLE_MS * 2});
    const cdp = await page.context().newCDPSession(page);
    for (const [x, y] of [
      [4, 4],
      [point.x, point.y],
    ]) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
        pointerType: 'pen',
      });
    }
    await expect(open).toHaveCount(1, {timeout: SETTLE_MS * 2});
  });
}
