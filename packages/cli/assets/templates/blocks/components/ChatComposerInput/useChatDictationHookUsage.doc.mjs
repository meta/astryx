// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatDictation',
  name: 'useChatDictation — Voice input',
  displayName: 'useChatDictation — Voice input',
  description:
    'A composer filled by useChatDictation in the provider locale. Partial words show in the composer as ghost text, and each finished phrase is inserted there once. The control stays off when the browser has no speech recognition.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ChatComposerInput', 'Button', 'Text', 'Layout'],
};
