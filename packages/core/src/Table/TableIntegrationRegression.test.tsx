// Copyright (c) Meta Platforms, Inc. and affiliates.
import {useMemo} from 'react';
import {render, screen, cleanup} from '@testing-library/react';
import {afterEach, describe, it, expect, vi} from 'vitest';
import {Table} from './Table';
import {useTableActivation} from './plugins/activation/useTableActivation';
import {setRowSelection} from './tableRowState';
const columns = [{key: 'name', header: 'Name'}];
afterEach(cleanup);
describe('Table integration adversarial regressions', () => {
  it('does not repaint unrelated immutable items when one item changes', () => {
    const count = vi.fn();
    function Fixture({data}: {data: {id: string; name: string}[]}) {
      const activation = useTableActivation<{id: string; name: string}>({
        activeKey: null,
        onActivate: () => {},
      });
      const cols = useMemo(
        () => [
          {
            key: 'name',
            header: 'Name',
            renderCell: (item: {id: string; name: string}) => {
              count(item.id);
              return item.name;
            },
          },
        ],
        [],
      );
      return (
        <Table data={data} columns={cols} idKey="id" plugins={{activation}} />
      );
    }
    const data = [
      {id: 'a', name: 'A'},
      {id: 'b', name: 'B'},
    ];
    const {rerender} = render(<Fixture data={data} />);
    count.mockClear();
    rerender(<Fixture data={[{id: 'a', name: 'AA'}, data[1]]} />);
    expect(count.mock.calls).toEqual([['a']]);
  });
  it('preserves caller current-item state when selection is not an activation owner', () => {
    const row = document.createElement('tr');
    row.setAttribute('aria-current', 'true');
    row.setAttribute('data-active', 'caller');
    setRowSelection(row, false, false);
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.getAttribute('data-active')).toBe('caller');
  });
});
