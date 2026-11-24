// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SideNavNestedLongLabel.a11y.chromium.spec.ts
 * @input The built "Nested Long Labels" SideNav story in real Chromium, with
 *   the default font size at 200%: an expanded rail, a collapsed rail's
 *   flyout, and the mobile drawer on a phone
 * @output Evidence that every nested row spans its list's width at any
 *   depth and keeps a long label and its end content inside the nav, and
 *   that an open group still does not clip a nested row's focus ring
 * @position Browser proof of component:SideNav FR3 and FR5
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
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

const STORY = 'core-sidenav--nested-long-labels';

async function open(
  page: Page,
  viewport: {width: number; height: number},
): Promise<void> {
  await page.setViewportSize(viewport);
  const session = await page.context().newCDPSession(page);
  // 200% text, the setting a browser's text-only zoom changes.
  await session.send('Page.setFontSizes', {
    fontSizes: {standard: 32, fixed: 26},
  });
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
}

/**
 * The visible rows inside `root`: each row's depth (the groups around it;
 * sections are groups too), its inline box, its end content's inline box,
 * and its long label's inline box.
 */
async function measure(root: Locator) {
  return root.evaluate(container => {
    const groupsAround = (row: HTMLElement): number => {
      let count = 0;
      for (
        let element = row.parentElement;
        element != null && element !== container;
        element = element.parentElement
      ) {
        if (element.getAttribute('role') === 'group') {
          count++;
        }
      }
      return count;
    };
    return [...container.querySelectorAll<HTMLElement>('.astryx-side-nav-item')]
      .filter(row => row.getBoundingClientRect().height > 0)
      .map(row => {
        const box = row.getBoundingClientRect();
        const badge = row.querySelector<HTMLElement>('.astryx-badge');
        const label = [...row.querySelectorAll<HTMLElement>('*')].find(
          element =>
            element.children.length === 0 &&
            (element.textContent ?? '').length > 30,
        );
        return {
          text: (row.textContent ?? '').trim().slice(0, 24),
          depth: groupsAround(row),
          right: box.right,
          badgeRight: badge?.getBoundingClientRect().right ?? null,
          labelRight: label?.getBoundingClientRect().right ?? null,
        };
      });
  });
}

function expectRowsInsideList(rows: Awaited<ReturnType<typeof measure>>): void {
  const topDepth = Math.min(...rows.map(row => row.depth));
  const top = rows.filter(row => row.depth === topDepth);
  const nested = rows.filter(row => row.depth > topDepth);
  expect(top.length).toBeGreaterThan(0);
  expect(nested.length).toBeGreaterThan(0);
  const listRight = Math.max(...top.map(row => row.right));
  for (const row of nested) {
    // FR3: every row spans its list's inline size, at any depth.
    expect(row.right, row.text).toBeLessThanOrEqual(listRight + 0.5);
    if (row.badgeRight != null) {
      expect(row.badgeRight, row.text).toBeLessThanOrEqual(listRight + 0.5);
    }
    if (row.labelRight != null) {
      expect(row.labelRight, row.text).toBeLessThanOrEqual(listRight + 0.5);
    }
  }
}

test('an expanded rail keeps nested rows with long labels inside the nav', async ({
  page,
}) => {
  await open(page, {width: 1280, height: 800});
  const nav = page.getByRole('navigation').first();
  await expect(nav.getByText(/Quarterly planning/)).toBeVisible();
  expectRowsInsideList(await measure(nav));
  // FR5: the open group does not clip, so a nested row's focus ring paints.
  const overflow = await nav
    .locator('[role="group"][id$="-children"]')
    .first()
    .evaluate(group => getComputedStyle(group).overflow);
  expect(overflow).toBe('visible');
});

test("a collapsed rail's flyout keeps nested rows with long labels inside it", async ({
  page,
}) => {
  await open(page, {width: 1280, height: 800});
  await page.getByRole('button', {name: 'Collapse sidebar'}).click();
  await page.getByRole('button', {name: 'Projects'}).click();
  const flyout = page.getByRole('dialog').filter({visible: true});
  await expect(flyout.getByText(/Regional database/)).toBeVisible();
  expectRowsInsideList(await measure(flyout));
});

test('the mobile drawer on a phone keeps nested rows with long labels inside it', async ({
  page,
}) => {
  await open(page, {width: 390, height: 844});
  await page
    .getByRole('button', {name: /navigation|menu/i})
    .first()
    .click();
  const drawer = page.getByRole('dialog').filter({visible: true});
  await expect(drawer.getByText(/Regional database/)).toBeVisible();
  expectRowsInsideList(await measure(drawer));
});
