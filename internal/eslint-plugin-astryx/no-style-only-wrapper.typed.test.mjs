// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-style-only-wrapper.typed.test.mjs
 * @description Typed cases for the no-style-only-wrapper ESLint rule: with
 * type information, a wrapper around a component whose props take no root
 * `xstyle` is the only box that can carry the style, so it does not warn.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import noStyleOnlyWrapperRule from './no-style-only-wrapper.js';

// Each case is a file that no tsconfig includes, so the project service gives
// it the default project. It imports real modules from the fixtures folder, so
// the rule reads their props from types.
const fixtures = `${import.meta.dirname}/__fixtures__/no-style-only-wrapper`;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
      projectService: {allowDefaultProject: ['*.tsx']},
      tsconfigRootDir: fixtures,
    },
  },
});

const filename = `${fixtures}/fixture.tsx`;

// The fixtures folder holds the shapes that matter: a field input whose props
// omit root `xstyle` and take only `containerXstyle` (as `FieldInputBaseProps`
// does), an internal editor with no style prop, and a component that takes
// `xstyle`. Each is imported from a relative module, so the rule treats it as
// an Astryx component.
const header = `
import * as stylex from '@stylexjs/stylex';
import {Selector} from './Selector';
import {ValueEditor} from './ValueEditor';
import {Button} from './Button';
const styles = stylex.create({
  column: {flexGrow: 1, flexShrink: 1, minWidth: 0},
  offset: {marginInlineStart: 4},
});
`;

function file(body) {
  return {code: `${header}\n${body}`, filename};
}

tester.run('no-style-only-wrapper (typed)', noStyleOnlyWrapperRule, {
  valid: [
    // A field input takes no root xstyle, so the wrapper is the only box that
    // can size its column.
    file(
      `const a = <div {...stylex.props(styles.column)}><Selector label="Field" /></div>;`,
    ),
    // An editor with no style prop at all: the wrapper is the only box.
    file(
      `const a = <div {...stylex.props(styles.column)}><ValueEditor value="x" /></div>;`,
    ),
  ],
  invalid: [
    // The child takes xstyle, so the wrapper is redundant: still reported,
    // with the rewrite onto xstyle.
    {
      ...file(
        `const a = <div {...stylex.props(styles.column)}><Button label="Go" /></div>;`,
      ),
      errors: [
        {
          messageId: 'styleOnlyWrapper',
          suggestions: [
            {
              messageId: 'moveToXstyle',
              output: `${header}\nconst a = <Button xstyle={styles.column} label="Go" />;`,
            },
          ],
        },
      ],
    },
    // A plain style attribute around a child that takes xstyle: still reported.
    {
      ...file(
        `const a = <div style={{marginInlineStart: 4}}><Button label="Go" /></div>;`,
      ),
      errors: [{messageId: 'styleOnlyWrapper'}],
    },
  ],
});
