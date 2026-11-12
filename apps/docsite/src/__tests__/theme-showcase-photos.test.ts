// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {imageConfigDefault} from 'next/dist/shared/lib/image-config';
import {
  SHOWCASE_PHOTO_WIDTH,
  THEME_SHOWCASE_PHOTOS,
  getThemeShowcaseContent,
} from '../components/themeShowcaseContent';
import {
  OPTIMIZED_IMAGE_QUALITY,
  optimizedImageUrl,
} from '../lib/optimizedImageUrl.mjs';

const publicDir = path.resolve(__dirname, '../../public');
const THEMES = ['matcha', 'butter', 'stone', 'y2k', 'gothic'];

describe('optimizedImageUrl', () => {
  it('names the image, the width, and the quality', () => {
    expect(optimizedImageUrl('/images/matcha/preview-watch.png', 828)).toBe(
      '/_next/image?url=%2Fimages%2Fmatcha%2Fpreview-watch.png&w=828&q=75',
    );
  });
});

describe('theme showcase photos', () => {
  it.each(THEMES)('loads the six %s photos through the optimizer', theme => {
    const photos = Object.values(getThemeShowcaseContent(theme)?.images ?? {});
    expect(photos).toHaveLength(6);
    for (const photo of photos) {
      const url = new URL(photo, 'http://site');
      expect(url.pathname).toBe('/_next/image');
      expect(url.searchParams.get('w')).toBe(String(SHOWCASE_PHOTO_WIDTH));
      const file = url.searchParams.get('url') ?? '';
      expect(file).toMatch(
        new RegExp(`^/images/${theme}/preview-[a-z]+\\.png$`),
      );
      expect(fs.existsSync(path.join(publicDir, file))).toBe(true);
    }
  });

  it('requests a width and a quality the optimizer allows', async () => {
    const {default: nextConfig} = await import('../../next.config.mjs');
    const images = {
      ...imageConfigDefault,
      ...(nextConfig as {images?: Partial<typeof imageConfigDefault>}).images,
    };
    expect(images.deviceSizes).toContain(SHOWCASE_PHOTO_WIDTH);
    expect(images.qualities).toContain(OPTIMIZED_IMAGE_QUALITY);
  });

  it('lists every photo once for the warm-up', () => {
    expect(THEME_SHOWCASE_PHOTOS).toHaveLength(THEMES.length * 6);
    expect(new Set(THEME_SHOWCASE_PHOTOS).size).toBe(
      THEME_SHOWCASE_PHOTOS.length,
    );
    for (const theme of THEMES) {
      expect(THEME_SHOWCASE_PHOTOS).toEqual(
        expect.arrayContaining(
          Object.values(getThemeShowcaseContent(theme)?.images ?? {}),
        ),
      );
    }
  });
});
