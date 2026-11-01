// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Toast',
  displayName: 'Toast',
  group: 'Toast',
  category: 'Overlay',
  hiddenComponents: ['ToastViewport'],
  keywords: [
    'toast',
    'notification',
    'snackbar',
    'alert',
    'message',
    'feedback',
    'status',
  ],

  playground: {
    defaults: {body: 'Changes saved'},
  },

  props: [
    {
      name: 'body',
      type: 'ReactNode',
      description: 'Primary message content.',
      required: true,
      slotElements: [
        {__element: 'Text', props: {type: 'body'}, children: 'Toast message'},
      ],
    },
    {
      name: 'type',
      type: "'info' | 'error'",
      description:
        'Toast type controlling background color. Error toasts persist until dismissed.',
      default: "'info'",
    },
    {
      name: 'isAutoHide',
      type: 'boolean',
      description:
        'Whether the toast auto-dismisses. Defaults to true for info, false for error.',
    },
    {
      name: 'autoHideDuration',
      type: 'number',
      description:
        'Duration in ms before auto-dismiss. Timed content must satisfy WCAG 2.2.1.',
      default: '5000',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content rendered at the trailing end (e.g. Undo button, link). Keep action labels short.',
      slotElements: [
        {__element: 'Icon', props: {icon: 'chevronDown', size: 'sm'}},
        {__element: 'Badge', props: {label: '3'}},
      ],
    },
    {
      name: 'uniqueID',
      type: 'string',
      description: 'Unique identifier for deduplication.',
    },
    {
      name: 'collisionBehavior',
      type: "'overwrite' | 'ignore'",
      description:
        'Behavior when a toast with matching uniqueID already exists.',
      default: "'overwrite'",
    },
    {
      name: 'onHide',
      type: '(reason: "auto" | "manual") => void',
      description: 'Callback fired when the toast is removed.',
    },
    {
      name: 'onDismiss',
      type: '(reason: "auto" | "manual") => void',
      description: 'Callback fired when the toast is dismissed.',
      required: true,
    },
    {
      name: 'renderContent',
      type: '(toast: ToastContentRenderProps) => ReactNode',
      description:
        "Replaces the content of this toast's card with your own layout. Astryx keeps the card, its astryx-toast theme target, the live-region role and auto-hide behavior, then hands the renderer the message, endContent, resolved toast settings and a dismiss callback. The custom renderer owns every control in its layout: compose the control you want and call dismiss from it. Astryx does not inject a fallback close into custom content. Per-toast: an app shares one layout by wrapping useToast and passing it on every call, while a toast raised by library code that never passes it renders as an ordinary Astryx toast. The argument is {body, endContent, type, isAutoHide, autoHideDuration, dismiss}, where type is 'info' | 'error'.",
    },
  ],
  theming: {
    targets: [
      // `themeMode` is the resolved mode of the Theme the card renders under,
      // always written with a value ('themeMode:dark'). Key external CSS on
      // [data-theme-mode], not the bare class: `.dark` also matches
      // class-strategy dark-mode rules such as Tailwind's. onDark/onLight
      // rules for `toast` compile to descendant selectors and never paint
      // the card root; themeMode is the root's own mode hook.
      {className: 'astryx-toast', visualProps: ['type'], states: ['themeMode']},
    ],
    vars: [
      {
        name: '--_toast-slide-y',
        description:
          'Private block-axis offset inherited from ToastViewport for entry and exit motion',
        default: 'var(--spacing-2)',
        private: true,
      },
      {
        name: '--_toast-swipe-y',
        description: 'Private active swipe offset along the block axis',
        default: '0px',
        private: true,
      },
      {
        name: '--_toast-swipe-exit-y',
        description: 'Private completed-swipe exit offset',
        default: 'var(--_toast-swipe-y)',
        private: true,
      },
      {
        name: '--_toast-swipe-opacity',
        description: 'Private opacity feedback during an accepted swipe',
        default: '1',
        private: true,
      },
      {
        name: '--_toast-swipe-scale',
        description: 'Private scale feedback during an accepted swipe',
        default: '1',
        private: true,
      },
    ],
  },

  usage: {
    description:
      'Toast shows a brief, non-blocking notification to confirm an action or present temporary information. Use it for scenarios where the user needs feedback but not a decision, such as saving, deleting, or changing a status.\n\nFor production use, prefer the `useToast()` hook; it handles positioning, stacking, auto-dismiss, and deduplication via `ToastViewport`. Toasts stay within viewport and safe-area gutters, wrap long message content, and enter, exit, or swipe-dismiss toward their configured top or bottom edge. The vertical swipe uses the same spatial model as placement motion: top Toasts leave upward and bottom Toasts leave downward. Swipe waits for dominant edge-directed intent before cancelling native touch movement and reports the existing manual dismissal reason. Pen is supported as direct-contact input; mouse drag is excluded to avoid conflicting with desktop text selection, where the visible close control remains available. Set `isAutoHide: false` explicitly when an action or message must remain available. The `Toast` component renders the visual toast element inline and is useful for previews, documentation, and static showcases where the viewport lifecycle is not needed.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep messages short: only a few words that tell the user what happened, like "Changes saved" or "Message sent".',
      },
      {
        guidance: true,
        description:
          'Add a short undo action in the endContent slot for reversible operations. Set isAutoHide to false when the action must remain available.',
      },
      {
        guidance: true,
        description:
          'Use uniqueID to deduplicate toasts that fire from repeated actions, like clicking a save button multiple times.',
      },
      {
        guidance: true,
        description:
          "Use error type for failures that need attention but not immediate action; it persists until dismissed so the user won't miss it.",
      },
      {
        guidance: true,
        description:
          "Give a toast action the look of the controls on the page around it through the card's themeMode state (toast: {'themeMode:dark': {...}}), not by branching on useTheme() in product code. Inside the card, light-dark() and onDark/onLight follow the surface, so when that surface is dark in both modes (the error toast; a brand's ink toast) they see one side, and themeMode is the only thing that still says which page the card is on.",
      },
      {
        guidance: false,
        description:
          "Don't use a toast for critical errors that block the user. Use Banner for persistent, in-context messaging that requires acknowledgment.",
      },
      {
        guidance: false,
        description:
          "Don't put long or multi-line content in a toast; it disappears after 5 seconds and the user may not finish reading.",
      },
      {
        guidance: false,
        description:
          "Don't show form validation errors as toasts. Use inline field validation so the user can see exactly which field needs fixing.",
      },
    ],
    anatomy: [
      {
        name: 'Body',
        required: true,
        description:
          'The primary message text describing what happened or what the user should know.',
      },
      {
        name: 'End content',
        required: false,
        description:
          'A trailing action like an Undo button or a link, placed after the body text.',
      },
      {
        name: 'Dismiss button',
        required: true,
        description:
          'A close button that lets the user manually dismiss the toast before auto-hide.',
      },
    ],
  },
};

