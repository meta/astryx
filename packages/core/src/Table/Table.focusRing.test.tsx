// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Table.focusRing.test.tsx
 * @input Uses Table, useTableTreeState, useTableTreeData, focusOutlineStyles
 * @output Tests that Table's own tab stops (the scroll wrapper, the tree
 *   expander, the expand-all toggle) draw the shared focus ring
 * @position Colocated test; the ring's geometry is checked in a real browser
 *
 * jsdom does not match `:focus-visible`, so these pin the composition: each
 * tab stop carries the classes `focusOutlineStyles.focusVisible` compiles to.
 */

import {describe, it, expect} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {focusVars} from '../theme/tokens.stylex';
import {Table} from './Table';
import type {TableColumn} from './types';
import {useTableTreeData} from './plugins/tree/useTableTreeData';
import {useTableTreeState} from './plugins/tree/useTableTreeState';

const sharedFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible)
  .className!.split(' ');

// The scroll wrapper keeps the shared ring but sits it inside its own box,
// because it bleeds to a clipping container's edges.
const inset = stylex.create({
  ring: {
    outlineOffset: {
      default: null,
      ':focus-visible': `calc(-1 * ${focusVars['--focus-outline-width']})`,
    },
  },
});
const insetFocusRingClasses = stylex
  .props(focusOutlineStyles.focusVisible, inset.ring)
  .className!.split(' ')
  // Debug class names name their source file; only the atoms matter.
  .filter(c => !c.includes('__'));

function expectSharedFocusRing(el: Element) {
  const classes = el.className.split(' ');
  for (const c of sharedFocusRingClasses) {
    expect(classes).toContain(c);
  }
}

interface FileRow extends Record<string, unknown> {
  id: string;
  name: string;
  children?: FileRow[];
}

const files: FileRow[] = [
  {
    id: 'src',
    name: 'src',
    children: [{id: 'utils', name: 'utils.ts'}],
  },
  {id: 'readme', name: 'README.md'},
];

const columns: TableColumn<FileRow>[] = [{key: 'name', header: 'Name'}];

function TreeTable() {
  const {visibleData, treeConfig} = useTableTreeState<FileRow>({
    data: files,
    idKey: 'id',
  });
  const tree = useTableTreeData({...treeConfig, hasExpandAllControl: true});
  return (
    <Table data={visibleData} columns={columns} idKey="id" plugins={{tree}} />
  );
}

describe('Table: its own tab stops draw the shared focus ring', () => {
  it('the scroll wrapper, inset', () => {
    const {container} = render(
      <Table data={[{id: '1', name: 'One'}]} columns={columns} idKey="id" />,
    );
    const wrapper = container.querySelector('.astryx-table-scroll-wrapper');
    expect(wrapper).not.toBeNull();
    const classes = wrapper!.className.split(' ');
    for (const c of insetFocusRingClasses) {
      expect(classes).toContain(c);
    }
  });

  it('the tree row expander', () => {
    render(<TreeTable />);
    expectSharedFocusRing(screen.getByRole('button', {name: /expand row/i}));
  });

  it('the expand-all toggle', () => {
    render(<TreeTable />);
    const headerRow = screen.getAllByRole('row')[0];
    expectSharedFocusRing(
      within(headerRow).getByRole('button', {name: /expand all/i}),
    );
  });
});
