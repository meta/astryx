// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  generateDataTokenDefaults,
  parseDataTokenDefaults,
} from './generate-data-tokens.mjs';

describe('generate-data-tokens', () => {
  it('requires one complete 56-token canonical object', () => {
    const source = `const dataTokenDefaults = {\n${Array.from(
      {length: 56},
      (_, index) =>
        `  '--color-data-probe-${index}': 'light-dark(#000, #fff)',`,
    ).join('\n')}\n} as const;`;

    expect(parseDataTokenDefaults(source)).toHaveLength(56);
    expect(() =>
      parseDataTokenDefaults(
        source.replace(
          "  '--color-data-probe-55': 'light-dark(#000, #fff)',\n",
          '',
        ),
      ),
    ).toThrow('Expected 56 data tokens, found 55');
  });

  it('keeps the checked-in compatibility view in sync', () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const output = fs.readFileSync(
      path.join(root, 'packages/core/src/theme/domainTokens/dataTokens.ts'),
      'utf8',
    );
    const generated = generateDataTokenDefaults();

    expect(output).toBe(generated);
    expect(generated).toContain(
      "'--color-data-categorical-green': 'light-dark(#0B991F, #0B991F)'",
    );
  });
});
