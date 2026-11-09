// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTableColumnSettingsState',
  displayName: 'useTableColumnSettingsState',
  group: 'Table',
  keywords: [
    'table',
    'column',
    'columns',
    'column settings',
    'column visibility',
    'table settings',
    'useTableColumnSettingsState',
    'useTableColumnSettings',
  ],
  params: [
    {
      name: 'config',
      type: 'UseTableColumnSettingsStateConfig<TColumnKey>',
      description: 'The columns to configure and active keys state management.',
      required: true,
    },
    {
      name: 'config.columns',
      type: 'ReadonlyArray<ColumnSettingsOption<TColumnKey>>',
      description:
        'All available columns with metadata (key, label, isAlwaysVisible, group) for the settings UI.',
      required: true,
    },
    {
      name: 'config.activeColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'Currently active column keys, in display order. Only columns in this list render in the table.',
      required: true,
    },
    {
      name: 'config.onChangeActiveColumnKeys',
      type: '(keys: ReadonlyArray<TColumnKey>) => void',
      description:
        'Called when active columns change (via toggle, show all, or reset) to update consumer state.',
      required: true,
    },
    {
      name: 'config.defaultColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'Default column set restored by resetToDefault. When omitted, resetToDefault activates all columns.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'columnSettingsConfig',
      type: 'UseTableColumnSettingsStateConfig<TColumnKey>',
      description:
        'Ready-to-use config to pass directly to useTableColumnSettings(columnSettingsConfig).',
    },
    {
      name: 'activeColumnKeys',
      type: 'ReadonlyArray<TColumnKey>',
      description:
        'Pass-through of currently active column keys in display order.',
    },
    {
      name: 'toggleColumn',
      type: '(key: TColumnKey) => void',
      description:
        'Toggles column visibility: removes an active column or appends an inactive column. No-op for isAlwaysVisible columns.',
    },
    {
      name: 'isColumnActive',
      type: '(key: TColumnKey) => boolean',
      description:
        'Whether a specific column is currently in the active column keys list.',
    },
    {
      name: 'isColumnToggleable',
      type: '(key: TColumnKey) => boolean',
      description:
        'Whether a specific column can be toggled (returns false if isAlwaysVisible is true).',
    },
    {
      name: 'showAllColumns',
      type: '() => void',
      description: 'Activates all configured columns in the table.',
    },
    {
      name: 'resetToDefault',
      type: '() => void',
      description:
        'Resets active column keys to defaultColumnKeys (or all columns if defaultColumnKeys is omitted).',
    },
    {
      name: 'setActiveColumnKeys',
      type: '(keys: string[]) => void',
      description:
        'Sets active column keys from a list of key strings, enforcing that isAlwaysVisible columns remain active.',
    },
  ],
  usage: {
    description:
      'Headless column visibility and ordering state management for Table. Manages which columns are active, provides toggle and reset operations, and produces a config object that feeds directly into useTableColumnSettings. Renderer-agnostic and pairs with any column picker UI.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass columnSettingsConfig directly to useTableColumnSettings and give the resulting plugin to Table.',
      },
      {
        guidance: true,
        description:
          'Mark essential identifier columns (like name or ID) with isAlwaysVisible: true so users cannot accidentally hide them.',
      },
      {
        guidance: false,
        description:
          'Mutate activeColumnKeys array directly; use toggleColumn, showAllColumns, or resetToDefault.',
      },
    ],
  },
  relatedComponents: ['Table'],
  relatedHooks: ['useTableColumnSettings', 'useTableSelectionState'],
  importPath: '@astryxdesign/core/Table',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless column visibility + ordering state for Table. Manages active columns, toggle/reset operations, produces config for useTableColumnSettings. Renderer-agnostic; pairs with any picker UI.',
  paramDescriptions: {
    config: 'Columns + active keys state management.',
    'config.columns':
      'All available columns with metadata (key, label, isAlwaysVisible, group).',
    'config.activeColumnKeys': 'Active column keys in display order.',
    'config.onChangeActiveColumnKeys':
      'Called on column toggle, show all, or reset.',
    'config.defaultColumnKeys':
      'Default column set for resetToDefault; omit to show all.',
  },
  returnDescriptions: {
    columnSettingsConfig: 'Pass directly to useTableColumnSettings.',
    activeColumnKeys: 'Active column keys in display order.',
    toggleColumn: 'Toggles column visibility (no-op if isAlwaysVisible).',
    isColumnActive: 'Whether column is currently active.',
    isColumnToggleable: 'Whether column can be toggled.',
    showAllColumns: 'Activates all columns.',
    resetToDefault: 'Resets to defaultColumnKeys (or all columns).',
    setActiveColumnKeys: 'Sets active keys, keeping isAlwaysVisible columns.',
  },
  usage: {
    description:
      'Headless column visibility and ordering state for Table: provides toggle and reset operations and produces config for useTableColumnSettings.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass columnSettingsConfig directly to useTableColumnSettings.',
      },
      {
        guidance: true,
        description:
          'Mark essential identifier columns with isAlwaysVisible: true.',
      },
      {
        guidance: false,
        description:
          'Mutate activeColumnKeys directly; use provided toggle and reset operations.',
      },
    ],
  },
};
