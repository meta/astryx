// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ToggleButtonGroup',
  subComponentOf: 'ToggleButton',
  displayName: 'Toggle Button Group',
  keywords: [
    'togglegroup',
    'buttontogglegroup',
  ],
  description: 'Groups toggle buttons for exclusive (single) or multi-select behavior. Uses discriminated union on type for type-safe value/onChange.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'ToggleButton children. Give each member a value; the group owns its pressed state and ignores its isPressed, onPressedChange, and pressedChangeAction props. Member activation calls the group’s onChange without starting a member Action transition.',
      required: true,
      slotElements: [
        {
          __element: 'ToggleButton',
          props: {
            label: 'Option',
            value: 'option',
          },
        },
      ],
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the group (aria-label).',
      required: true,
    },
    {
      name: 'type',
      type: "'single' | 'multiple'",
      description: 'Selection mode. Single allows one active button, multiple allows many.',
      default: "'single'",
    },
    {
      name: 'value',
      type: 'string | null | string[]',
      description: 'Currently selected value(s). Type depends on selection mode.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string | null | string[]) => void',
      description: 'Called when selection changes.',
      required: true,
    },
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description: 'Layout direction of the button group.',
      default: "'horizontal'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Default size for buttons in the group. Individual buttons can override.',
      default: "'md'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether all buttons in the group are disabled.',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
};

export const docsZh = {
  name: 'ToggleButtonGroup',
  displayName: 'Toggle Button Group',
  description: '将切换按钮分组，支持单选或多选行为。通过 type 判别联合类型实现类型安全。',
  propDescriptions: {
    children: 'ToggleButton 子元素；每个成员都需要 value。分组控制按下状态，并忽略成员的 isPressed、onPressedChange 和 pressedChangeAction。激活成员只调用分组的 onChange，不启动成员的 Action 过渡。',
    label: '分组的无障碍标签 (aria-label)。',
    type: '选择模式。single 允许单个激活，multiple 允许多个。',
    value: '当前选中的值。类型取决于选择模式。',
    onChange: '选择变更时的回调。',
    orientation: '按钮组的布局方向。',
    size: '分组内按钮的默认尺寸。单个按钮可覆盖。',
    isDisabled: '分组内所有按钮是否禁用。',
    xstyle: 'StyleX 样式，用于布局自定义。必须是 stylex.create() 的值。',
    "data-testid": '自动化测试的选择器。',
  },
};

export const docsDense = {
  name: 'ToggleButtonGroup',
  displayName: 'Toggle Button Group',
  description: 'groups toggle btns for exclusive/multi-select; discriminated union on type',
  propDescriptions: {
    children: 'ToggleButton children; each member needs a value. Group owns pressed state; member isPressed/onPressedChange/pressedChangeAction are ignored. Selection uses group onChange, with no member Action transition.',
    label: 'a11y label (aria-label)',
    type: 'selection mode: single or multiple',
    value: 'selected value(s); type depends on mode',
    onChange: 'selection change cb',
    orientation: 'layout direction',
    size: 'default btn size; individual btns override',
    isDisabled: 'all btns disabled',
    xstyle: 'StyleX layout styles; must be stylex.create() value',
    "data-testid": 'test selector',
  },
};
