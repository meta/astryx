// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TableBody',
  subComponentOf: 'Table',
  displayName: 'Table Body',
  isHiddenFromOverview: true,
  description:
    '<tbody> wrapper for children mode. Holds the data rows. A row must sit inside a section: <table> cannot contain a <tr> directly, because the HTML parser inserts an implied <tbody> when it parses server-rendered markup and React does not when it renders on the client, so rows written straight into Table mismatch on hydration. The data-driven data={...} mode renders this element itself; in children mode it is yours to supply.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The <tbody> rows.',
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-table-body'}],
  },
};

export const docsDense = {
  name: 'TableBody',
  isHiddenFromOverview: true,
  displayName: 'Table Body',
  description: '<tbody> wrapper for children mode; holds the data rows; children mode does not add one for you',
  propDescriptions: {
    children: 'The <tbody> rows.',
    xstyle: 'StyleX styles for layout customization',
  },
};
