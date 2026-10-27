// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastViewport.test.tsx
 * @input Uses vitest, @testing-library/react, ToastViewport + useToast
 * @output Unit tests for toast keyboard reach, focus management, and
 *   screen-reader announcements
 * @position Testing; validates ToastViewport.tsx + Toast.tsx focus behavior and
 *   the announce-at-dispatch flow through the singleton live regions
 *
 * SYNC: When ToastViewport.tsx / Toast.tsx focus handling or the toast
 *   announcement flow changes, update these tests
 */

import {
  describe,
  it,
  expect,
  expectTypeOf,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  cleanup,
  createEvent,
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
} from '@testing-library/react';
import React, {useRef} from 'react';
import {readFileSync} from 'node:fs';
import {type AnnounceFn, __resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {Button} from '../Button';
import {Toast, type ToastProps} from './Toast';
import {getGestureHost} from '../gestures/GestureHost';
import {toast as toastMotion} from '../motion/uikit/toast';
import {ToastViewport} from './ToastViewport';
import {retractTarget} from './toastSwipe';
import {useToast} from './useToast';
import type {ToastOptions, ToastPresentation} from './types';

// Spy on the announcement sink so tests can prove a toast is announced exactly
// once. The mock wraps the real useAnnounce, so the singleton live regions are
// still populated (the region-content assertions below depend on it) while
// every call is also recorded on announceSpy.
const {announceSpy} = vi.hoisted(() => ({announceSpy: vi.fn()}));
vi.mock('../hooks/useAnnounce', async importActual => {
  const actual = await importActual<{
    useAnnounce: () => AnnounceFn;
    __resetLiveRegionsForTest: () => void;
  }>();
  const {useCallback} = await import('react');
  return {
    ...actual,
    useAnnounce: (): AnnounceFn => {
      const realAnnounce = actual.useAnnounce();
      return useCallback<AnnounceFn>(
        (message, politeness) => {
          announceSpy(message, politeness);
          realAnnounce(message, politeness);
        },
        [realAnnounce],
      );
    },
  };
});

// Popover API is not implemented in jsdom.
beforeAll(() => {
  if (typeof HTMLElement.prototype.showPopover === 'undefined') {
    HTMLElement.prototype.showPopover = vi.fn();
    HTMLElement.prototype.hidePopover = vi.fn();
  }
  if (typeof HTMLElement.prototype.setPointerCapture === 'undefined') {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

// Toast text is mirrored into the singleton live regions, which outlive each
// render — reset them so text from one test never leaks into the next.
afterEach(() => {
  __resetLiveRegionsForTest();
  announceSpy.mockClear();
  vi.unstubAllGlobals();
});

// Module-level constant default props (avoids unstable-default-props lint).
const EMPTY_OPTIONS: ToastOptions = {body: 'placeholder'};

function ShowToastButton({
  options = EMPTY_OPTIONS,
  triggerLabel = 'Trigger',
}: {
  options?: ToastOptions;
  triggerLabel?: string;
}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(options)}>
      {triggerLabel}
    </button>
  );
}

const INFO_A: ToastOptions = {body: 'Toast A'};
const INFO_B: ToastOptions = {body: 'Toast B'};
const AUTO_TOAST: ToastOptions = {body: 'Auto toast', autoHideDuration: 3000};
const SWIPE_TOAST: ToastOptions = {body: 'Swipe toast', isAutoHide: false};
const LONG_TOAST_BODY =
  'Arbeitsbereichsbenachrichtigungseinstellungen gespeichert';

function renderViewport(children: React.ReactNode) {
  return render(<ToastViewport isTopLayer={false}>{children}</ToastViewport>);
}

function getToastWrapperByText(text: string): HTMLElement {
  const visualToast = screen.getByText(text).closest('[data-type]');
  if (!(visualToast instanceof HTMLElement)) {
    throw new Error(`Toast visual for ${text} not found`);
  }
  const wrapper = visualToast.closest('[data-toast-id]');
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error(`Toast wrapper for ${text} not found`);
  }
  return wrapper;
}

function getVisualToastByText(text: string): HTMLElement {
  const visualToast = screen.getByText(text).closest('[data-type]');
  if (!(visualToast instanceof HTMLElement)) {
    throw new Error(`Toast visual for ${text} not found`);
  }
  return visualToast;
}

// Fire the transition-end that ToastViewport listens for to unmount an
// exiting toast (jsdom does not run CSS transitions).
function completeExit(toastId: string) {
  const node = document.querySelector<HTMLElement>(
    `[data-toast-id="${toastId}"]`,
  );
  if (node) {
    fireEvent.transitionEnd(node, {propertyName: 'grid-template-rows'});
  }
}

describe('Toast responsive layout', () => {
  it('keeps placement on ToastViewport rather than exposing a non-positioning Toast prop', () => {
    expectTypeOf<ToastProps>().not.toHaveProperty('position');
    expectTypeOf<React.ComponentProps<typeof ToastViewport>>().toHaveProperty(
      'position',
    );
  });

  it('keeps real trailing controls on the first line while long body text wraps', () => {
    renderViewport(
      <ShowToastButton
        options={{
          body: LONG_TOAST_BODY,
          isAutoHide: false,
          endContent: (
            <Button
              label="Änderungen wiederherstellen"
              variant="secondary"
              size="lg"
            />
          ),
        }}
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });

    const viewport = screen.getByRole('region', {name: 'Notifications'});
    const body = within(viewport).getByText(LONG_TOAST_BODY);
    const toast = body.closest('[data-type]') as HTMLElement;
    const mediaWrapper = toast.firstElementChild as HTMLElement;
    const layoutRow = mediaWrapper.firstElementChild as HTMLElement;
    const endArea = body.nextElementSibling as HTMLElement;
    const actionControl = endArea.firstElementChild as HTMLElement;
    const dismissControl = within(endArea).getByRole('button', {
      name: 'Dismiss notification',
    });

    expect(getComputedStyle(layoutRow).flexWrap).toBe('nowrap');
    expect(getComputedStyle(layoutRow).alignItems).toBe('flex-start');
    expect(getComputedStyle(body).minWidth).toBe('0');
    expect(getComputedStyle(body).overflowWrap).toBe('anywhere');
    expect(getComputedStyle(endArea).alignItems).toBe('center');
    expect(getComputedStyle(endArea).height).toBe(
      'calc(var(--text-body-size) * var(--text-body-leading))',
    );
    expect(getComputedStyle(actionControl).height).toBe(
      'var(--size-element-lg)',
    );
    expect(getComputedStyle(dismissControl).height).toBe(
      'var(--size-element-sm)',
    );
  });

  it('uses the viewport as the inline constraint for edge placements', () => {
    renderViewport(<ShowToastButton options={INFO_A} />);
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });

    const viewport = screen.getByRole('region', {name: 'Notifications'});

    const style = getComputedStyle(viewport);
    const viewportSource = readFileSync(
      'packages/core/src/Toast/ToastViewport.tsx',
      'utf8',
    );
    expect(viewportSource).not.toContain('100lvh - 100dvh');
    expect(style.boxSizing).toBe('border-box');
    expect(style.width).not.toBe('100%');
    expect(style.paddingInlineEnd).not.toBe('0px');
    // The viewport sits at the app-declared inset (spec:AST-059 FR6), 0px
    // unless LayerProvider declares a bar on that edge.
    expect(style.insetInlineStart).toBe(
      'var(--astryx-layer-inset-inline-start,0px)',
    );
    expect(style.insetInlineEnd).toBe(
      'var(--astryx-layer-inset-inline-end,0px)',
    );
  });

  it('preserves custom start and end insets in LTR and RTL without forcing full width', () => {
    const renderWithDirection = (direction: 'ltr' | 'rtl') =>
      render(
        <div dir={direction}>
          <ToastViewport
            isTopLayer={false}
            inset={{bottom: 24, start: 24, end: 40}}>
            <ShowToastButton options={INFO_A} />
          </ToastViewport>
        </div>,
      );

    renderWithDirection('ltr');
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    let viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(viewport.style.bottom).toBe('24px');
    expect(viewport.style.insetInlineStart).toBe('24px');
    expect(viewport.style.insetInlineEnd).toBe('40px');
    expect(getComputedStyle(viewport).width).not.toBe('100%');

    cleanup();
    renderWithDirection('rtl');
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(viewport.style.bottom).toBe('24px');
    expect(viewport.style.insetInlineStart).toBe('24px');
    expect(viewport.style.insetInlineEnd).toBe('40px');
    expect(getComputedStyle(viewport).width).not.toBe('100%');
  });
});

describe('ToastViewport placement', () => {
  function renderPlacement({
    position,
    triggerLabel = 'Trigger',
    body = 'Placed',
  }: {
    position?: React.ComponentProps<typeof ToastViewport>['position'];
    triggerLabel?: string;
    body?: string;
  } = {}) {
    const result = render(
      <ToastViewport isTopLayer={false} position={position}>
        <ShowToastButton
          options={{body, isAutoHide: false}}
          triggerLabel={triggerLabel}
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText(triggerLabel));
    });
    return {
      ...result,
      viewport: screen.getByRole('region', {name: 'Notifications'}),
    };
  }

  it('defaults to bottomEnd with an end-aligned full-inline viewport', () => {
    const {viewport} = renderPlacement();

    expect(getComputedStyle(viewport).bottom).toBe(
      'var(--astryx-layer-inset-block-end,0px)',
    );
    expect(getComputedStyle(viewport).alignItems).toBe('flex-end');
    expect(getComputedStyle(viewport).width).not.toBe('100%');
  });

  // The viewport is positioned by spanning the inline axis and aligning within
  // itself, which only works if the box actually spans. `popover` makes that
  // conditional: the UA stylesheet gives every popover `width: fit-content`,
  // and a shrink-wrapped box cannot honour both inset edges — it resolves
  // against the start edge, and an end-aligned toast lands on the LEFT
  // (measured in Chromium at 1200px: a 438px box at x=0, toast at x=19).
  //
  // jsdom resolves no UA popover styles and no cascade, so it cannot reproduce
  // that. What it CAN hold is the reset itself: the declaration is what stops
  // the UA rule applying, so its absence is the regression. The rendered
  // behaviour is covered by the placement matrix in the PR.
  it('resets the UA popover width so the viewport can span the inline axis', () => {
    const {viewport} = renderPlacement();

    expect(getComputedStyle(viewport).width).toBe('auto');
  });

  it('maps explicit top and bottom placements to their configured edge', () => {
    const top = renderPlacement({position: 'topEnd'});
    expect(getComputedStyle(top.viewport).top).toBe(
      'var(--astryx-layer-inset-block-start,0px)',
    );
    expect(getComputedStyle(top.viewport).alignItems).toBe('flex-end');
    expect(getComputedStyle(top.viewport).flexDirection).toBe('column-reverse');
    top.unmount();

    const bottom = renderPlacement({
      position: 'bottomStart',
      triggerLabel: 'Bottom trigger',
      body: 'Bottom start',
    });
    expect(getComputedStyle(bottom.viewport).bottom).toBe(
      'var(--astryx-layer-inset-block-end,0px)',
    );
    expect(getComputedStyle(bottom.viewport).alignItems).toBe('flex-start');
    bottom.unmount();
  });
});

