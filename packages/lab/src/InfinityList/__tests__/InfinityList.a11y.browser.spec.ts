// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/lab/(src/InfinityList/|blocks/InfinityListShowcase)|apps/storybook/stories/InfinityList\.stories\.tsx)

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const story = 'lab-infinitylist--archive';

for (const [button, visibleIndex] of [
  ['Middle', 500_000_001],
  ['Last', 1_000_000_000],
  ['First', 1],
] as const) {
  test(`reaches the ${button.toLowerCase()} record with a bounded native viewport`, async ({
    page,
  }) => {
    await openStory(page, storybook(), story);
    // Test First from the far end, not the initial state.
    if (button === 'First') {
      await page.getByRole('button', {name: 'Last'}).click();
    }
    const jump = page.getByRole('button', {name: button});
    await jump.focus();
    await jump.press('Enter');

    const list = page.getByRole('list', {name: 'Archive records'});
    const target = list.getByText(`Record ${visibleIndex}`, {exact: true});
    await expect(target).toBeInViewport({ratio: 0.99});
    await expect(target).toHaveAttribute('aria-posinset', String(visibleIndex));
    await expect(target).toHaveAttribute('aria-setsize', '1000000000');
    await expect(jump).toBeFocused();
    expect(await list.getByRole('listitem').count()).toBeLessThanOrEqual(19);

    const viewport = page.getByRole('group', {name: 'Archive records'});
    expect(
      await viewport.evaluate(node => node.scrollHeight),
    ).toBeLessThanOrEqual(1_000_000);
  });
}

test('keeps the same record in view when it moves the scroll segment', async ({
  page,
}) => {
  await openStory(page, storybook(), story);
  const viewport = page.getByRole('group', {name: 'Archive records'});
  await viewport.evaluate(node => {
    node.scrollTop = 999_000;
  });
  const item = page.getByText('Record 31219', {exact: true});
  await expect(item).toBeInViewport({ratio: 0.24});
  await expect
    .poll(() => viewport.evaluate(node => node.scrollTop))
    .toBeLessThan(750_000);
  const offset = await item.evaluate(node => {
    const viewport = node.closest('[role="group"]');
    return (
      node.getBoundingClientRect().top -
      (viewport?.getBoundingClientRect().top ?? 0)
    );
  });
  expect(offset).toBeCloseTo(-24, 0);
});
