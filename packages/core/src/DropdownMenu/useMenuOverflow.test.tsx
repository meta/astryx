// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file useMenuOverflow.test.tsx
 * @input A menu element, the open state, a remount of the menu element, and
 *   window and visual-viewport resize events
 * @output Evidence that the observers follow a remounted menu and that one
 *   viewport change measures the menu once
 * @position Unit coverage of the shared menu overflow hook
 */
import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useMenuOverflow} from './useMenuOverflow';

/** A menu whose list remounts when a footer comes or goes, as DropdownMenu's does. */
function Menu({hasFooter}: {hasFooter: boolean}) {
  const listRef = useRef<HTMLDivElement>(null);
  useMenuOverflow(listRef, 'rows', true);
  const list = <div ref={listRef} data-testid="list" />;
  return hasFooter ? (
    <section>
      {list}
      <footer>Footer</footer>
    </section>
  ) : (
    list
  );
}

describe('useMenuOverflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the list element that is mounted now, after it remounts', () => {
    const observed: Element[] = [];
    const disconnected: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private targets: Element[] = [];
        observe(target: Element) {
          this.targets.push(target);
          observed.push(target);
        }
        disconnect() {
          disconnected.push(...this.targets);
        }
        unobserve() {}
      },
    );
    const {rerender, getByTestId} = render(<Menu hasFooter={false} />);
    const first = getByTestId('list');
    expect(observed.at(-1)).toBe(first);

    rerender(<Menu hasFooter />);
    const second = getByTestId('list');
    expect(second).not.toBe(first);
    expect(observed.at(-1)).toBe(second);
    expect(disconnected).toContain(first);
  });
});

function OverflowProbe({isOpen}: {isOpen: boolean}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuOverflow(menuRef, null, isOpen);
  return <div ref={menuRef} data-testid="menu" />;
}

describe('useMenuOverflow resize measurement', () => {
  let scrollHeightReads = 0;
  let frames: FrameRequestCallback[] = [];
  const visualViewport = new EventTarget();

  const runFrames = () =>
    act(() => {
      const pending = frames;
      frames = [];
      for (const callback of pending) {
        callback(0);
      }
    });

  beforeEach(() => {
    scrollHeightReads = 0;
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      frames = frames.filter((_, index) => index + 1 !== handle);
    });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.dataset.testid === 'menu') {
          scrollHeightReads += 1;
        }
        return 0;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'visualViewport');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  });

  const resizeViewport = () => {
    window.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('resize'));
  };

  it('measures once when the window and the visual viewport both resize', () => {
    render(<OverflowProbe isOpen />);
    scrollHeightReads = 0;

    resizeViewport();
    runFrames();

    expect(scrollHeightReads).toBe(1);
  });

  it('measures again for a later resize', () => {
    render(<OverflowProbe isOpen />);
    scrollHeightReads = 0;

    resizeViewport();
    runFrames();
    resizeViewport();
    runFrames();

    expect(scrollHeightReads).toBe(2);
  });

  it('drops a pending resize measurement when the menu closes', () => {
    const view = render(<OverflowProbe isOpen />);
    scrollHeightReads = 0;

    resizeViewport();
    view.rerender(<OverflowProbe isOpen={false} />);
    runFrames();

    expect(scrollHeightReads).toBe(0);
  });
});
