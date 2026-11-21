// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverTriggerSwitch.interaction.browser.spec.ts
 * @input The Popover Trigger Switch story, whose children switch from a button
 *   element to a render function that renders a different button, real
 *   pointer input and the interaction harness
 * @output Proof that the popover opens anchored to the new trigger: the
 *   trigger carries the anchor name the layer positions against, and the
 *   layer sits just below it
 * @position Browser proof for Popover.tsx's trigger release when a
 *   render-prop trigger takes over
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const surface = (page: Page) =>
  page.getByRole('dialog', {name: 'Anchor check'});

/** The positioned layer around the dialog: its `popover` element. */
async function readLayer(page: Page) {
  return surface(page).evaluate(node => {
    const layer = node.closest('[popover]') ?? node;
    const box = layer.getBoundingClientRect();
    return {
      positionAnchor: getComputedStyle(layer)
        .getPropertyValue('position-anchor')
        .trim(),
      box: {x: box.x, y: box.y, width: box.width, height: box.height},
    };
  });
}

test('a render-function trigger that replaces an element trigger anchors the popover', async ({
  page,
}) => {
  await openStory(
    page,
    storybook(),
    'core-popover-trigger-switch--switch-element-to-render',
  );
  await page.getByRole('button', {name: 'Switch the trigger'}).click();
  const trigger = page.getByRole('button', {name: 'Second trigger'});
  await trigger.click();
  await expect(surface(page)).toBeVisible();

  // The new trigger carries the anchor name the layer positions against.
  const {positionAnchor} = await readLayer(page);
  expect(positionAnchor).toMatch(/^--/);
  await expect
    .poll(async () =>
      trigger.evaluate(node =>
        getComputedStyle(node).getPropertyValue('anchor-name').trim(),
      ),
    )
    .toBe(positionAnchor);

  // The layer sits just below the trigger, over its columns.
  await expect
    .poll(async () => {
      const box = await trigger.boundingBox();
      const {box: layer} = await readLayer(page);
      if (box == null) {
        return false;
      }
      const gap = layer.y - (box.y + box.height);
      const overlapsInline =
        layer.x < box.x + box.width && layer.x + layer.width > box.x;
      return gap >= 0 && gap < 24 && overlapsInline;
    })
    .toBe(true);
});
