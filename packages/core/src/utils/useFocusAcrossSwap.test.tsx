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
  createRef,
  useImperativeHandle,
  type Ref,
} from 'react';
import {render, renderHook, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
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
    screen.getByRole('button').focus();
    rerender(fixture(true));
    expect(ref.current).toBe(screen.getByRole('button'));
    expect(ref.current).toHaveFocus();
    handOff = true;
    rerender(fixture(false));
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

  it('does not resurrect owned-content focus after availability changes while hidden', () => {
    const fixture = (isHidden: boolean, isDisabled: boolean) => (
      <StrictMode>
        <Activity mode={isHidden ? 'hidden' : 'visible'}>
          <ContentExample isDisabled={isDisabled} />
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
});
