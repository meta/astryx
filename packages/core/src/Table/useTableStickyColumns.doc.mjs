// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableStickyColumns',
  subComponentOf: 'Table',
  displayName: 'useTableStickyColumns',
  description:
    'Hook that returns a TablePlugin which pins a contiguous run of columns to the start and/or end edge of the table. T is the row type; TypeScript cannot infer it from the config, so it defaults to Record<string, unknown>, which a Table with typed rows rejects: pass it, as in `useTableStickyColumns<Walk>(…)` for `<Table<Walk>>`. Pinned columns get cumulative offsets and a soft, scroll-aware shadow over the scrolling content. An empty config ({}) is a valid no-op that pins nothing.',
  props: [
    {
      name: 'startKeys',
      type: 'string[]',
      description:
        'Column keys pinned to the start (inline-start / left in LTR) edge: the contiguous run from the first column through the last listed key.',
    },
    {
      name: 'endKeys',
      type: 'string[]',
      description:
        'Column keys pinned to the end (inline-end / right in LTR) edge: the contiguous run from the first listed key through the last column.',
    },
  ],
};

export const docsZh = {
  name: 'useTableStickyColumns',
  displayName: 'useTableStickyColumns',
  description:
    '返回 TablePlugin 的 Hook，将一组连续的列固定到表格的起始和/或结束边缘。T 是行类型；TypeScript 无法从配置推断它，因此默认为 Record<string, unknown>，带类型行的 Table 不接受：请传入，例如 `useTableStickyColumns<Walk>(…)` 对应 `<Table<Walk>>`。固定的列具有累积偏移量，并在滚动内容上方显示柔和的、随滚动感知的阴影。空配置 ({}) 是有效的空操作，不固定任何列。',
  props: [
    {
      name: 'startKeys',
      type: 'string[]',
      description:
        '固定到起始（inline-start / LTR 中为左侧）边缘的列键——从第一列到最后列出的键的连续范围。',
    },
    {
      name: 'endKeys',
      type: 'string[]',
      description:
        '固定到结束（inline-end / LTR 中为右侧）边缘的列键——从第一个列出的键到最后一列的连续范围。',
    },
  ],
};

export const docsDense = {
  name: 'useTableStickyColumns',
  displayName: 'useTableStickyColumns',
  description:
    'Hook returning TablePlugin that pins contiguous column runs to start/end edges w/ cumulative offsets + scroll-aware shadow. T = row type, not inferred from config (defaults to Record<string, unknown>, rejected by typed Table): pass it, e.g. `useTableStickyColumns<Walk>(…)`. Empty config = no-op.',
  propDescriptions: {
    startKeys:
      'Column keys pinned to the start edge (contiguous run from column 0 through the last listed key).',
    endKeys:
      'Column keys pinned to the end edge (contiguous run from the first listed key through the last column).',
  },
};
