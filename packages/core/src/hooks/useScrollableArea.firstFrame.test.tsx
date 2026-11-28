// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollableArea.firstFrame.test.tsx
 * @input ScrollableArea, CodeBlock and BottomSheetPanel with mocked viewport
 *   geometry, and a ResizeObserver that never notifies
 * @output Proof that a viewport which keeps its sticky containment, and so
 *   scrolls from its first frame, is a tab stop in its first commit when its
 *   content overflows, before any resize notification; and that a viewport
 *   with the default containment still reads no layout as it mounts
 * @position Integration tests of the shared scroll hook's first measurement
 *   in its adopters; useScrollableArea.test.tsx covers the hook alone
 */

import {render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {BottomSheetPanel} from '../BottomSheet/BottomSheetPanel';
import {CodeBlock} from '../CodeBlock/CodeBlock';
import {ScrollableArea} from '../ScrollableArea/ScrollableArea';

const GEOMETRY = {
  clientWidth: 300,
  clientHeight: 100,
  scrollWidth: 300,
  scrollHeight: 300,
};

function isViewport(element: unknown): element is HTMLElement {
  return (
    element instanceof HTMLElement && element.hasAttribute('data-scroll-axis')
  );
}

/** Each element's geometry reads, by property, while the mocks are on. */
let reads: Record<keyof typeof GEOMETRY, number>;

beforeEach(() => {
  reads = {clientWidth: 0, clientHeight: 0, scrollWidth: 0, scrollHeight: 0};
  // A browser's ResizeObserver notifies after the first frame's layout. This
  // one never does, so only a measurement before that frame can set the tab
  // stop.
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(function () {
      return {observe: () => {}, unobserve: () => {}, disconnect: () => {}};
    }),
  );
  for (const key of Object.keys(GEOMETRY) as (keyof typeof GEOMETRY)[]) {
    vi.spyOn(HTMLElement.prototype, key, 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (!isViewport(this)) {
        return 0;
      }
      reads[key] += 1;
      return GEOMETRY[key];
    });
  }
  // jsdom does not resolve StyleX's dynamic CSS variables. A viewport that
  // keeps its sticky containment computes `auto` from its first render.
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const computed = nativeGetComputedStyle(element);
    if (!isViewport(element)) {
      return computed;
    }
    return new Proxy(computed, {
      // eslint-disable-next-line @typescript-eslint/promise-function-async -- Proxy traps must remain synchronous
      get(target, property) {
        if (property === 'overflowX' || property === 'overflowY') {
          return 'auto';
        }
        return Reflect.get(target, property, target);
      },
    });
  });
  // The sheet's visibility checks read client rects.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 20, 20),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('a viewport that scrolls from its first frame', () => {
  it('is a tab stop in the first commit of a ScrollableArea that keeps its sticky containment', () => {
    render(
      <ScrollableArea
        label="Messages"
        stickyContainment="always"
        data-testid="viewport">
        <p>Message history</p>
      </ScrollableArea>,
    );
    expect(screen.getByTestId('viewport')).toHaveAttribute('tabindex', '0');
  });

  it('is a tab stop in the first commit of a CodeBlock whose code overflows', () => {
    render(
      <CodeBlock
        code={Array.from({length: 40}, (_, line) => `line ${line}`).join('\n')}
      />,
    );
    const viewport = document.querySelector('[data-scroll-axis]');
    expect(viewport).toHaveAttribute('tabindex', '0');
  });

  it('is a tab stop in the first commit of a BottomSheet body whose text overflows', () => {
    render(
      <BottomSheetPanel
        label="Reading details"
        state={{kind: 'open', entering: false}}
        height="capped"
        onDismiss={() => {}}
        onScrimOpacity={() => {}}>
        Reading details body
      </BottomSheetPanel>,
    );
    expect(
      screen.getByRole('group', {name: 'Reading details'}),
    ).toHaveAttribute('tabindex', '0');
  });

  it('reads no layout as it mounts when it keeps the default containment', () => {
    render(
      <ScrollableArea label="Messages" data-testid="viewport">
        <p>Message history</p>
      </ScrollableArea>,
    );
    expect(reads).toEqual({
      clientWidth: 0,
      clientHeight: 0,
      scrollWidth: 0,
      scrollHeight: 0,
    });
    expect(screen.getByTestId('viewport')).not.toHaveAttribute('tabindex');
  });
});
