// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatLayout',
  subComponentOf: 'Chat',
  displayName: 'Chat Layout',
  description: 'Layout shell for full chat interfaces. Messages flow in normal page flow, composer is fixed to the bottom with a frosted glass dock. Set density (compact/balanced/spacious) to control spacing, message max-width, and blur layer sizing. Includes built-in auto-scroll, a "New messages" scroll-to-bottom button, and a frosted glass blur layer behind the composer. By default the layout root is the scroll container; pass scrollRef to delegate scrolling to a parent element or the document body. Where the visual viewport shrinks for the software keyboard, the composer stays on top of the keyboard, and a conversation at its newest message stays there. In Chrome on Android the composer rides Gboard\u2019s slides in step with them. In Safari on iOS (in the browser and as a home-screen app) and in Firefox for Android, it moves above the keyboard once the browser reports it. On a touch screen, in a top-level page, every way into the composer\u2019s text (a tap, the keyboard\u2019s previous and next buttons, Tab, the input\u2019s focus()) focuses it without scrolling the page; under a mouse or inside an iframe the browser\u2019s own focus applies. When scrollRef names the document, Safari on iOS reveals the composer itself, in the browser and as a home-screen app. Done then rests focus on no composer group. In another browser without the VirtualKeyboard API, each keyboard show keeps the browser\u2019s focus until one leaves the composer covered. The composer then rises after a short wait, and later shows work as elsewhere. Where your page sets interactive-widget=resizes-content, Chrome on Android shrinks the page for the keyboard itself and the composer stays above it without moving (see the browser-support guide).',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Message content: typically ChatMessageList. Flows naturally in the page and scrolls with the container.',
      required: true,
    },
    {
      name: 'composer',
      type: 'ReactNode',
      description: 'Composer element: typically ChatComposer. Fixed to the bottom with a frosted glass dock.',
      required: true,
      slotElements: [
        {
          __element: 'TextInput',
          props: {
            label: 'Input',
            placeholder: 'Type here...',
          },
        },
      ],
    },
    {
      name: 'emptyState',
      type: 'ReactNode',
      description: 'Content shown when children is empty. Centered vertically in the message area.',
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
      name: 'scrollButton',
      type: 'ReactNode | null',
      description: 'Scroll-to-bottom button rendered above the composer. Defaults to ChatLayoutScrollButton with auto-scroll integration. Pass null to hide.',
    },
    {
      name: 'scrollRef',
      type: 'React.RefObject<HTMLElement | null>',
      description: 'External scroll container ref. When provided, auto-scroll and scroll-to-bottom target this element instead of the layout root. Use when the chat is embedded in a page where a parent element or the document body scrolls.',
    },
    {
      name: 'density',
      type: "'compact' | 'balanced' | 'spacious'",
      description: 'Visual density: controls dock padding, message-area max-width and inline padding, and the height of the frosted glass blur layer.',
      default: "'balanced'",
    },
  ],
  usage: {
    description: 'ChatLayout is the layout shell for full-page chat interfaces. It renders messages in normal page flow and docks the composer to the bottom with a frosted glass blur layer. Set the density prop to control spacing; it defaults to balanced. Use it to wrap ChatMessageList and ChatComposer for a complete chat experience with built-in auto-scroll and a scroll-to-bottom button.',
    bestPractices: [
      {
        guidance: true,
        description: 'Pass ChatMessageList as children and ChatComposer as the composer prop for a complete chat interface.',
      },
      {
        guidance: true,
        description: 'Provide an emptyState so new conversations show a prompt instead of a blank screen.',
      },
      {
        guidance: true,
        description: 'Use scrollRef when the chat is embedded in a page where a parent element handles scrolling.',
      },
      {
        guidance: true,
        description: "Give a full-page ChatLayout a container 100dvh tall, not 100vh: where a phone browser's toolbar collapses, 100vh is the viewport with the toolbar hidden, so the composer would start below the screen's edge.",
      },
      {
        guidance: false,
        description: "Don't apply a fixed height on the layout; let it fill its container with flex: 1.",
      },
      {
        guidance: false,
        description: "Don't render multiple ChatLayout instances in the same scroll container; each expects to own its scroll context.",
      },
    ],
    anatomy: [
      {
        name: 'Message area',
        required: true,
        description: 'Scrollable region for messages. Renders children (typically ChatMessageList) in a flex column that pushes content to the bottom when the list is short.',
      },
      {
        name: 'Frosted glass dock',
        required: true,
        description: 'Sticky or fixed container at the bottom with a backdrop-blur layer. Houses the scroll button and composer. While a software keyboard is up it sits on top of the keyboard, and the message area gets room to scroll above it.',
      },
      {
        name: 'Scroll-to-bottom button',
        required: false,
        description: 'Appears when the user scrolls up or new messages arrive. Defaults to ChatLayoutScrollButton; pass null to hide or a custom element to override.',
      },
      {
        name: 'Composer',
        required: true,
        description: 'The input area for sending messages, typically ChatComposer. Docked at the bottom inside the frosted glass layer. In a top-level page on a touch screen, its wrapper (without the scroll button) is a group with no name. When the keyboard\u2019s Done ends typing, focus rests on that group (it is no tab stop), so the next tap or Tab starts from the composer. It shows the focus ring after keyboard input only. Under a mouse or inside an iframe, the wrapper is a plain container. So it is when scrollRef names the document in Safari on iOS, and in another browser without the VirtualKeyboard API until a keyboard show leaves the composer covered: the browser keeps focus there.',
      },
      {
        name: 'Empty state',
        required: false,
        description: 'Centered placeholder shown when no messages exist. Use EmptyState for a consistent look.',
      },
    ],
  },
};

