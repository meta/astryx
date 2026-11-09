// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AppShell',
  name: 'AppShell — Top Nav Only',
  displayName: 'AppShell — Top Nav Only',
  description:
    'Simple layout with TopNav and no side navigation, suitable for landing pages.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'AppShell',
    'TopNav',
    'Heading',
    'Text',
    'VStack',
    'NavIcon',
  ],
  icons: {CubeIcon: 'package'},
};
