// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'MobileNavToggle',
  name: 'MobileNavToggle — Basic',
  displayName: 'MobileNavToggle — Basic',
  description:
    'A nav toggle with a custom icon and accessible label instead of the default hamburger. It opens a MobileNav drawer via the AppShell mobile context, which AppShell provides automatically.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'MobileNav',
    'MobileNavToggle',
    'AppShell',
    'SideNavItem',
    'SideNavSection',
    'Icon',
    'HStack',
    'Text',
  ],
  fits: ['navigation', 'header'],
};
