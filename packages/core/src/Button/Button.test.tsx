// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.test.tsx
 * @input Uses vitest, @testing-library/react, Button component
 * @output Unit tests for Button component behavior
 * @position Testing; validates Button.tsx implementation
 *
 * SYNC: When Button.tsx changes, update tests to match new behavior
 */

import {readFileSync} from 'node:fs';
import {describe, it, expect, vi} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  createEvent,
  act,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Button} from './Button';
import * as stylex from '@stylexjs/stylex';
import {
  hasPressedArm,
  hasReleaseFade,
  readsPressStrength,
} from '../__tests__/pressState';
import {Badge} from '../Badge/Badge';
import {ButtonGroup} from '../ButtonGroup';
import {InputGroup} from '../InputGroup';
import {TextInput} from '../TextInput';
import {IconButton} from '../IconButton';
import {InternationalizationProvider} from '../i18n';

const narrowRowProbe = stylex.create({
  rigid: {flexShrink: 0, minWidth: 'auto'},
});

describe('Button', () => {
  // Retained, narrowed: the shared contract proves the ROLE and the accessible
  // NAME in a real engine (button.role.exposed, button.name.exposed), which is
  // strictly stronger than asserting them here. What stays is the part it does
  // not own — that Button renders `label` as text a person can read, rather
  // than only as an accessible name.
  it('renders label as visible text', () => {
    render(<Button label="Click me" />);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('uses InputGroup end-cap geometry and keeps its keyboard ring above adjacent members', () => {
    const {rerender} = render(
      <InputGroup label="Visibility">
        <TextInput
          label="Audience"
          isLabelHidden
          value="Members"
          onChange={() => {}}
        />
        <Button label="Save" />
      </InputGroup>,
    );

    const addon = screen.getByRole('button', {name: 'Save'});
    expect(addon.className).toContain('groupStyles.buttonAddon');

    // jsdom cannot resolve this compound StyleX focus selector. Keep the
    // direct-child keyboard stacking rule explicit at its definition instead.
    const groupStylesSource = readFileSync(
      'packages/core/src/InputGroup/groupStyles.ts',
      'utf8',
    );
    expect(groupStylesSource).toContain(
      "':where(.astryx-input-group > *):focus-visible'",
    );
    expect(groupStylesSource).toMatch(
      /zIndex:\s*\{\s*default: null,\s*\[DIRECT_INPUT_GROUP_ADDON_FOCUS_VISIBLE\]: 2,/,
    );

    rerender(<Button label="Save" />);
    const standalone = screen.getByRole('button', {name: 'Save'});
    expect(standalone.className).not.toContain('groupStyles.buttonAddon');
  });

  it('renders children instead of label when provided', () => {
    render(<Button label="Accessible name">Custom content</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Custom content');
  });

  it('renders with different variants', () => {
    const {rerender} = render(<Button label="Primary" variant="primary" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button label="Secondary" variant="secondary" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button label="Ghost" variant="ghost" />);
    expect(screen.getByRole('button')).toBeInTheDocument();

    rerender(<Button label="Destructive" variant="destructive" />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  // Retained, narrowed: the shared contract proves an icon-only button HAS an
  // accessible name, computed by a real engine. What stays is Button's own
  // mapping — `isIconOnly` routes `label` to `aria-label` instead of to text,
  // and the icon is still rendered.
  it('maps label to aria-label and keeps the icon when icon-only', () => {
    render(
      <Button
        label="Settings"
        icon={<span data-testid="icon">⚙</span>}
        isIconOnly
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Settings');
    expect(button).not.toHaveTextContent('Settings');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders icon with text when both icon and children provided', () => {
    render(
      <Button label="Settings" icon={<span data-testid="icon">⚙</span>} />,
    );
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-label');
    expect(button).toHaveTextContent('Settings');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('shows isLoading state with spinner', () => {
    render(<Button label="Submit" isLoading />);
    const button = screen.getByRole('button');
    // Busy is aria-disabled (focusable), not native disabled — see #4871.
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button.className).toContain('styles.inactive');
    expect(button.className).not.toContain('styles.disabled');
  });

  it('keeps the dimmed treatment for explicitly disabled buttons', () => {
    render(<Button label="Submit" isDisabled />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.className).toContain('styles.inactive');
    expect(button.className).toContain('styles.disabled');
  });

  it('keeps a caller-supplied aria-disabled and aria-busy', () => {
    render(<Button label="Assign" aria-disabled="true" aria-busy={true} />);
    const button = screen.getByRole('button', {name: 'Assign'});
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('sets aria-busy synchronously while clickAction is pending', async () => {
    // The spinner reveal is visually delayed (CSS animation-delay), but the
    // loading DOM state — aria-busy and aria-disabled — must not be delayed.
    const user = userEvent.setup();
    let resolveAction: (() => void) | undefined;
    const clickAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );
    render(<Button label="Save" clickAction={clickAction} />);
    const button = screen.getByRole('button');

    await user.click(button);
    expect(button).toHaveAttribute('aria-busy', 'true');
    // Busy is aria-disabled (focusable), not native disabled — see #4871.
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');

    await act(async () => {
      resolveAction?.();
      await Promise.resolve();
    });
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('renders the loading spinner with the inherit shade for every variant (#2717)', () => {
    // The spinner must follow the button's resolved foreground color rather
    // than a hardcoded white, so it keeps contrast on themed variants like the
    // neutral theme's muted-red destructive button.
    for (const variant of [
      'primary',
      'secondary',
      'ghost',
      'destructive',
    ] as const) {
      const {container, unmount} = render(
        <Button label="Submit" variant={variant} isLoading />,
      );
      const spinner = container.querySelector('.astryx-spinner');
      expect(spinner).not.toBeNull();
      expect(spinner).toHaveAttribute('data-shade', 'inherit');
      unmount();
    }
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button label="Click me" onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button label="Click me" isDisabled onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not fire click when loading', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button label="Click me" isLoading onClick={handleClick} />);

    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Button label="Test" ref={ref} />);
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  });

  it('keeps its merged ref attached across unrelated rerenders', () => {
    const ref = vi.fn();
    const {rerender} = render(<Button label="Test" ref={ref} />);
    const button = screen.getByRole('button');
    expect(ref).toHaveBeenLastCalledWith(button);
    ref.mockClear();

    rerender(<Button label="Test" variant="primary" ref={ref} />);

    expect(ref).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBe(button);
  });

  // endContent tests
  it('renders endContent after label', () => {
    render(
      <Button
        label="Click me"
        endContent={<Badge data-testid="end" label={3} />}
      />,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Click me');
    expect(screen.getByTestId('end')).toBeInTheDocument();
    expect(screen.getByTestId('end')).toHaveTextContent('3');
  });

  it('renders endContent with children', () => {
    render(
      <Button
        label="Accessible name"
        endContent={<Badge data-testid="end" label="New" />}>
        Custom content
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('Custom content');
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('renders endContent with icon and children', () => {
    render(
      <Button
        label="Settings"
        icon={<span data-testid="icon">⚙</span>}
        endContent={<Badge data-testid="end" label="New" />}
      />,
    );
    const button = screen.getByRole('button');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(button).toHaveTextContent('Settings');
    expect(screen.getByTestId('end')).toBeInTheDocument();
  });

  it('does not render endContent for icon-only buttons', () => {
    render(
      <Button
        label="Settings"
        icon={<span data-testid="icon">⚙</span>}
        endContent={<Badge data-testid="end" label={3} />}
        isIconOnly
      />,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByTestId('end')).not.toBeInTheDocument();
  });

  it('wraps endContent in a container for color inheritance', () => {
    render(
      <Button
        label="Test"
        endContent={<Badge data-testid="end" label={3} />}
      />,
    );
    const badge = screen.getByTestId('end');
    // The badge should be inside a wrapper span that inherits color
    const wrapper = badge.parentElement;
    expect(wrapper?.tagName).toBe('SPAN');
  });

  it('hides endContent content when loading', () => {
    render(
      <Button
        label="Submit"
        isLoading
        endContent={<Badge data-testid="end" label={3} />}
      />,
    );
    // endContent should still be in the DOM
    expect(screen.getByTestId('end')).toBeInTheDocument();
    // Busy is aria-disabled (focusable), not native disabled — see #4871.
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders astryx-* classes and data attributes for theme targeting', () => {
    render(<Button label="Test" variant="secondary" size="sm" />);
    const button = screen.getByRole('button');
    expect(button.className).toContain('astryx-button');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
  });

  it('applies string width as-is', () => {
    render(<Button label="Sign in" width="100%" />);
    const button = screen.getByRole('button');
    // StyleX compiles the dynamic width to an inline CSS custom property.
    expect(button.getAttribute('style')).toContain('100%');
    expect(button.className).toContain('dynamicStyles.width');
  });

  it('applies numeric width as pixels', () => {
    render(<Button label="Sign in" width={240} />);
    expect(screen.getByRole('button').getAttribute('style')).toContain('240');
  });

  it('omits width styling when the prop is not provided', () => {
    render(<Button label="Sign in" />);
    expect(screen.getByRole('button').className).not.toContain(
      'dynamicStyles.width',
    );
  });

  it('applies width when rendered as a link via href', () => {
    render(<Button label="Sign in" href="https://example.com" width="100%" />);
    expect(
      screen.getByRole('link', {name: 'Sign in'}).getAttribute('style'),
    ).toContain('100%');
  });

  // P0: onClick fires before clickAction, clickAction respects preventDefault
  it('fires onClick before clickAction', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const handleClick = vi.fn(() => {
      order.push('onClick');
    });
    const handleAction = vi.fn(() => {
      order.push('clickAction');
    });
    render(
      <Button label="Test" onClick={handleClick} clickAction={handleAction} />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['onClick', 'clickAction']);
  });

  it('does not call clickAction when onClick calls preventDefault', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
    const handleAction = vi.fn();
    render(
      <Button label="Test" onClick={handleClick} clickAction={handleAction} />,
    );

    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleAction).not.toHaveBeenCalled();
  });

  it('fires clickAction once on a fast double-click (no double-submit)', async () => {
    let resolveAction: (() => void) | undefined;
    const handleAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );
    render(<Button label="Pay" clickAction={handleAction} />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(handleAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction?.();
      await Promise.resolve();
    });
  });

  it('stays clickable (not disabled) while a clickAction is pending when isInterruptible', async () => {
    const user = userEvent.setup();
    let resolveAction: (() => void) | undefined;
    const clickAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolveAction = resolve;
        }),
    );
    render(<Button label="Toggle" isInterruptible clickAction={clickAction} />);
    const button = screen.getByRole('button');

    await user.click(button);
    // Loading is announced via aria-busy, but the button is not disabled so it
    // can be re-clicked to interrupt the in-flight action.
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();

    await act(async () => {
      resolveAction?.();
      await Promise.resolve();
    });
    expect(button).not.toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
  });

  it('re-fires clickAction on re-click while pending when isInterruptible (no dedupe)', async () => {
    // Unlike the fire-once default, an interruptible action is not deduped: a
    // re-click while pending starts a fresh action that interrupts the prior.
    const resolvers: (() => void)[] = [];
    const clickAction = vi.fn(
      async () =>
        new Promise<void>(resolve => {
          resolvers.push(resolve);
        }),
    );
    render(<Button label="Toggle" isInterruptible clickAction={clickAction} />);

    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(clickAction).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers.forEach(resolve => resolve());
      await Promise.resolve();
    });
  });

  // type/name/value/form props
  it('defaults type to button', () => {
    render(<Button label="Test" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('passes type=submit', () => {
    render(<Button label="Submit" type="submit" />);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('uses aria-disabled instead of disabled when tooltip is present and button is disabled', () => {
    render(<Button label="Test" tooltip="Reason disabled" isDisabled />);
    const button = screen.getByRole('button');
    // Should NOT have native disabled (so it stays focusable for tooltip)
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not fire handlers when aria-disabled via tooltip', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <Button
        label="Test"
        tooltip="Reason disabled"
        isDisabled
        onClick={handleClick}
      />,
    );
    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('suppresses activation keys but passes other keys when aria-disabled via tooltip', async () => {
    const user = userEvent.setup();
    const handleKeyDown = vi.fn();
    render(
      <Button
        label="Test"
        tooltip="Reason disabled"
        isDisabled
        onKeyDown={handleKeyDown}
      />,
    );
    const button = screen.getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');
    // Activation keys (Enter) should be suppressed
    expect(handleKeyDown).not.toHaveBeenCalled();

    // Non-activation keys (Escape) should reach consumer handler
    await user.keyboard('{Escape}');
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });

  it('uses aria-disabled instead of disabled while isLoading, so the button stays focusable (#4871)', () => {
    render(<Button label="Save" isLoading />);
    const button = screen.getByRole('button');
    // Native disabled would move focus to <body> the moment the action
    // starts, losing the keyboard user's place — busy must stay
    // aria-disabled + focusable per the "Disabled vs Busy" convention.
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    button.focus();
    expect(button).toHaveFocus();
  });

  it('does not fire onClick while aria-disabled via isLoading', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button label="Save" isLoading onClick={handleClick} />);
    await user.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('does not let a click on a busy button reach a wrapping ancestor handler', async () => {
    // A native `disabled` element never dispatches a click, so it never
    // reaches an ancestor either. aria-disabled (busy-only) is a real,
    // interactive element that still dispatches one — preventDefault alone
    // only cancels the button's own default action, not propagation, so
    // an unrelated wrapper (a clickable row/card/backdrop) would otherwise
    // still fire.
    const user = userEvent.setup();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <Button label="Save" isLoading />
      </div>,
    );
    await user.click(screen.getByRole('button'));
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('does not let a click on a busy-only anchor Button reach a wrapping ancestor handler', async () => {
    const user = userEvent.setup();
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <Button label="Docs" href="https://example.com" isLoading />
      </div>,
    );
    await user.click(screen.getByRole('link'));
    expect(ancestorClick).not.toHaveBeenCalled();
  });

  it('suppresses activation keys but passes other keys while aria-disabled via isLoading', async () => {
    const user = userEvent.setup();
    const handleKeyDown = vi.fn();
    render(<Button label="Save" isLoading onKeyDown={handleKeyDown} />);
    const button = screen.getByRole('button');
    button.focus();
    await user.keyboard('{Enter}');
    expect(handleKeyDown).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });

  it('suppresses activation keys but passes other keys on a busy-only anchor Button', async () => {
    // The button-rendered path suppresses Enter/Space while aria-disabled;
    // the anchor-rendered path (href set, busy-only) shares the same
    // handleKeyDown but only wires onClick, so a consumer onKeyDown still
    // received Enter/Space on a busy link.
    const user = userEvent.setup();
    const handleKeyDown = vi.fn();
    render(
      <Button
        label="Docs"
        href="https://example.com"
        isLoading
        onKeyDown={handleKeyDown}
      />,
    );
    const link = screen.getByRole('link');
    link.focus();
    await user.keyboard('{Enter}');
    expect(handleKeyDown).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(handleKeyDown).toHaveBeenCalledTimes(1);
  });

  it('keeps native disabled (not aria-disabled) when isDisabled and not busy, even without a tooltip', () => {
    render(<Button label="Save" isDisabled />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('disabled');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('keeps native disabled when isDisabled and isLoading are both true (isDisabled wins)', () => {
    render(<Button label="Save" isDisabled isLoading />);
    const button = screen.getByRole('button');
    // "isDisabled behavior unchanged: that stays native disabled" — busy-only
    // aria-disabled is only for the case where busy is the SOLE reason the
    // button can't be clicked, not when it's also genuinely isDisabled.
    expect(button).toHaveAttribute('disabled');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('has a live region that announces loading state', () => {
    const {rerender} = render(<Button label="Submit" />);
    const button = screen.getByRole('button');
    const liveRegion = button.querySelector('[role="status"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent('');

    rerender(<Button label="Submit" isLoading />);
    expect(liveRegion).toHaveTextContent('Loading');
  });

  it('mounts the loading live region empty when first rendered loading, then fills it (spec:AST-086 FR3)', async () => {
    render(<Button label="Submit" isLoading />);
    const button = screen.getByRole('button');
    // The Spinner also has role="status", so grab the live region explicitly.
    const regions = button.querySelectorAll('[role="status"]');
    const liveRegion = regions[regions.length - 1];
    expect(liveRegion).toHaveTextContent('');
    await waitFor(() => expect(liveRegion).toHaveTextContent('Loading'));
  });

  it('localizes the loading announcement through the i18n catalog', async () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.button.loading': 'Chargement'}}}>
        <Button label="Submit" isLoading />
      </InternationalizationProvider>,
    );
    const button = screen.getByRole('button');
    // The Spinner also has role="status", so grab the live region explicitly.
    const regions = button.querySelectorAll('[role="status"]');
    const liveRegion = regions[regions.length - 1];
    await waitFor(() => expect(liveRegion).toHaveTextContent('Chargement'));
  });

  describe('in a narrow row', () => {
    // jsdom has no layout, so these assert the computed declarations that
    // produce the behavior. The real-browser widths are in the PR evidence.
    it('lets a labelled button shrink so its label truncates', () => {
      render(<Button label="A very long button label that should truncate" />);
      const style = getComputedStyle(screen.getByRole('button'));
      expect(style.minWidth).toBe('0');
      expect(style.maxWidth).toBe('100%');
      const label = screen.getByText(
        'A very long button label that should truncate',
      );
      expect(getComputedStyle(label).textOverflow).toBe('ellipsis');
      expect(getComputedStyle(label).overflow).toBe('hidden');
    });

    it('keeps the default flex-shrink so a row can shrink the button', () => {
      render(<Button label="Save" icon={<span>+</span>} />);
      const style = getComputedStyle(screen.getByRole('button'));
      // No opt-out: a labelled button (with or without an icon) shrinks.
      expect(style.flexShrink).not.toBe('0');
    });

    it('keeps an icon-only button square instead of shrinking it', () => {
      render(<Button label="Settings" icon={<span>⚙</span>} isIconOnly />);
      const style = getComputedStyle(screen.getByRole('button'));
      expect(style.flexShrink).toBe('0');
      expect(style.maxWidth).toBe('none');
      expect(style.aspectRatio).toBe('var(--button-icon-only-aspect)');
    });

    it('keeps IconButton square too, since it renders the icon-only mode', () => {
      render(<IconButton label="More actions" icon={<span>⋯</span>} />);
      const style = getComputedStyle(
        screen.getByRole('button', {name: 'More actions'}),
      );
      expect(style.flexShrink).toBe('0');
      expect(style.maxWidth).toBe('none');
    });

    it('caps an explicit width at the container instead of dropping it', () => {
      render(<Button label="Sign in" width={240} />);
      const button = screen.getByRole('button');
      expect(button.getAttribute('style')).toContain('240');
      expect(getComputedStyle(button).maxWidth).toBe('100%');
    });

    it('applies the same cap in link mode', () => {
      render(<Button label="Read the full release notes" href="#notes" />);
      const style = getComputedStyle(
        screen.getByRole('link', {name: 'Read the full release notes'}),
      );
      expect(style.minWidth).toBe('0');
      expect(style.maxWidth).toBe('100%');
    });

    it('shrinks inside a ButtonGroup like a standalone button', () => {
      render(
        <ButtonGroup label="Draft actions">
          <Button label="Save changes to draft" />
          <Button label="Discard" />
        </ButtonGroup>,
      );
      const style = getComputedStyle(
        screen.getByRole('button', {name: 'Save changes to draft'}),
      );
      expect(style.minWidth).toBe('0');
      expect(style.maxWidth).toBe('100%');
    });

    it('lets xstyle restore a rigid button', () => {
      render(<Button label="Cancel" xstyle={narrowRowProbe.rigid} />);
      const style = getComputedStyle(screen.getByRole('button'));
      expect(style.flexShrink).toBe('0');
      expect(style.minWidth).toBe('auto');
    });
  });

  describe('elevation', () => {
    it('reflects each elevation level as a theme attribute', () => {
      const attrFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <Button label="Save" elevation={elevation} />,
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

    it('renders a distinct class for each elevation level', () => {
      const classFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <Button label="Save" elevation={elevation} />,
        );
        return container.querySelector('button')!.className;
      };
      const classes = new Set([
        classFor('none'),
        classFor('low'),
        classFor('med'),
        classFor('high'),
      ]);
      expect(classes.size).toBe(4);
    });

    it('defaults to flat (elevation none)', () => {
      const {container} = render(<Button label="Save" />);
      const button = container.querySelector('button')!;
      expect(button).toHaveAttribute('data-elevation', 'none');
      const {container: none} = render(
        <Button label="Save" elevation="none" />,
      );
      expect(button.className).toBe(none.querySelector('button')!.className);
    });
  });

  it('exposes aria-busy on the link-rendered button while loading', () => {
    render(
      <Button
        label="Docs"
        href="https://example.com"
        isLoading
        isInterruptible
      />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-busy', 'true');
  });

  it('does not set aria-busy on the link-rendered button when not loading', () => {
    render(<Button label="Docs" href="https://example.com" />);
    const link = screen.getByRole('link');
    expect(link).not.toHaveAttribute('aria-busy');
  });

  it('stays an anchor while busy-only, not a disabled <button> fallback (#4871)', () => {
    // Non-interruptible busy is exactly the isBusyOnlyDisabled case: not
    // isDisabled, blocked only because a fire-once action is in flight.
    // Swapping the element to <button disabled> here would drop focus the
    // same way the native disabled attribute did (credit @AKnassa, #4879).
    render(<Button label="Docs" href="https://example.com" isLoading />);
    const link = screen.getByRole('link', {name: 'Docs'});
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('disabled');
  });

  it('keeps a busy-only anchor focusable and guards its navigation', () => {
    render(<Button label="Docs" href="https://example.com" isLoading />);
    const link = screen.getByRole('link', {name: 'Docs'});
    link.focus();
    expect(link).toHaveFocus();

    const event = createEvent.click(link);
    fireEvent(link, event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('falls back to <button disabled> for a truly disabled href Button', () => {
    render(<Button label="Docs" href="https://example.com" isDisabled />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const button = screen.getByRole('button', {name: 'Docs'});
    expect(button).toBeDisabled();
  });
});

describe('Button pressed state (touch)', () => {
  it('fades the touch press out over the release, painting the pressed token at its strength on both arms', () => {
    render(<Button label="Save" />);
    const button = screen.getByRole('button', {name: 'Save'});
    // The touch arms the controller writes: `on` paints the pressed token at
    // strength 1 on the first frame; `fading` keeps the paint and runs the
    // release animation on the machine's clock. A mouse keeps `:active`.
    expect(button).toHaveAttribute('data-astryx-pressable');
    expect(hasPressedArm(button)).toBe(true);
    expect(readsPressStrength(button, '[data-astryx-press="on"]')).toBe(true);
    expect(readsPressStrength(button)).toBe(true);
    expect(hasReleaseFade(button)).toBe(true);
  });
});
