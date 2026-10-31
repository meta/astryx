// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexValidation.source-build.test.mjs
 * @input Uses Babel and the lab StyleX build config
 * @output Verifies unsupported StyleX declarations fail the lab build
 * @position Regression test for the lab build's propertyValidationMode
 */

import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformAsync} from '@babel/core';
import {describe, expect, it} from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LAB_ROOT = path.resolve(__dirname, '..');

function compile(declaration) {
  const source = `import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({root: {${declaration}}});`;
  return transformAsync(source, {
    babelrc: false,
    configFile: path.join(LAB_ROOT, 'babel.config.cjs'),
    filename: path.join(__dirname, 'unsupported-declaration.tsx'),
  });
}

describe('lab StyleX property validation', () => {
  // In StyleX's default `silent` mode each of these compiles successfully and
  // the declaration never reaches the shipped CSS, while a source build of the
  // same module, which validates with `throw`, fails. The lab build must fail
  // too.
  it.each([
    ['border', "border: '1px solid red'", /border is not supported/],
    [
      'borderRight',
      "borderRight: '1px solid red'",
      /borderRight is not supported/,
    ],
    ['background', "background: 'none'", /background is not supported/],
  ])(
    'rejects the %s shorthand instead of dropping it',
    async (_name, declaration, message) => {
      await expect(compile(declaration)).rejects.toThrow(message);
    },
  );
});
