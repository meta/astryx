// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createContextMenu',
  displayName: 'createContextMenu',
  // A factory documented as a hook: listed with the utilities, beside its
  // hook, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'context menu',
    'right click',
    'long press',
    'shift f10',
    'row actions',
    'headless',
    'vanilla',
    'factory',
  ],
  params: [
    {
      name: 'element',
      type: 'HTMLElement',
      description:
        'The element that owns the menu, already on the page, such as a list row. Its markup is untouched: the menu renders outside it, so a `li` row keeps its list valid.',
      required: true,
    },
    {
      name: 'options.items',
      type: 'ContextMenuOption[]',
      description:
        "The menu's rows, as ContextMenu's `items`: actions, dividers, sections and sub-menus. Give `items` or `render`.",
    },
    {
      name: 'options.render',
      type: '(container: HTMLElement) => (() => void) | undefined',
      description:
        "Fills the menu's container with custom content in plain DOM each time the menu opens; return a cleanup, which runs as it closes. Give rows the `menuitem` role so the keys reach them.",
    },
    {
      name: 'options.label',
      type: 'string',
      description:
        'Names the menu for assistive technology, as ContextMenu\u2019s `label`.',
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
        "Opens the menu at `at`, in client coordinates, or at the element's bottom-left corner without it, and focuses its first row.",
    },
    {
      name: 'close',
      type: '() => void',
      description:
        'Closes the menu; focus returns to what had it before the menu opened.',
    },
    {
      name: 'destroy',
      type: '() => void',
      description:
        'Closes the menu and removes every listener and node the factory added. Call it when you remove the element.',
    },
  ],
  usage: {
    description:
      "Attaches ContextMenu's menu to an element that is already on the page, without React. It opens on the element's context request: a held finger or pen, a right click, Shift+F10 or the context-menu key, each once per gesture. The menu is ContextMenu's own, with its rows, keys, sub-menus and dismissal. Use the `useContextMenu` hook in React. When you render the trigger yourself, use the ContextMenu component instead.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Attach it to the element a person acts on, such as a row, so a long press, a right click and Shift+F10 all reach it.',
      },
      {
        guidance: true,
        description:
          'Keep every action reachable another way too, such as a MoreMenu on the row: a context menu is a shortcut that many people never discover.',
      },
      {
        guidance: true,
        description: 'Call `destroy` when the element leaves the page.',
      },
      {
        guidance: false,
        description:
          'Wrap the element in another element for the menu: the factory attaches to the element itself.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        description:
          'Shift+F10 or the context-menu key opens the menu on a focused element, so give the element a tab stop. The menu follows the WAI-ARIA menu pattern: focus starts on the first enabled row, Up and Down move between rows, Home and End jump to the ends, typing a letter moves to a row that starts with it, Escape closes it, and focus returns to the element.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'The menu appears as ContextMenu\u2019s does: under Reduce Motion it appears without moving, and on a touch screen it fades in.',
      },
    ],
  },
  relatedComponents: ['ContextMenu', 'MoreMenu'],
  relatedHooks: ['useContextMenu'],
  importPath: '@astryxdesign/core/ContextMenu',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Attaches ContextMenu's menu to an existing element, without React; opens on a long press, a right click or Shift+F10.",
  paramDescriptions: {
    element: 'The element that owns the menu; its markup is untouched.',
    'options.items': "ContextMenu's rows. Give items or render.",
    'options.render':
      '(container) => cleanup; fills the menu in plain DOM when it opens.',
    'options.label': 'Names the menu.',
    'options.isDisabled': 'Keeps it from opening.',
    'options.onOpenChange': '(isOpen) => void.',
    'options.presentation': "As ContextMenu's presentation.",
  },
  returnDescriptions: {
    open: '(at?) => void; at the element without a point.',
    close: '() => void; focus returns.',
    destroy: '() => void; removes every listener and node.',
  },
  usage: {
    description:
      "Opens on the element's context request; the menu is ContextMenu's. In React, use useContextMenu; to render the trigger, use ContextMenu.",
    bestPractices: [
      {
        guidance: true,
        description: 'Attach it to the row itself; call destroy on removal.',
      },
      {
        guidance: false,
        description: 'Wrap the element in another element for the menu.',
      },
    ],
  },
};
