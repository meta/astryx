// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableFiltering',
  subComponentOf: 'Table',
  displayName: 'useTableFiltering',
  isHiddenFromOverview: true,
  description:
    'Table plugin that adds inline column filters with popover or inline controls. T is the row type; TypeScript cannot infer it from the config, so it defaults to Record<string, unknown>, which a Table with typed rows rejects: pass it, as in `useTableFiltering<Walk>(…)` for `<Table<Walk>>`. Pairs with useTableFilterState for managed state. Supports text, select, multi-select, date, and number filter types via PowerSearch field definitions. The plugin renders the filter controls only; it does not remove rows. Filter the data yourself (toSearchFilters with applyFilters from usePowerSearchConfig) and pass the result to Table. When no row matches, Table shows its emptyState prop.',
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
      description:
        'Called when the user changes a filter value. null clears the filter.',
      required: true,
    },
    {
      name: 'variant',
      type: "'popover' | 'inline' | 'inline-compact'",
      description: 'Display variant for filter controls.',
      default: "'popover'",
    },
    {
      name: 'searchConfig',
      type: 'PowerSearchConfig',
      description:
        "Defines the filter fields. A column sets `filter: '<field key>'` to show the control for that field. Build it with usePowerSearchConfig or createPowerSearchConfig; PowerSearch can use the same config.",
      required: true,
    },
  ],
  examples: [
    {
      label: 'Filtered table with an empty state for no matches',
      code: `const fields = [
  {key: 'name', type: 'string', label: 'Name'},
  {key: 'status', type: 'enum', label: 'Status', enumValues: [
    {value: 'active', label: 'Active'},
    {value: 'inactive', label: 'Inactive'},
  ]},
] as const;

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

const columns: TableColumn<User>[] = [
  {key: 'name', header: 'Name', filter: 'name'},
  {key: 'status', header: 'Status', filter: 'status'},
];

function UsersTable({users}: {users: User[]}) {
  const {config, applyFilters} = usePowerSearchConfig(fields);
  const {filters, onFilterChange, clearAll} = useTableFilterState();
  const filterPlugin = useTableFiltering<User>({filters, onFilterChange, searchConfig: config});
  // The plugin draws the controls. You remove the rows that do not match.
  const visibleUsers = applyFilters(toSearchFilters(filters, columns, config), users);

  return (
    <Table
      data={visibleUsers}
      columns={columns}
      idKey="id"
      plugins={{filter: filterPlugin}}
      emptyState={
        <EmptyState
          title="No matching users"
          description="Change or clear the filters."
          actions={<Button label="Clear filters" onClick={clearAll} />}
        />
      }
    />
  );
}`,
    },
  ],
};

export const docsZh = {
  name: 'useTableFiltering',
  isHiddenFromOverview: true,
  displayName: 'useTableFiltering',
  description:
    '表格筛选插件，添加内联列过滤器（弹出式或内联控件）。T 是行类型；TypeScript 无法从配置推断它，因此默认为 Record<string, unknown>，带类型行的 Table 不接受：请传入，例如 `useTableFiltering<Walk>(…)` 对应 `<Table<Walk>>`。与 useTableFilterState 配合使用管理状态。插件只渲染筛选控件，不会移除行：请自行筛选数据（toSearchFilters 配合 usePowerSearchConfig 的 applyFilters），再把结果传给 Table。没有匹配的行时，Table 显示其 emptyState 属性。',
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
      name: 'variant',
      type: "'popover' | 'inline' | 'inline-compact'",
      description: '筛选控件的显示变体。',
      default: "'popover'",
    },
    {
      name: 'searchConfig',
      type: 'PowerSearchConfig',
      description:
        "定义筛选字段。列设置 `filter: '<字段键>'` 即显示该字段的控件。用 usePowerSearchConfig 或 createPowerSearchConfig 构建；PowerSearch 可共用同一配置。",
      required: true,
    },
  ],
};

export const docsDense = {
  name: 'useTableFiltering',
  isHiddenFromOverview: true,
  displayName: 'useTableFiltering',
  description:
    'Table filtering plugin: inline column filters (popover/inline). T = row type, not inferred from config (defaults to Record<string, unknown>, rejected by typed Table): pass it, e.g. `useTableFiltering<Walk>(…)`. Pairs w/ useTableFilterState. Renders controls only, does not remove rows: filter data yourself (applyFilters(toSearchFilters(filters, columns, config), data)) + pass result to Table; no match => Table emptyState.',
  propDescriptions: {
    filters: 'Current filter state map (columnKey → value).',
    onFilterChange: 'Called on filter change. null clears.',
    variant: 'Filter control display variant.',
    searchConfig:
      "PowerSearchConfig defining filter fields; column `filter: '<field key>'` picks one. Build w/ usePowerSearchConfig.",
  },
};
