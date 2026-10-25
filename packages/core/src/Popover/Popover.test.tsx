// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Popover.test.tsx
 * @input Uses vitest, Testing Library, node:fs, Popover, Dialog, and
 *   SegmentedControl
 * @output Unit and compile-time public-contract tests for Popover behavior
 * @position Testing; validates Popover.tsx implementation
 *
 * SYNC: When Popover.tsx changes, update tests to match new behavior
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
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
  cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as stylex from '@stylexjs/stylex';
import {readFileSync} from 'node:fs';
import React, {useRef} from 'react';
import {createPortal} from 'react-dom';
import {Popover} from './Popover';
import {usePopover} from './usePopover';
import type {UsePopoverReturn} from './usePopover';
import {Dialog} from '../Dialog';
import {SegmentedControl, SegmentedControlItem} from '../SegmentedControl';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';

// Store original matches to restore later
const originalMatches = HTMLElement.prototype.matches;

// Track popover open state per element
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

// Mock Popover API for jsdom
beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, true);
    // Dispatch toggle event
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    popoverOpenState.set(this, false);
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  });

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

describe('usePopover public return type', () => {
  it('keeps dismissal internals out of the public contract', () => {
    const hasKeepOpenProps: 'keepOpenProps' extends keyof UsePopoverReturn
      ? true
      : false = false;
    const hasDismissalGuard: 'wasJustDismissed' extends keyof UsePopoverReturn
      ? true
      : false = false;
    type PublicToggleParameters = Parameters<UsePopoverReturn['toggle']>;
    const publicToggleTakesNoOptions: PublicToggleParameters extends []
      ? true
      : false = true;
    type PublicShowOptions = NonNullable<
      Parameters<UsePopoverReturn['show']>[0]
    >;
    const hasInternalFocusTarget: 'focusTarget' extends keyof PublicShowOptions
      ? true
      : false = false;
    expect(hasKeepOpenProps).toBe(false);
    expect(hasDismissalGuard).toBe(false);
    expect(publicToggleTakesNoOptions).toBe(true);
    expect(hasInternalFocusTarget).toBe(false);
  });

  it('emits only the canonical surface target for direct hook consumers', () => {
    function HeadlessPopover() {
      const popover = usePopover({dialogLabel: 'Headless popover'});
      return (
        <>
          <button
            type="button"
            ref={popover.triggerRef}
            onClick={() => popover.show()}
            {...popover.triggerProps}>
            Open headless
          </button>
          {popover.render(<span>Headless content</span>)}
        </>
      );
    }

    render(<HeadlessPopover />);
    fireEvent.click(screen.getByRole('button', {name: 'Open headless'}));

    const surface = screen.getByRole('dialog', {
      name: 'Headless popover',
      hidden: true,
    });
    expect(surface).toHaveClass('astryx-popover');
    expect(surface).not.toHaveClass('astryx-popover-surface');
  });
});

