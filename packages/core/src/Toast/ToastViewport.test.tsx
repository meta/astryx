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
  afterEach,
} from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  act,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import {readFileSync} from 'node:fs';
import {type AnnounceFn, __resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {Button} from '../Button';
import type {ToastProps} from './Toast';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import type {ToastOptions} from './types';

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

describe('dismissing a toast that has no mounted row', () => {
  function ShowAndKeepDismiss({
    options,
    label,
    onShown,
  }: {
    options: ToastOptions;
    label: string;
    onShown: (dismiss: () => void) => void;
  }) {
    const toast = useToast();
    return (
      <button type="button" onClick={() => onShown(toast(options))}>
        {label}
      </button>
    );
  }

  it('reports a hidden toast once when it is dismissed twice before the viewport renders again', () => {
    const onHideA = vi.fn();
    let dismissA: (() => void) | null = null;
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <ShowAndKeepDismiss
          options={{body: 'Toast A', isAutoHide: false, onHide: onHideA}}
          label="Show A"
          onShown={dismiss => {
            dismissA = dismiss;
          }}
        />
        <ShowToastButton
          options={{body: 'Toast B', isAutoHide: false}}
          triggerLabel="Show B"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show A'));
      fireEvent.click(screen.getByText('Show B'));
    });
    expect(screen.queryByText('Toast A')).toBeNull();

    // Both calls land in one batch, before the list renders without A.
    act(() => {
      dismissA?.();
      dismissA?.();
    });
    expect(onHideA).toHaveBeenCalledTimes(1);
  });

  it('frees the slot of a toast dismissed while it was hidden past maxVisible', () => {
    const onHideA = vi.fn();
    let dismissA: (() => void) | null = null;
    render(
      <ToastViewport isTopLayer={false} maxVisible={2}>
        <ShowAndKeepDismiss
          options={{body: 'Toast A', isAutoHide: false, onHide: onHideA}}
          label="Show A"
          onShown={dismiss => {
            dismissA = dismiss;
          }}
        />
        <ShowToastButton
          options={{body: 'Toast B', isAutoHide: false}}
          triggerLabel="Show B"
        />
        <ShowToastButton
          options={{body: 'Toast C', isAutoHide: false}}
          triggerLabel="Show C"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show A'));
      fireEvent.click(screen.getByText('Show B'));
      fireEvent.click(screen.getByText('Show C'));
    });
    // Only the newest two are shown: A is hidden past the limit.
    expect(screen.queryByText('Toast A')).toBeNull();

    act(() => {
      dismissA?.();
    });
    expect(onHideA).toHaveBeenCalledTimes(1);
    expect(onHideA).toHaveBeenCalledWith('manual');

    // C leaves. A was dismissed, so it must not come back to hold the slot
    // as an empty row: B is the only toast left.
    const toastC = getToastWrapperByText('Toast C');
    act(() => {
      fireEvent.click(
        within(toastC).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      completeExit(toastC.dataset.toastId ?? '');
    });
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(1);
    expect(screen.getByText('Toast B')).toBeInTheDocument();

    // Once B leaves too, nothing is left: no row, no empty landmark.
    const toastB = getToastWrapperByText('Toast B');
    act(() => {
      fireEvent.click(
        within(toastB).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      completeExit(toastB.dataset.toastId ?? '');
    });
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
    expect(screen.queryByRole('region', {name: 'Notifications'})).toBeNull();
    expect(onHideA).toHaveBeenCalledTimes(1);
  });

  it('never shows a toast dismissed before it rendered, and reports it once', () => {
    const onHide = vi.fn();
    render(
      <ToastViewport isTopLayer={false}>
        <ShowAndKeepDismiss
          options={{body: 'Toast gone', isAutoHide: false, onHide}}
          label="Show and dismiss"
          onShown={dismiss => dismiss()}
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show and dismiss'));
    });

    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
    expect(screen.queryByRole('region', {name: 'Notifications'})).toBeNull();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledWith('manual');
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

    expect(toastSource).toContain(
      "'@media (prefers-reduced-motion: reduce)': '0.01ms'",
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
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_020);
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

  it('snaps back without dismissing after a short drag', () => {
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
    expect(visualToast.style.getPropertyValue('--_toast-swipe-scale')).toBe('');
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
