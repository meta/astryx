// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableColumnResize',
  subComponentOf: 'Table',
  displayName: 'useTableColumnResize',
  description:
    'Hook that returns a TablePlugin adding draggable resize handles to column header borders. Supports pointer + keyboard (WAI-ARIA window splitter) resizing, RTL, per-column min/max widths, and proportional-column preservation (resizes the neighbor so the table stays full-width). Commits widths on release.',
  props: [
    {
      name: 'columnWidths',
      type: 'Record<string, number>',
      description:
        'Controlled pixel-width overrides keyed by column key. When a key is present it overrides the column\'s declared width.',
    },
    {
      name: 'onColumnResizeEnd',
      type: '(updates: Record<string, number>) => void',
      description:
        'Called when a resize completes (pointerup / Enter). Receives a map of every column key whose width changed; merge it into your columnWidths state.',
    },
    {
      name: 'minWidth',
      type: 'number',
      description:
        'Global minimum column width in pixels during resize. Overrides per-column defaults when set.',
    },
    {
      name: 'maxWidth',
      type: 'number',
      description: 'Global maximum column width in pixels during resize.',
      default: 'Infinity',
    },
    {
      name: 'columns',
      type: 'TableColumn<T>[]',
      description:
        'Column definitions, needed to derive per-column min widths and detect proportional vs pixel columns for neighbor/last-column resize behavior.',
    },
  ],
};

export const docsZh = {
  name: 'useTableColumnResize',
  displayName: 'useTableColumnResize',
  description:
    '返回 TablePlugin 的 Hook，为列表头边框添加可拖动的调整手柄。支持指针 + 键盘（WAI-ARIA 窗口分隔符）调整、RTL、每列最小/最大宽度，以及比例列保留（调整相邻列以保持表格全宽）。在释放时提交宽度。',
  props: [
    {
      name: 'columnWidths',
      type: 'Record<string, number>',
      description: '受控的像素宽度覆盖，按列键索引。存在某键时会覆盖该列声明的宽度。',
    },
    {
      name: 'onColumnResizeEnd',
      type: '(updates: Record<string, number>) => void',
      description:
        '调整完成时（pointerup / Enter）调用。接收所有宽度发生变化的列键的映射——将其合并到你的 columnWidths 状态中。',
    },
    {
      name: 'minWidth',
      type: 'number',
      description: '调整期间的全局最小列宽（像素）。设置后覆盖每列默认值。',
    },
    {
      name: 'maxWidth',
      type: 'number',
      description: '调整期间的全局最大列宽（像素）。',
      default: 'Infinity',
    },
    {
      name: 'columns',
      type: 'TableColumn<T>[]',
      description:
        '列定义——用于推导每列最小宽度，并区分比例列与像素列以确定相邻列/末列的调整行为。',
    },
  ],
};

export const docsDense = {
  name: 'useTableColumnResize',
  displayName: 'useTableColumnResize',
  description:
    'Hook returning TablePlugin w/ draggable column resize handles. Pointer + keyboard (WAI-ARIA splitter), RTL, per-column min/max, proportional-preserving (resizes neighbor). Commits on release.',
  propDescriptions: {
    columnWidths: 'Controlled pixel-width overrides keyed by column key.',
    onColumnResizeEnd:
      'Called on resize end; receives map of all changed column widths to merge into state.',
    minWidth: 'Global min column width (px) during resize.',
    maxWidth: 'Global max column width (px) during resize. Default Infinity.',
    columns:
      'Column defs: derive per-column mins + proportional/pixel detection for neighbor/last-column behavior.',
  },
};