it('keeps newest toasts nearest the configured edge in wide stacks', () => {
  render(
    <>
      <ToastViewport isTopLayer={false} position="bottomEnd" maxVisible={3}>
        <ShowToastButton
          options={{body: 'Bottom first', isAutoHide: false}}
          triggerLabel="Bottom first"
        />
        <ShowToastButton
          options={{body: 'Bottom second', isAutoHide: false}}
          triggerLabel="Bottom second"
        />
        <ShowToastButton
          options={{body: 'Bottom third', isAutoHide: false}}
          triggerLabel="Bottom third"
        />
      </ToastViewport>
      <ToastViewport isTopLayer={false} position="topEnd" maxVisible={3}>
        <ShowToastButton
          options={{body: 'Top first', isAutoHide: false}}
          triggerLabel="Top first"
        />
        <ShowToastButton
          options={{body: 'Top second', isAutoHide: false}}
          triggerLabel="Top second"
        />
        <ShowToastButton
          options={{body: 'Top third', isAutoHide: false}}
          triggerLabel="Top third"
        />
      </ToastViewport>
    </>,
  );
  for (const label of [
    'Bottom first',
    'Bottom second',
    'Bottom third',
    'Top first',
    'Top second',
    'Top third',
  ]) {
    act(() => {
      fireEvent.click(screen.getByText(label));
    });
  }

  const [bottom, top] = screen.getAllByRole('region', {
    name: 'Notifications',
  });
  expect(getComputedStyle(bottom).flexDirection).toBe('column');
  expect(
    within(bottom)
      .getAllByText(/Bottom/)
      .map(el => el.textContent),
  ).toEqual(['Bottom first', 'Bottom second', 'Bottom third']);
  expect(getComputedStyle(top).flexDirection).toBe('column-reverse');
  expect(
    within(top)
      .getAllByText(/Top/)
      .map(el => el.textContent),
  ).toEqual(['Top first', 'Top second', 'Top third']);
});

describe('ToastViewport visible limit', () => {
  function renderMany(maxVisible?: number) {
    render(
      <ToastViewport isTopLayer={false} maxVisible={maxVisible}>
        <ShowToastButton
          options={{body: 'One', isAutoHide: false}}
          triggerLabel="One"
        />
        <ShowToastButton
          options={{body: 'Two', isAutoHide: false}}
          triggerLabel="Two"
        />
        <ShowToastButton
          options={{body: 'Three', isAutoHide: false}}
          triggerLabel="Three"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('One'));
      fireEvent.click(screen.getByText('Two'));
      fireEvent.click(screen.getByText('Three'));
    });
    return screen.getByRole('region', {name: 'Notifications'});
  }

  it('keeps the five-toast default and supports an explicit one-visible cap', () => {
    let viewport = renderMany();
    expect(
      within(viewport).getAllByRole('button', {name: 'Dismiss notification'}),
    ).toHaveLength(3);

    cleanup();
    viewport = renderMany(1);
    expect(
      within(viewport).getAllByRole('button', {name: 'Dismiss notification'}),
    ).toHaveLength(1);
    expect(within(viewport).getByText('Three')).toBeInTheDocument();
  });
});

