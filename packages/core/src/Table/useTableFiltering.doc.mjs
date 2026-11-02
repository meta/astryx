// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableFiltering',
  subComponentOf: 'Table',
  displayName: 'useTableFiltering',
  isHiddenFromOverview: true,
  description: 'Table plugin that adds column filters as header popovers, inline header controls, or one bottom sheet. Pairs with useTableFilterState for managed state. Supports text, select, multi-select, date, and number filter types via PowerSearch field definitions. Set presentation to adaptive to move the filters into a bottom sheet on a phone, where a column is too narrow to hold a control.',
  props: [
    {
      name: 'filters',
      type: 'TableFilterState',
      description: 'Current filter state: map from column key to filter value.',
      required: true,
    },
    {
      name: 'onFilterChange',
      type: '(columnKey: string, value: TableFilterValue | null) => void',
      description: 'Called when the user changes a filter value. null clears the filter.',
      required: true,
    },
    {
      name: 'searchConfig',
      type: 'PowerSearchConfig',
      description: 'PowerSearch config defining the filterable fields. Columns reference a field by key; the plugin resolves the operator value type and renders the matching control. Build it with createPowerSearchConfig or usePowerSearchConfig and share it with PowerSearch.',
      required: true,
    },
    {
      name: 'onClearAll',
      type: '() => void',
      description: "Clears every filter at once. When provided, the bottom sheet shows a Reset action that calls it once. Pass useTableFilterState's clearAll.",
    },
    {
      name: 'variant',
      type: "'popover' | 'inline' | 'inline-compact'",
      description: 'Display variant for the header controls. Applies while presentation resolves to the header.',
      default: "'popover'",
    },
    {
      name: 'presentation',
      type: "'header' | 'bottom-sheet' | 'adaptive'",
      description: 'Where the filter controls live. header keeps them in the column headers on every device. bottom-sheet moves every filter into one bottom sheet opened from a Filter button above the table, which carries the active-filter count; the sheet applies each change as it is made and has no scrim, so the rows behind stay visible and keep updating. adaptive presents the sheet on a compact touch screen and the header elsewhere. The server and hydrating renders present the header, and the presentation in place when a filter surface opens stays until it closes.',
      default: "'header'",
    },
  ],
};

export const docsZh = {
  name: 'useTableFiltering',
  isHiddenFromOverview: true,
  displayName: 'useTableFiltering',
  description: '表格筛选插件，以表头弹出层、表头内联控件或一个底部弹层的形式添加列筛选。与 useTableFilterState 配合使用管理状态。将 presentation 设为 adaptive，手机上的筛选会移入底部弹层。',
  props: [
    {
      name: 'filters',
      type: 'TableFilterState',
      description: '当前筛选状态——列键到筛选值的映射。',
      required: true,
    },
    {
      name: 'onFilterChange',
      type: '(columnKey: string, value: TableFilterValue | null) => void',
      description: '用户更改筛选值时调用。null 清除筛选。',
      required: true,
    },
    {
      name: 'searchConfig',
      type: 'PowerSearchConfig',
      description: '定义可筛选字段的 PowerSearch 配置。列通过 key 引用字段，插件据此渲染对应控件。',
      required: true,
    },
    {
      name: 'onClearAll',
      type: '() => void',
      description: '一次清除全部筛选。提供后，底部弹层显示"重置"操作并只调用一次。可传入 useTableFilterState 的 clearAll。',
    },
    {
      name: 'variant',
      type: "'popover' | 'inline' | 'inline-compact'",
      description: '表头筛选控件的显示变体。仅在 presentation 解析为表头时生效。',
      default: "'popover'",
    },
    {
      name: 'presentation',
      type: "'header' | 'bottom-sheet' | 'adaptive'",
      description: '筛选控件的位置。header 在所有设备上保留在列标题中。bottom-sheet 将所有筛选移入一个底部弹层，由表格上方显示生效数量的"筛选"按钮打开；切换即时生效，弹层无遮罩，后面的行保持可见并实时更新。adaptive 在紧凑触屏上使用底部弹层，其他情况使用表头。服务端和水合渲染使用表头；筛选界面打开时的呈现方式保持到其关闭。',
      default: "'header'",
    },
  ],
};

export const docsDense = {
  name: 'useTableFiltering',
  isHiddenFromOverview: true,
  displayName: 'useTableFiltering',
  description: 'Table filtering plugin: column filters in the header (popover/inline) or one bottom sheet. Pairs w/ useTableFilterState.',
  propDescriptions: {
    filters: 'Current filter state map (columnKey → value).',
    onFilterChange: 'Called on filter change. null clears.',
    searchConfig: 'PowerSearch config defining the filterable fields.',
    onClearAll: 'Clears every filter in one call; shows Reset in the sheet. Pass clearAll from useTableFilterState.',
    variant: 'Header control display variant.',
    presentation: "'header' | 'bottom-sheet' (Filter button + live, scrim-less sheet) | 'adaptive' (sheet on compact touch only).",
  },
};
