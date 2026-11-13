// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Outline',
  name: 'Outline — Controlled',
  displayName: 'Outline — Controlled',
  description:
    'Drive the active section yourself with activeId and onActiveIdChange. Providing activeId disables the built-in scroll-spy so your own logic owns the highlight.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Outline', 'Layout', 'Text', 'Button'],
  fits: ['panel', 'navigation'],
};
