// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableSelection',
  subComponentOf: 'Table',
  displayName: 'useTableSelection',
  description:
    'Hook that returns a TablePlugin implementing row selection with checkboxes, select-all, and aria-selected. Uses React Context for independent checkbox re-renders.',
  props: [
    {
      name: 'getIsItemSelected',
      type: '(item: T) => boolean',
      description: 'Returns whether the given item is currently selected.',
      required: true,
    },
    {
      name: 'onSelectItem',
      type: '(event: {item: T; isSelected: boolean}) => void',
      description:
        'Called when a row checkbox is toggled. isSelected is the new desired state.',
      required: true,
    },
    {
      name: 'onSelectAll',
      type: '(event: {isAllSelected: boolean}) => void',
      description: 'Called when the select-all header checkbox is toggled.',
      required: true,
    },
    {
      name: 'getIsAllSelected',
      type: '() => boolean',
      description:
        'Returns whether all selectable items are currently selected.',
      required: true,
    },
    {
      name: 'getIsIndeterminate',
      type: '() => boolean',
      description:
        'Returns whether selection is partial (some but not all). Renders the select-all checkbox in indeterminate state.',
    },
    {
      name: 'getIsItemSelectable',
      type: '(item: T) => boolean',
      description:
        'Returns false for a row that can never be selected (no checkbox, an empty selection cell), unlike getIsItemEnabled, which shows a disabled checkbox. Use it for rows such as a read-only system row. This hook does not change select-all: your onSelectAll and getIsAllSelected must skip these rows. useTableSelectionState does this for you.',
      default: '() => true',
    },
    {
      name: 'getIsItemEnabled',
      type: '(item: T) => boolean',
      description:
        'Returns false for a selectable row whose checkbox shows but is disabled and keeps its checked state, unlike getIsItemSelectable, which removes the checkbox. Use it for rows that are selectable in other conditions, such as a locked or busy row. This hook does not change select-all: your onSelectAll must not add or remove these rows. useTableSelectionState does this for you.',
      default: '() => true',
    },
    {
      name: 'getRowLabel',
      type: '(item: T) => string',
      description:
        'Derives a human-readable identity for a row; the row checkbox\'s hidden label becomes `Select ${getRowLabel(item)}` so screen readers announce which row each checkbox selects. Falls back to "Select row" when omitted.',
    },
    {
      name: 'hasRowHighlight',
      type: 'boolean',
      description:
        'Paints checked rows with the accent wash. Set false when the surrounding UI already uses row background to mean something else (a row open in a detail panel, say). The wash is an inline style, so it cannot be overridden from userland. Only the background is dropped: aria-selected is still set on checked rows either way.',
      default: 'true',
    },
  ],
  examples: [
    {
      label: 'Rows without a checkbox and rows with a disabled checkbox',
      code: `// useTableSelectionState excludes both kinds of row from select-all.
const {selectionConfig} = useTableSelectionState({
  data: visibleUsers,
  idKey: 'id',
  selectedKeys,
  setSelectedKeys,
  // System accounts can never be selected: no checkbox.
  getIsItemSelectable: user => !user.isSystem,
  // Locked accounts show a disabled checkbox that keeps its state.
  getIsItemEnabled: user => !user.isLocked,
});
const selectionPlugin = useTableSelection(selectionConfig);

<Table
  data={visibleUsers}
  columns={columns}
  idKey="id"
  plugins={{selection: selectionPlugin}}
/>;
`,
    },
    {
      label: 'Accessible per-row checkbox names',
      code: `
const selectionPlugin = useTableSelection({
  getIsItemSelected: item => selectedIds.has(item.id),
  onSelectItem: ({item, isSelected}) => toggle(item.id, isSelected),
  onSelectAll: ({isAllSelected}) => selectAll(isAllSelected),
  getIsAllSelected: () => selectedIds.size === users.length,
  // Screen readers announce "Select Alice", "Select Bob", ...
  // instead of an undifferentiated "Select row" for every checkbox.
  getRowLabel: item => item.name,
});

<Table
  data={users}
  columns={columns}
  idKey="id"
  plugins={{selection: selectionPlugin}}
/>;
`,
    },
    {
      label: 'Opt out of the checked-row wash',
      code: `
// This table already uses row background to mean "open in the detail
// panel". Turning the selection wash off keeps that meaning unambiguous;
// the checkbox and aria-selected still carry the selection.
const selectionPlugin = useTableSelection({
  getIsItemSelected: item => selectedIds.has(item.id),
  onSelectItem: ({item, isSelected}) => toggle(item.id, isSelected),
  onSelectAll: ({isAllSelected}) => selectAll(isAllSelected),
  getIsAllSelected: () => selectedIds.size === users.length,
  hasRowHighlight: false,
});
`,
    },
  ],
};

