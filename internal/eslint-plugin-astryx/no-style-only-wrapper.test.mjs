// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-style-only-wrapper.test.mjs
 * @description Tests for the no-style-only-wrapper ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import noStyleOnlyWrapperRule from './no-style-only-wrapper.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
      sourceType: 'module',
    },
  },
});

/** Preamble shared by most cases: an Astryx import plus a local style table. */
const setup = `
import * as stylex from '@stylexjs/stylex';
import {Icon} from '../Icon';
const styles = stylex.create({
  mirror: {transform: 'scaleX(-1)'},
  offset: {marginInlineStart: 4},
  row: {display: 'flex', alignItems: 'center'},
  padded: {padding: 8},
});
`;

// RuleTester registers its own describe/it blocks internally, so it
// must run at the top level. Vitest 4 forbids calling suite functions
// (describe/it) from inside another it() callback.
ruleTester.run('no-style-only-wrapper', noStyleOnlyWrapperRule, {
  valid: [
    // The component is styled directly — the shape the rule is steering toward.
    {code: `${setup} const a = <Icon icon="x" xstyle={styles.mirror} />;`},

    // No styles on the wrapper: it is grouping, not styling.
    {code: `${setup} const a = <span><Icon icon="x" /></span>;`},

    // More than one child — a real layout container.
    {
      code: `${setup} const a = <div {...stylex.props(styles.offset)}><Icon icon="a" /><Icon icon="b" /></div>;`,
    },

    // Text alongside the component.
    {
      code: `${setup} const a = <span {...stylex.props(styles.offset)}>label <Icon icon="x" /></span>;`,
    },

    // Structural styles: display/flex set up the child's formatting context,
    // so the wrapper is not redundant.
    {
      code: `${setup} const a = <div {...stylex.props(styles.row)}><Icon icon="x" /></div>;`,
    },
    // Padding around the child's border box cannot move onto the child.
    {
      code: `${setup} const a = <div {...stylex.props(styles.padded)}><Icon icon="x" /></div>;`,
    },
    // Structural style reached through a conditional still counts.
    {
      code: `${setup} const a = <div {...stylex.props(isWide && styles.row)}><Icon icon="x" /></div>;`,
    },

    // The wrapper does more than style: semantics, behavior, identity, refs.
    {
      code: `${setup} const a = <span aria-hidden="true" {...stylex.props(styles.mirror)}><Icon icon="x" /></span>;`,
    },
    {
      code: `${setup} const a = <div role="status" {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
    },
    {
      code: `${setup} const a = <div onClick={fn} {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
    },
    {
      code: `${setup} const a = <div ref={ref} {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
    },
    {
      code: `${setup} const a = <div data-testid="t" {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
    },
    // A forwarding wrapper — the spread may carry anything.
    {
      code: `${setup} const a = <div {...rest} {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
    },

    // Host-element children have no xstyle prop to move the styles to.
    {
      code: `${setup} const a = <span {...stylex.props(styles.mirror)}><svg /></span>;`,
    },
    // Neither do components from outside Astryx.
    {
      code: `import * as stylex from '@stylexjs/stylex';
import {Chart} from 'third-party';
const styles = stylex.create({offset: {marginTop: 4}});
const a = <div {...stylex.props(styles.offset)}><Chart /></div>;`,
    },
    // Components that render no root element (portals/providers) have nowhere
    // to put xstyle.
    {
      code: `import * as stylex from '@stylexjs/stylex';
import {Tooltip} from '../Tooltip';
const styles = stylex.create({offset: {marginTop: 4}});
const a = <div {...stylex.props(styles.offset)}><Tooltip label="x" /></div>;`,
    },

    // Only wrapper elements are candidates.
    {
      code: `${setup} const a = <section {...stylex.props(styles.mirror)}><Icon icon="x" /></section>;`,
    },

    // Expression children are not resolvable to a component.
    {
      code: `${setup} const a = <div {...stylex.props(styles.mirror)}>{icon}</div>;`,
    },
    // Nor are fragments.
    {
      code: `${setup} const a = <div {...stylex.props(styles.mirror)}><><Icon icon="x" /></></div>;`,
    },

    // Opting a component out via options.
    {
      code: `${setup} const a = <div {...stylex.props(styles.mirror)}><Icon icon="x" /></div>;`,
      options: [{allowComponents: ['Icon']}],
    },
  ],

  invalid: [
    // The motivating case: an RTL mirror on a display wrapper instead of the
    // Icon (meta/astryx#4752).
    {
      code: `${setup} const a = <span {...stylex.props(styles.mirror)}><Icon icon="chevronsLeft" /></span>;`,
      errors: [
        {
          messageId: 'styleOnlyWrapper',
          data: {wrapper: 'span', component: 'Icon'},
          suggestions: [
            {
              messageId: 'moveToXstyle',
              output: `${setup} const a = <Icon xstyle={styles.mirror} icon="chevronsLeft" />;`,
            },
          ],
        },
      ],
    },

    // Several style arguments collapse into an xstyle array.
    {
      code: `${setup} const a = <div {...stylex.props(styles.offset, isSm && styles.mirror)}><Icon icon="x" /></div>;`,
      errors: [
        {
          messageId: 'styleOnlyWrapper',
          suggestions: [
            {
              messageId: 'moveToXstyle',
              output: `${setup} const a = <Icon xstyle={[styles.offset, isSm && styles.mirror]} icon="x" />;`,
            },
          ],
        },
      ],
    },

    // Styles the rule cannot resolve (imported style objects) still read as
    // decorative — this is the shape #4752 actually shipped.
    {
      code: `import * as stylex from '@stylexjs/stylex';
import {Icon} from '../Icon';
import {rtlStyles} from '../utils';
const a = <span {...stylex.props(rtlStyles.mirror)}><Icon icon="chevronsRight" /></span>;`,
      errors: [
        {
          messageId: 'styleOnlyWrapper',
          suggestions: [
            {
              messageId: 'moveToXstyle',
              output: `import * as stylex from '@stylexjs/stylex';
import {Icon} from '../Icon';
import {rtlStyles} from '../utils';
const a = <Icon xstyle={rtlStyles.mirror} icon="chevronsRight" />;`,
            },
          ],
        },
      ],
    },

    // className-only wrappers are the same anti-pattern.
    {
      code: `${setup} const a = <div className={cls}><Icon icon="x" /></div>;`,
      errors: [{messageId: 'styleOnlyWrapper', suggestions: []}],
    },

    // A key rides along with the element, so it does not excuse the wrapper —
    // but the rewrite is left to the author.
    {
      code: `${setup} const a = items.map((item) => (
  <span key={item.id} {...stylex.props(styles.offset)}><Icon icon={item.icon} /></span>
));`,
      errors: [{messageId: 'styleOnlyWrapper', suggestions: []}],
    },

    // Namespaced components resolve through their root import.
    {
      code: `import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core';
const styles = stylex.create({offset: {marginTop: 4}});
const a = <div {...stylex.props(styles.offset)}><Card.Body /></div>;`,
      errors: [
        {
          messageId: 'styleOnlyWrapper',
          data: {wrapper: 'div', component: 'Card.Body'},
          suggestions: [
            {
              messageId: 'moveToXstyle',
              output: `import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core';
const styles = stylex.create({offset: {marginTop: 4}});
const a = <Card.Body xstyle={styles.offset} />;`,
            },
          ],
        },
      ],
    },

    // A child that already has xstyle is still over-wrapped; merging the two
    // is the author's call, so no suggestion.
    {
      code: `${setup} const a = <div {...stylex.props(styles.offset)}><Icon icon="x" xstyle={styles.mirror} /></div>;`,
      errors: [{messageId: 'styleOnlyWrapper', suggestions: []}],
    },
  ],
});
