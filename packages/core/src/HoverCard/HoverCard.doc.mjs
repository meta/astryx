// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'HoverCard',
  displayName: 'Hover Card',
  group: 'HoverCard',
  category: 'Overlay',
  keywords: [
    'hovercard',
    'hover card',
    'popover',
    'tooltip',
    'preview card',
    'flyout',
    'overlay',
    'hover popup',
  ],
  playground: {
    defaults: {
      content: {
        __element: 'Text',
        props: {type: 'body'},
        children: 'Additional details shown on hover.',
      },
      children: {
        __element: 'Link',
        props: {href: '#'},
        children: 'Hover for details',
      },
    },
  },
  theming: {
    targets: [{className: 'astryx-hover-card'}],
    vars: [
      {
        name: '--_hovercard-radius',
        description: 'Border radius of the hover card',
        default: 'var(--radius-container)',
        private: true,
      },
    ],
    derived: [{property: 'borderRadius', vars: ['--_hovercard-radius']}],
  },
  components: [
    {
      name: 'HoverCard',
      displayName: 'Hover Card',
      description:
        'Component wrapper for hover card display: a richer, larger overlay triggered on hover or focus.',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Trigger element that must accept a ref.',
        },
        {
          name: 'content',
          type: 'ReactNode',
          description: 'Hover card content.',
          required: true,
          slotElements: [
            {
              __element: 'Text',
              props: {type: 'body'},
              children: 'Content text',
            },
          ],
        },
        {
          name: 'placement',
          type: "'above' | 'below' | 'start' | 'end'",
          description:
            "Position relative to the anchor element. Logical: start/end resolve against the popover\'s own inherited direction (RTL mirrors in pure CSS).",
          default: "'above'",
        },
        {
          name: 'alignment',
          type: "'start' | 'center' | 'end'",
          description:
            "Alignment along the placement axis. Logical: start/end resolve against the popover\'s own inherited direction (RTL mirrors in pure CSS).",
          default: "'center'",
        },
        {
          name: 'delay',
          type: 'number',
          description: 'Show delay in milliseconds.',
          default: '300',
        },
        {
          name: 'hideDelay',
          type: 'number',
          description: 'Hide delay in milliseconds.',
          default: '200',
        },
        {
          name: 'focusTrigger',
          type: "'auto' | 'always' | 'never'",
          description: 'Controls when focus events trigger the hover card.',
          default: "'auto'",
        },
        {
          name: 'touchTrigger',
          type: "'auto' | 'tap' | 'none'",
          description:
            'What a tap does where there is no hover. auto opens on tap unless the trigger performs an action of its own (a button, link, or form control), whose tap belongs to the control. tap always opens. none never opens on touch. A tap-opened card is dismissed by a tap outside it.',
          default: "'auto'",
        },
        {
          name: 'isEnabled',
          type: 'boolean',
          description: 'Enables or disables the hover and focus triggers.',
          default: 'true',
        },
        {
          name: 'label',
          type: 'string',
          description:
            'Accessible name for the hover card popup. When provided, the popup is exposed as a named role="dialog"; when omitted, it falls back to role="group" (a group may validly be unnamed).',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description:
            'Callback fired when hover card visibility changes. Called with true when shown and false when hidden.',
        },
        {
          name: 'hasHoverIndication',
          type: "'auto' | boolean",
          description: 'Shows a dashed underline on the trigger element.',
          default: "'auto'",
        },
        {
          name: 'isDefaultOpen',
          type: 'boolean',
          description:
            'Whether the hover card should be shown on mount. Still dismissible.',
        },
        {
          name: 'isOpen',
          type: 'boolean',
          description: 'Controlled open state for the hover card.',
        },
      ],
    },
  ],
  usage: {
    description:
      'HoverCard shows additional information when the user hovers or focuses a trigger element. Use it for profile cards, link summaries, or inline definitions where the user needs more context without navigating away.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep content supplementary; hover cards should enhance understanding without blocking the primary workflow.',
      },
      {
        guidance: true,
        description:
          'Provide a dashed underline on text triggers so users know the element is hoverable.',
      },
      {
        guidance: true,
        description:
          'Use the hook API (useHoverCard) when you need more control over timing or placement.',
      },
      {
        guidance: true,
        description:
          'Leave touchTrigger on auto so a tap opens the card on triggers that do nothing else, and stays out of the way on triggers that perform an action.',
      },
      {
        guidance: false,
        description:
          'Place critical actions or required information inside a hover card; users may miss content that only appears on hover.',
      },
      {
        guidance: false,
        description:
          'Use a hover card when a simple Tooltip or Popover would suffice.',
      },
      {
        guidance: false,
        description:
          'Use a HoverCard for content the user must interact with; it disappears when the cursor leaves.',
      },
      {
        guidance: true,
        description:
          'Prefer placing HoverCard in a block context rather than directly in a <p>, heading, or link. Those placements are supported when necessary through a corrective portal, but the DOM and tab order may differ.',
      },
    ],
    anatomy: [
      {
        name: 'Trigger',
        required: true,
        description:
          'The element that opens the hover card on hover or focus: a button, link, or inline text.',
      },
      {
        name: 'Card',
        required: true,
        description:
          'The floating overlay with the preview content, anchored to the trigger.',
      },
      {
        name: 'Body',
        required: true,
        description:
          'The main content area: profile info, link summary, or any rich content.',
      },
      {
        name: 'Actions',
        required: false,
        description:
          'Optional buttons inside the card for follow-up actions like Follow or Message.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'HoverCard',
  displayName: 'Hover Card',
  theming: {
    targets: [{className: 'astryx-hover-card'}],
    vars: [
      {
        name: '--_hovercard-radius',
        description: 'Border radius of the hover card',
        default: 'var(--radius-container)',
        private: true,
      },
    ],
    derived: [{property: 'borderRadius', vars: ['--_hovercard-radius']}],
  },
  components: [
    {
      name: 'HoverCard',
      displayName: 'Hover Card',
      description:
        '悬浮卡片显示的组件包装器，在悬停或聚焦时触发更丰富、更大的浮层。',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description: '必须接受 ref 的触发元素。',
        },
        {
          name: 'content',
          type: 'ReactNode',
          description: '悬浮卡片内容。',
          required: true,
        },
        {
          name: 'placement',
          type: "'above' | 'below' | 'start' | 'end'",
          description:
            '相对于锚点元素的位置。逻辑值：start/end 根据弹出层自身继承的方向解析（RTL 镜像）。',
          default: "'above'",
        },
        {
          name: 'alignment',
          type: "'start' | 'center' | 'end'",
          description:
            '沿放置轴的对齐方式。逻辑值：start/end 根据弹出层自身继承的方向解析（RTL 镜像）。',
          default: "'center'",
        },
        {
          name: 'delay',
          type: 'number',
          description: '显示延迟（毫秒）。',
          default: '300',
        },
        {
          name: 'hideDelay',
          type: 'number',
          description: '隐藏延迟（毫秒）。',
          default: '200',
        },
        {
          name: 'focusTrigger',
          type: "'auto' | 'always' | 'never'",
          description: '控制焦点事件何时触发悬浮卡片。',
          default: "'auto'",
        },
        {
          name: 'touchTrigger',
          type: "'auto' | 'tap' | 'none'",
          description:
            '在没有悬停的触摸设备上，轻点的行为。auto：轻点即打开，除非触发元素本身会执行操作（按钮、链接、表单控件），此时轻点归该控件所有。tap：始终轻点打开。none：触摸永不打开。轻点打开的卡片可通过点击卡片外部关闭。',
          default: "'auto'",
        },
        {
          name: 'isEnabled',
          type: 'boolean',
          description: '启用或禁用悬停和聚焦触发器。',
          default: 'true',
        },
        {
          name: 'label',
          type: 'string',
          description:
            '悬浮卡片弹出层的无障碍名称。提供时，弹出层以具名的 role="dialog" 暴露；省略时，回退为 role="group"（group 可以合法地没有名称）。',
        },
        {
          name: 'onOpenChange',
          type: '(isOpen: boolean) => void',
          description:
            '悬浮卡片可见性变化时触发的回调。显示时传入 true，隐藏时传入 false。',
        },
        {
          name: 'hasHoverIndication',
          type: "'auto' | boolean",
          description: '在触发元素上显示虚线下划线。',
          default: "'auto'",
        },
        {
          name: 'isDefaultOpen',
          type: 'boolean',
          description: '是否在挂载时显示悬浮卡片。仍然可以关闭。',
        },
      ],
    },
  ],
  usage: {
    description:
      'HoverCard shows additional information when the user hovers or focuses a trigger element. Use it for profile cards, link summaries, or inline definitions where the user needs more context without navigating away.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep content supplementary; hover cards should enhance understanding without blocking the primary workflow.',
      },
      {
        guidance: true,
        description:
          'Provide a dashed underline on text triggers so users know the element is hoverable.',
      },
      {
        guidance: true,
        description:
          'Use the hook API (useHoverCard) when you need more control over timing or placement.',
      },
      {
        guidance: true,
        description:
          'Leave touchTrigger on auto so a tap opens the card on triggers that do nothing else, and stays out of the way on triggers that perform an action.',
      },
      {
        guidance: false,
        description:
          'Place critical actions or required information inside a hover card; users may miss content that only appears on hover.',
      },
      {
        guidance: false,
        description:
          'Use a hover card when a simple Tooltip or Popover would suffice.',
      },
      {
        guidance: false,
        description:
          'Use a HoverCard for content the user must interact with; it disappears when the cursor leaves.',
      },
      {
        guidance: true,
        description:
          'Prefer placing HoverCard in a block context rather than directly in a <p>, heading, or link. Those placements are supported when necessary through a corrective portal, but the DOM and tab order may differ.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Hover/focus triggered overlay for displaying rich, interactive content anchored to trigger element.',
  usage: {
    description:
      'HoverCard shows additional info on hover/focus. Use for profile cards, link summaries, inline definitions.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep content supplementary; hover cards should enhance understanding without blocking the primary workflow.',
      },
      {
        guidance: true,
        description:
          'Provide a dashed underline on text triggers so users know the element is hoverable.',
      },
      {
        guidance: true,
        description:
          'Use the hook API (useHoverCard) when you need more control over timing or placement.',
      },
      {
        guidance: true,
        description:
          'Leave touchTrigger on auto so a tap opens the card on triggers that do nothing else, and stays out of the way on triggers that perform an action.',
      },
      {
        guidance: false,
        description:
          'Place critical actions or required information inside a hover card; users may miss content that only appears on hover.',
      },
      {
        guidance: false,
        description:
          'Use a hover card when a simple Tooltip or Popover would suffice.',
      },
      {
        guidance: false,
        description:
          'Use a HoverCard for content the user must interact with; it disappears when the cursor leaves.',
      },
      {
        guidance: true,
        description:
          'Prefer a block context over a direct <p>, heading, or link placement. Those placements work when necessary through a corrective portal, but DOM/tab order may differ.',
      },
    ],
  },
  components: [
    {
      name: 'HoverCard',
      displayName: 'Hover Card',
      description:
        'Component wrapper for hover card overlay; richer overlay triggered on hover/focus.',
      propDescriptions: {
        children: 'Trigger element; must accept ref.',
        content: 'Hover card content.',
        placement:
          "Position relative to anchor element. Logical: start/end follow the popover's inherited direction (RTL mirrors).",
        alignment:
          "Alignment along placement axis. Logical: start/end follow the popover's inherited direction (RTL mirrors).",
        delay: 'Show delay in ms.',
        hideDelay: 'Hide delay in ms.',
        focusTrigger: 'Controls when focus events trigger hover card.',
        touchTrigger:
          'Tap behavior where there is no hover. auto = tap opens unless the trigger acts (button/link/control); tap = always opens; none = never on touch. Tap-opened cards close on a tap outside.',
        isEnabled: 'Enable/disable hover + focus triggers.',
        label:
          'Accessible name for the popup. With label: named role="dialog"; without: role="group".',
        onOpenChange:
          'Callback when visibility changes; true=shown, false=hidden.',
        hasHoverIndication: 'Dashed underline on trigger element.',
        isDefaultOpen: 'Show hover card on mount. Still dismissible.',
      },
    },
  ],
};
