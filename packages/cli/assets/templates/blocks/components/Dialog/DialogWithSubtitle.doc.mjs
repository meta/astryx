// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  alsoExampleFor: ['useImperativeDialog'],
  name: 'Dialog — Required',
  displayName: 'Dialog — Required',
  description:
    'Cannot be dismissed by Escape or backdrop click; the user must explicitly choose an action. Uses purpose="required". Use for ownership transfers, legal acknowledgements, or critical decisions where skipping is not an option.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Dialog', 'Layout', 'Button', 'Text'],
  fits: ['overlay'],
};
