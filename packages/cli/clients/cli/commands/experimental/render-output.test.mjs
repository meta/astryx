// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {printRendered} from './render-output.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the text a render prints', () => {
  it('names the first ten remote images and counts the rest, as it does files', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetched = Array.from(
      {length: 12},
      (_, i) => `https://cdn.example.com/fetched-${i}.png`,
    );
    const failed = Array.from({length: 13}, (_, i) => ({
      url: `https://cdn.example.com/failed-${i}.png`,
      reason: 'no answer in time',
    }));
    printRendered(
      /** @type {any} */ ({
        input: 'page.tsx',
        output: 'page.html',
        bytes: 2048,
        cssBytes: 1024,
        markupBytes: 512,
        sourceBytes: 256,
        classes: 3,
        images: 25,
        files: ['page.tsx'],
        stylesheets: [],
        scriptBytes: 4096,
        scriptModules: 2,
        warnings: [],
        remoteImages: {fetched, failed},
        checks: {outside: [], roundTrip: {exact: true, files: 1, differs: []}},
      }),
      'astryx',
    );
    const out = log.mock.calls.map(call => call.join(' ')).join('\n');
    expect(out).toContain('fetched-9.png, ... and 2 more');
    expect(out).not.toContain('fetched-10.png');
    expect(out.match(/failed-\d+\.png/g)).toHaveLength(10);
    expect(out).toContain('... and 3 more');
  });
});
