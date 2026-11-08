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
      description: 'Custom icon for the send state. Defaults to arrowUp from icon registry.',
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
      description: 'Custom icon for the stop state. Defaults to stop from icon registry.',
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
    sendIcon: '发送状态的自定义图标。默认使用图标注册表的 arrowUp。',
    stopIcon: '停止状态的自定义图标。默认使用图标注册表的 stop。',
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
    sendIcon: 'custom send icon; default arrowUp from registry',
    stopIcon: 'custom stop icon; default stop from registry',
    size: 'btn size',
    xstyle: 'additional StyleX styles',
  },
};