export const docsZh = {
  name: 'ChatLayout',
  displayName: 'Chat Layout',
  description: '完整聊天界面的布局外壳。消息在页面中自然流动，编写器固定在底部，带有毛玻璃效果。通过 density 属性控制密度。在可视视口会随软键盘缩小的浏览器中，编写器停在键盘上方，停留在最新消息的对话保持在最新消息。在 Android 上的 Chrome 中，编写器随 Gboard 的滑动同步移动。在 iOS 上的 Safari（浏览器中和添加到主屏幕的网页应用）和 Android 上的 Firefox 中，编写器会在浏览器报告键盘后移到键盘上方。在触摸屏上的顶层页面中，进入编写器文本的每种方式（轻点、键盘的上一项和下一项按钮、Tab、输入框的 focus()）都会聚焦它而不滚动页面；使用鼠标或在 iframe 中时沿用浏览器自身的聚焦行为。当 scrollRef 指向文档时，iOS 上的 Safari（浏览器中和主屏幕网页应用）会自行将编写器显示在键盘上方，键盘的“完成”也不会把焦点停在编写器分组上。在其他没有 VirtualKeyboard API 的浏览器中，每次弹出键盘都沿用浏览器自身的聚焦，直到某次弹出让编写器被键盘遮住；编写器会在短暂等待后升到键盘上方，之后的弹出与其他情况相同。如果页面设置了 interactive-widget=resizes-content，Android 上的 Chrome 会自行为键盘缩小页面，编写器停在键盘上方而不移动（参见浏览器支持指南）。',
  propDescriptions: {
    children: '消息内容，通常是 ChatMessageList。在页面中自然流动。',
    composer: '编写器元素，通常是 ChatComposer。固定在底部，带有毛玻璃底座。',
    emptyState: '子元素为空时显示的内容。',
    scrollButton: '编写器上方的滚动到底部按钮。默认使用 ChatLayoutScrollButton。传入 null 隐藏。',
    scrollRef: '外部滚动容器引用。提供时，自动滚动和滚动到底部将目标指向此元素。',
    density: '视觉密度：控制底座内边距、消息区最大宽度和毛玻璃层高度。',
  },
};

export const docsDense = {
  name: 'ChatLayout',
  displayName: 'Chat Layout',
  description: 'layout shell for full chat; msgs in page flow, composer fixed bottom w/ frosted glass dock; density prop (default balanced); scrollRef delegates to parent/body; in Chrome on Android (Gboard) the composer rides the software keyboard in step; in Safari on iOS and Firefox for Android it moves above the keyboard once reported (Chrome with interactive-widget=resizes-content: the page resizes, no move); transcript stays at newest msg, on a touch screen in a top-level page every focus route (tap, prev/next, Tab, focus()) w/o page scroll and Done rests focus on the composer group (no name, ring after keyboard input only, no tab stop); under a mouse or in an iframe: plain wrapper, browser focus; scrollRef on the document in Safari on iOS: Safari reveals the composer, browser focus, no group; other browsers without the VirtualKeyboard API: browser focus until a show leaves the composer covered, which rises after a short wait',
  usage: {
    bestPractices: [
      {guidance: true, description: 'Pass ChatMessageList as children and ChatComposer as composer prop for complete chat.'},
      {guidance: true, description: 'Provide emptyState so new conversations show a prompt, not blank screen.'},
      {guidance: true, description: 'Use scrollRef when chat is embedded in a page where a parent element handles scrolling.'},
      {guidance: true, description: 'full-page: container 100dvh not 100vh (100vh = viewport w/ phone toolbar hidden; composer starts below screen edge)'},
      {guidance: false, description: 'Apply fixed height on layout; let it fill container with flex: 1.'},
      {guidance: false, description: 'Render multiple ChatLayout instances in same scroll container; each expects to own its scroll context.'},
    ],
  },
  propDescriptions: {
    children: 'msg content; typically ChatMessageList',
    composer: 'composer element; typically ChatComposer; fixed bottom w/ frosted glass',
    emptyState: 'content when children empty',
    scrollButton: 'scroll-to-bottom btn; defaults to ChatLayoutScrollButton; pass null to hide',
    scrollRef: 'external scroll container ref; targets parent/body instead of layout root',
    density: 'visual density; dock padding, message max-width, blur height',
  },
};
