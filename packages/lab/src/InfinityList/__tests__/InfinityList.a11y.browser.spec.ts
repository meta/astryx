// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/lab/(src/InfinityList/|blocks/InfinityListShowcase)|apps/storybook/stories/InfinityList\.stories\.tsx)

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const story = 'lab-infinitylist--archive';
const label = 'Archive records';

for (const [button, index] of [
  ['Middle', 500_000_001],
  ['Last', 1_000_000_000],
  ['First', 1],
] as const) {
  test(`reaches the ${button.toLowerCase()} record by keyboard`, async ({
    page,
  }) => {
    await openStory(page, storybook(), story);
    if (button === 'First') {
      await page.getByRole('button', {name: 'Last'}).click();
      await expect(
        page.getByText('Record 1000000000', {exact: true}),
      ).toBeInViewport();
    }
    const jump = page.getByRole('button', {name: button});
    await jump.focus();
    await jump.press('Enter');

    const list = page.getByRole('list', {name: label});
    const target = list.getByText(`Record ${index}`, {exact: true});
    await expect(target).toBeInViewport({ratio: 0.99});
    await expect(target).toHaveAttribute('aria-posinset', String(index));
    await expect(target).toHaveAttribute('aria-setsize', '1000000000');
    await expect(jump).toBeFocused();
    expect(await list.getByRole('listitem').count()).toBeLessThanOrEqual(19);
  });
}

test('wheel motion stays continuous across mounted ranges in both directions', async ({
  page,
}) => {
  await openStory(page, storybook(), story);
  await page.getByRole('button', {name: 'Middle'}).click();
  await expect(
    page.getByText('Record 500000001', {exact: true}),
  ).toBeInViewport();
  const viewport = page.getByRole('group', {name: label});
  await viewport.hover();

  const position = () =>
    viewport.evaluate(node => {
      const top = node.getBoundingClientRect().top;
      const first = Array.from(node.querySelectorAll('li')).find(
        item => item.getBoundingClientRect().bottom > top,
      );
      if (!first) {
        return null;
      }
      return (
        32 * (Number(first.getAttribute('aria-posinset')) - 1) +
        top -
        first.getBoundingClientRect().top
      );
    });
  const start = await position();
  expect(start).toBe(16_000_000_000);
  let displacement = 0;
  for (const delta of [7, 31, 142, 89, -73, -145, -51]) {
    await page.mouse.wheel(0, delta);
    displacement += delta;
    await expect.poll(position).toBe(16_000_000_000 + displacement);
  }
  expect(await viewport.evaluate(node => node.scrollTop)).toBe(0);
  expect(await viewport.getByRole('listitem').count()).toBeLessThanOrEqual(19);
});

test('the full-range scrollbar reaches the ends without losing focus', async ({
  page,
}) => {
  await openStory(page, storybook(), story);
  const scrollbar = page.getByRole('scrollbar', {name: label});
  await scrollbar.focus();
  await scrollbar.press('End');
  await expect(
    page.getByText('Record 1000000000', {exact: true}),
  ).toBeInViewport();
  await expect(scrollbar).toBeFocused();
  await scrollbar.press('Home');
  await expect(page.getByText('Record 1', {exact: true})).toBeInViewport();
  await expect(scrollbar).toHaveAttribute('aria-valuenow', '0');
});
