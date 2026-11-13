// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Toast',
  name: 'Toast — Deduplication',
  displayName: 'Toast — Deduplication',
  description: 'Prevent duplicate toasts with uniqueID. Use ignore to keep the first toast, or overwrite to replace it with updated content like a progress percentage.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Toast', 'Button', 'Layout', 'Text'],
  fits: ['overlay'],
};
