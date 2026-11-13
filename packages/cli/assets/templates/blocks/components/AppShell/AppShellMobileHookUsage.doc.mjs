// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useAppShellMobile',
  name: 'useAppShellMobile — Custom Mobile Trigger',
  displayName: 'useAppShellMobile — Custom Mobile Trigger',
  description:
    'Custom mobile navigation trigger built with useAppShellMobile. The trigger consumes the surrounding AppShell context instead of rendering its own shell.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['AppShell', 'Button', 'Text', 'Layout'],
  fits: ['navigation', 'header'],
};
