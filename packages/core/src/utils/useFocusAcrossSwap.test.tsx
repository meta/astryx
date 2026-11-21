// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusAcrossSwap.test.tsx
 * @input React root swaps and forwarded refs
 * @output Focus ownership and ref lifecycle regression tests
 * @position Tests the shared focus handoff used by link controls
 */

import {
  Activity,
  createRef,
  StrictMode,
  useImperativeHandle,
  type Ref,
} from 'react';
import {render, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useFocusAcrossSwap} from './useFocusAcrossSwap';

const resolveControl = (node: HTMLElement) =>
  node.closest<HTMLElement>('a,button');

function Swap({
  button = false,
  descendant = false,
  ref,
}: {
  button?: boolean;
  descendant?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const focusRef = useFocusAcrossSwap(ref, {
    getFocusTarget: descendant ? resolveControl : undefined,
  });
  const content = (
    <span ref={descendant ? focusRef : undefined}>Destination</span>
  );
  return button ? (
    <button ref={descendant ? undefined : focusRef} type="button">
      {content}
    </button>
  ) : (
    <a ref={descendant ? undefined : focusRef} href="#destination">
      {content}
    </a>
  );
}

function ImperativeRef({target, ref}: {target: object; ref?: Ref<unknown>}) {
  useImperativeHandle(ref, () => target, [target]);
  return null;
}

describe('useFocusAcrossSwap', () => {
  it('forwards an imperative handle without treating it as a DOM focus target', () => {
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

  it('keeps direct-root swaps and forwarded object refs working', () => {
    const ref = createRef<HTMLElement>();
    const {getByRole, rerender, unmount} = render(<Swap ref={ref} />);
    getByRole('link').focus();
    rerender(<Swap ref={ref} button />);
    expect(getByRole('button')).toHaveFocus();
    expect(ref.current).toBe(getByRole('button'));
    rerender(<Swap ref={ref} />);
    expect(getByRole('link')).toHaveFocus();
    unmount();
    expect(ref.current).toBeNull();
  });

  it('restores the control through its owned content without scrolling', () => {
    const {getByRole, rerender} = render(<Swap descendant />);
    getByRole('link').focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      rerender(<Swap descendant button />);
      expect(getByRole('button')).toHaveFocus();
      expect(focus).toHaveBeenCalledWith({preventScroll: true});
      rerender(<Swap descendant />);
      expect(getByRole('link')).toHaveFocus();
    } finally {
      focus.mockRestore();
    }
  });

  it('does not focus a replacement when the old control was not focused', () => {
    const {getByRole, rerender} = render(<Swap />);
    rerender(<Swap button />);
    expect(getByRole('button')).not.toHaveFocus();
  });

  it('does not refocus the same node after ref replacement or StrictMode replay', () => {
    const first = vi.fn();
    const second = vi.fn();
    const {getByRole, rerender} = render(
      <StrictMode>
        <Swap ref={first} />
      </StrictMode>,
    );
    const link = getByRole('link');
    link.focus();
    const focus = vi.spyOn(link, 'focus');
    rerender(
      <StrictMode>
        <Swap ref={second} />
      </StrictMode>,
    );
    expect(link).toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
    focus.mockRestore();
  });

  it('honors a caller focus handoff outside an iframe during ref cleanup', () => {
    const frame = document.createElement('iframe');
    const other = document.createElement('button');
    document.body.append(frame, other);
    const release = vi.fn(() => other.focus());
    const ref = vi.fn(() => release);
    const frameDocument = frame.contentDocument!;
    const {getByRole, rerender, unmount} = render(<Swap ref={ref} />, {
      container: frameDocument.body,
    });
    try {
      getByRole('link').focus();
      rerender(<Swap ref={ref} button />);
      expect(document.activeElement).toBe(other);
      expect(frameDocument.activeElement).not.toBe(getByRole('button'));
      expect(ref).toHaveBeenLastCalledWith(getByRole('button'));
      expect(release).toHaveBeenCalledOnce();
    } finally {
      unmount();
      frame.remove();
      other.remove();
    }
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('discards owned-content focus when Activity disconnects it', () => {
    const fixture = (hidden: boolean, isDisabled: boolean) => (
      <Activity mode={hidden ? 'hidden' : 'visible'}>
        <Swap descendant button={isDisabled} />
      </Activity>
    );
    const {getByRole, rerender} = render(fixture(false, false));
    const link = getByRole('link');
    link.focus();
    rerender(fixture(true, false));
    link.blur();
    rerender(fixture(true, true));
    rerender(fixture(false, true));
    expect(getByRole('button')).not.toHaveFocus();
  });

  it('restores focus inside a shadow root in another document', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const host = frameDocument.createElement('div');
    frameDocument.body.append(host);
    const shadow = host.attachShadow({mode: 'open'});
    const container = frameDocument.createElement('div');
    shadow.append(container);
    const {getByRole, rerender, unmount} = render(<Swap descendant />, {
      container,
    });
    try {
      getByRole('link').focus();
      rerender(<Swap descendant button />);
      expect(shadow.activeElement).toBe(getByRole('button'));
    } finally {
      unmount();
      frame.remove();
    }
  });
});
