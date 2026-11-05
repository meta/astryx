// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TableFooter',
  subComponentOf: 'Table',
  displayName: 'Table Footer',
  isHiddenFromOverview: true,
  description:
    '<tfoot> wrapper for children mode. Holds summary or total rows beneath the body. A row must sit inside a section: <table> cannot contain a <tr> directly, because the HTML parser inserts an implied <tbody> when it parses server-rendered markup and React does not when it renders on the client, so the two trees mismatch on hydration. Children mode only: the data-driven data={...} path renders a header and a body, never a footer.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The <tfoot> rows.',
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
    targets: [{className: 'astryx-table-footer'}],
  },
};

export const docsDense = {
  name: 'TableFooter',
  isHiddenFromOverview: true,
  displayName: 'Table Footer',
  description: '<tfoot> wrapper for children mode; holds summary rows',
  propDescriptions: {
    children: 'The <tfoot> rows.',
    xstyle: 'StyleX styles for layout customization',
  },
};
