// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Parent activation protocol: identity, admission, cancellation and mode projections. */
import {render, screen, cleanup} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table} from './Table';
import type {TablePlugin, TableRowContext} from './types';
interface Item extends Record<string, unknown> {
  id: string | number;
}
const columns = [{key: 'id', header: 'ID'}];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Table opt-in plugin protocol', () => {
  it.each(['identity', 'owner'])(
    'reports the %s diagnostic once across data-only rerenders',
    reason => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const activation: TablePlugin<Item> = {
        rowModel: 'flat',
        wholeRowOwner: 'activation',
      };
      const navigation: TablePlugin<Item> = {
        rowModel: 'flat',
        wholeRowOwner: 'navigation',
      };
      const plugins: Record<string, TablePlugin<Item>> = reason === 'owner'
        ? {activation, navigation}
        : {activation};
      const data =
        reason === 'identity' ? [{id: 1}, {id: 1}] : [{id: 1}, {id: 2}];
      const view = render(
        <Table data={data} columns={columns} idKey="id" plugins={plugins} />,
      );
      for (let i = 0; i < 2; i++) {
        view.rerender(
          <Table
            data={data.map(item => ({...item}))}
            columns={columns}
            idKey="id"
            plugins={plugins}
          />,
        );
      }
      const diagnostic =
        reason === 'owner'
          ? 'Conflicting whole-row owners'
          : 'Explicit unique string or finite-number idKey';
      expect(
        warning.mock.calls.filter(([message]) =>
          String(message).includes(diagnostic),
        ),
      ).toHaveLength(1);
    },
  );
  it('passes one type-preserving canonical identity to row transforms', () => {
    const contexts: (TableRowContext | undefined)[] = [];
    const plugin: TablePlugin<Item> = {
      rowModel: 'flat',
      wholeRowOwner: 'activation',
      transformBodyRow(props, _item, _index, context) {
        contexts.push(context);
        return props;
      },
    };
    render(
      <Table
        data={[{id: 0}, {id: '0'}]}
        columns={columns}
        idKey={item => item.id}
        plugins={{activation: plugin}}
      />,
    );
    expect(contexts).toMatchObject([
      {key: 0, identityStatus: 'valid', kind: 'product', logicalIndex: 0},
      {key: '0', identityStatus: 'valid', kind: 'product', logicalIndex: 1},
    ]);
  });
  it('marks both canonical duplicates invalid without hiding ordinary rows', () => {
    const contexts: (TableRowContext | undefined)[] = [];
    const plugin: TablePlugin<Item> = {
      rowModel: 'flat',
      wholeRowOwner: 'activation',
      transformBodyRow(props, _item, _index, context) {
        contexts.push(context);
        return props;
      },
    };
    render(
      <Table
        data={[{id: 42}, {id: '42'}]}
        columns={columns}
        idKey="id"
        plugins={{activation: plugin}}
      />,
    );
    expect(contexts.map(context => context?.identityStatus)).toEqual([
      'duplicate',
      'duplicate',
    ]);
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
  it('rejects competing whole-row owners in either record order', () => {
    for (const reversed of [false, true]) {
      let allowed: boolean | undefined;
      const a: TablePlugin<Item> = {
        rowModel: 'flat',
        wholeRowOwner: 'activation',
        transformBodyRow(props, _item, _index, context) {
          allowed = context?.render.canActivate;
          return props;
        },
      };
      const b: TablePlugin<Item> = {
        rowModel: 'flat',
        wholeRowOwner: 'expansion',
      };
      render(
        <Table
          data={[{id: 'a'}]}
          columns={columns}
          idKey="id"
          plugins={reversed ? {b, a} : {a, b}}
        />,
      );
      expect(allowed).toBe(false);
      cleanup();
    }
  });
  it('derives children mode for wrapper contributions', () => {
    let mode: string | undefined;
    const plugin: TablePlugin<Item> = {
      rowModel: 'flat',
      transformScrollWrapper(props, context) {
        mode = context?.mode;
        return props;
      },
    };
    render(
      <Table plugins={{load: plugin}}>
        <tbody>
          <tr>
            <td>Custom</td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(mode).toBe('children');
  });
});
