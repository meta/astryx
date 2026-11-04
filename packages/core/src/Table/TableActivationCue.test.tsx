// Copyright (c) Meta Platforms, Inc. and affiliates.

import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {Table} from './Table';
import {TableBody} from './TableBody';
import {TableCell} from './TableCell';
import {TableRow} from './TableRow';
import {useTableActivation} from './plugins/activation/useTableActivation';

const data = [{id: 'outer', name: 'Outer product'}];
const nestedData = [{name: 'Nested product'}, {name: 'Nested sibling'}];

function Fixture() {
  const activation = useTableActivation({
    activeKey: 'outer',
    onActivate: () => {},
  });
  return (
    <Table
      data={data}
      idKey="id"
      plugins={{activation}}
      columns={[
        {key: 'name', header: 'Product'},
        {
          key: 'detail',
          header: 'Detail',
          renderCell: () => (
            <>
              <Table
                data={nestedData}
                columns={[{key: 'name', header: 'Nested'}]}
              />
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell>Nested children row</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </>
          ),
        },
      ]}
    />
  );
}

afterEach(cleanup);

describe('Table activation cue boundaries', () => {
  it('resets the inherited cue on nested data and children rows', () => {
    render(<Fixture />);
    const outer = screen.getByText('Outer product').closest('tr')!;
    expect(outer).toHaveAttribute('aria-current', 'true');
    expect(
      getComputedStyle(outer).getPropertyValue('--table-row-active-cue-width'),
    ).toBe('3px');
    for (const text of [
      'Nested product',
      'Nested sibling',
      'Nested children row',
    ]) {
      const row = screen.getByText(text).closest('tr')!;
      expect(row).not.toHaveAttribute('aria-current');
      expect(
        getComputedStyle(row).getPropertyValue('--table-row-active-cue-width'),
      ).toBe('0px');
    }
  });
});
