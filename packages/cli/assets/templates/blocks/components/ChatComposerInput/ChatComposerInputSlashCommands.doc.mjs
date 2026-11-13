// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatComposerInput',
  name: 'ChatComposerInput — Slash Commands',
  displayName: 'ChatComposerInput — Slash Commands',
  description:
    'Chat input with a / trigger for command selection. Use for AI assistants or bots that support structured commands.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatComposer', 'ChatComposerInput', 'Typeahead', 'Layout'],
  fits: ['chat'],
};
