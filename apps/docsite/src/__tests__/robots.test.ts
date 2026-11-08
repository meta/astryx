// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import robots from '../app/robots';

describe('docsite robots policy', () => {
  it('keeps the hidden registry out of crawler discovery', () => {
    expect(robots().rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/playground/preview', '/shadcn/'],
    });
  });
});
