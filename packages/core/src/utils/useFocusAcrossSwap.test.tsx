// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusAcrossSwap.test.tsx
 * @input DOM swaps, owned-content refs, and React ref cleanup
 * @output Focus ownership and forwarded-ref regression coverage
 * @position Colocated tests for the internal focus-swap hook
 */

import {Activity, StrictMode, createRef, type Ref} from 'react';
import {render, screen} from '@testing-library/react';
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
  forwardedRef?: Ref<HTMLElement>;
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
    isDisabled,
    getFocusTarget: getContentOwner,
  });
  return (
    <div key={`${isDisabled}-${revision}`} role="button" tabIndex={-1}>
      <span ref={ref}>Owned content</span>
    </div>
  );
}

describe('useFocusAcrossSwap', () => {
  it('preserves direct-ref focus swaps and clears the forwarded object ref', () => {
    const ref = createRef<HTMLElement>();
    const {rerender, unmount} = render(
      <DirectExample isDisabled={false} forwardedRef={ref} />,
    );
    screen.getByRole('button').focus();
    rerender(<DirectExample isDisabled forwardedRef={ref} />);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(ref.current).toBe(screen.getByRole('button'));
    rerender(<DirectExample isDisabled={false} forwardedRef={ref} />);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(ref.current).toBe(screen.getByRole('button'));
    unmount();
    expect(ref.current).toBeNull();
  });

  it('restores the focused owner through its content and releases callback refs', () => {
    const release = vi.fn();
    const ref = vi.fn((node: HTMLSpanElement | null) => {
      if (node) {
        return release;
      }
    });
    const {rerender, unmount} = render(
      <ContentExample isDisabled={false} forwardedRef={ref} />,
    );
    screen.getByRole('button').focus();
    rerender(<ContentExample isDisabled forwardedRef={ref} />);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(ref).toHaveBeenLastCalledWith(screen.getByText('Owned content'));
    expect(release).toHaveBeenCalledOnce();
    rerender(<ContentExample isDisabled={false} forwardedRef={ref} />);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(release).toHaveBeenCalledTimes(2);
    unmount();
    expect(release).toHaveBeenCalledTimes(3);
    expect(ref).not.toHaveBeenCalledWith(null);
  });

  it('does not restore owned-content focus for an unrelated replacement', () => {
    const {rerender} = render(<ContentExample isDisabled={false} />);
    screen.getByRole('button').focus();
    rerender(<ContentExample isDisabled={false} revision={1} />);
    expect(document.activeElement).toBe(document.body);
    rerender(<ContentExample isDisabled revision={1} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('honors a focus handoff during direct-ref cleanup', () => {
    let handOff = false;
    const ref = (node: HTMLElement | null) => {
      if (node) {
        return () => {
          if (handOff) {
            screen.getByRole('textbox').focus();
          }
        };
      }
    };
    const fixture = (isDisabled: boolean) => (
      <>
        <DirectExample isDisabled={isDisabled} forwardedRef={ref} />
        <input aria-label="Notes" />
      </>
    );
    const {rerender} = render(fixture(false));
    screen.getByRole('button').focus();
    handOff = true;
    rerender(fixture(true));
    expect(screen.getByRole('textbox')).toHaveFocus();
    rerender(fixture(false));
    expect(screen.getByRole('textbox')).toHaveFocus();
    handOff = false;
  });

  it('does not restore owned-content focus when availability changes while hidden', () => {
    const fixture = (isHidden: boolean, isDisabled: boolean) => (
      <Activity mode={isHidden ? 'hidden' : 'visible'}>
        <ContentExample isDisabled={isDisabled} />
      </Activity>
    );
    const {rerender} = render(fixture(false, false));
    const control = screen.getByRole('button');
    control.focus();
    rerender(fixture(true, false));
    control.blur();
    rerender(fixture(true, true));
    rerender(fixture(false, true));
    expect(document.activeElement).toBe(document.body);
  });

  it.each(['direct', 'content'] as const)(
    'leaves focus on the page after %s refs detach and reattach through Activity',
    mode => {
      const fixture = (isHidden: boolean) => (
        <StrictMode>
          <Activity mode={isHidden ? 'hidden' : 'visible'}>
            {mode === 'direct' ? (
              <DirectExample isDisabled={false} />
            ) : (
              <ContentExample isDisabled={false} />
            )}
          </Activity>
        </StrictMode>
      );
      const {rerender} = render(fixture(false));
      const control = screen.getByRole('button');
      control.focus();
      rerender(fixture(true));
      control.blur();
      rerender(fixture(false));
      expect(document.activeElement).toBe(document.body);
      rerender(fixture(false));
      expect(document.activeElement).toBe(document.body);
    },
  );
});
