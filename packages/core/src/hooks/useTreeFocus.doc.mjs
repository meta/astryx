// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTreeFocus',
  displayName: 'useTreeFocus',
  keywords: ['tree', 'treeview', 'focus', 'keyboard', 'navigation', 'arrow', 'expand', 'collapse', 'roving', 'tabindex', 'a11y', 'wai-aria', 'apg'],
  params: [
    {
      name: 'options',
      type: 'UseTreeFocusOptions',
      description: 'Configuration object for tree focus behavior.',
      required: false,
    },
    {
      name: 'options.itemSelector',
      type: 'string',
      description: 'Selector for visible treeitems within the tree, in DOM order.',
      default: "'[role=\"treeitem\"]'",
      required: false,
    },
    {
      name: 'options.isItemDisabled',
      type: '(item: HTMLElement) => boolean',
      description: 'Predicate for whether a treeitem is disabled and must be skipped during navigation. Defaults to reading `data-tree-disabled` / `aria-disabled`.',
      required: false,
    },
    {
      name: 'options.getLevel',
      type: '(item: HTMLElement) => number',
      description: 'Reads the 1-based nesting level of a treeitem. Defaults to the `aria-level` attribute.',
      required: false,
    },
    {
      name: 'options.onToggleExpand',
      type: '(id: string) => void',
      description: 'Called to expand/collapse the treeitem with the given id (ArrowRight on a collapsed parent, ArrowLeft on an expanded parent, Enter/Space on a parent without its own action).',
      required: false,
    },
    {
      name: 'options.onActivate',
      type: '(item: HTMLElement, id: string | undefined) => boolean | void',
      description: 'Called when Enter/Space activates a treeitem. Return true when handled; return false/undefined to let the hook fall back to toggling expansion.',
      required: false,
    },
    {
      name: 'options.onActiveChange',
      type: '(id: string | undefined) => void',
      description: 'Notified when the hook moves focus to a treeitem. Consumers use this to move a single roving tab stop.',
      required: false,
    },
    {
      name: 'options.hasRovingTabIndex',
      type: 'boolean',
      description: 'When true, the hook owns a single roving tab stop across the visible treeitems (stamps tabindex 0/-1, repairs on mount, moves with navigation). Preserves an existing tabindex="0" seed on mount. Attach the returned `handleFocus` to keep the stop in sync after clicks.',
      default: 'false',
      required: false,
    },
    {
      name: 'options.typeahead',
      type: 'boolean',
      description: 'Whether typeahead (jump to next item whose text starts with the typed characters, ignoring case, accents, the stroked letters đ ł ø ħ ŧ ƀ and Turkish ı/İ in every locale) is enabled.',
      default: 'true',
      required: false,
    },
  ],
  returns: [
    {
      name: 'treeRef',
      type: 'React.RefObject<HTMLElement | null>',
      description: 'Ref to attach to the tree container element (role="tree").',
    },
    {
      name: 'handleKeyDown',
      type: '(e: React.KeyboardEvent) => void',
      description: 'Key down handler to attach to the tree container.',
    },
    {
      name: 'handleFocus',
      type: '(e: React.FocusEvent) => void',
      description: 'Focus handler to attach to the container\'s onFocus. Keeps the roving tab stop in sync when hasRovingTabIndex is enabled; a no-op otherwise, so always safe to attach.',
    },
    {
      name: 'focusFirst',
      type: '() => void',
      description: 'Focus the first enabled visible treeitem.',
    },
    {
      name: 'focusLast',
      type: '() => void',
      description: 'Focus the last enabled visible treeitem.',
    },
  ],
  usage: {
    description:
      'Manages roving-tabindex focus and the WAI-ARIA tree keyboard model. ArrowUp/ArrowDown/Home/End roam linearly over the visible treeitems (skipping disabled ones), while ArrowRight/ArrowLeft carry tree semantics (expand/collapse, move to first-child/parent). Enter/Space activate, and printable characters trigger typeahead.',
    bestPractices: [
      { guidance: true, description: 'Use for hierarchical tree widgets: wire onToggleExpand to your expansion state and onActiveChange to a single roving tab stop.' },
      { guidance: true, description: 'Attach both treeRef and handleKeyDown to the role="tree" container element.' },
      { guidance: false, description: 'Use for linear lists (prefer useListFocus) or 2D grids (prefer useGridFocus); those traversals differ from a tree.' },
    ],
  },
  relatedComponents: ['TreeList'],
  relatedHooks: ['useListFocus', 'useGridFocus', 'useFocusTrap'],
  importPath: '@astryxdesign/core/hooks',
  category: 'focus',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Manages roving-tabindex focus + WAI-ARIA tree keyboard model. ArrowUp/Down/Home/End roam linearly over visible treeitems (skip disabled); ArrowRight/Left carry tree semantics (expand/collapse, move to first-child/parent). Enter/Space activate; printable chars trigger typeahead.',
  paramDescriptions: {
    options: 'config for tree focus behavior.',
    'options.itemSelector': 'selector for visible treeitems in DOM order.',
    'options.isItemDisabled': 'predicate: is treeitem disabled (skipped in nav). Defaults to data-tree-disabled / aria-disabled.',
    'options.getLevel': 'reads 1-based nesting level. Defaults to aria-level attr.',
    'options.onToggleExpand': 'expand/collapse treeitem by id (ArrowRight collapsed parent, ArrowLeft expanded parent, Enter/Space parent w/o own action).',
    'options.onActivate': 'called on Enter/Space activation. Return true when handled; else hook falls back to toggling expansion.',
    'options.onActiveChange': 'notified when focus moves to a treeitem. Use to move a single roving tab stop.',
    'options.hasRovingTabIndex': 'hook owns a single roving tab stop (stamps tabindex 0/-1, repairs on mount, moves w/ nav). Preserves an existing tabindex="0" seed. Attach handleFocus to sync after clicks.',
    'options.typeahead': 'enable typeahead (jump to next item whose text starts with typed chars, ignoring case, accents, stroked letters + Turkish ı/İ).',
  },
  returnDescriptions: {
    treeRef: 'ref to attach to tree container (role="tree").',
    handleKeyDown: 'key down handler for tree container.',
    handleFocus: 'onFocus handler; keeps roving tab stop in sync when hasRovingTabIndex on (no-op otherwise).',
    focusFirst: 'focus first enabled visible treeitem.',
    focusLast: 'focus last enabled visible treeitem.',
  },
  usage: {
    description:
      'Manages roving-tabindex focus + WAI-ARIA tree keyboard model. ArrowUp/Down/Home/End roam linearly over visible treeitems (skip disabled); ArrowRight/Left carry tree semantics (expand/collapse, move to first-child/parent). Enter/Space activate; printable chars trigger typeahead.',
    bestPractices: [
      { guidance: true, description: 'Use for hierarchical tree widgets: wire onToggleExpand to expansion state + onActiveChange to a single roving tab stop.' },
      { guidance: true, description: 'Attach both treeRef + handleKeyDown to role="tree" container.' },
      { guidance: false, description: 'Use for linear lists (prefer useListFocus) or 2D grids (prefer useGridFocus).' },
    ],
  },
};
