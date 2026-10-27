// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useContextMenu',
  displayName: 'useContextMenu',
  group: 'Utilities',
  keywords: [
    'context menu',
    'right click',
    'long press',
    'shift f10',
    'row actions',
    'headless',
    'hook',
  ],
  params: [
    {
      name: 'ref',
      type: 'RefObject<HTMLElement | null>',
      description:
        'A ref to the element that owns the menu, such as a list row. Its markup is untouched: the menu renders outside it.',
      required: true,
    },
    {
      name: 'options.items',
      type: 'ContextMenuOption[]',
      description:
        "The menu's rows, as ContextMenu's `items`. Give `items` or `menuContent`.",
    },
    {
      name: 'options.menuContent',
      type: 'ReactNode',
      description:
        "Custom menu content as JSX, as ContextMenu's `menuContent`: ContextMenuItem and its siblings work inside it.",
    },
    {
      name: 'options.label',
      type: 'string',
      description: 'Names the menu for assistive technology.',
    },
    {
      name: 'options.isDisabled',
      type: 'boolean',
      description:
        'Keeps the menu from opening: the element then makes no request, and the browser keeps its own menu.',
    },
    {
      name: 'options.onOpenChange',
      type: '(isOpen: boolean) => void',
      description:
        'Called with true when the menu opens and false when it closes.',
    },
    {
      name: 'options.presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description:
        'Where the menu appears, as ContextMenu\u2019s `presentation`.',
    },
  ],
  returns: [
    {
      name: 'open',
      type: '(at?: {x: number, y: number}) => void',
      description:
        "Opens the menu at `at`, in client coordinates, or at the element's bottom-left corner without it.",
    },
    {
      name: 'close',
      type: '() => void',
      description: 'Closes the menu.',
    },
  ],
  usage: {
    description:
      'The React wrapper over `createContextMenu`: it attaches the same menu to the element its ref points at, and unmounting removes it. Use it to give an element you already render, such as a list row, a context menu without wrapping it. When a wrapper element is fine, use the ContextMenu component.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep every action reachable another way too, such as a MoreMenu on the row.',
      },
      {
        guidance: false,
        description: 'Attach two menus to one element.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        description:
          'As createContextMenu: Shift+F10 or the context-menu key opens the menu on a focused element, focus starts on the first enabled row, the arrow keys, Home, End and typing move between rows, Escape closes it, and focus returns to the element.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description: 'The menu appears as ContextMenu\u2019s does.',
      },
    ],
  },
  relatedComponents: ['ContextMenu', 'MoreMenu'],
  relatedHooks: ['createContextMenu'],
  importPath: '@astryxdesign/core/ContextMenu',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "React wrapper over createContextMenu: ContextMenu's menu on an element you render, without a wrapper.",
  paramDescriptions: {
    ref: 'The element that owns the menu.',
    'options.items': "ContextMenu's rows. Give items or menuContent.",
    'options.menuContent': 'Custom content as JSX.',
    'options.label': 'Names the menu.',
    'options.isDisabled': 'Keeps it from opening.',
    'options.onOpenChange': '(isOpen) => void.',
    'options.presentation': "As ContextMenu's presentation.",
  },
  returnDescriptions: {
    open: '(at?) => void.',
    close: '() => void.',
  },
  usage: {
    description:
      'Attaches the same menu as createContextMenu; unmounting removes it.',
    bestPractices: [
      {guidance: true, description: 'Keep each action reachable another way.'},
      {guidance: false, description: 'Attach two menus to one element.'},
    ],
  },
};
