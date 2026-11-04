// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableActivation.test.tsx
 * @input Table, activation hook and React interaction utilities
 * @output Activation requests, semantics, composition and lifetime regressions
 * @position Colocated functional tests for flat row activation
 */
/* eslint-disable @eslint-react/jsx-no-children-prop -- Direct-transform fixtures explicitly pass the plugin render-props children slot. */
import {StrictMode, memo, createRef, useState, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Table} from '../../Table';
import {CheckboxInput} from '../../../CheckboxInput';
import type {
  BodyRowRenderProps,
  TableColumn,
  TablePlugin,
  TableRowContext,
} from '../../types';
import {hasTextSelection} from '../../../hooks/useClickableContainer';
import {finalizeRowActivation} from './activationGuard';
import {
  useTableActivation,
  type UseTableActivationConfig,
} from './useTableActivation';

interface Item extends Record<string, unknown> {
  id: string | number;
  name: string;
}
const items: Item[] = [
  {id: 'one', name: 'First'},
  {id: 'two', name: 'Second'},
  {id: 'three', name: 'Third'},
];
const columns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
const getId = (item: Item) => item.id;

const emptyPlugins: Record<string, TablePlugin<Item>> = {};
const emptyRowProps: Partial<BodyRowRenderProps> = {};
const defaultRowChildren = <td>Fixture</td>;
const defaultRowContext = context();

function ActivationTable({
  data = items,
  activeKey = null,
  onActivate,
  getIsItemActivatable,
  idKey = getId,
  plugins = emptyPlugins,
  tableColumns = columns,
}: Partial<UseTableActivationConfig<Item>> & {
  data?: Item[];
  idKey?: 'id' | typeof getId;
  plugins?: Record<string, TablePlugin<Item>>;
  tableColumns?: TableColumn<Item>[];
}) {
  const activation = useTableActivation({
    activeKey,
    onActivate: onActivate ?? (() => {}),
    getIsItemActivatable,
  });
  return (
    <Table
      data={data}
      columns={tableColumns}
      idKey={idKey}
      plugins={{...plugins, activation}}
    />
  );
}
function LabelledCheckbox({
  label,
  onChange,
}: {
  label: string;
  onChange: () => void;
}) {
  const [value, setValue] = useState(false);
  return (
    <CheckboxInput
      label={label}
      value={value}
      onChange={checked => {
        setValue(checked);
        onChange();
      }}
    />
  );
}

function row(name = 'First') {
  return screen.getByText(name).closest('tr')!;
}
function context(
  key: string | number = 'one',
  overrides: Partial<TableRowContext> = {},
): TableRowContext {
  return {
    key,
    identityStatus: 'valid',
    kind: 'product',
    logicalIndex: 0,
    logicalRowCount: 3,
    headerRowCount: 1,
    render: {
      mode: 'data',
      rowModel: 'flat',
      canActivate: true,
      canLoad: true,
      logicalRowCount: 3,
      headerRowCount: 1,
      viewport: createRef<HTMLDivElement>(),
    },
    ...overrides,
  };
}

