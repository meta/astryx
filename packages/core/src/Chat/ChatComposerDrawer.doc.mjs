// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatComposerDrawer',
  subComponentOf: 'Chat',
  displayName: 'Chat Composer Drawer',
  isHiddenFromOverview: true,
  description: "Collapsible drawer panel that sits above the chat input inside ChatComposer. Pass it to the composer's `drawer` slot to show attachments, context chips, or any supplementary content. When `count` is provided the drawer gains a collapse toggle: collapsed state shows the default Badge and label or caller-provided `collapsedSummary`, while expanded state shows all children.",
  usage: {
    description:
      'Use ChatComposerDrawer in the ChatComposer drawer slot for supplementary content such as attachments, context chips, or previews. Provide count only when people should be able to collapse that content.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give label a concrete plural noun such as "Attachments" so the expand and collapse actions have a useful accessible name.',
      },
      {
        guidance: true,
        description:
          'Use controlled isCollapsed with onCollapsedChange when another part of the page owns drawer state; otherwise use defaultIsCollapsed.',
      },
      {
        guidance: false,
        description:
          'Put primary composer actions in the drawer; use ChatComposer footer or send-action slots so those controls remain available when the drawer is collapsed.',
      },
    ],
    anatomy: [
      {
        name: 'Root surface',
        required: true,
        description: 'The drawer surface that composes above the ChatComposer body.',
      },
      {
        name: 'Disclosure toggle',
        required: false,
        description: 'The keyboard- and pointer-operable collapse control rendered when count is provided.',
      },
      {
        name: 'Collapsed summary',
        required: false,
        description: 'The default count Badge and label, or caller-provided visual content, presented while the drawer is collapsed.',
      },
      {
        name: 'Content area',
        required: true,
        description: 'The caller-provided supplementary content; collapsed descendants are unavailable to keyboard and assistive technology.',
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-chat-composer-drawer',
        visualProps: ['collapsed'],
      },
    ],
  },
  playground: {
    wrapper: {component: 'Stack', props: {width: 480}},
    defaults: {
      count: 3,
      label: 'Attachments',
      children: [
        {__element: 'Token', props: {label: 'design-spec.pdf'}},
        {__element: 'Token', props: {label: 'api-schema.json'}},
        {__element: 'Token', props: {label: 'screenshot.png'}},
      ],
    },
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content to render inside the drawer: tokens, chips, previews, or any React elements.',
      required: true,
    },
    {
      name: 'count',
      type: 'number',
      description: 'Total item count shown in the collapsed badge. When provided, the drawer gains a collapse/expand toggle.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Label shown next to the count in the default collapsed summary and used to name the expand/collapse action.',
      default: "'Items'",
    },
    {
      name: 'collapsedSummary',
      type: 'ReactNode',
      description: 'Visual content for the complete Collapsed summary anatomy part. When count enables collapse, this replaces the default neutral Badge and label while the component retains disclosure behavior and accessible naming.',
    },
    {
      name: 'isCollapsed',
      type: 'boolean',
      description: 'Controlled collapsed state. Use with `onCollapsedChange` for external control.',
    },
    {
      name: 'defaultIsCollapsed',
      type: 'boolean',
      description: 'Initial collapsed state for uncontrolled usage.',
      default: 'false',
    },
    {
      name: 'onCollapsedChange',
      type: '(isCollapsed: boolean) => void',
      description: 'Callback fired when the user toggles the drawer.',
    },
  ],
};

export const docsZh = {
  name: 'ChatComposerDrawer',
  isHiddenFromOverview: true,
  displayName: 'Chat Composer Drawer',
  description: '位于聊天输入上方的可折叠抽屉面板。传入 ChatComposer 的 `drawer` 插槽，用于显示附件、上下文标签或预览内容。提供 `count` 时启用折叠切换。',
  propDescriptions: {
    children: '抽屉内渲染的内容——标记、标签、预览或任何 React 元素。',
    count: '折叠徽章中显示的总数。提供时，抽屉获得折叠/展开切换。',
    label: '默认折叠摘要中显示在数量旁边的标签，并用于命名展开/折叠操作。',
    collapsedSummary: '折叠摘要解剖部分的自定义视觉内容。提供 count 时替换默认的徽章和标签；组件仍负责折叠行为与无障碍命名，该内容仅用于展示。',
    isCollapsed: '受控折叠状态。与 onCollapsedChange 一起使用。',
    defaultIsCollapsed: '非受控模式的初始折叠状态。',
    onCollapsedChange: '用户切换抽屉时触发的回调。',
  },
};

export const docsDense = {
  name: 'ChatComposerDrawer',
  isHiddenFromOverview: true,
  displayName: 'Chat Composer Drawer',
  description: 'collapsible drawer above chat input; pass to composer `drawer` slot for attachments, context chips, previews. `count` enables collapse toggle',
  propDescriptions: {
    children: 'drawer content: tokens, chips, previews, any React elements',
    count: 'total count for collapsed summary; enables collapse/expand toggle',
    label: 'collapsed label next to the default count badge; names the disclosure action',
    collapsedSummary: 'custom visual content replacing the complete Collapsed summary anatomy; requires count; presentation-only; default keeps Badge + label',
    isCollapsed: 'controlled collapsed state',
    defaultIsCollapsed: 'initial collapsed state (uncontrolled)',
    onCollapsedChange: 'callback on collapse toggle',
  },
};
