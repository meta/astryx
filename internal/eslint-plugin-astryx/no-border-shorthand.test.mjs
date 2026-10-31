// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-border-shorthand.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './no-border-shorthand.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-border-shorthand', rule, {
  valid: [
    // border: 'none' is allowed (reset)
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { border: 'none' },
        });
      `,
    },
    // border: '0' is allowed
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { border: '0' },
        });
      `,
    },
    // Longhand properties are fine
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'red',
          },
        });
      `,
    },
    // Side-specific longhand is fine
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            borderBottomWidth: 1,
            borderBottomStyle: 'solid',
            borderBottomColor: 'red',
          },
        });
      `,
    },
    // Outside stylex.create is fine
    {
      code: `
        const obj = { border: '1px solid red' };
      `,
    },
    // border: 'inherit' is allowed
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { border: 'inherit' },
        });
      `,
    },
  ],
  invalid: [
    // border shorthand with string literal
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { border: '1px solid red' },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'border',
            replacements: 'borderWidth, borderStyle, borderColor',
          },
        },
      ],
    },
    // border shorthand with template literal
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const w = '1px';
        const styles = stylex.create({
          base: { border: \`\${w} solid red\` },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'border',
            replacements: 'borderWidth, borderStyle, borderColor',
          },
        },
      ],
    },
    // borderTop shorthand
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { borderTop: '1px solid blue' },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'borderTop',
            replacements: 'borderTopWidth, borderTopStyle, borderTopColor',
          },
        },
      ],
    },
    // borderBottom shorthand
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { borderBottom: '2px dashed green' },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'borderBottom',
            replacements: 'borderBottomWidth, borderBottomStyle, borderBottomColor',
          },
        },
      ],
    },
    // borderRight shorthand
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { borderRight: '1px solid #ccc' },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'borderRight',
            replacements: 'borderRightWidth, borderRightStyle, borderRightColor',
          },
        },
      ],
    },
    // borderInline shorthand
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { borderInline: '1px solid black' },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'borderInline',
            replacements: 'borderInlineWidth, borderInlineStyle, borderInlineColor',
          },
        },
      ],
    },
    // border with variable expression (not a static value, not an allowed reset)
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: { border: someVar },
        });
      `,
      errors: [
        {
          messageId: 'noBorderShorthand',
          data: {
            prop: 'border',
            replacements: 'borderWidth, borderStyle, borderColor',
          },
        },
      ],
    },
  ],
});

console.log('All tests passed!');
