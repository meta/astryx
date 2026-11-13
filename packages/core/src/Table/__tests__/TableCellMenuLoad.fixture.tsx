// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';
/**
 * @file TableCellMenuLoad.fixture.tsx
 * @input Table, TableBody, TableRow and TableCell from source
 * @output Root: one row with a context-menu cell and a plain cell, which marks
 *   the document once it has hydrated
 * @position Test-only fixture for TableCellMenuLoad.a11y.chromium.spec.ts,
 *   rendered on the server and hydrated in the browser
 */
import {useEffect, type ReactNode} from 'react';
import {Table} from '../Table';
import {TableBody} from '../TableBody';
import {TableRow} from '../TableRow';
import {TableCell} from '../TableCell';
import type {TableContextAction} from '../types';
import '../../reset.css';

const actions: TableContextAction[] = [
  {id: 'copy', label: 'Copy', onSelect: () => {}},
  {id: 'paste', label: 'Paste', onSelect: () => {}},
];

function Hydrated(): null {
  // Syncs the document with hydration: the spec waits for this mark.
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
  return null;
}

export function Root(): ReactNode {
  return (
    <>
      <Table>
        <TableBody>
          <TableRow>
            <TableCell contextMenuActions={actions}>
              Alice <button type="button">Edit</button>
            </TableCell>
            <TableCell>Plain cell</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Hydrated />
    </>
  );
}
