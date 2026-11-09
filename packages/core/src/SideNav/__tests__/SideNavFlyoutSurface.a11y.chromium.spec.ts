// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(SideNav|Popover|Layer)/|apps/storybook/stories/SideNav\.stories)

/**
 * @file SideNavFlyoutSurface.a11y.chromium.spec.ts
 * @input The built collapsible SideNav story in real Chromium: the rail
 *   collapsed, then a parent row's child menu opened by a press and by Enter
 * @output Evidence that the child menu paints one surface: no element inside
 *   the open menu draws its own border, outline or inset shadow, apart from
 *   the focus ring of the row that has focus
 * @position Real-engine check for a collapsed SideNav's child menu; jsdom
 *   computes no painted border
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-sidenav--collapsible-sidebar';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function collapseRail(page: Page): Promise<void> {
  await page.setViewportSize({width: 900, height: 700});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await page.getByRole('button', {name: 'Collapse sidebar'}).click();
  await expect(
    page.getByRole('button', {name: 'Expand sidebar'}),
  ).toBeVisible();
}

/** Every element inside the open menu that paints a line of its own. */
async function paintedLines(page: Page): Promise<string[]> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Let the entrance settle so the read is the menu at rest.
  await page.waitForTimeout(400);
  return dialog.evaluate(root => {
    const lines: string[] = [];
    const describe = (element: Element) =>
      `${element.tagName.toLowerCase()}${element.getAttribute('role') ? `[role=${element.getAttribute('role')}]` : ''} "${(element.textContent ?? '').trim().slice(0, 30)}"`;
    const visible = (width: string, style: string, color: string) =>
      parseFloat(width) > 0 &&
      style !== 'none' &&
      style !== 'hidden' &&
      !/rgba\([^)]*,\s*0\)$/.test(color) &&
      color !== 'transparent';
    for (const element of [root, ...root.querySelectorAll('*')]) {
      const style = getComputedStyle(element);
      if (element === root) {
        if (
          visible(style.outlineWidth, style.outlineStyle, style.outlineColor)
        ) {
          lines.push(`menu surface outline: ${describe(element)}`);
        }
        continue;
      }
      const isFocused = element === document.activeElement;
      for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
        if (
          visible(
            style.getPropertyValue(`border-${side.toLowerCase()}-width`),
            style.getPropertyValue(`border-${side.toLowerCase()}-style`),
            style.getPropertyValue(`border-${side.toLowerCase()}-color`),
          )
        ) {
          lines.push(
            `border-${side.toLowerCase()}: ${describe(element)} radius ${style.borderRadius}`,
          );
          break;
        }
      }
      if (
        !isFocused &&
        visible(style.outlineWidth, style.outlineStyle, style.outlineColor)
      ) {
        lines.push(
          `outline: ${describe(element)} radius ${style.borderRadius}`,
        );
      }
      if (/inset/.test(style.boxShadow)) {
        lines.push(`inset shadow: ${describe(element)} ${style.boxShadow}`);
      }
    }
    return lines;
  });
}

test('a child menu opened by a press paints one surface', async ({page}) => {
  await collapseRail(page);
  await page.getByRole('button', {name: /Settings/}).click();
  expect(await paintedLines(page)).toEqual([]);
});

test('a child menu opened by Enter paints one surface besides the focused row ring', async ({
  page,
}) => {
  await collapseRail(page);
  await page.getByRole('button', {name: /Settings/}).focus();
  await page.keyboard.press('Enter');
  expect(await paintedLines(page)).toEqual([]);
});
