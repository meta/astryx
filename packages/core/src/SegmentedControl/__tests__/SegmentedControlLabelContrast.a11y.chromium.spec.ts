// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/SegmentedControl/ ^packages/themes/neutral/ ^apps/storybook/stories/SegmentedControl

/**
 * @file SegmentedControlLabelContrast.a11y.chromium.spec.ts
 * @input The built SegmentedControl "Default" story in real Chromium, in the
 *   Neutral theme, light and dark, over each page background a control sits
 *   on (AppShell's surface, the body, a Card), and axe
 * @output Browser evidence that unselected labels on the translucent track
 *   meet 4.5:1 text contrast over every page background
 * @position Regression proof for the Neutral `segmented-control-item` lift;
 *   scripts/check-segmented-control-label-contrast.test.mjs measures every
 *   shipped theme from its tokens
 */

import AxeBuilder from '@axe-core/playwright';
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

const PAGES = [
  '--color-background-surface',
  '--color-background-body',
  '--color-background-card',
] as const;

for (const mode of ['light', 'dark'] as const) {
  for (const page of PAGES) {
    test(`unselected labels meet 4.5:1 in Neutral ${mode} over ${page}`, async ({
      page: browserPage,
    }) => {
      await browserPage.goto(
        `${storybook.origin}/iframe.html?id=core-segmentedcontrol--default&viewMode=story&globals=colorMode:${mode};astryxTheme:neutral`,
      );
      const control = browserPage.locator('.astryx-segmented-control').first();
      await control.waitFor();
      // Paint the page background the control sits on, as AppShell or a Card
      // would, on every ancestor up to the root.
      await browserPage.addStyleTag({
        content: `html, body, #storybook-root, #storybook-root :has(.astryx-segmented-control) { background: var(${page}) !important; }`,
      });
      const results = await new AxeBuilder({page: browserPage})
        .include('.astryx-segmented-control')
        .withRules(['color-contrast'])
        .analyze();
      expect(
        results.violations.flatMap(violation =>
          violation.nodes.map(node => node.failureSummary ?? ''),
        ),
      ).toEqual([]);
      // The rule checked the labels rather than finding nothing to check.
      expect(results.passes.some(pass => pass.id === 'color-contrast')).toBe(
        true,
      );
    });
  }
}
