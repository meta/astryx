// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableGroupedRows',
  subComponentOf: 'Table',
  displayName: 'useTableGroupedRows',
  description:
    'Hook that groups a flat data array into collapsible section rows. Each distinct groupBy value becomes a full-width section-header row with a chevron toggle, the group label, and a member count; collapsing hides that group\'s data rows while keeping the header visible. The disclosure state lives on the chevron button, not the native table row. Mirrors useTableTreeState: the consumer owns the collapsedGroups set and the hook returns {data, plugin, idKey}: pass them to Table as data, plugins, and idKey respectively. Grouping runs on the rows you hand it, so with pagination the order is filter, sort, slice, then group: sort by the group key first and the user\'s keys second, so a section\'s rows stay contiguous and each page appends to the bottom of the table instead of splicing rows in above the reader. A page that ends on a row count still cuts mid-section, and the heading then counts what has loaded rather than what exists: "6" quietly becoming "10". Where the full result set is in hand, carry the cut forward to the end of the section it lands in: every rendered section is then whole and its count is a total.',
  props: [
    {
      name: 'data',
      type: 'T[]',
      description: 'The flat data to group.',
      required: true,
    },
    {
      name: 'groupBy',
      type: '(item: T) => string',
      description:
        'Derive the group key for a row. Rows with the same key share a section.',
      required: true,
    },
    {
      name: 'collapsedGroups',
      type: 'Set<string>',
      description: 'Set of currently-collapsed group keys.',
      required: true,
    },
    {
      name: 'onToggleGroup',
      type: '(groupKey: string) => void',
      description: 'Called with a group key when its header is toggled.',
      required: true,
    },
    {
      name: 'renderGroupHeader',
      type: '(groupKey: string, count: number, collapsed: boolean) => ReactNode',
      description:
        "Custom renderer for a group header's content (right of the chevron). Defaults to `<groupKey> (<count>)`.",
    },
    {
      name: 'getRowKey',
      type: '(item: T) => string',
      description:
        'Stable key for a real row. Falls back to a positional key when omitted.',
    },
    {
      name: 'groupOrder',
      type: 'string[]',
      description:
        'Explicit group ordering; groups not listed keep first-seen order after these.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Groups a flat data array into collapsible section rows. Each groupBy value becomes a full-width header (chevron + label + count); collapsing hides its rows, and aria-expanded stays on the button rather than the native row. Returns {data, plugin, idKey}: pass them to Table data / plugins / idKey. Consumer owns the collapsedGroups set. Under pagination the order is filter, sort, slice, group: sort by the group key first so sections stay contiguous and pages append at the bottom. A row-count cut lands mid-section and the heading counts the page, not the section; where the whole result set is in hand, carry the cut to the end of the section it lands in so every rendered section is complete.',
  propDescriptions: {
    data: 'The flat data to group.',
    groupBy: "Derive a row's group key. Same key = same section.",
    collapsedGroups: 'Set of currently-collapsed group keys.',
    onToggleGroup: 'Called with the group key when a header is toggled.',
    renderGroupHeader:
      "Custom header content (right of chevron). Default '<key> (<count>)'. Args: (key, count, collapsed).",
    getRowKey: 'Stable key for a real row; positional fallback when omitted.',
    groupOrder: 'Pin these group keys first; others keep first-seen order.',
  },
};
