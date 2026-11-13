// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'SideNavCollapseButton',
  name: 'SideNavCollapseButton — Basic',
  displayName: 'SideNavCollapseButton — Basic',
  description:
    'Place a collapse button in the SideNav footer to let users toggle the rail between expanded and collapsed states. Disable the built-in button via collapsible={{hasButton: false}} when positioning it yourself.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['SideNav', 'SideNavCollapseButton', 'SideNavItem'],
  fits: ['navigation'],
};
