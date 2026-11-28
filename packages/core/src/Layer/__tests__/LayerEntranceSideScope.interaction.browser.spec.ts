// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LayerEntranceSideScope.interaction.browser.spec.ts
 * @input The built Popover and DropdownMenu default stories in a real browser
 * @output Proof that the entrance side properties reach the element that
 *   plays the entrance and stop there: the content inside it does not
 *   inherit them, so writing them as a layer shows restyles no content
 * @position Interaction evidence for layerEntranceSide.ts (the registration)
 *   and layerAnimations.stylex.ts (the explicit inherit)
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

const NAMES = [
  '--_astryx-layer-enter-x',
  '--_astryx-layer-enter-y',
  '--_astryx-layer-enter-origin',
] as const;

const routes = [
  {
    name: 'Popover',
    story: 'core-popover--default',
    trigger: 'button[aria-expanded]',
  },
  {
    name: 'DropdownMenu',
    story: 'core-dropdownmenu--default',
    trigger: 'button[aria-haspopup="menu"]',
  },
];

for (const route of routes) {
  test(`${route.name}: the entrance element takes the side, and its content does not`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=${route.story}&viewMode=story`,
    );
    await page.locator(route.trigger).first().click();
    await page.waitForTimeout(400);
    const read = await page.evaluate(names => {
      const layer = [
        ...document.querySelectorAll<HTMLElement>('[popover]'),
      ].find(element => element.matches(':popover-open'));
      if (layer == null) {
        return null;
      }
      // Both stories play the entrance on the element directly inside the
      // layer: Popover's surface and the menu's list box.
      const entrance = layer.firstElementChild;
      // The deepest element inside the entrance element.
      let content: Element | null = entrance?.firstElementChild ?? null;
      while (content?.firstElementChild != null) {
        content = content.firstElementChild;
      }
      const values = (element: Element | null | undefined) =>
        element == null
          ? null
          : names.map(name =>
              getComputedStyle(element).getPropertyValue(name).trim(),
            );
      return {
        written: names.map(name => layer.style.getPropertyValue(name).trim()),
        entrance: values(entrance),
        content: values(content),
      };
    }, NAMES);
    expect(read).not.toBeNull();
    // The runtime wrote a side, and the entrance element computes it.
    expect(read?.written.every(value => value !== '')).toBe(true);
    expect(read?.entrance).toEqual(read?.written);
    // The content inside does not inherit it.
    expect(read?.content).toEqual(['', '', '']);
  });
}
