// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type * as PrefetchModule from '../components/templatePrefetch';

type Prefetch = typeof PrefetchModule;

const VIEWPORT_HEIGHT = 1000;

type ObserverStub = {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Set<Element>;
  isDisconnected: boolean;
};

let observers: ObserverStub[];

async function loadModule(): Promise<Prefetch> {
  vi.resetModules();
  return import('../components/templatePrefetch');
}

function setConnection(connection: object | undefined): void {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

/** Moves the page by `pixels` over `ms` and sends one scroll event. */
function scrollBy(pixels: number, ms: number): void {
  vi.advanceTimersByTime(ms);
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: window.scrollY + pixels,
  });
  document.dispatchEvent(new Event('scroll'));
}

function report(observer: ObserverStub, target: Element, isNear: boolean) {
  observer.callback(
    [{target, isIntersecting: isNear} as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'performance']});
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      stub: ObserverStub;
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        this.stub = {
          callback,
          options,
          observed: new Set(),
          isDisconnected: false,
        };
        observers.push(this.stub);
      }
      observe(element: Element) {
        this.stub.observed.add(element);
      }
      unobserve(element: Element) {
        this.stub.observed.delete(element);
      }
      disconnect() {
        this.stub.isDisconnected = true;
      }
    },
  );
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: VIEWPORT_HEIGHT,
  });
  Object.defineProperty(window, 'scrollY', {configurable: true, value: 0});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setConnection(undefined);
});

describe('observeNearViewport', () => {
  it('reports each element through one observer that leads by one viewport', async () => {
    const {observeNearViewport} = await loadModule();
    const first = document.createElement('div');
    const second = document.createElement('div');
    const onFirst = vi.fn();
    const onSecond = vi.fn();

    observeNearViewport(first, onFirst);
    observeNearViewport(second, onSecond);

    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({rootMargin: '100% 0px'});
    expect([...observers[0].observed]).toEqual([first, second]);

    report(observers[0], second, true);
    expect(onSecond).toHaveBeenCalledWith(true);
    expect(onFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['Save-Data', {saveData: true, effectiveType: '4g'}],
    ['a 2G connection', {saveData: false, effectiveType: '2g'}],
    ['a slow 2G connection', {effectiveType: 'slow-2g'}],
  ])('has no lead with %s', async (_name, connection) => {
    setConnection(connection);
    const {observeNearViewport} = await loadModule();
    observeNearViewport(document.createElement('div'), () => {});
    expect(observers[0].options).toEqual({rootMargin: '0px'});
  });

  it('keeps the lead on a 3G connection', async () => {
    setConnection({saveData: false, effectiveType: '3g'});
    const {observeNearViewport} = await loadModule();
    observeNearViewport(document.createElement('div'), () => {});
    expect(observers[0].options).toEqual({rootMargin: '100% 0px'});
  });

  it('owns one scroll listener and releases it with the last element', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const removeFromWindow = vi.spyOn(window, 'removeEventListener');
    const {observeNearViewport} = await loadModule();

    const stopFirst = observeNearViewport(
      document.createElement('div'),
      () => {},
    );
    const stopSecond = observeNearViewport(
      document.createElement('div'),
      () => {},
    );
    expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(
      1,
    );

    stopFirst();
    expect(observers[0].isDisconnected).toBe(false);
    expect(remove).not.toHaveBeenCalled();

    stopSecond();
    stopSecond();
    expect(observers[0].isDisconnected).toBe(true);
    expect(
      remove.mock.calls.filter(([type]) => type === 'scroll'),
    ).toHaveLength(1);
    expect(
      removeFromWindow.mock.calls.filter(([type]) => type === 'resize'),
    ).toHaveLength(1);

    observeNearViewport(document.createElement('div'), () => {});
    expect(observers).toHaveLength(2);
  });
});

describe('whenScrollIsCalm', () => {
  async function loadObserving(): Promise<Prefetch> {
    const prefetch = await loadModule();
    prefetch.observeNearViewport(document.createElement('div'), () => {});
    return prefetch;
  }

  it('runs at once while the page is at rest', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    const run = vi.fn();
    whenScrollIsCalm(run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('runs at once during a slow scroll', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    // One viewport per second is below the two-viewport limit.
    scrollBy(16, 16);
    scrollBy(16, 16);

    const run = vi.fn();
    whenScrollIsCalm(run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('holds work during a fast scroll and runs it when the scroll stops', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    // Nine viewports per second.
    scrollBy(150, 16);
    scrollBy(150, 16);

    const run = vi.fn();
    whenScrollIsCalm(run);
    scrollBy(150, 16);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledOnce();
  });

  it('runs held work when the scroll slows down', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    scrollBy(150, 16);
    scrollBy(150, 16);

    const run = vi.fn();
    whenScrollIsCalm(run);
    expect(run).not.toHaveBeenCalled();

    scrollBy(10, 16);
    expect(run).toHaveBeenCalledOnce();
  });

  it('holds work on the first event of a scroll, before its speed is known', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    scrollBy(150, 500);

    const run = vi.fn();
    whenScrollIsCalm(run);
    expect(run).not.toHaveBeenCalled();
  });

  it('follows the viewport height after a resize', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 4 * VIEWPORT_HEIGHT,
    });
    window.dispatchEvent(new Event('resize'));
    // 3,125 px per second: fast for a 1,000 px viewport, slow for 4,000 px.
    scrollBy(50, 16);
    scrollBy(50, 16);

    const run = vi.fn();
    whenScrollIsCalm(run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('does not run cancelled work', async () => {
    const {whenScrollIsCalm} = await loadObserving();
    scrollBy(150, 16);
    scrollBy(150, 16);

    const run = vi.fn();
    const cancel = whenScrollIsCalm(run);
    cancel();
    vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
  });
});
