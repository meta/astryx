// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCollapsible.test.tsx
 * @input Uses vitest, @testing-library/react, CollapsibleGroupContext
 * @output Unit tests for useCollapsible hook
 * @position Testing; validates config parsing, the three-mode state machine
 *   (group-controlled / controlled / uncontrolled), and the trigger and
 *   content props. Content motion: useCollapsibleContentMotion.test.tsx
 */

import {afterEach, beforeEach, describe, it, expect, vi} from 'vitest';
import {useEffect, type ReactNode} from 'react';
import {act, render, renderHook, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useCollapsible, type UseCollapsibleOptions} from './useCollapsible';
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

// =============================================================================
// Trigger and content props
// =============================================================================

const lifecycle = {mounts: 0, unmounts: 0};

function Body() {
  useEffect(() => {
    lifecycle.mounts += 1;
    return () => {
      lifecycle.unmounts += 1;
    };
  }, []);
  return <p>Body</p>;
}

function Disclosure(options: UseCollapsibleOptions) {
  const row = useCollapsible(options);
  return (
    <>
      {/* eslint-disable-next-line @eslint-react/dom-no-missing-button-type -- triggerProps carries type="button", which the first test asserts */}
      <button {...row.triggerProps}>Details</button>
      <div {...row.contentProps} data-testid="content">
        {row.isOpen && <Body />}
      </div>
    </>
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', {name: 'Details'});
}

function content(): HTMLElement {
  return screen.getByTestId('content');
}

function resetLifecycle() {
  lifecycle.mounts = 0;
  lifecycle.unmounts = 0;
}

// Testing Library unmounts the previous test's tree after this file's
// afterEach, so the count resets before each test.
beforeEach(resetLifecycle);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCollapsible — trigger and content props', () => {
  it('names the content from the trigger and reports the open state', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    expect(trigger()).toHaveAttribute('type', 'button');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-controls', content().id);
    expect(content().id).not.toBe('');

    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', content().id);
  });

  it('keeps the closed content element rendered, hidden and empty', () => {
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    expect(content()).toHaveAttribute('hidden');
    expect(content()).toBeEmptyDOMElement();
    expect(lifecycle.mounts).toBe(0);
  });

  it('mounts the children when it opens and unmounts them when it closes', async () => {
    const user = userEvent.setup();
    render(<Disclosure isCollapsible={{defaultIsOpen: false}} />);

    await user.click(trigger());
    expect(content()).not.toHaveAttribute('hidden');
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 0});

    await user.click(trigger());
    expect(content()).toHaveAttribute('hidden');
    expect(content()).toBeEmptyDOMElement();
    expect(lifecycle).toEqual({mounts: 1, unmounts: 1});
  });

  it('follows a controlled open state', () => {
    const {rerender} = render(
      <Disclosure isCollapsible={{isOpen: false, onOpenChange: () => {}}} />,
    );
    expect(content()).toHaveAttribute('hidden');

    rerender(
      <Disclosure isCollapsible={{isOpen: true, onOpenChange: () => {}}} />,
    );
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('notifies onOpenChange from the trigger', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Disclosure isCollapsible={{isOpen: true, onOpenChange}} />);

    await user.click(trigger());
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('useCollapsible — act-free state reads', () => {
  it('reports the trigger and content props from renderHook', () => {
    const {result} = renderHook(() =>
      useCollapsible({isCollapsible: {defaultIsOpen: false}}),
    );
    expect(result.current.contentProps.hidden).toBe(true);
    expect(result.current.triggerProps['aria-expanded']).toBe(false);

    act(() => {
      result.current.triggerProps.onClick();
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.contentProps.hidden).toBe(false);
    expect(result.current.triggerProps['aria-expanded']).toBe(true);
    expect(result.current.triggerProps['aria-controls']).toBe(
      result.current.contentProps.id,
    );
  });

  it('returns only the headless basics, with no content motion', () => {
    const {result} = renderHook(() => useCollapsible({isCollapsible: true}));
    expect(Object.keys(result.current).sort()).toEqual([
      'contentProps',
      'isEnabled',
      'isOpen',
      'toggle',
      'triggerProps',
    ]);
    expect(Object.keys(result.current.contentProps).sort()).toEqual([
      'hidden',
      'id',
    ]);
  });
});
