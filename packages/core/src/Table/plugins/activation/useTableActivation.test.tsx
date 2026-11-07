// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableActivation.test.tsx
 * @input useTableActivation, Table, React testing utilities
 * @output Functional tests for the row-activation plugin
 * @position Test file; validates controlled active state, press parity,
 *   handler composition, and accidental-activation guards
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {useMemo, useState} from 'react';
import {render, renderHook, screen, fireEvent} from '@testing-library/react';
import {createPortal} from 'react-dom';
import {Table} from '../../Table';
import {useTableActivation} from './useTableActivation';
import {
  getActiveWashClassNames,
  getClickableRowClassNames,
  selectionEndsIntersectRow,
} from './useTableActivation';
import {useTableSelection} from '../selection/useTableSelection';
import type {BodyRowRenderProps, TableColumn, TablePlugin} from '../../types';
import {__resetDevWarnings} from '../../../utils/devWarning';

// =============================================================================
// Test Data
// =============================================================================

interface Member extends Record<string, unknown> {
  id: string;
  name: string;
  team: string;
}

const members: Member[] = [
  {id: '1', name: 'Ada', team: 'Core'},
  {id: '2', name: 'Grace', team: 'Infra'},
  {id: '3', name: 'Alan', team: 'Core'},
];

const memberColumns: TableColumn<Member>[] = [
  {key: 'name', header: 'Name'},
  {key: 'team', header: 'Team'},
];

