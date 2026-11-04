// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MetadataList',
  displayName: 'Metadata List',
  group: 'MetadataList',
  category: 'Table & List',
  keywords: ["metadata","description","definition","keyvalue","properties","details","attributes","summary","descriptionlist","descriptions"],
  theming: {
    targets: [
      {
        className: 'astryx-metadata-list',
        visualProps: ['columns', 'orientation'],
      },
      {className: 'astryx-metadata-list-item'},
    ],
  },
  description: 'Container for metadata items with column layout, orientation, and collapse support.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Metadata items (MetadataListItem components).',
      slotElements: [
        {
          __element: 'MetadataListItem',
          props: {
            label: 'Key',
          },
          children: 'Value',
        },
      ],
      required: true,
    },
    {
      name: 'columns',
      type: "'multi' | 'single' | number",
      description: 'Column layout mode.',
      default: "'single'",
    },
    {
      name: 'label',
      type: "{ position?: 'start' | 'top', width?: number | string }",
      description: "Label display configuration. position controls label placement, width sets a custom label column width. Defaults to { position: 'top' } for multi-column layouts. Position is ignored in horizontal mode, which always uses { position: 'top' }.",
      default: "{ position: 'start' } (vertical single-column) / { position: 'top' } (multi-column or horizontal)",
    },
    {
      name: 'maxNumOfItems',
      type: 'number',
      description: 'Maximum items to show before collapsing with a show more/less toggle.',
    },
    {
      name: 'orientation',
      type: "'vertical' | 'horizontal'",
      description: 'Layout orientation. Horizontal mode flows items in a row with flex-wrap.',
      default: "'vertical'",
    },
    {
      name: 'title',
      type: 'ReactNode',
      description: 'Optional title or heading above the list.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization. Must be a stylex.create() value.',
    },
  ],
  components: [
    {name: 'MetadataListItem'},
  ],
  usage: {
    description:
      'MetadataList displays key-value pairs for object attributes like quality, condition, and status, in a structured layout. Use it for detail panels, settings summaries, and record information.',
    bestPractices: [
      { guidance: true, description: 'Choose label position based on content: "start" for short values, "top" for long or complex values.' },
      { guidance: true, description: 'Collapse long lists with `maxNumOfItems` to keep the page scannable.' },
      { guidance: false, description: 'Use for extensive form input; use a form layout instead.' },
      { guidance: false, description: "Use for data that doesn't have a clear key-value structure." },
    ],
    anatomy: [
      {name: 'Title', required: false, description: 'Optional title for the metadata list.'},
      {name: 'Label', required: true, description: 'The key label for each metadata entry.'},
      {name: 'Metadata', required: true, description: 'The value displayed in various formats.'},
      {name: 'Disclosure', required: false, description: 'Collapse/expand control for the list.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'MetadataList displays key-value pairs for object attributes like quality, condition, and status, in a structured layout. Use it for detail panels, settings summaries, and record information.',
    bestPractices: [
      { guidance: true, description: 'Choose label position based on content: "start" for short values, "top" for long or complex values.' },
      { guidance: true, description: 'Collapse long lists with `maxNumOfItems` to keep the page scannable.' },
      { guidance: false, description: 'Use for extensive form input; use a form layout instead.' },
      { guidance: false, description: "Use for data that doesn't have a clear key-value structure." },
    ],
    anatomy: [
      {name: 'Title', required: false, description: 'Optional title for the metadata list.'},
      {name: 'Label', required: true, description: 'The key label for each metadata entry.'},
      {name: 'Metadata', required: true, description: 'The value displayed in various formats.'},
      {name: 'Disclosure', required: false, description: 'Collapse/expand control for the list.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'label/value metadata display; column layout, collapse, orientation variants',
  usage: {
    description:
      'MetadataList displays key-value pairs for object attributes like quality, condition, and status, in a structured layout. Use it for detail panels, settings summaries, and record information.',
    bestPractices: [
      { guidance: true, description: 'Choose label position based on content: "start" for short values, "top" for long or complex values.' },
      { guidance: true, description: 'Collapse long lists with `maxNumOfItems` to keep the page scannable.' },
      { guidance: false, description: 'Use for extensive form input; use a form layout instead.' },
      { guidance: false, description: "Use for data that doesn't have a clear key-value structure." },
    ],
    anatomy: [
      {name: 'Title', required: false, description: 'Optional title for the metadata list.'},
      {name: 'Label', required: true, description: 'The key label for each metadata entry.'},
      {name: 'Metadata', required: true, description: 'The value displayed in various formats.'},
      {name: 'Disclosure', required: false, description: 'Collapse/expand control for the list.'},
    ],
  },
};
