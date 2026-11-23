// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusAcrossSwap.test.tsx
 * @input DOM swaps, owned-content refs, and React ref cleanup
 * @output Focus ownership and forwarded-ref regression coverage
 * @position Colocated tests for the internal focus-swap hook
 */

import {
  Activity,
  StrictMode,
  Suspense,
  createRef,
  useImperativeHandle,
  type Ref,
} from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {__resetInteractionModalityForTest} from './interactionModality';
import {useFocusAcrossSwap} from './useFocusAcrossSwap';

function getContentOwner(node: HTMLSpanElement) {
  return node.parentElement;
}

function DirectExample({
  isDisabled,
  forwardedRef,
}: {
  isDisabled: boolean;
  forwardedRef: Ref<HTMLElement>;
}) {
  const ref = useFocusAcrossSwap(forwardedRef);
  const Element = isDisabled ? 'div' : 'a';
  return (
    <Element ref={ref} role="button" tabIndex={-1}>
      Direct
    </Element>
  );
}

function ContentExample({
  isDisabled,
  revision = 0,
  forwardedRef,
}: {
  isDisabled: boolean;
  revision?: number;
  forwardedRef?: Ref<HTMLSpanElement>;
}) {
  const ref = useFocusAcrossSwap(forwardedRef, {
    getFocusTarget: getContentOwner,
  });
  return (
    <div key={`${isDisabled}-${revision}`} role="button" tabIndex={-1}>
      <span ref={ref}>Owned content</span>
    </div>
  );
}

function OptionalContentExample({
  hasContent,
  revision,
}: {
  hasContent: boolean;
  revision: number;
}) {
  const ref = useFocusAcrossSwap(undefined, {
    getFocusTarget: getContentOwner,
  });
  return (
    <div key={revision} role="button" tabIndex={-1}>
      {hasContent ? <span ref={ref}>Owned content</span> : null}
    </div>
  );
}

const NEVER = new Promise<never>(() => {});

function Suspender({isSuspended}: {isSuspended: boolean}) {
  if (isSuspended) {
    // A thrown promise suspends in the same render, so the row is hidden and
    // shown again within one task. `use` would retry it in a later task.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw NEVER;
  }
  return null;
}

function ImperativeRef({target, ref}: {target: object; ref?: Ref<unknown>}) {
  useImperativeHandle(ref, () => target, [target]);
  return null;
}

