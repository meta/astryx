// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useImageMode.test.ts
 * @input Uses vitest, @testing-library/react, useImageMode hook
 * @output Unit tests for useImageMode hook
 * @position Testing; validates useImageMode.ts pixel-sampling + CORS behavior
 *
 * SYNC: When useImageMode.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {renderHook, waitFor, act} from '@testing-library/react';
import {useImageMode} from './useImageMode';

// jsdom has no fetch/createImageBitmap/OffscreenCanvas — stub them per test so
// we can exercise the sampling path and the cross-origin failure path.

/** Fill the sampled canvas with a flat RGB so perceptualLightness is deterministic. */
function stubSamplingPipeline(rgb: [number, number, number]) {
  // fetch resolves to a blob (same-origin / CORS-enabled image)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({blob: async () => ({}) as Blob})),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({width: 100, height: 100}) as ImageBitmap),
  );
  const [r, g, b] = rgb;
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return {
        drawImage: vi.fn(),
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i += 4) {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
          return {data};
        },
      };
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
}

/** Simulate a cross-origin image with no CORS headers: fetch rejects. */
function stubCorsBlockedFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError(
        'Failed to fetch: No Access-Control-Allow-Origin header',
      );
    }),
  );
  vi.stubGlobal('createImageBitmap', vi.fn());
  vi.stubGlobal('OffscreenCanvas', class {});
}

describe('useImageMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('samples once for an inline region object across re-renders', async () => {
    stubSamplingPipeline([250, 250, 250]);
    const fetchSpy = vi.mocked(globalThis.fetch);

    // The documented call shape writes the region inline, so every render
    // hands the hook a new object. That must not re-fetch and re-sample.
    const {result, rerender} = renderHook(() =>
      useImageMode('https://example.com/hero.jpg', {
        region: {x: 0, y: 0.7, width: 1, height: 0.3},
      }),
    );

    await waitFor(() => expect(result.current).toBe('light'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    await act(async () => {});

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the fallback while no src is provided', () => {
    const {result} = renderHook(() => useImageMode(null, {fallback: 'dark'}));
    expect(result.current).toBe('dark');
  });

  it('samples a dark image and reports "dark"', async () => {
    stubSamplingPipeline([10, 10, 10]);
    const {result} = renderHook(() =>
      useImageMode('data:image/png;base64,AAAA'),
    );
    await waitFor(() => expect(result.current).toBe('dark'));
  });

  it('samples a light image and reports "light"', async () => {
    stubSamplingPipeline([240, 240, 240]);
    const {result} = renderHook(() =>
      useImageMode('data:image/png;base64,AAAA'),
    );
    await waitFor(() => expect(result.current).toBe('light'));
  });

  // ── Reproduction for BB-001 (cluster C6) ────────────────────────────────
  // A cross-origin image with no `Access-Control-Allow-Origin` header cannot be
  // fetched with `mode: 'cors'`, so the APCA sampling pipeline never runs and the
  // hook silently stays on its fallback. This is why image-backed Thumbnail
  // overlay/remove-button contrast is unreliable for hosted demo examples that
  // point `src` at a non-CORS CDN URL.
  it('stays on fallback when a cross-origin image cannot be sampled (CORS)', async () => {
    stubCorsBlockedFetch();
    const {result} = renderHook(() =>
      useImageMode(
        'https://cdn.example.com/photos/moody-scene-vertical-2.png',
        {fallback: null},
      ),
    );
    // Give the rejected fetch + state update a chance to flush.
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
    expect(result.current).toBeNull();
  });

  it('requests the image with CORS mode (the constraint that fails for non-CORS hosts)', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new TypeError('CORS');
    });
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('OffscreenCanvas', class {});
    renderHook(() => useImageMode('https://cross-origin.example/x.png'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cross-origin.example/x.png',
      {mode: 'cors'},
    );
  });
});
