// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file collapsedPanel.interaction.browser.spec.ts
 * @input The a11y-spec Playwright entry and the interaction harness:
 *   Resizable's collapsed-panel fixture story
 * @output Proves a LayoutPanel at width 0 takes no space, shows none of its
 *   children, and is no scrolling group, in Chromium and WebKit
 * @position Interaction proof for LayoutPanel.tsx
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-resizable--collapsed-panel-fixture';

interface PanelReading {
  /** The panel's border box, which a divider widens by its line. */
  width: number;
  paddingInline: number;
  /** The children's boxes and text runs that have an area. */
  laidOutChildRects: number;
  /** Of those, the ones inside the panel's padding box, where its clip shows them. */
  shownChildRects: number;
}

test('a LayoutPanel at width 0 takes no space and shows none of its children', async ({
  page,
}) => {
  await openStory(page, storybook(), STORY);
  const readings: [string, PanelReading][] = [];
  for (const testId of ['collapsed-start', 'collapsed-end']) {
    const reading: PanelReading = await page.evaluate(id => {
      const panel = document.querySelector<HTMLElement>(
        `[data-testid="${id}"]`,
      );
      if (panel == null) {
        throw new Error(`the fixture did not render ${id}`);
      }
      const box = panel.getBoundingClientRect();
      const style = getComputedStyle(panel);
      // The clip shows a child only inside the padding box. The handle's grab
      // zone can cover that box, so the check reads geometry, not hit tests.
      const clip = {
        left: box.left + parseFloat(style.borderLeftWidth),
        right: box.right - parseFloat(style.borderRightWidth),
        top: box.top + parseFloat(style.borderTopWidth),
        bottom: box.bottom - parseFloat(style.borderBottomWidth),
      };
      const rects: DOMRect[] = [];
      for (const element of panel.querySelectorAll('*')) {
        rects.push(...element.getClientRects());
      }
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      for (
        let node = walker.nextNode();
        node != null;
        node = walker.nextNode()
      ) {
        const range = document.createRange();
        range.selectNodeContents(node);
        rects.push(...range.getClientRects());
      }
      const laidOut = rects.filter(rect => rect.width > 0 && rect.height > 0);
      const shown = laidOut.filter(
        rect =>
          Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left) >
            0 &&
          Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top) > 0,
      );
      return {
        width: box.width,
        paddingInline:
          parseFloat(style.paddingInlineStart) +
          parseFloat(style.paddingInlineEnd),
        laidOutChildRects: laidOut.length,
        shownChildRects: shown.length,
      };
    }, testId);
    readings.push([testId, reading]);
  }
  // The children are laid out, so their absence on screen is the clip.
  for (const [testId, reading] of readings) {
    expect(reading.laidOutChildRects, testId).toBeGreaterThan(0);
  }
  expect(
    readings.map(([testId, reading]) => [
      testId,
      reading.width,
      reading.paddingInline,
      reading.shownChildRects,
    ]),
  ).toEqual([
    ['collapsed-start', 0, 0, 0],
    ['collapsed-end', 1, 0, 0],
  ]);
});

test('a scrolling LayoutPanel collapsed to width 0 is no longer a named group', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-resizable--collapsing-scroll-panel-fixture',
  );
  const panel = page.getByTestId('collapsing-end');
  // While it is open, its content overflows, so it is the named group.
  await expect(panel).toHaveAttribute('role', 'group');
  await expect(panel).toHaveAttribute('aria-label', /.+/);
  await page.getByRole('button', {name: 'Collapse details'}).click();
  await expect
    .poll(async () =>
      panel.evaluate(element => element.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(1);
  // At width 0 the panel clips its content, so it cannot scroll.
  await expect(panel).not.toHaveAttribute('role', 'group');
  await expect(panel).not.toHaveAttribute('aria-label');
  await page.getByRole('button', {name: 'Open details'}).click();
  await expect(panel).toHaveAttribute('role', 'group');
});
