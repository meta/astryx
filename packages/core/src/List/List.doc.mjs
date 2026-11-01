// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'List',
  displayName: 'List',
  group: 'List',
  category: 'Table & List',
  keywords: ["list","listitem","listbox","menu","collection","items","ul","navlist"],
  theming: {
    targets: [
      {className: 'astryx-list', visualProps: ['density', 'listStyle']},
      {className: 'astryx-list-item'},
    ],
  },
  description: 'List container with density, dividers, and header support.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'List items (ListItem components).',
      slotElements: [
        {
          __element: 'ListItem',
          props: {
            label: 'List item',
          },
        },
      ],
    },
    {
      name: 'density',
      type: "'compact' | 'balanced' | 'spacious'",
      description: 'Spacing density for items.',
      default: "'balanced'",
    },
    {
      name: 'hasDividers',
      type: 'boolean',
      description: 'Show dividers between items.',
      default: 'false',
    },
    {
      name: 'edge',
      type: "'padded' | 'flush' | 'outset' | 'bleed'",
      description:
        "Where each row's text, dividers, and hover and selection backgrounds sit, relative to the list's edges and the container around it. 'padded' keeps text inside each row's padding, so it starts a little in from a heading above the list and backgrounds have room around it. 'flush' drops the rows' side padding: text starts on the heading's line, and dividers and backgrounds stop at the row's content, with no room beyond it on either side. It works anywhere and suits static rows. 'outset' puts text on the heading's line and reaches dividers and backgrounds a little past it into the container's padding; it suits interactive rows in a container. 'bleed' puts text on the heading's line and reaches dividers and backgrounds to the container's edges with square corners, like Table rows in a Card. A row's first content is what lines up with the heading: its marker, icon, or avatar when it has one, otherwise its label. 'outset' and 'bleed' reach into the padding of the nearest container that shares its padding: a Card, Section, Dialog, or BottomSheet, or a transparent container such as a Layout region with explicit padding or a padded ScrollableArea. Place the List directly in that container's padding: padding that Stack, Center, or your own styles add in between is not counted. Drawers and the automatic padding of LayoutContent and LayoutPanel aren't supported yet. With no such container, including in a Popover, they look like 'padded'. In a container with less padding than the rows' own, text starts a little after the heading's line. A theme's inline padding on `item` replaces the row padding of every value, including the zero padding of flush.",
      default: "'padded'",
    },
    {
      name: 'edgeCompensation',
      type: "'inline'",
      description:
        "Deprecated: use edge=\"outset\", which this sets. Still works; edge wins when both are set. `astryx upgrade` rewrites existing usage.",
    },
    {
      name: 'header',
      type: 'ReactNode',
      description: 'Header content, associated with the list via aria-labelledby.',
      slotElements: [
        {
          __element: 'Text',
          props: {
            type: 'body',
          },
          children: 'Header',
        },
      ],
    },
    {
      name: 'listStyle',
      type: "'none' | 'disc' | 'decimal' | 'circle'",
      description: "List marker style. 'decimal' renders an <ol> element instead of <ul>.",
      default: "'none'",
    },
    {
      name: 'start',
      type: 'number',
      description:
        "Starting number for ordered lists (listStyle='decimal'). Sets the CSS counter to begin at this value.",
      default: '1',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {name: 'ListItem'},
  ],
  usage: {
    description:
      'A vertical collection of items with consistent spacing, dividers, and optional markers. Supports headers, icons, avatars, badges, and interactive items with click or link behavior. Use it to display ordered or unordered groups of related content.',
    bestPractices: [
      { guidance: true, description: 'Provide a header to label the list and give context to screen readers.' },
      { guidance: true, description: 'Use start and end content slots to add icons, avatars, or badges to each item.' },
      { guidance: true, description: 'Set edge to line row text up with a heading above the list: flush for static rows, outset or bleed for rows in a Card, Section, or Dialog.' },
      { guidance: true, description: 'To line text up with a heading and keep room around the highlight where there is no Card, such as a sidebar, put the heading and the list in a Section with variant="transparent" and set edge="outset".' },
      { guidance: false, description: 'Place interactive elements inside an interactive list item; it creates nested click targets and confusing focus behavior.' },
      { guidance: false, description: 'Use a list for a single item or for laying out unrelated content; lists imply a meaningful collection.' },
      { guidance: false, description: 'Mix clickable and non-clickable items in the same list without clear visual distinction.' },
    ],
    anatomy: [
      {name: 'List title', required: true, description: 'Heading that labels the list.'},
      {name: 'Description', required: false, description: 'Supplementary text below the title.'},
      {name: 'List items', required: true, description: 'Individual entries, which may include icons or images.'},
      {name: 'Item description', required: false, description: 'Additional detail for an individual list item.'},
    ],
  },
};
/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'A vertical collection of items with consistent spacing, dividers, and optional markers. Supports headers, icons, avatars, badges, and interactive items with click or link behavior. Use it to display ordered or unordered groups of related content.',
    bestPractices: [
      { guidance: true, description: 'Provide a header to label the list and give context to screen readers.' },
      { guidance: true, description: 'Use start and end content slots to add icons, avatars, or badges to each item.' },
      { guidance: true, description: 'Set edge to line row text up with a heading above the list: flush for static rows, outset or bleed for rows in a Card, Section, or Dialog.' },
      { guidance: true, description: 'To line text up with a heading and keep room around the highlight where there is no Card, such as a sidebar, put the heading and the list in a Section with variant="transparent" and set edge="outset".' },
      { guidance: false, description: 'Place interactive elements inside an interactive list item; it creates nested click targets and confusing focus behavior.' },
      { guidance: false, description: 'Use a list for a single item or for laying out unrelated content; lists imply a meaningful collection.' },
      { guidance: false, description: 'Mix clickable and non-clickable items in the same list without clear visual distinction.' },
    ],
    anatomy: [
      {name: 'List title', required: true, description: 'Heading that labels the list.'},
      {name: 'Description', required: false, description: 'Supplementary text below the title.'},
      {name: 'List items', required: true, description: 'Individual entries, which may include icons or images.'},
      {name: 'Item description', required: false, description: 'Additional detail for an individual list item.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Vertical list for rendering item collections w/ consistent spacing, dividers, marker styles. Composition model: List wraps ListItem sub-components.',
  usage: {
    description:
      'A vertical collection of items with consistent spacing, dividers, and optional markers. Supports headers, icons, avatars, badges, and interactive items with click or link behavior. Use it to display ordered or unordered groups of related content.',
    bestPractices: [
      { guidance: true, description: 'Provide a header to label the list and give context to screen readers.' },
      { guidance: true, description: 'Use start and end content slots to add icons, avatars, or badges to each item.' },
      { guidance: true, description: 'Set edge to line row text up with a heading above the list: flush for static rows, outset or bleed for rows in a Card, Section, or Dialog.' },
      { guidance: true, description: 'To line text up with a heading and keep room around the highlight where there is no Card, such as a sidebar, put the heading and the list in a Section with variant="transparent" and set edge="outset".' },
      { guidance: false, description: 'Place interactive elements inside an interactive list item; it creates nested click targets and confusing focus behavior.' },
      { guidance: false, description: 'Use a list for a single item or for laying out unrelated content; lists imply a meaningful collection.' },
      { guidance: false, description: 'Mix clickable and non-clickable items in the same list without clear visual distinction.' },
    ],
    anatomy: [
      {name: 'List title', required: true, description: 'Heading that labels the list.'},
      {name: 'Description', required: false, description: 'Supplementary text below the title.'},
      {name: 'List items', required: true, description: 'Individual entries, which may include icons or images.'},
      {name: 'Item description', required: false, description: 'Additional detail for an individual list item.'},
    ],
  },
};
