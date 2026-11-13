// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposerInput',
  name: 'ChatComposerInput — Multiple Triggers',
  displayName: 'ChatComposerInput — Multiple Triggers',
  description:
    'Chat input with both @ mentions and / commands. Each trigger type renders tokens in a distinct color so users can tell them apart at a glance.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatComposer', 'ChatComposerInput', 'Typeahead', 'Layout', 'Text'],
  fits: ['chat'],
};
