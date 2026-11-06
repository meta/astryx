// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTableColumnSettingsState.test.tsx
 * @input useTableColumnSettingsState, React testing utilities
 * @output Functional tests for the column settings state hook
 * @position Test file; validates state operations independent of the plugin
 */

import {describe, it, expect, vi} from 'vitest';
import {Suspense, startTransition, use} from 'react';
import {renderHook, act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useTableColumnSettingsState,
  type UseTableColumnSettingsStateConfig,
} from './useTableColumnSettingsState';
import type {ColumnSettingsOption} from './useTableColumnSettings';

// =============================================================================
// Test Data
// =============================================================================

const columnOptions: ColumnSettingsOption[] = [
  {key: 'name', label: 'Name', isAlwaysVisible: true},
  {key: 'email', label: 'Email'},
  {key: 'role', label: 'Role'},
  {key: 'status', label: 'Status'},
  {key: 'lastLogin', label: 'Last Login'},
];

// =============================================================================
// Helpers
// =============================================================================

function renderStateHook(
  overrides: Partial<UseTableColumnSettingsStateConfig> = {},
) {
  const defaultConfig: UseTableColumnSettingsStateConfig = {
    columns: columnOptions,
    activeColumnKeys: ['name', 'email', 'role'],
    onChangeActiveColumnKeys: vi.fn(),
    ...overrides,
  };

  return renderHook(() => useTableColumnSettingsState(defaultConfig));
}

// =============================================================================
// Tests
// =============================================================================

