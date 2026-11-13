// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'LinkProvider',
  name: 'Link Provider — Custom Link Component',
  displayName: 'Link Provider — Custom Link Component',
  description:
    'Routes every Astryx link through a custom component that intercepts the click, the hook frameworks like Next.js use for client-side navigation. Click the link to see the custom handler fire instead of a full-page load.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['LinkProvider', 'Link'],
  fits: [],
};
