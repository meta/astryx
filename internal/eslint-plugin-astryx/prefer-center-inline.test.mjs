// Copyright (c) Meta Platforms, Inc. and affiliates.

import {RuleTester} from 'eslint';
import rule from './prefer-center-inline.js';

const ruleTester = new RuleTester({
  languageOptions: {ecmaVersion: 2022, sourceType: 'module'},
});

function inStylex(body) {
  return `
    import * as stylex from '@stylexjs/stylex';
    const styles = stylex.create({
      base: { ${body} },
    });
  `;
}

ruleTester.run('prefer-center-inline', rule, {
  valid: [
    {code: inStylex(`insetInlineStart: 0`)},
    // The broken form belongs to no-physical-properties, not this style nudge.
    {
      code: inStylex(
        `insetInlineStart: '50%', transform: 'translate(-50%, -50%)'`,
      ),
    },
    // A non-centering variable position genuinely needs its RTL branch.
    {
      code: inStylex(`
        insetInlineStart: '35%',
        transform: {
          default: 'translateX(-50%)',
          ':is([dir="rtl"] *)': 'translateX(50%)',
        }
      `),
    },
    {
      code: `
        const style = {
          insetInlineStart: '50%',
          transform: {
            default: 'translateX(-50%)',
            ':dir(rtl)': 'translateX(50%)',
          },
        };
      `,
    },
    // --- UNPROVEN COMPENSATION: this rule only nudges code it can see is
    // already correct. A reversal it cannot verify is not a tidy-up
    // opportunity — it is no-physical-properties' unverified diagnostic. ---
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translateX(calc(-50% - 4px))',
          ':is([dir="rtl"] *)': 'translateX(calc(50% + 4px))',
        }
      `),
    },
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translateX(var(--shift))',
          ':dir(rtl)': 'translateX(var(--shift-rtl))',
        }
      `),
    },
    {
      // A percentage and a fixed length do not cancel.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate(-50%, -50%)',
          ':is([dir="rtl"] *)': 'translate(50px, -50%)',
        }
      `),
    },
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'matrix(1, 0, 0, 1, -50, 0)',
          ':dir(rtl)': 'matrix(1, 0, 0, 1, 50, 0)',
        }
      `),
    },
    {
      code: inStylex(
        "insetInlineStart: '50%', transform: {default: 'translateX(-50%)', ':dir(rtl)': `translateX(${x})`}",
      ),
    },
    // A variable anchor is not fixed centering, however tidy its RTL arm is —
    // Avatar's status dot, whose offset scales with the avatar size.
    {
      code: inStylex(`
        insetInlineEnd: size * 0.07,
        transform: {
          default: 'translate(50%, 50%)',
          ':is([dir="rtl"] *)': 'translate(-50%, 50%)',
        }
      `),
    },
    // Composition defeats verification: after a rotate, neither arm's
    // direction is known, so this is not proven-correct centering to tidy up.
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'rotate(90deg) translateY(-50%)',
          ':is([dir="rtl"] *)': 'rotate(90deg) translateY(50%)',
        }
      `),
    },
  ],
  invalid: [
    {
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate(-50%, -50%)',
          ':is([dir="rtl"] *)': 'translate(50%, -50%)',
        }
      `),
      errors: [{messageId: 'preferCenterInline'}],
    },
    {
      // Exact shape used by closed PR #5192.
      code: inStylex(`
        insetInlineStart: {
          default: null,
          '@media (pointer: coarse)': '50%',
        },
        transform: {
          default: null,
          '@media (pointer: coarse)': {
            default: 'translate(-50%, -50%)',
            ':is([dir="rtl"] *)': 'translate(50%, -50%)',
          },
        }
      `),
      errors: [{messageId: 'preferCenterInline'}],
    },
    {
      code: inStylex(`
        insetInlineEnd: '50%',
        transform: {
          default: 'translateX(50%)',
          ':dir(rtl)': 'translateX(-50%)',
        }
      `),
      errors: [{messageId: 'preferCenterInline'}],
    },
    {
      // The same idiom in its 3d spelling is recognised too.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translate3d(-50%, -50%, 0)',
          ':is([dir="rtl"] *)': 'translate3d(50%, -50%, 0)',
        }
      `),
      errors: [{messageId: 'preferCenterInline'}],
    },
    {
      // A rotate AFTER the translation leaves it on the axes it was written
      // for, so this pair is still verifiably correct centering.
      code: inStylex(`
        insetInlineStart: '50%',
        transform: {
          default: 'translateX(-50%) rotate(45deg)',
          ':dir(rtl)': 'translateX(50%) rotate(45deg)',
        }
      `),
      errors: [{messageId: 'preferCenterInline'}],
    },
  ],
});

console.log('All tests passed!');
