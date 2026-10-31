// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {act, render} from '@testing-library/react';
import {useEffect, useRef} from 'react';
import {useFocusReturn, type FocusReturnOptions} from './focusReturn';
import {
  __resetInteractionModalityForTest,
  __startInteractionModalityTrackingForTest,
} from './interactionModality';

function Surface({
  isOpen,
  options,
  focusOnMount = true,
}: {
  isOpen: boolean;
  options?: FocusReturnOptions;
  focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusReturn(ref, isOpen, options);
  return <div ref={ref}>{isOpen && <Inner focusOnMount={focusOnMount} />}</div>;
}

// Content that moves focus inside on mount, as a dialog's autofocus does.
function Inner({focusOnMount}: {focusOnMount: boolean}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) {
      ref.current?.focus();
    }
  }, [focusOnMount]);
  return (
    <button ref={ref} type="button">
      Inside
    </button>
  );
}

function setup(props: Parameters<typeof Surface>[0]) {
  const opener = document.createElement('button');
  opener.textContent = 'Open';
  document.body.appendChild(opener);
  opener.focus();
  const view = render(<Surface {...props} />);
  return {opener, view};
}

afterEach(() => {
  document.body.innerHTML = '';
  __resetInteractionModalityForTest();
});

describe('useFocusReturn', () => {
  it('records the opener before content focuses itself, and returns focus on close', () => {
    const {opener, view} = setup({isOpen: true});
    expect(document.activeElement?.textContent).toBe('Inside');

    view.rerender(<Surface isOpen={false} />);

    expect(document.activeElement).toBe(opener);
  });

  it('returns focus when the surface unmounts while open', () => {
    const {opener, view} = setup({isOpen: true});
    expect(document.activeElement?.textContent).toBe('Inside');

    view.unmount();

    expect(document.activeElement).toBe(opener);
  });

  it('leaves focus where a consumer moved it before the close', () => {
    const {view} = setup({isOpen: true});
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    act(() => {
      elsewhere.focus();
    });

    view.rerender(<Surface isOpen={false} />);

    expect(document.activeElement).toBe(elsewhere);
  });

  it('skips the return when focus never entered and the caller requires it', () => {
    const {opener, view} = setup({
      isOpen: true,
      focusOnMount: false,
      options: {requireFocusInside: true},
    });
    act(() => {
      opener.blur();
    });

    view.rerender(
      <Surface
        isOpen={false}
        focusOnMount={false}
        options={{requireFocusInside: true}}
      />,
    );

    expect(document.activeElement).toBe(document.body);
  });

  it('rings the opener as the last input calls for: none after a pointer', () => {
    __startInteractionModalityTrackingForTest();
    const {opener, view} = setup({isOpen: true});
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    });
    const focus = vi.spyOn(opener, 'focus');

    view.rerender(<Surface isOpen={false} />);

    expect(focus).toHaveBeenCalledWith({focusVisible: false});
  });

  it("leaves the ring to the browser's plain focus when asked", () => {
    __startInteractionModalityTrackingForTest();
    const {opener, view} = setup({isOpen: true, options: {ring: 'browser'}});
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
    });
    const focus = vi.spyOn(opener, 'focus');

    view.rerender(<Surface isOpen={false} options={{ring: 'browser'}} />);

    expect(focus).toHaveBeenCalledWith();
  });
});
