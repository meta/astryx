// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TypeaheadItem',
  subComponentOf: 'Typeahead',
  displayName: 'Typeahead Item',
  description:
    'Default dropdown item renderer for typeahead results. Shows label with optional icon, description, and avatar. Exported for use in custom renderItem implementations.',
  props: [
    {
      name: 'item',
      type: 'SearchableItem',
      description: 'The search result item to render.',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Icon or avatar to display before the label.',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'description',
      type: 'string',
      description: 'Description text displayed below the label.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether this item is visually disabled.',
      default: 'false',
    },
    {
      name: 'group',
      type: 'string',
      description:
        'This prop has no effect. Set `item.auxiliaryData.group` on search-source items to group results in Typeahead or BaseTypeahead.',
    },
  ],
};

export const docsZh = {
  name: 'TypeaheadItem',
  displayName: 'Typeahead Item',
  description:
    '预输入结果的默认下拉项渲染器。显示标签以及可选的图标、描述和头像。导出供自定义 renderItem 实现使用。',
  props: [
    {
      name: 'item',
      type: 'SearchableItem',
      description: '要渲染的搜索结果项。',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: '在标签前显示的图标或头像。',
    },
    {
      name: 'description',
      type: 'string',
      description: '显示在标签下方的描述文本。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '此项是否在视觉上被禁用。',
      default: 'false',
    },
    {
      name: 'group',
      type: 'string',
      description:
        '此属性不影响渲染。要在 Typeahead 或 BaseTypeahead 中分组，请在搜索源返回的结果项上设置 `item.auxiliaryData.group`。',
    },
  ],
};

export const docsDense = {
  name: 'TypeaheadItem',
  displayName: 'Typeahead Item',
  description:
    'Default dropdown item renderer. Label w/ optional icon, description, avatar. Exported for custom renderItem.',
  propDescriptions: {
    item: 'Search result item to render.',
    icon: 'Icon/avatar before label.',
    description: 'Text below label.',
    isDisabled: 'Visually disabled.',
    group:
      'No effect. Group results via `item.auxiliaryData.group` in the search source.',
  },
};
