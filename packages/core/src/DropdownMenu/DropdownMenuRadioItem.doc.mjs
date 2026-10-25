// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenuRadioItem',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Radio Item',
  isHiddenFromOverview: true,
  description:
    'A single option in a DropdownMenuRadioGroup (role="menuitemradio"). Must be used inside a DropdownMenuRadioGroup.',
  playground: {
    defaults: {
      value: 'option-1',
      label: 'Option 1',
    },
    wrapper: {
      component: 'DropdownMenuRadioGroup',
      props: {
        value: 'option-1',
        label: 'Radio group',
      },
    },
  },
  props: [
    {
      name: 'value',
      type: 'string',
      required: true,
      description:
        "The value this item represents within its group. The group's value matches against this to determine the checked state.",
    },
    {
      name: 'label',
      type: 'ReactNode',
      required: true,
      description: 'Primary label text identifying the option.',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: 'Secondary description text displayed below the label.',
    },
    {
      name: 'icon',
      type: 'IconType',
      description:
        'Icon to display before the label. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      default: 'false',
      description:
        'Whether this individual radio item is disabled. Disabled items expose aria-disabled, block selection, and are currently skipped by DropdownMenu arrow-key navigation.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content to render after the label and description, such as a badge or metadata.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLElement>',
      description:
        'Ref forwarded to the row root, the element carrying role="menuitemradio". Register the row with an element-keyed observer or overlay.',
    },
  ],
};

export const docsZh = {
  name: 'DropdownMenuRadioItem',
  isHiddenFromOverview: true,
  displayName: 'Dropdown Menu Radio Item',
  description:
    'DropdownMenuRadioGroup 中的单个选项（role="menuitemradio"）。必须在 DropdownMenuRadioGroup 内使用。',
  propDescriptions: {
    value: '该项在组内代表的值。组的 value 与之匹配以确定勾选状态。',
    label: '标识该选项的主标签文本。',
    description: '显示在标签下方的次要描述文本。',
    icon: '显示在标签前的图标。',
    isDisabled: '该单选项是否禁用。',
    endContent: '在标签和描述之后渲染的内容。',
    ref: '转发到行根元素（带 role="menuitemradio" 的元素）的 ref。',
  },
};

export const docsDense = {
  name: 'DropdownMenuRadioItem',
  isHiddenFromOverview: true,
  displayName: 'Dropdown Menu Radio Item',
  description: 'one option in a DropdownMenuRadioGroup (menuitemradio)',
  propDescriptions: {
    value: "item's value within the group (matched vs group value)",
    label: 'primary label text',
    description: 'secondary text below label',
    icon: 'icon before label',
    isDisabled:
      'disabled; aria-disabled, blocks selection, skipped by arrow keys',
    endContent: 'content after label+description',
    ref: 'forwarded to the row root (the role="menuitemradio" element)',
  },
};
