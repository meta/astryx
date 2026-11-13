// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  alsoExampleFor: ['useImperativeDialog'],
  alsoShowcaseFor: ['useImperativeDialog'],
  name: 'Dialog — Confirmation',
  displayName: 'Dialog — Confirmation',
  description:
    'Asks the user to confirm a destructive action before it happens. Use before deleting projects, removing team members, revoking API keys, or any irreversible operation.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Dialog', 'Layout', 'Button', 'Text'],
  fits: ['overlay'],
};
