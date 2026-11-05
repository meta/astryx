// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'AvatarGroup',
  displayName: 'Avatar Group',
  group: 'Avatar',
  category: 'Content',
  keywords: ['avatar', 'group', 'facepile', 'stack', 'overlap', 'participants', 'assignees', 'members', 'team'],
  usage: {
    description:
      'AvatarGroup displays multiple avatars in an overlapping row with an optional overflow indicator. Uses a compositional API: pass Avatar children directly so each avatar can carry its own props (status dots, click handlers, etc.).',
    bestPractices: [
      {guidance: true, description: 'Slice the list yourself and pass only the avatars you want visible; 3-5 is typical. The group renders exactly the children it is given and never slices for you.'},
      {guidance: true, description: 'Use AvatarGroupOverflow for custom overflow content like a popover trigger or "add member" button.'},
      {guidance: true, description: 'Pass status dots, click handlers, or tooltips directly on each Avatar child.'},
      {guidance: true, description: 'Wrap an Avatar child in HoverCard or Tooltip to show more on hover; the avatars still overlap. Set tooltip={false} on the wrapped Avatar so its built-in name tooltip does not compete.'},
      {guidance: true, description: 'Make avatars interactive with href or onClick to link to profiles. Interactive avatars share a single Tab stop; arrow keys move between them, and the group announces a keyboard hint to assistive tech. This follows the WAI-ARIA APG roving tabindex technique for managing focus in a composite: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_roving_tabindex'},
      {guidance: false, description: "Don't nest AvatarGroups; use a single group with all avatars."},
      {guidance: false, description: "Don't set size on the child avatars. The group's size wins over each child's own size prop, including when the group leaves size at its default, so a child's size is silently ignored inside a group."},
    ],
    anatomy: [
      {name: 'Avatar children', required: true, description: 'Avatar elements that form the overlapping row. Each can have its own props.'},
      {name: 'Overflow indicator', required: false, description: 'A "+N" circle at the end showing hidden count, or a custom AvatarGroupOverflow slot.'},
    ],
  },
  theming: {
    targets: [
      {className: 'astryx-avatar-group', visualProps: ['size', 'shape']},
      {className: 'astryx-avatar-group-overflow', visualProps: ['size', 'shape']},
    ],
  },
  description: 'Stacked avatar display with overlapping layout and optional overflow indicator. Children are Avatar elements.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Avatar children, optionally followed by one AvatarGroupOverflow. Consumers handle slicing to the desired visible count.',
      required: true,
      slotElements: [
        {
          __element: 'Avatar',
          props: {
            name: 'User',
          },
        },
      ],
    },
    {
      name: 'size',
      type:
        "'xsm' | 'sm' | 'md' | 'lg' | 'xl' | 16 | 20 | 24 | 32 | 36 | 40 | 48 | 60 | 64 | 72 | 96 | 128 | 144 | 180",
      description:
        "Size applied to all avatars: named sizes are 'xsm' (20px), 'sm' (24px), 'md' (36px), 'lg' (48px), and 'xl' (128px); numeric sizes must be one of the pixel values listed in the type. The group's size always overrides each child Avatar's size, including when the group uses its default size.",
      default: "'md'",
    },
    {
      name: 'shape',
      type: "'circle' | 'rounded' | 'square'",
      description: "Shape applied to all avatars via context, overriding each avatar's own shape prop. Also applied to AvatarGroupOverflow's \"+N\" indicator.",
      default: "'circle'",
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the root element.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector for automated testing frameworks.',
    },
  ],
  components: [
    {name: 'AvatarGroupOverflow'},
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'AvatarGroup 以重叠排列方式显示多个头像，并可选择显示溢出指示器。使用组合式 API：直接传入 Avatar 子元素，每个头像可携带自己的属性。',
    bestPractices: [
      {guidance: true, description: '自行切分列表，只传入需要显示的头像，通常 3-5 个为佳。组件只渲染传入的子元素，不会自动切分。'},
      {guidance: true, description: '使用 AvatarGroupOverflow 自定义溢出内容，如弹出触发器或"添加成员"按钮。'},
      {guidance: true, description: '直接在每个 Avatar 子元素上传递状态点、点击处理器或工具提示。'},
      {guidance: true, description: '可以用 HoverCard 或 Tooltip 包裹 Avatar 子元素以在悬停时显示更多信息，头像仍会重叠。请在被包裹的 Avatar 上设置 tooltip={false}，避免与内置的名称提示冲突。'},
      {guidance: false, description: '不要嵌套 AvatarGroup，使用单个组包含所有头像。'},
      {guidance: false, description: '不要在子头像上设置 size。分组的 size 会覆盖每个子 Avatar 自身的 size，即使分组使用默认值也是如此。'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'compositional overlapping avatar row w/ +N overflow or custom slot',
  usage: {
    description:
      'Stacked avatar display with overlapping layout. Compositional API: Avatar children with per-avatar props (status dots, clicks). Optional AvatarGroupOverflow slot for custom overflow.',
    bestPractices: [
      {guidance: true, description: 'Slice the list yourself; pass only visible avatars (3-5 typical). No auto-slicing.'},
      {guidance: true, description: 'Use AvatarGroupOverflow for custom overflow (popover, add button).'},
      {guidance: true, description: 'Pass status dots / click handlers directly on each Avatar.'},
      {guidance: true, description: 'Avatars may be wrapped in HoverCard/Tooltip; overlap kept. Set tooltip={false} on the wrapped Avatar.'},
      {guidance: true, description: 'Interactive avatars (href/onClick) share one Tab stop; arrows rove between them + the overflow button (APG roving tabindex).'},
      {guidance: false, description: "Don't nest AvatarGroups."},
      {guidance: false, description: "Don't set size on children; the group's size always wins, default included."},
    ],
  },
};
