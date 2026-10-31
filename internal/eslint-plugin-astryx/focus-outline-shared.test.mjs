// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focus-outline-shared.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './focus-outline-shared.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('focus-outline-shared', rule, {
  valid: [
    // The shared utility, applied at the call site.
    {
      code: `
        import {focusOutlineStyles} from '../utils/focusOutline.stylex';
        stylex.props(focusOutlineStyles.focusVisible, styles.base);
      `,
    },
    // A local offset: where the ring sits is a local constraint.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          cell: {outlineOffset: {default: '0', ':focus-visible': -2}},
        });
      `,
    },
    // Re-coloring the ring per variant is the documented override.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          destructive: {
            outlineColor: {default: null, ':focus-visible': colorVars['--color-error']},
          },
        });
      `,
    },
    // Suppressing a ring is not painting one.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          bare: {outline: {default: 'none', ':focus-visible': 'none'}},
        });
      `,
    },
    // A computed condition key — Switch's scope marker, which cannot be shared.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          track: {
            outline: {
              default: 'none',
              [stylex.when.ancestor(':has(:focus-visible)', switchScope)]: RING,
            },
          },
        });
      `,
    },
    // Outside stylex.create this rule has nothing to say.
    {
      code: `const doc = {outline: {':focus-visible': '2px solid blue'}};`,
    },
    // The utility itself is the one place the ring is written.
    {
      filename: '/repo/packages/core/src/utils/focusOutline.stylex.ts',
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          focusVisible: {
            outlineWidth: {default: '0', ':focus-visible': WIDTH},
            outlineStyle: {default: 'none', ':focus-visible': STYLE},
          },
        });
      `,
    },
  ],
  invalid: [
    // The shorthand, written out by hand.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            outline: {default: 'none', ':focus-visible': '2px solid blue'},
          },
        });
      `,
      errors: [{messageId: 'handRolledRing'}],
    },
    // Longhands, on a wrapper.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          wrapper: {
            outlineWidth: {default: '0', ':has(:focus-visible)': '2px'},
            outlineStyle: {default: 'none', ':has(:focus-visible)': 'solid'},
          },
        });
      `,
      errors: [
        {messageId: 'handRolledRing'},
        {messageId: 'handRolledRing'},
      ],
    },
    // Reading the tokens directly is still a second definition of the ring.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          base: {
            outline: {
              default: 'none',
              ':focus-visible': \`\${focusVars['--focus-outline-width']} solid red\`,
            },
          },
        });
      `,
      errors: [{messageId: 'handRolledRing'}],
    },
  ],
});

console.log('✅ focus-outline-shared tests passed');
