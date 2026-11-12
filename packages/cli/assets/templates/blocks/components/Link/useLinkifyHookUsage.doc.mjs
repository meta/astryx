// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useLinkify',
  name: 'useLinkify — Links in a Comment Thread',
  displayName: 'useLinkify — Links in a Comment Thread',
  description:
    'Plain-text comments where useLinkify turns the URL and the email address into Links, and a custom pattern turns issue references like #123 into tracker links — the patterns option in action. The comment without matches stays plain text.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Link', 'Layout', 'Text'],
};
