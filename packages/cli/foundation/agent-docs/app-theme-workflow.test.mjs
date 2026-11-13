// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateCompressedIndex} from './agent-docs.mjs';

describe('generated agent docs app-theme workflow', () => {
  it('points agents at the theme doc and guards :root overrides', () => {
    const result = generateCompressedIndex('1.0.0');

    // A theme is made and changed with the theme editor and wired with add.
    expect(result).toContain('astryx experimental theme editor new <name>');
    expect(result).toContain(':root overrides');
    expect(result).toContain('astryx theme add <name>');
    expect(result).toContain('astryx experimental theme preview add');
    expect(result).not.toContain('theme add <slug> --import');
  });
});
