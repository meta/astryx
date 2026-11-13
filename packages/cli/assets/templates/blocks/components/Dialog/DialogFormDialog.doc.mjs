// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  alsoExampleFor: ['useImperativeDialog'],
  name: 'Dialog — Form',
  displayName: 'Dialog — Form',
  description:
    'Collects user input without navigating away from the page. Uses purpose="form" so clicking the backdrop won\'t close it. Use for editing profiles, creating items, or updating settings inline.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['Dialog', 'Layout', 'Button', 'TextInput', 'TextArea'],
  fits: ['overlay', 'form'],
};
