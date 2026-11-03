// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTooltip.showHide.test.tsx
 * @input Uses vitest, @testing-library/react, useTooltip
 * @output Tests of useTooltip's imperative show() and hide(): an app's own
 *   button opens and closes the tooltip, Escape, a press outside, and focus
 *   leaving still close it, it is announced once, and a controlled isOpen is
 *   not overridden
 * @position Testing; validates the app toggle path in useTooltip.tsx and
 *   usePressPin.ts
 *
 * SYNC: When useTooltip.tsx or usePressPin.ts changes, update these tests.
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
import {useState, type ReactElement} from 'react';
import {useTooltip, type TooltipOptions} from './useTooltip';
import type * as UseAnnounceModule from '../hooks/useAnnounce';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';

const {announce} = vi.hoisted(() => ({announce: vi.fn()}));
vi.mock('../hooks/useAnnounce', async importOriginal => ({
  ...(await importOriginal<typeof UseAnnounceModule>()),
  announceMessage: vi.fn(() => null),
  useAnnounce: () => announce,
}));

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
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
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

beforeEach(() => {
  __resetInteractionModalityForTest();
  announce.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const TIP = 'Billed monthly';

function shows(): boolean {
  const layer = screen.queryByText(TIP)?.closest<HTMLElement>('[popover]');
  return layer != null && layer.matches(':popover-open');
}

/** A mouse click: the press, then its click. */
function click(element: HTMLElement) {
  fireEvent.pointerDown(element, {pointerType: 'mouse'});
  fireEvent.pointerUp(element, {pointerType: 'mouse'});
  fireEvent.click(element, {detail: 1});
}

/** An app's own toggle button built on show() and hide(). */
function ToggleTip(
  props: TooltipOptions & {onPinnedChange?: (pinned: boolean) => void},
): ReactElement {
  const {onPinnedChange, onHide, ...options} = props;
  const [isPinned, setIsPinned] = useState(false);
  const tooltip = useTooltip({
    ...options,
    onHide: () => {
      onHide?.();
      setIsPinned(false);
    },
  });
  return (
    <>
      <button
        type="button"
        ref={tooltip.ref}
        aria-expanded={isPinned}
        aria-controls={tooltip.describedBy}
        onClick={() => {
          if (isPinned) {
            tooltip.hide();
          } else {
            tooltip.show();
          }
          setIsPinned(!isPinned);
          onPinnedChange?.(!isPinned);
        }}>
        About billing
      </button>
      <button type="button">Next</button>
      {tooltip.renderTooltip(TIP)}
    </>
  );
}

const trigger = () => screen.getByRole('button', {name: 'About billing'});

describe('useTooltip show() and hide() (component:Tooltip FR12)', () => {
  it("an app's own button opens the tooltip with show() and closes it with hide()", () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    render(<ToggleTip onShow={onShow} onHide={onHide} />);

    click(trigger());
    expect(shows()).toBe(true);
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');

    click(trigger());
    expect(shows()).toBe(false);
    expect(onHide).toHaveBeenCalled();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a shown tooltip stays open when the pointer leaves its trigger', () => {
    render(<ToggleTip />);
    click(trigger());
    fireEvent.mouseLeave(trigger(), {relatedTarget: document.body});
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(shows()).toBe(true);
  });

  it('announces its text once on show()', () => {
    render(<ToggleTip />);
    click(trigger());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(TIP, 'polite');
  });

  it('Escape closes a shown tooltip and reports it', () => {
    const onHide = vi.fn();
    render(<ToggleTip onHide={onHide} />);
    click(trigger());
    fireEvent.keyDown(document, {key: 'Escape'});
    expect(shows()).toBe(false);
    expect(onHide).toHaveBeenCalled();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('a press outside closes a shown tooltip', () => {
    render(<ToggleTip />);
    click(trigger());
    fireEvent.pointerDown(document.body, {pointerType: 'mouse'});
    fireEvent.pointerUp(document.body, {pointerType: 'mouse'});
    expect(shows()).toBe(false);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('focus leaving the trigger for another control closes a shown tooltip', () => {
    render(<ToggleTip />);
    trigger().focus();
    click(trigger());
    expect(shows()).toBe(true);
    const next = screen.getByRole('button', {name: 'Next'});
    fireEvent.focusOut(trigger(), {relatedTarget: next});
    expect(shows()).toBe(false);
  });

  it('focus leaving closes it under focusTrigger="never" too', () => {
    render(<ToggleTip focusTrigger="never" />);
    click(trigger());
    const next = screen.getByRole('button', {name: 'Next'});
    fireEvent.focusOut(trigger(), {relatedTarget: next});
    expect(shows()).toBe(false);
  });

  it('under a controlled isOpen, show() and hide() report and do not override it', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    function Controlled(): ReactElement {
      const tooltip = useTooltip({isOpen: false, onShow, onHide});
      return (
        <>
          <button type="button" ref={tooltip.ref} onClick={tooltip.show}>
            About billing
          </button>
          <button type="button" onClick={tooltip.hide}>
            Close
          </button>
          {tooltip.renderTooltip(TIP)}
        </>
      );
    }
    render(<Controlled />);
    click(trigger());
    expect(onShow).toHaveBeenCalledTimes(1);
    expect(shows()).toBe(false);
    fireEvent.click(screen.getByRole('button', {name: 'Close'}));
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(shows()).toBe(false);
  });

  it('show() does nothing while isEnabled is false', () => {
    const onShow = vi.fn();
    render(<ToggleTip isEnabled={false} onShow={onShow} />);
    click(trigger());
    expect(shows()).toBe(false);
    expect(onShow).not.toHaveBeenCalled();
  });
});
