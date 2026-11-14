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
    // Each change is looked at in the editor's pictures before it is done.
    expect(result).toContain(
      'astryx experimental theme editor show <name> --png',
    );
    expect(result).toContain('not done until you have looked');
    // A denser or roomier app is a theme change, as colors are.
    expect(result).toContain('editor set <name> spacing tight');
    // With no app yet, the starter app shows the theme.
    expect(result).toContain('astryx experimental theme preview app <dir>');
    expect(result).not.toContain('theme add <slug> --import');
    // Extending a theme comes before forking it (AST-050 FR13), on the same
    // one theme line.
    expect(result).toContain('theme eject <slug>');
    expect(result).toContain('only forks source');
    expect(
      result.split('\n').filter(l => /experimental theme editor/.test(l)),
    ).toHaveLength(1);
  });
});
