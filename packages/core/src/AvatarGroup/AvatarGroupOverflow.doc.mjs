// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AvatarGroupOverflow',
  subComponentOf: 'AvatarGroup',
  displayName: 'Avatar Group Overflow',
  isHiddenFromOverview: true,
  description:
    'Overflow indicator for AvatarGroup. Shows a compact count for hidden avatars and can render custom count text or act as a button.',
  props: [
    {
      name: 'count',
      type: 'number',
      description:
        'The number of hidden avatars. Used for the default `+N` label and the accessible label.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Optional custom count text rendered inside the indicator. Omit to use the default `+N` label.',
    },
    {
      name: 'onClick',
      type: '() => void',
      description:
        'Callback fired when the overflow indicator is clicked. When provided, the indicator renders as a focusable button.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLElement>',
      description: 'Ref forwarded to the overflow indicator element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'stylex.create() value — not an inline style object.',
    },
  ],
  playground: {
    defaults: {
      count: 2,
      children: '+2',
    },
  },
  usage: {
    description:
      'AvatarGroupOverflow appears at the end of an AvatarGroup to summarize people who are not shown individually. Use it when a group is sliced to a small number of visible avatars but the hidden count still matters.',
    bestPractices: [
      {guidance: true, description: 'Pass the real hidden count to `count` so the accessible label matches the visible indicator.'},
      {guidance: true, description: 'Use short custom text such as `+12` or `99+`. The indicator is circular for short counts and grows into a pill for wider counts so the number always fits.'},
      {guidance: true, description: 'Provide `onClick` when the overflow opens a member list, popover, or detail view.'},
      {guidance: false, description: 'Do not pass custom text that disagrees with `count`; `count` continues to provide the accessible label.'},
      {guidance: false, description: 'Do not use long labels inside the indicator; place longer participant details next to the group instead.'},
    ],
    anatomy: [
      {name: 'Count label', required: true, description: 'The compact `+N` or custom count text displayed inside the circular indicator.'},
      {name: 'Button behavior', required: false, description: 'When `onClick` is provided, the indicator becomes an interactive button with focus and hover states.'},
    ],
  },
  examples: [
    {
      label: 'Default overflow count',
      code: `
<AvatarGroup size="lg">
  {users.slice(0, 3).map(user => (
    <Avatar key={user.id} src={user.src} name={user.name} />
  ))}
  <AvatarGroupOverflow count={users.length - 3} />
</AvatarGroup>
`,
    },
    {
      label: 'Custom count text',
      code: `
<AvatarGroup size="lg">
  {users.slice(0, 3).map(user => (
    <Avatar key={user.id} src={user.src} name={user.name} />
  ))}
  <AvatarGroupOverflow count={12}>12+</AvatarGroupOverflow>
</AvatarGroup>
`,
    },
  ],
};

export const docsZh = {
  name: 'AvatarGroupOverflow',
  isHiddenFromOverview: true,
  displayName: 'Avatar Group Overflow',
  description:
    'AvatarGroup 的溢出指示器。用于显示隐藏头像数量，可自定义计数字符串或作为按钮使用。',
  propDescriptions: {
    count: '隐藏头像数量，用于默认 `+N` 标签和无障碍标签。',
    children: '可选的自定义计数字符串。省略时使用默认 `+N` 标签。',
    onClick: '点击溢出指示器时触发。提供后指示器会渲染为可聚焦按钮。',
    ref: '转发到溢出指示器元素的引用。',
    xstyle: '用于布局自定义的 StyleX 样式。',
  },
  usage: {
    description:
      'AvatarGroupOverflow 显示在 AvatarGroup 末尾，用来汇总未单独展示的成员。适用于只展示少量头像但仍需要显示隐藏数量的场景。',
    bestPractices: [
      {guidance: true, description: '向 `count` 传入真实隐藏数量，确保无障碍标签与可见指示器一致。'},
      {guidance: true, description: '使用 `+12` 或 `99+` 等短文本；指示器在计数较短时为圆形，计数较宽时会拉伸为胶囊形，确保数字始终完整显示。'},
      {guidance: true, description: '当溢出项会打开成员列表、弹出层或详情视图时提供 `onClick`。'},
      {guidance: false, description: '不要让自定义文本与 `count` 不一致；`count` 仍用于无障碍标签。'},
      {guidance: false, description: '不要在指示器内使用长标签；更长的参与者详情应放在头像组旁边。'},
    ],
  },
};

export const docsDense = {
  name: 'AvatarGroupOverflow',
  isHiddenFromOverview: true,
  displayName: 'Avatar Group Overflow',
  description: 'overflow indicator for AvatarGroup; default +N or custom short count text',
  propDescriptions: {
    count: 'hidden avatar count; drives default +N + aria label',
    children: 'optional custom short count text, e.g. +12 or 99+',
    onClick: 'click handler; renders focusable button when set',
    ref: 'forwarded ref',
    xstyle: 'stylex.create() value — not an inline style object',
  },
  usage: {
    description:
      'Use at end of AvatarGroup to summarize hidden people after slicing visible avatars.',
    bestPractices: [
      {guidance: true, description: 'Pass real hidden count to `count` for a11y.'},
      {guidance: true, description: 'Keep custom text short: `+12`, `99+`.'},
      {guidance: true, description: 'Use `onClick` to open member list/popover/details.'},
      {guidance: false, description: "Don't let custom text disagree with `count`; `count` still labels the indicator for accessibility."},
      {guidance: false, description: "Don't use long labels inside avatar-sized circle."},
    ],
  },
};
