// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {THEME_SHOWCASE_PHOTOS} from '../components/themeShowcaseContent';
import {warmThemeShowcasePhotos} from '../components/themeShowcaseWarmup';

/** The image sources the warm-up has requested. */
function requested(images: HTMLImageElement[]): string[] {
  return images.map(image => image.getAttribute('src') ?? '');
}

function setConnection(connection: unknown) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

describe('warmThemeShowcasePhotos', () => {
  let idleCallbacks: Array<() => void>;

  beforeEach(() => {
    idleCallbacks = [];
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: () => void) => idleCallbacks.push(callback)),
    );
    vi.stubGlobal(
      'cancelIdleCallback',
      vi.fn((handle: number) => {
        idleCallbacks[handle - 1] = () => {};
      }),
    );
    setConnection(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setConnection(undefined);
  });

  it('requests nothing before the page is idle', () => {
    const {images} = warmThemeShowcasePhotos();
    expect(images).toEqual([]);
    expect(idleCallbacks).toHaveLength(1);
  });

  it('requests every showcase photo once the page is idle, and holds the images', () => {
    const {images} = warmThemeShowcasePhotos();
    idleCallbacks[0]();
    expect(requested(images)).toEqual([...THEME_SHOWCASE_PHOTOS]);
  });

  it('requests nothing when it is cancelled before the page is idle', () => {
    const {images, cancel} = warmThemeShowcasePhotos();
    cancel();
    idleCallbacks[0]();
    expect(images).toEqual([]);
  });

  it.each([
    ['a data-saving mode', {saveData: true, effectiveType: '4g'}],
    ['a 2G link', {saveData: false, effectiveType: '2g'}],
    ['a slow 2G link', {saveData: false, effectiveType: 'slow-2g'}],
  ])('requests nothing on %s', (_label, connection) => {
    setConnection(connection);
    const {images} = warmThemeShowcasePhotos();
    expect(idleCallbacks).toEqual([]);
    expect(images).toEqual([]);
  });

  it('waits for idle time for two seconds at most', () => {
    warmThemeShowcasePhotos();
    expect(window.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      {timeout: 2000},
    );
  });

  it('waits a second where the browser has no idle callback', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const {images} = warmThemeShowcasePhotos();
    vi.advanceTimersByTime(999);
    expect(images).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(requested(images)).toEqual([...THEME_SHOWCASE_PHOTOS]);
  });

  it('requests nothing when it is cancelled where the browser has no idle callback', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();
    const {images, cancel} = warmThemeShowcasePhotos();
    cancel();
    vi.advanceTimersByTime(5000);
    expect(images).toEqual([]);
  });
});
