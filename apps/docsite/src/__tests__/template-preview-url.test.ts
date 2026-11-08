// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {buildTemplatePreviewHref} from '../components/templatePreviewUrl';

describe('buildTemplatePreviewHref', () => {
  it('sets an encoded preview slug while preserving other parameters', () => {
    expect(
      buildTemplatePreviewHref('/templates', 'theme=dark', 'table inbox'),
    ).toBe('/templates?theme=dark&preview=table+inbox');
  });

  it('removes an invalid or closed preview while preserving other parameters', () => {
    expect(
      buildTemplatePreviewHref(
        '/templates',
        'preview=missing&theme=dark',
        null,
      ),
    ).toBe('/templates?theme=dark');
  });
});
