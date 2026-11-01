// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTooltip.test.tsx
 * @input Uses vitest, @testing-library/react, useTooltip hook
 * @output Unit tests for the tooltip show/hide timers and controlled state
 * @position Testing; validates useTooltip.tsx timing contract. Component-level
 *   behavior lives in Tooltip.test.tsx — this file pins the delays, the
 *   hover-bridge constant, and timer teardown, which are invisible from there.
 *
 * SYNC: When useTooltip.tsx changes, update tests to match new behavior
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {useTooltip, type TooltipOptions} from './useTooltip';
import {useLayer} from '../Layer/useLayer';

// jsdom implements neither the Popover API nor `:popover-open`; mirror
// Tooltip.test.tsx's shims so the layer can open.
const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (selector: string) {
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

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function Harness(options: TooltipOptions) {
  const tooltip = useTooltip(options);
  return (
    <div>
      <button
        type="button"
        ref={tooltip.ref}
        aria-describedby={tooltip.describedBy}>
        Trigger
      </button>
      {tooltip.renderTooltip('Helpful text')}
    </div>
  );
}

function trigger() {
  return screen.getByRole('button', {name: 'Trigger'});
}

/** The popover element the trigger's aria-describedby points at. */
function tooltipElement(): HTMLElement {
  const id = trigger().getAttribute('aria-describedby');
  const element = id == null ? null : document.getElementById(id);
  expect(element).not.toBeNull();
  return element as HTMLElement;
}

/** Advance timers inside act so the layer's state updates flush. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useTooltip — show delay', () => {
  it('does not show before the default 200ms delay elapses', () => {
    const onShow = vi.fn();
    render(<Harness onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(199);

    expect(onShow).not.toHaveBeenCalled();
  });

  it('shows once the default 200ms delay elapses', () => {
    const onShow = vi.fn();
    render(<Harness onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(200);

    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('honors a custom delay on both sides of the boundary', () => {
    const onShow = vi.fn();
    render(<Harness delay={50} onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(49);
    expect(onShow).not.toHaveBeenCalled();

    tick(1);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending show when the pointer leaves before the delay elapses', () => {
    const onShow = vi.fn();
    render(<Harness onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(100);
    fireEvent.mouseLeave(trigger());
    tick(1000);

    expect(onShow).not.toHaveBeenCalled();
  });

  it('does not show on hover while isEnabled is false', () => {
    const onShow = vi.fn();
    render(<Harness isEnabled={false} onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(1000);

    expect(onShow).not.toHaveBeenCalled();
  });

  it('drops a pending show when isEnabled turns false before the delay elapses', () => {
    const onShow = vi.fn();
    const {rerender} = render(<Harness onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    tick(100);
    rerender(<Harness isEnabled={false} onShow={onShow} />);
    tick(1000);

    expect(onShow).not.toHaveBeenCalled();
    expect(tooltipElement().matches(':popover-open')).toBe(false);
  });
});

describe('useTooltip — touch suppression', () => {
  it('never shows on the hover a finger synthesizes, but still on a mouse', () => {
    // Touch is decided per interaction from the pointer type — a finger's
    // arrival fires `pointerenter` ahead of the `mouseenter` a tap synthesizes
    // — not once per device from a `(hover: none)` media query, so a hybrid
    // device keeps hover under a mouse.
    const onShow = vi.fn();
    render(<Harness onShow={onShow} />);

    fireEvent.pointerEnter(trigger(), {pointerType: 'touch'});
    fireEvent.mouseEnter(trigger());
    tick(1000);
    expect(onShow).not.toHaveBeenCalled();

    fireEvent.pointerEnter(trigger(), {pointerType: 'mouse'});
    fireEvent.mouseEnter(trigger());
    tick(200);
    expect(onShow).toHaveBeenCalledTimes(1);
  });
});

describe('useTooltip — hide delay', () => {
  function showTooltip(onHide: () => void, options: TooltipOptions = {}) {
    render(<Harness delay={0} onHide={onHide} {...options} />);
    fireEvent.mouseEnter(trigger());
    tick(0);
  }

  it('holds the tooltip open for a 100ms hover bridge when hideDelay is 0', () => {
    const onHide = vi.fn();
    showTooltip(onHide, {hideDelay: 0});

    fireEvent.mouseLeave(trigger());
    tick(99);
    expect(onHide).not.toHaveBeenCalled();

    tick(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('applies the same hover bridge when hideDelay is left unset', () => {
    const onHide = vi.fn();
    showTooltip(onHide);

    fireEvent.mouseLeave(trigger());
    tick(99);
    expect(onHide).not.toHaveBeenCalled();

    tick(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('stays open when the pointer crosses onto the tooltip in one step', () => {
    const onHide = vi.fn();
    showTooltip(onHide);
    const surface = tooltipElement();

    // A one-step crossing dispatches in browser order: the trigger's mouseout
    // (React derives the surface's onMouseEnter from it), then the trigger's
    // native mouseleave, both pointing at the surface. fireEvent.mouseLeave
    // would add a mouseout after the leave, so the leave is dispatched raw.
    fireEvent.mouseOut(trigger(), {relatedTarget: surface});
    act(() => {
      trigger().dispatchEvent(
        new MouseEvent('mouseleave', {relatedTarget: surface}),
      );
    });
    tick(500);
    expect(onHide).not.toHaveBeenCalled();

    fireEvent.mouseOut(surface, {relatedTarget: document.body});
    tick(100);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('uses an explicit hideDelay instead of the hover bridge', () => {
    const onHide = vi.fn();
    showTooltip(onHide, {hideDelay: 500});

    fireEvent.mouseLeave(trigger());
    tick(100);
    expect(onHide).not.toHaveBeenCalled();

    tick(400);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('useTooltip — controlled isOpen', () => {
  it('shows on mount when isOpen is true', () => {
    const onShow = vi.fn();
    render(<Harness isOpen onShow={onShow} />);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('ignores pointer-leave while isOpen is true', () => {
    const onHide = vi.fn();
    render(<Harness isOpen onHide={onHide} />);

    fireEvent.mouseLeave(trigger());
    tick(1000);

    expect(onHide).not.toHaveBeenCalled();
  });

  it('never schedules a show while isOpen is false', () => {
    const onShow = vi.fn();
    render(<Harness isOpen={false} onShow={onShow} />);

    fireEvent.mouseEnter(trigger());
    expect(vi.getTimerCount()).toBe(0);

    tick(1000);
    expect(onShow).not.toHaveBeenCalled();
  });
});

describe('useTooltip — Escape dismissal', () => {
  it('hides an uncontrolled tooltip when Escape is pressed', () => {
    const onHide = vi.fn();
    render(<Harness delay={0} onHide={onHide} />);
    fireEvent.mouseEnter(trigger());
    tick(0);
    expect(tooltipElement().matches(':popover-open')).toBe(true);

    fireEvent.keyDown(document, {key: 'Escape'});

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(tooltipElement().matches(':popover-open')).toBe(false);
  });

  it('ignores an Escape that carries the IME keyCode 229', () => {
    const onHide = vi.fn();
    render(<Harness delay={0} onHide={onHide} />);
    fireEvent.mouseEnter(trigger());
    tick(0);

    fireEvent.keyDown(document, {key: 'Escape', keyCode: 229});

    expect(onHide).not.toHaveBeenCalled();
  });

  it('ignores keys other than Escape', () => {
    const onHide = vi.fn();
    render(<Harness delay={0} onHide={onHide} />);
    fireEvent.mouseEnter(trigger());
    tick(0);

    fireEvent.keyDown(document, {key: 'Enter'});

    expect(onHide).not.toHaveBeenCalled();
  });

  it('reports Escape on a controlled tooltip through onHide without hiding it', () => {
    const onHide = vi.fn();
    render(<Harness isOpen onHide={onHide} />);
    expect(tooltipElement().matches(':popover-open')).toBe(true);

    fireEvent.keyDown(document, {key: 'Escape'});

    // `isOpen` is the consumer's value: the hook asks, the consumer decides.
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(tooltipElement().matches(':popover-open')).toBe(true);
  });
});

describe('useTooltip — teardown', () => {
  it('clears a pending show timer on unmount', () => {
    const {unmount} = render(<Harness />);

    fireEvent.mouseEnter(trigger());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a pending hide timer on unmount', () => {
    const {unmount} = render(<Harness delay={0} />);
    fireEvent.mouseEnter(trigger());
    tick(0);

    fireEvent.mouseLeave(trigger());
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useTooltip — focus returning from a popover the keyboard closed', () => {
  const shimmedShowPopover = HTMLElement.prototype.showPopover;
  const shimmedHidePopover = HTMLElement.prototype.hidePopover;

  afterEach(() => {
    HTMLElement.prototype.showPopover = shimmedShowPopover;
    HTMLElement.prototype.hidePopover = shimmedHidePopover;
  });

  /**
   * The Popover API's re-entrancy rule, which the file-level shims leave out:
   * hiding hands focus back to the previously focused element while the
   * document still counts the popover as hiding, and `showPopover()` throws
   * while any popover in the document is being shown or hidden.
   */
  function installReentrantPopoverApi() {
    let operationsInFlight = 0;
    const previouslyFocused = new WeakMap<HTMLElement, Element | null>();
    const showSpy = vi.fn(function (this: HTMLElement) {
      if (operationsInFlight > 0) {
        throw new DOMException(
          "Failed to execute 'showPopover' on 'HTMLElement': Invalid to show a popover during another show operation",
          'InvalidStateError',
        );
      }
      operationsInFlight += 1;
      try {
        previouslyFocused.set(this, this.ownerDocument.activeElement);
        popoverOpenState.set(this, true);
      } finally {
        operationsInFlight -= 1;
      }
    });
    HTMLElement.prototype.showPopover = showSpy;
    HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
      operationsInFlight += 1;
      try {
        popoverOpenState.set(this, false);
        const target = previouslyFocused.get(this);
        previouslyFocused.delete(this);
        if (
          target instanceof HTMLElement &&
          this.contains(document.activeElement)
        ) {
          target.focus();
        }
      } finally {
        operationsInFlight -= 1;
      }
    });
    return showSpy;
  }

  /** A popover whose trigger also carries a tooltip. */
  function PopoverWithTooltipTrigger({onShow}: {onShow: () => void}) {
    const popover = useLayer({mode: 'context'});
    const tooltip = useTooltip({onShow});
    return (
      <div>
        <button
          type="button"
          ref={el => {
            popover.ref(el);
            tooltip.ref(el);
          }}
          aria-describedby={tooltip.describedBy}
          onClick={popover.show}>
          Trigger
        </button>
        {popover.render(
          <button
            type="button"
            onKeyDown={event => {
              if (event.key === 'Escape') {
                popover.hide();
              }
            }}>
            Inside
          </button>,
          {role: 'dialog'},
        )}
        {tooltip.renderTooltip('Helpful text')}
      </div>
    );
  }

  it('shows the tooltip after the hide returns instead of nesting a show inside it', async () => {
    const showSpy = installReentrantPopoverApi();
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    const onShow = vi.fn();
    render(<PopoverWithTooltipTrigger onShow={onShow} />);
    const inside = screen.getByRole('button', {name: 'Inside', hidden: true});
    // Keyboard focus: jsdom does not model `:focus-visible`.
    const realMatches = trigger().matches.bind(trigger());
    vi.spyOn(trigger(), 'matches').mockImplementation((selector: string) =>
      selector === ':focus-visible' ? true : realMatches(selector),
    );

    // Tab to the trigger (tooltip shows), open the popover, move inside.
    act(() => trigger().focus());
    fireEvent.click(trigger());
    act(() => inside.focus());
    tick(100);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(tooltipElement().matches(':popover-open')).toBe(false);

    // Escape closes the popover; the browser returns focus to the trigger
    // inside that hide, and the tooltip's focus-in asks to show.
    fireEvent.keyDown(inside, {key: 'Escape'});
    window.removeEventListener('error', onError);

    expect(errors).toEqual([]);
    expect(document.activeElement).toBe(trigger());
    // The press that closed the popover is not also the tooltip's to take:
    // the show waits until the dispatch has unwound, then runs once.
    expect(onShow).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(showSpy.mock.results.every(r => r.type === 'return')).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(2);
    expect(tooltipElement().matches(':popover-open')).toBe(true);
  });
});
