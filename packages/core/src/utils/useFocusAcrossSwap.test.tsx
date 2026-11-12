// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useFocusAcrossSwap.test.tsx
 * @input React root swaps and forwarded refs
 * @output Focus ownership and ref lifecycle regression tests
 * @position Tests the shared focus handoff used by link controls
 */

import {createRef, StrictMode, type Ref} from 'react';
import {render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {useFocusAcrossSwap} from './useFocusAcrossSwap';

const resolveControl = (node: HTMLElement) =>
  node.closest<HTMLElement>('a,button');

function Swap({
  button = false,
  descendant = false,
  restoreFocus = true,
  ref,
}: {
  button?: boolean;
  descendant?: boolean;
  restoreFocus?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  const focusRef = useFocusAcrossSwap(ref, {
    resolveFocusTarget: descendant ? resolveControl : undefined,
    restoreFocus,
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

describe('useFocusAcrossSwap', () => {
  it('keeps both directions for existing direct-root callers', () => {
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

  it('hands focus from an owned descendant to its replacement control without scrolling', () => {
    const {getByRole, rerender} = render(<Swap descendant />);
    getByRole('link').focus();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    rerender(<Swap descendant button />);
    expect(getByRole('button')).toHaveFocus();
    expect(focus).toHaveBeenCalledExactlyOnceWith({preventScroll: true});
    focus.mockRestore();
  });

  it('lets a caller limit restoration to the disabled replacement', () => {
    const {getByRole, rerender} = render(
      <Swap descendant restoreFocus={false} />,
    );
    getByRole('link').focus();
    rerender(<Swap descendant button />);
    expect(getByRole('button')).toHaveFocus();
    rerender(<Swap descendant restoreFocus={false} />);
    expect(getByRole('link')).not.toHaveFocus();
    rerender(<Swap descendant button />);
    expect(getByRole('button')).not.toHaveFocus();
  });

  it('does not steal focus claimed during forwarded-ref cleanup', () => {
    const other = document.createElement('button');
    document.body.append(other);
    const release = vi.fn(() => other.focus());
    const ref = vi.fn(() => release);
    const {getByRole, rerender, unmount} = render(<Swap ref={ref} />);
    getByRole('link').focus();
    rerender(<Swap ref={ref} button />);
    expect(other).toHaveFocus();
    expect(release).toHaveBeenCalledOnce();
    expect(ref).toHaveBeenLastCalledWith(
      getByRole('button', {name: 'Destination'}),
    );
    unmount();
    expect(release).toHaveBeenCalledTimes(2);
    other.remove();
  });

  it('does not restore focus from a control that did not hold it', () => {
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

  it("reads focus from the control's own document", () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDocument = frame.contentDocument!;
    const {getByRole, rerender, unmount} = render(<Swap descendant />, {
      container: frameDocument.body,
    });
    getByRole('link').focus();
    rerender(<Swap descendant button />);
    expect(frameDocument.activeElement).toBe(getByRole('button'));
    unmount();
    frame.remove();
  });

  it('reads focus inside an open shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'open'});
    const container = document.createElement('div');
    shadow.append(container);
    const {getByRole, rerender, unmount} = render(<Swap descendant />, {
      container,
    });
    getByRole('link').focus();
    rerender(<Swap descendant button />);
    expect(shadow.activeElement).toBe(getByRole('button'));
    unmount();
    host.remove();
  });
});
