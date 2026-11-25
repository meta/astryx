// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressEmptySelection.interaction.browser.spec.ts
 * @input SegmentedControl's Default story with no text selected
 * @output Proves a later mouse press on a segment reads no composed selection
 *   ranges: the gesture host reads the selection only when one may exist
 * @position Interaction proof for utils/selectionLock.ts selectionRangesOf,
 *   which GestureHost calls at each mouse or pen press
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

test('a later mouse press with no text selected reads no composed selection ranges', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit has no getComposedRanges to count',
  );
  await page.goto(
    `${storybook()}/iframe.html?id=core-segmentedcontrol--default&viewMode=story`,
  );
  const segment = page.getByRole('radio', {name: 'List'});
  await segment.waitFor();
  await page.evaluate(() => {
    const proto = Selection.prototype as Selection & {
      getComposedRanges?: (...args: unknown[]) => StaticRange[];
    };
    const original = proto.getComposedRanges;
    const calls = {count: 0};
    (window as unknown as {__composedReads: typeof calls}).__composedReads =
      calls;
    if (original != null) {
      proto.getComposedRanges = function (this: Selection, ...args) {
        calls.count += 1;
        return original.apply(this, args);
      };
    }
    getSelection()?.removeAllRanges();
  });
  // The first press after attach reads once; count the next one.
  await page.getByRole('radio', {name: 'Grid'}).click();
  await page.evaluate(() => {
    (
      window as unknown as {__composedReads: {count: number}}
    ).__composedReads.count = 0;
  });
  await segment.click();
  await expect(segment).toBeChecked();
  const reads = await page.evaluate(
    () =>
      (window as unknown as {__composedReads: {count: number}}).__composedReads
        .count,
  );
  expect(reads).toBe(0);
});