describe('Popover', () => {
  it('renders trigger element', () => {
    render(
      <Popover content={<span>Popover content</span>} label="Test popover">
        <button type="button">Open</button>
      </Popover>,
    );
    expect(screen.getByRole('button', {name: 'Open'})).toBeInTheDocument();
  });

  it('does not open from an aria-disabled trigger', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button" aria-disabled="true">
          Trigger
        </button>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    // A click dispatched straight on the trigger, as element.click() or an
    // assistive-technology activate command does (spec:AST-085 FR2).
    act(() => trigger.click());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('sets aria-haspopup on trigger', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button">Trigger</button>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('sets aria-expanded=false initially', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button">Trigger</button>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Trigger'});
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click and updates aria-expanded', () => {
    render(
      <Popover content={<span>Popover content</span>} label="Test">
        <button type="button">Open</button>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Open'});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders popover content with role=dialog', () => {
    render(
      <Popover content={<span>Hello</span>} label="Greeting">
        <button type="button">Open</button>
      </Popover>,
    );
    // The dialog is inside a popover element — hidden from accessibility tree
    // until shown, but still present in the DOM
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-label', 'Greeting');
  });

  it('can render a neutral wrapper when content owns its role', () => {
    render(
      <Popover
        role="none"
        content={
          <div role="menu" aria-label="Actions">
            Menu content
          </div>
        }
        label="Actions">
        <button type="button">Open</button>
      </Popover>,
    );

    const trigger = screen.getByRole('button', {name: 'Open'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');
    expect(
      screen.queryByRole('dialog', {hidden: true}),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('menu', {hidden: true})).toHaveAttribute(
      'aria-label',
      'Actions',
    );
  });

  it('can render a non-modal dialog wrapper', () => {
    render(
      <Popover
        role="dialog"
        isModal={false}
        content={<span>Hello</span>}
        label="Greeting">
        <button type="button">Open</button>
      </Popover>,
    );

    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('aria-modal');
  });

  it('calls onOpenChange when opened', () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        content={<span>Content</span>}
        label="Test"
        onOpenChange={onOpenChange}>
        <button type="button">Open</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('does not open when isEnabled is false', () => {
    const onOpenChange = vi.fn();
    render(
      <Popover
        content={<span>Content</span>}
        label="Test"
        isEnabled={false}
        onOpenChange={onOpenChange}>
        <button type="button">Open</button>
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('renders with data-testid', () => {
    render(
      <Popover
        content={<span>Content</span>}
        label="Test"
        data-testid="my-popover">
        <button type="button">Open</button>
      </Popover>,
    );
    expect(screen.getByTestId('my-popover')).toBeInTheDocument();
  });

  it('constrains the layer without clipping content that already fits', () => {
    render(
      <Popover
        content={<span>Content</span>}
        label="Test"
        width={640}
        data-testid="popover-content">
        <button type="button">Open</button>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));

    const layer = document.querySelector('[popover]');
    expect(layer).toHaveStyle({boxSizing: 'border-box'});
    // The viewport fit is the layer runtime's (spec:AST-059 FR1, FR3); the
    // explicit width is clamped to the viewport, never to the span beside
    // the trigger (FR2).
    expect(layer?.className).toContain('useLayer__styles.viewportFit');
    expect(layer?.className).toContain('useLayer__styles.gutterInlineEnd');
    expect(layer?.className).toContain('Popover__styles.customWidth');
    expect(layer?.getAttribute('style')).toContain('min(640px, calc(100vw');
    expect(layer?.getAttribute('style')).not.toContain('100%');
    const surface = screen.getByTestId('popover-content').parentElement;
    expect(surface?.className).toContain('Popover__styles.surfaceViewportFit');
    const popoverSource = readFileSync(
      'packages/core/src/Popover/Popover.tsx',
      'utf8',
    );
    expect(popoverSource).toMatch(
      /surfaceViewportFit:[\s\S]*?maxInlineSize: stylex\.firstThatWorks\(\s*`calc\(\$\{layerViewportInset\.maxInlineSize\}\)`/,
    );
    expect(popoverSource).toMatch(
      /surfaceViewportFit:[\s\S]*?maxBlockSize: stylex\.firstThatWorks\(\s*`calc\(\$\{layerViewportInset\.maxBlockSize\}\)`/,
    );
    expect(popoverSource).not.toMatch(/safe-area-inset|calc\(100%/);
    expect(surface?.className).not.toContain(
      'Popover__styles.surfaceScrollable',
    );
  });

  it('enables internal scrolling only when content exceeds the available space', () => {
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
      .mockReturnValue(100);
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(200);
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockReturnValue(200);
    const scrollWidth = vi
      .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockReturnValue(200);

    try {
      render(
        <Popover
          content={<span>Long content</span>}
          label="Test"
          data-testid="popover-content">
          <button type="button">Open</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));

      expect(
        screen.getByTestId('popover-content').parentElement?.className,
      ).toContain('Popover__styles.surfaceScrollable');
    } finally {
      clientHeight.mockRestore();
      scrollHeight.mockRestore();
      clientWidth.mockRestore();
      scrollWidth.mockRestore();
    }
  });

  it('coalesces repeated overflow signals into one animation frame', () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let mutationCallback: MutationCallback | undefined;
    const frameCallbacks: FrameRequestCallback[] = [];

    class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    class MutationObserverMock {
      constructor(callback: MutationCallback) {
        mutationCallback = callback;
      }
      observe = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    }

    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('MutationObserver', MutationObserverMock);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    const {unmount} = render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button">Open</button>
      </Popover>,
    );

    try {
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      while (frameCallbacks.length > 0) {
        const pendingFrames = frameCallbacks.splice(0);
        act(() => pendingFrames.forEach(callback => callback(0)));
      }
      requestFrame.mockClear();

      act(() => {
        resizeCallback?.([], {} as ResizeObserver);
        mutationCallback?.([], {} as MutationObserver);
        window.dispatchEvent(new Event('resize'));
      });

      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(frameCallbacks).toHaveLength(1);
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('observes overflow only while the popover is open', () => {
    const resizeConstructed = vi.fn();
    const resizeDisconnected = vi.fn();
    const mutationConstructed = vi.fn();
    const mutationDisconnected = vi.fn();

    class ResizeObserverMock {
      constructor() {
        resizeConstructed();
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = resizeDisconnected;
    }

    class MutationObserverMock {
      constructor() {
        mutationConstructed();
      }
      observe = vi.fn();
      disconnect = mutationDisconnected;
      takeRecords = vi.fn(() => []);
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('MutationObserver', MutationObserverMock);

    const {unmount} = render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button">Open</button>
      </Popover>,
    );

    try {
      const trigger = screen.getByRole('button', {name: 'Open'});
      expect(resizeConstructed).not.toHaveBeenCalled();
      expect(mutationConstructed).not.toHaveBeenCalled();

      fireEvent.click(trigger);
      expect(resizeConstructed).toHaveBeenCalledTimes(1);
      expect(mutationConstructed).toHaveBeenCalledTimes(1);

      fireEvent.click(trigger);
      expect(resizeDisconnected).toHaveBeenCalledTimes(1);
      expect(mutationDisconnected).toHaveBeenCalledTimes(1);
      expect(resizeConstructed).toHaveBeenCalledTimes(1);
      expect(mutationConstructed).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('inherits the far-edge gutter from the layer runtime for aligned popovers', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <button type="button">Open</button>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));

    const layer = document.querySelector('[popover]');
    expect(layer?.className).toContain('useLayer__styles.gutterInlineEnd');
    expect(layer?.className).not.toContain(
      'useLayer__styles.gutterInlineStart',
    );
    expect(layer?.className).toContain('Popover__styles.matchTrigger');
    expect(layer).toHaveStyle(
      'min-width: min(anchor-size(width),calc(100vi - calc(max(var(--spacing-4), env(safe-area-inset-left, 0px)) + var(--astryx-layer-inset-inline-start, 0px)) - calc(max(var(--spacing-4), env(safe-area-inset-right, 0px)) + var(--astryx-layer-inset-inline-end, 0px))))',
    );
  });

  it('mirrors the far-edge gutter for end-aligned popovers', () => {
    render(
      <Popover content={<span>Content</span>} label="Test" alignment="end">
        <button type="button">Open</button>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));

    const layer = document.querySelector('[popover]');
    expect(layer?.className).toContain('useLayer__styles.gutterInlineStart');
    expect(layer?.className).not.toContain('useLayer__styles.gutterInlineEnd');
  });

  it('reserves both inline gutters for centered popovers', () => {
    render(
      <Popover content={<span>Content</span>} label="Test" alignment="center">
        <button type="button">Open</button>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));

    const layer = document.querySelector('[popover]');
    expect(layer?.className).toContain('useLayer__styles.gutterInlineStart');
    expect(layer?.className).toContain('useLayer__styles.gutterInlineEnd');
    // One match-trigger minimum for every alignment: the cap is the viewport.
    expect(layer?.className).toContain('Popover__styles.matchTrigger');
  });

  it('uses block-axis gutters for side placement', () => {
    render(
      <Popover
        content={<span>Content</span>}
        label="Test"
        placement="end"
        alignment="start">
        <button type="button">Open</button>
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Open'}));

    const layer = document.querySelector('[popover]');
    expect(layer?.className).toContain('useLayer__styles.gutterBlockEnd');
    expect(layer?.className).not.toContain('useLayer__styles.gutterInlineEnd');
  });

  it('preserves the dialog aria-haspopup contract for render-prop triggers', () => {
    render(
      <Popover
        role="none"
        content={
          <div role="menu" aria-label="Actions">
            Menu content
          </div>
        }
        label="Actions">
        {triggerProps => (
          <button
            type="button"
            ref={triggerProps.ref}
            onClick={triggerProps.onClick}
            aria-haspopup={triggerProps['aria-haspopup']}
            aria-expanded={triggerProps['aria-expanded']}
            aria-controls={triggerProps['aria-controls']}>
            Open menu
          </button>
        )}
      </Popover>,
    );

    expect(screen.getByRole('button', {name: 'Open menu'})).toHaveAttribute(
      'aria-haspopup',
      'dialog',
    );
  });

  it('supports anchorRef sibling mode', () => {
    function AnchorRefTest() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" ref={ref}>
            Anchor
          </button>
          <Popover
            anchorRef={ref as React.RefObject<HTMLElement>}
            content={<span>Sibling content</span>}
            label="Sibling"
          />
        </>
      );
    }
    render(<AnchorRefTest />);
    const anchor = screen.getByRole('button', {name: 'Anchor'});
    expect(anchor).toHaveAttribute('aria-haspopup', 'dialog');
    expect(anchor).toHaveAttribute('aria-expanded', 'false');
  });

  it('finds button inside wrapper and attaches ARIA', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <div>
          <button type="button">Nested button</button>
        </div>
      </Popover>,
    );
    const button = screen.getByRole('button', {name: 'Nested button'});
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('finds role="button" elements and attaches ARIA', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <div role="button" tabIndex={0}>
          Custom trigger
        </div>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Custom trigger'});
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on click for role="button" elements', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <div role="button" tabIndex={0}>
          Custom trigger
        </div>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Custom trigger'});
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens on Enter/Space for role="button" elements', () => {
    render(
      <Popover content={<span>Content</span>} label="Test">
        <div role="button" tabIndex={0}>
          Custom trigger
        </div>
      </Popover>,
    );
    const trigger = screen.getByRole('button', {name: 'Custom trigger'});
    fireEvent.keyDown(trigger, {key: 'Enter'});
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('warns in dev when children have no button', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <Popover content={<span>Content</span>} label="Test">
        <span>Not a button</span>
      </Popover>,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('must contain a <button> or [role="button"]'),
    );
    warnSpy.mockRestore();
  });

  describe('dismiss controls', () => {
    // jsdom does not implement <dialog> showModal/close, needed by the
    // host-Dialog fall-through test below.
    beforeAll(() => {
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute('open', '');
      });
      HTMLDialogElement.prototype.close = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute('open');
      });
    });

    it('dismisses on Escape by default', () => {
      render(
        <Popover content={<span>Content</span>} label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('does not reopen when the trigger click belongs to its own light dismiss', () => {
      render(
        <Popover content={<span>Content</span>} label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      const showPopover = vi.mocked(HTMLElement.prototype.showPopover);
      const callsBeforeOpen = showPopover.mock.calls.length;

      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);
      expect(showPopover).toHaveBeenCalledTimes(callsBeforeOpen + 1);

      fireEvent.pointerDown(trigger);
      const popover = document.querySelector('[popover]') as HTMLElement;
      act(() => {
        popover.dispatchEvent(
          Object.assign(new Event('toggle'), {
            oldState: 'open',
            newState: 'closed',
          }),
        );
      });
      fireEvent.click(trigger);

      expect(showPopover).toHaveBeenCalledTimes(callsBeforeOpen + 1);
    });

    it('dismisses on Escape pressed inside a roving-focus list', () => {
      render(
        <Popover
          content={
            <SegmentedControl value="grid" onChange={() => {}} label="View">
              <SegmentedControlItem value="grid" label="Grid" />
              <SegmentedControlItem value="list" label="List" />
            </SegmentedControl>
          }
          label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // From the segment, so the list's own key handler runs first. jsdom has
      // no popover display, so the open content still reads as hidden.
      const segment = screen.getByRole('radio', {name: 'Grid', hidden: true});
      fireEvent.keyDown(segment, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('stays open on Escape when hasEscapeDismiss is false', () => {
      render(
        <Popover
          content={<span>Content</span>}
          label="Test"
          hasLightDismiss={false}
          hasEscapeDismiss={false}>
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });

    it('still dismisses on Escape when only light dismiss is off', () => {
      render(
        <Popover
          content={<span>Content</span>}
          label="Test"
          hasLightDismiss={false}>
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('switches to popover="manual" when hasLightDismiss is false', () => {
      const {unmount} = render(
        <Popover content={<span>Content</span>} label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      expect(document.querySelector('[popover]')).toHaveAttribute(
        'popover',
        'auto',
      );
      unmount();

      render(
        <Popover
          content={<span>Content</span>}
          label="Test"
          hasLightDismiss={false}>
          <button type="button">Open</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      expect(document.querySelector('[popover]')).toHaveAttribute(
        'popover',
        'manual',
      );
    });

    it('lets Escape fall through to a host Dialog when fully opted out', () => {
      const onDialogOpenChange = vi.fn();
      render(
        <Dialog isOpen={true} onOpenChange={onDialogOpenChange} purpose="info">
          <Popover
            content={<span>Coachmark</span>}
            label="Tip"
            hasLightDismiss={false}
            hasEscapeDismiss={false}>
            <button type="button">Open tip</button>
          </Popover>
        </Dialog>,
      );
      const trigger = screen.getByRole('button', {name: 'Open tip'});
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // The Dialog listens for Escape on the dialog element, so fire from a
      // node inside it. The popover registers no Escape handler, so
      // hasActiveFocusTrapEscape() is false and the Dialog handles the press
      // while the popover itself stays open.
      fireEvent.keyDown(trigger, {key: 'Escape'});
      expect(onDialogOpenChange).toHaveBeenCalledWith(false);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  describe('focus restoration', () => {
    it('focuses the first content control after pointer activation', async () => {
      render(
        <Popover
          content={<button type="button">Delete</button>}
          label="Confirm deletion">
          <button type="button">Open confirmation</button>
        </Popover>,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Open confirmation'}), {
        detail: 1,
      });

      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: 'Delete', hidden: true}),
        ).toHaveFocus(),
      );
    });

    it('focuses the first content control after keyboard activation', async () => {
      render(
        <Popover
          content={<button type="button">Delete</button>}
          label="Confirm deletion">
          <button type="button">Open confirmation</button>
        </Popover>,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Open confirmation'}), {
        detail: 0,
      });

      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: 'Delete', hidden: true}),
        ).toHaveFocus(),
      );
    });

    it('focuses the dialog container when content has no controls', async () => {
      render(
        <Popover content={<span>Read-only content</span>} label="Read only">
          <button type="button">Open read only</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open read only'}));

      const dialog = screen.getByRole('dialog', {
        name: 'Read only',
        hidden: true,
      });
      await waitFor(() => expect(dialog).toHaveFocus());
      for (const className of stylex
        .props(focusOutlineStyles.focusVisible)
        .className!.split(' ')) {
        expect(dialog).toHaveClass(className);
      }
      expect(
        screen.getByRole('button', {name: 'Close popover', hidden: true}),
      ).not.toHaveFocus();
    });

    it('prefers a genuine content control for initial focus', async () => {
      render(
        <Popover
          content={<button type="button">Content action</button>}
          label="Action popover">
          <button type="button">Open action</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open action'}));

      await waitFor(() =>
        expect(
          screen.getByRole('button', {name: 'Content action', hidden: true}),
        ).toHaveFocus(),
      );
    });

    it('keeps the fallback close button reachable by Tab', async () => {
      const user = userEvent.setup();
      render(
        <Popover content={<span>Read-only content</span>} label="Read only">
          <button type="button">Open read only</button>
        </Popover>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Open read only'}));
      await waitFor(() =>
        expect(
          screen.getByRole('dialog', {name: 'Read only', hidden: true}),
        ).toHaveFocus(),
      );

      await user.tab();

      expect(
        screen.getByRole('button', {name: 'Close popover', hidden: true}),
      ).toHaveFocus();
    });

    it('returns focus to the trigger when closed via Escape', () => {
      render(
        <Popover
          content={
            <button type="button" data-testid="inside-content">
              Inside
            </button>
          }
          label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      trigger.focus();
      expect(trigger).toHaveFocus();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // Move focus into the open popover, as a keyboard user would.
      const inside = screen.getByTestId('inside-content');
      inside.focus();
      expect(inside).toHaveFocus();

      fireEvent.keyDown(document, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('does not move focus into a popover that closed before its first frame', () => {
      // Auto-focus waits a frame for the content to mount. A popover dismissed
      // within that frame must not pull focus into its hidden content.
      const frames = new Map<number, FrameRequestCallback>();
      let nextFrame = 0;
      vi.stubGlobal(
        'requestAnimationFrame',
        (callback: FrameRequestCallback) => {
          nextFrame += 1;
          frames.set(nextFrame, callback);
          return nextFrame;
        },
      );
      vi.stubGlobal('cancelAnimationFrame', (frame: number) => {
        frames.delete(frame);
      });
      try {
        render(
          <Popover
            content={
              <button type="button" data-testid="inside-content">
                Inside
              </button>
            }
            label="Test">
            <button type="button">Open</button>
          </Popover>,
        );
        const trigger = screen.getByRole('button', {name: 'Open'});
        trigger.focus();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(document, {key: 'Escape'});
        expect(trigger).toHaveAttribute('aria-expanded', 'false');

        // The open's frame runs late, as on a busy machine.
        act(() => {
          const due = [...frames.values()];
          frames.clear();
          due.forEach(callback => callback(0));
        });
        expect(trigger).toHaveFocus();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('returns focus to the trigger on light dismiss', () => {
      render(
        <Popover
          content={
            <button type="button" data-testid="inside-content">
              Inside
            </button>
          }
          label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const trigger = screen.getByRole('button', {name: 'Open'});
      trigger.focus();

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const inside = screen.getByTestId('inside-content');
      inside.focus();
      expect(inside).toHaveFocus();

      // Simulate the browser's light dismiss for popover="auto": clicking
      // outside fires a `toggle` event with newState "closed".
      const popoverEl = document.querySelector('[popover]');
      expect(popoverEl).not.toBeNull();
      const toggleEvent = new Event('toggle');
      Object.defineProperty(toggleEvent, 'newState', {value: 'closed'});
      fireEvent(popoverEl as HTMLElement, toggleEvent);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });
  });

  describe('in a second document', () => {
    // An app can render a Popover into a same-origin iframe or a Document
    // Picture-in-Picture window through a portal. Every press and focus change
    // then happens in that document, and none of them reaches this one.
    let frame: HTMLIFrameElement;
    let secondDocument: Document;

    beforeEach(() => {
      frame = document.createElement('iframe');
      document.body.appendChild(frame);
      secondDocument = frame.contentDocument!;
      // The Popover API stand-in above, on the second window's own prototype.
      const {prototype} = secondDocument.defaultView!.HTMLElement;
      prototype.showPopover = HTMLElement.prototype.showPopover;
      prototype.hidePopover = HTMLElement.prototype.hidePopover;
    });

    afterEach(() => {
      // Unmount before the frame goes, or React removes nodes from a
      // document that no longer exists.
      cleanup();
      frame.remove();
    });

    function renderInSecondDocument(hasLightDismiss = true) {
      render(
        createPortal(
          <>
            <Popover
              label="Settings"
              hasLightDismiss={hasLightDismiss}
              content={
                <>
                  <button type="button">First</button>
                  <button type="button">Last</button>
                </>
              }>
              <button type="button">Settings</button>
            </Popover>
            <p>Outside</p>
          </>,
          secondDocument.body,
        ),
      );
      const view = within(secondDocument.body);
      const trigger = view.getByRole('button', {name: 'Settings'});
      const surface = view.getByRole('dialog', {
        name: 'Settings',
        hidden: true,
      });
      const first = view.getByRole('button', {name: 'First', hidden: true});
      return {trigger, surface, first, view};
    }

    /** Open from the trigger, as a pointer would, and wait for focus to enter. */
    async function open(trigger: HTMLElement, surface: HTMLElement) {
      trigger.focus();
      fireEvent.click(trigger, {detail: 1});
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() =>
        expect(surface.contains(secondDocument.activeElement)).toBe(true),
      );
    }

    it('focuses the first content control on open', async () => {
      const {trigger, surface, first} = renderInSecondDocument();
      await open(trigger, surface);

      expect(first).toHaveFocus();
    });

    it('wraps Tab from the last control back to the first', async () => {
      const {trigger, surface, first, view} = renderInSecondDocument();
      await open(trigger, surface);
      const last = view.getByRole('button', {
        name: 'Close popover',
        hidden: true,
      });
      last.focus();

      expect(fireEvent.keyDown(last, {key: 'Tab'})).toBe(false);
      expect(first).toHaveFocus();
    });

    it('closes on Escape through the layer stack and returns focus to the trigger', async () => {
      const {trigger, surface} = renderInSecondDocument();
      await open(trigger, surface);

      // The stack claims the press, so the browser's own close watcher does
      // not act on it a second time.
      expect(
        fireEvent.keyDown(secondDocument.activeElement!, {key: 'Escape'}),
      ).toBe(false);
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('closes on Escape when light dismiss is off', async () => {
      const {trigger, surface} = renderInSecondDocument(false);
      await open(trigger, surface);

      fireEvent.keyDown(secondDocument.activeElement!, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('returns focus to the trigger after an outside click', async () => {
      const {trigger, surface} = renderInSecondDocument();
      await open(trigger, surface);

      // The press on non-focusable content blurs focus to the body, then the
      // browser's light dismiss closes the popover with a `toggle` event.
      (secondDocument.activeElement as HTMLElement).blur();
      expect(secondDocument.activeElement).toBe(secondDocument.body);
      const toggle = new secondDocument.defaultView!.Event('toggle');
      Object.defineProperty(toggle, 'newState', {value: 'closed'});
      fireEvent(secondDocument.querySelector('[popover]')!, toggle);

      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
    });

    it('keeps a Dialog and the Popover opened inside it in one order', () => {
      // jsdom has no modal <dialog>; stand in for it on the second window.
      const {prototype: dialogPrototype} =
        secondDocument.defaultView!.HTMLDialogElement;
      dialogPrototype.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
      dialogPrototype.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
      const onOpenChange = vi.fn();
      render(
        createPortal(
          <Dialog
            isOpen={true}
            onOpenChange={onOpenChange}
            purpose="info"
            aria-label="Host">
            <Popover
              label="Tip"
              content={<button type="button">Inside</button>}>
              <button type="button">Open tip</button>
            </Popover>
          </Dialog>,
          secondDocument.body,
        ),
      );
      const trigger = within(secondDocument.body).getByRole('button', {
        name: 'Open tip',
        hidden: true,
      });
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      // A press in this document reaches neither layer of the other one.
      fireEvent.keyDown(document, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(onOpenChange).not.toHaveBeenCalled();

      // The Dialog declines a close request while the Popover is above it.
      const closeRequest = new secondDocument.defaultView!.Event('cancel', {
        cancelable: true,
      });
      fireEvent(secondDocument.querySelector('dialog')!, closeRequest);
      expect(onOpenChange).not.toHaveBeenCalled();

      // In its own document, Escape closes the Popover, then the Dialog.
      fireEvent.keyDown(secondDocument, {key: 'Escape'});
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(onOpenChange).not.toHaveBeenCalled();
      fireEvent.keyDown(secondDocument, {key: 'Escape'});
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    });
  });

  describe('surface padding', () => {
    // StyleX's dev runtime names the style object a class came from
    // ("padding__paddingStyles.3"), which is the padding rung the surface
    // was handed.
    function paddingRungOf(surface: Element | null): string | null {
      const match = surface?.className.match(
        /padding__paddingStyles\.([\d.]+)/,
      );
      return match ? match[1] : null;
    }

    it('paints the spacing-3 rung by default, unchanged', () => {
      render(
        <Popover isOpen content={<span>Content</span>} label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const surface = document.querySelector('.astryx-popover');
      expect(paddingRungOf(surface)).toBe('3');
      expect(surface?.className).not.toContain('contentPadding');
    });

    it('paints no padding on a flush surface (padding={0})', () => {
      render(
        <Popover
          isOpen
          padding={0}
          content={<span data-testid="content">Content</span>}
          label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const surface = document.querySelector('.astryx-popover');
      // The rung lands on the painted surface itself, not a wrapper inside
      // it, so the content reaches the surface edge.
      expect(surface).toContainElement(screen.getByTestId('content'));
      expect(paddingRungOf(surface)).toBe('0');
    });

    it('paints the requested rung', () => {
      render(
        <Popover isOpen padding={4} content={<span>Content</span>} label="Test">
          <button type="button">Open</button>
        </Popover>,
      );
      const surface = document.querySelector('.astryx-popover');
      expect(paddingRungOf(surface)).toBe('4');
    });

    it('lets a direct usePopover consumer opt into a rung, and paints none by default', () => {
      function Direct({padding}: {padding?: 0 | 2}) {
        const popover = usePopover({dialogLabel: 'Direct', padding});
        return (
          <>
            <button
              ref={popover.triggerRef}
              type="button"
              onClick={popover.toggle}
              {...popover.triggerProps}>
              Open
            </button>
            {popover.render(<span>Direct content</span>)}
          </>
        );
      }
      const {unmount} = render(<Direct />);
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      expect(paddingRungOf(document.querySelector('.astryx-popover'))).toBe(
        null,
      );
      unmount();
      render(<Direct padding={2} />);
      fireEvent.click(screen.getByRole('button', {name: 'Open'}));
      expect(paddingRungOf(document.querySelector('.astryx-popover'))).toBe(
        '2',
      );
    });
  });

  it('puts the theme target and styling escape hatches on the popup surface', () => {
    render(
      <Popover
        isOpen
        content={<span data-testid="content">Popover content</span>}
        label="Test popover"
        data-testid="popover"
        className="consumer-popover"
        style={{padding: 0}}>
        <button type="button">Open</button>
      </Popover>,
    );

    const target = document.querySelector('.astryx-popover');
    expect(target).not.toBeNull();
    // The surface paints background, radius and elevation; a target on the
    // content box inside it would style a box that paints nothing.
    expect(target).toHaveClass('astryx-popover');
    expect(target).not.toHaveClass('astryx-popover-surface');
    expect(target).toHaveClass('consumer-popover');
    expect(target).toHaveStyle({padding: '0'});
    expect(target).toContainElement(screen.getByTestId('content'));
    expect(screen.getByTestId('popover')).not.toHaveClass('consumer-popover');
  });
});
