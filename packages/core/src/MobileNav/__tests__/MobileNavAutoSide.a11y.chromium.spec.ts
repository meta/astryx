// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file MobileNavAutoSide.a11y.chromium.spec.ts
 * @input The built MobileNav Default story and real Chromium transitions in
 *   LTR and RTL documents
 * @output Browser evidence that side="auto" chooses the logical edge from
 *   the focused opener and begins its entrance from that physical edge
 * @position Chromium proof for MobileNav's auto-side resolution; the jsdom
 *   matrix is in MobileNav.test.tsx
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test.use({
  viewport: {width: 1000, height: 700},
  deviceScaleFactor: 1,
});

const cases = [
  {direction: 'ltr', left: 80, expectedSide: 'start', expectedSign: -1},
  {direction: 'ltr', left: 820, expectedSide: 'end', expectedSign: 1},
  {direction: 'rtl', left: 80, expectedSide: 'end', expectedSign: -1},
  {direction: 'rtl', left: 820, expectedSide: 'start', expectedSign: 1},
] as const;

test.describe('MobileNav side="auto" entrance origin (Chromium)', () => {
  for (const {direction, left, expectedSide, expectedSign} of cases) {
    test(`${direction} opener at ${left}px enters from the ${expectedSide} edge`, async ({
      page,
    }) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-mobilenav--default&viewMode=story`,
      );

      const opener = page.getByRole('button', {name: 'Open Navigation'});
      await opener.evaluate(
        (element, {direction: nextDirection, left: nextLeft}) => {
          const root = document.getElementById('storybook-root');
          root?.setAttribute('dir', nextDirection);
          Object.assign(element.style, {
            direction: nextDirection,
            position: 'fixed',
            left: `${nextLeft}px`,
            top: '20px',
          });
        },
        {direction, left},
      );
      await page.addStyleTag({
        content:
          'dialog [tabindex="-1"] { transition-duration: 5s !important; }',
      });
      await opener.focus();
      await opener.click();

      const nav = page.getByRole('dialog');
      await expect(nav).toBeVisible();
      const drawer = nav.locator('[tabindex="-1"]').first();

      const result = await drawer.evaluate(element => {
        const transform = getComputedStyle(element).transform;
        const translateX =
          transform === 'none' ? 0 : new DOMMatrix(transform).e;
        return {
          side: element.closest('dialog')?.getAttribute('data-side'),
          translateX,
        };
      });

      expect(result.side).toBe(expectedSide);
      expect(Math.sign(result.translateX)).toBe(expectedSign);
    });
  }
});
