// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file LightboxViewport.a11y.browser.spec.ts
 * @input The built Lightbox default story and the stylesheet rules the open
 *   viewer matches, in Chromium and WebKit
 * @output Browser evidence that the viewer is as tall as the dynamic viewport,
 *   so a mobile browser's toolbar never covers its bottom
 * @position Cross-browser proof for Lightbox's full-screen sizing
 */

import {expect, test} from '@playwright/test';
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

test('the viewer is as tall as the dynamic viewport, so a toolbar never covers its bottom', async ({
  page,
}) => {
  // The story's photo is remote; the sizing does not need it to load.
  await page.route(/picsum\.photos/, async route => route.abort());
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-lightbox--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open lightbox'}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Mobile Safari's 100vh is the large viewport, measured with its toolbars
  // retracted, so a viewer that tall runs under the bottom toolbar and hides a
  // gallery's caption (iOS 26.2, iPhone 17 Pro: 714 pt visible, the caption
  // at 718–754). The dynamic viewport is the visible height. No desktop or
  // emulated engine shrinks it, so this reads the height the viewer declares.
  const declared = await dialog.evaluate(element => {
    const heights: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          if (rule.style.height !== '' && element.matches(rule.selectorText)) {
            heights.push(rule.style.height);
          }
        } else if ('cssRules' in rule) {
          walk((rule as CSSGroupingRule).cssRules);
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A cross-origin stylesheet's rules are unreadable and not ours.
      }
    }
    return {heights, supported: CSS.supports('height', '100dvh')};
  });
  expect(declared.supported).toBe(true);
  expect(declared.heights).toContain('100dvh');
});
