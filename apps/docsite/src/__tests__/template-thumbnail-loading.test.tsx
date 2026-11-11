// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import type * as ReactModule from 'react';
import type {ReactNode} from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const previewState = vi.hoisted(() => ({renders: [] as string[]}));
const loadState = vi.hoisted(() => ({
  isLoaded: true,
  loaded: new Set<string>(),
  preloads: [] as string[],
  resolvers: [] as Array<() => void>,
}));
const transitionState = vi.hoisted(() => ({
  callbacks: [] as Array<() => void>,
  deferred: false,
}));
const scrollGate = vi.hoisted(() => ({
  isCalm: true,
  waiting: new Set<() => void>(),
}));
// One near-viewport listener for each mounted thumbnail, in mount order.
const nearListeners = vi.hoisted(() => [] as Array<(isNear: boolean) => void>);
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
vi.mock('../components/templateComponents', () => {
  // The loaded components stand for the imported page modules. The registry
  // entries stand for the lazy wrappers, which a thumbnail must not render.
  const components: Record<string, () => ReactNode> = {
    first: () => {
      previewState.renders.push('first');
      return <div>First preview</div>;
    },
    second: () => {
      previewState.renders.push('second');
      return <div>Second preview</div>;
    },
  };
  const lazyComponents: Record<string, () => ReactNode> = {
    first: () => <div>Lazy first preview</div>,
    second: () => <div>Lazy second preview</div>,
  };
  return {
    TEMPLATE_COMPONENTS: lazyComponents,
    getLoadedTemplate: (slug: string) =>
      loadState.isLoaded || loadState.loaded.has(slug)
        ? components[slug]
        : undefined,
    preloadTemplate: (slug: string) => {
      loadState.preloads.push(slug);
      if (loadState.isLoaded) {
        return Promise.resolve(components[slug]);
      }
      return new Promise(resolve => {
        loadState.resolvers.push(() => {
          loadState.loaded.add(slug);
          resolve(components[slug]);
        });
      });
    },
  };
});

vi.mock('../components/templatePrefetch', () => ({
  observeNearViewport: (
    _element: Element,
    onChange: (isNear: boolean) => void,
  ) => {
    nearListeners.push(onChange);
    return () => {};
  },
  whenScrollIsCalm: (run: () => void) => {
    if (scrollGate.isCalm) {
      run();
      return () => {};
    }
    scrollGate.waiting.add(run);
    return () => {
      scrollGate.waiting.delete(run);
    };
  },
}));

import {TemplateThumbnail} from '../components/TemplateThumbnail';

type IntersectionCallback = IntersectionObserverCallback;

let intersectionCallbacks: IntersectionCallback[];
let intersectionOptions: Array<IntersectionObserverInit | undefined>;
let idleCallbacks: IdleRequestCallback[];

const idleDeadline = {
  didTimeout: false,
  timeRemaining: () => 50,
} as IdleDeadline;

