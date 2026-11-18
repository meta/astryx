// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogHeroHeaderShowcase.doc.mjs
 * @input DialogHeroHeaderShowcase.tsx
 * @output Showcase ownership and preview metadata
 * @position Lab integration template registration for DialogHeroHeader
 */

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'DialogHeroHeader',
  displayName: 'Dialog Hero Header',
  description:
    'An onboarding dialog with full-bleed artwork and an overlaid close button.',
  exampleFor: 'DialogHeroHeader',
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'DialogHeroHeader',
    'Dialog',
    'Layout',
    'LayoutContent',
    'LayoutFooter',
    'Button',
    'Text',
  ],
};
