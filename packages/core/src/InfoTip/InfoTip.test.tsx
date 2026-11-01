// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InfoTip.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event,
 *   InfoTip, InternationalizationProvider, the shared hit area (mocked)
 * @output Unit tests for InfoTip's named button, its press toggle over
 *   Tooltip, its props, and its touch hit area
 * @position Testing; validates InfoTip.tsx (component:InfoTip FR1–FR3, AR1)
 *
 * SYNC: When InfoTip.tsx changes, update tests to match new behavior
 */

import {createRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {describe, it, expect, vi, beforeAll, afterAll} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {InternationalizationProvider} from '../i18n';
import type * as HitAreaModule from '../utils/hitArea';
import type {HitInsets} from '../utils/hitArea';
import {InfoTip} from './InfoTip';

// The shared hit area measures neighbours on a coarse pointer in a real
// layout; here it reports what it was asked to watch, and each test answers
// for it.
const hitAreaWatches = vi.hoisted(
  () => [] as {element: Element; onInsets: (insets: HitInsets) => void}[],
);
vi.mock('../utils/hitArea', async importOriginal => ({
  ...(await importOriginal<typeof HitAreaModule>()),
  watchHitArea: (element: Element, onInsets: (insets: HitInsets) => void) => {
    const watch = {element, onInsets};
    hitAreaWatches.push(watch);
    return () => {
      hitAreaWatches.splice(hitAreaWatches.indexOf(watch), 1);
    };
  },
}));

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

const overrides = stylex.create({
  spaced: {marginInlineStart: 12},
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
    const trigger = screen.getByRole('button', {name: 'More information'});
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
  });

  it('takes its default name from the translation catalog (FR1)', () => {
    render(
      <InternationalizationProvider
        locale="en"
        overrides={{en: {'@astryx.infoTip.label': 'Learn more'}}}>
        <InfoTip content="Helpful context" />
      </InternationalizationProvider>,
    );
    expect(screen.getByRole('button', {name: 'Learn more'})).toBeVisible();
  });

  it('takes no open-state, placement, or trigger props (FR3)', () => {
    render(
      <InfoTip
        content="Helpful context"
        // @ts-expect-error InfoTip has no placement: Tooltip places the help.
        placement="below"
      />,
    );
    render(
      <InfoTip
        content="Helpful context"
        // @ts-expect-error InfoTip has no open state: Tooltip owns it.
        isOpen
      />,
    );
    render(
      <InfoTip
        content="Helpful context"
        // @ts-expect-error InfoTip always pins on a press.
        pressTrigger="none"
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
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
  it('forwards its ref to the button (FR3)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<InfoTip content="Helpful context" ref={ref} />);
    expect(ref.current).toBe(
      screen.getByRole('button', {name: 'More information'}),
    );
  });

  it('puts xstyle, className, and style on the button (FR3)', () => {
    render(
      <InfoTip
        content="Helpful context"
        xstyle={overrides.spaced}
        className="caller-class"
        style={{marginBlockStart: 4}}
      />,
    );
    const trigger = screen.getByRole('button', {name: 'More information'});
    for (const token of (stylex.props(overrides.spaced).className ?? '').split(
      ' ',
    )) {
      expect(trigger).toHaveClass(token);
    }
    expect(trigger).toHaveClass('caller-class');
    expect(trigger.style.marginBlockStart).toBe('4px');
  });

  describe('a press pins the help (FR2, Tooltip FR9 and FR10)', () => {
    it('reports the pin on the button: aria-expanded and aria-controls', async () => {
      render(<InfoTip content="Helpful context" />);
      const trigger = screen.getByRole('button', {name: 'More information'});
      const layer = screen.getByRole('tooltip', {hidden: true});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(trigger);

      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(trigger).toHaveAttribute('aria-controls', layer.id);
    });

    it('stays pinned when the pointer leaves, and a second click closes it', async () => {
      render(<InfoTip content="Helpful context" />);
      const trigger = screen.getByRole('button', {name: 'More information'});
      const layer = screen.getByRole('tooltip', {hidden: true});

      fireEvent.mouseEnter(trigger);
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });
      fireEvent.mouseLeave(trigger);
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
      });
      expect(popoverOpenState.get(layer)).toBe(true);

      fireEvent.click(trigger);
      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(false);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it.each(['Enter', ' '])('pins on %j from the keyboard', async key => {
      const user = userEvent.setup();
      render(<InfoTip content="Helpful context" />);
      const trigger = screen.getByRole('button', {name: 'More information'});
      await user.tab();
      expect(trigger).toHaveFocus();

      await user.keyboard(key === ' ' ? '[Space]' : '[Enter]');

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });
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

    it('pins on a tap, though the trigger is a button', async () => {
      render(<InfoTip content="30-day rolling average." />);
      const trigger = screen.getByRole('button');
      const layer = screen.getByRole('tooltip', {hidden: true});

      // Revealing the help is the button's whole purpose, so a tap pins it
      // (`pressTrigger="toggle"`). Without that its content is unreachable on
      // a phone.
      tap(trigger);

      await waitFor(() => {
        expect(popoverOpenState.get(layer)).toBe(true);
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
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

  describe('touch hit area (AR1)', () => {
    it('grows the button toward 44 px as far as the shared hit area allows', () => {
      const {unmount} = render(<InfoTip content="Helpful context" />);
      const trigger = screen.getByRole('button', {name: 'More information'});
      const watch = hitAreaWatches.find(entry => entry.element === trigger);
      expect(watch).toBeDefined();

      act(() => watch?.onInsets({top: 12, right: 6, bottom: 12, left: 4}));
      expect(trigger.style.getPropertyValue('--astryx-hit-inset-top')).toBe(
        '12px',
      );
      expect(trigger.style.getPropertyValue('--astryx-hit-inset-left')).toBe(
        '4px',
      );

      unmount();
      expect(hitAreaWatches.some(entry => entry.element === trigger)).toBe(
        false,
      );
    });
  });
});