beforeEach(() => {
  previewState.renders.length = 0;
  loadState.isLoaded = true;
  loadState.loaded.clear();
  loadState.preloads.length = 0;
  loadState.resolvers.length = 0;
  scrollGate.isCalm = true;
  scrollGate.waiting.clear();
  nearListeners.length = 0;
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

afterEach(async () => {
  cleanup();
  // The scheduler is shared by every test. Run the idle turns that are still
  // requested, so the next test starts with an idle scheduler.
  await Promise.resolve();
  await Promise.resolve();
  while (idleCallbacks.length > 0) {
    idleCallbacks.shift()?.(idleDeadline);
    await Promise.resolve();
    await Promise.resolve();
  }
  vi.unstubAllGlobals();
});

const visibleEntry = {isIntersecting: true} as IntersectionObserverEntry;
const hiddenEntry = {isIntersecting: false} as IntersectionObserverEntry;
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
  it('starts every visible template import before its render turn', () => {
    loadState.isLoaded = false;
    const view = render(
      <>
        <TemplateThumbnail slug="first" />
        <TemplateThumbnail slug="second" />
      </>,
    );
    expect(loadState.preloads).toEqual([]);

    act(() => {
      for (const callback of intersectionCallbacks) {
        callback([visibleEntry], {} as IntersectionObserver);
      }
    });

    expect(loadState.preloads).toEqual(['first', 'second']);
    expect(idleCallbacks).toHaveLength(1);
    expect(previewState.renders).toEqual([]);

    view.unmount();
    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).not.toHaveBeenCalled();
  });

  it('downloads a tile near the viewport in idle time, before the tile is visible', () => {
    loadState.isLoaded = false;
    render(<TemplateThumbnail slug="first" />);

    act(() => nearListeners[0]?.(true));
    expect(loadState.preloads).toEqual([]);
    expect(idleCallbacks).toHaveLength(1);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(loadState.preloads).toEqual(['first']);
    expect(startTransitionMock).not.toHaveBeenCalled();
    expect(previewState.renders).toEqual([]);
  });

  it('renders a visible tile before it downloads a tile that is only near', async () => {
    render(
      <>
        <TemplateThumbnail slug="first" />
        <TemplateThumbnail slug="second" />
      </>,
    );

    // The first tile is only near the viewport. The second tile is visible.
    act(() => {
      nearListeners[0]?.(true);
      nearListeners[1]?.(true);
      intersectionCallbacks[1]?.([visibleEntry], {} as IntersectionObserver);
    });
    expect(loadState.preloads).toEqual(['second']);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    await waitFor(() =>
      expect(screen.queryByText('Second preview')).not.toBeNull(),
    );
    expect(loadState.preloads).toEqual(['second']);

    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(loadState.preloads).toEqual(['second', 'first']);
    expect(previewState.renders).toEqual(['second']);
  });

  it('holds the download during a fast scroll', () => {
    loadState.isLoaded = false;
    scrollGate.isCalm = false;
    render(
      <>
        <TemplateThumbnail slug="first" />
        <TemplateThumbnail slug="second" />
      </>,
    );

    act(() => {
      nearListeners[0]?.(true);
      nearListeners[1]?.(true);
    });
    expect(idleCallbacks).toHaveLength(0);

    // The first tile leaves before the scroll slows down; the second stays.
    act(() => nearListeners[0]?.(false));
    act(() => {
      for (const run of [...scrollGate.waiting]) {
        run();
      }
    });
    act(() => idleCallbacks.shift()?.(idleDeadline));

    expect(loadState.preloads).toEqual(['second']);
    expect(idleCallbacks).toHaveLength(0);
  });

  it('holds the download of a visible tile during a fast scroll', async () => {
    loadState.isLoaded = false;
    scrollGate.isCalm = false;
    render(<TemplateThumbnail slug="first" />);

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    // The render turn arrives during the scroll and waits for the download.
    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(loadState.preloads).toEqual([]);

    scrollGate.isCalm = true;
    await act(async () => {
      for (const run of [...scrollGate.waiting]) {
        run();
      }
      for (const resolve of loadState.resolvers) {
        resolve();
      }
      // Lets the import's promise chain reach the render before act returns.
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(new Set(loadState.preloads)).toEqual(new Set(['first']));
    await waitFor(() =>
      expect(screen.queryByText('First preview')).not.toBeNull(),
    );
  });

  it('downloads nothing for a tile that leaves during a fast scroll', () => {
    loadState.isLoaded = false;
    scrollGate.isCalm = false;
    render(
      <>
        <TemplateThumbnail slug="first" />
        <TemplateThumbnail slug="second" />
      </>,
    );

    act(() => {
      for (const callback of intersectionCallbacks) {
        callback([visibleEntry], {} as IntersectionObserver);
      }
    });
    act(() => idleCallbacks.shift()?.(idleDeadline));
    act(() =>
      intersectionCallbacks[0]?.([hiddenEntry], {} as IntersectionObserver),
    );

    expect(scrollGate.waiting.size).toBe(1);
    act(() => {
      for (const run of [...scrollGate.waiting]) {
        run();
      }
    });
    expect(loadState.preloads).toEqual(['second']);
  });

  it('releases the queue when a thumbnail unmounts during its import', async () => {
    loadState.isLoaded = false;
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
    expect(idleCallbacks).toHaveLength(0);

    view.rerender(<TemplateThumbnail key="second" slug="second" />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(idleCallbacks).toHaveLength(1);
    loadState.isLoaded = true;
    act(() => idleCallbacks.shift()?.(idleDeadline));
    await waitFor(() =>
      expect(screen.queryByText('Second preview')).not.toBeNull(),
    );
    expect(previewState.renders).toEqual(['second']);
  });

  it('waits for the import and then renders the loaded template', async () => {
    loadState.isLoaded = false;
    render(<TemplateThumbnail slug="first" />);

    act(() =>
      intersectionCallbacks[0]?.([visibleEntry], {} as IntersectionObserver),
    );
    act(() => idleCallbacks.shift()?.(idleDeadline));
    expect(startTransitionMock).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('skeleton')).toHaveLength(1);

    await act(async () => {
      for (const resolve of loadState.resolvers) {
        resolve();
      }
      // Lets the import's promise chain reach the render before act returns.
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await waitFor(() =>
      expect(screen.queryByText('First preview')).not.toBeNull(),
    );
    expect(startTransitionMock).toHaveBeenCalledOnce();
    expect(previewState.renders).toEqual(['first']);
  });
});
