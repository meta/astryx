// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexValidation.source-build.test.mjs
 * @input Uses Babel and the core StyleX build config
 * @output Verifies unsupported StyleX declarations fail the core build
 * @position Regression test for the core build's propertyValidationMode
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, '..');

function compile(declaration) {
  const source = `import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({root: {${declaration}}});`;
  return transformAsync(source, {
    babelrc: false,
    configFile: path.join(CORE_ROOT, 'babel.config.json'),
    filename: path.join(__dirname, 'unsupported-declaration.tsx'),
  });
}

describe('core StyleX property validation', () => {
  // In StyleX's default `silent` mode each of these compiles successfully and
  // the declaration never reaches the shipped CSS, so a green build proves
  // nothing. The core build must fail instead.
  it.each([
    ['border', "border: 'none'", /border is not supported/],
    ['background', "background: 'none'", /background is not supported/],
    ['all', "all: 'unset'", /all is not supported/],
  ])(
    'rejects the %s shorthand instead of dropping it',
    async (_name, declaration, message) => {
      await expect(compile(declaration)).rejects.toThrow(message);
    },
  );
});
