// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableColumnsContext.ts
 * @input Layer-scoped React context, TableColumn type
 * @output Exports TableColumnsContext
 * @position Private context layer; BaseTable provides the final column list
 *   around every plugin's `transformTableContext` output, so plugin chrome
 *   rendered there reads the columns as render input
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/BaseTable.tsx (provider)
 * - /packages/core/src/Table/plugins/filtering/useTableFiltering.tsx (consumer)
 */

import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import type {TableColumn} from './types';

/**
 * The columns the table rendered, after every plugin's `transformColumns`.
 * Empty outside a data-driven table.
 */
export const TableColumnsContext = createContext<
  ReadonlyArray<TableColumn<Record<string, unknown>>>
>([]);
TableColumnsContext.displayName = 'TableColumnsContext';
