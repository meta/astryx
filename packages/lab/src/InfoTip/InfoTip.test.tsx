// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTip.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event, InfoTip component
 * @output Unit tests for InfoTip trigger accessibility and tooltip behavior
 * @position Testing; validates InfoTip.tsx implementation
 *
 * SYNC: When InfoTip.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {InfoTip} from './InfoTip';

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom, and :focus-visible for keyboard-focus tests
// (same harness as core Tooltip.test.tsx, plus :focus-visible)
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });

  // Intercept :popover-open and :focus-visible, delegate everything else
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    if (selector === ':focus-visible') {
      // Treat any focused element as keyboard-focused in tests
      return this === document.activeElement;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

/** Focus the trigger the way a keyboard user would land on it. */
function focusTrigger(trigger: HTMLElement) {
  act(() => {
    trigger.focus();
  });
  fireEvent.focusIn(trigger);
}

describe('InfoTip', () => {
  it('renders a button trigger with the default accessible name', () => {
    render(<InfoTip content="Helpful context" />);
    expect(
      screen.getByRole('button', {name: 'More information'}),
    ).toBeInTheDocument();
  });

  it('uses a custom label as the accessible name', () => {
    render(
      <InfoTip content="30-day rolling average." label="About this metric" />,
    );
    const trigger = screen.getByRole('button', {name: 'About this metric'});
    expect(trigger).toHaveAttribute('aria-label', 'About this metric');
  });

  it('links the trigger to the tooltip layer via aria-describedby', () => {
    render(<InfoTip content="Helpful context" />);
    const layer = screen.getByRole('tooltip', {hidden: true});
    expect(layer).toHaveTextContent('Helpful context');
    const trigger = screen.getByRole('button', {name: 'More information'});
    expect(trigger.getAttribute('aria-describedby')).toBe(layer.id);
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<InfoTip content="Helpful context" />);
    const trigger = screen.getByRole('button', {name: 'More information'});
    await user.tab();
    expect(trigger).toHaveFocus();
  });

  it('shows the tooltip on hover', async () => {
    vi.mocked(HTMLElement.prototype.showPopover).mockClear();
    render(<InfoTip content="Helpful context" />);
    const trigger = screen.getByRole('button', {name: 'More information'});

    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    });
  });

  it('shows the tooltip on keyboard focus', async () => {
    vi.mocked(HTMLElement.prototype.showPopover).mockClear();
    render(<InfoTip content="Helpful context" />);
    const trigger = screen.getByRole('button', {name: 'More information'});

    focusTrigger(trigger);

    await waitFor(() => {
      expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    });
    const layer = screen.getByRole('tooltip', {hidden: true});
    expect(popoverOpenState.get(layer)).toBe(true);
  });

  it('closes the tooltip on Escape', async () => {
    render(<InfoTip content="Helpful context" />);
    const trigger = screen.getByRole('button', {name: 'More information'});
    const layer = screen.getByRole('tooltip', {hidden: true});

    focusTrigger(trigger);
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(true);
    });

    fireEvent.keyDown(trigger, {key: 'Escape'});

    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(false);
    });
  });

  it('re-opens after Escape once the trigger is left and re-hovered', async () => {
    render(<InfoTip content="Helpful context" />);
    const trigger = screen.getByRole('button', {name: 'More information'});
    const layer = screen.getByRole('tooltip', {hidden: true});

    focusTrigger(trigger);
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(true);
    });

    fireEvent.keyDown(trigger, {key: 'Escape'});
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(false);
    });

    // Leave (resets dismissal), then re-enter
    act(() => {
      trigger.blur();
    });
    fireEvent.focusOut(trigger);
    fireEvent.mouseLeave(trigger);

    fireEvent.mouseEnter(trigger);
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(true);
    });
  });

  it('renders ReactNode tooltip content', () => {
    render(<InfoTip content={<span data-testid="rich-content">Rich</span>} />);
    expect(screen.getByTestId('rich-content')).toBeInTheDocument();
  });
  describe('touch', () => {
    /**
     * A tap, in the order a browser dispatches it: the finger's pointer events,
     * the hover it synthesizes, then the `click` that says the touch was a tap.
     */
    const tap = (element: HTMLElement) => {
      fireEvent.pointerEnter(element, {pointerType: 'touch'});
      fireEvent.pointerDown(element, {pointerType: 'touch'});
      fireEvent.pointerUp(element, {pointerType: 'touch'});
      fireEvent.mouseEnter(element);
      fireEvent.click(element);
    };

    it('opens on a tap, though the trigger is a button', async () => {
      render(<InfoTip content="30-day rolling average." />);
      const trigger = screen.getByRole('button');
      const layer = screen.getByRole('tooltip', {hidden: true});

      // Tooltip's `auto` rule would give this tap to the button and suppress
      // the tooltip; revealing it is the button's whole purpose, so InfoTip
      // opts in. Without this its content is unreachable on a phone.
      tap(trigger);

      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });
    });

    it('closes on a second tap of the trigger', async () => {
      render(<InfoTip content="30-day rolling average." />);
      const trigger = screen.getByRole('button');
      const layer = screen.getByRole('tooltip', {hidden: true});

      tap(trigger);
      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });

      tap(trigger);
      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(false);
      });
    });

    it('closes on a tap outside', async () => {
      render(
        <>
          <InfoTip content="30-day rolling average." />
          <button type="button">Elsewhere</button>
        </>,
      );
      const trigger = screen.getByRole('button', {name: 'More information'});
      const layer = screen.getByRole('tooltip', {hidden: true});

      tap(trigger);
      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });

      // The tap outside counts when the finger lifts.
      const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
      fireEvent.pointerDown(elsewhere, {pointerType: 'touch'});
      fireEvent.pointerUp(elsewhere, {pointerType: 'touch'});

      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(false);
      });
    });
  });
});
