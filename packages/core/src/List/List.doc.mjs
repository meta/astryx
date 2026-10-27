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
      description: "Spacing density for items. Under a finger, an interactive row's hit target reaches 44px where its neighbors leave room, with no change to how rows look or lay out.",
      default: "'balanced'",
    },
    {
      name: 'hasDividers',
      type: 'boolean',
      description: 'Show dividers between items. Under a finger, a touch press hides the dividers on either side of the pressed row until the finger lifts, as iOS lists do.',
      default: 'false',
    },
    {
      name: 'hasAnimatedChanges',
      type: 'boolean',
      description: 'Under a finger, animate changes to the rows the way an iOS table does: when rows are inserted, removed or reordered, the rows that stay slide to their new places, a removed row collapses in place, and new rows fade in once the rows sliding past have cleared them; a row that crosses rows moving the other way rides above them with the surface color behind it. Rows need stable keys. With a mouse nothing moves.',
      default: 'false',
    },
    {
      name: 'reorderable',
      type: 'Reorderable',
      description:
        "Makes the rows reorderable, with the object createReorderable({onReorder, isReorderable}) makes: each ListItem with an itemKey gets a reorder handle at its end, and each committed move calls onReorder once with the row's key and its index after the move ({key, to}); render the rows in the new order to apply it. A row the object's isReorderable rejects has no handle and keeps its place; one at either end of the list also bounds the others. The object may be made on every render. On a touch screen, a finger held still on a handle for a moment picks up its row (a flick on it still scrolls): the row stays in its place, dimmed, while a copy of it follows the finger and an accent line marks where it would land; the other rows stay still, the page scrolls near the edges, and on release the rows rearrange, gliding to their new places. A mouse drags a handle at once with the same copy and line, and the rows take their places without motion; a drag reports once, at the drop, and a cancelled drag puts everything back at once. In reorder mode the line marks the row's new place after each move. Without a drag, the handle is a toggle: a click, Space or Enter turns on reorder mode for its row (aria-pressed), in which each Up or Down arrow moves the row a place at once and reports it, and Escape or another activation ends the mode, keeping the moves. Each move is announced once it renders, with the row's place and its neighbours ('Milk, position 3 of 5, after Eggs, before Bread'), and a move into a row that keeps its place is refused and announced. The object's start(key) enters the same mode from your own UI, such as a row's context menu. A disabled row's handle stays focusable but moves nothing.",
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
      {name: 'Reorder handle', required: false, description: 'With reorderable: the button at the end of each row that can move. It drags the row, and toggles its reorder mode.'},
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
      {name: 'Reorder handle', required: false, description: 'With reorderable: the button at the end of each row that can move. It drags the row, and toggles its reorder mode.'},
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
      {name: 'Reorder handle', required: false, description: 'With reorderable: the button at the end of each row that can move. It drags the row, and toggles its reorder mode.'},
    ],
  },
};
