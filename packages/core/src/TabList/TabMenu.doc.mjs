// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TabMenu',
  subComponentOf: 'TabList',
  displayName: 'Tab Menu',
  isHiddenFromOverview: true,
  description: "Overflow menu trigger that opens a dropdown of additional tab options, showing the selected option's label as the trigger text. Host attributes and DOM event handlers (id, aria-*, data-*, drag and drop) reach the trigger button, not the popup or its options. The button keeps its role, tab stop, and menu disclosure attributes.",
  // TabMenu requires TabList context; wrap it so the preview doesn't throw.
  // The wrapper value matches none of the options, so the trigger shows its
  // own label (the idle overflow state).
  playground: {
    defaults: {
      label: 'More',
      options: [
        {value: 'settings', label: 'Settings'},
        {value: 'integrations', label: 'Integrations'},
        {value: 'billing', label: 'Billing'},
      ],
    },
    wrapper: {component: 'TabList', props: {value: 'overview'}},
  },
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Label for the trigger button (shown when no option is selected) and the dropdown heading divider.',
      required: true,
    },
    {
      name: 'options',
      type: 'TabMenuOption[]',
      description: 'Array of menu options rendered in the dropdown.',
      required: true,
    },
  ],
};

export const docsZh = {
  name: 'TabMenu',
  isHiddenFromOverview: true,
  displayName: 'Tab Menu',
  description: '溢出菜单触发器，打开包含额外标签选项的下拉菜单，将选中选项的标签显示为触发器文本。宿主属性和 DOM 事件处理器（id、aria-*、data-*、拖放）传递给触发按钮，而不是弹出菜单或选项。按钮保留自己的角色、Tab 停靠点及菜单展开属性。',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '触发器按钮的标签（无选项选中时显示）以及下拉菜单标题分隔线的文本。',
      required: true,
    },
    {
      name: 'options',
      type: 'TabMenuOption[]',
      description: '在下拉菜单中渲染的菜单选项数组。',
      required: true,
    },
  ],
};

export const docsDense = {
  name: 'TabMenu',
  isHiddenFromOverview: true,
  displayName: 'Tab Menu',
  description:
    "Overflow menu trigger; shows selected option's label. Host attributes/DOM handlers reach the trigger button, not the popup/options; role, tab stop and disclosure attributes stay owned.",
  propDescriptions: {
    label: 'Trigger text (when no option selected) + dropdown heading.',
    options: 'Menu options array rendered in dropdown.',
  },
};
