// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import type * as ReactModule from 'react';
import type {ReactNode} from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const previewState = vi.hoisted(() => ({renders: [] as string[]}));
const transitionState = vi.hoisted(() => ({
  callbacks: [] as Array<() => void>,
  deferred: false,
}));
const startTransitionMock = vi.hoisted(() =>
  vi.fn((callback: () => void) => {
    if (transitionState.deferred) {
      transitionState.callbacks.push(callback);
    } else {
      callback();
    }
  }),
);

vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof ReactModule>()),
  startTransition: startTransitionMock,
}));

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));

vi.mock('@astryxdesign/core/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@astryxdesign/core/theme', () => ({
  Theme: ({children}: {children: ReactNode}) => <>{children}</>,
}));

vi.mock('@astryxdesign/theme-neutral/built', () => ({neutralTheme: {}}));
vi.mock('../app/providers', () => ({useThemeMode: () => ({mode: 'light'})}));
vi.mock('../components/templateComponents', () => ({
  TEMPLATE_COMPONENTS: {
    first: () => {
      previewState.renders.push('first');
      return <div>First preview</div>;
    },
    second: () => {
      previewState.renders.push('second');
      return <div>Second preview</div>;
    },
  },
}));

import {TemplateThumbnail} from '../components/TemplateThumbnail';

type IntersectionCallback = IntersectionObserverCallback;

let intersectionCallbacks: IntersectionCallback[];
let intersectionOptions: Array<IntersectionObserverInit | undefined>;
let idleCallbacks: IdleRequestCallback[];

beforeEach(() => {
  previewState.renders.length = 0;
  startTransitionMock.mockClear();
  transitionState.callbacks.length = 0;
  transitionState.deferred = false;
  intersectionCallbacks = [];
  intersectionOptions = [];
  idleCallbacks = [];

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(
        callback: IntersectionCallback,
        options?: IntersectionObserverInit,
      ) {
        intersectionCallbacks.push(callback);
        intersectionOptions.push(options);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '0px';
      thresholds = [0];
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(_callback: ResizeObserverCallback) {}
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 360,
  });
  window.requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    idleCallbacks.push(callback);
    return idleCallbacks.length;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const visibleEntry = {isIntersecting: true} as IntersectionObserverEntry;
const hiddenEntry = {isIntersecting: false} as IntersectionObserverEntry;
const idleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
} as IdleDeadline;

describe('TemplateThumbnail loading', () => {
  it('renders visible templates one per idle turn instead of during hydration', async () => {
    render(
      <>
        <TemplateThumbnail slug="first" />
        <TemplateThumbnail slug="second" />
      </>,
    );

    expect(intersectionOptions).toEqual([
      {rootMargin: '0px'},
      {rootMargin: '0px'},
    ]);
    expect(idleCallbacks).toHaveLength(0);
    act(() => {
      for (const callback of intersectionCallbacks) {
        callback([visibleEntry], {} as IntersectionObserver);
      }
    });

    expect(previewState.renders).toEqual([]);
    expect(screen.getAllByTestId('skeleton')).toHaveLength(2);
    expect(idleCallbacks).toHaveLength(1);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText('First preview')).not.toBeNull(),
    );
    expect(previewState.renders).toEqual(['first']);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.queryByText('Second preview')).not.toBeNull(),
    );
    expect(previewState.renders).toEqual(['first', 'second']);
  });

  it('unmounts a loaded preview offscreen and queues it again on re-entry', async () => {
    render(<TemplateThumbnail slug="first" />);

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    act(() => idleCallbacks.shift()?.(idleDeadline));
    await waitFor(() =>
      expect(screen.queryByText('First preview')).not.toBeNull(),
    );

    act(() =>
      intersectionCallbacks[0]?.([hiddenEntry], {} as IntersectionObserver),
    );
    expect(screen.queryByText('First preview')).toBeNull();

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    expect(screen.queryByText('First preview')).toBeNull();
    expect(idleCallbacks).toHaveLength(1);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    await waitFor(() =>
      expect(screen.queryByText('First preview')).not.toBeNull(),
    );
    expect(startTransitionMock).toHaveBeenCalledTimes(2);
  });

  it('cancels queued work when a thumbnail leaves the viewport', () => {
    render(<TemplateThumbnail slug="first" />);

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    expect(idleCallbacks).toHaveLength(1);
    act(() =>
      intersectionCallbacks[0]?.([hiddenEntry], {} as IntersectionObserver),
    );
    act(() => idleCallbacks.shift()?.(idleDeadline));

    expect(startTransitionMock).not.toHaveBeenCalled();
    expect(previewState.renders).toEqual([]);
  });

  it('releases the next thumbnail when an active preview unmounts before commit', async () => {
    transitionState.deferred = true;
    const view = render(
      <>
        <TemplateThumbnail key="first" slug="first" />
        <TemplateThumbnail key="second" slug="second" />
      </>,
    );

    act(() => {
      for (const callback of intersectionCallbacks) {
        callback([visibleEntry], {} as IntersectionObserver);
      }
    });
    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).toHaveBeenCalledOnce();
    expect(transitionState.callbacks).toHaveLength(1);
    expect(idleCallbacks).toHaveLength(0);

    view.rerender(<TemplateThumbnail key="second" slug="second" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(idleCallbacks).toHaveLength(1);
    transitionState.deferred = false;
    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).toHaveBeenCalledTimes(2);
  });

  it('cancels queued work when a thumbnail unmounts', () => {
    const view = render(<TemplateThumbnail slug="first" />);

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    expect(idleCallbacks).toHaveLength(1);
    view.unmount();
    act(() => idleCallbacks.shift()?.(idleDeadline));

    expect(startTransitionMock).not.toHaveBeenCalled();
    expect(previewState.renders).toEqual([]);
  });
});
