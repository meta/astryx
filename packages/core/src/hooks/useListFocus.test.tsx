// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useListFocus.test.tsx
 * @input Uses vitest, @testing-library/react, useListFocus hook
 * @output Unit tests for useListFocus disabled-item skipping, navigation,
 *   Escape consumption, and RTL auto-detection
 * @position Testing; validates useListFocus.ts keyboard navigation
 *
 * SYNC: When useListFocus.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import type {KeyboardEvent as ReactKeyboardEvent} from 'react';
import {render, screen, fireEvent} from '@testing-library/react';
import {useInternalListFocus, useListFocus} from './useListFocus';

const NO_DISABLED: string[] = [];

function Menu({
  wrap = true,
  disabledLabels = NO_DISABLED,
}: {
  wrap?: boolean;
  disabledLabels?: string[];
}) {
  const {listRef, handleKeyDown} = useListFocus<HTMLDivElement>({wrap});
  const items = ['One', 'Two', 'Three', 'Four'];
  return (
    <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
      {items.map(label => {
        const disabled = disabledLabels.includes(label);
        return (
          <div
            key={label}
            role="menuitem"
            tabIndex={disabled ? undefined : -1}
            aria-disabled={disabled || undefined}
            data-testid={label}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

describe('useListFocus disabled-item skipping', () => {
  it('ArrowDown skips a disabled item instead of stalling on it', () => {
    render(<Menu disabledLabels={['Two']} />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('One').focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    // Should skip disabled "Two" and land on "Three".
    expect(screen.getByTestId('Three')).toHaveFocus();
  });

  it('ArrowUp skips a disabled item', () => {
    render(<Menu disabledLabels={['Three']} />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('Four').focus();

    fireEvent.keyDown(menu, {key: 'ArrowUp'});
    // Should skip disabled "Three" and land on "Two".
    expect(screen.getByTestId('Two')).toHaveFocus();
  });

  it('does not freeze at a leading disabled item (regression: menus-4)', () => {
    render(<Menu disabledLabels={['One']} />);
    const menu = screen.getByRole('menu');
    // Focus starts nowhere; ArrowDown should reach the first ENABLED item.
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    expect(screen.getByTestId('Two')).toHaveFocus();
  });

  it('wraps past a disabled item at the end', () => {
    render(<Menu disabledLabels={['Four']} wrap />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('Three').focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    // "Four" is disabled, wrap to "One".
    expect(screen.getByTestId('One')).toHaveFocus();
  });

  it('does not wrap when wrap is false', () => {
    render(<Menu disabledLabels={['Four']} wrap={false} />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('Three').focus();

    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    // "Four" disabled, no wrap -> focus stays on "Three".
    expect(screen.getByTestId('Three')).toHaveFocus();
  });

  it('Home focuses the first enabled item, End the last enabled item', () => {
    render(<Menu disabledLabels={['One', 'Four']} />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('Two').focus();

    fireEvent.keyDown(menu, {key: 'End'});
    expect(screen.getByTestId('Three')).toHaveFocus();

    fireEvent.keyDown(menu, {key: 'Home'});
    expect(screen.getByTestId('Two')).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// Roving-tabindex mode + composite navigation behaviors.
// These exercise the opt-in `hasRovingTabIndex`, `orientation: 'both'`,
// `hasCaretGuard`, and shortcut-passthrough behaviors.
// ---------------------------------------------------------------------------

const ROVING_LABELS = ['A', 'B', 'C'];

function RovingToolbar({
  labels = ROVING_LABELS,
  disabledLabels = NO_DISABLED,
  ...opts
}: {
  labels?: string[];
  disabledLabels?: string[];
} & Parameters<typeof useInternalListFocus>[0]) {
  // The internal hook takes the public options plus the Core-only ones.
  const {listRef, handleKeyDown, handleFocus} =
    useInternalListFocus<HTMLDivElement>({
      itemSelector: 'button, input, [tabindex]',
      hasRovingTabIndex: true,
      orientation: 'horizontal',
      ...opts,
    });
  return (
    <div
      ref={listRef}
      role="toolbar"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}>
      {labels.map(label => (
        <button
          key={label}
          type="button"
          disabled={disabledLabels.includes(label)}
          data-testid={label}>
          {label}
        </button>
      ))}
    </div>
  );
}

function orderBy(first: string) {
  return (list: HTMLElement) => {
    const buttons = Array.from(list.querySelectorAll<HTMLElement>('button'));
    const stop = buttons.find(button => button.dataset.testid === first);
    return stop == null
      ? buttons
      : [stop, ...buttons.filter(button => button !== stop)];
  };
}

describe('useListFocus roving tabindex (hasRovingTabIndex)', () => {
  it('stamps a single tab stop (first enabled item is tabbable)', () => {
    render(<RovingToolbar />);
    expect(screen.getByTestId('A')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('B')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('C')).toHaveAttribute('tabindex', '-1');
  });

  it('promotes the first ENABLED item when the first is disabled (repair)', () => {
    render(<RovingToolbar disabledLabels={['A']} />);
    expect(screen.getByTestId('B')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('A')).toHaveAttribute('tabindex', '-1');
  });

  it('leaves no tab stop while every item is disabled, by default', () => {
    render(<RovingToolbar disabledLabels={ROVING_LABELS} />);
    for (const label of ROVING_LABELS) {
      expect(screen.getByTestId(label)).not.toHaveAttribute('tabindex', '0');
    }
  });

  it('keeps one tab stop while every item is disabled, on the element the callback returns first', () => {
    const {rerender} = render(
      <RovingToolbar
        disabledLabels={ROVING_LABELS}
        disabledTabStop={orderBy('B')}
      />,
    );
    expect(screen.getByTestId('B')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('A')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('C')).toHaveAttribute('tabindex', '-1');

    // The stop follows what the callback returns first.
    rerender(
      <RovingToolbar
        disabledLabels={ROVING_LABELS}
        disabledTabStop={orderBy('A')}
      />,
    );
    expect(screen.getByTestId('A')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('B')).toHaveAttribute('tabindex', '-1');
    expect(screen.getByTestId('C')).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves the tab stop to the next enabled item', () => {
    render(<RovingToolbar />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('A').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('B')).toHaveFocus();
    expect(screen.getByTestId('B')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('A')).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight skips a disabled item', () => {
    render(<RovingToolbar disabledLabels={['B']} />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('A').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('C')).toHaveFocus();
  });

  it('wraps at the end by default', () => {
    render(<RovingToolbar />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('C').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('A')).toHaveFocus();
  });

  it('does not wrap when wrap=false', () => {
    render(<RovingToolbar wrap={false} />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('C').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('C')).toHaveFocus();
  });

  it('Home/End jump to first/last enabled items', () => {
    render(<RovingToolbar />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('B').focus();
    fireEvent.keyDown(toolbar, {key: 'End'});
    expect(screen.getByTestId('C')).toHaveFocus();
    fireEvent.keyDown(toolbar, {key: 'Home'});
    expect(screen.getByTestId('A')).toHaveFocus();
  });

  it('orientation "both" navigates with all four arrows', () => {
    render(<RovingToolbar orientation="both" />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('A').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowDown'});
    expect(screen.getByTestId('B')).toHaveFocus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('C')).toHaveFocus();
  });

  it('vertical orientation ignores horizontal arrows', () => {
    render(<RovingToolbar orientation="vertical" />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('A').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowDown'});
    expect(screen.getByTestId('B')).toHaveFocus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    // ArrowRight is inert in vertical mode.
    expect(screen.getByTestId('B')).toHaveFocus();
  });

  it('does not manage tabindex when hasRovingTabIndex is off', () => {
    render(<RovingToolbar hasRovingTabIndex={false} />);
    // No tabindex stamped — the buttons keep their intrinsic tab order.
    expect(screen.getByTestId('A')).not.toHaveAttribute('tabindex');
    expect(screen.getByTestId('B')).not.toHaveAttribute('tabindex');
  });
});

function ToolbarWithInput(opts: Parameters<typeof useListFocus>[0]) {
  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    itemSelector: 'button, input, [tabindex]',
    hasRovingTabIndex: true,
    orientation: 'horizontal',
    hasCaretGuard: true,
    ...opts,
  });
  return (
    <div
      ref={listRef}
      role="toolbar"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}>
      <button type="button" data-testid="before">
        Before
      </button>
      <input type="text" defaultValue="hello" data-testid="field" />
      <button type="button" data-testid="after">
        After
      </button>
    </div>
  );
}

describe('useListFocus caret-boundary guard (hasCaretGuard, navigation-4)', () => {
  function getField(): HTMLInputElement {
    const el = screen.getByTestId('field');
    if (!(el instanceof HTMLInputElement)) {
      throw new Error('expected an input');
    }
    return el;
  }

  it('does not steal ArrowRight from a text input mid-line', () => {
    render(<ToolbarWithInput />);
    const toolbar = screen.getByRole('toolbar');
    const field = getField();
    field.focus();
    field.setSelectionRange(1, 1); // caret in the middle of "hello"
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    // Focus stays in the input; caret movement is left to the browser.
    expect(field).toHaveFocus();
  });

  it('steals ArrowRight when the caret is at the end of the input', () => {
    render(<ToolbarWithInput />);
    const toolbar = screen.getByRole('toolbar');
    const field = getField();
    field.focus();
    field.setSelectionRange(5, 5); // caret at end of "hello"
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    // Now the composite navigates to the next item.
    expect(screen.getByTestId('after')).toHaveFocus();
  });

  it('does not steal an arrow key when the input has a selection', () => {
    render(<ToolbarWithInput />);
    const toolbar = screen.getByRole('toolbar');
    const field = getField();
    field.focus();
    field.setSelectionRange(0, 5); // whole value selected
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(field).toHaveFocus();
  });

  it('steals the key from a text input when hasCaretGuard is off', () => {
    render(<ToolbarWithInput hasCaretGuard={false} />);
    const toolbar = screen.getByRole('toolbar');
    const field = getField();
    field.focus();
    field.setSelectionRange(1, 1); // caret mid-line, but no caret guard
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    expect(screen.getByTestId('after')).toHaveFocus();
  });
});

function ToolbarWithEditable(opts: Parameters<typeof useListFocus>[0]) {
  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    itemSelector: 'button, input, [contenteditable], [tabindex]',
    hasRovingTabIndex: true,
    orientation: 'horizontal',
    hasCaretGuard: true,
    ...opts,
  });
  return (
    <div
      ref={listRef}
      role="toolbar"
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}>
      <button type="button" data-testid="before">
        Before
      </button>
      <div
        contentEditable
        suppressContentEditableWarning
        data-testid="composer">
        hello world
      </div>
      <button type="button" data-testid="after">
        After
      </button>
    </div>
  );
}

describe('useListFocus caret-boundary guard: contenteditable (navigation-4)', () => {
  it('does not steal arrow keys from a non-empty contenteditable', () => {
    render(<ToolbarWithEditable />);
    const toolbar = screen.getByRole('toolbar');
    const composer = screen.getByTestId('composer');
    composer.focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight'});
    // Focus stays in the editor; list navigation must not hijack the arrow.
    expect(composer).toHaveFocus();
    fireEvent.keyDown(toolbar, {key: 'ArrowLeft'});
    expect(composer).toHaveFocus();
  });
});

describe('useListFocus shortcut passthrough', () => {
  it('passes browser shortcut chords (Cmd/Ctrl/Alt) through', () => {
    render(<RovingToolbar />);
    const toolbar = screen.getByRole('toolbar');
    screen.getByTestId('A').focus();
    fireEvent.keyDown(toolbar, {key: 'ArrowRight', metaKey: true});
    // Focus should not move on a modified chord.
    expect(screen.getByTestId('A')).toHaveFocus();
  });
});

/**
 * A horizontal list (menubar-like) for RTL direction tests. jsdom reflects the
 * `dir` attribute into computed style only on the element that carries it, so
 * `dir` is set on the list container itself — the element the hook reads via
 * listRef.
 */
function HorizontalMenu({dir}: {dir?: 'ltr' | 'rtl'}) {
  const {listRef, handleKeyDown} = useListFocus<HTMLDivElement>({
    orientation: 'horizontal',
  });
  const items = ['One', 'Two', 'Three'];
  return (
    <div ref={listRef} role="menu" dir={dir} onKeyDown={handleKeyDown}>
      {items.map(label => (
        <div key={label} role="menuitem" tabIndex={-1} data-testid={label}>
          {label}
        </div>
      ))}
    </div>
  );
}

describe('useListFocus RTL auto-detection (WCAG 1.3.2)', () => {
  it('auto-detects dir="rtl": ArrowLeft moves to the next item', () => {
    render(<HorizontalMenu dir="rtl" />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('One').focus();
    fireEvent.keyDown(menu, {key: 'ArrowLeft'});
    expect(screen.getByTestId('Two')).toHaveFocus();
  });

  it('auto-detects dir="rtl": ArrowRight moves to the previous item', () => {
    render(<HorizontalMenu dir="rtl" />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('Two').focus();
    fireEvent.keyDown(menu, {key: 'ArrowRight'});
    expect(screen.getByTestId('One')).toHaveFocus();
  });

  it('stays LTR without a direction: ArrowRight moves to the next item', () => {
    render(<HorizontalMenu />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('One').focus();
    fireEvent.keyDown(menu, {key: 'ArrowRight'});
    expect(screen.getByTestId('Two')).toHaveFocus();
  });
});

// A menu whose second item contains a NESTED role="menu" (mirrors an inline
// submenu flyout). Exercises boundarySelector: item scoping + event ownership.
function NestedMenu() {
  const {listRef, handleKeyDown, ownsEvent} = useListFocus<HTMLDivElement>({
    boundarySelector: '[role="menu"]',
    wrap: false,
  });
  return (
    <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
      <div role="menuitem" tabIndex={-1} data-testid="Outer1">
        Outer1
      </div>
      <div role="menuitem" tabIndex={-1} data-testid="Outer2">
        Outer2
        {/* Nested submenu rendered inline (like a popover flyout). */}
        <div role="menu" data-testid="inner-menu">
          <div role="menuitem" tabIndex={-1} data-testid="Inner1">
            Inner1
          </div>
          <div role="menuitem" tabIndex={-1} data-testid="Inner2">
            Inner2
          </div>
        </div>
      </div>
      <div role="menuitem" tabIndex={-1} data-testid="Outer3">
        Outer3
      </div>
      {/* Surface ownership for assertions. */}
      <input
        data-testid="probe-owns"
        onKeyDown={e => {
          e.currentTarget.setAttribute('data-owns', String(ownsEvent(e)));
        }}
      />
    </div>
  );
}

// Variant with the ownsEvent probe placed INSIDE the nested menu, so a key
// event from it reports as not-owned by the outer list.
function NestedMenuWithInnerProbe() {
  const {listRef, handleKeyDown, ownsEvent} = useListFocus<HTMLDivElement>({
    boundarySelector: '[role="menu"]',
    wrap: false,
  });
  const report = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    e.currentTarget.setAttribute('data-owns', String(ownsEvent(e)));
  };
  return (
    <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
      <div role="menuitem" tabIndex={-1} data-testid="Outer1">
        Outer1
      </div>
      <div role="menu" data-testid="inner-menu">
        <input data-testid="inner-probe" onKeyDown={report} />
      </div>
    </div>
  );
}

describe('useListFocus boundarySelector (nested lists)', () => {
  it("ArrowDown skips over a nested list's items to the next own item", () => {
    render(<NestedMenu />);
    const menu = screen.getAllByRole('menu')[0];
    screen.getByTestId('Outer2').focus();
    fireEvent.keyDown(menu, {key: 'ArrowDown'});
    // Lands on Outer3, not Inner1 (which is inside the nested menu).
    expect(screen.getByTestId('Outer3')).toHaveFocus();
  });

  it('ownsEvent is true for an event originating at this level', () => {
    render(<NestedMenu />);
    const ownProbe = screen.getByTestId('probe-owns');
    fireEvent.keyDown(ownProbe, {key: 'ArrowDown'});
    expect(ownProbe).toHaveAttribute('data-owns', 'true');
  });

  it('ownsEvent is false for an event from inside a nested list', () => {
    render(<NestedMenuWithInnerProbe />);
    const innerProbe = screen.getByTestId('inner-probe');
    fireEvent.keyDown(innerProbe, {key: 'ArrowDown'});
    expect(innerProbe).toHaveAttribute('data-owns', 'false');
  });
});

// A list inside a host that dismisses on Escape. The host's guard mirrors
// `useFocusTrap`: it acts only on a key no inner handler has consumed.
function EscapeHost({
  onEscape,
  onHostEscape,
}: {
  onEscape?: () => void;
  onHostEscape: () => void;
}) {
  const {listRef, handleKeyDown} = useListFocus<HTMLDivElement>({onEscape});
  return (
    <div
      data-testid="host"
      onKeyDown={e => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          onHostEscape();
        }
      }}>
      <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
        <div role="menuitem" tabIndex={-1} data-testid="One">
          One
        </div>
        <div role="menuitem" tabIndex={-1} data-testid="Two">
          Two
        </div>
      </div>
    </div>
  );
}

describe('useListFocus Escape', () => {
  it('leaves Escape to the host when no onEscape is supplied', () => {
    const onHostEscape = vi.fn();
    render(<EscapeHost onHostEscape={onHostEscape} />);

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'Escape'});
    expect(onHostEscape).toHaveBeenCalledTimes(1);
  });

  it('consumes Escape and runs onEscape when one is supplied', () => {
    const onEscape = vi.fn();
    const onHostEscape = vi.fn();
    render(<EscapeHost onEscape={onEscape} onHostEscape={onHostEscape} />);

    fireEvent.keyDown(screen.getByRole('menu'), {key: 'Escape'});
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onHostEscape).not.toHaveBeenCalled();
  });

  it('still consumes arrow keys with no onEscape (page-scroll suppression)', () => {
    render(<EscapeHost onHostEscape={() => {}} />);
    screen.getByTestId('One').focus();

    // fireEvent returns false when a handler cancelled the event.
    const wasCancelled = !fireEvent.keyDown(screen.getByRole('menu'), {
      key: 'ArrowDown',
    });
    expect(wasCancelled).toBe(true);
    expect(screen.getByTestId('Two')).toHaveFocus();
  });
});

describe('useListFocus paging (hasPaging)', () => {
  const ROW_HEIGHT = 40;
  const VIEWPORT = 100;

  function PagedMenu({hasPaging = true}: {hasPaging?: boolean}) {
    const {listRef, handleKeyDown} = useListFocus<HTMLDivElement>({
      hasPaging,
      wrap: true,
    });
    const items = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    return (
      <div ref={listRef} role="menu" onKeyDown={handleKeyDown}>
        {items.map(label => (
          <div key={label} role="menuitem" tabIndex={-1} data-testid={label}>
            {label}
          </div>
        ))}
      </div>
    );
  }

  /**
   * jsdom has no layout: give the container a 100px viewport and each row
   * 40px, so rows One and Two are fully visible, Three is cut, and the rest
   * sit below the fold.
   */
  function layOut() {
    const menu = screen.getByRole('menu');
    const rect = (top: number, bottom: number) =>
      ({
        top,
        bottom,
        left: 0,
        right: 200,
        width: 200,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue(rect(0, VIEWPORT));
    Object.defineProperty(menu, 'clientHeight', {value: VIEWPORT});
    screen.getAllByRole('menuitem').forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(
        rect(index * ROW_HEIGHT, (index + 1) * ROW_HEIGHT),
      );
    });
    return menu;
  }

  it('PageDown moves to the last fully visible item', () => {
    render(<PagedMenu />);
    const menu = layOut();
    screen.getByTestId('One').focus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Two')).toHaveFocus();
  });

  it('PageDown pressed at the visible edge moves one viewport further, never wrapping', () => {
    render(<PagedMenu />);
    const menu = layOut();
    screen.getByTestId('Two').focus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Four')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Six')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Six')).toHaveFocus();
  });

  it('PageUp mirrors PageDown', () => {
    render(<PagedMenu />);
    const menu = layOut();
    screen.getByTestId('Two').focus();
    fireEvent.keyDown(menu, {key: 'PageUp'});
    expect(screen.getByTestId('One')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageUp'});
    expect(screen.getByTestId('One')).toHaveFocus();
  });

  it('PageDown in a list that does not scroll acts as End', () => {
    render(<PagedMenu />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('One').focus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Six')).toHaveFocus();
    fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('Six')).toHaveFocus();
  });

  it('leaves PageDown to the host when paging is off', () => {
    render(<PagedMenu hasPaging={false} />);
    const menu = screen.getByRole('menu');
    screen.getByTestId('One').focus();
    const event = fireEvent.keyDown(menu, {key: 'PageDown'});
    expect(screen.getByTestId('One')).toHaveFocus();
    // Not consumed: fireEvent returns false when preventDefault was called.
    expect(event).toBe(true);
  });
});
