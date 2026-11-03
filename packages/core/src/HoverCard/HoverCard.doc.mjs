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
          description:
            'The trigger. A single string or number is wrapped in a focusable inline span. Text that reaches HoverCard in several pieces, such as `Edited {when}`, gets no trigger, so pass one string, such as a template literal, or wrap it in a focusable element. With element children, HoverCard wires the first element, so that element does not need to accept a ref.',
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
            'What a tap does where there is no hover. auto opens on tap unless the trigger performs an action of its own (a button, link, or form control), whose tap belongs to the control; an aria-disabled control performs none, so a tap on it opens its reason. tap always opens. none never opens on touch. A tap-opened card is dismissed by a tap outside it.',
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
          description:
            'Shows a dashed underline on a text trigger. auto shows it when children is a single string or number. It has no effect on an element trigger, which keeps its own styling.',
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
          description:
            'Controlled open state. true holds the card open. false holds it closed against hover, but focus on the trigger still opens it. A controlled card answers Escape by calling onOpenChange(false) without closing; it closes when you set isOpen to false, and focus inside the card then returns to the trigger.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for the card surface, the element that carries the hover-card theme target.',
        },
        {
          name: 'className',
          type: 'string',
          description:
            'Class name added to the card surface, beside the hover-card target class.',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: 'Inline styles for the card surface.',
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
          description:
            '触发元素。单个字符串或数字会被包裹在可聚焦的内联 span 中。分成多段到达的文本（例如 `Edited {when}`）不会得到触发器，请传入单个字符串（例如模板字符串）或用可聚焦元素包裹。传入元素时，HoverCard 连接第一个元素，因此该元素无需接受 ref。',
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
            '在没有悬停的触摸设备上，轻点的行为。auto：轻点即打开，除非触发元素本身会执行操作（按钮、链接、表单控件），此时轻点归该控件所有；设置了 aria-disabled 的控件不执行操作，因此轻点它会显示其原因。tap：始终轻点打开。none：触摸永不打开。轻点打开的卡片可通过点击卡片外部关闭。',
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
          description:
            '在文本触发元素上显示虚线下划线。auto：当 children 是单个字符串或数字时显示。对元素触发器无效，元素保留自身样式。',
          default: "'auto'",
        },
        {
          name: 'isDefaultOpen',
          type: 'boolean',
          description: '是否在挂载时显示悬浮卡片。仍然可以关闭。',
        },
        {
          name: 'isOpen',
          type: 'boolean',
          description:
            '受控的打开状态。true 保持卡片打开。false 使悬停无法打开卡片，但触发元素获得焦点时仍会打开。受控卡片响应 Escape 时调用 onOpenChange(false) 而不关闭；将 isOpen 设为 false 时关闭，此时卡片内的焦点返回触发元素。',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            '卡片表面（带有 hover-card 主题目标的元素）的 StyleX 样式。',
        },
        {
          name: 'className',
          type: 'string',
          description: '添加到卡片表面的类名，与 hover-card 目标类名并列。',
        },
        {
          name: 'style',
          type: 'CSSProperties',
          description: '卡片表面的内联样式。',
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
        children:
          'Trigger. A single string/number is wrapped in a focusable inline span; text in several pieces (`Edited {when}`) gets no trigger; pass one string or a focusable element. With elements, the first element is wired (no ref needed).',
        content: 'Hover card content.',
        placement:
          "Position relative to anchor element. Logical: start/end follow the popover's inherited direction (RTL mirrors).",
        alignment:
          "Alignment along placement axis. Logical: start/end follow the popover's inherited direction (RTL mirrors).",
        delay: 'Show delay in ms.',
        hideDelay: 'Hide delay in ms.',
        focusTrigger: 'Controls when focus events trigger hover card.',
        touchTrigger:
          'Tap behavior where there is no hover. auto = tap opens unless the trigger acts (button/link/control; an aria-disabled control does not act); tap = always opens; none = never on touch. Tap-opened cards close on a tap outside.',
        isEnabled: 'Enable/disable hover + focus triggers.',
        label:
          'Accessible name for the popup. With label: named role="dialog"; without: role="group".',
        onOpenChange:
          'Callback when visibility changes; true=shown, false=hidden.',
        hasHoverIndication:
          'Dashed underline on a text trigger. auto = single string/number children; no effect on element triggers.',
        isDefaultOpen: 'Show hover card on mount. Still dismissible.',
        isOpen:
          'Controlled open state. true holds open; false holds closed against hover, but trigger focus still opens it. Escape calls onOpenChange(false) without closing; setting false returns focus inside the card to the trigger.',
        xstyle: 'StyleX styles for the card surface (hover-card target).',
        className: 'Class added to the card surface.',
        style: 'Inline styles for the card surface.',
      },
    },
  ],
};