export const docsZh = {
  name: 'useTableSelection',
  displayName: 'useTableSelection',
  description:
    '返回 TablePlugin 的 Hook，实现带复选框、全选和 aria-selected 的行选择功能。使用 React Context 实现独立的复选框重新渲染。',
  props: [
    {
      name: 'getIsItemSelected',
      type: '(item: T) => boolean',
      description: '返回给定项是否当前被选中。',
      required: true,
    },
    {
      name: 'onSelectItem',
      type: '(event: {item: T; isSelected: boolean}) => void',
      description: '当行复选框被切换时调用。isSelected 为新的期望状态。',
      required: true,
    },
    {
      name: 'onSelectAll',
      type: '(event: {isAllSelected: boolean}) => void',
      description: '当全选表头复选框被切换时调用。',
      required: true,
    },
    {
      name: 'getIsAllSelected',
      type: '() => boolean',
      description: '返回所有可选择项是否当前都被选中。',
      required: true,
    },
    {
      name: 'getIsIndeterminate',
      type: '() => boolean',
      description:
        '返回选择是否为部分选中（部分但非全部）。将全选复选框渲染为不确定状态。',
    },
    {
      name: 'getIsItemSelectable',
      type: '(item: T) => boolean',
      description:
        '返回 false 表示该行永远不可选择（没有复选框，选择单元格为空）；getIsItemEnabled 则显示禁用的复选框。用于只读系统行等。此 hook 不改变全选：你的 onSelectAll 和 getIsAllSelected 必须跳过这些行。useTableSelectionState 会替你处理。',
      default: '() => true',
    },
    {
      name: 'getIsItemEnabled',
      type: '(item: T) => boolean',
      description:
        '返回 false 表示可选择行的复选框显示但被禁用，并保持当前选中状态；getIsItemSelectable 则移除复选框。用于锁定或忙碌的行等。此 hook 不改变全选：你的 onSelectAll 不得添加或移除这些行。useTableSelectionState 会替你处理。',
      default: '() => true',
    },
    {
      name: 'getRowLabel',
      type: '(item: T) => string',
      description:
        '为行派生人类可读的标识；行复选框的隐藏标签变为 `Select ${getRowLabel(item)}`，让屏幕阅读器播报每个复选框选择的是哪一行。省略时回退为 "Select row"。',
    },
    {
      name: 'hasRowHighlight',
      type: 'boolean',
      description:
        '为选中的行绘制强调色背景。当周围的界面已用行背景表达其他含义（例如该行已在详情面板中打开）时设为 false —— 该背景是内联样式，无法从业务代码覆盖。仅去掉背景：无论如何选中的行仍会设置 aria-selected。',
      default: 'true',
    },
  ],
};

export const docsDense = {
  name: 'useTableSelection',
  displayName: 'useTableSelection',
  description:
    'Hook returning TablePlugin for row selection w/ checkboxes, select-all, aria-selected. Uses React Context for independent checkbox re-renders.',
  propDescriptions: {
    getIsItemSelected: 'Returns whether item is selected.',
    onSelectItem:
      'Called on row checkbox toggle; isSelected = new desired state.',
    onSelectAll: 'Called on select-all header checkbox toggle.',
    getIsAllSelected: 'Returns whether all selectable items are selected.',
    getIsIndeterminate:
      'Returns partial selection state; renders indeterminate checkbox.',
    getIsItemSelectable:
      'false => row never selectable: no checkbox, empty cell (e.g. read-only system row). Your onSelectAll/getIsAllSelected must skip it; useTableSelectionState does.',
    getIsItemEnabled:
      'false => checkbox shows but disabled, keeps its checked state (e.g. locked/busy row). Your onSelectAll must not change it; useTableSelectionState does this.',
    getRowLabel:
      'Derives row identity for the checkbox\'s hidden label: `Select ${getRowLabel(item)}`. Falls back to "Select row" when omitted.',
    hasRowHighlight:
      'false => skip the accent wash on checked rows (inline style, not overridable from userland). aria-selected is unaffected. Defaults to true.',
  },
};
