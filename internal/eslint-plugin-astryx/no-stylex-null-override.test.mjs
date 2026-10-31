// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-stylex-null-override.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './no-stylex-null-override.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-stylex-null-override', rule, {
  valid: [
    // Pattern 1: default: null with non-null pseudo is OK
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            backgroundImage: {
              default: null,
              ':hover': 'linear-gradient(...)',
            },
          },
        });
      `,
    },
    // Normal styles without null
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            transform: 'none',
            backgroundColor: 'transparent',
          },
        });
      `,
    },
    // Null outside stylex.create is OK
    {
      code: `
        const obj = { value: null };
      `,
    },
  ],
  invalid: [
    // Pattern 2: Full null override (default + pseudo both null)
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          disabled: {
            transform: {
              default: null,
              ':active': null,
            },
          },
        });
      `,
      errors: [{ messageId: 'noNullOverride' }],
    },
    // Direct null at property level
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          disabled: {
            backgroundImage: {
              default: null,
              ':hover': null,
            },
          },
        });
      `,
      errors: [{ messageId: 'noNullOverride' }],
    },
  ],
});

console.log('All tests passed!');
