// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Chat',
  displayName: 'Chat',
  group: 'Chat',
  category: 'Chat',
  // ChatPastedTextToken is an internal helper (not exported from index.ts).
  // Hide it from the component listing so it doesn't surface as an undocumented entry.
  hiddenComponents: ['ChatPastedTextToken'],
  keywords: ['chat', 'message', 'bubble', 'conversation', 'ai', 'assistant', 'thread', 'system-message', 'composer', 'mention', 'trigger', 'typeahead', 'token', 'imperative', 'tokenized-text'],
  theming: {
    targets: [
      {className: 'astryx-chat-layout', visualProps: ['density']},
      {className: 'astryx-chat-composer', visualProps: ['density']},
      {className: 'astryx-chat-composer-input'},
      {className: 'astryx-chat-composer-drawer', visualProps: ['collapsed']},
      {className: 'astryx-chat-message', visualProps: ['sender', 'density']},
      {
        className: 'astryx-chat-message-bubble',
        visualProps: ['sender', 'variant', 'density'],
      },
      {className: 'astryx-chat-message-list', visualProps: ['density']},
      {className: 'astryx-chat-system-message', visualProps: ['variant']},
      {className: 'astryx-chat-message-metadata'},
      {className: 'astryx-chat-send-button'},
      {className: 'astryx-chat-dictation-button'},
      {className: 'astryx-chat-layout-scroll-button'},
      {className: 'astryx-chat-tokenized-text'},
      {className: 'astryx-chat-tool-calls'},
      {className: 'astryx-trigger-menu'},
    ],
    vars: [
      {name: '--_chat-composer-radius', description: 'Border radius of the composer body. Inner elements derive their radius concentrically.', default: 'var(--radius-chat)', private: true},
      {name: '--_chat-composer-padding', description: 'Padding of the composer body. Used in the concentric radius calculation.', default: 'var(--spacing-3)', private: true},
      {name: '--_chat-avatar-offset', description: 'Top offset of a message avatar: the name row spacing when a bubble in the message shows a name, else 0px. Each message sets it from its own content. Not a theming lever.', default: '0px', private: true},
      {name: '--_button-radius', description: 'Concentric button radius inside the composer.', default: 'max(var(--radius-element), calc(var(--_chat-composer-radius) - var(--_chat-composer-padding)))', private: true, derived: true, formula: 'max(var(--radius-element), calc(var(--_chat-composer-radius) - var(--_chat-composer-padding)))'},
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_chat-composer-radius']},
      {property: 'padding', vars: ['--_chat-composer-padding']},
    ],
  },
  components: [
    {name: 'ChatMessageList'},
    {name: 'ChatMessage'},
    {name: 'ChatMessageBubble'},
    {name: 'ChatMessageMetadata'},
    {name: 'ChatSystemMessage'},
    {name: 'ChatComposer'},
    {name: 'ChatComposerInput'},
    {name: 'ChatComposerDrawer'},
    {name: 'ChatSendButton'},
    {name: 'ChatToolCalls'},
    {name: 'ChatTokenizedText'},
    {name: 'ChatComposerTokenElement'},
    {name: 'ChatLayout'},
    {name: 'ChatLayoutScrollButton'},
  ],
  usage: {
    description: 'Chat is a family of composable primitives for building AI and human chat experiences. Combine ChatLayout, ChatMessageList, ChatMessage, bubbles, system messages, tool calls, tokenized text, and ChatComposer to assemble complete conversations without reimplementing sender-aware layout, density, scrolling, or composer behavior.',
    bestPractices: [
      { guidance: true, description: 'Compose messages using MessageList > Message > Bubble for consistent sender-aware styling and density.' },
      { guidance: true, description: 'Set the density prop to control spacing globally: compact for sidebars, balanced for most views, spacious for long-form reading. Individual messages can override.' },
      { guidance: true, description: 'Use gap when top-level rows are independent (for example, LLM tool events or streamed blocks) and list spacing needs to be tuned separately from density.' },
      { guidance: true, description: 'Use the group prop on bubbles (first, middle, last) when a single sender sends multiple consecutive messages; it tightens corner radius to visually connect them.' },
      { guidance: true, description: 'Use ChatSystemMessage with variant="divider" for date separators and default for inline status notices like joins, leaves, or topic changes.' },
      { guidance: true, description: 'Put name on the first bubble and metadata on the last bubble in a message so they align with the bubble\'s inline padding.' },
      { guidance: true, description: 'Wrap custom in-message content (cards, attachments, citations) in a ghost bubble so it aligns with the bubble text column; add width="100%" when it should span the full message column instead of the default bubble width cap.' },
      { guidance: true, description: 'Provide an emptyState prop so new users see a clear prompt to start a conversation instead of a blank screen.' },
      { guidance: true, description: 'Use the ghost bubble variant for AI-style responses that show rich content like code blocks or markdown without a visible boundary.' },
      { guidance: false, description: 'Don\'t use ChatSystemMessage for sender content; it has no avatar, alignment, or bubble. Use ChatMessage with a sender role instead.' },
      { guidance: false, description: 'Don\'t put long or multi-line content in a system message; keep it to a single short sentence. If you need more, use a bubble or a card.' },
      { guidance: false, description: 'Don\'t nest ChatMessage inside another ChatMessage; each message is a standalone article element with its own sender context.' },
      { guidance: false, description: 'Don\'t apply a fixed height directly on the message list; wrap it in a sized container and let the list fill with flex: 1.' },
      { guidance: false, description: 'Don\'t mix filled and ghost bubble variants within the same sender\'s messages; pick one style per side and use it consistently.' },
      { guidance: false, description: 'Don\'t place metadata or names on both the bubble and the message wrapper; pick one based on whether the content has a bubble boundary.' },
],
    anatomy: [
      { name: 'Message area', required: true, description: 'Scrollable region for messages. Renders children (typically ChatMessageList) in a flex column that pushes content to the bottom when the list is short.' },
      { name: 'Frosted glass dock', required: true, description: 'Sticky or fixed container at the bottom with a backdrop-blur layer. Houses the scroll button and composer.' },
      { name: 'Scroll-to-bottom button', required: false, description: 'Appears when the user scrolls up or new messages arrive. Defaults to ChatLayoutScrollButton; pass null to hide or a custom element to override.' },
      { name: 'Composer', required: true, description: 'The input area for sending messages, typically ChatComposer. Docked at the bottom inside the frosted glass layer.' },
      { name: 'Empty state', required: false, description: 'Centered placeholder shown when no messages exist. Use EmptyState for a consistent look.' },
      { name: 'Avatar', required: false, description: 'A sender avatar rendered beside the message. Typically Avatar with size="md". Hidden for system messages.' },
      { name: 'Name', required: false, description: 'Sender name above the message body. Place on the bubble when using bubbles, or on the message wrapper for raw content.' },
      { name: 'Content', required: true, description: 'The message body: one or more ChatMessageBubble elements, or any free-form ReactNode like images or tool calls. Wrap non-bubble content in a ghost bubble to align it with the bubble text column.' },
      { name: 'Metadata', required: false, description: 'Timestamp, delivery status, and footer actions below the message. Place on the last bubble or on the message wrapper.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description: 'Chat 是一组用于构建 AI 和人工聊天体验的可组合基础组件。组合 ChatLayout、ChatMessageList、ChatMessage、气泡、系统消息、工具调用、标记文本和 ChatComposer，可构建完整对话，而无需重新实现发送者感知布局、密度、滚动或编写器行为。',
    bestPractices: [
      { guidance: true, description: '使用 MessageList > Message > Bubble 组合来获得一致的发送者感知样式和密度。' },
      { guidance: true, description: '设置 density 属性来全局控制间距：compact 用于侧边栏，balanced 用于大多数视图，spacious 用于长篇阅读。' },
      { guidance: true, description: '当同一发送者发送多条连续消息时，使用气泡的 group 属性（first、middle、last）来视觉上连接相关消息。' },
      { guidance: true, description: '使用 ChatSystemMessage 的 variant="divider" 作为日期分隔线，使用 default 作为内联状态通知。' },
      { guidance: true, description: '将 name 放在第一个气泡上，metadata 放在最后一个气泡上，使其与气泡的内边距对齐。' },
      { guidance: true, description: '将自定义消息内容（卡片、附件、引用）包裹在 ghost 变体的气泡中，使其与气泡文本列对齐；需要占满消息列宽度时设置 width="100%"。' },
      { guidance: true, description: '提供 emptyState 属性，让新用户看到开始对话的提示，而不是空白屏幕。' },
      { guidance: true, description: '使用 ghost 气泡变体显示代码块或 Markdown 等富内容，无需可见边界。' },
      { guidance: false, description: '不要将 ChatSystemMessage 用于发送者内容，它没有头像、对齐或气泡。请使用带有发送者角色的 ChatMessage。' },
      { guidance: false, description: '不要在系统消息中放置冗长或多行内容，保持一句简短的话。如需更多内容，请使用气泡或卡片。' },
      { guidance: false, description: '不要将 ChatMessage 嵌套在另一个 ChatMessage 内，每条消息都是独立的 article 元素。' },
      { guidance: false, description: '不要直接在消息列表上应用固定高度，将其包裹在有尺寸的容器中，让列表以 flex: 1 填充。' },
      { guidance: false, description: '不要在同一发送者的消息中混用 filled 和 ghost 气泡变体，每一侧选择一种样式并保持一致。' },
      { guidance: false, description: '不要同时在气泡和消息包装器上放置 metadata 或 name，根据内容是否有气泡边界来选择。' },
    ],
    anatomy: [
      { name: 'Message area', required: true, description: 'Scrollable region for messages. Renders children (typically ChatMessageList) in a flex column that pushes content to the bottom when the list is short.' },
      { name: 'Frosted glass dock', required: true, description: 'Sticky or fixed container at the bottom with a backdrop-blur layer. Houses the scroll button and composer.' },
      { name: 'Scroll-to-bottom button', required: false, description: 'Appears when the user scrolls up or new messages arrive. Defaults to ChatLayoutScrollButton; pass null to hide or a custom element to override.' },
      { name: 'Composer', required: true, description: 'The input area for sending messages, typically ChatComposer. Docked at the bottom inside the frosted glass layer.' },
      { name: 'Empty state', required: false, description: 'Centered placeholder shown when no messages exist. Use EmptyState for a consistent look.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'AI chat components. Layout (MessageList>Message>Bubble+SystemMessage) + Composer (shell w/ slots, ContentEditable input w/ trigger menus, tokens, msg history, attachments)',
  usage: {
    description: 'Chat family: layout + message list + sender messages + bubbles + system messages + tool calls + tokenized text + composer for complete conversation UIs.',
    bestPractices: [
      { guidance: true, description: 'MessageList > Message > Bubble for sender-aware styling.' },
      { guidance: true, description: 'Density prop controls global spacing: compact for sidebars, balanced default, spacious for reading.' },
      { guidance: true, description: 'gap tunes top-level row spacing separately from density for independent LLM/tool-event rows.' },
      { guidance: true, description: 'Group prop on bubbles (first/middle/last) for consecutive same-sender messages; tightens corner radius.' },
      { guidance: true, description: 'SystemMessage: divider variant for date breaks, default for status notices.' },
      { guidance: true, description: 'Name on first bubble, metadata on last; aligns with bubble inline padding.' },
      { guidance: true, description: 'Ghost bubble wraps custom content (cards/attachments); width="100%" spans full message column (default cap max(80%,280px)).' },
      { guidance: true, description: 'Provide emptyState so new users see a prompt, not a blank screen.' },
      { guidance: true, description: 'Ghost bubble variant for rich AI content like code/markdown without visible boundary.' },
      { guidance: false, description: 'SystemMessage for sender content: no avatar/alignment/bubble. Use ChatMessage instead.' },
      { guidance: false, description: 'Long/multi-line system messages: keep to a single short sentence.' },
      { guidance: false, description: 'Nesting ChatMessage inside another: each is a standalone article.' },
      { guidance: false, description: 'Fixed height on message list directly: wrap in a sized container, let flex: 1 fill.' },
      { guidance: false, description: 'Mix filled and ghost variants in same sender\'s messages: pick one style per side.' },
      { guidance: false, description: 'Metadata/names on both bubble and wrapper: pick one.' },
],
  },
};
