// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatDictation',
  name: 'useChatDictation — Voice input',
  displayName: 'useChatDictation — Voice input',
  description:
    'A composer filled by useChatDictation. Partial words show above the field, and each finished phrase is inserted into the composer. The control stays off when the browser has no speech recognition.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ChatComposerInput', 'Button', 'Text', 'Layout'],
};
