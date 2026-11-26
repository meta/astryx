// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.test.tsx
 * @input Uses vitest, @testing-library/react, Tooltip component
 * @output Unit tests for Tooltip component behavior
 * @position Testing; validates Tooltip.tsx implementation
 *
 * SYNC: When Tooltip.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterAll,
} from 'vitest';
import {
  act,
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import {Suspense, startTransition, use, useRef} from 'react';
import {Tooltip} from './Tooltip';
import {ClickableCard} from '../ClickableCard/ClickableCard';
import {Item} from '../Item/Item';
import {Token} from '../Token/Token';
import {useTooltip} from './useTooltip';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import userEvent from '@testing-library/user-event';
import {IconButton} from '../IconButton/IconButton';
import {Toolbar} from '../Toolbar/Toolbar';
import {TestIcon} from '../__tests__/TestIcon';
import {getTooltip} from '../__tests__/tooltipDescription';

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });

  // Only intercept :popover-open, delegate everything else to original
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = originalMatches;
});

describe('useTooltip identity', () => {
  it('keeps callback refs stable across unchanged rerenders', () => {
    const {result, rerender} = renderHook(() => useTooltip());
    const firstRef = result.current.ref;
    const firstInteractionRef = result.current.interactionRef;

    rerender();

    expect(result.current.ref).toBe(firstRef);
    expect(result.current.interactionRef).toBe(firstInteractionRef);
  });
});