describe('ToastViewport keyboard reach + focus', () => {
  it('F6 moves focus into the newest toast', () => {
    renderViewport(
      <ShowToastButton options={INFO_A} triggerLabel="Trigger A" />,
    );
    const trigger = screen.getByText('Trigger A');
    trigger.focus();
    act(() => {
      fireEvent.click(trigger);
    });

    expect(screen.getByText('Toast A')).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);

    act(() => {
      fireEvent.keyDown(document, {key: 'F6'});
    });

    // Focus lands on the dismiss button of the newest toast.
    const dismiss = screen.getByRole('button', {name: 'Dismiss notification'});
    expect(document.activeElement).toBe(dismiss);
  });

  it('dismissing a focused toast moves focus to a remaining toast, not body', () => {
    renderViewport(
      <>
        <ShowToastButton options={INFO_A} triggerLabel="Trigger A" />
        <ShowToastButton options={INFO_B} triggerLabel="Trigger B" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger A'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Trigger B'));
    });

    const dismissButtons = screen.getAllByRole('button', {
      name: 'Dismiss notification',
    });
    expect(dismissButtons).toHaveLength(2);

    // Focus the first toast's dismiss button, then dismiss it.
    const firstToast = document.querySelectorAll('[data-toast-id]')[0];
    const firstToastId = firstToast.getAttribute('data-toast-id')!;
    const firstDismiss = firstToast.querySelector<HTMLElement>(
      'button[aria-label="Dismiss notification"]',
    )!;
    firstDismiss.focus();
    expect(document.activeElement).toBe(firstDismiss);

    act(() => {
      fireEvent.click(firstDismiss);
    });
    act(() => {
      completeExit(firstToastId);
    });

    // Focus must NOT drop to <body>; it moves to the remaining toast.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Dismiss notification',
    );
  });

  it('dismissing the last focused toast restores the previously-focused element', () => {
    renderViewport(
      <ShowToastButton options={INFO_A} triggerLabel="Trigger A" />,
    );
    const trigger = screen.getByText('Trigger A');
    trigger.focus();
    act(() => {
      fireEvent.click(trigger);
    });

    // F6 into the toast, remembering the trigger as the prior focus.
    act(() => {
      fireEvent.keyDown(document, {key: 'F6'});
    });
    const dismiss = screen.getByRole('button', {name: 'Dismiss notification'});
    expect(document.activeElement).toBe(dismiss);

    const toastId = document
      .querySelector('[data-toast-id]')!
      .getAttribute('data-toast-id')!;

    act(() => {
      fireEvent.click(dismiss);
    });
    act(() => {
      completeExit(toastId);
    });

    // No toasts left — focus returns to the element focused before F6.
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Toast blur timer pause', () => {
  it('pauses the auto-hide timer while the window is blurred', () => {
    vi.useFakeTimers();
    try {
      renderViewport(
        <ShowToastButton options={AUTO_TOAST} triggerLabel="Trigger Auto" />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Trigger Auto'));
      });
      // Scope to the viewport: the toast text is also mirrored into the
      // singleton live region, which lives outside the notifications region.
      const viewport = screen.getByRole('region', {name: 'Notifications'});
      expect(within(viewport).getByText('Auto toast')).toBeInTheDocument();

      // Window loses focus — timer should pause.
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // Still present because the timer was paused while blurred.
      expect(within(viewport).getByText('Auto toast')).toBeInTheDocument();

      // Window regains focus — timer resumes and the toast dismisses.
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      const toastId = document
        .querySelector('[data-toast-id]')
        ?.getAttribute('data-toast-id');
      if (toastId) {
        act(() => {
          completeExit(toastId);
        });
      }
      expect(
        within(viewport).queryByText('Auto toast'),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Toast native motion contract', () => {
  function renderMotionToast(
    position: React.ComponentProps<typeof ToastViewport>['position'],
    body = `Motion ${position}`,
    wrapper: (children: React.ReactNode) => React.ReactElement = children => (
      <>{children}</>
    ),
  ) {
    const result = render(
      wrapper(
        <ToastViewport isTopLayer={false} position={position} maxVisible={3}>
          <ShowToastButton
            options={{body, isAutoHide: false}}
            triggerLabel={`Show ${position}`}
          />
        </ToastViewport>,
      ),
    );
    act(() => {
      fireEvent.click(screen.getByText(`Show ${position}`));
    });
    return {
      ...result,
      visualToast: getVisualToastByText(body),
      wrapper: getToastWrapperByText(body),
    };
  }

  const normalizeCssList = (value: string): string =>
    value
      .split(',')
      .map(part => part.trim())
      .join(', ');

  const normalizeCssFunction = (value: string): string =>
    value.replace(/,\s*/g, ', ');

  it('uses tokenized transform and wrapper timing, with reduced motion kept eventful', () => {
    const {visualToast, wrapper} = renderMotionToast('bottomEnd');
    const toastStyle = getComputedStyle(visualToast);
    const wrapperStyle = getComputedStyle(wrapper);

    expect(normalizeCssFunction(toastStyle.transform)).toBe(
      'translateY(var(--_toast-swipe-y, 0px)) scale(var(--_toast-swipe-scale, 1))',
    );
    expect(normalizeCssList(toastStyle.transitionProperty)).toBe(
      'opacity, transform',
    );
    expect(toastStyle.transitionDuration).toBe('var(--duration-fast)');
    expect(toastStyle.transitionTimingFunction).toBe('var(--ease-standard)');
    expect(normalizeCssList(wrapperStyle.transitionProperty)).toBe(
      'grid-template-rows, padding',
    );
    expect(wrapperStyle.transitionDuration).toBe('var(--duration-fast)');
    expect(wrapperStyle.transitionTimingFunction).toBe('var(--ease-standard)');
    expect(wrapperStyle.width).toBe('100%');
    expect(wrapperStyle.maxWidth).toBe('400px');
    expect(wrapperStyle.minWidth).toBe('0');
    expect(
      getComputedStyle(wrapper.firstElementChild as HTMLElement).minHeight,
    ).toBe('0');
    expect(
      getComputedStyle(wrapper.firstElementChild as HTMLElement).overflow,
    ).toBe('hidden');
  });

  it('releases the shadow clip only while the toast is settled', () => {
    const {wrapper} = renderMotionToast('bottomEnd', 'Shadow lifecycle');
    const inner = wrapper.firstElementChild as HTMLElement;

    // Entry starts with main's original clip boundary.
    expect(getComputedStyle(inner).overflow).toBe('hidden');

    act(() => {
      fireEvent.transitionEnd(wrapper, {propertyName: 'grid-template-rows'});
    });
    expect(getComputedStyle(inner).overflow).toBe('visible');

    act(() => {
      fireEvent.click(
        within(wrapper).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // Dismissal restores main's original clip boundary synchronously. The
    // wrapper keeps its normal hit boundary, so a second click while the toast
    // is still visible is absorbed by the toast rather than falling through
    // to an obscured control underneath.
    expect(getComputedStyle(inner).overflow).toBe('hidden');
    expect(getComputedStyle(wrapper).pointerEvents).toBe('auto');
  });

  it('settles a toast that replaced another through uniqueID', () => {
    // An overwrite unmounts the replaced row and mounts a new one with a new
    // id, so the new row runs its own entry transition and has to release the
    // clip on its own. The replaced id is dropped at the same time: nothing
    // dismisses it, so neither removeToast nor handleExited would ever prune
    // it, and a viewport overwriting one uniqueID on a schedule would collect
    // a dead id per update for as long as it lives.
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd" maxVisible={3}>
        <ShowToastButton
          options={{uniqueID: 'save', body: 'Saving changes'}}
          triggerLabel="Show v1"
        />
        <ShowToastButton
          options={{uniqueID: 'save', body: 'Changes saved'}}
          triggerLabel="Show v2"
        />
      </ToastViewport>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Show v1'));
    });
    const first = getToastWrapperByText('Saving changes');
    const firstId = first.getAttribute('data-toast-id');
    act(() => {
      fireEvent.transitionEnd(first, {propertyName: 'grid-template-rows'});
    });
    expect(
      getComputedStyle(first.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');

    act(() => {
      fireEvent.click(screen.getByText('Show v2'));
    });
    const second = getToastWrapperByText('Changes saved');
    // A different row, so the settled state of the one it replaced says
    // nothing about it: it starts clipped.
    expect(second.getAttribute('data-toast-id')).not.toBe(firstId);
    expect(
      getComputedStyle(second.firstElementChild as HTMLElement).overflow,
    ).toBe('hidden');

    act(() => {
      fireEvent.transitionEnd(second, {propertyName: 'grid-template-rows'});
    });
    expect(
      getComputedStyle(second.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');
  });

  it('drops settled state when a toast is evicted and later resurfaces', () => {
    // A toast beyond `maxVisible` unmounts without ever being dismissed, so
    // neither removeToast nor handleExited runs for it. When the stack drains
    // and it resurfaces, it mounts a fresh row that has to run its own entry
    // transition from `@starting-style` — a settled id left over from its
    // previous life would release the clip immediately, painting the card's
    // shadow (and taking pointer input) outside the row that is still opening.
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd" maxVisible={1}>
        <ShowToastButton
          options={{body: 'First', isAutoHide: false}}
          triggerLabel="Show first"
        />
        <ShowToastButton
          options={{body: 'Second', isAutoHide: false}}
          triggerLabel="Show second"
        />
      </ToastViewport>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Show first'));
    });
    const first = getToastWrapperByText('First');
    act(() => {
      fireEvent.transitionEnd(first, {propertyName: 'grid-template-rows'});
    });
    expect(
      getComputedStyle(first.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');

    // Evicted: still in the list, no longer rendered.
    act(() => {
      fireEvent.click(screen.getByText('Show second'));
    });
    expect(screen.queryByText('First')).not.toBeInTheDocument();

    // Drain the stack so it comes back.
    const second = getToastWrapperByText('Second');
    act(() => {
      fireEvent.transitionEnd(second, {propertyName: 'grid-template-rows'});
      fireEvent.click(
        within(second).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      fireEvent.transitionEnd(second, {propertyName: 'grid-template-rows'});
    });

    const resurfaced = getToastWrapperByText('First');
    expect(
      getComputedStyle(resurfaced.firstElementChild as HTMLElement).overflow,
    ).toBe('hidden');

    // And it settles again on its own transition, rather than being stuck.
    act(() => {
      fireEvent.transitionEnd(resurfaced, {propertyName: 'grid-template-rows'});
    });
    expect(
      getComputedStyle(resurfaced.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');
  });

  it('ignores a grid-template-rows transition bubbling from a descendant', () => {
    // `grid-template-rows` is not private to the wrapper: any descendant may
    // animate its own grid, and transitionend bubbles. Reading a descendant's
    // event as the row's own releases the clip before the row has opened, and
    // during exit it unmounts the toast mid-collapse.
    const {wrapper} = renderMotionToast('bottomEnd', 'Bubbled transition');
    const inner = wrapper.firstElementChild as HTMLElement;
    expect(getComputedStyle(inner).overflow).toBe('hidden');

    act(() => {
      fireEvent.transitionEnd(inner, {propertyName: 'grid-template-rows'});
    });
    expect(getComputedStyle(inner).overflow).toBe('hidden');

    // The wrapper's own transition still settles it.
    act(() => {
      fireEvent.transitionEnd(wrapper, {propertyName: 'grid-template-rows'});
    });
    expect(getComputedStyle(inner).overflow).toBe('visible');

    // Same guard on the exit path: a descendant's event must not cut the
    // collapse short and unmount the toast early.
    act(() => {
      fireEvent.click(
        within(wrapper).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      fireEvent.transitionEnd(inner, {propertyName: 'grid-template-rows'});
    });
    expect(screen.getByText('Bubbled transition')).toBeInTheDocument();

    act(() => {
      fireEvent.transitionEnd(wrapper, {propertyName: 'grid-template-rows'});
    });
    expect(screen.queryByText('Bubbled transition')).not.toBeInTheDocument();
  });

  it('keeps reduced motion transitions eventful for exit cleanup', () => {
    const toastSource = readFileSync(
      'packages/core/src/Toast/Toast.tsx',
      'utf8',
    );
    const viewportSource = readFileSync(
      'packages/core/src/Toast/ToastViewport.tsx',
      'utf8',
    );

    // Toast cross-fades on a touch screen (DR2) and changes at once with
    // any other pointer (DR3); nothing waits on its own transitionend. The
    // row's collapse, which the viewport waits for, stays eventful.
    expect(toastSource).toContain(
      "'@media (prefers-reduced-motion: reduce) and (pointer: coarse)':\n        reducedMotionFadeConsts.duration",
    );
    expect(viewportSource).toContain(
      "'@media (prefers-reduced-motion: reduce)': '0.01ms'",
    );
  });

  it('slides from the top or bottom edge without adding corner or scale motion', () => {
    const bottom = renderMotionToast('bottomEnd');
    expect(
      getComputedStyle(bottom.wrapper).getPropertyValue('--_toast-slide-y'),
    ).toBe('var(--spacing-2)');
    bottom.unmount();

    const top = renderMotionToast('topStart');
    expect(
      getComputedStyle(top.wrapper).getPropertyValue('--_toast-slide-y'),
    ).toBe('calc(-1 * var(--spacing-2))');
    top.unmount();

    const toastSource = readFileSync(
      'packages/core/src/Toast/Toast.tsx',
      'utf8',
    );
    expect(toastSource).not.toContain('scale(0.98)');
    expect(toastSource).not.toContain('transformOrigin');
  });

  it('uses an 8px inter-Toast gap without adding space at the viewport edge', () => {
    renderViewport(
      <>
        <ShowToastButton options={INFO_A} triggerLabel="Show A" />
        <ShowToastButton options={INFO_B} triggerLabel="Show B" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show A'));
      fireEvent.click(screen.getByText('Show B'));
    });
    const viewport = screen.getByRole('region', {name: 'Notifications'});
    const wrappers = viewport.querySelectorAll<HTMLElement>('[data-toast-id]');

    expect(getComputedStyle(wrappers[0]).paddingBottom).toBe(
      'var(--spacing-2)',
    );
    expect(getComputedStyle(wrappers[1]).paddingBottom).toBe('0px');
    expect(
      normalizeCssFunction(getComputedStyle(viewport).paddingInlineEnd),
    ).toBe('max(var(--spacing-4), env(safe-area-inset-right, 0px))');

    cleanup();
    render(
      <ToastViewport isTopLayer={false} position="topEnd">
        <ShowToastButton options={INFO_A} triggerLabel="Top A" />
        <ShowToastButton options={INFO_B} triggerLabel="Top B" />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Top A'));
      fireEvent.click(screen.getByText('Top B'));
    });
    const topWrappers = screen
      .getByRole('region', {name: 'Notifications'})
      .querySelectorAll<HTMLElement>('[data-toast-id]');
    expect(getComputedStyle(topWrappers[0]).paddingBottom).toBe('0px');
    expect(getComputedStyle(topWrappers[1]).paddingBottom).toBe(
      'var(--spacing-2)',
    );
  });

  it('collapses a dismissed Toast before unmounting it', () => {
    const {wrapper} = renderMotionToast('bottomEnd');
    const id = wrapper.getAttribute('data-toast-id')!;
    act(() => {
      fireEvent.click(
        within(wrapper).getByRole('button', {name: 'Dismiss notification'}),
      );
    });

    expect(wrapper).toBeInTheDocument();
    expect(getComputedStyle(wrapper).gridTemplateRows).toBe('0fr');
    expect(getComputedStyle(wrapper).paddingBottom).toBe('0px');
    act(() => {
      completeExit(id);
    });
    expect(document.querySelector(`[data-toast-id="${id}"]`)).toBeNull();
  });
});

// Everywhere but iOS (Android, other touch screens, a pen on a laptop),
// Toast keeps its own swipe.
describe('Toast swipe dismissal', () => {
  function renderSwipeToast(
    options: ToastOptions = SWIPE_TOAST,
    position: React.ComponentProps<
      typeof ToastViewport
    >['position'] = 'bottomEnd',
    bodyText = 'Swipe toast',
    surfaceHeight = 80,
  ) {
    const onHide = vi.fn();
    const result = render(
      <ToastViewport isTopLayer={false} position={position}>
        <ShowToastButton options={{...options, onHide}} />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText(bodyText)
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: surfaceHeight,
      top: 0,
      right: 400,
      bottom: surfaceHeight,
      left: 0,
      toJSON: () => ({}),
    });
    return {...result, visualToast, onHide};
  }

  it('dismisses on a pen swipe toward the configured block edge past the threshold', () => {
    const {visualToast, onHide} = renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
    });

    expect(visualToast.setPointerCapture).toHaveBeenCalledWith(7);
    expect(visualToast.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(visualToast.style.getPropertyValue('--_toast-swipe-exit-y')).toBe(
      '120%',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');
    expect(getComputedStyle(visualToast).transform).not.toContain('translateX');
  });

  it('dismisses a fast flick below the distance threshold', () => {
    // 60 px in 20 ms, in two moves, by the events' own timestamps (the event
    // clock is Date.now in jsdom; the shared release filter reads a release
    // from two moved samples).
    let time = 1_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => time);
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'bottomEnd',
        'Swipe toast',
        400,
      );

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 8,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        time += 10;
        fireEvent.pointerMove(visualToast, {
          pointerId: 8,
          pointerType: 'pen',
          clientX: 0,
          clientY: 30,
        });
        time += 10;
        fireEvent.pointerMove(visualToast, {
          pointerId: 8,
          pointerType: 'pen',
          clientX: 0,
          clientY: 60,
        });
        fireEvent.pointerUp(visualToast, {
          pointerId: 8,
          pointerType: 'pen',
          clientX: 0,
          clientY: 60,
        });
      });

      expect(onHide).toHaveBeenCalledWith('manual');
      expect(visualToast.style.getPropertyValue('--_toast-swipe-exit-y')).toBe(
        '120%',
      );
    } finally {
      now.mockRestore();
    }
  });

  // A one-line toast is 56 px tall: 40% of it is below the 48 px distance
  // floor, so a short swipe on it can only be dismissed as a flick.
  function mockClock(start = 1_000) {
    let time = start;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => time);
    return {
      advance(ms: number) {
        time += ms;
      },
      restore() {
        spy.mockRestore();
      },
    };
  }

  it('dismisses a quick pen flick on a one-line toast', () => {
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'bottomEnd',
        'Swipe toast',
        56,
      );

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 9,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
      });
      clock.advance(15);
      act(() => {
        fireEvent.pointerMove(visualToast, {
          pointerId: 9,
          pointerType: 'pen',
          clientX: 0,
          clientY: 20,
        });
      });
      clock.advance(15);
      act(() => {
        fireEvent.pointerMove(visualToast, {
          pointerId: 9,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        fireEvent.pointerUp(visualToast, {
          pointerId: 9,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
      });

      expect(onHide).toHaveBeenCalledWith('manual');
      expect(onHide).toHaveBeenCalledTimes(1);
    } finally {
      clock.restore();
    }
  });

  it('dismisses a quick touch flick on a one-line toast at the top', () => {
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'topEnd',
        'Swipe toast',
        56,
      );
      const touchEvent = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        clientY: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const touch = {identifier: 32, clientX: 10, clientY};
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [touch],
        });
        Object.defineProperty(event, 'changedTouches', {value: [touch]});
        visualToast.dispatchEvent(event);
        return event;
      };

      act(() => {
        touchEvent('touchstart', 100);
      });
      clock.advance(15);
      let move: Event;
      act(() => {
        move = touchEvent('touchmove', 80);
      });
      clock.advance(15);
      act(() => {
        touchEvent('touchmove', 60);
        touchEvent('touchend', 60);
      });

      expect(move!.defaultPrevented).toBe(true);
      expect(onHide).toHaveBeenCalledWith('manual');
      expect(onHide).toHaveBeenCalledTimes(1);
    } finally {
      clock.restore();
    }
  });

  it('times a flick by its input events, not by when the handlers run', () => {
    // Browsers deliver moves on the next frame, so handlers can run well
    // after the finger moved: here the whole 40 px flick took 30 ms, but its
    // moves and lift are only handled 60 ms after the touch landed.
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'topEnd',
        'Swipe toast',
        56,
      );
      const touchEvent = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        clientY: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const touch = {identifier: 33, clientX: 10, clientY};
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [touch],
        });
        Object.defineProperty(event, 'changedTouches', {value: [touch]});
        return event;
      };

      act(() => {
        visualToast.dispatchEvent(touchEvent('touchstart', 100));
      });
      clock.advance(15);
      const firstMove = touchEvent('touchmove', 80);
      clock.advance(15);
      const secondMove = touchEvent('touchmove', 60);
      const lift = touchEvent('touchend', 60);
      clock.advance(30);
      act(() => {
        visualToast.dispatchEvent(firstMove);
        visualToast.dispatchEvent(secondMove);
        visualToast.dispatchEvent(lift);
      });

      expect(onHide).toHaveBeenCalledWith('manual');
    } finally {
      clock.restore();
    }
  });

  it('flicks on the speed the finger lifts at, from the shared release-velocity estimate', () => {
    // A slow 12 px start, then a fast throw: 47 px in all, short of the 48 px
    // dismiss distance, and slow on average (0.08 px/ms), but the finger is
    // moving at 2.3 px/ms when it lifts.
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'topEnd',
        'Swipe toast',
        56,
      );
      const touchEvent = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        clientY: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const touch = {identifier: 34, clientX: 10, clientY};
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [touch],
        });
        Object.defineProperty(event, 'changedTouches', {value: [touch]});
        return event;
      };
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchstart', 100));
      });
      for (const [advance, y] of [
        [300, 90],
        [300, 88],
        [3, 81],
        [3, 74],
        [3, 67],
        [3, 60],
        [3, 53],
      ] as const) {
        clock.advance(advance);
        act(() => {
          visualToast.dispatchEvent(touchEvent('touchmove', y));
        });
      }
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchend', 53));
      });

      expect(onHide).toHaveBeenCalledWith('manual');
    } finally {
      clock.restore();
    }
  });

  it('springs back when the finger rests past the stillness interval before it lifts', () => {
    // The same throw (47 px, 2.3 px/ms at the last move), then 41 ms still:
    // longer than the stillness interval, so the release reads no speed
    // (AST-100 FR2) and the card, short of the dismiss distance, springs back.
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'topEnd',
        'Swipe toast',
        56,
      );
      const touchEvent = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        clientY: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const touch = {identifier: 35, clientX: 10, clientY};
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [touch],
        });
        Object.defineProperty(event, 'changedTouches', {value: [touch]});
        return event;
      };
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchstart', 100));
      });
      for (const [advance, y] of [
        [300, 90],
        [300, 88],
        [3, 81],
        [3, 74],
        [3, 67],
        [3, 60],
        [3, 53],
      ] as const) {
        clock.advance(advance);
        act(() => {
          visualToast.dispatchEvent(touchEvent('touchmove', y));
        });
      }
      // The finger rests, with no event, before it lifts.
      clock.advance(41);
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchend', 53));
      });

      expect(onHide).not.toHaveBeenCalled();
    } finally {
      clock.restore();
    }
  });

  it('still flicks when the finger rests shorter than the stillness interval', () => {
    // 39 ms still: within the stillness interval, the throw's speed holds.
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'topEnd',
        'Swipe toast',
        56,
      );
      const touchEvent = (
        type: 'touchstart' | 'touchmove' | 'touchend',
        clientY: number,
      ) => {
        const event = new Event(type, {bubbles: true, cancelable: true});
        const touch = {identifier: 35, clientX: 10, clientY};
        Object.defineProperty(event, 'touches', {
          value: type === 'touchend' ? [] : [touch],
        });
        Object.defineProperty(event, 'changedTouches', {value: [touch]});
        return event;
      };
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchstart', 100));
      });
      for (const [advance, y] of [
        [300, 90],
        [300, 88],
        [3, 81],
        [3, 74],
        [3, 67],
        [3, 60],
        [3, 53],
      ] as const) {
        clock.advance(advance);
        act(() => {
          visualToast.dispatchEvent(touchEvent('touchmove', y));
        });
      }
      // The finger rests, with no event, before it lifts.
      clock.advance(39);
      act(() => {
        visualToast.dispatchEvent(touchEvent('touchend', 53));
      });

      expect(onHide).toHaveBeenCalledWith('manual');
    } finally {
      clock.restore();
    }
  });

  it('snaps back after a slow short drag on a one-line toast', () => {
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast(
        SWIPE_TOAST,
        'bottomEnd',
        'Swipe toast',
        56,
      );

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 10,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
      });
      clock.advance(400);
      act(() => {
        fireEvent.pointerMove(visualToast, {
          pointerId: 10,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        fireEvent.pointerUp(visualToast, {
          pointerId: 10,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
      });

      expect(onHide).not.toHaveBeenCalled();
      expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    } finally {
      clock.restore();
    }
  });

  it('snaps back without dismissing after a short drag', () => {
    // A slow drag: 24 px over 400 ms is far below flick speed.
    const clock = mockClock();
    try {
      const {visualToast, onHide} = renderSwipeToast();

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
      });
      clock.advance(400);
      act(() => {
        fireEvent.pointerMove(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 24,
        });
        fireEvent.pointerUp(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 24,
        });
      });

      expect(onHide).not.toHaveBeenCalled();
      expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
      expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
        '',
      );
      expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe(
        '',
      );
    } finally {
      clock.restore();
    }
  });

  it('fades and subtly scales only after accepted vertical edge swipe intent', () => {
    const {visualToast} = renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: -40,
      });
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');
    act(() => {
      fireEvent.pointerCancel(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: -40,
      });
    });

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('40px');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '0.800',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe(
      '0.990',
    );
  });

  it('does not fade for horizontal intent and resets swipe vars on pointercancel', () => {
    const {visualToast, onHide} = renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 80,
        clientY: 20,
      });
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '0.800',
    );
    act(() => {
      fireEvent.pointerCancel(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');
  });

  it('hands the opposite vertical direction back without moving the toast', () => {
    const {visualToast, onHide} = renderSwipeToast(SWIPE_TOAST, 'bottomEnd');

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('keeps bottom placement dismissing downward under RTL', () => {
    const onHide = vi.fn();
    render(
      <div dir="rtl">
        <ToastViewport isTopLayer={false} position="bottomStart">
          <ShowToastButton options={{...SWIPE_TOAST, onHide}} />
        </ToastViewport>
      </div>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
    });

    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('keeps top placement dismissing upward under RTL', () => {
    const onHide = vi.fn();
    render(
      <div dir="rtl">
        <ToastViewport isTopLayer={false} position="topEnd">
          <ShowToastButton options={{...SWIPE_TOAST, onHide}} />
        </ToastViewport>
      </div>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = getVisualToastByText('Swipe toast');
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('sets swipe exit to a vertical throw with no horizontal drift', () => {
    const {visualToast, onHide} = renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
    );

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    expect(onHide).toHaveBeenCalledWith('manual');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-exit-y')).toBe(
      'calc(-1 * 120%)',
    );
    expect(getComputedStyle(visualToast).transform).not.toContain('translateX');
  });

  it('allows native page scrolling until touch intent matches the dismiss edge', () => {
    const {visualToast, onHide} = renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
    );
    const touchEvent = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      clientY: number,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const touch = {identifier: 31, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [touch],
      });
      Object.defineProperty(event, 'changedTouches', {value: [touch]});
      visualToast.dispatchEvent(event);
      return event;
    };

    act(() => {
      touchEvent('touchstart', 100);
    });
    let move: Event;
    act(() => {
      move = touchEvent('touchmove', 140);
    });
    expect(move!.defaultPrevented).toBe(false);
    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      touchEvent('touchstart', 100);
    });
    Object.defineProperty(
      (move = new Event('touchmove', {bubbles: true, cancelable: true})),
      'changedTouches',
      {value: [{identifier: 31, clientX: 80, clientY: 104}]},
    );
    act(() => {
      visualToast.dispatchEvent(move);
    });
    expect(move.defaultPrevented).toBe(false);

    act(() => {
      touchEvent('touchstart', 100);
    });
    act(() => {
      move = touchEvent('touchmove', 40);
    });
    expect(move!.defaultPrevented).toBe(true);
    act(() => {
      touchEvent('touchend', 40);
    });
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('resets an accepted touch gesture on native touchcancel', () => {
    const {visualToast, onHide} = renderSwipeToast();
    const touch = (type: 'touchstart' | 'touchmove', clientY: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const point = {identifier: 44, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {value: [point]});
      Object.defineProperty(event, 'changedTouches', {value: [point]});
      visualToast.dispatchEvent(event);
      return event;
    };

    act(() => {
      touch('touchstart', 0);
    });
    let move: Event;
    act(() => {
      move = touch('touchmove', 40);
    });
    expect(move!.defaultPrevented).toBe(true);
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('40px');

    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
  });

  it('abandons a one-finger swipe when a second touch starts', () => {
    const {visualToast, onHide} = renderSwipeToast();
    const dispatchTouch = (
      type: 'touchstart' | 'touchmove',
      touches: {identifier: number; clientX: number; clientY: number}[],
      changedTouches = touches,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {value: touches});
      Object.defineProperty(event, 'changedTouches', {value: changedTouches});
      visualToast.dispatchEvent(event);
      return event;
    };
    const first = {identifier: 51, clientX: 10, clientY: 0};
    const second = {identifier: 52, clientX: 30, clientY: 40};

    act(() => {
      dispatchTouch('touchstart', [first]);
      dispatchTouch('touchmove', [{...first, clientY: 40}]);
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('40px');

    act(() => {
      dispatchTouch('touchstart', [first, second], [second]);
    });
    const multitouchMove = dispatchTouch('touchmove', [first, second]);

    expect(multitouchMove.defaultPrevented).toBe(false);
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not dismiss when another touch remains outside the Toast', () => {
    const {visualToast, onHide} = renderSwipeToast();
    const first = {identifier: 61, clientX: 10, clientY: 0};
    const second = {identifier: 62, clientX: 200, clientY: 200};
    const dispatchTouch = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      touches: (typeof first)[],
      changedTouches: (typeof first)[],
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {value: touches});
      Object.defineProperty(event, 'changedTouches', {value: changedTouches});
      visualToast.dispatchEvent(event);
      return event;
    };

    act(() => {
      dispatchTouch('touchstart', [first], [first]);
      dispatchTouch(
        'touchmove',
        [{...first, clientY: 60}],
        [{...first, clientY: 60}],
      );
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('60px');

    // The second contact began outside the Toast, so its touchstart did not
    // reach the Toast listener. Ending the tracked finger must still cancel
    // while that other contact remains active.
    act(() => {
      dispatchTouch('touchend', [second], [{...first, clientY: 60}]);
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '',
    );
  });

  it('does not let a pen event with the same numeric ID control a touch gesture', () => {
    const {visualToast, onHide} = renderSwipeToast();
    const touch = {identifier: 7, clientX: 10, clientY: 0};
    const touchStart = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(touchStart, 'touches', {value: [touch]});
    Object.defineProperty(touchStart, 'changedTouches', {value: [touch]});

    act(() => {
      visualToast.dispatchEvent(touchStart);
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 10,
        clientY: 60,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 10,
        clientY: 60,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');

    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });
  });

  it('removes native touch listeners when a Toast unmounts', () => {
    const {visualToast, unmount} = renderSwipeToast();
    const removeListener = vi.spyOn(visualToast, 'removeEventListener');

    unmount();

    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
      expect(removeListener).toHaveBeenCalledWith(type, expect.any(Function));
    }
  });

  it('resets safely on pointercancel and resumes the auto-hide timer', () => {
    vi.useFakeTimers();
    try {
      const {visualToast, onHide} = renderSwipeToast({
        body: 'Swipe toast',
        autoHideDuration: 3000,
      });

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        fireEvent.pointerMove(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        vi.advanceTimersByTime(10_000);
      });
      expect(onHide).not.toHaveBeenCalled();

      act(() => {
        fireEvent.pointerCancel(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        vi.advanceTimersByTime(3_000);
      });

      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps horizontal pan intent and mouse drag from dismissing', () => {
    const {visualToast, onHide} = renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 220,
        clientY: 80,
      });
      fireEvent.pointerDown(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        clientX: 220,
        clientY: 0,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        clientX: 220,
        clientY: 0,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not start a swipe from interactive descendants', () => {
    const onAction = vi.fn();
    const {visualToast, onHide} = renderSwipeToast({
      ...SWIPE_TOAST,
      endContent: (
        <>
          <Button label="Undo" size="sm" onClick={onAction} />
          <span role="switch" tabIndex={-1}>
            Mode
          </span>
        </>
      ),
    });

    const targets = [
      screen.getByRole('button', {name: 'Undo'}),
      screen.getByRole('switch', {name: 'Mode'}),
    ];
    targets.forEach((target, index) => {
      const pointerId = 20 + index;
      act(() => {
        fireEvent.pointerDown(target, {
          pointerId,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        fireEvent.pointerMove(target, {
          pointerId,
          pointerType: 'pen',
          clientX: 0,
          clientY: 80,
        });
        fireEvent.pointerUp(target, {
          pointerId,
          pointerType: 'pen',
          clientX: 0,
          clientY: 80,
        });
      });
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
    act(() => {
      fireEvent.click(targets[0]);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the visible dismiss button as a non-gesture alternative', () => {
    const {onHide} = renderSwipeToast();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });

    expect(onHide).toHaveBeenCalledWith('manual');
  });
});

// An Android finger: a coarse pointer, but not WebKit on iOS.
describe('Toast swipe dismissal with a fine pointer', () => {
  // A pen, or a touch on a device driven by a mouse or trackpad: Toast keeps
  // its own swipe and exit, and the banner swipe stays inert.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  });

  it("keeps Toast's own swipe: the card follows 1:1 and fades, with no banner translate", () => {
    // A fine primary pointer in this test's own context.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    render(
      <ToastViewport isTopLayer={false} position="topEnd">
        <ShowToastButton options={SWIPE_TOAST} />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });
    const touchEvent = (type: 'touchstart' | 'touchmove', clientY: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const touch = {identifier: 41, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {value: [touch]});
      Object.defineProperty(event, 'changedTouches', {value: [touch]});
      visualToast.dispatchEvent(event);
    };

    act(() => {
      touchEvent('touchstart', 100);
    });
    act(() => {
      touchEvent('touchmove', 60);
    });
    // 40 px toward the top edge: under the finger, faded by 40 / 80 × 0.4.
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe(
      '-40px',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '0.800',
    );
    expect(visualToast.style.translate).toBe('');
    act(() => {
      visualToast.dispatchEvent(new Event('touchcancel', {bubbles: true}));
    });
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe('');
  });

  it("dismisses at once from the close button, with Toast's own exit", () => {
    // A fine primary pointer in this test's own context.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const onHide = vi.fn();
    render(
      <ToastViewport isTopLayer={false} position="topEnd">
        <ShowToastButton options={{...SWIPE_TOAST, onHide}} />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(visualToast.style.translate).toBe('');
    expect(getComputedStyle(visualToast).opacity).toBe('0');
  });
});

// Under a finger the swipe follows notification banners (useToastBannerSwipe).
describe('Toast swipe dismissal under a finger', () => {
  // A coarse primary pointer, on any touch device; the file's afterEach
  // unstubs it.
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches: query === '(pointer: coarse)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  });

  async function renderSwipeToast(
    options: ToastOptions = SWIPE_TOAST,
    position: React.ComponentProps<
      typeof ToastViewport
    >['position'] = 'bottomEnd',
    bodyText = 'Swipe toast',
    surfaceHeight = 80,
    presentation?: ToastPresentation,
  ) {
    const onHide = vi.fn();
    const result = render(
      <ToastViewport
        isTopLayer={false}
        position={position}
        presentation={presentation}>
        <ShowToastButton options={{...options, onHide}} />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText(bodyText)
      .closest('[data-type]') as HTMLElement;
    const box = {
      x: 0,
      y: 0,
      width: 400,
      height: surfaceHeight,
      top: 0,
      right: 400,
      bottom: surfaceHeight,
      left: 0,
      toJSON: () => ({}),
    };
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue(box);
    // The retract measures the card's untranslated box on its wrapper.
    vi.spyOn(
      visualToast.parentElement as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue(box);
    return {...result, visualToast, onHide};
  }

  // The document's gesture host keeps one clock for every test in this file
  // and never moves it backwards (fake timers in Toast's own swipe tests move
  // it too), so each timed stroke starts after the latest time it has seen.
  let strokeClock = 0;
  function strokeStart(): number {
    strokeClock =
      Math.max(
        strokeClock,
        performance.now(),
        getGestureHost(document).arena.now(),
      ) + 100;
    return strokeClock;
  }

  /** A dismissal on iOS waits for the card's retract (`toastMotion.exitMs`). */
  async function afterRetract() {
    await act(async () => {
      await new Promise(resolve =>
        setTimeout(resolve, toastMotion.exitMs + 40),
      );
    });
  }

  /** The same under fake timers. */
  async function afterRetractOnFakeTimers() {
    await act(async () => {
      vi.advanceTimersByTime(toastMotion.exitMs + 40);
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    });
  }

  /** The card's offset from rest, as the swipe animator writes it. */
  function cardY(card: HTMLElement): number {
    const [, y = '0px'] = card.style.getPropertyValue('translate').split(' ');
    return Number.parseFloat(y) || 0;
  }

  /**
   * One pen event at an explicit time (ms on the page clock) and clientY:
   * velocity comes from these timestamps, as it does from real input.
   */
  function pen(
    target: HTMLElement,
    type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
    pointerId: number,
    time: number,
    clientY: number,
  ) {
    const event = createEvent[type](target, {
      pointerId,
      pointerType: 'pen',
      button: 0,
      buttons: type === 'pointerUp' || type === 'pointerCancel' ? 0 : 1,
      clientX: 0,
      clientY,
    });
    Object.defineProperty(event, 'timeStamp', {value: time});
    strokeClock = Math.max(strokeClock, time);
    fireEvent(target, event);
  }

  /**
   * A pen stroke with explicit timestamps: [ms from its start, clientY] per
   * event. It starts after every event earlier tests sent the document's
   * gesture host, whose clock only moves forward.
   */
  function penStroke(
    target: HTMLElement,
    pointerId: number,
    points: ReadonlyArray<readonly [number, number]>,
  ) {
    const start = strokeStart();
    points.forEach(([offset, clientY], index) => {
      const time = start + offset;
      strokeClock = Math.max(strokeClock, time);
      const type =
        index === 0
          ? 'pointerDown'
          : index === points.length - 1
            ? 'pointerUp'
            : 'pointerMove';
      const event = createEvent[type](target, {
        pointerId,
        pointerType: 'pen',
        button: 0,
        buttons: type === 'pointerUp' ? 0 : 1,
        clientX: 0,
        clientY,
      });
      Object.defineProperty(event, 'timeStamp', {value: time});
      fireEvent(target, event);
    });
  }

  it('follows the finger only past the follow distance, at the follow ratio, without a jump', async () => {
    const {visualToast} = await renderSwipeToast();
    const start = strokeStart();
    const offsets: number[] = [];
    act(() => {
      pen(visualToast, 'pointerDown', 7, start, 0);
      for (const [time, y] of [
        [100, 10],
        [200, 14],
        [300, 34],
        [400, 54],
      ] as const) {
        pen(visualToast, 'pointerMove', 7, start + time, y);
        offsets.push(cardY(visualToast));
      }
    });
    // Still for the first 14 px of finger travel (the pan began at 10 px),
    // then 0.55 of each pixel more; no opacity or scale change on the way.
    expect(offsets).toEqual([0, 0, 11, 22]);
    expect(visualToast.style.getPropertyValue('opacity')).toBe('');
    expect(visualToast.style.getPropertyValue('scale')).toBe('');
    act(() => {
      pen(visualToast, 'pointerCancel', 7, start + 410, 54);
    });
  });

  it('settles a slow drag short of the dismiss travel back to rest', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    act(() => {
      penStroke(visualToast, 8, [
        [0, 0],
        [300, 10],
        [600, 20],
        [900, 30],
        [910, 30],
      ]);
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('dismisses a slow drag past the dismiss travel', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    act(() => {
      penStroke(visualToast, 9, [
        [0, 0],
        [300, 20],
        [600, 40],
        [900, 60],
        [910, 60],
      ]);
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('dismisses a quick flick that never moved the card', async () => {
    // 15 px in 60 ms: barely past the follow distance, but the release
    // velocity projects it past the dismiss travel.
    const {visualToast, onHide} = await renderSwipeToast();
    act(() => {
      penStroke(visualToast, 10, [
        [0, 0],
        [50, 8],
        [60, 15],
        [64, 15],
      ]);
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('dismisses a quick pen flick on a one-line toast', async () => {
    // 40 px in 30 ms, in two moves, on a 56 px card: the speed dismisses,
    // whatever the card's height.
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'bottomEnd',
      'Swipe toast',
      56,
    );
    act(() => {
      penStroke(visualToast, 18, [
        [0, 0],
        [15, 20],
        [30, 40],
        [34, 40],
      ]);
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('springs back a release moving back toward rest, however far out the card is (spec:AST-094 FR37)', async () => {
    // 60 px toward the edge, then 10 px back, lifted while still moving back
    // at 125 px/s: the card is 19.8 px out, past the dismiss offset.
    const {visualToast, onHide} = await renderSwipeToast();
    act(() => {
      penStroke(visualToast, 37, [
        [0, 0],
        [200, 30],
        [400, 60],
        [440, 55],
        [480, 50],
        [482, 50],
      ]);
    });
    await afterRetract();
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
    expect(screen.getByText('Swipe toast')).toBeInTheDocument();
  });

  /** A native touch event at an explicit time (ms on the page clock). */
  function touchAt(
    type: 'touchstart' | 'touchmove' | 'touchend',
    identifier: number,
    time: number,
    clientY: number,
  ): Event {
    const event = new Event(type, {bubbles: true, cancelable: true});
    const touch = {identifier, clientX: 10, clientY};
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [touch],
    });
    Object.defineProperty(event, 'changedTouches', {value: [touch]});
    Object.defineProperty(event, 'timeStamp', {value: time});
    strokeClock = Math.max(strokeClock, time);
    return event;
  }

  it('dismisses a quick touch flick on a one-line toast at the top', async () => {
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
      56,
    );
    const start = strokeStart();
    let move: Event;
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 32, start, 100));
      move = touchAt('touchmove', 32, start + 15, 80);
      visualToast.dispatchEvent(move);
      visualToast.dispatchEvent(touchAt('touchmove', 32, start + 30, 60));
      visualToast.dispatchEvent(touchAt('touchend', 32, start + 31, 60));
    });
    expect(move!.defaultPrevented).toBe(true);
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('times a flick by its input events, not by when the handlers run', async () => {
    // Browsers deliver moves on the next frame, so handlers can run well
    // after the finger moved: here the whole 40 px flick took 30 ms, but its
    // moves and lift are only handled together, later.
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
      56,
    );
    const start = strokeStart();
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 33, start, 100));
    });
    const firstMove = touchAt('touchmove', 33, start + 15, 80);
    const secondMove = touchAt('touchmove', 33, start + 30, 60);
    const lift = touchAt('touchend', 33, start + 31, 60);
    act(() => {
      visualToast.dispatchEvent(firstMove);
      visualToast.dispatchEvent(secondMove);
      visualToast.dispatchEvent(lift);
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('snaps back after a slow short drag on a one-line toast', async () => {
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'bottomEnd',
      'Swipe toast',
      56,
    );
    act(() => {
      penStroke(visualToast, 19, [
        [0, 0],
        [400, 40],
        [410, 40],
      ]);
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('takes the touch from the browser at the pan hysteresis toward the edge, and no earlier', async () => {
    // A pan starts at 10 pt, and nothing claims the touch before it begins.
    const {visualToast} = await renderSwipeToast(SWIPE_TOAST, 'topEnd');
    const start = strokeStart();
    let at9: Event;
    let at10: Event;
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 34, start, 100));
      at9 = touchAt('touchmove', 34, start + 40, 91);
      visualToast.dispatchEvent(at9);
      at10 = touchAt('touchmove', 34, start + 50, 90);
      visualToast.dispatchEvent(at10);
    });
    expect(at9!.defaultPrevented).toBe(false);
    expect(at10!.defaultPrevented).toBe(true);
    expect(cardY(visualToast)).toBe(0);
    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });
  });

  it('stretches the card after a drag that turns back away from the edge, then springs it back', async () => {
    // A top toast: the finger goes 12 px up (past the 10 px at which the swipe
    // begins and takes the touch), then 74 px back down past its start. From
    // the swipe's start the page never gets the moves; the card follows down
    // at 0.55 of the finger past 14 px, and its release springs it back.
    const {visualToast, onHide} = await renderSwipeToast(SWIPE_TOAST, 'topEnd');
    const start = strokeStart();
    const moves: Event[] = [];
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 35, start, 100));
      for (const [time, y] of [
        [40, 94],
        [80, 88],
        [180, 110],
        [280, 130],
        [380, 150],
        [480, 174],
      ] as const) {
        const move = touchAt('touchmove', 35, start + time, y);
        moves.push(move);
        visualToast.dispatchEvent(move);
      }
    });
    expect(moves.slice(1).every(move => move.defaultPrevented)).toBe(true);
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (74 - 14), 5);
    act(() => {
      visualToast.dispatchEvent(touchAt('touchend', 35, start + 900, 174));
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('springs a stretched card back even when it is flicked back toward the edge', async () => {
    // A top toast: the swipe begins 12 px up, then the card is pulled 40 px
    // down and flicked 20 px back up in 30 ms: the finger is fast toward the
    // edge, but the card is still below rest.
    const {visualToast, onHide} = await renderSwipeToast(SWIPE_TOAST, 'topEnd');
    const start = strokeStart();
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 36, start, 100));
      for (const [time, y] of [
        [40, 94],
        [80, 88],
        [280, 120],
        [480, 140],
        [495, 130],
        [510, 120],
      ] as const) {
        visualToast.dispatchEvent(touchAt('touchmove', 36, start + time, y));
      }
      visualToast.dispatchEvent(touchAt('touchend', 36, start + 512, 120));
    });
    await afterRetract();
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('snaps a slow 20 px drag back', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    act(() => {
      penStroke(visualToast, 11, [
        [0, 0],
        [300, 10],
        [600, 20],
        [610, 20],
      ]);
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('retracts past its edge from where the finger left the card, unclipped by its row, then dismisses', async () => {
    // A long drag carries the card 74 px; it leaves from there by sliding
    // past its edge without fading, never back toward rest, as the banner
    // retracts, and only then is the toast dismissed.
    const {visualToast, onHide} = await renderSwipeToast();
    const wrapper = visualToast.closest('[data-toast-id]') as HTMLElement;
    const start = strokeStart();
    let released = 0;
    act(() => {
      pen(visualToast, 'pointerDown', 12, start, 0);
      pen(visualToast, 'pointerMove', 12, start + 200, 50);
      pen(visualToast, 'pointerMove', 12, start + 400, 100);
      pen(visualToast, 'pointerMove', 12, start + 600, 150);
      released = cardY(visualToast);
      pen(visualToast, 'pointerUp', 12, start + 610, 150);
    });
    expect(released).toBeCloseTo(0.55 * (150 - 14), 5);
    // jsdom has no compositor, so the retract writes its end at once: past
    // the bottom edge of the window.
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 0, bottom: 80}, window.innerHeight, 1),
    );
    expect(getComputedStyle(visualToast).opacity).not.toBe('0');
    expect(
      getComputedStyle(wrapper.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');
    expect(onHide).not.toHaveBeenCalled();
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('lets a touch on a card that is springing back pass through to the page', async () => {
    // One clock for the timers and the animator (it times its motion with
    // performance.now), so running the timers runs the spring-back to its end.
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'performance']});
    try {
      const {visualToast, onHide} = await renderSwipeToast();
      act(() => {
        penStroke(visualToast, 13, [
          [0, 0],
          [400, 10],
          [800, 20],
          [1200, 35],
          [1210, 35],
        ]);
      });
      // Released 11.6 px from rest, short of dismissing: it springs back.
      expect(onHide).not.toHaveBeenCalled();

      // A swipe while it springs back neither catches nor moves it.
      act(() => {
        penStroke(visualToast, 14, [
          [0, 0],
          [100, 30],
          [200, 60],
          [210, 60],
        ]);
      });
      expect(onHide).not.toHaveBeenCalled();
      expect(cardY(visualToast)).toBe(0);

      // Once it is back at rest, the card takes swipes again.
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      act(() => {
        penStroke(visualToast, 15, [
          [0, 0],
          [100, 30],
          [200, 60],
          [210, 60],
        ]);
      });
      await afterRetractOnFakeTimers();
      expect(onHide).toHaveBeenCalledWith('manual');
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves a horizontal drag to the page and returns a cancelled swipe to rest', async () => {
    const {visualToast, onHide} = await renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 80,
        clientY: 20,
      });
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);

    act(() => {
      // A failed gesture stays failed until its pen lifts.
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerDown(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        clientX: 0,
        clientY: 54,
      });
    });
    expect(cardY(visualToast)).toBeCloseTo(22, 5);
    act(() => {
      fireEvent.pointerCancel(visualToast, {
        pointerId: 8,
        pointerType: 'pen',
        clientX: 0,
        clientY: 54,
      });
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('hands the opposite vertical direction back without moving the toast', async () => {
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'bottomEnd',
    );

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('keeps bottom placement dismissing downward under RTL', async () => {
    const onHide = vi.fn();
    render(
      <div dir="rtl">
        <ToastViewport isTopLayer={false} position="bottomStart">
          <ShowToastButton options={{...SWIPE_TOAST, onHide}} />
        </ToastViewport>
      </div>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 60,
      });
    });

    await afterRetract();

    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('keeps top placement dismissing upward under RTL', async () => {
    const onHide = vi.fn();
    render(
      <div dir="rtl">
        <ToastViewport isTopLayer={false} position="topEnd">
          <ShowToastButton options={{...SWIPE_TOAST, onHide}} />
        </ToastViewport>
      </div>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = getVisualToastByText('Swipe toast');
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    await afterRetract();

    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('retracts a top toast straight up, with no horizontal drift', async () => {
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
    );

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 100,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 0,
        clientY: 40,
      });
    });

    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
    // A top toast leaves upward, past the top edge, and never sideways.
    const [x] = visualToast.style.getPropertyValue('translate').split(' ');
    expect(x).toBe('0px');
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 0, bottom: 80}, window.innerHeight, -1),
    );
    expect(getComputedStyle(visualToast).transform).not.toContain('translateX');
  });

  it('allows native page scrolling until touch intent matches the dismiss edge', async () => {
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
    );
    const touchEvent = (
      type: 'touchstart' | 'touchmove' | 'touchend',
      clientY: number,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const touch = {identifier: 31, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {
        value: type === 'touchend' ? [] : [touch],
      });
      Object.defineProperty(event, 'changedTouches', {value: [touch]});
      visualToast.dispatchEvent(event);
      return event;
    };

    act(() => {
      touchEvent('touchstart', 100);
    });
    let move: Event;
    act(() => {
      move = touchEvent('touchmove', 140);
    });
    expect(move!.defaultPrevented).toBe(false);
    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      touchEvent('touchstart', 100);
    });
    Object.defineProperty(
      (move = new Event('touchmove', {bubbles: true, cancelable: true})),
      'changedTouches',
      {value: [{identifier: 31, clientX: 80, clientY: 104}]},
    );
    act(() => {
      visualToast.dispatchEvent(move);
    });
    expect(move.defaultPrevented).toBe(false);

    act(() => {
      touchEvent('touchstart', 100);
    });
    act(() => {
      move = touchEvent('touchmove', 40);
    });
    expect(move!.defaultPrevented).toBe(true);
    act(() => {
      touchEvent('touchend', 40);
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('resets an accepted touch gesture on native touchcancel', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    const touch = (type: 'touchstart' | 'touchmove', clientY: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const point = {identifier: 44, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {value: [point]});
      Object.defineProperty(event, 'changedTouches', {value: [point]});
      visualToast.dispatchEvent(event);
      return event;
    };

    act(() => {
      touch('touchstart', 0);
    });
    let move: Event;
    act(() => {
      move = touch('touchmove', 40);
    });
    expect(move!.defaultPrevented).toBe(true);
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (40 - 14), 5);

    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
  });

  it('keeps a moving swipe when a second finger lands on the card, and dismisses on the first lift', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    const dispatchTouch = (
      target: HTMLElement,
      type: 'touchstart' | 'touchmove' | 'touchend',
      touches: {identifier: number; clientX: number; clientY: number}[],
      changedTouches = touches,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {value: touches});
      Object.defineProperty(event, 'changedTouches', {value: changedTouches});
      target.dispatchEvent(event);
      return event;
    };
    // Real targets, so the gesture host counts both fingers.
    const first = {
      identifier: 51,
      clientX: 10,
      clientY: 0,
      target: visualToast,
    };
    const second = {
      identifier: 52,
      clientX: 30,
      clientY: 40,
      target: visualToast,
    };

    act(() => {
      dispatchTouch(visualToast, 'touchstart', [first]);
      dispatchTouch(visualToast, 'touchmove', [{...first, clientY: 40}]);
    });
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (40 - 14), 5);

    // The swipe has claimed the touch: a second finger neither cancels nor
    // redirects it (spec:AST-094 FR10).
    act(() => {
      dispatchTouch(
        visualToast,
        'touchstart',
        [{...first, clientY: 40}, second],
        [second],
      );
    });
    let multitouchMove: Event;
    act(() => {
      multitouchMove = dispatchTouch(visualToast, 'touchmove', [
        {...first, clientY: 70},
        {...second, clientY: 90},
      ]);
    });
    expect(multitouchMove!.defaultPrevented).toBe(true);
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (70 - 14), 5);
    expect(onHide).not.toHaveBeenCalled();

    act(() => {
      dispatchTouch(
        visualToast,
        'touchend',
        [{...second, clientY: 90}],
        [{...first, clientY: 70}],
      );
    });
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('keeps a moving swipe when a second finger lands outside the Toast, and dismisses on the first lift', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    const dispatchTouch = (
      target: HTMLElement,
      type: 'touchstart' | 'touchmove' | 'touchend',
      touches: {identifier: number; clientX: number; clientY: number}[],
      changedTouches = touches,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {value: touches});
      Object.defineProperty(event, 'changedTouches', {value: changedTouches});
      target.dispatchEvent(event);
      return event;
    };
    const outside = document.body;
    const first = {
      identifier: 61,
      clientX: 10,
      clientY: 0,
      target: visualToast,
    };
    const second = {
      identifier: 62,
      clientX: 200,
      clientY: 200,
      target: outside,
    };

    act(() => {
      dispatchTouch(visualToast, 'touchstart', [first]);
      dispatchTouch(visualToast, 'touchmove', [{...first, clientY: 60}]);
    });
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (60 - 14), 5);

    act(() => {
      dispatchTouch(
        outside,
        'touchstart',
        [{...first, clientY: 60}, second],
        [second],
      );
    });
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (60 - 14), 5);

    // The swipe is the tracked finger's alone, and its lift completes it.
    act(() => {
      dispatchTouch(
        visualToast,
        'touchend',
        [second],
        [{...first, clientY: 60}],
      );
    });
    // It leaves from there, on toward the bottom edge.
    expect(cardY(visualToast)).toBeGreaterThan(0.55 * (60 - 14));
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('fails a swipe that has not claimed the touch yet when a second finger lands, so the page can pinch', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    const dispatchTouch = (
      target: HTMLElement,
      type: 'touchstart' | 'touchmove' | 'touchend',
      touches: {identifier: number; clientX: number; clientY: number}[],
      changedTouches = touches,
    ) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      Object.defineProperty(event, 'touches', {value: touches});
      Object.defineProperty(event, 'changedTouches', {value: changedTouches});
      target.dispatchEvent(event);
      return event;
    };
    const first = {
      identifier: 71,
      clientX: 10,
      clientY: 0,
      target: visualToast,
    };
    const second = {
      identifier: 72,
      clientX: 60,
      clientY: 0,
      target: visualToast,
    };

    act(() => {
      dispatchTouch(visualToast, 'touchstart', [first]);
      // Two fingers before the swipe claims anything: the page's pinch.
      dispatchTouch(visualToast, 'touchstart', [first, second], [second]);
    });
    let move: Event;
    act(() => {
      move = dispatchTouch(visualToast, 'touchmove', [
        {...first, clientY: 60},
        {...second, clientY: 0},
      ]);
    });
    expect(move!.defaultPrevented).toBe(false);
    expect(cardY(visualToast)).toBe(0);
    act(() => {
      dispatchTouch(
        visualToast,
        'touchend',
        [second],
        [{...first, clientY: 60}],
      );
    });
    await afterRetract();
    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not let a pen event with the same numeric ID control a touch gesture', async () => {
    const {visualToast, onHide} = await renderSwipeToast();
    const touch = {identifier: 7, clientX: 10, clientY: 0};
    const touchStart = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(touchStart, 'touches', {value: [touch]});
    Object.defineProperty(touchStart, 'changedTouches', {value: [touch]});

    act(() => {
      visualToast.dispatchEvent(touchStart);
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 10,
        clientY: 60,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 10,
        clientY: 60,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);

    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });
  });

  it('leaves the card one native touch listener, removed when it unmounts', async () => {
    // The document's gesture host tracks the touches. The card carries only
    // the non-passive touchmove that lets a claimed swipe cancel scrolling.
    const add = vi.spyOn(EventTarget.prototype, 'addEventListener');
    try {
      const {visualToast, unmount} = await renderSwipeToast();
      const onCard = add.mock.calls
        .filter((_, index) => add.mock.contexts[index] === visualToast)
        .map(([type]) => type);
      expect(onCard.filter(type => type.startsWith('touch'))).toEqual([
        'touchmove',
      ]);
      const remove = vi.spyOn(visualToast, 'removeEventListener');
      unmount();
      expect(remove.mock.calls.map(([type]) => type)).toContain('touchmove');
    } finally {
      add.mockRestore();
    }
  });

  it('resets safely on pointercancel and resumes the auto-hide timer', async () => {
    vi.useFakeTimers();
    try {
      const {visualToast, onHide} = await renderSwipeToast({
        body: 'Swipe toast',
        autoHideDuration: 3000,
      });

      act(() => {
        fireEvent.pointerDown(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        fireEvent.pointerMove(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        vi.advanceTimersByTime(10_000);
      });
      expect(onHide).not.toHaveBeenCalled();

      act(() => {
        fireEvent.pointerCancel(visualToast, {
          pointerId: 7,
          pointerType: 'pen',
          clientX: 0,
          clientY: 40,
        });
        vi.advanceTimersByTime(3_000);
      });
      // The timeout retracts the card, then dismisses the toast.
      await afterRetractOnFakeTimers();
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('under a finger, a sideways pen drag and a mouse drag never dismiss', async () => {
    // A coarse primary pointer in this test's own context: the mouse here is a
    // second input under the touch presentation, not a fine-pointer case.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    const {visualToast, onHide} = await renderSwipeToast();

    act(() => {
      fireEvent.pointerDown(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 80,
        clientY: 20,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 7,
        pointerType: 'pen',
        clientX: 220,
        clientY: 80,
      });
      fireEvent.pointerDown(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        button: 0,
        clientX: 0,
        clientY: 0,
      });
      fireEvent.pointerMove(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        clientX: 220,
        clientY: 0,
      });
      fireEvent.pointerUp(visualToast, {
        pointerId: 8,
        pointerType: 'mouse',
        clientX: 220,
        clientY: 0,
      });
    });

    expect(onHide).not.toHaveBeenCalled();
  });

  it('does not start a swipe from interactive descendants', async () => {
    const onAction = vi.fn();
    const {visualToast, onHide} = await renderSwipeToast({
      ...SWIPE_TOAST,
      endContent: (
        <>
          <Button label="Undo" size="sm" onClick={onAction} />
          <span role="switch" tabIndex={-1}>
            Mode
          </span>
        </>
      ),
    });

    const targets = [
      screen.getByRole('button', {name: 'Undo'}),
      screen.getByRole('switch', {name: 'Mode'}),
    ];
    targets.forEach((target, index) => {
      const pointerId = 20 + index;
      act(() => {
        fireEvent.pointerDown(target, {
          pointerId,
          pointerType: 'pen',
          button: 0,
          clientX: 0,
          clientY: 0,
        });
        fireEvent.pointerMove(target, {
          pointerId,
          pointerType: 'pen',
          clientX: 0,
          clientY: 80,
        });
        fireEvent.pointerUp(target, {
          pointerId,
          pointerType: 'pen',
          clientX: 0,
          clientY: 80,
        });
      });
    });

    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBe(0);
    act(() => {
      fireEvent.click(targets[0]);
    });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the visible dismiss button as a non-gesture alternative', async () => {
    const {visualToast, onHide} = await renderSwipeToast();

    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });

    // The card retracts past its edge first, as the banner leaves, then the
    // toast is dismissed.
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 0, bottom: 80}, window.innerHeight, 1),
    );
    expect(onHide).not.toHaveBeenCalled();
    await afterRetract();

    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('holds an app-dismissed row open through its retract, then collapses it', async () => {
    const onHide = vi.fn();
    const dismissRef: {current: (() => void) | null} = {current: null};
    function ShowAndKeep() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            dismissRef.current = toast({...SWIPE_TOAST, onHide});
          }}>
          Trigger
        </button>
      );
    }
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd">
        <ShowAndKeep />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    const box = {
      x: 0,
      y: 0,
      width: 400,
      height: 80,
      top: 0,
      right: 400,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    };
    vi.spyOn(visualToast, 'getBoundingClientRect').mockReturnValue(box);
    vi.spyOn(
      visualToast.parentElement as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue(box);
    const row = visualToast.closest('[data-toast-id]') as HTMLElement;
    act(() => {
      fireEvent.transitionEnd(row, {propertyName: 'grid-template-rows'});
    });

    // The app dismisses it: the card retracts past its edge while its row
    // stays open, so the whole exit shows (under Reduce Motion, the whole
    // cross-fade) before the row collapses.
    act(() => {
      dismissRef.current?.();
    });
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 0, bottom: 80}, window.innerHeight, 1),
    );
    expect(getComputedStyle(row).gridTemplateRows).not.toBe('0fr');
    act(() => {
      fireEvent.transitionEnd(row, {propertyName: 'grid-template-rows'});
    });
    expect(row.isConnected).toBe(true);

    await afterRetract();
    expect(getComputedStyle(row).gridTemplateRows).toBe('0fr');
    act(() => {
      fireEvent.transitionEnd(row, {propertyName: 'grid-template-rows'});
    });
    expect(row.isConnected).toBe(false);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('keeps Toast\'s own swipe and fade under a finger with presentation="toast"', async () => {
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(true);
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'topEnd',
      'Swipe toast',
      80,
      'toast',
    );
    const touchEvent = (type: 'touchstart' | 'touchmove', clientY: number) => {
      const event = new Event(type, {bubbles: true, cancelable: true});
      const touch = {identifier: 81, clientX: 10, clientY};
      Object.defineProperty(event, 'touches', {value: [touch]});
      Object.defineProperty(event, 'changedTouches', {value: [touch]});
      visualToast.dispatchEvent(event);
    };
    act(() => {
      touchEvent('touchstart', 100);
    });
    act(() => {
      touchEvent('touchmove', 60);
    });
    // Toast's own swipe: 1:1 under the finger, faded, with no banner translate.
    expect(visualToast.style.getPropertyValue('--_toast-swipe-y')).toBe(
      '-40px',
    );
    expect(visualToast.style.getPropertyValue('--_toast-swipe-opacity')).toBe(
      '0.800',
    );
    expect(visualToast.style.translate).toBe('');
    act(() => {
      visualToast.dispatchEvent(new Event('touchcancel', {bubbles: true}));
    });

    // And its close button dismisses at once, with Toast's own fade.
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(visualToast.style.translate).toBe('');
    expect(getComputedStyle(visualToast).opacity).toBe('0');
  });

  it('uses the notification banner with a fine pointer too with presentation="notification"', async () => {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    // A fine primary pointer in this test's own context.
    expect(window.matchMedia('(pointer: coarse)').matches).toBe(false);
    const {visualToast, onHide} = await renderSwipeToast(
      SWIPE_TOAST,
      'bottomEnd',
      'Swipe toast',
      80,
      'notification',
    );
    // A slow pen drag 30 px toward the edge: the banner's follow.
    const start = strokeStart();
    act(() => {
      pen(visualToast, 'pointerDown', 82, start, 0);
      pen(visualToast, 'pointerMove', 82, start + 300, 10);
      pen(visualToast, 'pointerMove', 82, start + 600, 20);
      pen(visualToast, 'pointerMove', 82, start + 900, 30);
    });
    expect(cardY(visualToast)).toBeCloseTo(0.55 * (30 - 14), 5);
    // Released short of dismissing: it springs back to rest.
    act(() => {
      pen(visualToast, 'pointerUp', 82, start + 910, 30);
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(cardY(visualToast)).toBeCloseTo(0, 1);

    // And the close button retracts the card first.
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 0, bottom: 80}, window.innerHeight, 1),
    );
    expect(onHide).not.toHaveBeenCalled();
    await afterRetract();
    expect(onHide).toHaveBeenCalledWith('manual');
  });

  it('dismisses a standalone Toast at once under a finger with presentation="toast"', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        type="info"
        body="Standalone toast"
        isAutoHide={false}
        autoHideDuration={5000}
        onDismiss={onDismiss}
        presentation="toast"
      />,
    );
    const card = screen
      .getByText('Standalone toast')
      .closest('[data-type]') as HTMLElement;
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(card.style.translate).toBe('');
  });

  it('brings a standalone Toast its owner keeps mounted back to rest after the retract', async () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        type="info"
        body="Standalone toast"
        isAutoHide={false}
        autoHideDuration={5000}
        onDismiss={onDismiss}
      />,
    );
    const card = screen
      .getByText('Standalone toast')
      .closest('[data-type]') as HTMLElement;
    vi.spyOn(
      card.parentElement as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 56,
      top: 0,
      right: 400,
      bottom: 56,
      left: 0,
      toJSON: () => ({}),
    });
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    expect(cardY(card)).toBe(
      retractTarget({top: 0, bottom: 56}, window.innerHeight, 1),
    );
    await afterRetract();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // Its owner keeps it on screen: two frames later it is back at rest, and
    // it can be dismissed again.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
    });
    expect(cardY(card)).toBe(0);
    act(() => {
      fireEvent.click(
        screen.getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    await afterRetract();
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('retracts the card when the timeout dismisses it', async () => {
    vi.useFakeTimers();
    try {
      const {visualToast, onHide} = await renderSwipeToast({
        body: 'Swipe toast',
        autoHideDuration: 1000,
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(cardY(visualToast)).toBe(
        retractTarget({top: 0, bottom: 80}, window.innerHeight, 1),
      );
      expect(onHide).not.toHaveBeenCalled();
      await afterRetractOnFakeTimers();
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it("retracts the card, unclipped by its row, when the app's dismiss() removes it", async () => {
    function ShowAndDismiss() {
      const show = useToast();
      const dismissRef = useRef<(() => void) | null>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              dismissRef.current = show(SWIPE_TOAST);
            }}>
            Trigger
          </button>
          <button type="button" onClick={() => dismissRef.current?.()}>
            App dismiss
          </button>
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false} position="topEnd">
        <ShowAndDismiss />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const visualToast = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    const wrapper = visualToast.parentElement as HTMLElement;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 16,
      width: 400,
      height: 56,
      top: 16,
      right: 400,
      bottom: 72,
      left: 0,
      toJSON: () => ({}),
    });
    act(() => {
      fireEvent.click(screen.getByText('App dismiss'));
    });
    expect(cardY(visualToast)).toBe(
      retractTarget({top: 16, bottom: 72}, window.innerHeight, -1),
    );
    expect(getComputedStyle(wrapper).overflow).toBe('visible');
  });
});

describe('ToastViewport region ARIA', () => {
  it('does not expose an empty notifications landmark', () => {
    renderViewport(<ShowToastButton />);
    expect(
      screen.queryByRole('region', {name: 'Notifications'}),
    ).not.toBeInTheDocument();
  });

  it('exposes the notifications region without a prohibited aria-modal when a toast is visible', () => {
    renderViewport(<ShowToastButton />);
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const region = screen.getByRole('region', {name: 'Notifications'});
    expect(region).not.toHaveAttribute('aria-modal');
  });

  it('does not duplicate the landmark for nested viewports', () => {
    render(
      <ToastViewport isTopLayer={false}>
        <ToastViewport isTopLayer={false}>
          <ShowToastButton options={INFO_A} />
        </ToastViewport>
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    expect(screen.getAllByRole('region', {name: 'Notifications'})).toHaveLength(
      1,
    );
  });
});

describe('toast announcements via singleton live regions', () => {
  function politeRegion(): HTMLElement | null {
    return document.querySelector('[data-astryx-live-region="polite"]');
  }
  function assertiveRegion(): HTMLElement | null {
    return document.querySelector('[data-astryx-live-region="assertive"]');
  }

  const RICH_INFO: ToastOptions = {
    body: (
      <>
        <strong>Update ready</strong>
        <div>Restart to apply</div>
      </>
    ),
  };
  const ERROR_TOAST: ToastOptions = {body: 'Upload failed', type: 'error'};
  const SAVING_V1: ToastOptions = {uniqueID: 'save', body: 'Saving changes'};
  const SAVING_V2: ToastOptions = {uniqueID: 'save', body: 'Changes saved'};
  const IGNORE_KEPT: ToastOptions = {
    uniqueID: 'dup',
    collisionBehavior: 'ignore',
    body: 'Kept',
  };
  const IGNORE_DROPPED: ToastOptions = {
    uniqueID: 'dup',
    collisionBehavior: 'ignore',
    body: 'Dropped',
  };

  it('announces an info toast politely with its flattened text content', async () => {
    renderViewport(<ShowToastButton options={RICH_INFO} triggerLabel="Show" />);
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    // Announced once when the toast is dispatched.
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith(
      'Update ready Restart to apply',
      'polite',
    );
    // The flattened text reaches the polite singleton region (the sink).
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Update ready Restart to apply');
    });
    // Status toasts never touch the assertive region.
    expect(assertiveRegion()).toHaveTextContent('');
  });

  it('announces an error toast assertively', async () => {
    renderViewport(
      <ShowToastButton options={ERROR_TOAST} triggerLabel="Show" />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith('Upload failed', 'assertive');
    await waitFor(() => {
      expect(assertiveRegion()).toHaveTextContent('Upload failed');
    });
    expect(politeRegion()).toHaveTextContent('');
  });

  it('announces exactly once at dispatch, even under StrictMode', () => {
    render(
      <React.StrictMode>
        <ToastViewport isTopLayer={false}>
          <ShowToastButton options={INFO_A} triggerLabel="Show" />
        </ToastViewport>
      </React.StrictMode>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    // Announcement happens in the event-driven dispatch path, so StrictMode's
    // double render cannot announce the same toast twice.
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith('Toast A', 'polite');
  });

  it('re-announces a uniqueID toast when its content is overwritten', async () => {
    renderViewport(
      <>
        <ShowToastButton options={SAVING_V1} triggerLabel="Show v1" />
        <ShowToastButton options={SAVING_V2} triggerLabel="Show v2" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show v1'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenLastCalledWith('Saving changes', 'polite');
    // Overwriting via uniqueID replaces the toast in place — the new content is
    // a fresh dispatch and must be announced again.
    act(() => {
      fireEvent.click(screen.getByText('Show v2'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(2);
    expect(announceSpy).toHaveBeenLastCalledWith('Changes saved', 'polite');
    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Changes saved');
    });
    // Still a single toast on screen — overwritten in place, not stacked.
    const viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(
      within(viewport).queryAllByText(/Saving changes|Changes saved/),
    ).toHaveLength(1);
  });

  it('does not re-announce an unchanged toast when an unrelated render occurs', () => {
    renderViewport(
      <>
        <ShowToastButton options={INFO_A} triggerLabel="Show A" />
        <ShowToastButton options={ERROR_TOAST} triggerLabel="Show B" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show A'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    // A second toast arriving re-renders the viewport with a new toast list.
    // Toast A is not re-dispatched, so it must not be announced again — only
    // the newly dispatched toast produces a call.
    act(() => {
      fireEvent.click(screen.getByText('Show B'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(2);
    expect(announceSpy).toHaveBeenNthCalledWith(1, 'Toast A', 'polite');
    expect(announceSpy).toHaveBeenNthCalledWith(
      2,
      'Upload failed',
      'assertive',
    );
  });

  it('does not announce a toast whose uniqueID collision is ignored', () => {
    renderViewport(
      <>
        <ShowToastButton options={IGNORE_KEPT} triggerLabel="Show 1" />
        <ShowToastButton options={IGNORE_DROPPED} triggerLabel="Show 2" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show 1'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenLastCalledWith('Kept', 'polite');
    // The colliding toast is suppressed (collisionBehavior: 'ignore'), so it is
    // neither shown nor announced.
    act(() => {
      fireEvent.click(screen.getByText('Show 2'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    const viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(within(viewport).getByText('Kept')).toBeInTheDocument();
    expect(within(viewport).queryByText('Dropped')).not.toBeInTheDocument();
  });
});

describe('toast timer lifecycle (#3589)', () => {
  it('fires onHide exactly once when dismissed twice during the exit window', () => {
    const onHide = vi.fn();
    renderViewport(
      <ShowToastButton options={{body: 'Once', onHide}} triggerLabel="Show" />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    const dismiss = screen.getByRole('button', {name: 'Dismiss notification'});
    act(() => {
      fireEvent.click(dismiss);
    });
    // The toast stays mounted during its exit transition; a second click
    // lands on the same still-mounted button.
    act(() => {
      fireEvent.click(dismiss);
    });
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('keeps a window-blur pause alive when another toast arrives', () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      renderViewport(
        <>
          <ShowToastButton
            options={{body: 'Paused', autoHideDuration: 3000, onHide}}
            triggerLabel="Show A"
          />
          <ShowToastButton options={INFO_B} triggerLabel="Show B" />
        </>,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show A'));
      });
      act(() => {
        fireEvent.blur(window);
      });
      // A second toast arriving re-renders the viewport; the paused timer
      // must not silently restart.
      act(() => {
        fireEvent.click(screen.getByText('Show B'));
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).not.toHaveBeenCalled();
      // Focus returns: the remaining time resumes and completes normally.
      act(() => {
        fireEvent.focus(window);
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('renderContent', () => {
    const CUSTOM: ToastOptions = {
      body: 'Toast A',
      renderContent: toast => (
        <div data-testid="custom-content">
          {toast.body}
          {toast.endContent}
          <Button label="Dismiss custom toast" onClick={toast.dismiss} />
        </div>
      ),
    };

    it('replaces the default layout for that toast', () => {
      renderViewport(<ShowToastButton options={CUSTOM} triggerLabel="Show" />);
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      expect(screen.getByTestId('custom-content')).toHaveTextContent('Toast A');
    });

    it('keeps the default translated and themeable dismiss Button unchanged', () => {
      const onHide = vi.fn();
      renderViewport(
        <ShowToastButton
          options={{body: 'Plain', isAutoHide: false, onHide}}
          triggerLabel="Show"
        />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      const toast = screen.getByText('Plain').closest('.astryx-toast');
      expect(toast).not.toBeNull();
      const dismissButton = within(toast as HTMLElement).getByRole('button', {
        name: 'Dismiss notification',
      });
      expect(dismissButton).toHaveClass('astryx-button');
      act(() => {
        fireEvent.click(dismissButton);
      });
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledWith('manual');
    });

    it('dismisses exactly once from a composed custom Button and reports manual', () => {
      const onHide = vi.fn();
      renderViewport(
        <ShowToastButton options={{...CUSTOM, onHide}} triggerLabel="Show" />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      const dismissButton = within(
        screen.getByTestId('custom-content'),
      ).getByRole('button', {name: 'Dismiss custom toast'});
      expect(dismissButton).toHaveClass('astryx-button');
      act(() => {
        fireEvent.click(dismissButton);
      });
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledWith('manual');
    });

    it('lets the dismiss callback travel through nested components', () => {
      function NestedDismiss({dismiss}: {dismiss: () => void}) {
        return <Button label="Nested dismiss" onClick={dismiss} />;
      }

      const onHide = vi.fn();
      renderViewport(
        <ShowToastButton
          options={{
            body: 'Nested',
            isAutoHide: false,
            onHide,
            renderContent: ({body, dismiss}) => (
              <div>
                {body}
                <NestedDismiss dismiss={dismiss} />
              </div>
            ),
          }}
          triggerLabel="Show"
        />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      act(() => {
        fireEvent.click(screen.getByRole('button', {name: 'Nested dismiss'}));
      });
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledWith('manual');
    });

    it('does not inject a dismiss control into custom content', () => {
      renderViewport(
        <ShowToastButton
          options={{
            body: 'Control-free',
            type: 'error',
            renderContent: ({body}) => (
              <div data-testid="control-free-content">{body}</div>
            ),
          }}
          triggerLabel="Show"
        />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      const content = screen.getByTestId('control-free-content');
      expect(content).toHaveTextContent('Control-free');
      const toast = content.closest('.astryx-toast');
      expect(toast).not.toBeNull();
      expect(within(toast as HTMLElement).queryByRole('button')).toBeNull();
    });

    it('leaves a toast that did not ask for custom content alone', () => {
      renderViewport(
        <>
          <ShowToastButton options={CUSTOM} triggerLabel="Custom" />
          <ShowToastButton options={INFO_B} triggerLabel="Plain" />
        </>,
      );
      act(() => {
        fireEvent.click(screen.getByText('Custom'));
        fireEvent.click(screen.getByText('Plain'));
      });
      const plain = screen.getByText('Toast B').closest('.astryx-toast');
      expect(plain).not.toBeNull();
      expect(
        within(plain as HTMLElement).getByRole('button', {
          name: 'Dismiss notification',
        }),
      ).toBeInTheDocument();
      expect(
        within(plain as HTMLElement).queryByTestId('custom-content'),
      ).not.toBeInTheDocument();
    });

    it('hands endContent to the layout rather than dropping it', () => {
      renderViewport(
        <ShowToastButton
          options={{
            ...CUSTOM,
            endContent: <button type="button">Undo</button>,
          }}
          triggerLabel="Show"
        />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      expect(
        within(screen.getByTestId('custom-content')).getByRole('button', {
          name: 'Undo',
        }),
      ).toBeInTheDocument();
    });

    it('still auto-dismisses and exposes its resolved timing', () => {
      vi.useFakeTimers();
      try {
        const seen: {isAutoHide: boolean; autoHideDuration: number}[] = [];
        const onHide = vi.fn();
        renderViewport(
          <ShowToastButton
            options={{
              body: 'Fleeting',
              autoHideDuration: 3000,
              onHide,
              renderContent: toast => {
                seen.push({
                  isAutoHide: toast.isAutoHide,
                  autoHideDuration: toast.autoHideDuration,
                });
                return <div>{toast.body}</div>;
              },
            }}
            triggerLabel="Show"
          />,
        );
        act(() => {
          fireEvent.click(screen.getByText('Show'));
        });
        expect(seen[0]).toEqual({isAutoHide: true, autoHideDuration: 3000});
        act(() => {
          vi.advanceTimersByTime(3000);
        });
        expect(onHide).toHaveBeenCalledWith('auto');
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps announcing through the live region', () => {
      renderViewport(<ShowToastButton options={CUSTOM} triggerLabel="Show" />);
      act(() => {
        fireEvent.click(screen.getByText('Show'));
      });
      expect(announceSpy).toHaveBeenCalledWith('Toast A', 'polite');
    });
  });
});
