// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToggleButton.test.tsx
 * @input Uses vitest, @testing-library/react, ToggleButton, ToggleButtonGroup
 * @output Unit tests for ToggleButton callback/Action order, pending state,
 *   group-owned selection, and ToggleButtonGroup
 *
 * SYNC: When ToggleButton.tsx or ToggleButtonGroup.tsx changes, update tests
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, act, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState, type MouseEvent} from 'react';
import {ToggleButton} from './ToggleButton';
import {ToggleButtonGroup} from './ToggleButtonGroup';
import {
  getAllInjectedCss,
  getForcedColorsRules,
} from '../__tests__/forcedColors';

// =============================================================================
// ToggleButton — Standalone
// =============================================================================

describe('ToggleButton', () => {
  describe('elevation', () => {
    it('reflects the elevation prop as a theme attribute', () => {
      const attrFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <ToggleButton
            label="Filter"
            isPressed={false}
            onPressedChange={() => {}}
            elevation={elevation}
          />,
        );
        return container
          .querySelector('button')!
          .getAttribute('data-elevation');
      };
      expect(attrFor('none')).toBe('none');
      expect(attrFor('low')).toBe('low');
      expect(attrFor('med')).toBe('med');
      expect(attrFor('high')).toBe('high');
    });

    it('defaults to flat (elevation none)', () => {
      const {container} = render(
        <ToggleButton
          label="Filter"
          isPressed={false}
          onPressedChange={() => {}}
        />,
      );
      expect(container.querySelector('button')).toHaveAttribute(
        'data-elevation',
        'none',
      );
    });

    it('is retained inside a ToggleButtonGroup — grouped children keep their own elevation', () => {
      const {container} = render(
        <ToggleButtonGroup label="View" value={null} onChange={() => {}}>
          <ToggleButton label="Card" value="card" elevation="high" />
        </ToggleButtonGroup>,
      );
      expect(container.querySelector('button')).toHaveAttribute(
        'data-elevation',
        'high',
      );
    });
  });

  it('renders with label as visible text', () => {
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', {name: 'Bold'})).toBeInTheDocument();
  });

  it('renders children instead of label when provided', () => {
    render(
      <ToggleButton
        label="Toggle bold"
        isPressed={false}
        onPressedChange={() => {}}>
        Custom content
      </ToggleButton>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Custom content');
  });

  it('renders icon-only button with aria-label', () => {
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
        icon={<span data-testid="icon">B</span>}
        isIconOnly
      />,
    );
    const button = screen.getByRole('button', {name: 'Bold'});
    expect(button).toHaveAttribute('aria-label', 'Bold');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('calls onPressedChange with true when clicking unpressed button', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it('calls onPressedChange with false when clicking pressed button', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButton
        label="Bold"
        isPressed={true}
        onPressedChange={handleChange}
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it('renders pressedIcon when pressed', () => {
    render(
      <ToggleButton
        label="Favorite"
        isPressed={true}
        onPressedChange={() => {}}
        icon={<span data-testid="outline-icon">♡</span>}
        pressedIcon={<span data-testid="filled-icon">♥</span>}
        isIconOnly
      />,
    );
    expect(screen.getByTestId('filled-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('outline-icon')).not.toBeInTheDocument();
  });

  it('renders icon when not pressed even if pressedIcon provided', () => {
    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={() => {}}
        icon={<span data-testid="outline-icon">♡</span>}
        pressedIcon={<span data-testid="filled-icon">♥</span>}
        isIconOnly
      />,
    );
    expect(screen.getByTestId('outline-icon')).toBeInTheDocument();
    expect(screen.queryByTestId('filled-icon')).not.toBeInTheDocument();
  });

  it('does not fire events when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={handleChange}
        isDisabled
      />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('renders width reservation element for label text', () => {
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
      />,
    );
    const button = screen.getByRole('button');
    const hiddenSpan = button.querySelector('[aria-hidden="true"]');
    expect(hiddenSpan).toBeInTheDocument();
    expect(hiddenSpan).toHaveTextContent('Bold');
  });

  it('does not render width reservation for icon-only buttons', () => {
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
        icon={<span>B</span>}
        isIconOnly
      />,
    );
    const button = screen.getByRole('button');
    const hiddenSpan = button.querySelector('[aria-hidden="true"]');
    expect(hiddenSpan).not.toBeInTheDocument();
  });

  it('preserves caller className alongside theme classes', () => {
    render(<ToggleButton label="All" className="my-filter" />);

    expect(screen.getByRole('button', {name: 'All'})).toHaveClass(
      'my-filter',
      'astryx-toggle-button',
      'astryx-button',
    );
  });

  it('passes data-testid through', () => {
    render(
      <ToggleButton
        label="Bold"
        isPressed={false}
        onPressedChange={() => {}}
        data-testid="bold-toggle"
      />,
    );
    expect(screen.getByTestId('bold-toggle')).toBeInTheDocument();
  });

  it('shows the optimistic pressed state and stays interruptible while pending', async () => {
    const user = userEvent.setup();
    let resolveAction: (() => void) | undefined;
    const pressedChangeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );

    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={() => {}}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    const button = screen.getByRole('button', {name: 'Favorite'});
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);

    // The optimistic state flips immediately and the spinner shows via
    // aria-busy, but the button is never disabled — it stays clickable so the
    // action can be interrupted by another click.
    expect(pressedChangeAction).toHaveBeenCalledWith(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    // Settle the action so the pending transition doesn't leak into later tests.
    await act(async () => {
      resolveAction?.();
      await Promise.resolve();
    });
  });

  it('clears the loading state once the action settles', async () => {
    const user = userEvent.setup();
    let resolveAction: (() => void) | undefined;
    const pressedChangeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );

    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={() => {}}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    const button = screen.getByRole('button', {name: 'Favorite'});
    await user.click(button);

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await act(async () => {
      resolveAction?.();
      await Promise.resolve();
    });
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
  });

  it('interrupts an in-flight action on re-click (true -> false -> true)', async () => {
    // Each click interrupts the previous transition. The actions are resolved
    // at the end so the pending transition doesn't leak into later tests.
    const resolvers: (() => void)[] = [];
    const pressedChangeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolvers.push(resolve);
        }),
    );

    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={() => {}}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    const button = screen.getByRole('button', {name: 'Favorite'});

    // Each click derives the next state from the optimistic (in-progress)
    // value, so rapid clicks toggle rather than being dropped. The button is
    // never disabled while pending, so every click lands and interrupts.
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    expect(pressedChangeAction).toHaveBeenCalledTimes(3);
    expect(pressedChangeAction).toHaveBeenNthCalledWith(1, true);
    expect(pressedChangeAction).toHaveBeenNthCalledWith(2, false);
    expect(pressedChangeAction).toHaveBeenNthCalledWith(3, true);

    await act(async () => {
      resolvers.forEach(resolve => resolve());
      await Promise.resolve();
    });
  });

  it('supports a synchronous pressedChangeAction', async () => {
    const user = userEvent.setup();
    // A sync handler (e.g. a router navigation) with no returned promise.
    const pressedChangeAction = vi.fn((_next: boolean) => {});
    const onPressedChange = vi.fn();

    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={onPressedChange}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    const button = screen.getByRole('button', {name: 'Favorite'});
    await user.click(button);

    expect(onPressedChange).toHaveBeenCalledWith(true, expect.anything());
    expect(pressedChangeAction).toHaveBeenCalledWith(true);
  });

  it('runs the synchronous callback before the Action with the same next state', async () => {
    const calls: string[] = [];
    const pressedChangeAction = vi.fn(() => {
      calls.push('action');
    });
    const onPressedChange = vi.fn(() => {
      expect(pressedChangeAction).not.toHaveBeenCalled();
      calls.push('change');
    });
    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={onPressedChange}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    await userEvent.setup().click(screen.getByRole('button'));

    expect(calls).toEqual(['change', 'action']);
    expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(
      true,
      expect.anything(),
    );
    expect(pressedChangeAction).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('keeps callback-only controlled toggles synchronous without pending feedback', async () => {
    function LegacyToggle() {
      const [isPressed, setIsPressed] = useState(false);
      return (
        <ToggleButton
          label="Bold"
          isPressed={isPressed}
          onPressedChange={setIsPressed}
        />
      );
    }
    render(<LegacyToggle />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    await act(async () => {});
  });

  it('runs an Action without onPressedChange and settles to the controlled value', async () => {
    let resolveAction: (() => void) | undefined;
    const pressedChangeAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );
    const {rerender} = render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        pressedChangeAction={pressedChangeAction}
      />,
    );
    const button = screen.getByRole('button');

    await userEvent.setup().click(button);
    expect(pressedChangeAction).toHaveBeenCalledExactlyOnceWith(true);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    await act(async () => resolveAction?.());
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('aria-busy', 'true');

    rerender(
      <ToggleButton
        label="Favorite"
        isPressed
        pressedChangeAction={pressedChangeAction}
      />,
    );
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(pressedChangeAction).toHaveBeenCalledTimes(1);
  });

  it('skips pressedChangeAction when onPressedChange calls preventDefault', async () => {
    const pressedChangeAction = vi.fn();
    const onPressedChange = vi.fn(
      (_next: boolean, event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
      },
    );

    render(
      <ToggleButton
        label="Favorite"
        isPressed={false}
        onPressedChange={onPressedChange}
        pressedChangeAction={pressedChangeAction}
      />,
    );

    const button = screen.getByRole('button', {name: 'Favorite'});
    fireEvent.click(button);

    expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(
      true,
      expect.anything(),
    );
    expect(pressedChangeAction).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    await act(async () => {});
  });

  // family:buttons FR5: a caller onClick on a standalone ToggleButton runs
  // before onPressedChange and pressedChangeAction, never replaces the toggle
  // request, and cancels it only by calling preventDefault() itself.
  describe('with a caller onClick', () => {
    it('runs the caller onClick first, then requests the next state and runs the Action', async () => {
      const calls: string[] = [];
      render(
        <ToggleButton
          label="Compact"
          isPressed={false}
          onClick={() => calls.push('onClick')}
          onPressedChange={next => calls.push(`onPressedChange:${next}`)}
          pressedChangeAction={next => {
            calls.push(`pressedChangeAction:${next}`);
          }}
        />,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Compact'}));
      await act(async () => {});

      expect(calls).toEqual([
        'onClick',
        'onPressedChange:true',
        'pressedChangeAction:true',
      ]);
    });

    it('requests no next state when the caller onClick calls preventDefault', async () => {
      const onPressedChange = vi.fn();
      const pressedChangeAction = vi.fn();
      render(
        <ToggleButton
          label="Compact"
          isPressed={false}
          onClick={event => event.preventDefault()}
          onPressedChange={onPressedChange}
          pressedChangeAction={pressedChangeAction}
        />,
      );

      const button = screen.getByRole('button', {name: 'Compact'});
      fireEvent.click(button);
      await act(async () => {});

      expect(onPressedChange).not.toHaveBeenCalled();
      expect(pressedChangeAction).not.toHaveBeenCalled();
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('still requests the next state when the click was already prevented before the caller onClick ran', () => {
      const onPressedChange = vi.fn();
      render(
        <div onClickCapture={event => event.preventDefault()}>
          <ToggleButton
            label="Compact"
            isPressed={false}
            onClick={() => {}}
            onPressedChange={onPressedChange}
          />
        </div>,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Compact'}));

      expect(onPressedChange).toHaveBeenCalledExactlyOnceWith(
        true,
        expect.anything(),
      );
    });
  });
});

// =============================================================================
// ToggleButtonGroup — Single mode
// =============================================================================

describe('ToggleButtonGroup (single)', () => {
  function SingleGroup() {
    const [value, setValue] = useState<string | null>('list');
    return (
      <ToggleButtonGroup value={value} onChange={setValue} label="View mode">
        <ToggleButton
          value="list"
          label="List"
          icon={<span>≡</span>}
          isIconOnly
        />
        <ToggleButton
          value="grid"
          label="Grid"
          icon={<span>⊞</span>}
          isIconOnly
        />
        <ToggleButton
          value="card"
          label="Card"
          icon={<span>□</span>}
          isIconOnly
        />
      </ToggleButtonGroup>
    );
  }

  it('renders a group with role="group" and aria-label', () => {
    render(<SingleGroup />);
    expect(screen.getByRole('group', {name: 'View mode'})).toBeInTheDocument();
  });

  it('marks the selected button as pressed', () => {
    render(<SingleGroup />);
    expect(screen.getByRole('button', {name: 'List'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', {name: 'Grid'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('selects a different button on click', async () => {
    const user = userEvent.setup();
    render(<SingleGroup />);

    await user.click(screen.getByRole('button', {name: 'Grid'}));

    expect(screen.getByRole('button', {name: 'Grid'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', {name: 'List'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('allows deselection by clicking the active button', async () => {
    const user = userEvent.setup();
    render(<SingleGroup />);

    await user.click(screen.getByRole('button', {name: 'List'}));

    expect(screen.getByRole('button', {name: 'List'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', {name: 'Grid'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

// =============================================================================
// ToggleButtonGroup — Multiple mode
// =============================================================================

describe('ToggleButtonGroup host props (public-component-api INV5)', () => {
  it('passes className, style, id, aria-* and data-* to the group, keeping its own role and name', () => {
    render(
      <ToggleButtonGroup
        label="Alignment"
        value={null}
        onChange={() => {}}
        className="toolbar-group"
        style={{marginTop: 8}}
        id="alignment"
        aria-describedby="alignment-hint"
        data-section="format"
        // A caller role or name never replaces the group's own.
        {...{role: 'radiogroup', 'aria-label': 'Ignored'}}>
        <ToggleButton value="left" label="Left" />
      </ToggleButtonGroup>,
    );
    const group = screen.getByRole('group', {name: 'Alignment'});
    expect(group).toHaveClass('toolbar-group');
    expect(group).toHaveClass('astryx-toggle-button-group');
    expect(group).toHaveStyle({marginTop: '8px'});
    expect(group).toHaveAttribute('id', 'alignment');
    expect(group).toHaveAttribute('aria-describedby', 'alignment-hint');
    expect(group).toHaveAttribute('data-section', 'format');
  });
});

describe('ToggleButtonGroup (multiple)', () => {
  function MultipleGroup() {
    const [value, setValue] = useState<string[]>(['bold']);
    return (
      <ToggleButtonGroup
        type="multiple"
        value={value}
        onChange={setValue}
        label="Formatting">
        <ToggleButton
          value="bold"
          label="Bold"
          icon={<span>B</span>}
          isIconOnly
        />
        <ToggleButton
          value="italic"
          label="Italic"
          icon={<span>I</span>}
          isIconOnly
        />
        <ToggleButton
          value="underline"
          label="Underline"
          icon={<span>U</span>}
          isIconOnly
        />
      </ToggleButtonGroup>
    );
  }

  it('marks selected buttons as pressed', () => {
    render(<MultipleGroup />);
    expect(screen.getByRole('button', {name: 'Bold'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', {name: 'Italic'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('adds a value when clicking an unpressed button', async () => {
    const user = userEvent.setup();
    render(<MultipleGroup />);

    await user.click(screen.getByRole('button', {name: 'Italic'}));

    expect(screen.getByRole('button', {name: 'Bold'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', {name: 'Italic'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('removes a value when clicking a pressed button', async () => {
    const user = userEvent.setup();
    render(<MultipleGroup />);

    await user.click(screen.getByRole('button', {name: 'Bold'}));

    expect(screen.getByRole('button', {name: 'Bold'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

// =============================================================================
// Group ownership — member Actions must not compete with controlled selection
// =============================================================================

describe.each(['single', 'multiple'] as const)(
  'ToggleButtonGroup (%s) ownership',
  type => {
    it('keeps selection group-owned even when a member has standalone handlers', async () => {
      const onChange = vi.fn();
      const onPressedChange = vi.fn();
      const pressedChangeAction = vi.fn();
      const groupProps =
        type === 'single'
          ? {type, value: 'list', onChange}
          : {type, value: ['list'], onChange};
      const children = (
        <>
          <ToggleButton value="list" label="List" isPressed={false} />
          <ToggleButton
            value="grid"
            label="Grid"
            isPressed
            onPressedChange={onPressedChange}
            pressedChangeAction={pressedChangeAction}
          />
        </>
      );
      const {rerender} = render(
        <ToggleButtonGroup {...groupProps} label="View">
          {children}
        </ToggleButtonGroup>,
      );
      const grid = screen.getByRole('button', {name: 'Grid'});
      expect(grid).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', {name: 'List'})).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      await userEvent.setup().click(grid);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(
        type === 'single' ? 'grid' : ['list', 'grid'],
      );
      expect(onPressedChange).not.toHaveBeenCalled();
      expect(pressedChangeAction).not.toHaveBeenCalled();
      expect(grid).toHaveAttribute('aria-pressed', 'false');
      expect(grid).not.toHaveAttribute('aria-busy', 'true');

      const acceptedProps =
        type === 'single'
          ? {type, value: 'grid', onChange}
          : {type, value: ['list', 'grid'], onChange};
      rerender(
        <ToggleButtonGroup {...acceptedProps} label="View">
          {children}
        </ToggleButtonGroup>,
      );
      expect(grid).toHaveAttribute('aria-pressed', 'true');
      await userEvent.setup().click(grid);
      expect(onChange).toHaveBeenLastCalledWith(
        type === 'single' ? null : ['list'],
      );
      expect(onPressedChange).not.toHaveBeenCalled();
      expect(pressedChangeAction).not.toHaveBeenCalled();
    });

    // family:buttons FR11: a member's selection request comes from the group,
    // and a caller onClick on the member must not replace it.
    it('still asks the group to toggle a member that receives an onClick', async () => {
      const onChange = vi.fn();
      const onClick = vi.fn();
      const groupProps =
        type === 'single'
          ? {type, value: null, onChange}
          : {type, value: [], onChange};
      render(
        <ToggleButtonGroup {...groupProps} label="View">
          <ToggleButton value="grid" label="Grid" onClick={onClick} />
        </ToggleButtonGroup>,
      );

      await userEvent.setup().click(screen.getByRole('button', {name: 'Grid'}));

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(
        type === 'single' ? 'grid' : ['grid'],
      );
    });
  },
);

// =============================================================================
// Disabled state — family:buttons FR3 (disabled means non-operable)
// =============================================================================

/**
 * Two ways a ToggleButton becomes unavailable, and the rule that binds them:
 * a group disables everything it contains, and a member can disable itself
 * while the group stays enabled. Neither source may cancel the other out.
 *
 * The tooltip cases are here at the attribute and callback level only. A
 * tooltip'd disabled toggle carries `aria-disabled` instead of the native
 * `disabled` attribute, so whether a REAL mouse press is refused is an engine
 * fact that jsdom's synthetic click cannot settle — that half lives in
 * ./__tests__/ToggleButton.a11y.chromium.spec.ts.
 */
describe('disabled state', () => {
  it('keeps a member disabled when the group disables nothing', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButtonGroup value={null} onChange={handleChange} label="View mode">
        <ToggleButton value="list" label="List" isDisabled />
        <ToggleButton value="grid" label="Grid" />
      </ToggleButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'List'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'List'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('leaves the rest of an enabled group selectable', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButtonGroup value={null} onChange={handleChange} label="View mode">
        <ToggleButton value="list" label="List" isDisabled />
        <ToggleButton value="grid" label="Grid" />
      </ToggleButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'Grid'})).toBeEnabled();

    await user.click(screen.getByRole('button', {name: 'Grid'}));
    expect(handleChange).toHaveBeenCalledWith('grid');
  });

  it('still disables a member that says nothing when the group is disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButtonGroup
        value={null}
        onChange={handleChange}
        label="View mode"
        isDisabled>
        <ToggleButton value="list" label="List" />
      </ToggleButtonGroup>,
    );

    expect(screen.getByRole('button', {name: 'List'})).toBeDisabled();

    await user.click(screen.getByRole('button', {name: 'List'}));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('keeps a tooltip-bearing disabled member focusable but inert', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButtonGroup value={null} onChange={handleChange} label="View mode">
        <ToggleButton
          value="list"
          label="List"
          tooltip="List view is unavailable for this dataset"
          isDisabled
        />
      </ToggleButtonGroup>,
    );

    const member = screen.getByRole('button', {name: 'List'});
    // The tooltip is the disabled reason, so the control stays reachable to
    // read it: aria-disabled rather than the native attribute, which would
    // take it out of the tab order along with its own explanation.
    expect(member).toHaveAttribute('aria-disabled', 'true');
    expect(member).not.toBeDisabled();

    await user.click(member);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('does not toggle a standalone disabled toggle that carries a tooltip', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButton
        label="Bold"
        tooltip="Formatting is locked for this document"
        isPressed={false}
        onPressedChange={handleChange}
        isDisabled
      />,
    );

    const toggle = screen.getByRole('button', {name: 'Bold'});
    expect(toggle).toHaveAttribute('aria-disabled', 'true');

    await user.click(toggle);
    expect(handleChange).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('still toggles an enabled toggle that carries the same tooltip', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ToggleButton
        label="Bold"
        tooltip="Bold the selected text"
        isPressed={false}
        onPressedChange={handleChange}
      />,
    );

    const toggle = screen.getByRole('button', {name: 'Bold'});
    expect(toggle).not.toHaveAttribute('aria-disabled');

    await user.click(toggle);
    expect(handleChange).toHaveBeenCalledWith(true, expect.anything());
  });
});

// jsdom cannot emulate forced-colors rendering, so these assert that the
// compiled output includes the forced-colors rules; visual behavior needs
// manual verification under Windows High Contrast.
describe('forced colors (WCAG 1.4.11)', () => {
  it('compiles forced-colors overrides so the pressed state survives Windows High Contrast', () => {
    render(<ToggleButton label="Bold" isPressed onPressedChange={() => {}} />);
    const css = getForcedColorsRules();
    // The painted pressed overlay is stripped; Highlight/HighlightText marks
    // the pressed toggle (critical for icon-only toggles, which otherwise
    // lose all pressed indication).
    expect(css).toContain('background-color: highlight;');
    expect(css).toContain('color: highlighttext;');
    // ToggleButton renders a <button>; without opting out of UA remapping it
    // keeps the native ButtonFace surface and ignores the Highlight fill,
    // leaving HighlightText text on a white surface. forced-color-adjust: none
    // makes both render as authored.
    expect(getAllInjectedCss()).toContain('forced-color-adjust: none;');
  });
});
