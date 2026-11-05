// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Shortcut',
    required: true,
    description:
      'Group that presents the complete keyboard shortcut and its accessible name.',
  },
  {
    name: 'Key badge',
    required: true,
    description: 'Painted key badge rendered once for each key in the shortcut.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Kbd',
  displayName: 'Kbd',
  category: 'Content',
  keywords: ["kbd","keyboard","shortcut","hotkey","keybinding","keystroke","keycombo","modifier","accelerator"],
  props: [
    {
      name: 'keys',
      type: 'string',
      description:
        'Keyboard shortcut string. Use "+" to separate keys. Special keys: mod (Cmd on Mac), ctrl, alt, shift, enter, backspace, escape, tab, up, down, left, right, plus. Aliases: esc for escape and return for enter.',
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description:
        'CSS class name for the root element. Prefer xstyle for styling; className is provided for integration with non-StyleX systems.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        'Inline styles for the root element. Prefer xstyle for styling; inline styles bypass StyleX optimization.',
    },
  ],
  theming: {
    targets: [{className: 'astryx-kbd'}],
  },
  usage: {
    anatomy,
    description: 'Renders a keyboard shortcut as styled key badges. Use Kbd in tooltips, menus, and help text to show key combinations.',
    bestPractices: [
      { guidance: true, description: 'Place shortcuts near the action they trigger: in a tooltip, menu item, or inline instruction.' },
      { guidance: true, description: 'Use mod instead of ctrl or cmd; it automatically adapts to the user\'s platform.' },
      { guidance: false, description: 'Use Kbd as the only way to discover an action; shortcuts should supplement visible controls, not replace them.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'Kbd',
  displayName: 'Kbd',
  props: [
    {
      name: 'keys',
      type: 'string',
      description:
        '键盘快捷键字符串。使用 "+" 分隔各按键。特殊按键：mod（Mac 上为 Cmd）、ctrl、alt、shift、enter、backspace、escape、tab、up、down、left、right、plus。别名：esc 等同于 escape，return 等同于 enter。',
      required: true,
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（边距、定位、尺寸）。必须是 stylex.create() 的值，这不能是 style={{}} 这样的内联样式对象。',
    },
    {
      name: 'className',
      type: 'string',
      description:
        '根元素的 CSS 类名。建议优先使用 xstyle 进行样式设置，className 用于与非 StyleX 系统的集成。',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description:
        '根元素的内联样式。建议优先使用 xstyle 进行样式设置，内联样式会绕过 StyleX 优化。',
    },
  ],
  theming: {
    targets: [{className: 'astryx-kbd'}],
  },
  usage: {
    anatomy,
    description: 'Renders a keyboard shortcut as styled key badges. Use Kbd in tooltips, menus, and help text to show key combinations.',
    bestPractices: [
      { guidance: true, description: 'Place shortcuts near the action they trigger: in a tooltip, menu item, or inline instruction.' },
      { guidance: true, description: 'Use mod instead of ctrl or cmd; it automatically adapts to the user\'s platform.' },
      { guidance: false, description: 'Use Kbd as the only way to discover an action; shortcuts should supplement visible controls, not replace them.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Renders keyboard shortcut as styled key badges. Use in tooltips, menus + help text to show key combinations.',
  usage: {
    anatomy,
    description: 'Renders a keyboard shortcut as styled key badges. Use Kbd in tooltips, menus, and help text to show key combinations.',
    bestPractices: [
      { guidance: true, description: 'Place shortcuts near the action they trigger: in a tooltip, menu item, or inline instruction.' },
      { guidance: true, description: 'Use mod instead of ctrl or cmd; it automatically adapts to the user\'s platform.' },
      { guidance: false, description: 'Use Kbd as the only way to discover an action; shortcuts should supplement visible controls, not replace them.' },
    ],
  },
  propDescriptions: {
    keys: 'Shortcut string. "+" separates keys. Special: mod (Cmd on Mac), ctrl, alt, shift, enter, backspace, escape, tab, up, down, left, right, plus. Aliases: esc for escape, return for enter.',
    xstyle: 'StyleX styles for layout customization. Must be stylex.create() value.',
    className: 'CSS class for root element. Prefer xstyle; className for non-StyleX integration.',
    style: 'Inline styles for root element. Prefer xstyle; inline styles bypass StyleX optimization.',
  },
};
