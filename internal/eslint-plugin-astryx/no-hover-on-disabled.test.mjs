// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-hover-on-disabled.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './no-hover-on-disabled.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const GUARD = ':where(:not(:disabled,[aria-disabled="true"]))';

ruleTester.run('no-hover-on-disabled', rule, {
  valid: [
    // The escape hatch for a pseudo-element hover key: the component keeps the
    // disabled case out in JS and says so on the one key.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          hoverOnPointer: {
            '@media (hover: hover)': {
              // eslint-disable-next-line rule-to-test/no-hover-on-disabled -- only applied when !isDisabled
              ':hover::after': {backgroundColor: 'red'},
            },
          },
        });
      `,
    },
    // A pseudo-element WITHOUT hover is not this rule's concern.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          card: {'::after': {backgroundColor: 'transparent'}},
        });
      `,
    },
    // Hover on an ancestor styling a pseudo-element stays out of scope, like
    // any other ancestor hover.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          cell: {':is(tr:hover *)::after': {backgroundColor: 'red'}},
        });
      `,
    },
    // The guarded form, property-first.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {
            backgroundColor: {
              default: 'transparent',
              ':hover${GUARD}': 'rgba(0,0,0,0.05)',
            },
          },
        });
      `,
    },
    // The guarded form, condition-first with a nested media query.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {
            ':hover${GUARD}': {
              '@media (hover: hover)': {backgroundColor: 'red'},
            },
          },
        });
      `,
    },
    // Not a hover condition at all.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {color: {default: 'red', ':active': 'blue', ':focus-visible': 'green'}},
        });
      `,
    },
    // An ANCESTOR's hover styling a descendant — a row may legitimately
    // highlight around a disabled control, so this is out of scope.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          cell: {opacity: {default: 0, ':is(th:hover *)': 1}},
        });
      `,
    },
    // Plain object literals outside stylex.create are not styles.
    {
      code: `const handlers = {':hover': () => {}};`,
    },
  ],
  invalid: [
    // The bare key, property-first.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {backgroundColor: {default: 'transparent', ':hover': 'red'}},
        });
      `,
      errors: [{messageId: 'unguardedHover'}],
      output: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {backgroundColor: {default: 'transparent', ':hover${GUARD}': 'red'}},
        });
      `,
    },
    // Condition-first, nested media block preserved by the fix.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {':hover': {'@media (hover: hover)': {backgroundColor: 'red'}}},
        });
      `,
      errors: [{messageId: 'unguardedHover'}],
      output: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {':hover${GUARD}': {'@media (hover: hover)': {backgroundColor: 'red'}}},
        });
      `,
    },
    // An existing qualifier is kept and the guard appended after it.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          field: {borderColor: {default: 'grey', ':hover:not(:focus-within)': 'black'}},
        });
      `,
      errors: [{messageId: 'unguardedHover'}],
      output: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          field: {borderColor: {default: 'grey', ':hover:not(:focus-within)${GUARD}': 'black'}},
        });
      `,
    },
    // A pseudo-ELEMENT key is reported but never autofixed: StyleX 0.19.0
    // ranks the guarded form below a plain `::after` rule, so the fix would
    // turn a disabled-hover lint into a hover that never paints.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          tab: {opacity: {default: 0, ':hover::after': 1}},
        });
      `,
      errors: [{messageId: 'unguardedHoverPseudoElement'}],
    },
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          tab: {opacity: {default: 0, ':hover::before': 1}},
        });
      `,
      errors: [{messageId: 'unguardedHoverPseudoElement'}],
    },
    // A condition-first pseudo-element key is held to the same standard.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          card: {':hover::after': {'@media (hover: hover)': {backgroundColor: 'red'}}},
        });
      `,
      errors: [{messageId: 'unguardedHoverPseudoElement'}],
    },
    // An already guarded pseudo-element key is reported too: it is the shape
    // the old autofix produced, and it silently loses to a plain `::after`.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          card: {backgroundColor: {default: 'transparent', ':hover${GUARD}::after': 'red'}},
        });
      `,
      errors: [{messageId: 'guardedHoverPseudoElement'}],
    },
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          card: {backgroundColor: {default: 'transparent', ':hover:not(:disabled)::after': 'red'}},
        });
      `,
      errors: [{messageId: 'guardedHoverPseudoElement'}],
    },
    // A double-quoted key is rewritten single-quoted: the guard carries its
    // own double quotes.
    {
      code: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {color: {default: 'red', ":hover": 'blue'}},
        });
      `,
      errors: [{messageId: 'unguardedHover'}],
      output: `
        import * as stylex from '@stylexjs/stylex';
        const styles = stylex.create({
          item: {color: {default: 'red', ':hover${GUARD}': 'blue'}},
        });
      `,
    },
  ],
});
