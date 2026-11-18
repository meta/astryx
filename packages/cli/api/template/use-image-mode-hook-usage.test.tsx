// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useImageMode example is a photo caption that reads light or dark text
 * from the strip of sky under it, and keeps the dark fallback while a new
 * photo loads.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseImageModeHookUsage from '../../assets/templates/blocks/components/Hooks/useImageModeHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const PHOTO_HEIGHT = 600;

// Average color of each photo's top 30% (the caption strip) and of the whole
// photo. The beach sky is pale, but the photo as a whole is dark.
const PIXELS: Record<string, {strip: number[]; whole: number[]}> = {
  'moody-scene-horizontal-1.png': {strip: [40, 70, 80], whole: [20, 35, 40]},
  'light-scene-horizontal-1.png': {
    strip: [190, 200, 210],
    whole: [90, 100, 110],
  },
};

type Bitmap = {name: string; width: number; height: number};

let root: Root | null = null;
let container: HTMLElement;
let pending: Map<string, () => void>;
let drawn: Array<{name: string; sy: number; sh: number}>;

function photoName(url: string): string {
  return url.split('/').pop() ?? url;
}

function caption(): HTMLElement {
  const element = container.querySelector<HTMLElement>('[data-astryx-media]');
  if (element == null) {
    throw new Error('no MediaTheme caption rendered');
  }
  return element;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(() => Promise.resolve());
  }
}

async function finishLoading(name: string): Promise<void> {
  pending.get(name)?.();
  await settle();
}

beforeEach(() => {
  pending = new Map();
  drawn = [];
  vi.stubGlobal('fetch', async (url: string) => ({
    blob: async () => ({name: photoName(url)}),
  }));
  vi.stubGlobal(
    'createImageBitmap',
    (blob: {name: string}) =>
      new Promise<Bitmap>(resolve => {
        pending.set(blob.name, () =>
          resolve({name: blob.name, width: 900, height: PHOTO_HEIGHT}),
        );
      }),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        let color = [0, 0, 0];
        return {
          drawImage(
            bitmap: Bitmap,
            _sx: number,
            sy: number,
            _sw: number,
            sh: number,
          ) {
            drawn.push({name: bitmap.name, sy, sh});
            const pixels = PIXELS[bitmap.name];
            color = sh < bitmap.height ? pixels.strip : pixels.whole;
          },
          getImageData(_x: number, _y: number, width: number, height: number) {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < data.length; i += 4) {
              data.set([...color, 255], i);
            }
            return {data};
          },
        };
      }
    },
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseImageModeHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useImageMode example', () => {
  it('samples only the strip under the caption', async () => {
    await finishLoading('moody-scene-horizontal-1.png');
    expect(drawn).toEqual([
      {name: 'moody-scene-horizontal-1.png', sy: 0, sh: 0.3 * PHOTO_HEIGHT},
    ]);
    expect(caption().getAttribute('data-astryx-media')).toBe('dark');
    expect(caption().textContent).toContain('Sky behind the caption: dark');
  });

  it('switches the caption to dark text over the beach sky, after the fallback while it loads', async () => {
    await finishLoading('moody-scene-horizontal-1.png');
    act(() => container.querySelector<HTMLInputElement>('input')?.click());
    await settle();

    expect(caption().textContent).toContain('Afternoon at the beach');
    expect(caption().getAttribute('data-astryx-media')).toBe('dark');

    await finishLoading('light-scene-horizontal-1.png');
    expect(caption().getAttribute('data-astryx-media')).toBe('light');
    expect(caption().textContent).toContain('Sky behind the caption: light');
  });
});
