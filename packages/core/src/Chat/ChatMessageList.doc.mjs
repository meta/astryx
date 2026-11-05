// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatMessageList',
  subComponentOf: 'Chat',
  displayName: 'Chat Message List',
  isHiddenFromOverview: true,
  description: `Presentational message container with density context and infinite scroll support. Provides role="log" with aria-live="polite" for accessibility. A flex spacer pushes messages to the bottom when the list isn't full; set align="top" to start messages at the top instead.`,
  playground: {
    defaults: {
      children: [
        {
          __element: 'ChatMessage',
          props: {sender: 'user'},
          children: {
            __element: 'ChatMessageBubble',
            children: 'Can you summarize this report?',
          },
        },
        {
          __element: 'ChatMessage',
          props: {sender: 'assistant'},
          children: {
            __element: 'ChatMessageBubble',
            children: 'Sure. Revenue is up 12% and churn is flat quarter over quarter.',
          },
        },
      ],
    },
    wrapper: {component: 'Stack', props: {width: 480}},
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Message elements: typically ChatMessage or ChatSystemMessage.',
      required: true,
      slotElements: [
        {
          __element: 'ChatMessage',
          props: {sender: 'user'},
          children: {
            __element: 'ChatMessageBubble',
            children: 'Message text',
          },
        },
      ],
    },
    {
      name: 'emptyState',
      type: 'ReactNode',
      description: 'Content shown when the list has no messages.',
      slotElements: [
        {
          __element: 'EmptyState',
          props: {
            title: 'No items',
            description: 'Nothing to show.',
          },
        },
      ],
    },
    {
      name: 'scrollToTopAction',
      type: '() => Promise<void>',
      description: 'Async action fired when user scrolls to top. Use for loading older messages. Wrapped in useTransition: shows a spinner at the top while pending.',
    },
    {
      name: 'density',
      type: "'compact' | 'balanced' | 'spacious'",
      description: 'Visual density: flows to child messages via context.',
      default: "'balanced'",
    },
    {
      name: 'gap',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: 'Gap between top-level message rows. Defaults to the selected density; override for LLM event streams or independent rows that need different spacing from density.',
    },
    {
      name: 'align',
      type: "'top' | 'bottom'",
      description: "Vertical alignment when the list is shorter than its container. 'bottom' fills free space with a spacer so short conversations sit above the composer; 'top' omits the spacer so messages start at the top. Only affects a non-full list; overflowing lists scroll identically, preserving auto-scroll-to-bottom.",
      default: "'bottom'",
    },
    {
      name: 'isStreaming',
      type: 'boolean',
      description: 'Whether an assistant message is actively streaming. Marks the log aria-busy so screen readers wait and announce the completed message once instead of re-announcing partial text on every token.',
      default: 'false',
    },
  ],
};

export const docsZh = {
  name: 'ChatMessageList',
  isHiddenFromOverview: true,
  displayName: 'Chat Message List',
  description: '消息展示容器，支持密度上下文和无限滚动。自动滚动由 ChatLayout 管理。',
  propDescriptions: {
    children: '消息元素，通常是 ChatMessage 或 ChatSystemMessage。',
    emptyState: '列表无消息时显示的内容。',
    scrollToTopAction: '用户滚动到顶部时触发的异步操作。用于加载更早的消息。',
    density: '视觉密度，通过上下文传递给子消息。',
    gap: '顶层消息行之间的间距。默认跟随密度；当 LLM 事件流等独立行需要不同间距时可覆盖。',
    align: "列表内容不足一屏时的垂直对齐方式。'bottom' 用占位块填满剩余空间，让简短对话贴近输入框；'top' 省略占位块，让消息从顶部开始。仅影响未填满的列表，溢出后两种模式滚动一致，保持自动滚动到底部。",
    isStreaming: '是否有助手消息正在流式输出。标记日志为 aria-busy，让屏幕阅读器等待并在完成后一次性播报，而不是每个 token 都重复播报。',
  },
};

export const docsDense = {
  name: 'ChatMessageList',
  isHiddenFromOverview: true,
  displayName: 'Chat Message List',
  description: 'presentational msg container w/ density context + infinite scroll; auto-scroll owned by ChatLayout',
  propDescriptions: {
    children: 'msg elements (ChatMessage or ChatSystemMessage)',
    emptyState: 'content when no msgs',
    scrollToTopAction: 'async action at scroll top; load older msgs',
    density: 'visual density; flows to children via context',
    gap: 'top-level row gap; defaults to density spacing; override for independent LLM/tool rows',
    align: "'top'|'bottom' (def bottom); bottom spacer pushes short lists down, top starts at top; overflow scrolls same either way",
    isStreaming: 'assistant streaming? marks log aria-busy so SR announces the completed msg once',
  },
};
