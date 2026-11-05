// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTooltip',
  displayName: 'useTooltip',
  group: 'Tooltip',
  keywords: ['tooltip', 'hint', 'label', 'hover', 'info', 'title', 'floating'],
  params: [
    {
      name: 'placement',
      type: "'above' | 'below' | 'start' | 'end'",
      description:
        "Position relative to the trigger. Logical: start/end resolve against the popover\'s own inherited direction (RTL mirrors in pure CSS).",
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
      description: 'Delay before showing on hover, in milliseconds.',
      default: '200',
    },
    {
      name: 'hideDelay',
      type: 'number',
      description:
        'Delay before hiding after mouse or focus leaves, in milliseconds.',
      default: '0',
    },
    {
      name: 'focusTrigger',
      type: "'auto' | 'always' | 'never'",
      description:
        'When focus should open the tooltip. auto opens when the trigger itself takes focus, or focus lands inside a trigger that is focusable at that moment, so a roving-tabindex member opens when the arrow keys reach it.',
      default: "'auto'",
    },
    {
      name: 'touchTrigger',
      type: "'auto' | 'tap' | 'none'",
      description:
        'What a tap does where there is no hover. auto opens on tap unless the trigger performs an action of its own (an aria-disabled control performs none); tap always opens (a button whose only job is revealing the tooltip); none never opens on touch.',
      default: "'auto'",
    },
    {
      name: 'isEnabled',
      type: 'boolean',
      description: 'Whether hover and focus triggers are enabled.',
      default: 'true',
    },
    {
      name: 'isOpen',
      type: 'boolean',
      description:
        'Controlled open state. true force-shows, false force-hides, undefined lets hover/focus manage visibility.',
    },
    {
      name: 'isDefaultOpen',
      type: 'boolean',
      description: 'Whether the tooltip should be shown on mount.',
      default: 'false',
    },
    {
      name: 'onShow',
      type: '() => void',
      description: 'Callback fired when the tooltip becomes visible.',
    },
    {
      name: 'onHide',
      type: '() => void',
      description: 'Callback fired when the tooltip is hidden.',
    },
  ],
  returns: [
    {
      name: 'ref',
      type: 'RefCallback<HTMLElement>',
      description:
        'Combined ref that sets both position and interaction on the same trigger element.',
    },
    {
      name: 'positionRef',
      type: 'RefCallback<HTMLElement>',
      description: 'Ref for the positioning anchor element.',
    },
    {
      name: 'interactionRef',
      type: 'RefCallback<HTMLElement>',
      description: 'Ref for the hover/focus interaction element.',
    },
    {
      name: 'anchorId',
      type: 'string',
      description: 'CSS anchor name for advanced positioning cases.',
    },
    {
      name: 'describedBy',
      type: 'string',
      description: 'ID to compose into aria-describedby on the trigger.',
    },
    {
      name: 'renderTooltip',
      type: "(children: ReactNode, props?: Omit<ContextRenderProps, 'positioning'>) => ReactNode",
      description:
        'Render function for the anchor-positioned tooltip content. The positioning opt-out is excluded: the tooltip always derives its position from placement/alignment.',
    },
    {
      name: 'show',
      type: '() => void',
      description:
        'Opens the tooltip now and keeps it open until hide(), Escape, a press outside, or focus leaving its trigger. Its text is announced once, and onShow fires. Under a controlled isOpen it only calls onShow. Does nothing while isEnabled is false.',
    },
    {
      name: 'hide',
      type: '() => void',
      description:
        'Closes the tooltip now, and onHide fires. Under a controlled isOpen it only calls onHide.',
    },
  ],
  usage: {
    description:
      'Headless hook for hover/focus-triggered tooltips. Builds on useLayer with hover intent, keyboard focus handling, and accessible aria-describedby linking. Use for custom trigger elements that need tooltip behavior without the wrapper component.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for brief text labels that describe icon buttons, truncated text, abbreviations, or compact controls.',
      },
      {
        guidance: true,
        description:
          'Prefer the Tooltip component for standard wrapping; use the hook when the trigger is not a simple child.',
      },
      {
        guidance: true,
        description:
          'For a toggle-style trigger, have your own button call show() and hide() on each press. Give it aria-describedby and aria-controls set to describedBy, and aria-expanded (true while show() holds the tooltip, false after hide() or onHide), and keep its own accessible name. For an info icon, use InfoTip instead.',
      },
      {
        guidance: false,
        description:
          'Put interactive content inside tooltips: use Popover or HoverCard instead.',
      },
    ],
  },
  relatedComponents: ['Tooltip', 'HoverCard', 'Popover'],
  relatedHooks: ['useLayer', 'useHoverCard', 'usePopover'],
  importPath: '@astryxdesign/core/Tooltip',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless hover/focus tooltip hook. Builds on useLayer w/ hover intent, keyboard focus handling, aria-describedby. Use for custom triggers without wrapper component.',
  paramDescriptions: {
    placement:
      "position relative to trigger. logical: start/end follow the popover's inherited direction (RTL mirrors).",
    alignment:
      "alignment along placement axis. logical: start/end follow the popover's inherited direction (RTL mirrors).",
    delay: 'show delay in ms.',
    hideDelay: 'hide delay after mouse/focus leave in ms.',
    focusTrigger:
      'when focus opens tooltip; auto = focus on the trigger, or inside a trigger focusable when focus arrives.',
    touchTrigger:
      'tap behavior with no hover; auto = tap unless trigger acts, tap = always, none = never.',
    isEnabled: 'whether hover/focus triggers are enabled.',
    isOpen:
      'controlled open state: true force-show, false force-hide, undefined unmanaged.',
    isDefaultOpen: 'show on mount.',
    onShow: 'fires when tooltip becomes visible.',
    onHide: 'fires when tooltip hides.',
  },
  returnDescriptions: {
    ref: 'combined position + interaction ref.',
    positionRef: 'position anchor ref.',
    interactionRef: 'hover/focus interaction ref.',
    anchorId: 'CSS anchor name.',
    describedBy: 'ID for aria-describedby.',
    renderTooltip: 'renders anchor-positioned tooltip content.',
    show: 'opens + holds until hide()/Escape/outside press/focus leave; announces once; onShow. Controlled: onShow only. No-op when disabled.',
    hide: 'closes; onHide. Controlled: onHide only.',
  },
  usage: {
    description:
      'Headless hover/focus tooltip hook. Builds on useLayer w/ hover intent, keyboard focus handling, aria-describedby. Use for custom triggers without wrapper component.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for brief text labels describing icon buttons, truncated text, abbreviations, compact controls.',
      },
      {
        guidance: true,
        description:
          'Prefer Tooltip for standard wrapping; use hook when trigger is not simple child.',
      },
      {
        guidance: true,
        description:
          'Toggle-style trigger: own button calls show()/hide() per press, sets aria-describedby + aria-controls={describedBy}, aria-expanded (true while held), keeps its own name. Info icon: use InfoTip.',
      },
      {
        guidance: false,
        description:
          'Put interactive content in tooltips: use Popover / HoverCard instead.',
      },
    ],
  },
};
