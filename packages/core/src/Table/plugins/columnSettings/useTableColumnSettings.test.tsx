// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableColumnSettings.test.tsx
 * @input useTableColumnSettings, useTableColumnSettingsState, Table, React testing utilities
 * @output Functional tests for the column settings plugin, selector adapter, and integration
 * @position Test file; validates plugin behavior and integration
 */

import {describe, it, expect, vi} from 'vitest';
import {Suspense, memo, startTransition, use, useState} from 'react';
import {act, render, screen} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import {Table} from '../../Table';
import {
  useTableColumnSettings,
  type UseTableColumnSettingsConfig,
  type ColumnSettingsOption,
} from './useTableColumnSettings';
import {useTableColumnSettingsState} from './useTableColumnSettingsState';
import {InternationalizationProvider} from '../../../i18n/InternationalizationProvider';
import type {TableColumn} from '../../types';

// =============================================================================
// Test Data
// =============================================================================

interface User extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

const testUsers: User[] = [
  {
    id: '1',
    name: 'Alice',
    email: 'alice@test.com',
    role: 'admin',
    status: 'active',
    lastLogin: '2026-01-01',
  },
  {
    id: '2',
    name: 'Bob',
    email: 'bob@test.com',
    role: 'user',
    status: 'inactive',
    lastLogin: '2026-02-01',
  },
];

const allTableColumns: TableColumn<User>[] = [
  {key: 'name', header: 'Name'},
  {key: 'email', header: 'Email'},
  {key: 'role', header: 'Role'},
  {key: 'status', header: 'Status'},
  {key: 'lastLogin', header: 'Last Login'},
];

const columnOptions: ColumnSettingsOption[] = [
  {key: 'name', label: 'Name', isAlwaysVisible: true},
  {key: 'email', label: 'Email'},
  {key: 'role', label: 'Role'},
  {key: 'status', label: 'Status'},
  {key: 'lastLogin', label: 'Last Login'},
];

// =============================================================================
// Plugin Hook Tests
// =============================================================================

describe('useTableColumnSettings', () => {
  function renderPluginHook(
    overrides: Partial<UseTableColumnSettingsConfig> = {},
  ) {
    const defaultConfig: UseTableColumnSettingsConfig = {
      columns: columnOptions,
      activeColumnKeys: ['name', 'email', 'role'],
      onChangeActiveColumnKeys: vi.fn(),
      ...overrides,
    };

    return renderHook(() => useTableColumnSettings<User>(defaultConfig));
  }

  it('returns a TablePlugin with transformColumns', () => {
    const {result} = renderPluginHook();
    expect(result.current).toBeDefined();
    expect(result.current.transformColumns).toBeInstanceOf(Function);
  });

  it('transformColumns filters columns by activeColumnKeys', () => {
    const {result} = renderPluginHook({
      activeColumnKeys: ['name', 'email'],
    });

    const filtered = result.current.transformColumns!(allTableColumns);
    expect(filtered.map(c => c.key)).toEqual(['name', 'email']);
  });

  it('transformColumns reorders columns by activeColumnKeys order', () => {
    const {result} = renderPluginHook({
      activeColumnKeys: ['role', 'name'],
    });

    const filtered = result.current.transformColumns!(allTableColumns);
    expect(filtered.map(c => c.key)).toEqual(['role', 'name']);
  });

  it('plugin reference is stable across renders', () => {
    const {result, rerender} = renderPluginHook();
    const firstPlugin = result.current;
    rerender();
    expect(result.current).toBe(firstPlugin);
  });
});

// =============================================================================
// Integration: state hook + plugin hook + Table
// =============================================================================

describe('integration with Table', () => {
  function ColumnSettingsTable({
    initialActiveKeys,
  }: {
    initialActiveKeys: string[];
  }) {
    const [activeKeys, setActiveKeys] = useState(initialActiveKeys);

    const state = useTableColumnSettingsState({
      columns: columnOptions,
      activeColumnKeys: activeKeys,
      onChangeActiveColumnKeys: (keys: ReadonlyArray<string>) =>
        setActiveKeys([...keys]),
    });

    const plugin = useTableColumnSettings<User>(state.columnSettingsConfig);

    return (
      <Table
        data={testUsers}
        columns={allTableColumns}
        plugins={{columnSettings: plugin}}
        idKey="id"
      />
    );
  }

  it('table renders only active columns', () => {
    render(
      <ColumnSettingsTable initialActiveKeys={['name', 'email', 'role']} />,
    );

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();

    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Last Login')).not.toBeInTheDocument();
  });

  it('column order matches activeColumnKeys order', () => {
    render(
      <ColumnSettingsTable initialActiveKeys={['role', 'name', 'email']} />,
    );

    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('Role');
    expect(headers[1]).toHaveTextContent('Name');
    expect(headers[2]).toHaveTextContent('Email');
  });
});

describe('after a render React discards', () => {
  it('renders the committed columns when the table re-renders on its own', async () => {
    // A transition that suspends for good: React renders it, then keeps the
    // committed tree and never commits that render.
    const forever = new Promise<never>(() => {});
    function Forever(): null {
      use(forever);
      return null;
    }
    const onChangeActiveColumnKeys = () => {};
    const Owner = memo(function Owner({
      activeKeys,
    }: {
      activeKeys: ReadonlyArray<string>;
    }) {
      const plugin = useTableColumnSettings<User>({
        columns: columnOptions,
        activeColumnKeys: activeKeys,
        onChangeActiveColumnKeys,
      });
      return (
        <Table
          data={testUsers}
          columns={allTableColumns}
          plugins={{columnSettings: plugin}}
          idKey="id"
        />
      );
    });
    function Screen({
      locale,
      activeKeys,
      isPending = false,
    }: {
      locale: string;
      activeKeys: ReadonlyArray<string>;
      isPending?: boolean;
    }) {
      return (
        <InternationalizationProvider locale={locale}>
          <Suspense fallback={null}>
            <Owner activeKeys={activeKeys} />
            {isPending ? <Forever /> : null}
          </Suspense>
        </InternationalizationProvider>
      );
    }
    const committedKeys = ['name', 'email'];
    const {rerender} = render(
      <Screen locale="en-US" activeKeys={committedKeys} />,
    );
    await act(async () => {
      startTransition(() => {
        rerender(
          <Screen locale="en-US" activeKeys={['name', 'role']} isPending />,
        );
      });
    });

    // The locale changes and the owner does not, so the table re-renders on
    // its own and applies the plugin again.
    rerender(<Screen locale="en-GB" activeKeys={committedKeys} />);

    expect(
      screen.getAllByRole('columnheader').map(header => header.textContent),
    ).toEqual(['Name', 'Email']);
  });
});
