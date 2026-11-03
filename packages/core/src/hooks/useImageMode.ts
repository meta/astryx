// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useImageMode.ts
 * @input Image source URL
 * @output Detected mode luminance: 'dark' | 'light' | null
 * @position Hook; used alongside MediaTheme for auto-detection
 */

import {useState, useEffect} from 'react';

/**
 * Region to sample within the image (normalized 0-1 coordinates).
 * Useful for detecting luminance where text will be overlaid,
 * rather than the full image average.
 */
export interface ImageSampleRegion {
  /** Left edge (0 = left, 1 = right) */
  x: number;
  /** Top edge (0 = top, 1 = bottom) */
  y: number;
  /** Width as fraction of image width */
  width: number;
  /** Height as fraction of image height */
  height: number;
}

export interface UseImageModeOptions {
  /**
   * Region to sample. Defaults to the full image.
   * Use normalized coordinates (0-1).
   */
  region?: ImageSampleRegion;
  /**
   * Luminance threshold for the dark/light split.
   * Below this = 'dark', above = 'light'.
   * @default 0.5
   */
  threshold?: number;
  /**
   * Fallback value while loading or on error.
   * @default null
   */
  fallback?: 'dark' | 'light' | null;
}

/**
 * APCA perceptual lightness from sRGB values (0-255), from 0 (black) to 1
 * (white). It handles saturated colors better than BT.709 gamma-luma or WCAG
 * 2 relative luminance, which overestimate the brightness of reds and blues.
 */
function perceptualLightness(r: number, g: number, b: number): number {
  const lin = (c: number) => Math.pow(c / 255, 2.4);
  const y = 0.2126729 * lin(r) + 0.7151522 * lin(g) + 0.072175 * lin(b);
  return Math.pow(y, 0.56);
}

/**
 * Detect whether an image is predominantly dark or light.
 *
 * Uses OffscreenCanvas to sample the image without interrupting
 * the main render loop. Returns null while loading.
 */
export function useImageMode(
  src: string | null | undefined,
  options: UseImageModeOptions = {},
): 'dark' | 'light' | null {
  const {region, threshold = 0.5, fallback = null} = options;
  const [detectedResult, setDetectedResult] = useState<{
    src: string;
    mode: 'dark' | 'light' | null;
  } | null>(null);

  useEffect(() => {
    if (!src) {
      return;
    }

    const srcUrl = src;
    let cancelled = false;

    async function detect() {
      try {
        const response = await fetch(srcUrl, {mode: 'cors'});
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        if (cancelled) {
          return;
        }

        const sx = region ? Math.round(region.x * bitmap.width) : 0;
        const sy = region ? Math.round(region.y * bitmap.height) : 0;
        const sw = region
          ? Math.round(region.width * bitmap.width)
          : bitmap.width;
        const sh = region
          ? Math.round(region.height * bitmap.height)
          : bitmap.height;

        // Sample at a small size and average the pixels here. A 1×1
        // OffscreenCanvas drawImage can be inaccurate, because browsers
        // resample in different ways.
        const sampleSize = 10;
        const canvas = new OffscreenCanvas(sampleSize, sampleSize);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return;
        }

        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sampleSize, sampleSize);
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

        let totalR = 0,
          totalG = 0,
          totalB = 0;
        const pixelCount = sampleSize * sampleSize;
        for (let i = 0; i < imageData.length; i += 4) {
          totalR += imageData[i];
          totalG += imageData[i + 1];
          totalB += imageData[i + 2];
        }
        const r = totalR / pixelCount;
        const g = totalG / pixelCount;
        const b = totalB / pixelCount;

        if (cancelled) {
          return;
        }

        const lightness = perceptualLightness(r, g, b);
        setDetectedResult({
          src: srcUrl,
          mode: lightness > threshold ? 'light' : 'dark',
        });
      } catch {
        // CORS error, network error, etc. — keep fallback
        if (!cancelled) {
          setDetectedResult({src: srcUrl, mode: fallback});
        }
      }
    }

    void detect();

    return () => {
      cancelled = true;
    };
  }, [src, region, threshold, fallback]);

  if (!src || detectedResult?.src !== src) {
    return fallback;
  }

  return detectedResult.mode;
}
