// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTableColumnSettingsState',
  displayName: 'useTableColumnSettingsState',
  keywords: [
    'table',
    'columns',
    'visibility',
    'order',
    'column settings',
    'toggle',
    'reset',
    'headless',
    'picker',
    'checkbox',
    'toolbar',
    'plugin',
  ],
  params: [
    {
      name: 'config',
      type: 'UseTableColumnSettingsStateConfig<TColumnKey>',
      description:
        'The column universe, the active keys and their change handler, plus the reset default.',
      required: true,
    },
    {
      name: 'config.columns',
      type: 'ReadonlyArray<ColumnSettingsOption<TColumnKey>>',
      description:
        'All available columns with the labels a picker UI shows. Entries with isAlwaysVisible true can never be toggled off.',
      required: true,
    },
    {
      name: 'config.activeColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'The currently visible column keys, in display order — the array order is the column order.',
      required: true,
    },
    {
      name: 'config.onChangeActiveColumnKeys',
      type: '(keys: ReadonlyArray<TColumnKey>) => void',
      description:
        'Called when a toggle, reorder or reset changes the set. The consumer owns the state; this hook only computes operations.',
      required: true,
    },
    {
      name: 'config.defaultColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'The set resetToDefault restores. When omitted, reset shows every column.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'columnSettingsConfig',
      type: 'UseTableColumnSettingsStateConfig<TColumnKey>',
      description:
        'Ready-to-use config handed straight to useTableColumnSettings — the state hook and the plugin hook pair through this object.',
    },
    {
      name: 'activeColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'Pass-through of the currently active keys, in display order.',
    },
    {
      name: 'toggleColumn',
      type: '(key: TColumnKey) => void',
      description:
        'Remove the key if active, append it at the end if not. No-op for isAlwaysVisible columns.',
    },
    {
      name: 'isColumnActive',
      type: '(key: TColumnKey) => boolean',
      description:
        'Whether the column is currently visible — drive the picker checkbox state from it.',
    },
    {
      name: 'isColumnToggleable',
      type: '(key: TColumnKey) => boolean',
      description:
        'False for isAlwaysVisible columns — drive the checkbox disabled state from it.',
    },
    {
      name: 'showAllColumns',
      type: '() => void',
      description: 'Activate every column.',
    },
    {
      name: 'resetToDefault',
      type: '() => void',
      description:
        'Restore defaultColumnKeys, or all columns when no default was given.',
    },
    {
      name: 'setActiveColumnKeys',
      type: '(keys: string[]) => void',
      description:
        'Set the active set from a plain key list (an onChange for list-based pickers), re-adding any isAlwaysVisible column that was dropped.',
    },
  ],
  usage: {
    description:
      'Headless state for which Table columns are visible and in what order, with toggle and reset operations, plus the config that feeds useTableColumnSettings. The consumer owns the active-keys state; the hook computes the operations and the plugin pairing, so it stays renderer-agnostic — pair it with any column picker UI (a checkbox menu, a MultiSelector, drag-and-drop). Table ships a built-in column-settings picker; reach for this hook when you build your own picker chrome around the same state.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Own activeKeys in the consumer and pass them with onChangeActiveColumnKeys back in — the hook is stateless by design, so the state can live wherever the table does.',
      },
      {
        guidance: true,
        description:
          'Drive the picker checkboxes from isColumnActive and their disabled state from isColumnToggleable, so always-visible columns render checked and locked instead of hidden.',
      },
      {
        guidance: true,
        description:
          'Hand columnSettingsConfig straight to useTableColumnSettings — rebuilding the config yourself drifts from the operations this hook guarantees (always-visible keys stay active).',
      },
      {
        guidance: false,
        description:
          'Filter the column list for the table by hand from your own copy of the keys — activeColumnKeys is already the ordered truth the plugin consumes.',
      },
    ],
  },
  relatedComponents: ['Table'],
  relatedHooks: ['useTableColumnSettings'],
  importPath: '@astryxdesign/core',
  category: 'table',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless column visibility/order state: toggle, showAll, resetToDefault, setActiveColumnKeys and per-column is/isToggleable checks (isAlwaysVisible locked), plus the config that feeds useTableColumnSettings. Consumer owns the keys.',
  paramDescriptions: {
    config: 'columns + ordered active keys + change handler + reset default.',
    'config.columns':
      'the picker universe; isAlwaysVisible entries cannot be toggled.',
    'config.activeColumnKeys': 'visible keys in display order.',
    'config.onChangeActiveColumnKeys':
      'state change callback (consumer-owned state).',
    'config.defaultColumnKeys':
      'what resetToDefault restores; defaults to all.',
  },
  returnDescriptions: {
    columnSettingsConfig: 'feed to useTableColumnSettings directly.',
    activeColumnKeys: 'ordered active keys pass-through.',
    toggleColumn: 'remove if active, append if not; no-op on locked columns.',
    isColumnActive: 'checkbox checked state.',
    isColumnToggleable: 'checkbox disabled state (locked columns false).',
    showAllColumns: 'activate all.',
    resetToDefault: 'restore defaultColumnKeys or all.',
    setActiveColumnKeys: 'list onChange; re-adds locked columns.',
  },
  usage: {
    description:
      'Which columns show and in what order, with operations, for any custom picker UI over Table. Pairs with useTableColumnSettings through columnSettingsConfig.',
    bestPractices: [
      {guidance: true, description: 'Consumer owns activeKeys; hook computes.'},
      {
        guidance: true,
        description: 'isColumnActive/isColumnToggleable drive the picker.',
      },
      {
        guidance: true,
        description: 'Pass columnSettingsConfig to the plugin hook as-is.',
      },
      {
        guidance: false,
        description: 'Hand-filtering columns from a second key copy.',
      },
    ],
  },
};
