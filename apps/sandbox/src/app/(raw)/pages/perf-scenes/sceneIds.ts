// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sceneIds.ts
 * @input None
 * @output The perf scene ids, their labels, and the parser for `?scene=`
 * @position Shared by the perf scenes page and the nightly perf driver
 *   (apps/sandbox/perf/), so both name the same scenes.
 *
 * SYNC: A new scene needs a component in scenes.tsx and an interaction in
 *   apps/sandbox/perf/scenes.perf.spec.ts.
 */

export const PERF_SCENES = [
  'comments-panel',
  'table',
  'tree-list',
  'markdown',
  'overlay-churn',
] as const;

export type PerfSceneId = (typeof PERF_SCENES)[number];

export const PERF_SCENE_LABELS: Readonly<Record<PerfSceneId, string>> = {
  'comments-panel':
    'Comments panel: 40 rows of Avatar, truncated Text, Tooltip and a menu',
  table: 'Table: 1,000 rows, sort and filter',
  'tree-list': 'TreeList: 500 items with animated layout, expand all',
  markdown: 'Markdown: a long document with tables and code blocks',
  'overlay-churn': 'Overlay churn: Popover, DropdownMenu and Dialog',
};

export function parsePerfScene(value: string | null): PerfSceneId {
  return (PERF_SCENES as readonly string[]).includes(value ?? '')
    ? (value as PerfSceneId)
    : PERF_SCENES[0];
}
