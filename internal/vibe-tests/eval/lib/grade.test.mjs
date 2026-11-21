// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {isAllowedRequest} from './grade.mjs';

describe('isAllowedRequest', () => {
  const origin = 'http://127.0.0.1:4173/';

  it('allows the local server and the font hosts only', () => {
    expect(isAllowedRequest('http://127.0.0.1:4173/assets/a.js', origin)).toBe(true);
    expect(isAllowedRequest('https://fonts.googleapis.com/css2?family=Figtree', origin)).toBe(true);
    expect(isAllowedRequest('https://fonts.gstatic.com/s/figtree/v1/a.woff2', origin)).toBe(true);
    expect(isAllowedRequest('http://fonts.gstatic.com/s/a.woff2', origin)).toBe(false);
    expect(isAllowedRequest('https://example.com/api', origin)).toBe(false);
    expect(isAllowedRequest('http://127.0.0.1:9999/', origin)).toBe(false);
    expect(isAllowedRequest('not a url', origin)).toBe(false);
  });
});
