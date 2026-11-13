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
import React, {
  Suspense,
  startTransition,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {createPortal} from 'react-dom';
import {readFileSync} from 'node:fs';
import {type AnnounceFn, __resetLiveRegionsForTest} from '../hooks/useAnnounce';
import {Button} from '../Button';
import type {ToastProps} from './Toast';
import {getGestureHost} from '../gestures/GestureHost';
import {toast as toastMotion} from '../motion/uikit/toast';
import {ToastViewport} from './ToastViewport';
import {retractTarget} from './useToastBannerSwipe';
import {useToast} from './useToast';
import type {ToastOptions} from './types';

// jsdom reports no window focus until an element is focused, but a test page
// stands for a focused window: a toast raised while the window is blurred
// starts held (FR2), which the blur tests set up on purpose.
beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  vi.mocked(document.hasFocus).mockRestore?.();
});

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

function RenderedToastBody({text}: {text: string}) {
  return <span>{text}</span>;
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
      'max(var(--size-element-lg),1lh)',
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

describe('ToastViewport and a descendant committing together', () => {
  it('keeps a toast a descendant raises in a layout effect, for a repeat in that commit', () => {
    function Raiser({isOn}: {isOn: boolean}) {
      const toast = useToast();
      // Raised as the descendant commits, then repeated after the commit.
      useLayoutEffect(() => {
        if (isOn) {
          toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
        }
      }, [isOn, toast]);
      useEffect(() => {
        if (isOn) {
          toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
        }
      }, [isOn, toast]);
      return null;
    }
    function Controls() {
      const toast = useToast();
      const [isOn, setIsOn] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              toast({isAutoHide: false, body: 'Toast A'});
              setIsOn(true);
            }}>
            Raise
          </button>
          <Raiser isOn={isOn} />
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <Controls />
      </ToastViewport>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Raise'));
    });

    // The repeat finds the first 'b' and does not add a second one.
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(
      rows.filter(row => row.textContent?.includes('Toast B')),
    ).toHaveLength(1);
  });
});

