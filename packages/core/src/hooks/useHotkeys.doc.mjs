// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useHotkeys',
  displayName: 'useHotkeys',
  keywords: ['hotkey', 'shortcut', 'keyboard', 'keydown', 'command', 'palette', 'mod', 'cmd', 'ctrl', 'kbd'],
  params: [
    {
      name: 'hotkeys',
      type: 'Hotkey[]',
      description:
        'Shortcut registrations. Each entry: `{ keys, onPress, allowInInputs?, isDisabled? }`. `keys` is a "+"-separated combo like "mod+k", "shift+/", "escape"; "mod" is ⌘ on macOS and Ctrl elsewhere. `onPress` receives the KeyboardEvent after preventDefault(). `allowInInputs` (default false) lets the hotkey fire while typing in inputs/textareas/selects/contenteditable. `isDisabled` temporarily disables the entry.',
      required: true,
    },
  ],
  returns: [],
  usage: {
    description:
      'Registers global keyboard shortcuts with a single window keydown listener per hook instance. Handlers live in a ref, so re-renders never re-subscribe. Skips events from typing targets (input, textarea, select, contenteditable) unless allowInInputs, skips defaultPrevented events, and calls preventDefault() on match. SSR-safe.',
    bestPractices: [
      { guidance: true, description: 'Use for app-level shortcuts like command palettes (mod+k), help overlays (shift+/), and navigation keys.' },
      { guidance: true, description: 'Pair with the Kbd component to display the same combo you register; both resolve "mod" per platform identically.' },
      { guidance: true, description: 'Use isDisabled to suspend shortcuts while a modal or wizard owns the keyboard, instead of unmounting the hook.' },
      { guidance: false, description: 'Use for focus-scoped keyboard navigation inside a widget; use useListFocus or useGridFocus instead.' },
    ],
  },
  relatedComponents: ['Kbd'],
  relatedHooks: ['useListFocus', 'useGridFocus'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Global keyboard shortcuts w/ one window keydown listener per hook instance. Handlers kept in ref; re-renders never re-subscribe. Skips typing targets (input/textarea/select/contenteditable) unless allowInInputs, skips defaultPrevented and IME key events (even with allowInInputs), preventDefault() on match. "mod" = ⌘ on macOS, Ctrl elsewhere. SSR-safe.',
  paramDescriptions: {
    hotkeys:
      'array of { keys, onPress, allowInInputs?, isDisabled? }. keys = "+"-separated combo ("mod+k", "shift+/", "escape").',
  },
  usage: {
    description:
      'Global keyboard shortcuts w/ one window keydown listener per hook instance. Handlers kept in ref; re-renders never re-subscribe. Skips typing targets unless allowInInputs, skips defaultPrevented and IME key events (even with allowInInputs), preventDefault() on match. SSR-safe.',
    bestPractices: [
      { guidance: true, description: 'Use for app-level shortcuts: command palettes (mod+k), help overlays (shift+/), navigation keys.' },
      { guidance: true, description: 'Pair w/ Kbd component to display same combo registered; both resolve "mod" per platform identically.' },
      { guidance: true, description: 'Use isDisabled to suspend shortcuts while modal/wizard owns keyboard, instead of unmounting hook.' },
      { guidance: false, description: 'Use for focus-scoped keyboard nav inside widget; use useListFocus / useGridFocus instead.' },
    ],
  },
};
