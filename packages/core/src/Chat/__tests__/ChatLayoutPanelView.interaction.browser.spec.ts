// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatLayoutPanelView.interaction.browser.spec.ts
 * @input The Core/ChatLayout "Panel View" story and the interaction harness
 * @output Proves that a ChatLayout's composer in a fixed-height panel rests
 *   at the panel's bottom edge. It holds on a phone and on a desktop
 * @position Interaction proof for the Panel View story's layout
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

for (const viewport of [
  {width: 412, height: 791},
  {width: 1280, height: 800},
]) {
  test(`the composer rests at the bottom of its panel at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openStory(page, storybook(), 'core-chatlayout--panel-view');
    const panel = page.getByTestId('panel-view');
    const editable = panel.locator('[contenteditable="true"]').first();
    await expect(editable).toBeVisible();
    const placement = await editable.evaluate(element => {
      // The dock is the composer's sticky container, inside the panel.
      let dock: HTMLElement | null = element as HTMLElement;
      while (dock != null && getComputedStyle(dock).position !== 'sticky') {
        dock = dock.parentElement;
      }
      const box = dock?.closest<HTMLElement>('[data-testid="panel-view"]');
      if (dock == null || box == null) {
        throw new Error('no sticky dock inside the panel');
      }
      return {
        dockBottom: dock.getBoundingClientRect().bottom,
        panelBottom:
          box.getBoundingClientRect().top + box.clientTop + box.clientHeight,
      };
    });
    expect(placement.dockBottom).toBeLessThanOrEqual(
      placement.panelBottom + 0.5,
    );
    expect(placement.dockBottom).toBeGreaterThan(placement.panelBottom - 2);
  });
}