describe('ToastViewport and a descendant cleanup in the same commit', () => {
  it("keeps a toast a descendant's layout-effect cleanup raises, for a repeat in that commit", () => {
    function Raiser({step}: {step: number}) {
      const toast = useToast();
      // The cleanup runs as the next step commits; the passive effect after.
      useLayoutEffect(
        () => () => {
          toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
        },
        [step, toast],
      );
      useEffect(() => {
        if (step > 0) {
          toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
        }
      }, [step, toast]);
      return null;
    }
    function Controls() {
      const toast = useToast();
      const [step, setStep] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              toast({isAutoHide: false, body: 'Toast A'});
              setStep(1);
            }}>
            Raise
          </button>
          <Raiser step={step} />
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <Controls />
      </ToastViewport>,
    );

    act(() => {
      fireEvent.click(screen.getByText('Raise'));
    });

    // Toast.spec.md FR8: the repeat replaces the first 'b'.
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(
      rows.filter(row => row.textContent?.includes('Toast B')),
    ).toHaveLength(1);
  });

  it('keeps a toast an unmounting direct child raises in its cleanup, for a repeat in that commit', () => {
    function Leaving() {
      const toast = useToast();
      useLayoutEffect(
        () => () => {
          toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
        },
        [toast],
      );
      return null;
    }
    function Arriving() {
      const toast = useToast();
      useEffect(() => {
        toast({uniqueID: 'b', isAutoHide: false, body: 'Toast B'});
      }, [toast]);
      return null;
    }
    function App({isSwapped}: {isSwapped: boolean}) {
      // The swap is a direct child of the viewport, as an app root can be.
      return (
        <ToastViewport isTopLayer={false}>
          {isSwapped ? <Arriving /> : <Leaving />}
        </ToastViewport>
      );
    }
    const {rerender} = render(<App isSwapped={false} />);

    act(() => {
      rerender(<App isSwapped />);
    });

    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(
      rows.filter(row => row.textContent?.includes('Toast B')),
    ).toHaveLength(1);
  });

  it('reports onHide once when a layout cleanup and a passive cleanup dismiss a toast pushed out in that commit', () => {
    const onHide = vi.fn();
    let dismissFirst: (() => void) | null = null;
    function Dismisser({step}: {step: number}) {
      useLayoutEffect(
        () => () => {
          if (step > 0) {
            dismissFirst?.();
          }
        },
        [step],
      );
      useEffect(
        () => () => {
          if (step > 0) {
            dismissFirst?.();
          }
        },
        [step],
      );
      return null;
    }
    function Controls() {
      const toast = useToast();
      const [step, setStep] = useState(0);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              dismissFirst = toast({
                isAutoHide: false,
                body: 'First',
                onHide,
              });
              setStep(1);
            }}>
            Show first
          </button>
          <button
            type="button"
            onClick={() => {
              toast({isAutoHide: false, body: 'Second'});
              setStep(2);
            }}>
            Show second
          </button>
          <Dismisser step={step} />
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <Controls />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show first'));
    });

    // The second pushes the first out of the one visible slot, and both
    // cleanups of the step it sets dismiss the first.
    act(() => {
      fireEvent.click(screen.getByText('Show second'));
    });

    // Toast.spec.md FR3: one dismissal reports once.
    expect(onHide).toHaveBeenCalledTimes(1);
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

  it('keeps focus in the replacement when a control inside a toast raises its repeat and dismisses it', () => {
    function OfflineFlow() {
      const toast = useToast();
      const dismissOfflineRef = useRef<(() => void) | null>(null);
      const showOffline = (body: string) => {
        dismissOfflineRef.current = toast({
          uniqueID: 'offline',
          isAutoHide: false,
          body,
          endContent: (
            <button
              type="button"
              onClick={() => {
                // A retry reports the state again, then closes the toast it
                // was pressed in.
                const dismissPressed = dismissOfflineRef.current;
                showOffline('Still offline');
                dismissPressed?.();
              }}>
              Retry
            </button>
          ),
        });
      };
      return (
        <>
          <button
            type="button"
            onClick={() => {
              toast({isAutoHide: false, body: 'Alpha'});
              toast({isAutoHide: false, body: 'Bravo'});
            }}>
            Show two
          </button>
          <button type="button" onClick={() => showOffline('Offline')}>
            Show offline
          </button>
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false} maxVisible={2}>
        <OfflineFlow />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show two'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Show offline'));
    });
    // Alpha waits hidden; Bravo and Offline show.
    const retry = within(getToastWrapperByText('Offline')).getByRole('button', {
      name: 'Retry',
    });
    retry.focus();
    act(() => {
      fireEvent.click(retry);
    });
    // Toast.spec.md FR8: the repeat updates the card in place, so the pressed
    // Retry stays focused in it; dismissing the replaced toast leaves the row
    // to the replacement, and focus does not jump to a neighbour.
    const replacement = getToastWrapperByText('Still offline');
    expect(document.activeElement).toBe(retry);
    expect(replacement.contains(retry)).toBe(true);
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('moves focus into the replacement when a control inside the only toast raises its repeat and dismisses it', () => {
    function OfflineFlow() {
      const toast = useToast();
      const dismissOfflineRef = useRef<(() => void) | null>(null);
      const showOffline = (body: string) => {
        dismissOfflineRef.current = toast({
          uniqueID: 'offline',
          isAutoHide: false,
          body,
          endContent: (
            <button
              type="button"
              onClick={() => {
                const dismissPressed = dismissOfflineRef.current;
                showOffline('Still offline');
                dismissPressed?.();
              }}>
              Retry
            </button>
          ),
        });
      };
      return (
        <button type="button" onClick={() => showOffline('Offline')}>
          Show offline
        </button>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <OfflineFlow />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show offline'));
    });
    const retry = within(getToastWrapperByText('Offline')).getByRole('button', {
      name: 'Retry',
    });
    retry.focus();
    act(() => {
      fireEvent.click(retry);
    });
    // FR10: the replacement is the remaining toast, so focus goes into it.
    expect(
      getToastWrapperByText('Still offline').contains(document.activeElement),
    ).toBe(true);
  });

  it('moves focus to a toast that shows when a control inside a toast raises two toasts at the cap and dismisses its own', () => {
    function UploadFlow() {
      const toast = useToast();
      const dismissSavedRef = useRef<(() => void) | null>(null);
      return (
        <button
          type="button"
          onClick={() => {
            dismissSavedRef.current = toast({
              isAutoHide: false,
              body: 'Saved',
              endContent: (
                <button
                  type="button"
                  onClick={() => {
                    toast({isAutoHide: false, body: 'Uploading'});
                    toast({isAutoHide: false, body: 'Uploaded'});
                    dismissSavedRef.current?.();
                  }}>
                  Upload
                </button>
              ),
            });
          }}>
          Save
        </button>
      );
    }
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <UploadFlow />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Save'));
    });
    const upload = within(getToastWrapperByText('Saved')).getByRole('button', {
      name: 'Upload',
    });
    upload.focus();
    act(() => {
      fireEvent.click(upload);
    });
    // FR10: with one visible place, "Uploaded" shows and "Uploading" waits
    // hidden, so focus goes to "Uploaded", not to the hidden toast or the
    // region.
    expect(
      getToastWrapperByText('Uploaded').contains(document.activeElement),
    ).toBe(true);
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

  it('restores focus after a toast reached with Tab rather than F6 is dismissed', () => {
    renderViewport(
      <ShowToastButton options={INFO_A} triggerLabel="Trigger A" />,
    );
    const trigger = screen.getByText('Trigger A');
    trigger.focus();
    act(() => {
      fireEvent.click(trigger);
    });
    const dismiss = screen.getByRole('button', {name: 'Dismiss notification'});
    // Tab (or a click) moves focus straight to the toast's control.
    act(() => {
      dismiss.focus();
    });
    const toastId = document
      .querySelector('[data-toast-id]')!
      .getAttribute('data-toast-id')!;

    act(() => {
      fireEvent.click(dismiss);
    });
    act(() => {
      completeExit(toastId);
    });

    expect(document.activeElement).toBe(trigger);
  });

  // FR8: an overwrite updates the card in place under the same key, so focus
  // inside it stays on the same control.
  it('keeps focus on a control inside a toast that an overwrite updates', () => {
    const upload = (percent: number): ToastOptions => ({
      body: `Uploading ${percent}%`,
      uniqueID: 'upload',
      collisionBehavior: 'overwrite',
      isAutoHide: false,
      endContent: <button type="button">Cancel upload</button>,
    });
    renderViewport(
      <>
        <ShowToastButton options={upload(10)} triggerLabel="Start" />
        <ShowToastButton options={upload(60)} triggerLabel="Progress" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Start'));
    });
    const cancel = screen.getByRole('button', {name: 'Cancel upload'});
    act(() => {
      cancel.focus();
    });

    act(() => {
      fireEvent.click(screen.getByText('Progress'));
    });

    const viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(within(viewport).getByText('Uploading 60%')).toBeInTheDocument();
    expect(cancel).toBeInTheDocument();
    expect(document.activeElement).toBe(cancel);
  });

  // FR2, FR8: an overwrite that turns the card into one that auto-hides keeps
  // the timer held while focus is inside it.
  it('keeps an overwritten toast held while focus is inside when it starts auto-hiding', () => {
    vi.useFakeTimers();
    const onHide = vi.fn();
    try {
      renderViewport(
        <>
          <ShowToastButton
            options={{
              body: 'Uploading',
              uniqueID: 'upload',
              isAutoHide: false,
              endContent: <button type="button">Cancel upload</button>,
            }}
            triggerLabel="Start"
          />
          <ShowToastButton
            options={{
              body: 'Upload done',
              uniqueID: 'upload',
              autoHideDuration: 2000,
              onHide,
              endContent: <button type="button">Cancel upload</button>,
            }}
            triggerLabel="Finish"
          />
        </>,
      );
      act(() => {
        fireEvent.click(screen.getByText('Start'));
      });
      const cancel = screen.getByRole('button', {name: 'Cancel upload'});
      act(() => {
        cancel.focus();
      });

      act(() => {
        fireEvent.click(screen.getByText('Finish'));
      });
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onHide).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(cancel);
    } finally {
      vi.useRealTimers();
    }
  });

  // FR2: an update that removes the focused control drops its focus hold, so
  // a control-free, auto-hiding replacement still hides on time.
  it('auto-hides a control-free replacement after the update removes the focused control', () => {
    vi.useFakeTimers();
    const onHide = vi.fn();
    try {
      renderViewport(
        <>
          <ShowToastButton
            options={{
              body: 'Uploading',
              uniqueID: 'upload',
              isAutoHide: false,
              endContent: <button type="button">Cancel upload</button>,
            }}
            triggerLabel="Start"
          />
          <ShowToastButton
            options={{
              body: 'Uploaded',
              uniqueID: 'upload',
              autoHideDuration: 2000,
              renderContent: () => <span>Uploaded</span>,
              onHide,
            }}
            triggerLabel="Finish"
          />
        </>,
      );
      const start = screen.getByText('Start');
      act(() => {
        start.focus();
        fireEvent.click(start);
      });
      act(() => {
        screen.getByRole('button', {name: 'Cancel upload'}).focus();
      });

      act(() => {
        fireEvent.click(screen.getByText('Finish'));
      });
      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  // FR2: a window hold taken while the toast auto-hid does not outlive the
  // listeners an update that turns auto-hide off removes.
  it('auto-hides again after an update turns auto-hide off and on across a window blur', () => {
    vi.useFakeTimers();
    const onHide = vi.fn();
    try {
      const status = (body: string, options: Partial<ToastOptions>) => ({
        body,
        uniqueID: 'network',
        ...options,
      });
      renderViewport(
        <>
          <ShowToastButton
            options={status('Syncing', {autoHideDuration: 2000})}
            triggerLabel="Sync"
          />
          <ShowToastButton
            options={status('Offline', {type: 'error'})}
            triggerLabel="Lose network"
          />
          <ShowToastButton
            options={status('Back online', {autoHideDuration: 2000, onHide})}
            triggerLabel="Reconnect"
          />
        </>,
      );
      act(() => {
        fireEvent.click(screen.getByText('Sync'));
      });
      act(() => {
        fireEvent.blur(window);
      });
      act(() => {
        fireEvent.click(screen.getByText('Lose network'));
      });
      act(() => {
        fireEvent.focus(window);
      });
      act(() => {
        fireEvent.click(screen.getByText('Reconnect'));
      });
      act(() => {
        vi.advanceTimersByTime(2500);
      });

      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  // FR9: the viewport is the one announcement owner, so a card updated in
  // place carries no live region of its own and is announced once.
  it('announces an overwrite once, through the viewport only', () => {
    const upload = (percent: number): ToastOptions => ({
      body: `Uploading ${percent}%`,
      uniqueID: 'upload',
      isAutoHide: false,
    });
    renderViewport(
      <>
        <ShowToastButton options={upload(10)} triggerLabel="Start" />
        <ShowToastButton options={upload(60)} triggerLabel="Progress" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Start'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Progress'));
    });

    // The toast's text sits in no live region inside its row: only the
    // viewport's own announcer speaks it.
    const row = getToastWrapperByText('Uploading 60%');
    const liveAncestor = within(row)
      .getByText('Uploading 60%')
      .closest('[aria-live], [role="status"], [role="alert"]');
    expect(liveAncestor == null || !row.contains(liveAncestor)).toBe(true);
  });

  // FR8, FR10: when the overwrite removes the focused control, focus moves as
  // FR10 hands it off, never to the page body.
  it('hands focus off when an overwrite removes the focused control', () => {
    renderViewport(
      <>
        <ShowToastButton
          options={{
            body: 'Uploading',
            uniqueID: 'upload',
            isAutoHide: false,
            endContent: <button type="button">Cancel upload</button>,
          }}
          triggerLabel="Start"
        />
        <ShowToastButton
          options={{
            body: 'Uploaded',
            uniqueID: 'upload',
            isAutoHide: false,
            renderContent: () => <span>Uploaded</span>,
          }}
          triggerLabel="Finish"
        />
      </>,
    );
    const start = screen.getByText('Start');
    act(() => {
      start.focus();
      fireEvent.click(start);
    });
    act(() => {
      screen.getByRole('button', {name: 'Cancel upload'}).focus();
    });

    act(() => {
      fireEvent.click(screen.getByText('Finish'));
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(start);
  });

  // FR10: dismissing a focused toast beside a control-free one never drops
  // focus to the page body; with no control to take it, the remembered
  // element does.
  it('restores the remembered element when only a control-free toast remains', () => {
    renderViewport(
      <>
        <ShowToastButton
          options={{
            body: 'Synced',
            isAutoHide: false,
            renderContent: () => <span>Synced</span>,
          }}
          triggerLabel="Trigger quiet"
        />
        <ShowToastButton options={INFO_B} triggerLabel="Trigger B" />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger quiet'));
    });
    const trigger = screen.getByText('Trigger B');
    act(() => {
      trigger.focus();
      fireEvent.click(trigger);
    });
    const dismiss = screen.getByRole('button', {name: 'Dismiss notification'});
    act(() => {
      dismiss.focus();
    });
    const toastId = dismiss
      .closest('[data-toast-id]')!
      .getAttribute('data-toast-id')!;

    act(() => {
      fireEvent.click(dismiss);
    });
    act(() => {
      completeExit(toastId);
    });

    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps the return target while focus visits portaled toast content', () => {
    renderViewport(
      <ShowToastButton
        options={{
          body: 'With a portal',
          isAutoHide: false,
          renderContent: ({body, dismiss}) => (
            <div>
              {body}
              {createPortal(
                <button type="button">Portaled</button>,
                document.body,
              )}
              <Button label="Close" onClick={dismiss} />
            </div>
          ),
        }}
        triggerLabel="Trigger P"
      />,
    );
    const trigger = screen.getByText('Trigger P');
    trigger.focus();
    act(() => {
      fireEvent.click(trigger);
    });
    act(() => {
      fireEvent.keyDown(document, {key: 'F6'});
    });
    // Focus visits the toast's portaled control, then comes back.
    act(() => {
      screen.getByRole('button', {name: 'Portaled'}).focus();
    });
    const close = screen.getByRole('button', {name: 'Close'});
    act(() => {
      close.focus();
    });
    const toastId = document
      .querySelector('[data-toast-id]')!
      .getAttribute('data-toast-id')!;

    act(() => {
      fireEvent.click(close);
    });
    act(() => {
      completeExit(toastId);
    });

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

describe('Toast raised while the window is blurred', () => {
  // FR2: a toast raised while the document does not have focus starts held,
  // so it cannot expire before the user returns to the window.
  it('starts its auto-hide timer held until the window regains focus', () => {
    vi.useFakeTimers();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      renderViewport(
        <ShowToastButton options={AUTO_TOAST} triggerLabel="Trigger Auto" />,
      );
      act(() => {
        fireEvent.click(screen.getByText('Trigger Auto'));
      });
      const viewport = screen.getByRole('region', {name: 'Notifications'});
      const heldId = document
        .querySelector('[data-toast-id]')
        ?.getAttribute('data-toast-id');
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      // An exit that had started would finish here and remove the toast.
      if (heldId) {
        act(() => {
          completeExit(heldId);
        });
      }
      expect(within(viewport).getByText('Auto toast')).toBeInTheDocument();

      hasFocus.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      act(() => {
        vi.advanceTimersByTime(10_000);
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
      hasFocus.mockRestore();
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

  it('updates a settled toast in place when an overwrite replaces it through uniqueID', () => {
    // FR8: an overwrite keeps the replaced toast's row, so the card updates in
    // place: the row stays settled (no second entry transition) and carries
    // the new toast's id.
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
    expect(second).toBe(first);
    expect(second.getAttribute('data-toast-id')).not.toBe(firstId);
    expect(
      getComputedStyle(second.firstElementChild as HTMLElement).overflow,
    ).toBe('visible');
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(1);
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

// With a fine pointer (a mouse, a trackpad, a pen on a laptop), Toast keeps
// its own swipe.
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
    // 60 px in 20 ms, in two moves, by the events' own timestamps. In jsdom
    // the event clock is Date.now. The shared release filter reads a release
    // from two moved samples.
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

  // A one-line toast is 56 px tall, and 40% of that is below the 48 px floor.
  // A short swipe dismisses it only as a flick.
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

  it('times a flick by its input events, not by when the handlers run', () => {
    // Browsers can run move handlers well after the finger moved. Here the
    // 40 px flick takes 30 ms, and the page handles its moves and lift 60 ms
    // after touch-down.
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

  it('leaves no touch listener on the card once a Toast unmounts', () => {
    const addListener = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    const removeListener = vi.spyOn(
      HTMLElement.prototype,
      'removeEventListener',
    );
    try {
      const {visualToast, unmount} = renderSwipeToast();
      unmount();
      const touchListeners = (spy: typeof addListener) =>
        spy.mock.calls
          .filter(
            ([type], call) =>
              spy.mock.contexts[call] === visualToast &&
              type.startsWith('touch'),
          )
          .map(([type, listener]) => [type, listener]);
      const added = touchListeners(addListener);
      const removed = touchListeners(removeListener);
      // The gesture host's own listener shows that the spies see the card.
      expect(added.length).toBeGreaterThan(0);
      expect(removed).toHaveLength(added.length);
      expect(removed).toEqual(expect.arrayContaining(added));
    } finally {
      addListener.mockRestore();
      removeListener.mockRestore();
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

describe('ToastViewport with no toasts', () => {
  // iOS Safari keeps a toolbar color that it took from the viewport while
  // the viewport has a box.
  it('has no box once its last toast has left, and a box for the next toast', () => {
    renderViewport(<ShowToastButton options={SWIPE_TOAST} />);
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const viewport = screen.getByRole('region', {name: 'Notifications'});
    expect(getComputedStyle(viewport).display).toBe('flex');

    const wrapper = getToastWrapperByText('Swipe toast');
    act(() => {
      fireEvent.click(
        within(wrapper).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // The leaving toast keeps the box until its exit ends.
    expect(getComputedStyle(viewport).display).toBe('flex');
    act(() => {
      completeExit(wrapper.dataset.toastId ?? '');
    });
    expect(getComputedStyle(viewport).display).toBe('none');

    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    expect(getComputedStyle(viewport).display).toBe('flex');
  });
});

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
  // and never moves it backwards. Fake timers in Toast's own swipe tests move
  // it too. So each timed stroke starts after the latest time it has seen.
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

  /** A dismissal under a finger waits for the card's retract (`toastMotion.exitMs`). */
  async function afterRetract() {
    await act(async () => {
      await new Promise(resolve =>
        setTimeout(resolve, toastMotion.exitMs + 40),
      );
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
    // Still for the first 14 px of finger travel, then 0.55 of each pixel
    // more. The pan began at 10 px. No opacity or scale changes on the way.
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

  it('springs back a release moving back toward rest, however far out the card is (spec:AST-094 FR37)', async () => {
    // 60 px toward the edge, then 10 px back, lifted while still moving back
    // at 125 px/s. The card is 19.8 px out, past the dismiss offset.
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

  it('holds the touch from a first move toward the edge, and leaves a first move away to the page', async () => {
    // A top toast. The browser decides a touch on its first move, so the pan
    // decides there too. The swipe still begins at the pan hysteresis, and the
    // card moves only past the follow distance.
    const {visualToast, onHide} = await renderSwipeToast(SWIPE_TOAST, 'topEnd');
    let start = strokeStart();
    let first: Event;
    let at9: Event;
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 34, start, 100));
      first = touchAt('touchmove', 34, start + 16, 99);
      visualToast.dispatchEvent(first);
      at9 = touchAt('touchmove', 34, start + 40, 91);
      visualToast.dispatchEvent(at9);
    });
    expect(first!.defaultPrevented).toBe(true);
    expect(at9!.defaultPrevented).toBe(true);
    expect(cardY(visualToast)).toBe(0);
    act(() => {
      visualToast.dispatchEvent(
        new Event('touchcancel', {bubbles: true, cancelable: true}),
      );
    });

    // A first move away from the edge leaves the touch to the page, however
    // far the finger then goes toward the edge.
    start = strokeStart();
    let away: Event;
    let later: Event;
    act(() => {
      visualToast.dispatchEvent(touchAt('touchstart', 36, start, 100));
      away = touchAt('touchmove', 36, start + 16, 101);
      visualToast.dispatchEvent(away);
      later = touchAt('touchmove', 36, start + 120, 60);
      visualToast.dispatchEvent(later);
    });
    expect(away!.defaultPrevented).toBe(false);
    expect(later!.defaultPrevented).toBe(false);
    expect(cardY(visualToast)).toBe(0);
    act(() => {
      visualToast.dispatchEvent(touchAt('touchend', 36, start + 200, 60));
    });
    expect(onHide).not.toHaveBeenCalled();
  });

  it('stretches the card after a drag that turns back away from the edge, then springs it back', async () => {
    // A top toast. The finger goes 12 px up, past the 10 px at which the swipe
    // begins and takes the touch. Then it goes 74 px back down past its start.
    // From the swipe's start the page never gets the moves. The card follows
    // down at 0.55 of the finger past 14 px, and its release springs it back.
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

  it('retracts past its edge from where the finger left the card, unclipped by its row, then dismisses', async () => {
    // A long drag carries the card 74 px. It leaves from there by sliding
    // past its edge without fading, never back toward rest, as the banner
    // retracts. The toast reports its dismissal at once, and its row holds
    // the card until the retract ends.
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
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(wrapper.isConnected).toBe(true);
    await afterRetract();
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("leaves the card's own transitions running while a finger drags it and while it retracts", async () => {
    // They run the card's entrance, which a finger takes from where it shows.
    const {visualToast, onHide} = await renderSwipeToast();
    const start = strokeStart();
    act(() => {
      pen(visualToast, 'pointerDown', 21, start, 0);
      pen(visualToast, 'pointerMove', 21, start + 200, 50);
      pen(visualToast, 'pointerMove', 21, start + 400, 100);
    });
    expect(cardY(visualToast)).toBeGreaterThan(0);
    expect(visualToast.style.getPropertyValue('transition-property')).toBe('');
    act(() => {
      pen(visualToast, 'pointerMove', 21, start + 600, 150);
      pen(visualToast, 'pointerUp', 21, start + 610, 150);
    });
    expect(onHide).toHaveBeenCalledWith('manual');
    expect(visualToast.style.getPropertyValue('transition-property')).toBe('');
    await afterRetract();
  });

  it("under Reduce Motion turns the card's own transitions off before a release fades it", async () => {
    // WebKit replays the stylesheet's opacity transition when the fade hands
    // the opacity back.
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
      matches:
        query === '(pointer: coarse)' ||
        query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
    const {visualToast, onHide} = await renderSwipeToast();
    const start = strokeStart();
    act(() => {
      pen(visualToast, 'pointerDown', 22, start, 0);
      pen(visualToast, 'pointerMove', 22, start + 200, 20);
      pen(visualToast, 'pointerMove', 22, start + 400, 30);
    });
    expect(visualToast.style.getPropertyValue('transition-property')).toBe('');
    // The finger rests, then lifts short of dismissing: the card fades back
    // to rest.
    act(() => {
      pen(visualToast, 'pointerUp', 22, start + 900, 30);
    });
    expect(onHide).not.toHaveBeenCalled();
    expect(visualToast.style.getPropertyValue('transition-property')).toBe(
      'none',
    );
  });

  it('opens a new row for a uniqueID update raised while the card retracts, and reports the dismissed toast once', async () => {
    const onHide = vi.fn();
    const onHideUpdate = vi.fn();
    render(
      <ToastViewport isTopLayer={false} position="bottomEnd">
        <ShowToastButton options={{...SWIPE_TOAST, uniqueID: 'same', onHide}} />
        <ShowToastButton
          options={{
            body: 'Updated toast',
            isAutoHide: false,
            uniqueID: 'same',
            onHide: onHideUpdate,
          }}
          triggerLabel="Update"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Trigger'));
    });
    const card = screen
      .getByText('Swipe toast')
      .closest('[data-type]') as HTMLElement;
    // The close button dismisses it, and under a finger the card retracts
    // first. An update with the same uniqueID comes during the retract.
    act(() => {
      fireEvent.click(
        within(card).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      fireEvent.click(screen.getByText('Update'));
    });
    await afterRetract();
    // The update keeps its own row, and only the dismissed toast reports.
    expect(onHideUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('Updated toast')).toBeTruthy();
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledWith('manual');
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

  it('keeps a moving swipe when a second finger lands on the card, and dismisses on the first lift (spec:AST-094 FR10)', async () => {
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
    // redirects it.
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

  it('announces component-rendered body text once under StrictMode', async () => {
    render(
      <React.StrictMode>
        <ToastViewport isTopLayer={false}>
          <ShowToastButton
            options={{body: <RenderedToastBody text="Draft saved" />}}
            triggerLabel="Show"
          />
        </ToastViewport>
      </React.StrictMode>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });

    await waitFor(() => {
      expect(announceSpy).toHaveBeenCalledTimes(1);
      expect(politeRegion()).toHaveTextContent('Draft saved');
    });
    expect(announceSpy).toHaveBeenCalledWith('Draft saved', 'polite');
    expect(assertiveRegion()).toHaveTextContent('');
  });

  it('announces a component body in full, its link included', async () => {
    function SavedToDrafts() {
      return (
        <span>
          Saved to <a href="/drafts">Drafts</a>
        </span>
      );
    }
    renderViewport(
      <ShowToastButton
        options={{body: <SavedToDrafts />}}
        triggerLabel="Show"
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });

    await waitFor(() => {
      expect(politeRegion()).toHaveTextContent('Saved to Drafts');
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenCalledWith('Saved to Drafts', 'polite');
  });

  it('announces rendered custom content without its controls under StrictMode', async () => {
    render(
      <React.StrictMode>
        <ToastViewport isTopLayer={false}>
          <ShowToastButton
            options={{
              body: 'Stale body text',
              renderContent: () => (
                <div>
                  <span>Upload complete</span>
                  <button type="button">Undo upload</button>
                </div>
              ),
            }}
            triggerLabel="Show"
          />
        </ToastViewport>
      </React.StrictMode>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });

    await waitFor(() => {
      expect(announceSpy).toHaveBeenCalledTimes(1);
      expect(politeRegion()).toHaveTextContent('Upload complete');
    });
    expect(announceSpy).toHaveBeenCalledWith('Upload complete', 'polite');
    expect(announceSpy).not.toHaveBeenCalledWith('Stale body text', 'polite');
    expect(announceSpy).not.toHaveBeenCalledWith(
      'Upload complete Undo upload',
      'polite',
    );
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

  it('drops an ignored-collision toast while its namesake is still leaving', () => {
    renderViewport(
      <>
        <ShowToastButton
          options={{
            uniqueID: 'offline',
            collisionBehavior: 'ignore',
            isAutoHide: false,
            body: 'You are offline',
          }}
          triggerLabel="Show 1"
        />
        <ShowToastButton
          options={{
            uniqueID: 'offline',
            collisionBehavior: 'ignore',
            isAutoHide: false,
            body: 'Still offline',
          }}
          triggerLabel="Show 2"
        />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show 1'));
    });
    const first = getToastWrapperByText('You are offline');
    act(() => {
      fireEvent.click(
        within(first).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // Toast.spec.md FR8: a leaving toast still holds its uniqueID, so the
    // ignored namesake is neither shown nor announced.
    act(() => {
      fireEvent.click(screen.getByText('Show 2'));
    });
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Still offline')).toBeNull();
    act(() => {
      completeExit(first.dataset.toastId ?? '');
    });
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
  });

  it('lets a leaving toast finish its exit when a new toast arrives with no cap', () => {
    render(
      <ToastViewport isTopLayer={false} maxVisible={0}>
        <ShowToastButton
          options={{isAutoHide: false, body: 'Saved'}}
          triggerLabel="Show 1"
        />
        <ShowToastButton
          options={{isAutoHide: false, body: 'Uploaded'}}
          triggerLabel="Show 2"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show 1'));
    });
    const first = getToastWrapperByText('Saved');
    const firstId = first.dataset.toastId ?? '';
    act(() => {
      fireEvent.click(
        within(first).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // maxVisible={0} shows every toast (Toast.spec.md FR7), so the closing
    // toast keeps its row and collapses (FR5) while the new one arrives.
    act(() => {
      fireEvent.click(screen.getByText('Show 2'));
    });
    expect(getToastWrapperByText('Saved').dataset.toastId).toBe(firstId);
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    act(() => {
      completeExit(firstId);
    });
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('drops a second ignore toast with the same uniqueID raised in the same handler', () => {
    function ShowTwoIgnored() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            toast({
              uniqueID: 'offline',
              collisionBehavior: 'ignore',
              isAutoHide: false,
              body: 'You are offline',
            });
            toast({
              uniqueID: 'offline',
              collisionBehavior: 'ignore',
              isAutoHide: false,
              body: 'Still offline',
            });
          }}>
          Show twice
        </button>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <ShowTwoIgnored />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show twice'));
    });
    // Toast.spec.md FR8 and ORD1: the ignored namesake is neither shown nor
    // announced, even before the first toast renders.
    expect(announceSpy).toHaveBeenCalledTimes(1);
    expect(announceSpy).toHaveBeenLastCalledWith('You are offline', 'polite');
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('You are offline');
  });

  it('leaves no row behind when a new toast takes the last visible slot from a leaving one', () => {
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <ShowToastButton
          options={{isAutoHide: false, body: 'Saved'}}
          triggerLabel="Show 1"
        />
        <ShowToastButton
          options={{isAutoHide: false, body: 'Uploaded'}}
          triggerLabel="Show 2"
        />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show 1'));
    });
    const first = getToastWrapperByText('Saved');
    act(() => {
      fireEvent.click(
        within(first).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // A new toast arrives at once; with one visible slot it takes the place of
    // the leaving toast, which can no longer finish its exit on screen.
    act(() => {
      fireEvent.click(screen.getByText('Show 2'));
    });
    const second = getToastWrapperByText('Uploaded');
    act(() => {
      fireEvent.click(
        within(second).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      completeExit(second.dataset.toastId ?? '');
    });
    // Nothing is left: no row comes back, and the landmark is gone.
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
    expect(screen.queryByRole('region', {name: 'Notifications'})).toBeNull();
  });

  it('reports the namesake once when one handler shows a repeat and dismisses the namesake', () => {
    const onHide = vi.fn();
    function RepeatAndDismiss() {
      const toast = useToast();
      const dismissFirstRef = useRef<(() => void) | null>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              dismissFirstRef.current = toast({
                uniqueID: 'offline',
                isAutoHide: false,
                body: 'Offline',
                onHide,
              });
            }}>
            Show first
          </button>
          <button
            type="button"
            onClick={() => {
              toast({
                uniqueID: 'offline',
                isAutoHide: false,
                body: 'Still offline',
              });
              dismissFirstRef.current?.();
            }}>
            Repeat and dismiss
          </button>
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <RepeatAndDismiss />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show first'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Repeat and dismiss'));
    });
    // As on `main`: the repeat replaces its namesake in place, and the
    // namesake's dismissal reports it once.
    expect(onHide).toHaveBeenCalledTimes(1);
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Still offline');
  });

  it('leaves no row behind when one handler raises a toast at the cap and dismisses the one it pushed out', () => {
    const onHide = vi.fn();
    function UndoFlow() {
      const toast = useToast();
      const dismissDeletedRef = useRef<(() => void) | null>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              dismissDeletedRef.current = toast({
                isAutoHide: false,
                body: 'Deleted',
                onHide,
              });
            }}>
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              // An undo shows its confirmation, then dismisses its own toast.
              toast({isAutoHide: false, body: 'Restored'});
              dismissDeletedRef.current?.();
            }}>
            Undo
          </button>
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <UndoFlow />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Delete'));
    });
    act(() => {
      fireEvent.click(screen.getByText('Undo'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
    const restored = getToastWrapperByText('Restored');
    act(() => {
      fireEvent.click(
        within(restored).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    act(() => {
      completeExit(restored.dataset.toastId ?? '');
    });
    // Nothing is left: no row comes back, and the landmark is gone.
    expect(document.querySelectorAll('[data-toast-id]')).toHaveLength(0);
    expect(screen.queryByRole('region', {name: 'Notifications'})).toBeNull();
  });

  it('reports a leaving toast once when it is dismissed again after a new toast pushed it out of view', () => {
    const onHide = vi.fn();
    function ShowPushDismiss() {
      const toast = useToast();
      const dismissFirstRef = useRef<(() => void) | null>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              dismissFirstRef.current = toast({
                isAutoHide: false,
                body: 'Saved',
                onHide,
              });
            }}>
            Show first
          </button>
          <button
            type="button"
            onClick={() => {
              toast({isAutoHide: false, body: 'Uploaded'});
            }}>
            Show second
          </button>
          <button type="button" onClick={() => dismissFirstRef.current?.()}>
            Dismiss first
          </button>
        </>
      );
    }
    render(
      <ToastViewport isTopLayer={false} maxVisible={1}>
        <ShowPushDismiss />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show first'));
    });
    // It starts leaving, and reports it.
    act(() => {
      fireEvent.click(screen.getByText('Dismiss first'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
    // A new toast takes the only visible slot: the leaving one leaves the list.
    act(() => {
      fireEvent.click(screen.getByText('Show second'));
    });
    // Its dismissal again reports nothing more.
    act(() => {
      fireEvent.click(screen.getByText('Dismiss first'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Uploaded');
  });

  it('reports nothing for a toast replaced before it rendered, however often one handler dismisses it', () => {
    const onHide = vi.fn();
    function ShowReplaceDismiss() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            const dismissFirst = toast({
              uniqueID: 'offline',
              isAutoHide: false,
              body: 'Offline',
              onHide,
            });
            toast({
              uniqueID: 'offline',
              isAutoHide: false,
              body: 'Still offline',
            });
            dismissFirst();
            dismissFirst();
          }}>
          Show, replace and dismiss
        </button>
      );
    }
    render(
      <ToastViewport isTopLayer={false}>
        <ShowReplaceDismiss />
      </ToastViewport>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show, replace and dismiss'));
    });
    // Toast.spec.md FR3: a toast replaced through uniqueID is not dismissed
    // and reports no onHide.
    expect(onHide).not.toHaveBeenCalled();
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Still offline');
  });

  it('reports nothing for a toast only a discarded render showed, when a repeat replaces and dismisses it', async () => {
    // A transition that suspends for good: React renders it, then keeps the
    // committed tree and never commits that render.
    const forever = new Promise<never>(() => {});
    function Forever(): null {
      use(forever);
      return null;
    }
    let toast: ReturnType<typeof useToast> | null = null;
    function Capture(): null {
      toast = useToast();
      return null;
    }
    function Screen({isPending = false}: {isPending?: boolean}) {
      return (
        <ToastViewport isTopLayer={false}>
          <Capture />
          <Suspense fallback={null}>{isPending ? <Forever /> : null}</Suspense>
        </ToastViewport>
      );
    }
    const onHide = vi.fn();
    let dismissFirst: (() => void) | null = null;
    const {rerender} = render(<Screen />);
    // Raised in a transition React renders and never commits.
    await act(async () => {
      startTransition(() => {
        dismissFirst =
          toast?.({
            uniqueID: 'offline',
            isAutoHide: false,
            body: 'Offline',
            onHide,
          }) ?? null;
        rerender(<Screen isPending />);
      });
    });
    expect(screen.queryByText('Offline')).toBeNull();

    act(() => {
      toast?.({uniqueID: 'offline', isAutoHide: false, body: 'Still offline'});
      dismissFirst?.();
    });

    // Toast.spec.md FR3: it never rendered, so its replacement reports no
    // onHide for it.
    expect(onHide).not.toHaveBeenCalled();
  });

  it('replaces a leaving namesake in place under overwrite and announces it again', () => {
    renderViewport(
      <>
        <ShowToastButton
          options={{uniqueID: 'upload', isAutoHide: false, body: 'Upload 30%'}}
          triggerLabel="Show 1"
        />
        <ShowToastButton
          options={{uniqueID: 'upload', isAutoHide: false, body: 'Upload 31%'}}
          triggerLabel="Show 2"
        />
      </>,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show 1'));
    });
    const first = getToastWrapperByText('Upload 30%');
    act(() => {
      fireEvent.click(
        within(first).getByRole('button', {name: 'Dismiss notification'}),
      );
    });
    // Toast.spec.md FR8: an overwrite replaces its namesake in place even
    // while it is leaving, and is announced again.
    act(() => {
      fireEvent.click(screen.getByText('Show 2'));
    });
    expect(announceSpy).toHaveBeenLastCalledWith('Upload 31%', 'polite');
    expect(screen.queryByText('Upload 30%')).toBeNull();
    const rows = [...document.querySelectorAll('[data-toast-id]')];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Upload 31%');
  });
});

describe('toast timer lifecycle (#3589)', () => {
  it('dismisses through the close button clicked from a layout effect in its first commit', () => {
    // The dismissal is stored before any layout effect of the toast's first
    // commit, so a click from one already dismisses the toast.
    function ClosesOnMount() {
      const ref = useRef<HTMLSpanElement>(null);
      useLayoutEffect(() => {
        const card = ref.current?.closest('[data-type]');
        if (card instanceof HTMLElement) {
          within(card)
            .getByRole('button', {name: 'Dismiss notification'})
            .click();
        }
      }, []);
      return <span ref={ref}>Closes on mount</span>;
    }
    const onHide = vi.fn();
    renderViewport(
      <ShowToastButton
        options={{body: <ClosesOnMount />, isAutoHide: false, onHide}}
        triggerLabel="Show"
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onHide).toHaveBeenCalledWith('manual');
  });

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

  // spec:Toast FR2/AR3: each pause condition is held on its own, so one
  // ending never resumes the timer while another still holds.
  function showPausableToast(onHide: () => void) {
    renderViewport(
      <ShowToastButton
        options={{
          body: 'Held',
          autoHideDuration: 3000,
          endContent: <Button label="Undo" />,
          onHide,
        }}
        triggerLabel="Show held"
      />,
    );
    act(() => {
      fireEvent.click(screen.getByText('Show held'));
    });
    const viewport = screen.getByRole('region', {name: 'Notifications'});
    // The row's wrapper holds the clip, which holds the card.
    const card =
      getToastWrapperByText('Held').firstElementChild?.firstElementChild;
    if (!(card instanceof HTMLElement)) {
      throw new Error('toast card not found');
    }
    return {card, action: within(card).getByRole('button', {name: 'Undo'})};
  }

  it('keeps the timer paused while focus is inside after the pointer leaves', () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      const {card, action} = showPausableToast(onHide);
      act(() => {
        fireEvent.mouseEnter(card);
      });
      act(() => {
        action.focus();
      });
      act(() => {
        fireEvent.mouseLeave(card);
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).not.toHaveBeenCalled();
      // Focus leaving the card releases the last hold.
      act(() => {
        action.blur();
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timer paused while the pointer is over it after the window regains focus', () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      const {card} = showPausableToast(onHide);
      act(() => {
        fireEvent.blur(window);
      });
      act(() => {
        fireEvent.mouseEnter(card);
      });
      act(() => {
        fireEvent.focus(window);
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).not.toHaveBeenCalled();
      act(() => {
        fireEvent.mouseLeave(card);
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the focus hold when the focused control is removed', () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      const {card, action} = showPausableToast(onHide);
      act(() => {
        fireEvent.mouseEnter(card);
      });
      act(() => {
        action.focus();
      });
      // A control that unmounts while focused fires no blur.
      act(() => {
        action.remove();
      });
      act(() => {
        fireEvent.mouseLeave(card);
      });
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timer paused while focus moves between controls inside the card', () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      const {card, action} = showPausableToast(onHide);
      const dismiss = within(card)
        .getAllByRole('button')
        .find(button => button !== action);
      if (!dismiss) {
        throw new Error('dismiss button not found');
      }
      act(() => {
        action.focus();
      });
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      act(() => {
        dismiss.focus();
      });
      // Moving between the card's own controls neither restarts nor resumes
      // the timer.
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onHide).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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

describe('ToastViewport committed list, read by a cleanup in the commit that shows a toast', () => {
  it('reports onHide for a toast shown in that commit, when an unmounting child replaces and dismisses it', () => {
    const onHideA = vi.fn();
    let dismissA: (() => void) | null = null;
    function Leaving() {
      const toast = useToast();
      // Runs as the commit that shows toast A unmounts this child.
      useLayoutEffect(
        () => () => {
          toast({uniqueID: 'u', isAutoHide: false, body: 'Toast B'});
          dismissA?.();
        },
        [toast],
      );
      return null;
    }
    function Controls({onLeave}: {onLeave: () => void}) {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            dismissA = toast({
              uniqueID: 'u',
              isAutoHide: false,
              body: 'Toast A',
              onHide: onHideA,
            });
            onLeave();
          }}>
          Show and leave
        </button>
      );
    }
    function App() {
      const [isShown, setIsShown] = useState(true);
      return (
        <ToastViewport isTopLayer={false}>
          {isShown ? <Leaving /> : null}
          <Controls onLeave={() => setIsShown(false)} />
        </ToastViewport>
      );
    }
    render(<App />);

    act(() => {
      fireEvent.click(screen.getByText('Show and leave'));
    });

    // Toast A is in the list this commit applies, so the cleanup's repeat
    // keeps it findable, and its dismissal reports it (Toast.spec.md FR3).
    expect(onHideA).toHaveBeenCalledTimes(1);
  });

  it('reports onHide for a shown toast, when a child hidden by an Activity replaces and dismisses it', () => {
    const onHideA = vi.fn();
    let dismissA: (() => void) | null = null;
    function Hiding() {
      const toast = useToast();
      // Runs as the Activity hides the tree, after toast A has shown.
      useLayoutEffect(
        () => () => {
          if (dismissA != null) {
            toast({uniqueID: 'u', isAutoHide: false, body: 'Toast B'});
            dismissA();
          }
        },
        [toast],
      );
      return null;
    }
    function App({mode}: {mode: 'visible' | 'hidden'}) {
      return (
        <React.Activity mode={mode}>
          <ToastViewport isTopLayer={false}>
            <Hiding />
            <Shower />
          </ToastViewport>
        </React.Activity>
      );
    }
    function Shower() {
      const toast = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            dismissA = toast({
              uniqueID: 'u',
              isAutoHide: false,
              body: 'Toast A',
              onHide: onHideA,
            });
          }}>
          Show
        </button>
      );
    }
    const {rerender} = render(<App mode="visible" />);
    act(() => {
      fireEvent.click(screen.getByText('Show'));
    });
    expect(
      [...document.querySelectorAll('[data-toast-id]')].some(row =>
        row.textContent?.includes('Toast A'),
      ),
    ).toBe(true);

    rerender(<App mode="hidden" />);

    expect(onHideA).toHaveBeenCalledTimes(1);
  });
});