// -------------------------------------------------------
// Auto-generated translations below. Do not edit manually.
// Regenerate with the dense compression protocol.
// See .context/decisions/dense-compression-protocol.md
// -------------------------------------------------------

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  propDescriptions: {
    body: '主要消息内容。',
    type: 'Toast 类型，控制背景颜色。error toast 持续显示直到关闭。',
    isAutoHide: '是否自动关闭。info 默认为 true，error 默认为 false。',
    autoHideDuration:
      '自动关闭前的持续时间（毫秒）。定时内容必须符合 WCAG 2.2.1。',
    endContent: '尾部渲染的内容（如撤销按钮、链接）。操作标签应保持简短。',
    uniqueID: '用于去重的唯一标识符。',
    collisionBehavior: '当已存在相同 uniqueID 的 toast 时的行为。',
    onHide: '当 toast 被移除时触发的回调。',
    renderContent:
      "用你自己的布局替换该 toast 卡片内部的内容。Astryx 保留卡片本身、astryx-toast 主题目标、实时区域角色和自动关闭行为，并把消息、endContent、解析后的 toast 设置和 dismiss 回调交给渲染函数。自定义渲染函数完全拥有布局中的控件：请组合所需的控件并通过它调用 dismiss。Astryx 不会向自定义内容注入后备关闭按钮。按 toast 单独设置：应用可通过封装 useToast 并在每次调用时传入来共享同一套布局；而由库代码发起、从不传入该参数的 toast 会渲染为普通的 Astryx toast。传入参数为 {body, endContent, type, isAutoHide, autoHideDuration, dismiss}，其中 type 为 'info' | 'error'。",
  },
  usage: {
    description:
      'Toast 显示简短的非阻塞通知，用于确认操作或呈现临时信息。适用于用户需要反馈但不需要做决定的场景，如保存、删除或状态变更。\n\n生产环境中推荐使用 `useToast()` hook，它通过 `ToastViewport` 处理定位、堆叠、自动关闭和去重。Toast 会保持在视口和安全区域边距内，较长的消息会换行，并根据配置的顶部或底部边缘进入、退出或滑动关闭。垂直滑动与位置动效使用同一空间模型：顶部 Toast 向上离开，底部 Toast 向下离开。只有在动作明确朝向关闭边缘时才会接管原生触摸移动，滑动关闭继续报告现有的 manual 原因。触控笔属于直接接触输入，因此支持相同手势；鼠标拖动会与桌面文本选择冲突，所以不启用，关闭按钮始终可用。当操作或消息必须持续可用时，请显式设置 `isAutoHide: false`。`Toast` 组件以内联方式渲染 toast 视觉元素，适用于不需要视口生命周期的预览、文档和静态展示。',
    bestPractices: [
      {
        guidance: true,
        description:
          '保持消息简短，只需几个词告诉用户发生了什么，如"更改已保存"或"消息已发送"。',
      },
      {
        guidance: true,
        description:
          '在 endContent 插槽中添加简短的撤销操作，用于可逆操作。当操作必须持续可用时，将 isAutoHide 设置为 false。',
      },
      {
        guidance: true,
        description:
          '使用 uniqueID 去重重复操作触发的 toast，如多次点击保存按钮。',
      },
      {
        guidance: true,
        description:
          '对需要关注但不需要立即操作的错误使用 error 类型，它会持续显示直到关闭。',
      },
      {
        guidance: true,
        description:
          "通过卡片的 themeMode 状态（toast: {'themeMode:dark': {...}}）让 toast 操作与页面上的控件保持同一外观，而不是在产品代码中依据 useTheme() 分支。卡片内部的 light-dark() 与 onDark/onLight 跟随表面：当表面在两种模式下都是深色（error toast、品牌的墨色 toast）时它们只看到一侧，只有 themeMode 仍能说明卡片所在的页面模式。",
      },
      {
        guidance: false,
        description:
          '不要对阻塞用户的严重错误使用 toast，使用 Banner 进行持久的上下文消息传递。',
      },
      {
        guidance: false,
        description:
          '不要在 toast 中放置长内容或多行内容，它会在5秒后消失，用户可能来不及阅读。',
      },
      {
        guidance: false,
        description:
          '不要将表单验证错误显示为 toast，使用内联字段验证让用户看到具体哪个字段需要修复。',
      },
    ],
    anatomy: [
      {
        name: '正文',
        required: true,
        description: '描述发生了什么或用户应该知道什么的主要消息文本。',
      },
      {
        name: '尾部内容',
        required: false,
        description: '正文后的尾随操作，如撤销按钮或链接。',
      },
      {
        name: '关闭按钮',
        required: true,
        description: '让用户在自动隐藏前手动关闭 toast 的关闭按钮。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'toast notification w/ auto-dismiss, stacking, dedup, smooth animations; MediaTheme inverted surface; card reflects resolved Theme mode as themeMode state (light|dark) for app-mode theming',
  usage: {
    description:
      'Brief non-blocking notification for action confirmations and temporary info. Use where user needs feedback not decisions: saves, deletes, status changes. useToast() hook for production (safe-area positioning, responsive message wrapping, stacking, auto-dismiss, dedup via ToastViewport). Enters, exits, or swipe-dismisses toward configured edge; touch is claimed only after dominant edge-directed intent; swipe reports manual. Pen uses the direct-contact gesture; mouse drag stays off to preserve text selection and the close control remains available. Set isAutoHide false explicitly for must-remain actions/messages. Toast renders inline for previews/docs/static showcases.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Short messages, a few words: "Changes saved", "Message sent".',
      },
      {
        guidance: true,
        description:
          'Short Undo action in endContent for reversible ops; set isAutoHide false when it must remain available.',
      },
      {
        guidance: true,
        description: 'uniqueID to dedup repeated action toasts.',
      },
      {
        guidance: true,
        description:
          'Error type for failures needing attention; persists until dismissed.',
      },
      {
        guidance: true,
        description:
          "Style toast actions for the page around them via themeMode state (toast: {'themeMode:dark': {...}}), not useTheme() branching in product code; light-dark()/onDark inside the card follow the surface, so a surface dark in both modes (error toast, brand ink toast) sees one side and only themeMode still says which page the card is on.",
      },
      {
        guidance: false,
        description:
          "Don't use for critical blocking errors. Use Banner for persistent in-context messaging.",
      },
      {
        guidance: false,
        description:
          "Don't put long/multi-line content; disappears in 5s, user may not finish reading.",
      },
      {
        guidance: false,
        description:
          "Don't show form validation errors. Use inline field validation instead.",
      },
    ],
  },
  propDescriptions: {
    body: 'primary message content',
    type: 'toast type; controls bg color; error persists until dismissed',
    isAutoHide: 'auto-dismiss; true for info, false for error',
    autoHideDuration:
      'ms before auto-dismiss; timed content must satisfy WCAG 2.2.1',
    endContent:
      'trailing end content (undo btn, link); keep action labels short',
    uniqueID: 'unique id for dedup',
    collisionBehavior: 'behavior when matching uniqueID exists',
    onHide: 'callback when toast removed',
    renderContent: 'custom inner layout; receives content, resolved settings + dismiss callback; no injected fallback control',
  },
};
