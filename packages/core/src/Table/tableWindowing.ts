// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableWindowing.ts
 * @input The windowing implementation the virtualization plugin registers
 * @output The registered implementation, or a full-render one that runs no
 *   hook, and the shapes BaseTable reads from either
 * @position Table's windowing slot. BaseTable reads it once per mount, so a
 *   Table whose app never makes a virtualization capability carries none of
 *   the windowing code. The slot is shared across copies of Core, so a
 *   swizzled Table and the package agree on it.
 */
import type {ReactNode} from 'react';
import {realmValue, sharedKey} from '../utils/sharedRealm';
import {createTableRuntime, type TableRuntime} from './tableRuntime';
import type {RowIdentity} from './tableIdentity';
import type {BaseTableProps, TableColumn, TablePlugin} from './types';

export type TableWindowSegment =
  | {type: 'rows'; start: number; end: number}
  | {type: 'gap'; start: number; end: number; height: number};

export interface TableWindowInput<T extends Record<string, unknown>> {
  virtualization: BaseTableProps<T>['virtualization'];
  mode: 'data' | 'children';
  scrollWrapper: BaseTableProps<T>['scrollWrapper'];
  rowModel: NonNullable<TablePlugin<T>['rowModel']> | 'custom';
  data: T[];
  identity: RowIdentity[];
  keys: (string | number)[];
  textOverflow: BaseTableProps<T>['textOverflow'];
  hasLegacyRowMetadata: boolean;
  columns: TableColumn<T>[];
  runtime: TableRuntime;
}

export interface TableWindow<T extends Record<string, unknown>> {
  segments: TableWindowSegment[];
  isWindowed: boolean;
  rowHeight: number | undefined;
  viewportHeight: number | undefined;
  /** The columns, with row-number columns widened to fit the last position. */
  columns: TableColumn<T>[];
  /** Table variables that carry the widening to pinned offsets. */
  extraStyle: Readonly<Record<string, string>>;
  onRowFocus:
    ((key: string | number, focusTarget?: HTMLElement) => void) | undefined;
  onRowBlur: (() => void) | undefined;
  /** Why a capability does not window, for one development warning. */
  fallbackReason: string | undefined;
}

export interface TableWindowProps<T extends Record<string, unknown>> {
  input: TableWindowInput<T>;
  /** Renders the table for the window plan. */
  render: (windowPlan: TableWindow<T>) => ReactNode;
}

export interface TableWindowing {
  createRuntime: () => TableRuntime;
  /**
   * Plans the window and renders the table for it. A component, so each
   * implementation keeps its own hooks behind its own boundary.
   */
  Window: <T extends Record<string, unknown>>(
    props: TableWindowProps<T>,
  ) => ReactNode;
}

const NO_EXTRA_STYLE: Readonly<Record<string, string>> = Object.freeze({});

function planFullRender<T extends Record<string, unknown>>({
  virtualization,
  data,
  columns,
}: TableWindowInput<T>): TableWindow<T> {
  return {
    segments:
      data.length === 0 ? [] : [{type: 'rows', start: 0, end: data.length}],
    isWindowed: false,
    rowHeight: undefined,
    viewportHeight: undefined,
    columns,
    extraStyle: NO_EXTRA_STYLE,
    onRowFocus: undefined,
    onRowBlur: undefined,
    fallbackReason:
      virtualization == null
        ? undefined
        : // The hook registers the implementation when it runs, so with none
          // registered the value cannot come from it.
          'virtualization is not a value from useTableRowsVirtualization',
  };
}

function FullRenderWindow<T extends Record<string, unknown>>({
  input,
  render,
}: TableWindowProps<T>): ReactNode {
  return render(planFullRender(input));
}

/** Renders every row and calls no hook. */
export const FULL_RENDER: TableWindowing = Object.freeze({
  createRuntime: () => createTableRuntime(),
  Window: FullRenderWindow,
});

const slot = realmValue(
  sharedKey('table/windowing', 1),
  () => ({current: null as TableWindowing | null}),
  value => typeof value === 'object' && value != null && 'current' in value,
);

/** Registers the windowing implementation once; later calls keep the first. */
export function registerTableWindowing(windowing: TableWindowing): void {
  slot.current ??= windowing;
}

export function readTableWindowing(): TableWindowing {
  return slot.current ?? FULL_RENDER;
}
