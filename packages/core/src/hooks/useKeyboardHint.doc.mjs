// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useKeyboardHint',
  displayName: 'useKeyboardHint',
  keywords: ['keyboard', 'hint', 'arrow', 'navigation', 'roving', 'tabindex', 'focus', 'discoverability', 'toolbar', 'tabs', 'segmented', 'affordance', 'a11y'],
  params: [
    {
      name: 'options',
      type: 'UseKeyboardHintOptions',
      description: 'Configuration object for the keyboard hint.',
      required: false,
    },
    {
      name: 'options.orientation',
      type: "'horizontal' | 'vertical' | 'both'",
      description: 'Which arrow-key axis the composite navigates, controlling which arrow icons the hint shows (← → for horizontal, ↑ ↓ for vertical, all four for both).',
      default: "'horizontal'",
      required: false,
    },
    {
      name: 'options.dismissAfterMs',
      type: 'number',
      description: 'Milliseconds before the hint dismisses itself after appearing. Leave it unset: by default the hint stays until an arrow press, Escape, or blur. A time limit can remove the hint before someone has read it (WCAG 1.4.13).',
      default: 'undefined (no time limit)',
      required: false,
    },
    {
      name: 'options.isEnabled',
      type: 'boolean',
      description: 'Whether the hint is enabled. Set to false to suppress it for a specific instance (e.g. a disabled or read-only widget).',
      default: 'true',
      required: false,
    },
  ],
  returns: [
    {
      name: 'hintElement',
      type: 'ReactNode',
      description: 'The popover hint element to render inside the composite container (as the last child). Portals to the top layer via popover="manual", renders arrow keys with Kbd, and manages its own visibility; render it unconditionally.',
    },
    {
      name: 'onFocus',
      type: '(e: React.FocusEvent) => void',
      description: 'Attach to the container onFocus. Shows the hint on the first keyboard-focus (:focus-visible) entry from outside the composite.',
    },
    {
      name: 'onBlur',
      type: '(e: React.FocusEvent) => void',
      description: 'Attach to the container onBlur. Hides the hint when focus leaves the composite entirely, and re-anchors when focus moves within.',
    },
    {
      name: 'onKeyDown',
      type: '(e: React.KeyboardEvent) => void',
      description: 'Attach to the container onKeyDown. Dismisses the hint on the first arrow press (the user has discovered the interaction). Never prevents default or stops propagation.',
    },
  ],
  usage: {
    description:
      'Shows an ephemeral "← → to navigate" hint anchored to the focused item the first time a roving-tabindex composite (Toolbar, TabList, SegmentedControl, etc.) receives keyboard focus. It teaches sighted keyboard users that arrow keys move within the group. The hint renders arrow keys with Kbd in the top layer (popover="manual") and is CSS-anchor-positioned to the focused element, so overflow containers never clip it. It stays until the first arrow press, Escape, or blur, and does not re-show for that instance. Escape closes only the hint, through the shared layer dismissal stack, and keeps focus where it is. Toolbar, TabList, and SegmentedControl wire this in automatically; reach for the hook directly only when building a custom roving-tabindex widget.',
    bestPractices: [
      { guidance: true, description: 'Compose the returned onFocus/onKeyDown with your existing focus handlers rather than replacing them: call onKeyDown first (it only dismisses, never prevents), then your navigation handler.' },
      { guidance: true, description: 'Render hintElement as the last child of the composite container; it is position:fixed in the top layer and aria-hidden, so it never affects layout or the accessibility tree.' },
      { guidance: true, description: 'Match orientation to the arrow keys your widget actually responds to so the hint shows the correct icons.' },
      { guidance: false, description: 'Use for single controls or widgets without roving-tabindex navigation; the hint only makes sense where arrows move focus within a group.' },
    ],
  },
  relatedComponents: ['Toolbar', 'TabList', 'SegmentedControl'],
  relatedHooks: ['useListFocus', 'useGridFocus', 'useTreeFocus'],
  importPath: '@astryxdesign/core/hooks',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Ephemeral "← → to navigate" hint anchored to the focused item on first keyboard focus of a roving-tabindex composite (Toolbar/TabList/SegmentedControl). Teaches sighted keyboard users that arrows move within the group. Kbd-rendered arrows in a top-layer popover="manual", CSS-anchor-positioned (never clipped by overflow), aria-hidden. Stays until first arrow press, Escape, or blur; never re-shows for that instance.',
  paramDescriptions: {
    options: 'config for the keyboard hint.',
    'options.orientation': "arrow axis: 'horizontal' (← →), 'vertical' (↑ ↓), 'both' (all four). Controls shown icons.",
    'options.dismissAfterMs': 'ms before self-dismiss. Leave unset (default: no time limit, WCAG 1.4.13).',
    'options.isEnabled': 'whether the hint is enabled; false suppresses it (e.g. disabled/read-only widget).',
  },
  returnDescriptions: {
    hintElement: 'popover hint to render as last child of the container. Kbd-rendered arrows, top-layer, self-managing; render unconditionally.',
    onFocus: 'container onFocus: shows hint on first :focus-visible entry from outside.',
    onBlur: 'container onBlur: hides on leaving the composite; re-anchors on internal moves.',
    onKeyDown: 'container onKeyDown: dismisses on first arrow press. Never prevents default.',
  },
  usage: {
    description:
      'Ephemeral "← → to navigate" hint on first keyboard focus of a roving-tabindex composite. Top-layer anchored popover, aria-hidden. Stays until first arrow press, Escape, or blur; no re-show. Toolbar/TabList/SegmentedControl wire it in automatically.',
    bestPractices: [
      { guidance: true, description: 'Compose returned onFocus/onKeyDown with existing handlers (call onKeyDown first; it only dismisses).' },
      { guidance: true, description: 'Render hintElement as last child; top-layer + aria-hidden, no layout/a11y impact.' },
      { guidance: true, description: 'Match orientation to the arrows the widget responds to.' },
      { guidance: false, description: 'Use for single controls / non-roving widgets.' },
    ],
  },
};
