// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Dialog',
  alsoExampleFor: ['useImperativeDialog'],
  name: 'Dialog — Scrollable',
  displayName: 'Dialog — Scrollable',
  description:
    'Constrains the dialog height and scrolls the body when content overflows. Use for terms and conditions, license agreements, changelogs, or any long-form content the user needs to review before accepting.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['Dialog', 'Layout', 'Button', 'Text'],
  fits: ['overlay', 'content'],
};
