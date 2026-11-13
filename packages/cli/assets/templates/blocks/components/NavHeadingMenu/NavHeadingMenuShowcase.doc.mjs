// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'NavHeadingMenu',
  name: 'NavHeadingMenu',
  displayName: 'Nav Heading Menu',
  description:
    'NavHeadingMenu passed as the menu prop of SideNavHeading, letting the heading act as a product switcher popover trigger.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['SideNav', 'SideNavHeading', 'NavHeadingMenu', 'NavHeadingMenuItem'],
  fits: ['navigation', 'overlay'],
};