function bodyRows(): HTMLTableRowElement[] {
  // First row is the header row.
  return screen.getAllByRole('row').slice(1) as HTMLTableRowElement[];
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

// =============================================================================
// Controlled state reflection
// =============================================================================

describe('controlled active state', () => {
  it('reflects the controlled key as data-active on the matching row only', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[1].getAttribute('data-active')).toBe('true');
    expect(rows[2].hasAttribute('data-active')).toBe(false);
  });

  it('moves active state to the new row when the controlled key changes', () => {
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    rerender(<Harness activeKey="3" />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[2].getAttribute('data-active')).toBe('true');
  });

  it('does not re-render rows when only the controlled key changes', () => {
    const renderCell = vi.fn((item: Member) => item.name);
    const columns: TableColumn<Member>[] = [{key: 'name', renderCell}];
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    expect(renderCell).toHaveBeenCalledTimes(3);
    rerender(<Harness activeKey="2" />);
    // Active state moves through the store without row re-renders.
    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(bodyRows()[1].getAttribute('data-active')).toBe('true');
  });

  it('emits no selection or navigation semantics', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    for (const row of rows.slice(1)) {
      expect(row.getAttribute('aria-current')).toBeNull();
    }
    for (const row of rows) {
      expect(row.getAttribute('aria-selected')).toBeNull();
      // Native row semantics are kept: no button or link role.
      expect(row.getAttribute('role')).toBeNull();
    }
  });

  it('leaves every row of a repeated id inert and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const onActivate = vi.fn();
    const dupes: Member[] = [
      {id: '1', name: 'Ada', team: 'Core'},
      {id: '1', name: 'Ada 2', team: 'Infra'},
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate,
      });
      return (
        <Table
          data={dupes}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    try {
      render(<Harness />);
      const rows = bodyRows();
      // A shared id is invalid identity: neither row exposes current state.
      for (const row of rows) {
        expect(row.hasAttribute('data-active')).toBe(false);
        expect(row.getAttribute('aria-current')).toBeNull();
        fireEvent.click(row);
      }
      expect(onActivate).not.toHaveBeenCalled();
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('share an idKey value'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('stays inert when the idKey property is missing from a row', () => {
    const onActivate = vi.fn();
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: 'undefined',
        onActivate,
      });
      return (
        <Table
          data={[{name: 'No id', team: 'Core'}] as Member[]}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[0].hasAttribute('tabindex')).toBe(false);
    fireEvent.click(rows[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('leaves a competing current-state owner in place and stays inert', () => {
    const onActivate = vi.fn();
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin, currentOwner: currentOwnerPlugin()}}
        />
      );
    }
    function currentOwnerPlugin(): TablePlugin<Member> {
      return {
        transformBodyRow: props => ({
          ...props,
          htmlProps: {
            ...props.htmlProps,
            'aria-current': 'page' as const,
          },
        }),
      };
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    fireEvent.click(rows[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('removes only the current exposure the module wrote', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {unmount} = render(<Harness />);
    const rows = bodyRows();
    // The module marked the row it exposed.
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows[0].hasAttribute('data-activation-current')).toBe(true);
    unmount();
    expect(rows[0].getAttribute('aria-current')).toBeNull();
  });
});

// =============================================================================
// Plugin identity
// =============================================================================

describe('plugin identity', () => {
  it('returns one stable plugin while keys and callbacks change', () => {
    const firstActivate = vi.fn();
    const secondActivate = vi.fn();
    const {result, rerender} = renderHook(
      ({activeKey, onActivate}) =>
        useTableActivation<Member>({activeKey, onActivate}),
      {
        initialProps: {
          activeKey: '1',
          onActivate: firstActivate,
        },
      },
    );
    const first = result.current;
    rerender({activeKey: '2', onActivate: firstActivate});
    expect(result.current).toBe(first);
    rerender({activeKey: '2', onActivate: secondActivate});
    expect(result.current).toBe(first);
  });

  it('re-resolves eligibility when the controlled key changes, and honors flips', () => {
    let eligible = true;
    const getIsItemActivatable = vi.fn(() => eligible);
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={null} />);
    const mountCalls = getIsItemActivatable.mock.calls.length;
    expect(mountCalls).toBeGreaterThan(0);
    // A controlled-key change reaches rows through the store, re-resolving
    // eligibility on apply.
    rerender(<Harness activeKey="1" />);
    expect(getIsItemActivatable.mock.calls.length).toBeGreaterThan(mountCalls);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    // Flipping the predicate clears the active paint without a row update.
    eligible = false;
    rerender(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBeNull();
  });
});

// =============================================================================
// Key equality
// =============================================================================

describe('key equality', () => {
  it('uses strict type-preserving equality for property keys', () => {
    // A property-name idKey resolves String(item[idKey]), so the numeric
    // activeKey 1 must not match the resolved "1".
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={1} />);
    expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });

  it('preserves function-returned key types and emits the same key', () => {
    interface NumericRow extends Record<string, unknown> {
      id: number;
      name: string;
    }
    const rows: NumericRow[] = [
      {id: 1, name: 'Ada'},
      {id: 2, name: 'Grace'},
    ];
    const onActivate = vi.fn();
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<NumericRow>({
        activeKey,
        onActivate,
      });
      return (
        <Table
          data={rows}
          columns={[{key: 'name', header: 'Name'}]}
          idKey={item => item.id}
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    // String "1" does not match the numeric resolved key 1.
    expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey={1} />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    fireEvent.click(bodyRows()[1]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(rows[1], 2);
  });

  it('projects numeric property keys through String', () => {
    interface NumericPropRow extends Record<string, unknown> {
      id: number;
      name: string;
    }
    const rows: NumericPropRow[] = [
      {id: 1, name: 'Ada'},
      {id: 2, name: 'Grace'},
    ];
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<NumericPropRow>({
        activeKey,
        onActivate: () => {},
      });
      return (
        <Table
          data={rows}
          columns={[{key: 'name', header: 'Name'}]}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={1} />);
    // Property-name keys convert with String, so the number 1 matches nothing.
    expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey="1" />);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });

  it('treats non-string non-finite property values as invalid identity', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const onActivate = vi.fn();
    const rows = [
      {id: true, name: 'Flag'},
      {id: NaN, name: 'Not a number'},
      {id: 'ok', name: 'Fine'},
    ];
    function Harness() {
      const plugin = useTableActivation<{
        id: unknown;
        name: string;
      }>({
        activeKey: 'ok',
        onActivate,
      });
      return (
        <Table
          data={rows}
          columns={[{key: 'name', header: 'Name'}]}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    try {
      render(<Harness />);
      const body = bodyRows();
      expect(body[0].hasAttribute('tabindex')).toBe(false);
      expect(body[1].hasAttribute('tabindex')).toBe(false);
      fireEvent.click(body[0]);
      fireEvent.click(body[1]);
      expect(onActivate).not.toHaveBeenCalled();
      // The valid row still activates.
      expect(body[2].getAttribute('data-active')).toBe('true');
    } finally {
      warn.mockRestore();
    }
  });

  it('tells function keys 0 and "0" apart while emitting the canonical key', () => {
    const onActivate = vi.fn();
    const rows = [{id: 0 as string | number}, {id: '0' as string | number}];
    function Harness({activeKey}: {activeKey: string | number | null}) {
      const plugin = useTableActivation<{id: string | number}>({
        activeKey,
        onActivate,
      });
      return (
        <Table
          data={rows}
          columns={[{key: 'id', header: 'Id'}]}
          idKey={item => item.id}
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey={0} />);
    const body = bodyRows();
    // Two distinct rows reconcile (no React key collision).
    expect(body).toHaveLength(2);
    expect(body[0].getAttribute('data-active')).toBe('true');
    expect(body[1].hasAttribute('data-active')).toBe(false);
    rerender(<Harness activeKey="0" />);
    expect(body[0].hasAttribute('data-active')).toBe(false);
    expect(body[1].getAttribute('data-active')).toBe('true');
    fireEvent.click(body[0]);
    expect(onActivate).toHaveBeenCalledWith(rows[0], 0);
  });

  it('keeps released keys and stays silent without an identity consumer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const dupes: Member[] = [
      {id: '1', name: 'Ada', team: 'Core'},
      {id: '1', name: 'Ada 2', team: 'Infra'},
    ];
    try {
      render(<Table data={dupes} columns={memberColumns} idKey="id" />);
      // Both rows render under the released keys; no identity diagnostic.
      expect(bodyRows()).toHaveLength(2);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns earlier props unchanged for a declaratively marked current row', () => {
    const onActivate = vi.fn();
    function currentOwnerPlugin(): TablePlugin<Member> {
      return {
        transformBodyRow: props => ({
          ...props,
          htmlProps: {
            ...props.htmlProps,
            'aria-current': 'page' as const,
          },
        }),
      };
    }
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{currentOwner: currentOwnerPlugin(), activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    // No tab stop and no key affordances were added on top.
    expect(rows[0].hasAttribute('tabindex')).toBe(false);
    expect(rows[0].hasAttribute('aria-keyshortcuts')).toBe(false);
    fireEvent.click(rows[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('stays inert without an explicit idKey and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const onActivate = vi.fn();
    try {
      function Harness() {
        const plugin = useTableActivation<Member>({
          activeKey: '1',
          onActivate,
        });
        return (
          <Table
            data={members}
            columns={memberColumns}
            plugins={{activation: plugin}}
          />
        );
      }
      render(<Harness />);
      const rows = bodyRows();
      for (const row of rows) {
        expect(row.hasAttribute('data-active')).toBe(false);
        expect(row.hasAttribute('tabindex')).toBe(false);
      }
      fireEvent.click(rows[0]);
      expect(onActivate).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });
});

// =============================================================================
// Pointer activation
// =============================================================================

describe('pointer activation', () => {
  function ActiveHarness({
    onActivate,
    getIsItemActivatable,
  }: {
    onActivate: (item: Member, key: string | number) => void;
    getIsItemActivatable?: (item: Member) => boolean;
  }) {
    const [activeKey, setActiveKey] = useState<string | null>(null);
    const plugin = useTableActivation<Member>({
      activeKey,
      onActivate: (item, key) => {
        onActivate(item, key);
        setActiveKey(key as string);
      },
      getIsItemActivatable,
    });
    return (
      <Table
        data={members}
        columns={memberColumns}
        idKey="id"
        plugins={{activation: plugin}}
      />
    );
  }

  it('activates on primary click and updates controlled state', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    fireEvent.click(bodyRows()[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[0], '1');
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
  });

  it('does not activate on auxiliary clicks', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    fireEvent.click(row, {button: 2});
    fireEvent.click(row, {button: 1});
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores clicks from nested interactive descendants', () => {
    const onActivate = vi.fn();
    const buttonActivate = vi.fn();
    const columns: TableColumn<Member>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'team',
        header: 'Team',
        renderCell: () => (
          <button type="button" onClick={buttonActivate}>
            Manage
          </button>
        ),
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', {name: 'Manage'})[0]);
    expect(buttonActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores presses on read-only controls', () => {
    const onActivate = vi.fn();
    const columns: TableColumn<Member>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'team',
        header: 'Team',
        renderCell: () => <span aria-readonly="true">Core</span>,
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByText('Core')[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores clicks from portalled controls', () => {
    const onActivate = vi.fn();
    const menuActivate = vi.fn();
    function PortalledMenu() {
      return createPortal(
        <button type="button" onClick={menuActivate}>
          Row menu
        </button>,
        document.body,
      );
    }
    const columns: TableColumn<Member>[] = [
      {
        key: 'name',
        header: 'Name',
        renderCell: item => (
          <>
            {item.name}
            <PortalledMenu />
          </>
        ),
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', {name: 'Row menu'})[0]);
    expect(menuActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('suppresses activation for an in-row text selection only', () => {
    const onActivate = vi.fn();
    render(<ActiveHarness onActivate={onActivate} />);
    const rows = bodyRows();
    // A selection elsewhere on the page does not block activation.
    const outsider = document.createElement('p');
    outsider.textContent = 'outside';
    document.body.appendChild(outsider);
    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(outsider);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(outsideRange);
    fireEvent.click(rows[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    // A non-collapsed selection intersecting the row suppresses it.
    const inRowRange = document.createRange();
    inRowRange.selectNodeContents(rows[1]);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(inRowRange);
    fireEvent.click(rows[1]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    // A drag anchored outside the row but covering it suppresses it too.
    // (jsdom collapses cross-subtree ranges, so the spanning geometry is
    // pinned directly on the pure helper below rather than through a live
    // Selection here.)
    outsider.remove();
  });

  it('treats a selection spanning across the row as intersecting it', () => {
    render(<ActiveHarness onActivate={vi.fn()} />);
    const rows = bodyRows();
    const before = document.createElement('p');
    before.textContent = 'before';
    const after = document.createElement('p');
    after.textContent = 'after';
    document.body.prepend(before);
    document.body.append(after);
    const inRow = rows[1].querySelector('td')!.firstChild!;
    // Either end inside the row intersects.
    expect(selectionEndsIntersectRow(rows[1], inRow, before.firstChild)).toBe(
      true,
    );
    expect(selectionEndsIntersectRow(rows[1], before.firstChild, inRow)).toBe(
      true,
    );
    // Ends on opposite sides of the row intersect, in either direction.
    expect(
      selectionEndsIntersectRow(rows[1], before.firstChild, after.firstChild),
    ).toBe(true);
    expect(
      selectionEndsIntersectRow(rows[1], after.firstChild, before.firstChild),
    ).toBe(true);
    // Both ends on the same side do not.
    expect(selectionEndsIntersectRow(rows[1], before, before.firstChild)).toBe(
      false,
    );
    expect(selectionEndsIntersectRow(rows[1], after, after.firstChild)).toBe(
      false,
    );
    expect(selectionEndsIntersectRow(rows[1], before.firstChild, null)).toBe(
      false,
    );
    before.remove();
    after.remove();
  });

  it('runs earlier handlers first and honors preventDefault cancellation', () => {
    const onActivate = vi.fn();
    const earlierEffect = vi.fn();
    const cancelling: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: event => {
            earlierEffect(event.currentTarget);
            event.preventDefault();
          },
        },
      }),
    };
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{cancelling, activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(bodyRows()[0]);
    // The earlier side effect is preserved while activation is cancelled.
    expect(earlierEffect).toHaveBeenCalledTimes(1);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('preserves earlier handler side effects on the activation path', () => {
    const onActivate = vi.fn();
    const earlierEffect = vi.fn();
    const observing: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          onClick: event => {
            earlierEffect(event.currentTarget);
          },
        },
      }),
    };
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{observing, activation: plugin}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(bodyRows()[0]);
    expect(earlierEffect).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Keyboard activation
// =============================================================================

describe('keyboard activation', () => {
  function KeyboardHarness({
    onActivate,
    plugins,
  }: {
    onActivate: (item: Member, key: string | number) => void;
    plugins?: Record<string, TablePlugin<Member>>;
  }) {
    const activation = useTableActivation<Member>({
      activeKey: null,
      onActivate,
    });
    return (
      <Table
        data={members}
        columns={memberColumns}
        idKey="id"
        plugins={{...plugins, activation}}
      />
    );
  }

  it('makes eligible rows sequential focus stops with Enter/Space metadata', () => {
    render(<KeyboardHarness onActivate={() => {}} />);
    for (const row of bodyRows()) {
      expect(row.getAttribute('tabindex')).toBe('0');
      const shortcuts = row.getAttribute('aria-keyshortcuts') ?? '';
      expect(shortcuts).toContain('Enter');
      expect(shortcuts).toContain('Space');
    }
  });

  it('activates on Enter and Space', () => {
    const onActivate = vi.fn();
    render(<KeyboardHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    row.focus();
    fireEvent.keyDown(row, {key: 'Enter'});
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[0], '1');
    fireEvent.keyDown(row, {key: ' '});
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('prevents page scroll on Space and ignores key repeat', () => {
    const onActivate = vi.fn();
    render(<KeyboardHarness onActivate={onActivate} />);
    const row = bodyRows()[0];
    // Returning false means preventDefault was called.
    expect(fireEvent.keyDown(row, {key: ' '})).toBe(false);
    expect(onActivate).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(row, {key: ' ', repeat: true});
    fireEvent.keyDown(row, {key: 'Enter', repeat: true});
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('ignores keypresses starting in nested controls', () => {
    const onActivate = vi.fn();
    const columns: TableColumn<Member>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'team',
        header: 'Team',
        renderCell: () => <button type="button">Manage</button>,
      },
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={columns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const button = screen.getAllByRole('button', {name: 'Manage'})[0];
    button.focus();
    fireEvent.keyDown(button, {key: 'Enter'});
    fireEvent.keyDown(button, {key: ' '});
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('respects an earlier roving tabIndex while keeping activation', () => {
    const onActivate = vi.fn();
    const roving: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {...props.htmlProps, tabIndex: -1},
      }),
    };
    render(<KeyboardHarness onActivate={onActivate} plugins={{roving}} />);
    const row = bodyRows()[0];
    expect(row.getAttribute('tabindex')).toBe('-1');
    row.focus();
    fireEvent.keyDown(row, {key: 'Enter'});
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('composes aria-keyshortcuts with earlier metadata', () => {
    const labelling: TablePlugin<Member> = {
      transformBodyRow: props => ({
        ...props,
        htmlProps: {...props.htmlProps, 'aria-keyshortcuts': 'Alt+A'},
      }),
    };
    render(<KeyboardHarness onActivate={() => {}} plugins={{labelling}} />);
    const shortcuts = bodyRows()[0].getAttribute('aria-keyshortcuts') ?? '';
    expect(shortcuts).toContain('Alt+A');
    expect(shortcuts).toContain('Enter');
    expect(shortcuts).toContain('Space');
  });
});

// =============================================================================
// Eligibility
// =============================================================================

describe('row eligibility', () => {
  it('leaves ineligible rows without affordance or state, even on key match', () => {
    const onActivate = vi.fn();
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate,
        getIsItemActivatable: item => item.id !== '2',
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    // The key matches, but the ineligible row reflects nothing.
    expect(rows[1].hasAttribute('data-active')).toBe(false);
    expect(rows[1].hasAttribute('tabindex')).toBe(false);
    expect(rows[1].getAttribute('aria-keyshortcuts')).toBeNull();
    fireEvent.click(rows[1]);
    fireEvent.keyDown(rows[1], {key: 'Enter'});
    expect(onActivate).not.toHaveBeenCalled();
    // Eligible rows are unaffected.
    expect(rows[0].getAttribute('tabindex')).toBe('0');
  });
});

// =============================================================================
// Paint ownership and cleanup
// =============================================================================

describe('paint ownership and cleanup', () => {
  it('paints the active wash through a stylesheet class, never an inline style', () => {
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    // The wash must not be inline: selection writes its fill inline, so an
    // inline active wash would race it. A stylesheet class always loses to
    // inline, making selection precedence deterministic.
    expect(rows[1].style.backgroundColor).toBe('');
    // The wash classes ride every transformed row; only the live
    // `data-active` attribute paints them, so a className rewrite from
    // stale transform props can neither strand nor steal the wash.
    const washClasses = getActiveWashClassNames();
    expect(washClasses.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const cls of washClasses) {
        expect(row.classList.contains(cls)).toBe(true);
      }
    }
    expect(rows[1].getAttribute('data-active')).toBe('true');
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[2].hasAttribute('data-active')).toBe(false);
  });

  it('keeps paint on the live active row across TableContext re-renders', () => {
    function Harness({
      striped,
      dividers,
    }: {
      striped: boolean;
      dividers: 'rows' | 'none';
    }) {
      const [activeKey, setActiveKey] = useState<string | null>('2');
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: (_item, key) => setActiveKey(key),
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          isStriped={striped}
          dividers={dividers}
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness striped={false} dividers="none" />);
    // Move the active row through the store path, then re-render rows from
    // TableContext alone: the memoized rows reuse their transform props
    // while TableRow recomputes className, which used to repaint the
    // previous row as active and strip the fill from the current one.
    fireEvent.click(bodyRows()[0]);
    expect(bodyRows()[0].getAttribute('data-active')).toBe('true');
    rerender(<Harness striped={true} dividers="none" />);
    rerender(<Harness striped={true} dividers="rows" />);
    rerender(<Harness striped={false} dividers="rows" />);
    const rows = bodyRows();
    expect(rows[0].getAttribute('data-active')).toBe('true');
    expect(rows[1].hasAttribute('data-active')).toBe(false);
    expect(rows[2].hasAttribute('data-active')).toBe(false);
    // The styling hook is unconditional on every row, so no rewrite drops
    // it; the attribute gates the paint.
    const washClasses = getActiveWashClassNames();
    for (const row of rows) {
      for (const cls of washClasses) {
        expect(row.classList.contains(cls)).toBe(true);
      }
      expect(row.style.backgroundColor).toBe('');
    }
  });

  it('composes with selection without clobbering either state', () => {
    function Harness() {
      const activation = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      const selection = useTableSelection<Member>({
        getIsItemSelected: item => item.id === '2',
        onSelectItem: () => {},
        onSelectAll: () => {},
        getIsAllSelected: () => false,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{selection, activation}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    const activeRow = rows.find(
      row => row.getAttribute('data-active') === 'true',
    );
    expect(activeRow).toBeDefined();
    // Both owners reflect state on the same row; neither clears the other.
    expect(activeRow!.getAttribute('aria-selected')).toBe('true');
    // Activation contributes no inline fill of its own.
    expect(activeRow!.style.backgroundColor).not.toBe('');
  });

  it('clears active paint when the plugin is removed while mounted', () => {
    function Harness({withActivation}: {withActivation: boolean}) {
      const activation = useTableActivation<Member>({
        activeKey: '2',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={withActivation ? {activation} : {}}
        />
      );
    }
    const {rerender} = render(<Harness withActivation={true} />);
    expect(bodyRows()[1].getAttribute('data-active')).toBe('true');
    rerender(<Harness withActivation={false} />);
    for (const row of bodyRows()) {
      expect(row.hasAttribute('data-active')).toBe(false);
      expect(row.querySelector('[data-activation-bar]')).toBeNull();
    }
  });
});

// =============================================================================
// Review follow-ups: bounded updates, key tagging, plugin order, ranges
// =============================================================================

describe('review follow-ups', () => {
  it('touches only the old and new active rows on a key-only change', () => {
    // Stable callbacks: only `activeKey` changes, the FR12 key-only path.
    const onActivate = () => {};
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    const rows = bodyRows();
    const setSpies = rows.map(row => vi.spyOn(row, 'setAttribute'));
    const removeSpies = rows.map(row => vi.spyOn(row, 'removeAttribute'));
    try {
      rerender(<Harness activeKey="2" />);
      // The untouched row is never rewritten; only old/new active rows repaint.
      expect(setSpies[2]).not.toHaveBeenCalled();
      expect(removeSpies[2]).not.toHaveBeenCalled();
      expect(rows[0].hasAttribute('data-active')).toBe(false);
      expect(rows[1].getAttribute('data-active')).toBe('true');
    } finally {
      for (const spy of [...setSpies, ...removeSpies]) {
        spy.mockRestore();
      }
    }
  });

  it('ignores an onActivate-only identity change without touching rows', () => {
    // Documented usage passes an inline `onActivate`, so every render
    // hands the hook a new callback identity (module FR12, PR1).
    const getIsItemActivatable = vi.fn((_item: Member) => true);
    function Harness({activeKey}: {activeKey: string | null}) {
      const plugin = useTableActivation<Member>({
        activeKey,
        onActivate: () => {},
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness activeKey="1" />);
    const rows = bodyRows();
    const predicateCalls = getIsItemActivatable.mock.calls.length;
    expect(predicateCalls).toBeGreaterThan(0);
    const setSpies = rows.map(row => vi.spyOn(row, 'setAttribute'));
    const removeSpies = rows.map(row => vi.spyOn(row, 'removeAttribute'));
    const spies = [...setSpies, ...removeSpies];
    try {
      // Same key, new `onActivate` identity: only the active bucket is
      // notified, so the predicate re-runs for the active row alone and
      // no row is rewritten.
      rerender(<Harness activeKey="1" />);
      const newCalls = getIsItemActivatable.mock.calls.slice(predicateCalls);
      expect(newCalls.length).toBeGreaterThan(0);
      for (const [item] of newCalls) {
        expect(item.id).toBe('1');
      }
      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
      // Convergence is intact: the active row still reflects the key.
      expect(rows[0].getAttribute('data-active')).toBe('true');
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });

  it('paints the pointer cursor only on eligible rows and flips it live', () => {
    function Harness({
      getIsItemActivatable,
    }: {
      getIsItemActivatable: (item: Member) => boolean;
    }) {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate: () => {},
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(
      <Harness getIsItemActivatable={item => item.id !== '2'} />,
    );
    const rows = bodyRows();
    // The cursor hook rides every row; only the eligibility attribute
    // paints the pointer, so a className rewrite from stale transform
    // props can neither strand nor steal it.
    const cursorClasses = getClickableRowClassNames();
    expect(cursorClasses.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const cls of cursorClasses) {
        expect(row.classList.contains(cls)).toBe(true);
      }
    }
    expect(rows[0].getAttribute('data-activation-eligible')).toBe('true');
    expect(rows[1].hasAttribute('data-activation-eligible')).toBe(false);
    expect(rows[2].getAttribute('data-activation-eligible')).toBe('true');
    // A later flip converges through the same live update as the tab stop.
    rerender(<Harness getIsItemActivatable={() => true} />);
    const flipped = bodyRows();
    expect(flipped[1].getAttribute('data-activation-eligible')).toBe('true');
    expect(flipped[1].getAttribute('tabindex')).toBe('0');
  });

  it('leaves a later current-state owner in place without affordances', () => {
    const onActivate = vi.fn();
    function laterOwnerPlugin(): TablePlugin<Member> {
      return {
        transformBodyRow: props => ({
          ...props,
          htmlProps: {
            ...props.htmlProps,
            'aria-current': 'page' as const,
          },
        }),
      };
    }
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin, later: laterOwnerPlugin()}}
        />
      );
    }
    render(<Harness />);
    const rows = bodyRows();
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    // The row stays inert without advertising activation affordances.
    expect(rows[0].hasAttribute('tabindex')).toBe(false);
    expect(rows[0].hasAttribute('aria-keyshortcuts')).toBe(false);
    fireEvent.click(rows[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('sheds affordances when a new predicate excludes the active row', () => {
    const onActivate = vi.fn();
    function Harness({
      getIsItemActivatable,
    }: {
      getIsItemActivatable: (item: Member) => boolean;
    }) {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate,
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const {rerender} = render(<Harness getIsItemActivatable={() => true} />);
    expect(bodyRows()[0].getAttribute('tabindex')).toBe('0');
    rerender(<Harness getIsItemActivatable={item => item.id !== '1'} />);
    const rows = bodyRows();
    expect(rows[0].hasAttribute('data-active')).toBe(false);
    expect(rows[0].hasAttribute('tabindex')).toBe(false);
    expect(rows[0].hasAttribute('aria-keyshortcuts')).toBe(false);
    fireEvent.click(rows[0]);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('keys an invalid row apart from a valid row:0 id', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    __resetDevWarnings();
    const tricky: Member[] = [
      {id: 'dup', name: 'First', team: 'Core'},
      {id: 'dup', name: 'Second', team: 'Infra'},
      {id: 'row:0', name: 'Row zero', team: 'Core'},
    ];
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: 'row:0',
        onActivate: () => {},
      });
      return (
        <Table
          data={tricky}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    try {
      render(<Harness />);
      expect(bodyRows()).toHaveLength(3);
      expect(
        error.mock.calls.some(call => String(call[0]).includes('same key')),
      ).toBe(false);
      const rows = bodyRows();
      expect(rows[0].hasAttribute('data-active')).toBe(false);
      expect(rows[1].hasAttribute('data-active')).toBe(false);
      expect(rows[2].getAttribute('data-active')).toBe('true');
    } finally {
      error.mockRestore();
    }
  });

  it('suppresses activation when any selected range intersects the row', () => {
    function Harness({
      onActivate,
    }: {
      onActivate: (item: Member, key: string | number) => void;
    }) {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const onActivate = vi.fn();
    render(<Harness onActivate={onActivate} />);
    const rows = bodyRows();
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    const outsideRange = document.createRange();
    outsideRange.selectNodeContents(outside);
    const inRowRange = document.createRange();
    inRowRange.selectNodeContents(rows[0].querySelector('td')!);
    const originalGetSelection = document.getSelection;
    document.getSelection = (() => ({
      isCollapsed: false,
      rangeCount: 2,
      getRangeAt: (index: number) => (index === 0 ? outsideRange : inRowRange),
    })) as unknown as typeof document.getSelection;
    try {
      fireEvent.click(rows[0]);
      expect(onActivate).not.toHaveBeenCalled();
    } finally {
      document.getSelection = originalGetSelection;
      outside.remove();
    }
  });

  it('keeps activation when no selected range intersects the row', () => {
    function Harness({
      onActivate,
    }: {
      onActivate: (item: Member, key: string | number) => void;
    }) {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    const onActivate = vi.fn();
    render(<Harness onActivate={onActivate} />);
    const rows = bodyRows();
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.appendChild(outside);
    const firstRange = document.createRange();
    firstRange.selectNodeContents(outside);
    const secondRange = document.createRange();
    secondRange.selectNodeContents(outside);
    const originalGetSelection = document.getSelection;
    document.getSelection = (() => ({
      isCollapsed: false,
      rangeCount: 2,
      getRangeAt: (index: number) => (index === 0 ? firstRange : secondRange),
    })) as unknown as typeof document.getSelection;
    try {
      fireEvent.click(rows[0]);
      expect(onActivate).toHaveBeenCalledTimes(1);
    } finally {
      document.getSelection = originalGetSelection;
      outside.remove();
    }
  });
});

describe('review follow-ups, round two', () => {
  it('evaluates the predicate once per row on mount', () => {
    const getIsItemActivatable = vi.fn(() => true);
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: null,
        onActivate: () => {},
        getIsItemActivatable,
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    render(<Harness />);
    // Once per row in the transform; the mount apply reuses that result and
    // the mount notify reaches no bucket for a null key.
    expect(getIsItemActivatable).toHaveBeenCalledTimes(3);
  });

  it('warns once for rows with no usable identity value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const onActivate = vi.fn();
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: 'undefined',
        onActivate,
      });
      return (
        <Table
          data={[{name: 'No id', team: 'Core'}] as Member[]}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: plugin}}
        />
      );
    }
    try {
      render(<Harness />);
      expect(bodyRows()[0].hasAttribute('data-active')).toBe(false);
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('no usable idKey value'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});

// =============================================================================
// Review follow-ups, round three
// =============================================================================

describe('review follow-ups, round three', () => {
  it('leaves canonical identity off for an unrelated four-parameter transform', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    const dupes: Member[] = [
      {id: '1', name: 'Ada', team: 'Core'},
      {id: '1', name: 'Ada 2', team: 'Infra'},
    ];
    // Four declared parameters, but no identity opt-in: the arity alone
    // must not switch the table onto canonical keys and diagnostics.
    function nosyPlugin(): TablePlugin<Member> {
      return {
        transformBodyRow: ((
          props: BodyRowRenderProps,
          _item: Member,
          _index: number,
          _extra: unknown,
        ) => props) as TablePlugin<Member>['transformBodyRow'],
      };
    }
    try {
      render(
        <Table
          data={dupes}
          columns={memberColumns}
          idKey="id"
          plugins={{nosy: nosyPlugin()}}
        />,
      );
      expect(bodyRows()).toHaveLength(2);
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('share an idKey value'),
        ),
      ).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps canonical identity when the activation transform is wrapped', () => {
    const onActivate = vi.fn();
    function Harness() {
      const activation = useTableActivation<Member>({
        activeKey: null,
        onActivate,
      });
      // A rest-argument wrapper reports zero declared parameters, so an
      // arity gate would leave every row inert; the plugin-level opt-in
      // survives the wrap.
      const wrapped = useMemo<TablePlugin<Member>>(() => {
        const inner = activation.transformBodyRow;
        type FourArgTransform = (
          ...args: [
            BodyRowRenderProps,
            Member,
            number,
            (string | number | undefined)?,
          ]
        ) => BodyRowRenderProps;
        const fourArg: FourArgTransform | undefined = inner;
        const transformBodyRow: FourArgTransform = (...args) =>
          fourArg == null ? args[0] : fourArg(...args);
        return {...activation, transformBodyRow};
      }, [activation]);
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{activation: wrapped}}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(bodyRows()[0]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[0], '1');
  });

  it('admits a row the predicate later allows without a row update', () => {
    const onActivate = vi.fn();
    const renderCell = vi.fn((item: Member) => item.name);
    const columns: TableColumn<Member>[] = [{key: 'name', renderCell}];
    function Harness({allowSecond}: {allowSecond: boolean}) {
      const plugin = useTableActivation<Member>({
        activeKey: '2',
        onActivate,
        getIsItemActivatable: item => allowSecond || item.id !== '2',
      });
      // A stable plugins record keeps row props identical across the flip,
      // so convergence below rides the store subscription, not a re-render.
      const plugins = useMemo(() => ({activation: plugin}), [plugin]);
      return (
        <Table data={members} columns={columns} idKey="id" plugins={plugins} />
      );
    }
    const {rerender} = render(<Harness allowSecond={false} />);
    expect(renderCell).toHaveBeenCalledTimes(3);
    expect(bodyRows()[1].hasAttribute('tabindex')).toBe(false);
    rerender(<Harness allowSecond={true} />);
    // No row re-rendered for the flip.
    expect(renderCell).toHaveBeenCalledTimes(3);
    const rows = bodyRows();
    // The admitted row converges: tab stop, key metadata, and activation.
    expect(rows[1].getAttribute('tabindex')).toBe('0');
    expect(rows[1].getAttribute('aria-keyshortcuts')).toContain('Enter');
    fireEvent.click(rows[1]);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith(members[1], '2');
    expect(rows[1].getAttribute('data-active')).toBe('true');
  });

  it('warns when an earlier current-state owner keeps a row inert', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    __resetDevWarnings();
    function currentOwnerPlugin(): TablePlugin<Member> {
      return {
        transformBodyRow: props => ({
          ...props,
          htmlProps: {
            ...props.htmlProps,
            'aria-current': 'page' as const,
          },
        }),
      };
    }
    function Harness() {
      const plugin = useTableActivation<Member>({
        activeKey: '1',
        onActivate: () => {},
      });
      return (
        <Table
          data={members}
          columns={memberColumns}
          idKey="id"
          plugins={{currentOwner: currentOwnerPlugin(), activation: plugin}}
        />
      );
    }
    try {
      render(<Harness />);
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('already exposes its own aria-current'),
        ),
      ).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
