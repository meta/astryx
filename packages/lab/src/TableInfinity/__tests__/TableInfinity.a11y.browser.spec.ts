// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/lab/(src/TableInfinity/|blocks/InfinityTableShowcase)|apps/storybook/stories/InfinityTable\.stories\.tsx)

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('replaces both windows while keeping the header aligned with the visible body', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-infinitytable--archive');
  const jump = page.getByRole('button', {name: 'Middle'});
  await jump.press('Enter');
  const viewport = page.getByRole('group', {name: 'Table viewport'});
  await expect(
    page.getByText('R500000001 C500001', {exact: true}),
  ).toBeInViewport({ratio: 0.99});
  await expect(jump).toBeFocused();
  await viewport.hover();

  const readPosition = () =>
    viewport.evaluate(node => {
      const table = node.querySelector('table');
      const head = table?.tHead?.rows[0];
      const body = table?.tBodies[0];
      if (!head || !body) {
        return null;
      }
      const top = head.getBoundingClientRect().bottom;
      const left = node.getBoundingClientRect().left;
      const row = [...body.rows].find(
        item => item.getBoundingClientRect().bottom > top,
      );
      const cell =
        row &&
        [...row.cells].find(item => item.getBoundingClientRect().right > left);
      const column = cell?.getAttribute('aria-colindex');
      const heading = [...head.cells].find(
        item => item.getAttribute('aria-colindex') === column,
      );
      if (!row || !cell || !heading) {
        return null;
      }
      const rect = cell.getBoundingClientRect();
      return {
        y:
          (Number(row.getAttribute('aria-rowindex')) - 2) * 32 +
          top -
          row.getBoundingClientRect().top,
        x: (Number(column) - 1) * 184 + left - rect.left,
        alignment: heading.getBoundingClientRect().left - rect.left,
        native: [node.scrollLeft, node.scrollTop],
      };
    });
  let x = 92_000_000;
  let y = 16_000_000_000;
  for (const [dx, dy] of [
    [23, 19],
    [743, 275],
    [-79, -37],
    [-790, -301],
  ] as const) {
    await page.mouse.wheel(dx, dy);
    x += dx;
    y += dy;
    await expect
      .poll(readPosition)
      .toEqual({x, y, alignment: 0, native: [0, 0]});
  }
  expect(await viewport.locator('tbody td').count()).toBeLessThanOrEqual(228);
  await page.getByRole('button', {name: 'Last'}).click();
  await expect(
    page.getByText('R1000000000 C1000000', {exact: true}),
  ).toBeInViewport({ratio: 0.99});
});

test('uses the logical start and physical arrow direction in RTL', async ({
  page,
}) => {
  await openStory(page, storybook(), 'lab-infinitytable--rtl');
  const horizontal = page.getByRole('scrollbar', {name: 'Scroll columns'});
  await horizontal.press('ArrowLeft');
  await expect(horizontal).toHaveAttribute('aria-valuenow', '1');
  await expect(
    page.getByRole('scrollbar', {name: 'Scroll rows'}),
  ).toHaveAttribute('aria-valuenow', '0');
  await horizontal.press('End');
  await expect(
    page.getByRole('columnheader', {name: 'Column 1000000'}),
  ).toBeInViewport({ratio: 0.99});
  await expect(horizontal).toBeFocused();
  await horizontal.press('Home');
  await expect(
    page.getByRole('columnheader', {name: 'Column 1', exact: true}),
  ).toBeInViewport({ratio: 0.99});
});
