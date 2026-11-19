// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Inside a card',
  displayName: 'Inside a card',
  description:
    'Set container="card" on a card parent: threads become divider-bounded Sections, so cards never nest, and the composer docks at the bottom of the card.',
  exampleFor: 'Comments',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: ['Comments', 'Card'],
};
