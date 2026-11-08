// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

import {render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));
vi.mock('../app/providers', () => ({
  useThemeMode: () => ({themeMode: 'system'}),
}));
vi.mock('../generated/blogRegistry', () => ({
  blogDarkImages: ['/blog/release/swipe@2x.dark.png'],
  blogImageSizes: {
    '/blog/release/swipe@2x.png': {width: 780, height: 300},
    '/blog/release/swipe@2x.dark.png': {width: 780, height: 300},
    '/blog/release/menu@2x.png': {width: 639, height: 200},
  },
}));

import {MarkdownImage} from '../components/blog/ThemedImage';

// A screenshot taken on a 2x display is twice as many pixels as the component
// is wide on screen; an `@2x` file name says so, and the image renders at the
// component's real size instead of filling the column.
describe('@2x blog images render at half their pixel width', () => {
  it('gives a 780px @2x image a 390 CSS px width, on both theme variants', () => {
    const {container} = render(
      <MarkdownImage src="/blog/release/swipe@2x.png" alt="Swipe actions" />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('width')).toBe('390');
    expect(container.querySelector('source')?.getAttribute('srcset')).toBe(
      '/blog/release/swipe@2x.dark.png',
    );
  });

  it('rounds an odd pixel width', () => {
    const {container} = render(
      <MarkdownImage src="/blog/release/menu@2x.png" alt="Menu" />,
    );
    expect(container.querySelector('img')?.getAttribute('width')).toBe('320');
  });

  it('leaves a non-@2x image, and an @2x image the build did not measure, unsized', () => {
    const {container, rerender} = render(
      <MarkdownImage src="/blog/release/cover.png" alt="Cover" />,
    );
    expect(container.querySelector('img')?.hasAttribute('width')).toBe(false);
    rerender(
      <MarkdownImage src="/blog/release/unknown@2x.png" alt="Unknown" />,
    );
    expect(container.querySelector('img')?.hasAttribute('width')).toBe(false);
  });
});
