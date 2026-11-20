// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateCompressedIndex} from './agent-docs.mjs';

describe('generated agent docs app-theme workflow', () => {
  it('points agents at the theme doc and guards :root overrides', () => {
    const result = generateCompressedIndex('1.0.0');

    // A theme starts from traits: create writes the whole file and makes it
    // the app's theme.
    expect(result).toContain(
      "astryx experimental theme create <name> --traits '<json>'",
    );
    expect(result).toContain(':root overrides');
    expect(result).toContain("makes it the app's theme");
    // An installed theme is still imported with add.
    expect(result).toContain('astryx theme add <name>');
    // The file is then the agent's: every edit is checked before it is done.
    expect(result).toContain('edit any line by hand');
    expect(result).toContain('astryx experimental theme check <name> --fix');
    expect(result).toContain('not done until check passes');
    // A denser or roomier app and one kind of part are theme changes too.
    expect(result).toContain('so do a denser or roomier app');
    expect(result).toContain('`astryx theme targets` lists the parts');
    // With no app yet, the starter app shows the theme.
    expect(result).toContain('astryx experimental theme preview app <dir>');
    expect(result).not.toContain('theme add <slug> --import');
    // Extending a theme comes before forking it (AST-050 FR13), on the same
    // one theme line.
    expect(result).toContain('theme eject <slug>');
    expect(result).toContain('only forks source');
    expect(
      result.split('\n').filter(l => /experimental theme create/.test(l)),
    ).toHaveLength(1);
  });
});
