// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/ToggleButton|apps/storybook/stories/ToggleButton)

/**
 * @file ToggleButtonGroupWrap.a11y.chromium.spec.ts
 * @input The `Core/ToggleButton` GroupNarrow story in a built Storybook, in
 *   Chromium at 320px and 390px viewports
 * @output Real-browser proof that a group wider than its container wraps its
 *   members onto more rows instead of shrinking their labels: every label
 *   shows in full, the group stays inside the viewport, and the members keep
 *   DOM order (component:ToggleButtonGroup FR2)
 * @position Runs in pr-a11y when ToggleButton or its stories change. jsdom
 *   does no layout, so only a browser shows whether a label is cut.
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

const LABELS = [
  'Writing',
  'Coding',
  'Research',
  'Creative',
  'Planning',
  'Data',
];

for (const width of [320, 390]) {
  test(`a narrow group wraps instead of cutting labels at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({width, height: 640});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-togglebutton--group-narrow&viewMode=story`,
    );
    const group = page.getByRole('group', {name: 'Category'});
    await expect(group).toBeVisible();

    const facts = await group.evaluate(element => {
      const box = element.getBoundingClientRect();
      const members = [...element.querySelectorAll<HTMLElement>('button')];
      return {
        right: box.right,
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        tops: members.map(member => member.getBoundingClientRect().top),
        cut: members
          .filter(member =>
            [...member.querySelectorAll<HTMLElement>('*')].some(
              part => part.scrollWidth > part.clientWidth,
            ),
          )
          .map(member => member.getAttribute('aria-label') ?? member.id),
      };
    });

    expect(facts.cut).toEqual([]);
    expect(facts.right).toBeLessThanOrEqual(width);
    expect(facts.pageOverflow).toBeLessThanOrEqual(0);
    const members = group.getByRole('button');
    await expect(members).toHaveCount(LABELS.length);
    for (const [index, name] of LABELS.entries()) {
      await expect(members.nth(index)).toHaveAccessibleName(name);
    }
    // More than one row, and each row starts no earlier than the one before.
    expect(new Set(facts.tops.map(Math.round)).size).toBeGreaterThan(1);
    for (let i = 1; i < facts.tops.length; i++) {
      expect(facts.tops[i]).toBeGreaterThanOrEqual(facts.tops[i - 1] - 1);
    }

    // Tab order is still DOM order across the break.
    await page.getByRole('button', {name: LABELS[0]}).focus();
    for (const name of LABELS.slice(1)) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', {name})).toBeFocused();
    }
  });
}

test('a single member wider than the container shortens its label at 320px', async ({
  page,
}) => {
  await page.setViewportSize({width: 320, height: 640});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-togglebutton--group-narrow-long-label&viewMode=story`,
  );
  const group = page.getByRole('group', {name: 'Report type'});
  await expect(group).toBeVisible();
  const facts = await group.evaluate(element => ({
    right: element.getBoundingClientRect().right,
    pageOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(facts.right).toBeLessThanOrEqual(320);
  expect(facts.pageOverflow).toBeLessThanOrEqual(0);
});
