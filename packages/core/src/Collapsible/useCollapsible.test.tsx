// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCollapsible.test.tsx
 * @input Uses vitest, @testing-library/react, CollapsibleGroupContext
 * @output Unit tests for useCollapsible hook
 * @position Testing; validates config parsing and the three-mode state
 *   machine (group-controlled / controlled / uncontrolled)
 */

import {describe, it, expect, vi} from 'vitest';
import type {ReactNode} from 'react';
import {act, renderHook} from '@testing-library/react';
import {useCollapsible} from './useCollapsible';
import {
  CollapsibleGroupContext,
  type CollapsibleGroupContextValue,
} from './CollapsibleGroupContext';

// =============================================================================
// Helpers
// =============================================================================

function withGroup(group: CollapsibleGroupContextValue) {
  return function GroupWrapper({children}: {children: ReactNode}) {
    return (
      <CollapsibleGroupContext value={group}>
        {children}
      </CollapsibleGroupContext>
    );
  };
}

// =============================================================================
// Config parsing
// =============================================================================

describe('useCollapsible — config parsing', () => {
  it('treats isCollapsible=true as an enabled config that starts open', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}));

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('is disabled when isCollapsible is undefined', () => {
    const {result} = renderHook(() => useCollapsible({}));

    expect(result.current.isEnabled).toBe(false);
  });

  it('is disabled when isCollapsible is false', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: false}));

    expect(result.current.isEnabled).toBe(false);
  });

  it('treats an object config as enabled', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: {}}));

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(true);
  });

  it('starts closed when defaultIsOpen is false', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {defaultIsOpen: false}}),
    );

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isOpen).toBe(false);
  });
});

// =============================================================================
// Uncontrolled mode
// =============================================================================

describe('useCollapsible — uncontrolled mode', () => {
  it('toggle flips the state open → closed → open', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}));

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
  });

  it('toggle updates internal state AND notifies onOpenChange', () => {
    // onOpenChange without isOpen is a notification callback, not a signal
    // that the component is controlled.
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {onOpenChange}}),
    );

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
    expect(onOpenChange).toHaveBeenNthCalledWith(1, false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    expect(onOpenChange).toHaveBeenNthCalledWith(2, true);
  });
});

// =============================================================================
// Controlled mode
// =============================================================================

describe('useCollapsible — controlled mode', () => {
  it('renders the isOpen prop and only notifies on toggle, never self-toggles', () => {
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: true, onOpenChange}}),
    );

    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // The parent owns the state — nothing changed internally.
    expect(result.current.isOpen).toBe(true);
  });

  it('reports the inverse of a closed controlled state', () => {
    const onOpenChange = vi.fn();
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: false, onOpenChange}}),
    );

    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(result.current.isOpen).toBe(false);
  });

  it('tolerates a controlled config without onOpenChange', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {isOpen: true}}),
    );

    act(() => {
      result.current.toggle(); // must not throw
    });

    expect(result.current.isOpen).toBe(true);
  });
});

// =============================================================================
// Group mode
// =============================================================================

describe('useCollapsible — group mode', () => {
  it('reads isOpen from the group for its own value', () => {
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn((value: string) => value === 'a'),
      toggle: vi.fn(),
    };

    const {result: itemA} = renderHook(
      () => useCollapsible({isCollapsible: true, value: 'a'}),
      {wrapper: withGroup(group)},
    );
    const {result: itemB} = renderHook(
      () => useCollapsible({isCollapsible: true, value: 'b'}),
      {wrapper: withGroup(group)},
    );

    expect(itemA.current.isOpen).toBe(true);
    expect(itemB.current.isOpen).toBe(false);
    expect(group.isOpen).toHaveBeenCalledWith('a');
    expect(group.isOpen).toHaveBeenCalledWith('b');
  });

  it('toggle defers to the group and skips local state and onOpenChange', () => {
    const onOpenChange = vi.fn();
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn(() => true),
      toggle: vi.fn(),
    };
    const {result} = renderHook(
      () => useCollapsible({isCollapsible: {onOpenChange}, value: 'a'}),
      {wrapper: withGroup(group)},
    );

    act(() => {
      result.current.toggle();
    });

    expect(group.toggle).toHaveBeenCalledTimes(1);
    expect(group.toggle).toHaveBeenCalledWith('a');
    // Group owns the state: the config callback is not invoked and the open
    // state still comes from the group.
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(result.current.isOpen).toBe(true);
  });

  it('falls back to standalone state inside a group when no value is given', () => {
    const group: CollapsibleGroupContextValue = {
      isOpen: vi.fn(() => false),
      toggle: vi.fn(),
    };
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}), {
      wrapper: withGroup(group),
    });

    // Standalone default: open.
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });

    expect(result.current.isOpen).toBe(false);
    expect(group.toggle).not.toHaveBeenCalled();
  });
});
