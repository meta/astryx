// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useLinkComponent',
  name: 'useLinkComponent — Article Cards',
  displayName: 'useLinkComponent — Article Cards',
  description:
    'A custom Article card renders its title link with the component useLinkComponent resolves: the as prop first, then the nearest LinkProvider, then a native anchor. Inside a LinkProvider wired to a client-side router, the title navigates without a page load and updates the router location. With as="a" the title is a native anchor even inside the provider, and outside the provider it falls back to the next provider up or a native anchor.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['LinkProvider', 'Card', 'Layout', 'Text'],
};
