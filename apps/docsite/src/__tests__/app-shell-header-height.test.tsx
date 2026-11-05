// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import {useRef} from 'react';
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useAppShellHeaderHeight} from '../lib/useAppShellHeaderHeight';

const HEADER_HEIGHT_VAR = '--appshell-header-height';

let headerHeight = 0;
let notifyResize: (() => void) | null = null;
const disconnectSpy = vi.fn();

function Nav() {
  const ref = useRef<HTMLElement>(null);
  useAppShellHeaderHeight(ref);
  return <nav ref={ref} />;
}

function readHeaderHeightVar() {
  return document.documentElement.style.getPropertyValue(HEADER_HEIGHT_VAR);
}

beforeEach(() => {
  headerHeight = 0;
  notifyResize = null;
  disconnectSpy.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnectSpy();
      }
    },
  );
  // Only the AppShell header has a size, so measuring the nav instead of the
  // header it sits in would read 0.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const height = this.classList.contains('astryx-app-shell-header')
        ? headerHeight
        : 0;
      return {height} as DOMRect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty(HEADER_HEIGHT_VAR);
});

describe('useAppShellHeaderHeight', () => {
  it('publishes the whole header height, banner included, and follows resizes', () => {
    // Canary banner (84px) above the nav (48px).
    headerHeight = 132;
    render(
      <div className="astryx-app-shell-header">
        <div role="alert">Canary</div>
        <Nav />
      </div>,
    );
    expect(readHeaderHeightVar()).toBe('132px');

    // Dismissing the banner leaves the nav alone.
    headerHeight = 48;
    act(() => notifyResize?.());
    expect(readHeaderHeightVar()).toBe('48px');
  });

  it('restores the stylesheet seed and stops observing on unmount', () => {
    headerHeight = 132;
    const {unmount} = render(
      <div className="astryx-app-shell-header">
        <Nav />
      </div>,
    );
    unmount();
    expect(readHeaderHeightVar()).toBe('');
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a nav rendered outside the header, like the mobile drawer copy', () => {
    headerHeight = 132;
    render(<Nav />);
    expect(readHeaderHeightVar()).toBe('');
    expect(notifyResize).toBeNull();
  });
});
