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
        'Returns whether a row should show a checkbox. Non-selectable rows render nothing in the selection cell.',
      default: '() => true',
    },
    {
      name: 'getIsItemEnabled',
      type: '(item: T) => boolean',
      description:
        'Returns whether a row checkbox is interactive. Disabled rows show a disabled checkbox.',
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
        '返回行是否应显示复选框。不可选择的行在选择单元格中不渲染任何内容。',
      default: '() => true',
    },
    {
      name: 'getIsItemEnabled',
      type: '(item: T) => boolean',
      description: '返回行复选框是否可交互。禁用的行显示禁用状态的复选框。',
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
      'Returns whether row shows checkbox; non-selectable rows render nothing.',
    getIsItemEnabled:
      'Returns whether row checkbox is interactive; disabled rows show disabled checkbox.',
    getRowLabel:
      'Derives row identity for the checkbox\'s hidden label: `Select ${getRowLabel(item)}`. Falls back to "Select row" when omitted.',
    hasRowHighlight:
      'false => skip the accent wash on checked rows (inline style, not overridable from userland). aria-selected is unaffected. Defaults to true.',
  },
};
