// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatMessageList',
  subComponentOf: 'Chat',
  displayName: 'Chat Message List',
  isHiddenFromOverview: true,
  description: `Presentational message container with density context and infinite scroll support. Provides role="log" with aria-live="polite" for accessibility. A flex spacer pushes messages to the bottom when the list isn't full; set align="top" to start messages at the top instead. Pass items, getItemKey and renderItem instead of children to render an item model, and add virtualization from useChatMessageListVirtualization to window a conversation of thousands of messages inside ChatLayout.`,
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
      description: 'Message elements: typically ChatMessage or ChatSystemMessage. Required unless items renders the list.',
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
    {
      name: 'items',
      type: 'ReadonlyArray<T>',
      description: 'The conversation as data, oldest first, instead of children. The list renders one row per item with renderItem. Replace the array to change it.',
    },
    {
      name: 'getItemKey',
      type: '(item: T, index: number) => string | number',
      description: "A stable key per item, unique as a string. Rows, measured sizes and the scroll position follow it, so a key that comes from the index loses the reader's place when older items load above. Required with items.",
    },
    {
      name: 'renderItem',
      type: '(item: T, index: number) => ReactNode',
      description: 'Renders one item, typically as a ChatMessage. Keep it stable with useCallback: a new function renders every mounted row again. Required with items.',
    },
    {
      name: 'estimateItemSize',
      type: 'number | ((item: T, index: number) => number)',
      description: 'With virtualization: the height in CSS px of an item that has not rendered yet. A row uses its measured height once it mounts, and keeps it while it scrolls out. A function can estimate each item by its kind. A close estimate keeps the scrollbar steady.',
      default: '96',
    },
    {
      name: 'virtualization',
      type: 'ChatMessageListVirtualizationCapability',
      description: "Windows the items: inside ChatLayout only the rows near the scrollport mount, about one screen of DOM for thousands of messages. Pass the value of useChatMessageListVirtualization(). The list opens at its newest item and keeps the reader's place while rows measure, older items load and a reply streams. Outside ChatLayout every item renders. Browser find in page (Ctrl+F or Cmd+F) sees only the mounted rows: to find a message, search your items and call handleRef.scrollToItem.",
    },
    {
      name: 'handleRef',
      type: 'React.Ref<ChatMessageListHandle>',
      description: "Imperative handle, set while virtualization windows the list. scrollToItem(key, {align}) scrolls to an item, mounted or not, and stops following the newest message. align is 'start' (default), 'center' or 'end'. It returns false when no item has the key. Use it for find in a conversation and for links to a message.",
    },
  ],
};

export const docsZh = {
  name: 'ChatMessageList',
  isHiddenFromOverview: true,
  displayName: 'Chat Message List',
  description: '消息展示容器，支持密度上下文和无限滚动。自动滚动由 ChatLayout 管理。可传入 items、getItemKey 和 renderItem 代替 children 来渲染数据模型；再加上 useChatMessageListVirtualization 的 virtualization，即可在 ChatLayout 内对上千条消息的会话做窗口化。',
  propDescriptions: {
    children: '消息元素，通常是 ChatMessage 或 ChatSystemMessage。',
    emptyState: '列表无消息时显示的内容。',
    scrollToTopAction: '用户滚动到顶部时触发的异步操作。用于加载更早的消息。',
    density: '视觉密度，通过上下文传递给子消息。',
    gap: '顶层消息行之间的间距。默认跟随密度；当 LLM 事件流等独立行需要不同间距时可覆盖。',
    align: "列表内容不足一屏时的垂直对齐方式。'bottom' 用占位块填满剩余空间，让简短对话贴近输入框；'top' 省略占位块，让消息从顶部开始。仅影响未填满的列表，溢出后两种模式滚动一致，保持自动滚动到底部。",
    isStreaming: '是否有助手消息正在流式输出。标记日志为 aria-busy，让屏幕阅读器等待并在完成后一次性播报，而不是每个 token 都重复播报。',
    items: '以数据形式提供的会话，按时间正序，用来代替 children。列表用 renderItem 为每一项渲染一行。修改时请替换整个数组。',
    getItemKey: '每一项的稳定键，转成字符串后唯一。行、测得的高度和滚动位置都跟随它，所以由下标得到的键会在上方加载更早消息时丢失阅读位置。使用 items 时必填。',
    renderItem: '渲染单项，通常是一个 ChatMessage。请用 useCallback 保持稳定：新的函数会让所有已挂载的行重新渲染。使用 items 时必填。',
    estimateItemSize: '启用 virtualization 时，尚未渲染的项的高度（CSS px）。行挂载后使用测得的高度，滚出视口后仍保留。传函数可以按项的类型估算。估得越准，滚动条越稳定。',
    virtualization: '对 items 做窗口化：在 ChatLayout 内只挂载视口附近的行，上千条消息也只占约一屏 DOM。传入 useChatMessageListVirtualization() 的返回值。列表打开时停在最新一项，并在行测量、加载更早消息和回复流式输出时保持阅读位置。在 ChatLayout 之外会渲染全部项。浏览器的页内查找（Ctrl+F 或 Cmd+F）只能找到已挂载的行：要查找消息，请在数据中搜索并调用 handleRef.scrollToItem。',
    handleRef: "命令式句柄，在 virtualization 对列表窗口化时设置。scrollToItem(key, {align}) 滚动到某一项（无论是否已挂载），并停止跟随最新消息。align 为 'start'（默认）、'center' 或 'end'。没有该键时返回 false。可用于会话内查找和指向某条消息的链接。",
  },
};

export const docsDense = {
  name: 'ChatMessageList',
  isHiddenFromOverview: true,
  displayName: 'Chat Message List',
  description: 'presentational msg container w/ density context + infinite scroll; auto-scroll owned by ChatLayout; items/getItemKey/renderItem item model; + virtualization windows 1000s of msgs inside ChatLayout',
  propDescriptions: {
    children: 'msg elements (ChatMessage or ChatSystemMessage)',
    emptyState: 'content when no msgs',
    scrollToTopAction: 'async action at scroll top; load older msgs',
    density: 'visual density; flows to children via context',
    gap: 'top-level row gap; defaults to density spacing; override for independent LLM/tool rows',
    align: "'top'|'bottom' (def bottom); bottom spacer pushes short lists down, top starts at top; overflow scrolls same either way",
    isStreaming: 'assistant streaming? marks log aria-busy so SR announces the completed msg once',
    items: 'msgs as data, oldest first, instead of children; one row per item via renderItem; replace the array to change it',
    getItemKey: 'stable unique key per item; rows, sizes + scroll place follow it; never index-based',
    renderItem: 'renders one item (ChatMessage); keep stable w/ useCallback',
    estimateItemSize: 'w/ virtualization: px height of an unrendered item (number or per-item fn); measured height wins once mounted',
    virtualization: 'useChatMessageListVirtualization() value; windows items inside ChatLayout (~1 screen of DOM); opens at newest, keeps place while rows measure, older items load, replies stream; outside ChatLayout renders all; Ctrl+F sees mounted rows only, so search items + scrollToItem',
    handleRef: "scrollToItem(key, {align: 'start'|'center'|'end'}) reveals any item + stops follow; false for unknown key; set only while windowing",
  },
};