describe('useFocusAcrossSwap', () => {
  it('forwards a DOM-like imperative handle without treating it as a focus target', () => {
    const target = {nodeType: 1, getRootNode: () => null, focus: () => {}};
    const forwarded = vi.fn();
    const {result} = renderHook(() =>
      useFocusAcrossSwap<HTMLElement>(forwarded),
    );
    const {unmount} = render(
      <ImperativeRef ref={result.current} target={target} />,
    );
    expect(forwarded).toHaveBeenCalledWith(target);
    unmount();
    expect(forwarded).toHaveBeenLastCalledWith(null);
  });

  it('retains direct-ref focus but honors a caller cleanup handoff', () => {
    const ref = createRef<HTMLElement>();
    const notes = createRef<HTMLInputElement>();
    let handOff = false;
    const forwardedRef = (node: HTMLElement | null) => {
      ref.current = node;
      return () => {
        ref.current = null;
        if (handOff) {
          notes.current?.focus();
        }
      };
    };
    const fixture = (isDisabled: boolean) => (
      <>
        <DirectExample isDisabled={isDisabled} forwardedRef={forwardedRef} />
        <input ref={notes} aria-label="Notes" />
      </>
    );
    const {rerender, unmount} = render(fixture(false));
    rerender(fixture(true));
    expect(document.body).toHaveFocus();
    screen.getByRole('button').focus();
    rerender(fixture(false));
    expect(ref.current).toBe(screen.getByRole('button'));
    expect(ref.current).toHaveFocus();
    handOff = true;
    rerender(fixture(true));
    expect(notes.current).toHaveFocus();
    unmount();
    expect(ref.current).toBeNull();
  });

  it('restores the owned target across replacements and releases callback refs', () => {
    const release = vi.fn();
    const ref = vi.fn(() => release);
    const {rerender, unmount} = render(
      <ContentExample isDisabled={false} forwardedRef={ref} />,
    );
    screen.getByRole('button').focus();
    rerender(
      <ContentExample isDisabled={false} revision={1} forwardedRef={ref} />,
    );
    expect(screen.getByRole('button')).toHaveFocus();
    rerender(<ContentExample isDisabled revision={1} forwardedRef={ref} />);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(ref).toHaveBeenLastCalledWith(screen.getByText('Owned content'));
    unmount();
    expect(release).toHaveBeenCalledTimes(3);
    expect(ref).not.toHaveBeenCalledWith(null);
  });

  it('restores focus when the replacement finds focus on the document root', () => {
    const root = document.documentElement;
    const originalTabIndex = root.getAttribute('tabindex');
    root.tabIndex = -1;
    const ref = () => () => root.focus();
    const {rerender, unmount} = render(
      <ContentExample isDisabled={false} forwardedRef={ref} />,
    );
    try {
      screen.getByRole('button').focus();
      rerender(<ContentExample isDisabled forwardedRef={ref} />);
      expect(screen.getByRole('button')).toHaveFocus();
    } finally {
      unmount();
      if (originalTabIndex === null) {
        root.removeAttribute('tabindex');
      } else {
        root.setAttribute('tabindex', originalTabIndex);
      }
      root.blur();
    }
  });

  it('restores a frame target but respects a caller handoff outside its frame', () => {
    const frame = document.createElement('iframe');
    const outside = document.createElement('button');
    document.body.append(frame, outside);
    const doc = frame.contentDocument!;
    let handOff = false;
    const ref = () => () => {
      if (handOff) {
        outside.focus();
      }
    };
    const {rerender, unmount} = render(
      <ContentExample isDisabled={false} forwardedRef={ref} />,
      {container: doc.body},
    );
    try {
      doc.querySelector<HTMLElement>('[role="button"]')!.focus();
      rerender(<ContentExample isDisabled forwardedRef={ref} />);
      expect(doc.activeElement).toBe(doc.querySelector('[role="button"]'));
      expect(document.activeElement).toBe(frame);
      handOff = true;
      rerender(<ContentExample isDisabled={false} forwardedRef={ref} />);
      expect(outside).toHaveFocus();
    } finally {
      unmount();
      frame.remove();
      outside.remove();
    }
  });

  it('leaves a caller-selected shadow host focused through a swap', () => {
    const host = document.createElement('div');
    host.tabIndex = -1;
    document.body.append(host);
    const root = host.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    root.append(container);
    const ref = () => () => host.focus();
    const {rerender, unmount} = render(
      <ContentExample isDisabled={false} forwardedRef={ref} />,
      {container},
    );
    try {
      container.querySelector<HTMLElement>('[role="button"]')!.focus();
      rerender(<ContentExample isDisabled forwardedRef={ref} />);
      expect(host).toHaveFocus();
      expect(root.activeElement).toBeNull();
    } finally {
      unmount();
      host.remove();
    }
  });

  it('does not resurrect nested owned-content focus after availability changes while hidden', () => {
    const fixture = (isHidden: boolean, isDisabled: boolean) => (
      <StrictMode>
        <Activity mode={isHidden ? 'hidden' : 'visible'}>
          <div>
            <ContentExample isDisabled={isDisabled} />
          </div>
        </Activity>
      </StrictMode>
    );
    const {rerender} = render(fixture(false, false));
    const control = screen.getByRole('button');
    control.focus();
    rerender(fixture(true, false));
    control.blur();
    rerender(fixture(true, true));
    rerender(fixture(false, true));
    expect(document.activeElement).toBe(document.body);
    rerender(fixture(false, true));
    expect(document.activeElement).toBe(document.body);
  });

  it('does not focus a replacement for a row that Suspense hid before the handoff expired', () => {
    const fixture = (isSuspended: boolean, isDisabled: boolean) => (
      <Suspense fallback={<span>Loading</span>}>
        <DirectExample isDisabled={isDisabled} forwardedRef={createRef()} />
        <Suspender isSuspended={isSuspended} />
      </Suspense>
    );
    const {rerender} = render(fixture(false, false));
    screen.getByRole('button').focus();
    // Suspense hides the focused row and detaches its ref, but keeps the
    // hook's Effect connected. The row comes back replaced in the same task.
    rerender(fixture(true, false));
    rerender(fixture(false, true));
    expect(screen.getByRole('button')).not.toHaveFocus();
  });

  it('expires a handoff from a descendant ref that detaches while its Effect stays connected', async () => {
    const {rerender} = render(
      <OptionalContentExample hasContent revision={0} />,
    );
    screen.getByRole('button').focus();
    // The owned content leaves; the row keeps focus and the hook stays mounted.
    rerender(<OptionalContentExample hasContent={false} revision={0} />);
    await act(async () => {});
    screen.getByRole('button').blur();
    // A later replacement must not take focus from the earlier handoff.
    rerender(<OptionalContentExample hasContent revision={1} />);
    expect(screen.getByRole('button')).not.toHaveFocus();
  });
});

describe('useFocusAcrossSwap focus ring', () => {
  beforeEach(() => {
    __resetInteractionModalityForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The focus options the replacement row receives after `press` on the row. */
  function restoreFocusAfter(press: (row: HTMLElement) => void) {
    const forwardedRef = createRef<HTMLElement>();
    const {rerender} = render(
      <DirectExample isDisabled={false} forwardedRef={forwardedRef} />,
    );
    const row = screen.getByRole('button');
    press(row);
    row.focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    rerender(<DirectExample isDisabled forwardedRef={forwardedRef} />);
    const replacement = screen.getByRole('button');
    expect(replacement).not.toBe(row);
    expect(replacement).toHaveFocus();
    return focus.mock.calls.filter(
      (_call, index) => focus.mock.contexts[index] === replacement,
    );
  }

  it('restores focus without the keyboard ring after a pointer press', () => {
    const calls = restoreFocusAfter(row => fireEvent.pointerDown(row));
    expect(calls).toEqual([[{preventScroll: true, focusVisible: false}]]);
  });

  it('restores focus with the keyboard ring after a key press', () => {
    const calls = restoreFocusAfter(row =>
      fireEvent.keyDown(row, {key: 'ArrowDown'}),
    );
    expect(calls).toEqual([[{preventScroll: true}]]);
  });
});