/** Direct transform fixture supplements, but does not replace, Table integration. */
function TransformRow({
  config,
  rowContext = defaultRowContext,
  before = emptyRowProps,
  children = defaultRowChildren,
}: {
  config: UseTableActivationConfig<Item>;
  rowContext?: TableRowContext | null;
  before?: Partial<BodyRowRenderProps>;
  children?: ReactNode;
}) {
  const plugin = useTableActivation(config);
  const props = plugin.transformBodyRow!(
    {htmlProps: {}, xstyle: [], children, ...before},
    items[0],
    0,
    rowContext ?? undefined,
  );
  return (
    <table>
      <tbody>
        <tr {...props.htmlProps} ref={props.ref}>
          {props.children}
        </tr>
      </tbody>
    </table>
  );
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe('useTableActivation through Table', () => {
  it('preserves activation through StrictMode ref/effect replay', async () => {
    const onActivate = vi.fn();
    render(
      <StrictMode>
        <ActivationTable activeKey="one" onActivate={onActivate} />
      </StrictMode>,
    );
    expect(row()).toHaveAttribute('aria-current', 'true');
    for (const item of items) {
      expect(row(item.name)).toHaveAttribute('tabindex', '0');
      expect(row(item.name)).toHaveAttribute(
        'aria-keyshortcuts',
        'Enter Space',
      );
    }
    await userEvent.setup().click(screen.getByText('First'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
  });

  it('keeps the keyboard path after a controlled activation rebuilds columns', async () => {
    function Fixture() {
      const [activeKey, setActiveKey] = useState<string | number | null>(null);
      return (
        <ActivationTable
          activeKey={activeKey}
          onActivate={(_item, key) => setActiveKey(key)}
          tableColumns={[{key: 'name', header: 'Name'}]}
        />
      );
    }
    render(<Fixture />);
    const user = userEvent.setup();
    await user.tab();
    expect(row()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(row()).toHaveAttribute('aria-current', 'true');
    expect(row()).toHaveFocus();
    for (const item of items) {
      expect(row(item.name)).toHaveAttribute('tabindex', '0');
      expect(row(item.name)).toHaveAttribute(
        'aria-keyshortcuts',
        'Enter Space',
      );
    }
    await user.tab();
    expect(row('Second')).toHaveFocus();
    await user.keyboard(' ');
    expect(row('Second')).toHaveAttribute('aria-current', 'true');
    expect(row('Second')).toHaveFocus();
  });

  it('retains a focused immutable row replacement and its activation shortcuts', async () => {
    const onActivate = vi.fn();
    const view = render(<ActivationTable onActivate={onActivate} />);
    const first = row();
    first.focus();
    const updated = {...items[0], name: 'Updated first'};
    view.rerender(
      <ActivationTable
        data={[updated, ...items.slice(1)]}
        onActivate={onActivate}
      />,
    );
    expect(row('Updated first')).toBe(first);
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('aria-keyshortcuts', 'Enter Space');
    await userEvent.setup().keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(updated, 'one');
  });

  it('preserves caller tab stops and shortcut composition after row rebinding', () => {
    const props = {htmlProps: {tabIndex: -1, 'aria-keyshortcuts': 'F2'}};
    const view = render(
      <TransformRow
        config={{activeKey: null, onActivate: vi.fn()}}
        before={props}
      />,
    );
    view.rerender(
      <TransformRow
        config={{activeKey: 'one', onActivate: vi.fn()}}
        before={props}
      />,
    );
    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('row')).toHaveAttribute(
      'aria-keyshortcuts',
      'F2 Enter Space',
    );
    view.rerender(
      <TransformRow
        config={{
          activeKey: 'one',
          onActivate: vi.fn(),
          getIsItemActivatable: () => false,
        }}
        before={props}
      />,
    );
    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('row')).toHaveAttribute('aria-keyshortcuts', 'F2');
  });

  it('diagnoses an undeclared body modifier once and accepts its explicit flat declaration', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onActivate = vi.fn();
    const custom: TablePlugin<Item> = {transformBodyRow: props => props};
    const view = render(
      <ActivationTable onActivate={onActivate} plugins={{custom}} />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(onActivate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(' ')).toContain("rowModel: 'flat'");
    view.rerender(
      <ActivationTable onActivate={onActivate} plugins={{custom}} />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    view.rerender(
      <ActivationTable
        onActivate={onActivate}
        plugins={{custom: {...custom, rowModel: 'flat'}}}
      />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
  });

  it('keeps row rendering local when an activation table appends', () => {
    const readCell = vi.fn((item: Item) => item.name);
    const columns: TableColumn<Item>[] = [
      {key: 'name', header: 'Name', renderCell: readCell},
    ];
    const data: Item[] = Array.from({length: 200}, (_, i) => ({
      id: String(i),
      name: `Product ${i}`,
    }));
    const view = render(<ActivationTable data={data} tableColumns={columns} />);
    readCell.mockClear();
    const appended = {id: '200', name: 'Product 200'};
    view.rerender(
      <ActivationTable data={[...data, appended]} tableColumns={columns} />,
    );
    expect(readCell.mock.calls).toEqual([[appended]]);
  });
  it('keeps presses in an inner table from activating the outer row', async () => {
    const outer = vi.fn(),
      inner = vi.fn();
    const innerColumns: TableColumn<Item>[] = [{key: 'name', header: 'Name'}];
    const outerColumns: TableColumn<Item>[] = [
      {key: 'name', header: 'Name'},
      {
        key: 'details',
        header: 'Details',
        renderCell: () => (
          <ActivationTable
            data={[{id: 'inner', name: 'Inner row'}]}
            onActivate={inner}
            tableColumns={innerColumns}
          />
        ),
      },
    ];
    render(
      <ActivationTable
        data={[{id: 'outer', name: 'Outer row'}]}
        onActivate={outer}
        tableColumns={outerColumns}
      />,
    );
    const user = userEvent.setup();
    const target = screen.getByText('Inner row');
    await user.click(target);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
    target.closest('tr')!.focus();
    await user.keyboard('{Enter}');
    expect(inner).toHaveBeenCalledTimes(2);
    expect(outer).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(inner).toHaveBeenCalledTimes(3);
    expect(outer).not.toHaveBeenCalled();
    await user.click(screen.getByText('Outer row'));
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('requests primary-click activation without changing controlled state', async () => {
    const onActivate = vi.fn();
    render(<ActivationTable onActivate={onActivate} />);
    await userEvent.setup().click(screen.getByText('First'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
    expect(row()).not.toHaveAttribute('aria-current');
    expect(row()).not.toHaveAttribute('aria-selected');
    expect(row()).not.toHaveAttribute('role');
  });

  it('moves only the controlled current-item state and clears it with null', () => {
    const view = render(<ActivationTable activeKey="one" />);
    expect(row()).toHaveAttribute('aria-current', 'true');
    expect(row()).toHaveAttribute('data-active');
    view.rerender(<ActivationTable activeKey="two" />);
    expect(row()).not.toHaveAttribute('aria-current');
    expect(row('Second')).toHaveAttribute('aria-current', 'true');
    view.rerender(<ActivationTable activeKey={null} />);
    expect(row('Second')).not.toHaveAttribute('data-active');
    expect(row('Second')).not.toHaveAttribute('aria-current');
  });

  it('preserves function-key type and compares it strictly', async () => {
    const data: Item[] = [
      {id: 0, name: 'Number'},
      {id: '0', name: 'String'},
    ];
    const onActivate = vi.fn();
    render(
      <ActivationTable data={data} activeKey={0} onActivate={onActivate} />,
    );
    expect(row('Number')).toHaveAttribute('aria-current', 'true');
    expect(row('String')).not.toHaveAttribute('aria-current');
    await userEvent.setup().click(screen.getByText('String'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(data[1], '0');
  });

  it('consumes the property-key string projection rather than coercing its active key', async () => {
    const data: Item[] = [{id: 42, name: 'Projected'}];
    const onActivate = vi.fn();
    const view = render(
      <ActivationTable
        data={data}
        idKey="id"
        activeKey={42}
        onActivate={onActivate}
      />,
    );
    expect(row('Projected')).not.toHaveAttribute('aria-current');
    view.rerender(
      <ActivationTable
        data={data}
        idKey="id"
        activeKey="42"
        onActivate={onActivate}
      />,
    );
    expect(row('Projected')).toHaveAttribute('aria-current', 'true');
    await userEvent.setup().click(screen.getByText('Projected'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(data[0], '42');
  });

  it('does not activate duplicate canonical identities', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = [
      {id: 'same', name: 'Duplicate A'},
      {id: 'same', name: 'Duplicate B'},
    ];
    const onActivate = vi.fn();
    render(
      <ActivationTable data={data} activeKey="same" onActivate={onActivate} />,
    );
    await userEvent.setup().click(screen.getByText('Duplicate A'));
    expect(onActivate).not.toHaveBeenCalled();
    expect(row('Duplicate A')).not.toHaveAttribute('aria-current');
    expect(row('Duplicate B')).not.toHaveAttribute('aria-current');
  });

  it('leaves tables without explicit identity and non-flat models inactive', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onActivate = vi.fn();
    const {result} = renderHook(() =>
      useTableActivation<Item>({activeKey: 'one', onActivate}),
    );
    const view = render(
      <Table
        data={items}
        columns={columns}
        plugins={{activation: result.current}}
      />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(row()).not.toHaveAttribute('aria-current');
    expect(row()).not.toHaveAttribute('tabindex');
    view.unmount();
    const nonFlat: TablePlugin<Item> = {rowModel: 'tree'};
    render(
      <Table
        data={items}
        columns={columns}
        idKey={getId}
        plugins={{activation: result.current, nonFlat}}
      />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(row()).not.toHaveAttribute('aria-current');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('keeps composed non-owning handlers first even when their plugin follows activation', async () => {
    const order: string[] = [];
    const {result} = renderHook(() =>
      useTableActivation<Item>({
        activeKey: null,
        onActivate: () => order.push('activation'),
      }),
    );
    const analytics: TablePlugin<Item> = {
      rowModel: 'flat',
      transformBodyRow: props => {
        expect(props.htmlProps.tabIndex).toBe(0);
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            onClick: event => {
              props.htmlProps.onClick?.(event);
              order.push('analytics');
            },
          },
        };
      },
    };
    render(
      <Table
        data={items}
        columns={columns}
        idKey={getId}
        plugins={{activation: result.current, analytics}}
      />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(order).toEqual(['analytics', 'activation']);
  });

  it('neutralizes competing whole-row owners while preserving their requests', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacy = vi.fn();
    const onActivate = vi.fn();
    const navigation: TablePlugin<Item> = {
      rowModel: 'flat',
      wholeRowOwner: 'navigation',
      transformBodyRow: props => ({
        ...props,
        htmlProps: {...props.htmlProps, onClick: legacy},
      }),
    };
    render(
      <ActivationTable
        activeKey="one"
        onActivate={onActivate}
        plugins={{navigation}}
      />,
    );
    await userEvent.setup().click(screen.getByText('First'));
    expect(legacy).toHaveBeenCalledOnce();
    expect(onActivate).not.toHaveBeenCalled();
    expect(row()).not.toHaveAttribute('aria-current');
  });

  it('keeps plugin and unrelated row renders stable on key-only updates', () => {
    const renders = vi.fn();
    const RenderedName = memo(function RenderedName({name}: {name: string}) {
      renders(name);
      return <span>{name}</span>;
    });
    const tableColumns: TableColumn<Item>[] = [
      {key: 'name', renderCell: item => <RenderedName name={item.name} />},
    ];
    const onActivate = vi.fn();
    const view = render(
      <ActivationTable
        activeKey="one"
        onActivate={onActivate}
        tableColumns={tableColumns}
      />,
    );
    renders.mockClear();
    const mutations: Element[] = [];
    const spies = items.map(item =>
      vi.spyOn(row(item.name), 'setAttribute').mockImplementation(function (
        this: HTMLElement,
        name,
        value,
      ) {
        mutations.push(this);
        Element.prototype.setAttribute.call(this, name, value);
      }),
    );
    view.rerender(
      <ActivationTable
        activeKey="two"
        onActivate={onActivate}
        tableColumns={tableColumns}
      />,
    );
    expect(renders).not.toHaveBeenCalled();
    expect(mutations).not.toContain(row('Third'));
    expect(row('Second')).toHaveAttribute('aria-current', 'true');
    spies.forEach(spy => spy.mockRestore());
  });
});

describe('activation gesture and resource boundaries', () => {
  it.each([undefined, null, false, true, 'false', 'true'] as const)(
    'accepts the compatible current owner %s before and after sequential transforms',
    currentOwner => {
      const onActivate = vi.fn();
      const {result} = renderHook(() =>
        useTableActivation<Item>({activeKey: null, onActivate}),
      );
      const currentProps = {
        'aria-current': currentOwner,
      } as BodyRowRenderProps['htmlProps'];
      const before = result.current.transformBodyRow!(
        {htmlProps: currentProps, xstyle: [], children: null},
        items[0],
        0,
        context(),
      );
      expect(before.htmlProps.tabIndex).toBe(0);
      const transformed = result.current.transformBodyRow!(
        {htmlProps: {}, xstyle: [], children: null},
        items[0],
        0,
        context(),
      );
      const finalized = finalizeRowActivation({
        ...transformed,
        htmlProps: {...transformed.htmlProps, ...currentProps},
      });
      expect(finalized.htmlProps.tabIndex).toBe(0);
      expect(finalized.htmlProps['aria-current']).toBe(currentOwner);
      render(
        <table>
          <tbody>
            <tr {...before.htmlProps} ref={before.ref}>
              <td>Earlier owner</td>
            </tr>
            <tr {...finalized.htmlProps} ref={finalized.ref}>
              <td>Later owner</td>
            </tr>
          </tbody>
        </table>,
      );
      for (const fixture of screen.getAllByRole('row')) {
        fireEvent.click(fixture);
        fireEvent.keyDown(fixture, {key: 'Enter'});
      }
      expect(onActivate).toHaveBeenCalledTimes(4);
    },
  );

  it.each(['page', 'step', 'location', 'date', 'time', ''] as const)(
    'preserves incompatible current owner %s before and after sequential transforms',
    currentOwner => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const onActivate = vi.fn();
      const {result} = renderHook(() =>
        useTableActivation<Item>({activeKey: 'one', onActivate}),
      );
      const earlier: BodyRowRenderProps = {
        htmlProps: {'aria-current': currentOwner as 'page'},
        xstyle: [],
        children: null,
      };
      expect(
        result.current.transformBodyRow!(earlier, items[0], 0, context()),
      ).toBe(earlier);
      const transformed = result.current.transformBodyRow!(
        {htmlProps: {}, xstyle: [], children: null},
        items[0],
        0,
        context(),
      );
      const finalized = finalizeRowActivation({
        ...transformed,
        htmlProps: {...transformed.htmlProps, ...earlier.htmlProps},
      });
      render(
        <table>
          <tbody>
            <tr {...finalized.htmlProps} ref={finalized.ref}>
              <td>Later owner</td>
            </tr>
          </tbody>
        </table>,
      );
      const fixture = screen.getByRole('row');
      expect(fixture).toHaveAttribute('aria-current', currentOwner);
      expect(fixture).not.toHaveAttribute('tabindex');
      expect(fixture).not.toHaveAttribute('data-active');
      fireEvent.click(fixture);
      fireEvent.keyDown(fixture, {key: 'Enter'});
      expect(onActivate).not.toHaveBeenCalled();
    },
  );
  it('uses the row document realm for targets and current state when mounted offscreen', () => {
    const onActivate = vi.fn();
    const {result, rerender} = renderHook(
      ({activeKey}) => useTableActivation<Item>({activeKey, onActivate}),
      {initialProps: {activeKey: null as string | null}},
    );
    const props = result.current.transformBodyRow!(
      {htmlProps: {}, xstyle: [], children: null},
      items[0],
      0,
      context(),
    );
    rerender({activeKey: 'one'});
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    const foreign = iframe.contentDocument!;
    const fixture = foreign.createElement('tr');
    const target = foreign.createElement('span');
    fixture.append(target);
    foreign.body.append(fixture);
    const cleanup =
      typeof props.ref === 'function' ? props.ref(fixture) : undefined;
    expect(fixture).toHaveAttribute('aria-current', 'true');
    props.htmlProps.onClick!({
      target,
      currentTarget: fixture,
      button: 0,
      defaultPrevented: false,
    } as never);
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
    if (typeof cleanup === 'function') {
      cleanup();
    }
    iframe.remove();
  });

  it('runs a later cancellation handler before activation without changing transform order', () => {
    const onActivate = vi.fn();
    const earlier = vi.fn();
    const later = vi.fn((event: {preventDefault: () => void}) =>
      event.preventDefault(),
    );
    const {result} = renderHook(() =>
      useTableActivation<Item>({activeKey: null, onActivate}),
    );
    const transformed = result.current.transformBodyRow!(
      {
        htmlProps: {onClick: earlier, onKeyDown: earlier},
        xstyle: [],
        children: null,
      },
      items[0],
      0,
      context(),
    );
    const laterProps: BodyRowRenderProps = {
      ...transformed,
      htmlProps: {
        ...transformed.htmlProps,
        onClick(event) {
          transformed.htmlProps.onClick?.(event);
          later(event);
        },
        onKeyDown(event) {
          transformed.htmlProps.onKeyDown?.(event);
          later(event);
        },
      },
    };
    const finalized = finalizeRowActivation(laterProps);
    expect(finalizeRowActivation(finalized)).toBe(finalized);
    const view = render(
      <table>
        <tbody>
          <tr {...finalized.htmlProps} ref={finalized.ref}>
            <td>Finalized</td>
          </tr>
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByRole('row'));
    fireEvent.keyDown(screen.getByRole('row'), {key: 'Enter'});
    expect(earlier).toHaveBeenCalledTimes(2);
    expect(later).toHaveBeenCalledTimes(2);
    expect(onActivate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('preserves an incompatible current owner introduced by a later sequential transform', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onActivate = vi.fn();
    const {result} = renderHook(() =>
      useTableActivation<Item>({activeKey: 'one', onActivate}),
    );
    const transformed = result.current.transformBodyRow!(
      {htmlProps: {}, xstyle: [], children: null},
      items[0],
      0,
      context(),
    );
    const finalized = finalizeRowActivation({
      ...transformed,
      htmlProps: {...transformed.htmlProps, 'aria-current': 'page'},
    });
    render(
      <table>
        <tbody>
          <tr {...finalized.htmlProps} ref={finalized.ref}>
            <td>Current owner</td>
          </tr>
        </tbody>
      </table>,
    );
    const fixture = screen.getByRole('row');
    expect(fixture).toHaveAttribute('aria-current', 'page');
    expect(fixture).not.toHaveAttribute('data-active');
    expect(fixture).not.toHaveAttribute('tabindex');
    fireEvent.click(fixture);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '] as const)(
    'requests focused %s activation with standing text selection while a click stays inert',
    key => {
      const onActivate = vi.fn();
      render(
        <StrictMode>
          <ActivationTable onActivate={onActivate} />
        </StrictMode>,
      );
      const fixture = row();
      fixture.focus();
      const range = document.createRange();
      range.selectNodeContents(fixture);
      const selection = document.getSelection();
      expect(selection).not.toBeNull();
      selection?.removeAllRanges();
      selection?.addRange(range);
      expect(hasTextSelection(fixture)).toBe(true);
      fireEvent.click(screen.getByText('First'));
      expect(onActivate).not.toHaveBeenCalled();
      expect(fireEvent.keyDown(fixture, {key})).toBe(key !== ' ');
      expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
      expect(fixture).toHaveFocus();
      expect(fireEvent.keyDown(fixture, {key, repeat: true})).toBe(key !== ' ');
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(hasTextSelection(fixture)).toBe(true);
      selection?.removeAllRanges();
    },
  );
  it('keeps nested controls out of keyboard activation while row text is selected', () => {
    const onActivate = vi.fn();
    render(
      <TransformRow
        config={{activeKey: null, onActivate}}
        children={
          <td>
            Selected text<button type="button">Nested control</button>
          </td>
        }
      />,
    );
    const fixture = screen.getByRole('row');
    const range = document.createRange();
    range.selectNodeContents(fixture);
    document.getSelection()?.addRange(range);
    const control = screen.getByRole('button', {name: 'Nested control'});
    control.focus();
    fireEvent.keyDown(control, {key: 'Enter'});
    expect(fireEvent.keyDown(control, {key: ' '})).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
    expect(control).toHaveFocus();
    document.getSelection()?.removeAllRanges();
  });
  it('supports focused Enter/Space, ignores repeat Enter and consumes repeat Space', () => {
    const onActivate = vi.fn();
    render(<TransformRow config={{activeKey: null, onActivate}} />);
    const fixture = screen.getByRole('row');
    expect(fixture).toHaveAttribute('tabindex', '0');
    expect(fixture).toHaveAttribute('aria-keyshortcuts', 'Enter Space');
    fixture.focus();
    fireEvent.keyDown(fixture, {key: 'Enter'});
    expect(fireEvent.keyDown(fixture, {key: ' '})).toBe(false);
    fireEvent.keyDown(fixture, {key: 'Enter', repeat: true});
    expect(fireEvent.keyDown(fixture, {key: ' ', repeat: true})).toBe(false);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it('preserves prior focus/shortcut ownership and runs cancellation first', () => {
    const onActivate = vi.fn();
    const earlier = vi.fn((event: {preventDefault: () => void}) =>
      event.preventDefault(),
    );
    render(
      <TransformRow
        config={{activeKey: 'one', onActivate}}
        before={{
          htmlProps: {
            tabIndex: -1,
            'aria-keyshortcuts': 'Escape Enter',
            onClick: earlier,
            onKeyDown: earlier,
          },
        }}
      />,
    );
    const fixture = screen.getByRole('row');
    expect(fixture).toHaveAttribute('tabindex', '-1');
    expect(fixture).toHaveAttribute('aria-keyshortcuts', 'Escape Enter Space');
    fireEvent.click(fixture);
    fireEvent.keyDown(fixture, {key: 'Enter'});
    expect(earlier).toHaveBeenCalledTimes(2);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it.each(['button', 'input', 'textarea', 'select'])(
    'isolates native %s controls, including readonly controls',
    tag => {
      const onActivate = vi.fn();
      const content =
        tag === 'button' ? (
          <button type="button" aria-readonly="true">
            Control
          </button>
        ) : tag === 'input' ? (
          <input aria-label="Control" readOnly aria-readonly="true" />
        ) : tag === 'textarea' ? (
          <textarea aria-label="Control" readOnly />
        ) : (
          <select aria-label="Control">
            <option>Control</option>
          </select>
        );
      render(
        <TransformRow
          config={{activeKey: null, onActivate}}
          children={<td>{content}</td>}
        />,
      );
      const control = screen.getByRole(
        tag === 'button' ? 'button' : tag === 'select' ? 'combobox' : 'textbox',
      );
      fireEvent.click(control);
      fireEvent.keyDown(control, {key: 'Enter'});
      expect(fireEvent.keyDown(control, {key: ' ', repeat: true})).toBe(true);
      expect(onActivate).not.toHaveBeenCalled();
    },
  );

  it('evaluates a changed predicate once for each row when columns also rebuild', () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const view = render(
      <ActivationTable
        getIsItemActivatable={first}
        tableColumns={[...columns]}
      />,
    );
    expect(first).toHaveBeenCalledTimes(items.length);
    view.rerender(
      <ActivationTable
        getIsItemActivatable={second}
        tableColumns={[...columns]}
      />,
    );
    expect(second).toHaveBeenCalledTimes(items.length);
  });

  it('isolates a first-party checkbox label while its native control remains operable', async () => {
    const onActivate = vi.fn();
    const onChange = vi.fn();
    render(
      <ActivationTable
        activeKey="one"
        onActivate={onActivate}
        tableColumns={[
          {key: 'name', header: 'Name'},
          {
            key: 'control',
            header: 'Control',
            renderCell: item => (
              <LabelledCheckbox
                label={`Archive ${item.name}`}
                onChange={onChange}
              />
            ),
          },
        ]}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText('Archive Second'));
    expect(onActivate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('checkbox', {name: 'Archive Second'}),
    ).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it.each(['explicit', 'wrapped'] as const)(
    'isolates nested descendants of %s native labels',
    async kind => {
      const onActivate = vi.fn();
      render(
        <ActivationTable
          onActivate={onActivate}
          tableColumns={[
            {key: 'name', header: 'Name'},
            {
              key: 'control',
              renderCell: item =>
                kind === 'explicit' ? (
                  <>
                    <label htmlFor={`notify-${item.id}`}>
                      <span>Notify {item.name}</span>
                    </label>
                    <input id={`notify-${item.id}`} type="checkbox" />
                  </>
                ) : (
                  <label>
                    <input type="checkbox" />
                    <span>Notify {item.name}</span>
                  </label>
                ),
            },
          ]}
        />,
      );
      await userEvent.setup().click(screen.getByText('Notify Second'));
      expect(
        screen.getByRole('checkbox', {name: 'Notify Second'}),
      ).toBeChecked();
      expect(onActivate).not.toHaveBeenCalled();
    },
  );

  it('lets an unrelated label without an associated control remain ordinary row content', async () => {
    const onActivate = vi.fn();
    render(
      <ActivationTable
        onActivate={onActivate}
        tableColumns={[
          {key: 'name', header: 'Name'},
          {
            key: 'label',
            header: 'Label',
            renderCell: item => (
              <label>
                <span>Plain {item.name}</span>
              </label>
            ),
          },
        ]}
      />,
    );
    await userEvent.setup().click(screen.getByText('Plain Second'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[1], 'two');
  });

  it('isolates a disclosure summary while retaining its native open action', async () => {
    const onActivate = vi.fn();
    render(
      <ActivationTable
        activeKey="one"
        onActivate={onActivate}
        tableColumns={[
          {key: 'name', header: 'Name'},
          {
            key: 'details',
            header: 'Details',
            renderCell: item => (
              <details>
                <summary>
                  <span>More {item.name}</span>
                </summary>
                <p>Details {item.name}</p>
              </details>
            ),
          },
        ]}
      />,
    );
    const summary = screen.getByText('More Second');
    await userEvent.setup().click(summary);
    expect(onActivate).not.toHaveBeenCalled();
    expect(summary.closest('details')).toHaveAttribute('open');
    fireEvent.keyDown(summary.closest('summary')!, {key: 'Enter'});
    expect(
      fireEvent.keyDown(summary.closest('summary')!, {key: ' ', repeat: true}),
    ).toBe(true);
    expect(onActivate).not.toHaveBeenCalled();
    expect(row()).toHaveAttribute('aria-current', 'true');
  });

  it('isolates editable and canonical interactive-role descendants', () => {
    const onActivate = vi.fn();
    render(
      <TransformRow
        config={{activeKey: null, onActivate}}
        children={
          <td>
            <span contentEditable suppressContentEditableWarning>
              Editable
            </span>
            <span role="switch" aria-checked="false" aria-readonly="true">
              <span>Role control</span>
            </span>
          </td>
        }
      />,
    );
    fireEvent.click(screen.getByText('Editable'));
    fireEvent.click(screen.getByText('Role control'));
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('does not activate portalled content outside the row', () => {
    const onActivate = vi.fn();
    render(
      <TransformRow
        config={{activeKey: null, onActivate}}
        children={<td>{createPortal(<span>Portal</span>, document.body)}</td>}
      />,
    );
    fireEvent.click(screen.getByText('Portal'));
    fireEvent.keyDown(screen.getByText('Portal'), {key: 'Enter'});
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('ignores auxiliary clicks and hover', () => {
    const onActivate = vi.fn();
    render(<TransformRow config={{activeKey: null, onActivate}} />);
    const fixture = screen.getByRole('row');
    fireEvent.click(fixture, {button: 1});
    fireEvent.click(fixture, {button: 2});
    fireEvent.mouseEnter(fixture);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('suppresses ranges intersecting the row even when their anchor is outside', () => {
    const onActivate = vi.fn();
    render(
      <>
        <p>Outside</p>
        <TransformRow
          config={{activeKey: null, onActivate}}
          children={<td>Inside</td>}
        />
      </>,
    );
    const range = document.createRange();
    range.setStart(screen.getByText('Outside').firstChild!, 0);
    range.setEnd(screen.getByText('Inside').firstChild!, 3);
    document.getSelection()!.addRange(range);
    expect(
      screen.getByRole('row').contains(document.getSelection()!.anchorNode),
    ).toBe(false);
    expect(hasTextSelection(screen.getByRole('row'))).toBe(true);
    fireEvent.click(screen.getByText('Inside'));
    expect(onActivate).not.toHaveBeenCalled();
    document.getSelection()!.removeAllRanges();
    range.selectNodeContents(screen.getByText('Outside'));
    document.getSelection()!.addRange(range);
    fireEvent.click(screen.getByText('Inside'));
    expect(onActivate).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
  });

  it.each(['missing', 'invalid', 'duplicate'] as const)(
    'keeps %s identity inert',
    identityStatus => {
      const onActivate = vi.fn();
      render(
        <TransformRow
          config={{activeKey: 'one', onActivate}}
          rowContext={context('one', {identityStatus})}
        />,
      );
      const fixture = screen.getByRole('row');
      fireEvent.click(fixture);
      expect(onActivate).not.toHaveBeenCalled();
      expect(fixture).not.toHaveAttribute('tabindex');
      expect(fixture).not.toHaveAttribute('aria-current');
    },
  );

  it.each(['synthetic', 'unknown'] as const)(
    'keeps %s rows inert before calling the predicate',
    kind => {
      const predicate = vi.fn(() => true);
      render(
        <TransformRow
          config={{
            activeKey: 'one',
            onActivate: vi.fn(),
            getIsItemActivatable: predicate,
          }}
          rowContext={context('one', {kind})}
        />,
      );
      expect(screen.getByRole('row')).not.toHaveAttribute('aria-current');
      expect(predicate).not.toHaveBeenCalled();
    },
  );

  it('preserves missing context and incompatible aria-current contributions', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onActivate = vi.fn();
    const view = render(
      <TransformRow
        config={{activeKey: 'one', onActivate}}
        rowContext={null}
      />,
    );
    fireEvent.click(screen.getByRole('row'));
    expect(onActivate).not.toHaveBeenCalled();
    view.rerender(
      <TransformRow
        config={{activeKey: 'one', onActivate}}
        before={{htmlProps: {'aria-current': 'page', tabIndex: -1}}}
      />,
    );
    fireEvent.click(screen.getByRole('row'));
    expect(screen.getByRole('row')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '-1');
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('removes affordances and active state when eligibility flips, and uses current callbacks', () => {
    const first = vi.fn();
    const second = vi.fn();
    const earlierRef = createRef<HTMLTableRowElement>();
    const view = render(
      <TransformRow
        config={{activeKey: 'one', onActivate: first}}
        before={{ref: earlierRef}}
      />,
    );
    const fixture = screen.getByRole('row');
    expect(earlierRef.current).toBe(fixture);
    view.rerender(
      <TransformRow
        config={{
          activeKey: 'one',
          onActivate: second,
          getIsItemActivatable: () => false,
        }}
        before={{ref: earlierRef}}
      />,
    );
    expect(fixture).not.toHaveAttribute('tabindex');
    expect(fixture).not.toHaveAttribute('aria-keyshortcuts');
    expect(fixture).not.toHaveAttribute('aria-current');
    fireEvent.click(fixture);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    view.rerender(
      <TransformRow
        config={{activeKey: 'one', onActivate: second}}
        before={{ref: earlierRef}}
      />,
    );
    fireEvent.click(fixture);
    expect(second).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
    view.unmount();
    expect(earlierRef.current).toBeNull();
    expect(fixture).not.toHaveAttribute('data-active');
  });

  it('removes inherited tab stops when a focused row becomes ineligible during rebinding', async () => {
    const view = render(<ActivationTable />);
    const first = row();
    first.focus();
    view.rerender(<ActivationTable getIsItemActivatable={() => false} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(first).not.toHaveAttribute('tabindex');
    expect(first).not.toHaveAttribute('aria-keyshortcuts');
  });

  it('retires a detached focused tab stop only if no replacement binding claims the row', async () => {
    const {result, unmount} = renderHook(() =>
      useTableActivation<Item>({activeKey: null, onActivate: vi.fn()}),
    );
    const props = result.current.transformBodyRow!(
      {htmlProps: {}, xstyle: [], children: null},
      items[0],
      0,
      context(),
    );
    const fixture = document.createElement('tr');
    document.body.append(fixture);
    const detach =
      typeof props.ref === 'function' ? props.ref(fixture) : undefined;
    fixture.focus();
    expect(fixture).toHaveFocus();
    act(() => {
      if (typeof detach === 'function') {
        detach();
      }
    });
    expect(fixture).toHaveAttribute('tabindex', '0');
    await act(async () => {
      await Promise.resolve();
    });
    expect(fixture).not.toHaveAttribute('tabindex');
    unmount();
    fixture.remove();
  });

  it('does not notify a detached row generation', () => {
    const initialProps: {activeKey: string | null} = {activeKey: 'one'};
    const {result, rerender, unmount} = renderHook(
      ({activeKey}) =>
        useTableActivation<Item>({activeKey, onActivate: vi.fn()}),
      {initialProps},
    );
    const props = result.current.transformBodyRow!(
      {htmlProps: {}, xstyle: [], children: null},
      items[0],
      0,
      context(),
    );
    const fixture = document.createElement('tr');
    document.body.append(fixture);
    const cleanup =
      typeof props.ref === 'function' ? props.ref(fixture) : undefined;
    expect(fixture).toHaveAttribute('data-active');
    act(() => {
      if (typeof cleanup === 'function') {
        cleanup();
      }
    });
    const spy = vi.spyOn(fixture, 'setAttribute');
    rerender({activeKey: null});
    rerender({activeKey: 'one'});
    expect(spy).not.toHaveBeenCalled();
    unmount();
    fixture.remove();
  });

  it('returns the same plugin and reads updated callbacks without replacing mounted handlers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const {result, rerender} = renderHook(
      ({onActivate}) => useTableActivation<Item>({activeKey: null, onActivate}),
      {initialProps: {onActivate: first}},
    );
    const plugin = result.current;
    const props = plugin.transformBodyRow!(
      {htmlProps: {}, xstyle: [], children: null},
      items[0],
      0,
      context(),
    );
    const fixture = document.createElement('tr');
    document.body.append(fixture);
    const cleanup =
      typeof props.ref === 'function' ? props.ref(fixture) : undefined;
    rerender({onActivate: second});
    expect(result.current).toBe(plugin);
    props.htmlProps.onClick!({
      target: fixture,
      currentTarget: fixture,
      button: 0,
      defaultPrevented: false,
    } as never);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(items[0], 'one');
    if (typeof cleanup === 'function') {
      cleanup();
    }
    fixture.remove();
  });
});