describe('useTableColumnSettingsState', () => {
  // ===========================================================================
  // Return value shape
  // ===========================================================================

  describe('return value', () => {
    it('returns columnSettingsConfig that matches input config', () => {
      const config: UseTableColumnSettingsStateConfig = {
        columns: columnOptions,
        activeColumnKeys: ['name', 'email'],
        onChangeActiveColumnKeys: vi.fn(),
      };
      const {result} = renderHook(() => useTableColumnSettingsState(config));
      expect(result.current.columnSettingsConfig).toBe(config);
    });

    it('returns activeColumnKeys passthrough', () => {
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email'],
      });
      expect(result.current.activeColumnKeys).toEqual(['name', 'email']);
    });

    it('returns all operation functions', () => {
      const {result} = renderStateHook();
      expect(result.current.toggleColumn).toBeInstanceOf(Function);
      expect(result.current.isColumnActive).toBeInstanceOf(Function);
      expect(result.current.isColumnToggleable).toBeInstanceOf(Function);
      expect(result.current.showAllColumns).toBeInstanceOf(Function);
      expect(result.current.resetToDefault).toBeInstanceOf(Function);
      expect(result.current.setActiveColumnKeys).toBeInstanceOf(Function);
    });
  });

  // ===========================================================================
  // toggleColumn
  // ===========================================================================

  describe('toggleColumn', () => {
    it('removes active column', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email', 'role'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.toggleColumn('email'));
      expect(onChange).toHaveBeenCalledWith(['name', 'role']);
    });

    it('adds inactive column at end', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.toggleColumn('status'));
      expect(onChange).toHaveBeenCalledWith(['name', 'email', 'status']);
    });

    it('no-op for isAlwaysVisible columns', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.toggleColumn('name'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // isColumnActive
  // ===========================================================================

  describe('isColumnActive', () => {
    it('returns true for active columns', () => {
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email'],
      });
      expect(result.current.isColumnActive('name')).toBe(true);
      expect(result.current.isColumnActive('email')).toBe(true);
    });

    it('returns false for inactive columns', () => {
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email'],
      });
      expect(result.current.isColumnActive('role')).toBe(false);
      expect(result.current.isColumnActive('status')).toBe(false);
    });
  });

  // ===========================================================================
  // isColumnToggleable
  // ===========================================================================

  describe('isColumnToggleable', () => {
    it('returns true for normal columns', () => {
      const {result} = renderStateHook();
      expect(result.current.isColumnToggleable('email')).toBe(true);
      expect(result.current.isColumnToggleable('role')).toBe(true);
    });

    it('returns false for always-visible columns', () => {
      const {result} = renderStateHook();
      expect(result.current.isColumnToggleable('name')).toBe(false);
    });
  });

  // ===========================================================================
  // showAllColumns
  // ===========================================================================

  describe('showAllColumns', () => {
    it('sets all column keys as active in columns config order', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.showAllColumns());
      expect(onChange).toHaveBeenCalledWith([
        'name',
        'email',
        'role',
        'status',
        'lastLogin',
      ]);
    });
  });

  // ===========================================================================
  // resetToDefault
  // ===========================================================================

  describe('resetToDefault', () => {
    it('resets to defaultColumnKeys when provided', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name', 'email', 'role', 'status', 'lastLogin'],
        onChangeActiveColumnKeys: onChange,
        defaultColumnKeys: ['name', 'email'],
      });

      act(() => result.current.resetToDefault());
      expect(onChange).toHaveBeenCalledWith(['name', 'email']);
    });

    it('shows all columns when no defaultColumnKeys', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        activeColumnKeys: ['name'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.resetToDefault());
      expect(onChange).toHaveBeenCalledWith([
        'name',
        'email',
        'role',
        'status',
        'lastLogin',
      ]);
    });
  });

  // ===========================================================================
  // setActiveColumnKeys
  // ===========================================================================

  describe('setActiveColumnKeys', () => {
    it('passes selected values to onChangeActiveColumnKeys', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        onChangeActiveColumnKeys: onChange,
      });

      act(() =>
        result.current.setActiveColumnKeys(['name', 'email', 'status']),
      );
      expect(onChange).toHaveBeenCalledWith(
        expect.arrayContaining(['name', 'email', 'status']),
      );
    });

    it('enforces isAlwaysVisible columns remain in set', () => {
      const onChange = vi.fn();
      const {result} = renderStateHook({
        onChangeActiveColumnKeys: onChange,
      });

      // Try to deselect 'name' (isAlwaysVisible) by not including it
      act(() => result.current.setActiveColumnKeys(['email']));
      const calledWith = onChange.mock.calls[0][0] as string[];
      expect(calledWith).toContain('name');
      expect(calledWith).toContain('email');
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles empty columns config', () => {
      const {result} = renderStateHook({
        columns: [],
        activeColumnKeys: [],
      });

      expect(result.current.activeColumnKeys).toEqual([]);
    });

    it('handles single column with isAlwaysVisible', () => {
      const {result} = renderStateHook({
        columns: [{key: 'name', label: 'Name', isAlwaysVisible: true}],
        activeColumnKeys: ['name'],
      });

      expect(result.current.isColumnToggleable('name')).toBe(false);
      expect(result.current.isColumnActive('name')).toBe(true);
    });

    it('handles all columns isAlwaysVisible', () => {
      const allVisible: ColumnSettingsOption[] = [
        {key: 'name', label: 'Name', isAlwaysVisible: true},
        {key: 'email', label: 'Email', isAlwaysVisible: true},
      ];

      const onChange = vi.fn();
      const {result} = renderStateHook({
        columns: allVisible,
        activeColumnKeys: ['name', 'email'],
        onChangeActiveColumnKeys: onChange,
      });

      act(() => result.current.toggleColumn('name'));
      act(() => result.current.toggleColumn('email'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});

// A render that reads this promise suspends for good.
const pending = new Promise<never>(() => {});
function Pending(): null {
  use(pending);
  return null;
}

type PickerState = Pick<
  UseTableColumnSettingsStateConfig,
  'activeColumnKeys' | 'onChangeActiveColumnKeys'
>;

function RoleToggle(state: PickerState) {
  const {toggleColumn} = useTableColumnSettingsState({
    columns: columnOptions,
    ...state,
  });
  return (
    <button type="button" onClick={() => toggleColumn('role')}>
      Toggle Role
    </button>
  );
}

function ColumnPicker({
  isPending,
  ...state
}: PickerState & {isPending: boolean}) {
  return (
    <Suspense fallback={null}>
      <RoleToggle {...state} />
      {isPending ? <Pending /> : null}
    </Suspense>
  );
}

describe('useTableColumnSettingsState after a render React discards', () => {
  it('a column toggle starts from the columns on screen and reports to the committed callback', async () => {
    const user = userEvent.setup();
    const committed: string[][] = [];
    const discarded: string[][] = [];
    const {rerender} = render(
      <ColumnPicker
        activeColumnKeys={['name', 'email']}
        onChangeActiveColumnKeys={keys => committed.push([...keys])}
        isPending={false}
      />,
    );
    // The next props render in a transition, then suspend for good, so React
    // keeps the committed tree and never commits that render.
    await act(async () => {
      startTransition(() => {
        rerender(
          <ColumnPicker
            activeColumnKeys={['name', 'email', 'role']}
            onChangeActiveColumnKeys={keys => discarded.push([...keys])}
            isPending
          />,
        );
      });
    });

    await user.click(screen.getByRole('button', {name: 'Toggle Role'}));

    expect(discarded).toEqual([]);
    expect(committed).toEqual([['name', 'email', 'role']]);
  });
});
