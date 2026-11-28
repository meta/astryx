// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerEntranceFirstPaint.interaction.browser.spec.ts
 * @input The Popover and DropdownMenu default stories, each placed above,
 *   below, at the start and at the end of its trigger, on a slow CPU
 * @output Proves the style the browser paints in the entrance's first frame
 *   already carries the side the layer lands on: a resize observer reads it
 *   in the frame after the show, before that frame's paint
 * @position Interaction proof for the entrance side write in useLayer.tsx
 *   (layerEntranceSide.ts, layerAnimations.stylex.ts)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test.use({
  viewport: {width: 1280, height: 800},
  isMobile: false,
  hasTouch: false,
});

interface Frame {
  readonly x: number;
  readonly y: number;
  readonly originX: number;
  readonly originY: number;
  readonly box: {x: number; y: number; width: number; height: number};
}

const routes = [
  {name: 'Popover', story: 'core-popover--default', trigger: 'Settings'},
  {
    name: 'DropdownMenu',
    story: 'core-dropdownmenu--default',
    trigger: 'Actions',
  },
];

/**
 * Arms a one-shot read of the first painted entrance frame. A listener on
 * the window runs after the component's own handlers for the same event.
 */
async function armFirstPaintRead(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as {__firstPaint?: unknown};
    // A menu opens on the press itself, a popover on the click. In the
    // frame after it, a resize observer reads the style that frame paints:
    // observers run after the frame's animation frame callbacks and before
    // its paint.
    const read = () => {
      requestAnimationFrame(() => {
        const layer = [
          ...document.querySelectorAll<HTMLElement>('[popover]'),
        ].find(element => element.matches(':popover-open'));
        if (layer == null || win.__firstPaint !== undefined) {
          return;
        }
        const observer = new ResizeObserver(() => {
          observer.disconnect();
          const entrance = [layer, layer.firstElementChild].find(
            node =>
              node instanceof HTMLElement &&
              getComputedStyle(node).animationName !== 'none',
          );
          if (!(entrance instanceof HTMLElement)) {
            win.__firstPaint = null;
            return;
          }
          const style = getComputedStyle(entrance);
          const matrix = new DOMMatrixReadOnly(style.transform);
          const [originX, originY] = style.transformOrigin
            .split(' ')
            .map(value => parseFloat(value));
          const rect = entrance.getBoundingClientRect();
          win.__firstPaint = {
            x: matrix.e,
            y: matrix.f,
            originX,
            originY,
            // The box without the entrance's transform.
            box: {
              x: entrance.offsetLeft,
              y: entrance.offsetTop,
              width: rect.width / matrix.a,
              height: rect.height / matrix.d,
            },
          };
        });
        observer.observe(layer);
      });
    };
    window.addEventListener('pointerdown', read, {once: true});
    window.addEventListener('click', read, {once: true});
  });
}

for (const route of routes) {
  for (const placement of ['above', 'below', 'start', 'end'] as const) {
    test(`${route.name} ${placement}: the first painted frame of the entrance has its landing side, on a slow CPU`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        'CPU throttling uses a CDP session, which only Chromium has',
      );
      await openStory(page, storybook(), route.story, {placement});
      await page.addStyleTag({
        content:
          '#storybook-root { position: fixed !important; inset: auto; margin: 0 !important; top: 360px; left: 560px; }',
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 6});
      await armFirstPaintRead(page);
      const trigger = page.getByRole('button', {name: route.trigger});
      const triggerBox = await trigger.boundingBox();
      if (triggerBox == null) {
        throw new Error('The trigger has no box.');
      }
      await trigger.click();
      await page.waitForFunction(
        () =>
          (window as unknown as {__firstPaint?: unknown}).__firstPaint !==
          undefined,
      );
      const frame = await page.evaluate(
        () => (window as unknown as {__firstPaint: Frame | null}).__firstPaint,
      );
      await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
      expect(frame, 'an entrance plays in the first frame').not.toBeNull();
      if (frame == null) {
        return;
      }
      // Left to right: start is left of the trigger, end is right of it.
      const side = {
        above: 'above',
        below: 'below',
        start: 'left',
        end: 'right',
      }[placement];
      const vertical = side === 'above' || side === 'below';
      const along = vertical ? frame.y : frame.x;
      const toward = side === 'above' || side === 'left' ? 1 : -1;
      expect(
        Math.sign(along),
        `the first painted frame moves the layer toward its trigger (translate ${frame.x}, ${frame.y})`,
      ).toBe(toward);
      expect(Math.abs(vertical ? frame.x : frame.y)).toBeLessThan(0.01);
      // The origin is on the edge that faces the trigger.
      const edge = {
        above: {axis: 'originY', value: frame.box.height},
        below: {axis: 'originY', value: 0},
        left: {axis: 'originX', value: frame.box.width},
        right: {axis: 'originX', value: 0},
      }[side] as {axis: 'originX' | 'originY'; value: number};
      expect(
        Math.abs(frame[edge.axis] - edge.value),
        `origin ${frame.originX} ${frame.originY} on the ${side} edge`,
      ).toBeLessThan(1);
    });
  }
}
