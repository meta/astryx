// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateCompressedIndex} from './agent-docs.mjs';

describe('generated agent docs app-theme workflow', () => {
  it('points agents at the theme doc and guards :root overrides', () => {
    const result = generateCompressedIndex('1.0.0');

    expect(result).toContain('astryx docs theme');
    expect(result).toContain('never :root overrides');
    expect(result).toContain('theme add <slug>');
    expect(result).toContain('theme eject <slug>');
    expect(result).not.toContain('theme add <slug> --import');
  });
});
