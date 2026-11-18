// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableSortable',
  subComponentOf: 'Table',
  displayName: 'useTableSortable',
  description:
    'Headless sort plugin for Table: it adds the sort controls and indicators to the headers of sortable columns, but it does not reorder the rows; you sort data yourself, or use useTableSortableState, which returns sortedData. Call with a config object: `useTableSortable({ sort, onSortChange })`. Returns a TablePlugin to pass to `<Table plugins={{ sort: sortPlugin }} />`. A column gets a sort control only when it sets `sortable: true` (sort key = column key) or `sortable: {sortKey}`.',
  usage: {
    description:
      'useTableSortable adds the header sort controls but does not reorder the rows: pass rows that are already sorted as data, sorted by you from the sort state or by useTableSortableState. Call it with a config object containing the sort state and callback, and pass the returned plugin to Table via the plugins prop.',
  },
  examples: [
    {
      label: 'Sort the rows yourself from the sort state',
      code: `const columns = [
  {key: 'name', header: 'Name', sortable: true},
  {key: 'age', header: 'Age', sortable: true},
];

const [sort, setSort] = useState([{sortKey: 'name', direction: 'ascending'}]);
const sortPlugin = useTableSortable({sort, onSortChange: setSort});

// The plugin does not reorder rows: sort a copy of the data from \`sort\`.
const sortedUsers = useMemo(() => {
  const [entry] = sort;
  if (entry == null) return users;
  const sign = entry.direction === 'ascending' ? 1 : -1;
  return [...users].sort((a, b) =>
    a[entry.sortKey] < b[entry.sortKey] ? -sign : a[entry.sortKey] > b[entry.sortKey] ? sign : 0,
  );
}, [users, sort]);

<Table data={sortedUsers} columns={columns} idKey="id" plugins={{sort: sortPlugin}} />;`,
    },
    {
      label: 'Let useTableSortableState sort the rows',
      code: `const {sortedData, sortConfig} = useTableSortableState({
  data: users,
  defaultSort: [{sortKey: 'name', direction: 'ascending'}],
});
const sortPlugin = useTableSortable(sortConfig);

<Table data={sortedData} columns={columns} idKey="id" plugins={{sort: sortPlugin}} />;`,
    },
  ],
  props: [
    {
      name: 'sort',
      type: "Array<{sortKey: TSortKey, direction: 'ascending' | 'descending'}>",
      description:
        "Current sort state that the headers show; the plugin does not reorder data, so sort your rows from this value (TableSortState<TSortKey>). Ordered array of entries; the first is the primary sort, the rest are tiebreakers. An empty array means unsorted. Direction is the full word: 'ascending' / 'descending', not 'asc' / 'desc'.",
      required: true,
    },
    {
      name: 'onSortChange',
      type: "(sort: Array<{sortKey: TSortKey, direction: 'ascending' | 'descending'}>) => void",
      description:
        'Called with the next sort state when the user clicks a sortable header; store it and sort your data from it, because the plugin does not reorder rows.',
      required: true,
    },
    {
      name: 'allowUnsortedState',
      type: 'boolean',
      description:
        "Allow cycling back to unsorted. When true: 'ascending', 'descending', unsorted. When false: 'ascending', 'descending', 'ascending'.",
      default: 'true',
    },
    {
      name: 'isMultiSortEnabled',
      type: 'boolean',
      description:
        'Enable multi-sort via Shift+click. Regular click still replaces the entire sort state.',
      default: 'false',
    },
  ],
};

export const docsZh = {
  name: 'useTableSortable',
  displayName: 'useTableSortable',
  description:
    '无头排序插件：它在可排序列的表头中添加排序控件和指示器，但不会重新排列行；请自行对 data 排序，或使用返回 sortedData 的 useTableSortableState。用户拥有排序状态并提供回调。列需设置 `sortable: true`（排序键为列键）或 `sortable: {sortKey}` 才会显示排序控件。Shift+点击启用二级排序列。',
  props: [
    {
      name: 'sort',
      type: "Array<{sortKey: TSortKey, direction: 'ascending' | 'descending'}>",
      description:
        "表头显示的当前排序状态；插件不会重新排列数据，请根据此值对行排序。{sortKey, direction} 条目的有序数组。第一个条目是主排序。方向值为完整单词 'ascending' / 'descending'，不是 'asc' / 'desc'。",
      required: true,
    },
    {
      name: 'onSortChange',
      type: "(sort: Array<{sortKey: TSortKey, direction: 'ascending' | 'descending'}>) => void",
      description:
        '用户点击可排序表头时，以新的排序状态调用；请保存它并据此对数据排序，因为插件不会重新排列行。',
      required: true,
    },
    {
      name: 'allowUnsortedState',
      type: 'boolean',
      description:
        "允许循环回到未排序状态。为 true 时：'ascending'、'descending'、未排序。为 false 时：'ascending'、'descending'、'ascending'。",
      default: 'true',
    },
    {
      name: 'isMultiSortEnabled',
      type: 'boolean',
      description: '通过 Shift+点击启用多列排序。普通点击仍替换整个排序状态。',
      default: 'false',
    },
  ],
};

export const docsDense = {
  name: 'useTableSortable',
  displayName: 'useTableSortable',
  description:
    'Headless sort plugin: adds header sort controls/indicators, does NOT reorder rows; sort data yourself or use useTableSortableState (returns sortedData). Consumer owns sort state + callback. Column needs `sortable: true` or `sortable: {sortKey}`. Shift+click for secondary sort.',
  propDescriptions: {
    sort: "Sort state the headers show; plugin does not reorder data, sort rows from it. Ordered array of {sortKey, direction: 'ascending'|'descending'} entries. Not 'asc'/'desc'.",
    onSortChange:
      'Called w/ next sort state on sortable header click; store it + sort your data (plugin does not reorder rows).',
    allowUnsortedState:
      'Allow cycling to unsorted. true: ascending>descending>unsorted. false: ascending>descending>ascending.',
    isMultiSortEnabled:
      'Enable multi-sort via Shift+click. Regular click replaces sort state.',
  },
};
