// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useInputStatusIcon',
  name: 'useInputStatusIcon — Coupon Code Status',
  displayName: 'useInputStatusIcon — Coupon Code Status',
  description:
    'A custom bordered coupon-code input whose status affordance comes from useInputStatusIcon. A wrong code shows the error status and SAVE20 shows success. Switching the variant moves between a plain glyph with a message below (attached), no icon on the field (detached), and a focusable button whose tooltip keyboard and screen-reader users can reach, with its aria-describedby id returned by the hook (tooltip).',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Field', 'SegmentedControl', 'Text', 'Layout'],
};
