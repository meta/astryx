// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {renderPalettePreview} from './preview.mjs';

const candidate = {
  schemaVersion: 1,
  status: 'candidate',
  recipe: 'astryx-oklch-v1',
  black: '#000000',
  white: '#ffffff',
  palette: {
    blue: {
      name: 'Blue',
      light: {5: '#000f30', 50: '#0074e2', 95: '#e8f2ff'},
      dark: {5: '#000f30', 50: '#3b84de', 95: '#e8f2ff'},
    },
  },
};

describe('renderPalettePreview', () => {
  it('renders a deterministic self-contained review artifact', () => {
    const first = renderPalettePreview(candidate);
    const second = renderPalettePreview(candidate);

    expect(first).toBe(second);
    expect(first).toContain('palette-preview-v1');
    expect(first).toContain('Light mode');
    expect(first).toContain('Dark mode');
    expect(first).toContain('#0074e2');
    expect(first).toContain('Exact theme values');
    expect(first).toContain('#000000');
    expect(first).toContain('#ffffff');
    expect(first).toContain('Default families repeat these values');
    expect(first).not.toContain('Shared endpoints');
    expect(first).not.toContain('does not certify accessibility');
    expect(first).toContain('grid-template-columns: 1fr');
    expect(first).toContain('--stop-count:3');
    expect(first).not.toMatch(/https?:\/\//);
    expect(first).not.toContain('<script');
    expect(first).not.toContain('Neutral guidance:');
  });

  it('escapes author-provided family names', () => {
    const html = renderPalettePreview({
      ...candidate,
      palette: {
        blue: {...candidate.palette.blue, name: '<script>alert(1)</script>'},
      },
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
