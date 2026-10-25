// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useMenuPress',
  displayName: 'useMenuPress',
  keywords: [
    'menu',
    'press',
    'release',
    'touch',
    'finger',
    'drag',
    'highlight',
    'pointer',
    'gesture',
    'listbox',
    'macos',
    'ios',
  ],
  params: [
    {
      name: 'options',
      type: 'UseMenuPressOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.menuRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'The menu or listbox root — the surface whose rows a press picks from.',
      required: true,
    },
    {
      name: 'options.itemSelector',
      type: 'string',
      description:
        'Selector matching the ENABLED rows. A pointer over anything else inside the menu (a divider, a heading, a disabled row) highlights nothing.',
      required: true,
    },
    {
      name: 'options.triggerRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        'The control that opens the menu, when a press may start there.',
    },
    {
      name: 'options.onTriggerPress',
      type: '(pointerType: MenuPressPointerType) => boolean',
      description:
        'A mouse pressed the trigger, or a finger rested on it for the long-press delay: open the menu under the held pointer and return whether it opened. Return false when the press closed an open menu instead.',
    },
    {
      name: 'options.onHighlight',
      type: '(row: HTMLElement | null) => void',
      description:
        'Move the highlight; null clears it. Defaults to moving DOM focus with preventScroll onto the row, and onto the menu root when there is no row; after a pointer press that focus does not match :focus-visible. A picker that highlights through aria-activedescendant supplies its own.',
    },
    {
      name: 'options.onActivate',
      type: '(row: HTMLElement, release: PointerEvent) => void',
      description:
        'Act on the row under the release. Defaults to dispatching a click on the row that carries the release button and modifier keys.',
    },
    {
      name: 'options.onDismiss',
      type: '() => void',
      description:
        'A MOUSE was released outside the menu with nothing acting: close it. A finger released outside leaves the menu open, so this is never called then.',
    },
    {
      name: 'options.getScroller',
      type: '() => HTMLElement | null',
      description:
        'The element to scroll while a tracked pointer rests near its top or bottom edge. Defaults to the menu root when it overflows.',
    },
    {
      name: 'options.longPressDelayMs',
      type: 'number',
      description:
        'How long a finger must rest on the trigger before the menu opens under it.',
      default: '500',
    },
    {
      name: 'options.isEnabled',
      type: 'boolean',
      description: 'Whether the model is live.',
      default: 'true',
    },
  ],
  returns: [
    {
      name: 'menuProps',
      type: '{onPointerDown; "data-astryx-menu-press": ""}',
      description:
        'Spread onto the menu root. Claims presses that begin inside it and marks the root as carrying the press model.',
    },
    {
      name: 'triggerProps',
      type: '{onPointerDown; onContextMenu}',
      description:
        'Spread onto the trigger: a mouse press opens the menu at once; a finger held for the delay opens it with the finger still down.',
    },
    {
      name: 'isTriggerClickFromPress',
      type: '() => boolean',
      description:
        'Whether the click reaching the trigger belongs to the gesture that just pressed it. That press already opened or closed the menu, so the click must neither toggle nor reopen.',
    },
    {
      name: 'cancel',
      type: '() => void',
      description:
        'End the gesture in flight with nothing acting, for when the menu closes under it.',
    },
  ],
  usage: {
    description:
      'The press model of macOS and iOS menus, for any pointer: the row under the pointer when it is RELEASED is the row that acts, the highlight follows the pointer while it is held, a mouse opens the menu on press and can drag straight into it, and a finger held on the trigger opens it with the finger still down. The pointer is tracked at document level by pointerId, so a finger that slid off the row it landed on is still followed; the click the browser reports at the end of a touch, aimed at the row where the touch began, is swallowed so nothing acts twice. DropdownMenu, ContextMenu, DropdownMenuSubMenu, Selector and the menu bottom sheet already mount it; reach for it directly only when building a menu-like surface of your own.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass a selector for ENABLED rows only, so a disabled row or a divider under the pointer clears the highlight instead of lighting up.',
      },
      {
        guidance: true,
        description:
          'Let the default highlight move focus in a menu; supply onHighlight only for a listbox that must keep focus on its combobox and highlight through aria-activedescendant.',
      },
      {
        guidance: true,
        description:
          'Declare touch-action on the menu root: pinch-zoom when its rows fit, pan-y pinch-zoom when it scrolls, so the browser — not the hook — decides when a finger is scrolling, and a two-finger pinch still zooms the page.',
      },
      {
        guidance: false,
        description:
          'Act on a row from its own pointerdown or pointerup handler as well; the hook already activates the row under the release, and a second path acts twice.',
      },
      {
        guidance: false,
        description:
          'Read a row click with detail 0 as a keyboard activation; the hook dispatches its pointer activation with detail 0 too. Use isMenuPressActivation() to tell them apart.',
      },
    ],
  },
  relatedComponents: ['DropdownMenu', 'ContextMenu', 'Selector'],
  relatedHooks: ['useListFocus', 'useTypeahead', 'useLongPress'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'macOS/iOS menu press model for any pointer: the row under the RELEASE acts, the highlight follows a held pointer, a mouse opens on press and drags in, a held finger opens with the finger down. Document-level pointerId tracking; the browser stray click after a touch is swallowed. Already mounted by DropdownMenu / ContextMenu / DropdownMenuSubMenu / Selector / menu bottom sheet.',
  paramDescriptions: {
    options: 'config.',
    'options.menuRef': 'menu / listbox root.',
    'options.itemSelector': 'selector for ENABLED rows; anything else clears.',
    'options.triggerRef': 'the control that opens the menu.',
    'options.onTriggerPress':
      'mouse press / held finger on trigger: open, return whether it opened (false = the press closed it).',
    'options.onHighlight':
      'move highlight (null clears); default = focus w/ preventScroll (not :focus-visible after a pointer press), menu root when no row.',
    'options.onActivate':
      'act on row under release; default = dispatch click w/ release button + modifiers.',
    'options.onDismiss': 'MOUSE released outside: close. Finger: never called.',
    'options.getScroller':
      'element to edge-autoscroll while tracking; default = menu root if it overflows.',
    'options.longPressDelayMs': 'finger hold before open, ms.',
    'options.isEnabled': 'false = inert.',
  },
  returnDescriptions: {
    menuProps: 'spread on menu root (claims presses, marks the root).',
    triggerProps: 'spread on trigger (press-open, held-finger open).',
    isTriggerClickFromPress:
      'true = the trigger click belongs to the press that already opened / closed; ignore it.',
    cancel: 'end the gesture w/o acting.',
  },
  usage: {
    description:
      'Release decides; highlight follows the pointer; mouse press-opens; held finger opens. Use directly only for a menu-like surface of your own.',
    bestPractices: [
      {
        guidance: true,
        description: 'itemSelector = ENABLED rows only.',
      },
      {
        guidance: true,
        description:
          'Default focus highlight in menus; onHighlight only for aria-activedescendant listboxes.',
      },
      {
        guidance: true,
        description:
          'touch-action on the root: pinch-zoom when rows fit, pan-y pinch-zoom when it scrolls.',
      },
      {
        guidance: false,
        description:
          'Also act on pointerdown / pointerup in the row; the hook already acts on release.',
      },
      {
        guidance: false,
        description:
          'Treat a detail-0 row click as keyboard; the hook dispatches w/ detail 0 too — use isMenuPressActivation().',
      },
    ],
  },
};
