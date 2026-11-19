// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-shorthand-longhand-merge.test.mjs
 */

import {RuleTester} from 'eslint';
import rule from './no-shorthand-longhand-merge.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {ecmaFeatures: {jsx: true}},
  },
});

const sheet = `
  import * as stylex from '@stylexjs/stylex';
  const styles = stylex.create({
    indent: { marginInline: 8 },
    gutter: { marginInlineStart: -24, paddingInlineStart: 16 },
    start: { marginInlineStart: 4 },
    end: { marginInlineEnd: 4 },
    stack: { gap: 4 },
    rows: { rowGap: 2 },
    grow: { flex: 1 },
    fixed: { flexShrink: 0 },
    pad: (v) => ({ padding: v }),
  });
`;

ruleTester.run('no-shorthand-longhand-merge', rule, {
  valid: [
    // One property per axis: longhands on both sides merge by property.
    {code: sheet + `stylex.props(styles.start, styles.end);`},
    // The same longhand twice: the later style wins in every build.
    {code: sheet + `stylex.props(styles.gutter, styles.start);`},
    // Different branches of one conditional never merge.
    {code: sheet + `stylex.props(cond ? styles.indent : styles.gutter);`},
    // A style the rule cannot read adds nothing.
    {code: sheet + `stylex.props(styles.indent, props.xstyle);`},
    // A shorthand before its longhand: the longhand wins in every build.
    {code: sheet + `stylex.props(styles.indent, isOrdered && styles.gutter);`},
    {code: sheet + `stylex.props(styles.stack, styles.rows);`},
    // Separate merges.
    {code: sheet + `stylex.props(styles.stack); stylex.props(styles.rows);`},
  ],
  invalid: [
    // A shorthand after its longhand: the builds disagree.
    {
      code: sheet + `stylex.props(styles.gutter, isFlush && styles.indent);`,
      errors: [{messageId: 'merge'}],
    },
    {
      code: sheet + `stylex.props(styles.rows, styles.stack);`,
      errors: [{messageId: 'merge'}],
    },
    {
      code: sheet + `stylex.props(styles.fixed, styles.grow);`,
      errors: [{messageId: 'merge'}],
    },
    // Dynamic styles are read too.
    {
      code: sheet + `stylex.props(styles.gutter, styles.pad(4));`,
      errors: [{messageId: 'merge'}],
    },
    // An xstyle array is a merge.
    {
      code: sheet + `const el = <List xstyle={[styles.end, styles.indent]} />;`,
      errors: [{messageId: 'merge'}],
    },
    // A local constant stands for the styles it picks.
    {
      code:
        sheet +
        `const side = cond ? styles.start : styles.end;
         stylex.props(side, styles.indent);`,
      errors: [{messageId: 'merge'}, {messageId: 'merge'}],
    },
  ],
});
