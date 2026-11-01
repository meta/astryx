// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'SelectableCardGroup',
  displayName: 'Selectable Card Group',
  category: 'Form Controls',
  keywords: [
    'card',
    'selectable',
    'group',
    'radio',
    'radiogroup',
    'checkbox',
    'single choice',
    'multiple choice',
    'plan picker',
    'selection',
  ],
  description:
    'A set of selectable cards with the semantics of its selection. One choice (the default) is a radio group: the cards are native radios sharing one name, so the set is one tab stop, the arrow keys move and select, and screen readers speak the position ("2 of 3"). Several choices are a named group of checkboxes. Each SelectableCardGroupItem is a SelectableCard whose input, name and selection come from the group.',
  props: [
    {
      name: 'label',
      type: 'string',
      description: "The group's visible label and accessible name.",
      required: true,
    },
    {
      name: 'selectionMode',
      type: "'single' | 'multiple'",
      description:
        '`single`: a radio group with one value. `multiple`: a group of checkboxes with any number of values.',
      default: "'single'",
    },
    {
      name: 'value',
      type: 'string | null | ReadonlyArray<string>',
      description:
        'The chosen value (`single`, `null` while none is chosen) or values (`multiple`).',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void | (value: string[]) => void',
      description:
        'Called with the chosen value (`single`) or the new list of values (`multiple`).',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: 'Hides the label visually; it still names the group.',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: 'Helper text under the label, linked to the group.',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        "The native inputs' shared name, which groups the radios (as `htmlName` on RadioList). Defaults to a generated one.",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Disables every card; they stay focusable and announce disabled.',
      default: 'false',
    },
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description:
        '`horizontal` wraps the cards in rows; `vertical` stacks them.',
      default: "'horizontal'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'SelectableCardGroupItem cards. Each takes a `value` and the SelectableCard props other than isSelected, onChange, inputType and htmlName.',
      required: true,
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the Field box around the label, description and cards (margins, positioning, sizing). The group composes Field, so it takes no root xstyle, className or style.',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description:
        'Class name for the Field box. Same targeting as containerXstyle.',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description:
        'Inline styles for the Field box. Same targeting as containerXstyle.',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-selectable-card-group',
        visualProps: ['orientation', 'selectionMode'],
      },
    ],
  },
  usage: {
    description:
      'Use it for a choice among a few rich options shown as cards: a plan, an appearance, a layout. One choice gives users the radio-group keyboard and the position they expect; use `multiple` when several cards can be on.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give every card a `label` that names its option; it is the radio or checkbox name screen readers speak.',
      },
      {
        guidance: true,
        description:
          'Start a single choice with a value when the product has a sensible default, so the tab stop lands on it.',
      },
      {
        guidance: false,
        description:
          'Put buttons or links inside the cards; the whole card is the radio or checkbox target.',
      },
      {
        guidance: false,
        description:
          'Use it for navigation or actions; use ClickableCard for those.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'SelectableCardGroup',
  displayName: 'Selectable Card Group',
  description:
    '一组可选卡片，语义与其选择方式一致。单选（默认）是一个单选按钮组：卡片是共享同一 name 的原生单选按钮，因此整组只占一个 Tab 停靠点，方向键移动并选中，读屏软件会读出位置（“第 2 项，共 3 项”）。多选是一个带名称的复选框组。每个 SelectableCardGroupItem 都是一个 SelectableCard，其输入类型、name 和选中状态由组提供。',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '组的可见标签和无障碍名称。',
      required: true,
    },
    {
      name: 'selectionMode',
      type: "'single' | 'multiple'",
      description:
        '`single`：单选按钮组，一个值。`multiple`：复选框组，任意多个值。',
      default: "'single'",
    },
    {
      name: 'value',
      type: 'string | null | ReadonlyArray<string>',
      description:
        '选中的值（`single`，未选择时为 `null`）或值列表（`multiple`）。',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void | (value: string[]) => void',
      description: '以选中的值（`single`）或新的值列表（`multiple`）调用。',
      required: true,
    },
    {
      name: 'isLabelHidden',
      type: 'boolean',
      description: '在视觉上隐藏标签；它仍为组命名。',
      default: 'false',
    },
    {
      name: 'description',
      type: 'string',
      description: '标签下方的辅助文字，并与组关联。',
    },
    {
      name: 'htmlName',
      type: 'string',
      description:
        '原生输入共享的 name，用于将单选按钮分组（与 RadioList 的 `htmlName` 相同）。默认自动生成。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用所有卡片；它们仍可聚焦，并读出禁用状态。',
      default: 'false',
    },
    {
      name: 'orientation',
      type: "'horizontal' | 'vertical'",
      description: '`horizontal` 将卡片按行换行排列；`vertical` 纵向堆叠。',
      default: "'horizontal'",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'SelectableCardGroupItem 卡片。每张卡片接受一个 `value`，以及除 isSelected、onChange、inputType 和 htmlName 之外的 SelectableCard 属性。',
      required: true,
    },
    {
      name: 'containerXstyle',
      type: 'StyleXStyles',
      description:
        '作用于标签、描述和卡片外层 Field 容器的 StyleX 样式（外边距、定位、尺寸）。该组由 Field 组成，因此不接受根级 xstyle、className 或 style。',
    },
    {
      name: 'containerClassName',
      type: 'string',
      description: 'Field 容器的类名，作用范围与 containerXstyle 相同。',
    },
    {
      name: 'containerStyle',
      type: 'CSSProperties',
      description: 'Field 容器的内联样式，作用范围与 containerXstyle 相同。',
    },
  ],
  theming: {
    targets: [
      {
        className: 'astryx-selectable-card-group',
        visualProps: ['orientation', 'selectionMode'],
      },
    ],
  },
  usage: {
    description:
      '用于在少数以卡片呈现的丰富选项中做选择：套餐、外观、布局。单选为用户提供他们预期的单选按钮组键盘操作和位置播报；当可以同时开启多张卡片时，使用 `multiple`。',
    bestPractices: [
      {
        guidance: true,
        description:
          '为每张卡片提供一个说明其选项的 `label`；它就是读屏软件读出的单选按钮或复选框名称。',
      },
      {
        guidance: true,
        description:
          '当产品有合理的默认值时，让单选从一个值开始，这样 Tab 停靠点会落在它上面。',
      },
      {
        guidance: false,
        description:
          '在卡片内放置按钮或链接；整张卡片都是单选按钮或复选框的目标。',
      },
      {
        guidance: false,
        description: '用于导航或操作；这些场景请使用 ClickableCard。',
      },
    ],
  },
};
