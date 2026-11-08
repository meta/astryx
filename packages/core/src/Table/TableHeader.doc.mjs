// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TableHeader',
  subComponentOf: 'Table',
  displayName: 'Table Header',
  isHiddenFromOverview: true,
  description:
    '<thead> wrapper for children mode. Holds the header row, whose cells are TableHeaderCell. A row must sit inside a section: <table> cannot contain a <tr> directly, because the HTML parser inserts an implied <tbody> when it parses server-rendered markup and React does not when it renders on the client, so the two trees mismatch on hydration. The data-driven data={...} mode renders this element itself whenever columns are supplied; in children mode it is yours to supply.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The <thead> rows.',
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
    targets: [{className: 'astryx-table-header'}],
  },
};

export const docsDense = {
  name: 'TableHeader',
  isHiddenFromOverview: true,
  displayName: 'Table Header',
  description: '<thead> wrapper for children mode; holds the header row',
  propDescriptions: {
    children: 'The <thead> rows.',
    xstyle: 'StyleX styles for layout customization',
  },
};
