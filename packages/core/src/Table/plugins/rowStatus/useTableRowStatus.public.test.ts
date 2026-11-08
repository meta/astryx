// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expectTypeOf, it} from 'vitest';
import type {
  TableRowStatus,
  TableSemanticRowStatus,
  UseTableRowStatusConfig,
} from '@astryxdesign/core/Table';

declare module '@astryxdesign/core/Table' {
  interface TableRowStatus {
    consumerNote?: string;
  }
}

interface Row extends Record<string, unknown> {
  id: string;
}

interface ExtendedCustomStatus extends TableRowStatus {
  source: 'consumer';
}

type RowStatusResult = Exclude<
  ReturnType<UseTableRowStatusConfig<Row>['getStatus']>,
  null
>;

describe('useTableRowStatus public contract', () => {
  it('preserves the custom interface for extension and declaration merging', () => {
    expectTypeOf<ExtendedCustomStatus>().toMatchTypeOf<TableRowStatus>();
    expectTypeOf<{
      color: 'red';
      label: string;
      consumerNote: string;
    }>().toMatchTypeOf<TableRowStatus>();

    const legacyGetStatus = (_item: Row): TableRowStatus | null => ({
      color: 'red',
      label: 'Legacy',
      consumerNote: 'declaration merge stays available',
    });
    expectTypeOf(legacyGetStatus).toMatchTypeOf<
      UseTableRowStatusConfig<Row>['getStatus']
    >();
  });

  it('accepts the semantic interface and each exclusive callback branch', () => {
    expectTypeOf<TableSemanticRowStatus>().toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{
      status: 'success';
      label: string;
    }>().toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{
      color: 'red';
      label: string;
      status: undefined;
    }>().toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{
      color: 'rgb(1, 2, 3)';
      icon: 'check';
      label: string;
    }>().toMatchTypeOf<RowStatusResult>();
  });

  it('rejects mixed, incomplete, and unknown callback results', () => {
    expectTypeOf<{
      status: 'success';
      color: 'green';
      label: string;
    }>().not.toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{
      status: 'error';
      icon: 'error';
      label: string;
    }>().not.toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{
      status: 'info';
      label: string;
    }>().not.toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{label: string}>().not.toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{status: 'success'}>().not.toMatchTypeOf<RowStatusResult>();
    expectTypeOf<{color: 'red'}>().not.toMatchTypeOf<RowStatusResult>();
  });

  it('keeps resolved anatomy off both public interfaces', () => {
    expectTypeOf<TableRowStatus>().not.toHaveProperty('variant');
    expectTypeOf<TableRowStatus>().not.toHaveProperty('presentation');
    expectTypeOf<TableSemanticRowStatus>().not.toHaveProperty('variant');
    expectTypeOf<TableSemanticRowStatus>().not.toHaveProperty('presentation');
  });
});
