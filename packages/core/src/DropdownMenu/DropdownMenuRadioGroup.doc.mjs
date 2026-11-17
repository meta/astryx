// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenuRadioGroup',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Radio Group',
  isHiddenFromOverview: true,
  description:
    'A controlled, named single-select group of DropdownMenuRadioItem children (role="group" of menuitemradio). Owns value propagation, close policy, root composition, and the menu inter-item gap; the parent DropdownMenu owns keyboard navigation.',
  usage: {
    description:
      'Use DropdownMenuRadioGroup inside compound-mode DropdownMenu when several commands represent one mutually exclusive choice. Keep value in caller state, provide a concise accessible label, and render each choice as DropdownMenuRadioItem.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep value controlled and update it from onChange so checked state follows caller data.',
      },
      {
        guidance: true,
        description:
          'Provide a concise label even when aria-labelledby points to visible text; label remains required and supplies the aria-label fallback.',
      },
      {
        guidance: true,
        description:
          'Set hasCloseOnSelect=false only when the menu must stay open to show another selection or an in-place result.',
      },
      {
        guidance: false,
        description:
          'Place buttons, links, checkboxes, or arbitrary menu rows inside the radio group.',
      },
      {
        guidance: false,
        description:
          'Add a second key handler or roving-focus model; DropdownMenu owns keyboard navigation.',
      },
    ],
    anatomy: [
      {
        name: 'Group',
        required: true,
        description:
          'The role="group" root that owns the accessible name, controlled-selection context, close policy, root inputs, and inter-item gap.',
      },
      {
        name: 'Radio items',
        required: true,
        description:
          'DropdownMenuRadioItem children; each child owns its menuitemradio role, checked state, content, and indicator paint.',
      },
    ],
  },
  playground: {
    wrapper: {
      component: 'DropdownMenu',
      // Open on first load so the radio choices are visible without a click;
      // the preview bridges `onOpenChange` back so selecting still closes the
      // menu and the trigger reopens it.
      props: {
        button: {label: 'Sort'},
        presentation: 'popover',
        isMenuOpen: true,
      },
    },
    defaults: {
      value: 'newest',
      label: 'Sort by',
      children: [
        {
          __element: 'DropdownMenuRadioItem',
          props: {value: 'newest', label: 'Newest'},
        },
        {
          __element: 'DropdownMenuRadioItem',
          props: {value: 'oldest', label: 'Oldest'},
        },
      ],
    },
  },
  props: [
    {
      name: 'value',
      type: 'string | undefined',
      description:
        'The currently selected value in the group. Pass undefined when nothing is selected yet.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description: 'Callback fired when the selected value changes.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible name for the group, applied as aria-label so screen readers announce the radios as a named set, e.g. "Sort by". Required even when aria-labelledby (via base props) points to visible text; that visible reference becomes the computed name while label remains the fallback.',
      required: true,
    },
    {
      name: 'hasCloseOnSelect',
      type: 'boolean',
      default: 'true',
      description:
        'Whether selecting a value closes the menu. Radio items default to closing on selection (a single-choice commit).',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the role="group" root.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The DropdownMenuRadioItems that make up the group.',
      required: true,
    },
  ],
};

export const docsZh = {
  name: 'DropdownMenuRadioGroup',
  displayName: 'Dropdown Menu Radio Group',
  description:
    'DropdownMenu 中由调用方控制且有名称的单选组（menuitemradio 的 role="group"）。该组负责值传递、关闭策略、根元素组合和菜单项间距；父 DropdownMenu 负责键盘导航。',
  propDescriptions: {
    value: '组中当前选中的值。尚无选中项时传 undefined。',
    onChange: '所选值变化时触发的回调。',
    label:
      '组的无障碍名称，作为 aria-label 应用。即使 aria-labelledby（通过基础属性）指向可见文本，label 仍然必需并作为后备名称。',
    hasCloseOnSelect: '选择某值是否关闭菜单。默认关闭。',
    ref: '转发到 role="group" 根元素的 ref。',
    children: '组成该组的 DropdownMenuRadioItem。',
  },
};

export const docsDense = {
  name: 'DropdownMenuRadioGroup',
  displayName: 'Dropdown Menu Radio Group',
  description:
    'controlled named menuitemradio group; owns value propagation, close policy, root inputs, and item gap',
  propDescriptions: {
    value: 'selected value (undefined = none)',
    onChange: 'fired when selected value changes',
    label: 'accessible group name (applied as aria-label); required',
    hasCloseOnSelect: 'close menu on select (default true)',
    ref: 'forwarded to the role="group" root',
    children: 'the DropdownMenuRadioItems',
  },
};
