// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenuDivider',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Divider',
  isHiddenFromOverview: true,
  description:
    'A horizontal rule separating groups of rows in a compound menu. Renders role="separator", so it is never a stop in the arrow-key order. The data-driven equivalent is the `{type: "divider"}` entry in `items`; both modes render this component, so they look and theme identically. Host attributes and DOM handlers (id, data-*, aria-*) reach the separator; its role and orientation stay component-owned.',
  props: [
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied after the menu spacing. Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-dropdown-menu-divider'}],
  },
};

export const docsDense = {
  name: 'DropdownMenuDivider',
  isHiddenFromOverview: true,
  displayName: 'Dropdown Menu Divider',
  description:
    'separator row for compound menus; compound peer of the data API\'s {type: "divider"}; host attributes reach the separator, role/orientation stay owned',
  propDescriptions: {
    xstyle: 'StyleX styles applied after the menu spacing',
  },
};
