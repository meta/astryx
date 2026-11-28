// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatSendButton',
  subComponentOf: 'Chat',
  displayName: 'Chat Send Button',
  isHiddenFromOverview: true,
  description: 'Circular send/stop toggle button for the chat composer. Place it inside ChatComposer where it reads context automatically: no wiring needed. When streaming starts, the button switches from a primary send icon to a secondary stop icon. Override any context value via props for standalone or custom usage.',
  props: [
    {
      name: 'isStopShown',
      type: 'boolean',
      description: 'Whether the stop button is shown. Defaults to context value.',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the send button is disabled. Defaults to !canSend from context.',
    },
    {
      name: 'onSend',
      type: '() => void',
      description: 'Called when the user clicks send. Defaults to context onSubmit.',
    },
    {
      name: 'onStop',
      type: '() => void',
      description: 'Called when the user clicks stop during streaming. Defaults to context onStop.',
    },
    {
      name: 'sendIcon',
      type: 'ReactNode',
      description: 'Custom icon for the send state. Only undefined uses the chat-send-button-send slot, then arrowUp. null hides the glyph, which is the button\'s only visible content; screen readers still announce Send. Use null only when a theme or caller paints the send affordance through the button\'s own styling (theme components styling or xstyle), never on a bare button. Paint it with a property other than background-image, which carries the hover and pressed overlay, and only while the send state shows (not while isStopShown).',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'stopIcon',
      type: 'ReactNode',
      description: 'Custom icon for the stop state. Defaults to the stop icon (theme icons, else a registered or built-in drawing).',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'size',
      type: "'sm' | 'md'",
      description: 'Button size.',
      default: "'md'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-chat-send-button'}],
    componentIcons: [
      {
        slot: 'chat-send-button-send',
        description: 'Send-state glyph.',
        fallback: '`arrowUp`',
        whenNull: 'Hides the glyph, the button\'s only visible content; behavior, size and the accessible name are unchanged. Map the slot to null only when the theme paints the send affordance through the button\'s own styling, with a property other than background-image (which carries the hover and pressed overlay), and only in the send state.',
      },
    ],
  },
  usage: {
    description: 'Use ChatSendButton as ChatComposer’s send control when the action should switch between sending and stopping. Inside ChatComposer it reads readiness, streaming state, and action callbacks from context; standalone usage supplies those values explicitly.',
    bestPractices: [
      {
        guidance: true,
        description: 'Place ChatSendButton inside ChatComposer when its readiness and send or stop lifecycle should follow composer context.',
      },
      {
        guidance: true,
        description: 'For standalone use, provide the state and matching onSend or onStop callback explicitly.',
      },
      {
        guidance: true,
        description: 'Keep the translated Send or Stop accessible name intact when supplying custom icon artwork; the icon is decorative and must not be the only name source.',
      },
      {
        guidance: false,
        description: 'Do not render the stop state without a working onStop callback from props or ChatComposer context.',
      },
      {
        guidance: false,
        description: 'Do not expect isDisabled to disable the stop action; it applies only to the send state.',
      },
    ],
    anatomy: [
      {
        name: 'Action button',
        required: true,
        description: 'Circular icon-only Button that exposes the translated Send or Stop name and carries the chat-send-button theme target.',
      },
    ],
  },
};

export const docsZh = {
  name: 'ChatSendButton',
  isHiddenFromOverview: true,
  displayName: 'Chat Send Button',
  description: '编写器的圆形发送/停止切换按钮。默认从 ChatComposerContext 读取状态，在 ChatComposer 内自动工作。所有上下文值均可通过 props 覆盖以用于独立使用。',
  propDescriptions: {
    isStopShown: '是否显示停止按钮。默认使用上下文值。',
    isDisabled: '发送按钮是否禁用。默认使用上下文的 !canSend。',
    onSend: '用户点击发送时调用。默认使用上下文的 onSubmit。',
    onStop: '流式响应期间用户点击停止时调用。默认使用上下文的 onStop。',
    sendIcon: '发送状态的自定义图标。仅当值为 undefined 时才使用 chat-send-button-send 插槽，无映射时使用 arrowUp。传入 null 会隐藏图标，而图标是按钮唯一的可见内容；屏幕阅读器仍会读出“发送”。仅当主题或调用方通过按钮自身的样式（主题 components 样式或 xstyle）绘制发送图形时才使用 null，不要用于没有其他样式的按钮。请用 background-image 以外的属性绘制（background-image 承载悬停和按下的叠加层），并且只在显示发送状态时绘制（isStopShown 时不绘制）。',
    stopIcon: '停止状态的自定义图标。默认使用 stop 图标（主题图标，否则为已注册或内置的图形）。',
    size: '按钮大小。',
    xstyle: '额外的 StyleX 样式。',
  },
};

export const docsDense = {
  name: 'ChatSendButton',
  isHiddenFromOverview: true,
  displayName: 'Chat Send Button',
  description: 'circular send/stop toggle btn for composer; reads ChatComposerContext; all context vals overridable via props',
  propDescriptions: {
    isStopShown: 'stop button visibility; defaults to context',
    isDisabled: 'disabled; defaults to !canSend from context',
    onSend: 'send click handler; defaults to context onSubmit',
    onStop: 'stop click handler; defaults to context onStop',
    sendIcon: 'custom send icon > chat-send-button-send > arrowUp; only undefined falls through; null hides the only visible content (name kept): use only with theme/xstyle-painted affordance, not via background-image (hover/press overlay), send state only',
    stopIcon: 'custom stop icon; default: stop icon (theme icons, else a registered or built-in drawing)',
    size: 'btn size',
    xstyle: 'additional StyleX styles',
  },
};
