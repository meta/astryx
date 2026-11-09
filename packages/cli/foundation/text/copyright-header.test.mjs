// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for the shared copyright-header stripper.
 *
 * Two commands copy repo files into a consumer's project (`theme eject`,
 * `init --features theme`); this is what keeps our boilerplate out of their
 * tree. The BOM/shebang cases are the ones worth pinning — a naive strip
 * corrupts the file rather than merely leaving a stray comment.
 */

import {describe, it, expect} from 'vitest';
import {stripCopyrightHeader} from './copyright-header.mjs';

const HEADER = '// Copyright (c) Meta Platforms, Inc. and affiliates.\n';

describe('stripCopyrightHeader', () => {
  it('removes the header and the blank line after it', () => {
    expect(stripCopyrightHeader(`${HEADER}\nexport const a = 1;\n`)).toBe(
      'export const a = 1;\n',
    );
  });

  it('removes it with no blank line after', () => {
    expect(stripCopyrightHeader(`${HEADER}export const a = 1;\n`)).toBe(
      'export const a = 1;\n',
    );
  });

  it('keeps a shebang, which must stay on line 1', () => {
    expect(stripCopyrightHeader(`#!/usr/bin/env node\n${HEADER}\nrun();\n`)).toBe(
      '#!/usr/bin/env node\nrun();\n',
    );
  });

  it('keeps a BOM', () => {
    expect(stripCopyrightHeader(`\uFEFF${HEADER}\nexport const a = 1;\n`)).toBe(
      '\uFEFFexport const a = 1;\n',
    );
  });

  it('handles CRLF line endings', () => {
    expect(
      stripCopyrightHeader(
        '// Copyright (c) Meta Platforms, Inc. and affiliates.\r\n\r\nexport const a = 1;\r\n',
      ),
    ).toBe('export const a = 1;\r\n');
  });

  it('leaves a file without the header alone', () => {
    expect(stripCopyrightHeader('export const a = 1;\n')).toBe('export const a = 1;\n');
  });

  it('only strips at the top — a mention further down is content', () => {
    const source = `export const a = 1;\n${HEADER}`;
    expect(stripCopyrightHeader(source)).toBe(source);
  });
});
