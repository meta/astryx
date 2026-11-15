// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Virtual stripes retain the same hover motion on each logical parity. */
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {Table} from './Table';
import {useTableRowsVirtualization} from './plugins/virtualization/useTableRowsVirtualization';
const data = Array.from({length: 20}, (_, i) => ({
  id: String(i),
  name: `Item ${i}`,
}));
const columns = [{key: 'name', header: 'Name'}];
function Fixture() {
  const virtualization = useTableRowsVirtualization({
    rowHeight: 56,
    initialViewportHeight: 240,
  });
  return (
    <>
      <Table data={data} columns={columns} idKey="id" hasHover isStriped />
      <Table
        data={data}
        columns={columns}
        idKey="id"
        hasHover
        isStriped
        virtualization={virtualization}
      />
    </>
  );
}
afterEach(cleanup);
describe('Table windowed hover parity', () => {
  it('preserves each row background transition regardless of logical parity', () => {
    const {container} = render(<Fixture />);
    const tables = container.querySelectorAll('table');
    const base = getComputedStyle(tables[0].querySelector('tbody tr')!);
    expect(base.transitionProperty).toBe('background-color');
    for (const row of tables[1].querySelectorAll(
      'tbody tr:not([aria-hidden])',
    )) {
      const style = getComputedStyle(row);
      expect(style.transitionProperty).toBe(base.transitionProperty);
      expect(style.transitionDuration).toBe(base.transitionDuration);
      expect(style.transitionTimingFunction).toBe(
        base.transitionTimingFunction,
      );
    }
  });
});