describe('Tooltip', () => {
  it('renders trigger element', () => {
    render(
      <Tooltip content="Tooltip text">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', {name: 'Trigger'})).toBeInTheDocument();
  });

  it('renders the content prop inside the tooltip layer', () => {
    render(
      <Tooltip content="Tooltip text">
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(getTooltip()).toHaveTextContent('Tooltip text');
  });

  it('calls onOpenChange(true) when shown via hover', async () => {
    const onOpenChange = vi.fn();
    render(
      <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );

    const trigger = screen.getByRole('button', {name: 'Trigger'});
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerMove(trigger);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('content taller than the room above and below (spec:AST-059 FR4)', () => {
    it('carries its one combined fallback list from the start, so it never settles over its trigger', async () => {
      render(
        <Tooltip content="Tall tooltip" isDefaultOpen placement="below">
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const tooltip = await waitFor(() => {
        const el = document.querySelector('[role="tooltip"]') as HTMLElement;
        expect(el).not.toBeNull();
        return el;
      });
      expect(tooltip.style.positionTryFallbacks).toBe(
        'flip-block, --astryx-layer-beside-end, --astryx-layer-beside-start, --astryx-layer-fit-below, --astryx-layer-fit-above',
      );
    });
  });

  describe('isDefaultOpen', () => {
    it('shows tooltip on mount when isDefaultOpen is true', async () => {
      render(
        <Tooltip content="Default open tooltip" isDefaultOpen>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      // showPopover should be called on mount
      await waitFor(() => {
        expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
      });
    });

    it('calls onOpenChange(true) on mount when isDefaultOpen is true', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Default open tooltip"
          isDefaultOpen
          onOpenChange={onOpenChange}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('does not show tooltip on mount when isDefaultOpen is false', async () => {
      vi.mocked(HTMLElement.prototype.showPopover).mockClear();
      render(
        <Tooltip content="Not default open">
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      // Give it time to potentially fire
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
    });

    it('tooltip is still dismissible after isDefaultOpen', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Dismissible tooltip"
          isDefaultOpen
          onOpenChange={onOpenChange}
          hideDelay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      // Wait for it to show
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      // Mouse leave should hide it
      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseLeave(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('icon-only trigger', () => {
    // A rendered icon is an SVGElement, and ShowPopoverOptions.source is
    // declared as an HTMLElement. Handing the icon to showPopover throws
    // during dictionary conversion, before the popover opens, so the hint
    // never appeared. (#7226)
    it('opens an icon trigger without passing an SVGElement as the source', async () => {
      const showSpy = vi.mocked(HTMLElement.prototype.showPopover);
      showSpy.mockClear();

      render(
        <Tooltip content="Shared memory" isDefaultOpen>
          <svg data-testid="icon" aria-hidden="true" />
        </Tooltip>,
      );

      await waitFor(() => {
        expect(showSpy).toHaveBeenCalled();
      });

      const [options] = showSpy.mock.calls[0];
      // Compared as a boolean on purpose: a plain `toBeUndefined` failure makes
      // the diff printer walk the SVGElement, which it cannot inspect.
      expect(options?.source === undefined).toBe(true);

      // The icon is still the trigger the ARIA tooltip pattern is wired to.
      expect(screen.getByTestId('icon').getAttribute('aria-describedby')).toBe(
        `${screen.getByRole('tooltip', {hidden: true}).id}-description`,
      );
    });
  });

  describe("a tooltip that repeats its trigger's name", () => {
    it("adds no description when its text equals the trigger's aria-label", () => {
      render(
        <Tooltip content="Delete">
          <IconButton label="Delete" icon={<TestIcon />} />
        </Tooltip>,
      );
      expect(screen.getByRole('button', {name: 'Delete'})).not.toHaveAttribute(
        'aria-describedby',
      );
    });

    it('still describes the trigger when its text differs from the name', () => {
      render(
        <Tooltip content="Delete the file for good">
          <IconButton label="Delete" icon={<TestIcon />} />
        </Tooltip>,
      );
      expect(
        screen.getByRole('button', {name: 'Delete'}),
      ).toHaveAccessibleDescription('Delete the file for good');
    });

    it('adds and removes the description as the text stops and starts repeating the name', () => {
      const {rerender} = render(
        <Tooltip content="Delete the file for good">
          <IconButton label="Delete" icon={<TestIcon />} />
        </Tooltip>,
      );
      const button = () => screen.getByRole('button', {name: 'Delete'});
      expect(button()).toHaveAccessibleDescription('Delete the file for good');
      rerender(
        <Tooltip content="Delete">
          <IconButton label="Delete" icon={<TestIcon />} />
        </Tooltip>,
      );
      expect(button()).not.toHaveAttribute('aria-describedby');
      rerender(
        <Tooltip content="Delete it">
          <IconButton label="Delete" icon={<TestIcon />} />
        </Tooltip>,
      );
      expect(button()).toHaveAccessibleDescription('Delete it');
    });

    it('adds no description to an anchorRef trigger whose text is the tooltip text', () => {
      function Anchored() {
        const anchorRef = useRef<HTMLButtonElement>(null);
        return (
          <>
            <button ref={anchorRef} type="button" aria-describedby="hint">
              Archive
            </button>
            <span id="hint">Moves it out of the inbox</span>
            <Tooltip anchorRef={anchorRef} content=" Archive " />
          </>
        );
      }
      render(<Anchored />);
      // The trigger's own description stays; the tooltip adds none.
      expect(screen.getByRole('button', {name: 'Archive'})).toHaveAttribute(
        'aria-describedby',
        'hint',
      );
    });

    it('still describes a trigger named by aria-labelledby, as Button does', () => {
      render(
        <>
          <span id="save-name">Save</span>
          <Tooltip content="Save">
            <IconButton
              label="Save"
              aria-labelledby="save-name"
              icon={<TestIcon />}
            />
          </Tooltip>
        </>,
      );
      expect(
        screen.getByRole('button', {name: 'Save'}),
      ).toHaveAccessibleDescription('Save');
    });
  });

  describe('invoker', () => {
    // A popover takes its invoker's place in the focus order. A tooltip has
    // nothing to focus, and a popover its trigger opens needs that place.
    it('shows an HTML trigger tooltip with no invoker source', async () => {
      const showSpy = vi.mocked(HTMLElement.prototype.showPopover);
      showSpy.mockClear();

      render(
        <Tooltip content="Save the file" isDefaultOpen>
          <button type="button">Save</button>
        </Tooltip>,
      );

      await waitFor(() => {
        expect(showSpy).toHaveBeenCalled();
      });

      const [options] = showSpy.mock.calls[0];
      expect(options?.source).toBeUndefined();
    });
  });

  describe('WCAG 1.4.13 — content on hover or focus', () => {
    it('dismisses on Escape while visible (dismissible)', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Dismiss me" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      fireEvent.keyDown(document, {key: 'Escape'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('ignores Escape during IME composition', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Stay" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      fireEvent.keyDown(document, {key: 'Escape', isComposing: true});
      // Give any (incorrect) async hide a chance to run.
      await new Promise(r => setTimeout(r, 20));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('stays open when the pointer moves onto the tooltip surface (hoverable)', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Hover me" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      // Pointer leaves the trigger but enters the tooltip surface before the
      // hover-bridge grace period elapses — the tooltip must not hide.
      fireEvent.mouseLeave(trigger);
      const layer = screen.getByRole('tooltip', {hidden: true});
      fireEvent.mouseEnter(layer);
      fireEvent.pointerMove(layer);

      await new Promise(r => setTimeout(r, 150));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('press-to-dismiss', () => {
    it('hides the tooltip when the trigger is pressed', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Copy link" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      fireEvent.pointerDown(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('does not press-dismiss a controlled tooltip', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Controlled"
          isOpen
          onOpenChange={onOpenChange}
          delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Trigger'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      fireEvent.pointerDown(trigger);
      // Give any (incorrect) async hide a chance to run.
      await new Promise(r => setTimeout(r, 20));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });
  });

  describe('controlled', () => {
    /** Whether the tooltip's layer is open. */
    const isShown = () =>
      screen
        .queryByRole('tooltip', {hidden: true})
        ?.closest<HTMLElement>('[popover]')
        ?.matches(':popover-open') ?? false;

    it('reports keyboard-focus intent once while held closed, and shows nothing', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Held"
          isOpen={false}
          onOpenChange={onOpenChange}
          delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', {name: 'Trigger'});
      const realMatches = trigger.matches.bind(trigger);
      vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
        selector === ':focus-visible' ? true : realMatches(selector),
      );
      fireEvent.keyDown(document, {key: 'Tab'});
      fireEvent.focusIn(trigger);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
      await new Promise(r => setTimeout(r, 20));
      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(isShown()).toBe(false);
    });

    it('reports Escape as onOpenChange(false) while held open, and stays shown', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Held" isOpen onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      await waitFor(() => expect(isShown()).toBe(true));
      onOpenChange.mockClear();
      fireEvent.keyDown(document, {key: 'Escape'});
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(isShown()).toBe(true);
    });

    // Escape asks a controlled tooltip to close by calling this same handler,
    // so a consumer who complies sees the request and then this echo. Pinning
    // the echo here keeps the two straight.
    it('echoes the close through onOpenChange when the consumer flips isOpen', async () => {
      const onOpenChange = vi.fn();
      const {rerender} = render(
        <Tooltip content="Pinned" isOpen onOpenChange={onOpenChange} delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();

      rerender(
        <Tooltip
          content="Pinned"
          isOpen={false}
          onOpenChange={onOpenChange}
          delay={0}>
          <button type="button">Trigger</button>
        </Tooltip>,
      );

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
  describe('touch', () => {
    // The modality is document-global; a tap in one case must not decide the
    // next one's answer.
    beforeEach(() => {
      __resetInteractionModalityForTest();
    });

    /**
     * A tap, in the order a browser dispatches it: the finger's pointer events,
     * then the hover it synthesizes, then the `click` that says the touch was a
     * tap and not the start of a scroll.
     */
    const tap = (element: HTMLElement) => {
      // A finger's arrival fires pointerenter too, and that is the path a pen
      // must not take — cover it here rather than starting at pointerdown.
      fireEvent.pointerEnter(element, {pointerType: 'touch'});
      fireEvent.pointerDown(element, {pointerType: 'touch'});
      fireEvent.pointerUp(element, {pointerType: 'touch'});
      // Touch synthesizes hover after the press; the tooltip must not act on it.
      fireEvent.mouseEnter(element);
      fireEvent.click(element);
    };

    /** A tap outside: what a finger landing and lifting elsewhere dispatches. */
    const tapOutside = (element: HTMLElement) => {
      fireEvent.pointerDown(element, {pointerType: 'touch'});
      fireEvent.pointerUp(element, {pointerType: 'touch'});
      fireEvent.click(element);
    };

    it('opens on a tap after React discards a render that controls it', async () => {
      // A transition that suspends for good: React renders it, then keeps the
      // committed tree and never commits that render.
      const forever = new Promise<never>(() => {});
      function Forever(): null {
        use(forever);
        return null;
      }
      const onOpenChange = vi.fn();
      const tooltip = (isPending: boolean) => (
        <Suspense fallback={null}>
          <Tooltip
            content="Tooltip text"
            onOpenChange={onOpenChange}
            delay={200}
            isOpen={isPending ? false : undefined}>
            Abbreviation
          </Tooltip>
          {isPending ? <Forever /> : null}
        </Suspense>
      );
      const {rerender} = render(tooltip(false));
      await act(async () => {
        startTransition(() => {
          rerender(tooltip(true));
        });
      });

      tap(screen.getByText('Abbreviation'));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('opens on a tap when the trigger performs no action', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={200}>
          Abbreviation
        </Tooltip>,
      );

      tap(screen.getByText('Abbreviation'));

      // Immediately: a tap is a decision, not hover intent, so no delay applies.
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('a tap on a text-entry control inside the trigger focuses it and does not open or close the tooltip', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Tooltip text"
          onOpenChange={onOpenChange}
          touchTrigger="tap"
          delay={0}>
          <span>
            Name <input aria-label="Name" />
          </span>
        </Tooltip>,
      );
      const field = screen.getByRole('textbox', {name: 'Name'});
      tap(field);
      act(() => field.focus());
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(field).toHaveFocus();

      tap(screen.getByText(/Name/, {selector: 'span'}));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      onOpenChange.mockClear();
      tap(field);
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('stays shut on a tap when the trigger performs an action', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Save</button>
        </Tooltip>,
      );

      tap(screen.getByRole('button', {name: 'Save'}));

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });

    it('opens on a tap of an action trigger when touchTrigger is "tap"', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="What this metric means"
          onOpenChange={onOpenChange}
          touchTrigger="tap"
          delay={0}>
          <button type="button">Info</button>
        </Tooltip>,
      );

      tap(screen.getByRole('button', {name: 'Info'}));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('never opens on a tap when touchTrigger is "none"', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="Tooltip text"
          onOpenChange={onOpenChange}
          touchTrigger="none"
          delay={0}>
          Abbreviation
        </Tooltip>,
      );

      tap(screen.getByText('Abbreviation'));

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });

    it('closes on a second tap of the trigger', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      tap(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      tap(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('closes on a tap outside — the dismissal a tap-open owes the user', async () => {
      const onOpenChange = vi.fn();
      render(
        <>
          <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
            Abbreviation
          </Tooltip>
          <button type="button">Elsewhere</button>
        </>,
      );

      tap(screen.getByText('Abbreviation'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      tapOutside(screen.getByRole('button', {name: 'Elsewhere'}));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('opens when the finger lifts, not when it lands', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      fireEvent.pointerEnter(trigger, {pointerType: 'touch'});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      // The finger is still down: it may be starting a scroll.
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();

      fireEvent.pointerUp(trigger, {pointerType: 'touch'});
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('stays open when a pen that lands and stays down past the hover delay lifts', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      // A pen in range hovers like a mouse: its arrival starts the hover show.
      fireEvent.pointerEnter(trigger, {pointerType: 'pen'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerDown(trigger, {pointerType: 'pen'});
      // The pen stays down past the hover delay, then lifts.
      await new Promise(resolve => setTimeout(resolve, 50));
      fireEvent.pointerUp(trigger, {pointerType: 'pen'});
      fireEvent.click(trigger);
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
    });

    it('still opens on a mouse hover after its delay, and a mouse press still closes it', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={20}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      expect(onOpenChange).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
      fireEvent.pointerDown(trigger, {pointerType: 'mouse'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenLastCalledWith(false);
      });
    });

    it('never opens for a touch that turns into a scroll', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      fireEvent.pointerEnter(trigger, {pointerType: 'touch'});
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      // The browser takes the touch for the page scroll: no tap follows.
      fireEvent.pointerCancel(trigger, {pointerType: 'touch'});

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('never opens for a press the browser did not count as a tap', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      // A long press: the finger lifts, but the browser fires no click
      // (it selected text or showed its own menu instead).
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      fireEvent.pointerUp(trigger, {pointerType: 'touch'});

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does not take a later keyboard click for the tap of an earlier press', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip
          content="What this metric means"
          onOpenChange={onOpenChange}
          touchTrigger="tap"
          delay={0}>
          <button type="button">Info</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Info'});
      // A press that never became a tap ...
      fireEvent.pointerDown(trigger, {pointerType: 'touch'});
      fireEvent.pointerUp(trigger, {pointerType: 'touch'});
      // ... then Enter on the focused button, which fires its own click.
      fireEvent.keyDown(trigger, {key: 'Enter'});
      fireEvent.click(trigger);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });

    it('closes on a tap outside when the finger lifts, not when it lands', async () => {
      const onOpenChange = vi.fn();
      render(
        <>
          <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
            Abbreviation
          </Tooltip>
          <button type="button">Elsewhere</button>
        </>,
      );

      tap(screen.getByText('Abbreviation'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      const elsewhere = screen.getByRole('button', {name: 'Elsewhere'});
      fireEvent.pointerDown(elsewhere, {pointerType: 'touch'});
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(false);

      fireEvent.pointerUp(elsewhere, {pointerType: 'touch'});
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('closes when a scroll starts outside', async () => {
      const onOpenChange = vi.fn();
      render(
        <>
          <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
            Abbreviation
          </Tooltip>
          <p>Page content</p>
        </>,
      );

      tap(screen.getByText('Abbreviation'));
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });

      const page = screen.getByText('Page content');
      fireEvent.pointerDown(page, {pointerType: 'touch'});
      fireEvent.pointerCancel(page, {pointerType: 'touch'});

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('still opens on a real mouse hover after a tap', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Save</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Save'});
      tap(trigger);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);

      // A hybrid device: the same trigger, now under a mouse.
      fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('opens on a hovering pen, which is a hover and not a tap', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Save</button>
        </Tooltip>,
      );

      const trigger = screen.getByRole('button', {name: 'Save'});
      // A stylus in detection range: pointerenter with nothing in contact, on
      // a device where `(hover: hover)` matches. Reading that as touch would
      // bail out of the hover path and leave the user no tooltip at all.
      fireEvent.pointerEnter(trigger, {pointerType: 'pen', buttons: 0});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('tap-opens when a pen lands on an inert trigger', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={200}>
          Abbreviation
        </Tooltip>,
      );

      const trigger = screen.getByText('Abbreviation');
      // Hovering first, as a real pen does — then contact, which is a tap.
      fireEvent.pointerEnter(trigger, {pointerType: 'pen', buttons: 0});
      fireEvent.pointerDown(trigger, {pointerType: 'pen'});
      fireEvent.pointerUp(trigger, {pointerType: 'pen'});
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    it('does not reopen from the focus a tapped text field takes', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          <input type="text" aria-label="Amount" />
        </Tooltip>,
      );

      const trigger = screen.getByLabelText('Amount');
      // A tapped text field matches `:focus-visible` in a real browser —
      // deliberately, per Selectors 4, so typing has a visible home. jsdom
      // does not model that, so stand it up here; without it this case cannot
      // fail, whatever the focus path does.
      const realMatches = trigger.matches.bind(trigger);
      vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
        selector === ':focus-visible' ? true : realMatches(selector),
      );

      // An `<input>` is an action trigger, so `auto` gives it the tap — and
      // the focus it takes must not put the tooltip back over the field the
      // user is about to type into.
      tap(trigger);
      fireEvent.focusIn(trigger);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    });

    it('still opens on keyboard focus of a trigger a finger touched', async () => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Tooltip text" onOpenChange={onOpenChange} delay={0}>
          <input type="text" aria-label="Amount" />
        </Tooltip>,
      );

      const trigger = screen.getByLabelText('Amount');
      const realMatches = trigger.matches.bind(trigger);
      vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
        selector === ':focus-visible' ? true : realMatches(selector),
      );

      tap(trigger);
      // Reaching for the keyboard ends the touch interaction; the guard is on
      // the gesture in flight, not on the device the trigger last saw.
      fireEvent.keyDown(document, {key: 'Tab'});
      fireEvent.focusIn(trigger);

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });

    describe('focus a dialog returns after a tap', () => {
      /**
       * Tap the trigger, type into a field elsewhere, then hand focus back to
       * the trigger the way a closing dialog does. The returned focus matches
       * `:focus-visible` after typing in a real browser; jsdom does not model
       * that, so stand it up here.
       */
      const tapTypeAndReturn = async (keys: string[]) => {
        const onOpenChange = vi.fn();
        render(
          <>
            <Tooltip
              content="Rename this file"
              onOpenChange={onOpenChange}
              delay={0}>
              <button type="button">Rename</button>
            </Tooltip>
            <input type="text" aria-label="File name" />
          </>,
        );
        const trigger = screen.getByRole('button', {name: 'Rename'});
        const field = screen.getByLabelText('File name');
        const realMatches = trigger.matches.bind(trigger);
        vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
          selector === ':focus-visible' ? true : realMatches(selector),
        );

        tap(trigger);
        tapOutside(field);
        for (const key of keys) {
          fireEvent.keyDown(field, {key});
        }
        fireEvent.focusIn(trigger);
        await new Promise(resolve => setTimeout(resolve, 50));
        return onOpenChange;
      };

      it.each([
        ['typed characters', ['-', 'v', '2']],
        ['an edit and the Go key', ['Backspace', 'Enter']],
        ['keys an on-screen keyboard leaves unidentified', ['Unidentified']],
      ])('stays shut after %s', async (_, keys) => {
        const onOpenChange = await tapTypeAndReturn(keys);
        expect(onOpenChange).not.toHaveBeenCalledWith(true);
      });

      it.each([
        ['Escape', ['-', 'Escape']],
        ['Tab', ['-', 'Tab']],
        ['an arrow key', ['-', 'ArrowLeft']],
      ])('opens after %s, which is keyboard navigation', async (_, keys) => {
        const onOpenChange = await tapTypeAndReturn(keys);
        expect(onOpenChange).toHaveBeenCalledWith(true);
      });
    });
  });
});

/** A tooltip that a new `generation` mounts afresh. */
function SaveField({generation}: {generation: number}) {
  return (
    <Tooltip key={generation} content="Save changes" delay={0}>
      <button type="button">Save</button>
    </Tooltip>
  );
}

describe('Tooltip layer mounts at its first show', () => {
  // A tooltip's layer is not in the page until the tooltip first opens, so a
  // table with a tooltip on every row mounts no closed layers.
  const layers = () =>
    Array.from(document.querySelectorAll('[data-layer-anchored]'));

  function describedBy(trigger: HTMLElement) {
    const id = trigger.getAttribute('aria-describedby');
    return id == null ? null : document.getElementById(id);
  }

  it('mounts no layer for a hundred closed tooltips, and each trigger names its hidden description', () => {
    render(
      <>
        {Array.from({length: 100}, (_, index) => (
          <Tooltip key={index} content={`Row ${index}`}>
            <button type="button">{`Action ${index}`}</button>
          </Tooltip>
        ))}
      </>,
    );
    expect(layers()).toHaveLength(0);
    const trigger = screen.getByRole('button', {name: 'Action 42'});
    const description = describedBy(trigger);
    expect(description).toHaveTextContent('Row 42');
    // A hidden sibling after the trigger, not inside it.
    expect(description).toHaveAttribute('hidden');
    expect(trigger).not.toContainElement(description);
    expect(trigger).toHaveAccessibleDescription('Row 42');
    // One tooltip per trigger: the hidden copy is not a tooltip.
    expect(screen.queryAllByRole('tooltip', {hidden: true})).toHaveLength(0);
  });

  it('describes the trigger with the text of content a component renders', () => {
    function Reactions() {
      return <span>Ada and Grace reacted</span>;
    }
    render(
      <Tooltip content={<Reactions />}>
        <button type="button">Thanks</button>
      </Tooltip>,
    );
    expect(
      screen.getByRole('button', {name: 'Thanks'}),
    ).toHaveAccessibleDescription('Ada and Grace reacted');
    expect(layers()).toHaveLength(0);
  });

  it('mounts the layer at the first hover, after the delay, and never shows two tooltips', () => {
    vi.useFakeTimers();
    try {
      render(
        <Tooltip content="Save changes" delay={200}>
          <button type="button">Save</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', {name: 'Save'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(layers()).toHaveLength(0);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      const tooltips = screen.getAllByRole('tooltip', {hidden: true});
      expect(tooltips).toHaveLength(1);
      expect(tooltips[0]).toHaveTextContent('Save changes');
      expect(popoverOpenState.get(tooltips[0])).toBe(true);
      // The mounted layer's content is now the description, and the hidden
      // copy is gone, so the text renders once and reads once.
      expect(describedBy(trigger)).toBe(tooltips[0].firstElementChild);
      expect(tooltips[0].firstElementChild).not.toHaveAttribute('aria-hidden');
      expect(document.querySelector('span[hidden][id$="-description"]')).toBe(
        null,
      );
      expect(trigger).toHaveAccessibleDescription('Save changes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('describes the trigger, before the first show, with the content read as it renders', () => {
    render(
      <>
        <Tooltip
          content={
            <>
              un<b>like</b>ly
            </>
          }>
          <button type="button">Odds</button>
        </Tooltip>
        <Tooltip
          content={
            <>
              <strong>March 1</strong>.
            </>
          }>
          <button type="button">Due</button>
        </Tooltip>
      </>,
    );
    expect(
      screen.getByRole('button', {name: 'Odds'}),
    ).toHaveAccessibleDescription('unlikely');
    expect(
      screen.getByRole('button', {name: 'Due'}),
    ).toHaveAccessibleDescription('March 1.');
  });

  it('renders the text once before the first show, while shown, after it hides, and again from a fresh mount', () => {
    vi.useFakeTimers();
    // The elements whose own text is the tooltip text.
    const holders = (text: string) =>
      Array.from(document.body.querySelectorAll<HTMLElement>('*')).filter(
        element =>
          Array.from(element.childNodes).some(
            node =>
              node.nodeType === Node.TEXT_NODE && node.textContent === text,
          ),
      );
    try {
      const {rerender} = render(<SaveField generation={0} />);
      const trigger = () => screen.getByRole('button', {name: 'Save'});
      // Before the first show: the hidden copy alone describes the trigger.
      expect(holders('Save changes')).toHaveLength(1);
      expect(describedBy(trigger())).toBe(holders('Save changes')[0]);
      expect(describedBy(trigger())).toHaveAttribute('hidden');
      expect(trigger()).toHaveAccessibleDescription('Save changes');

      // Shown: the layer's content alone holds the text and describes it.
      fireEvent.mouseEnter(trigger());
      fireEvent.pointerMove(trigger());
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(holders('Save changes')).toHaveLength(1);
      expect(describedBy(trigger())).toBe(holders('Save changes')[0]);
      expect(describedBy(trigger())?.closest('[role="tooltip"]')).not.toBe(
        null,
      );
      expect(trigger()).toHaveAccessibleDescription('Save changes');

      // Hidden again: the layer stays mounted, so no copy comes back.
      fireEvent.mouseLeave(trigger());
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(holders('Save changes')).toHaveLength(1);
      expect(describedBy(trigger())?.closest('[role="tooltip"]')).not.toBe(
        null,
      );
      expect(trigger()).toHaveAccessibleDescription('Save changes');

      // A fresh mount has no layer yet, so the copy describes it again.
      rerender(<SaveField generation={1} />);
      expect(holders('Save changes')).toHaveLength(1);
      expect(describedBy(trigger())).toHaveAttribute('hidden');
      expect(trigger()).toHaveAccessibleDescription('Save changes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens on the first keyboard focus, in that focus', () => {
    render(
      <Tooltip content="Save changes">
        <button type="button">Save</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'Save'});
    vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible'
        ? true
        : originalMatches.call(trigger, selector),
    );
    fireEvent.focusIn(trigger);
    const tooltips = screen.getAllByRole('tooltip', {hidden: true});
    expect(tooltips).toHaveLength(1);
    expect(popoverOpenState.get(tooltips[0])).toBe(true);
    expect(trigger).toHaveAccessibleDescription('Save changes');
  });

  it('keeps the trigger described while a show waits for its trigger to get a box, and after that show is cancelled', () => {
    // A real layout engine with a trigger that has no box yet: the show
    // waits, and nothing mounts until the box appears.
    const originalGetAnimations = document.getAnimations;
    const originalResizeObserver = globalThis.ResizeObserver;
    document.getAnimations = () => [];
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const {rerender} = render(
        <Tooltip content="Save changes" isOpen>
          <button type="button">Save</button>
        </Tooltip>,
      );
      const trigger = screen.getByRole('button', {name: 'Save'});
      expect(describedBy(trigger)).toHaveTextContent('Save changes');
      rerender(
        <Tooltip content="Save changes" isOpen={false}>
          <button type="button">Save</button>
        </Tooltip>,
      );
      expect(describedBy(trigger)).toHaveTextContent('Save changes');
      expect(trigger).toHaveAccessibleDescription('Save changes');
    } finally {
      document.getAnimations = originalGetAnimations;
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it("keeps the hidden copy in a shadow root whose host moved into another window's document", async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument as Document;
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    shadowRoot.appendChild(container);
    frameDocument.body.appendChild(frameDocument.adoptNode(host));
    try {
      render(
        <Tooltip content="Save changes">
          <button type="button">Save</button>
        </Tooltip>,
        {container},
      );
      const trigger = container.querySelector('button') as HTMLButtonElement;
      await waitFor(() => {
        const id = trigger.getAttribute('aria-describedby') ?? '';
        expect(shadowRoot.getElementById(id)).toHaveTextContent('Save changes');
      });
    } finally {
      iframe.remove();
    }
  });

  it("keeps the hidden copy in a shadow root trigger's own root", async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    shadowRoot.appendChild(container);
    try {
      render(
        <Tooltip content="Save changes">
          <button type="button">Save</button>
        </Tooltip>,
        {container},
      );
      const trigger = container.querySelector('button') as HTMLButtonElement;
      await waitFor(() => {
        const id = trigger.getAttribute('aria-describedby') ?? '';
        expect(shadowRoot.getElementById(id)).toHaveTextContent('Save changes');
      });
    } finally {
      host.remove();
    }
  });

  it('keeps its layer after it hides, so the next show opens the same layer', async () => {
    render(
      <Tooltip content="Save changes" delay={0}>
        <button type="button">Save</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', {name: 'Save'});
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerMove(trigger);
    await waitFor(() => {
      expect(layers()).toHaveLength(1);
    });
    const layer = layers()[0] as HTMLElement;
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(true);
    });
    fireEvent.mouseLeave(trigger);
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(false);
    });
    expect(layers()).toEqual([layer]);
    expect(describedBy(trigger)).toHaveTextContent('Save changes');
    fireEvent.mouseEnter(trigger);
    fireEvent.pointerMove(trigger);
    await waitFor(() => {
      expect(popoverOpenState.get(layer)).toBe(true);
    });
  });
});

describe('Tooltip sibling mode (anchorRef)', () => {
  // SideNavItem's collapsed rail tooltip renders the Tooltip inside the very
  // element anchorRef points at. React attaches an ancestor's ref after its
  // descendants' layout effects, so on mount the tooltip's effect used to see
  // a null anchor and never retried (#7692).
  it('attaches to an anchor it is rendered inside of', async () => {
    const onOpenChange = vi.fn();
    function AnchorInside() {
      const anchorRef = useRef<HTMLDivElement>(null);
      return (
        <div ref={anchorRef}>
          <button type="button">Inner</button>
          <Tooltip
            content="Sibling tooltip"
            anchorRef={anchorRef}
            delay={0}
            onOpenChange={onOpenChange}
          />
        </div>
      );
    }

    const {unmount} = render(<AnchorInside />);
    const anchor = screen.getByRole('button', {name: 'Inner'})
      .parentElement as HTMLElement;

    // The anchor is described by the tooltip once the commit has attached refs.
    await waitFor(() => {
      expect(anchor.getAttribute('aria-describedby')).not.toBe('');
    });
    const layer = getTooltip();
    expect(anchor.getAttribute('aria-describedby')).toBe(layer.id);

    // Hovering the anchor opens the tooltip: the interaction listeners were
    // attached to the late anchor too.
    fireEvent.mouseEnter(anchor);
    fireEvent.pointerMove(anchor);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    // Unmounting detaches: the aria-describedby the tooltip added is removed.
    unmount();
    expect(anchor.getAttribute('aria-describedby')).toBe(null);
  });
});

describe('script focus after a pointer press that focused nothing', () => {
  beforeEach(() => {
    __resetInteractionModalityForTest();
  });

  // Script focus matches `:focus-visible` in a real browser after a press on
  // page text; jsdom does not model it, so the case stands it up.
  function focusByScript(element: HTMLElement) {
    const realMatches = element.matches.bind(element);
    vi.spyOn(element, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : realMatches(selector),
    );
    fireEvent.focusIn(element);
  }

  it.each([
    ['mouse', 'mouse'],
    ['finger', 'touch'],
  ])(
    'opens nothing on a button trigger after a %s press on the page',
    async (_label, pointerType) => {
      const onOpenChange = vi.fn();
      render(
        <Tooltip content="Save" onOpenChange={onOpenChange} delay={0}>
          <button type="button">Save</button>
        </Tooltip>,
      );
      fireEvent.pointerDown(document.body, {pointerType});
      focusByScript(screen.getByRole('button', {name: 'Save'}));
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(onOpenChange).not.toHaveBeenCalledWith(true);
    },
  );

  it('still opens on a text-field trigger, which a pointer press leaves focus-visible', async () => {
    const onOpenChange = vi.fn();
    render(
      <Tooltip content="Amount in euros" onOpenChange={onOpenChange} delay={0}>
        <input type="text" aria-label="Amount" />
      </Tooltip>,
    );
    fireEvent.pointerDown(document.body, {pointerType: 'mouse'});
    focusByScript(screen.getByLabelText('Amount'));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  it('still opens on a button trigger when a key press came after the pointer press', async () => {
    const onOpenChange = vi.fn();
    render(
      <Tooltip content="Save" onOpenChange={onOpenChange} delay={0}>
        <button type="button">Save</button>
      </Tooltip>,
    );
    fireEvent.pointerDown(document.body, {pointerType: 'mouse'});
    fireEvent.keyDown(document, {key: 'Tab'});
    focusByScript(screen.getByRole('button', {name: 'Save'}));
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });
});

describe('Tooltip in a roving Toolbar (focusTrigger="auto")', () => {
  it('opens on arrow-key focus for a member whose tooltip was added after mount', async () => {
    const user = userEvent.setup();
    function FormatToolbar({hasHints}: {hasHints: boolean}) {
      return (
        <Toolbar
          label="Format"
          startContent={
            <>
              <IconButton
                label="Copy"
                icon={<TestIcon />}
                tooltip="Copy"
                onClick={() => {}}
              />
              <IconButton
                label="Filter"
                icon={<TestIcon />}
                tooltip={hasHints ? 'Filter (F)' : undefined}
                onClick={() => {}}
              />
            </>
          }
        />
      );
    }
    const {rerender} = render(<FormatToolbar hasHints={false} />);
    rerender(<FormatToolbar hasHints />);
    const filter = screen.getByRole('button', {name: 'Filter'});
    const realMatches = filter.matches.bind(filter);
    vi.spyOn(filter, 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : realMatches(selector),
    );

    screen.getByRole('button', {name: 'Copy'}).focus();
    await user.keyboard('{ArrowRight}');
    expect(filter).toHaveFocus();
    const describedBy = filter.getAttribute('aria-describedby') ?? '';
    await waitFor(() => {
      // The description names the layer: the same id without `-description`.
      const layer = describedBy
        .split(' ')
        .map(id => document.getElementById(id.replace(/-description$/, '')))
        .find(element => element?.textContent === 'Filter (F)');
      expect(layer).toBeDefined();
      expect(layer?.matches(':popover-open')).toBe(true);
    });
  });
});

// FR11: a press inside an open tooltip acts only within the tooltip.
describe('Tooltip surface press', () => {
  it('keeps a click on the tooltip text from activating a clickable card', () => {
    const onCardClick = vi.fn();
    render(
      <ClickableCard label="Card" onClick={onCardClick}>
        <span>Card body</span>
        <Tooltip content="Tooltip text" isOpen>
          <button type="button">Trigger</button>
        </Tooltip>
      </ClickableCard>,
    );
    fireEvent.click(screen.getByText('Tooltip text'));
    expect(onCardClick).not.toHaveBeenCalled();
    // Positive control: a click on the card's own content still activates it.
    fireEvent.click(screen.getByText('Card body'));
    expect(onCardClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a click on the tooltip text from running an Item row', () => {
    const onRowClick = vi.fn();
    render(
      <Item
        label="Row"
        onClick={onRowClick}
        endContent={
          <Tooltip content="Tooltip text" isOpen>
            <span tabIndex={0}>Info</span>
          </Tooltip>
        }
      />,
    );
    fireEvent.click(screen.getByText('Tooltip text'));
    expect(onRowClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Row'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a click on the tooltip text from running a Token', () => {
    const onTokenClick = vi.fn();
    render(
      <Token
        label="Tag"
        onClick={onTokenClick}
        endContent={
          <Tooltip content="Tooltip text" isOpen>
            <span tabIndex={0}>Info</span>
          </Tooltip>
        }
      />,
    );
    fireEvent.click(screen.getByText('Tooltip text'));
    expect(onTokenClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Tag'));
    expect(onTokenClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a middle-button press on the tooltip text from opening a card link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(
      <ClickableCard label="Card" href="https://example.com/">
        <Tooltip content="Tooltip text" isOpen>
          <button type="button">Trigger</button>
        </Tooltip>
      </ClickableCard>,
    );
    fireEvent.mouseUp(screen.getByText('Tooltip text'), {button: 1});
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('still lets document listeners see a click on the tooltip text', () => {
    // A Typeahead or menu inside a layer closes and opens from document
    // listeners, so the press must keep propagating.
    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    render(
      <Tooltip content="Tooltip text" isOpen>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByText('Tooltip text'));
    document.removeEventListener('click', onDocumentClick);
    expect(onDocumentClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a click on the tooltip text inside a label from toggling its control', () => {
    render(
      <label>
        <input type="checkbox" /> Accept{' '}
        <Tooltip content="Why we ask" isOpen>
          <button type="button">Info</button>
        </Tooltip>
      </label>,
    );
    // The surface mounts outside the label (a label cannot contain it), so
    // a click on its text is not label activation.
    fireEvent.click(screen.getByText('Why we ask'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    // Positive control: a click on the label's own text still toggles it.
    fireEvent.click(screen.getByText('Accept'));
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});

describe('Tooltip on every input (component:Tooltip FR5)', () => {
  beforeEach(() => {
    __resetInteractionModalityForTest();
  });

  /** An info-only trigger: a span, or a button. */
  function setup(
    touchTrigger?: 'auto' | 'tap' | 'none',
    trigger: 'span' | 'button' = 'span',
  ) {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <Tooltip
        content="Billed monthly"
        delay={0}
        onOpenChange={onOpenChange}
        touchTrigger={touchTrigger}>
        {trigger === 'button' ? (
          <button type="button">Billing</button>
        ) : (
          <span tabIndex={0}>Billing</span>
        )}
      </Tooltip>,
    );
    const opened = () => onOpenChange.mock.calls.some(([open]) => open);
    return {trigger: screen.getByText('Billing'), opened};
  }

  /** A finger or a landed pen: down, up, then the click (a pen hovers, so no arrival). */
  function tap(element: HTMLElement, pointerType: 'touch' | 'pen') {
    if (pointerType === 'touch') {
      fireEvent.pointerEnter(element, {pointerType});
    }
    fireEvent.pointerDown(element, {pointerType});
    fireEvent.pointerUp(element, {pointerType});
    fireEvent.click(element);
  }

  const settle = async () =>
    new Promise(resolve => {
      setTimeout(resolve, 50);
    });

  describe('on an info-only trigger', () => {
    it('a mouse hover previews it', async () => {
      const {trigger, opened} = setup();
      fireEvent.pointerEnter(trigger, {pointerType: 'mouse'});
      fireEvent.mouseEnter(trigger);
      fireEvent.pointerMove(trigger);
      await waitFor(() => expect(opened()).toBe(true));
    });

    it('keyboard focus previews it', async () => {
      const {trigger, opened} = setup();
      const realMatches = trigger.matches.bind(trigger);
      vi.spyOn(trigger, 'matches').mockImplementation((selector: string) =>
        selector === ':focus-visible' ? true : realMatches(selector),
      );
      fireEvent.keyDown(document, {key: 'Tab'});
      fireEvent.focusIn(trigger);
      await waitFor(() => expect(opened()).toBe(true));
    });

    it.each(['touch', 'pen'] as const)(
      'a %s tap opens it',
      async pointerType => {
        const {trigger, opened} = setup();
        tap(trigger, pointerType);
        await settle();
        expect(opened()).toBe(true);
      },
    );

    it.each(['mouse click', 'touch tap'] as const)(
      'a %s on a button trigger pins nothing',
      async press => {
        const {trigger} = setup(undefined, 'button');
        if (press === 'mouse click') {
          fireEvent.pointerDown(trigger, {pointerType: 'mouse'});
          fireEvent.pointerUp(trigger, {pointerType: 'mouse'});
          fireEvent.click(trigger);
        } else {
          tap(trigger, 'touch');
        }
        await settle();
        expect(trigger).not.toHaveAttribute('aria-expanded');
      },
    );
  });

  it.each([
    ['none', 'span', 'no tap opens it', false],
    ['tap', 'button', 'every tap opens it', true],
  ] as const)(
    'touchTrigger="%s" on a %s decides: %s',
    async (touchTrigger, trigger, _, tapOpens) => {
      const tip = setup(touchTrigger, trigger);
      tap(tip.trigger, 'touch');
      await settle();
      expect(tip.opened()).toBe(tapOpens);
    },
  );
});
