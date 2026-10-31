// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-classname-clobber.test.mjs
 * @description Tests for the no-classname-clobber ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-classname-clobber.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
      sourceType: 'module',
    },
  },
});

ruleTester.run('no-classname-clobber', rule, {
  valid: [
    // One className producer on its own.
    {code: `<div {...stylex.props(styles.root)} />`},
    {code: `<div {...themeProps('card')} />`},
    {code: `<div {...focusOutlineProps.focusVisible(styles.root)} />`},

    // The sanctioned merge: both producers inside ONE mergeProps call.
    {
      code: `<div {...mergeProps(themeProps('card'), stylex.props(styles.root))} />`,
    },
    {
      code: `<div {...mergeProps(themeProps('card'), stylex.props(styles.root), className, style)} />`,
    },
    // Nested mergeProps is still one spread.
    {
      code: `<div {...mergeProps(mergeProps(themeProps('card'), stylex.props(styles.root)), rest)} />`,
    },

    // A producer beside spreads that carry no className. `...rest` and a
    // hook's prop bag are the two shapes this must never flag.
    {code: `<div {...rest} {...stylex.props(styles.root)} />`},
    {code: `<button {...popover.triggerProps} {...stylex.props(styles.root)} />`},
    {
      code: `<button {...rest} {...popover.triggerProps} {...stylex.props(styles.root)} />`,
    },

    // mergeProps merging a producer with a plain object is one producer, so
    // it is fine beside a spread that produces nothing.
    {
      code: `<button {...mergeProps(themeProps('x'), {'aria-haspopup': 'menu'})} {...popover.triggerProps} />`,
    },
    // mergeProps merging nothing that carries a className is not a producer.
    {
      code: `<div {...mergeProps(rest, {role: 'group'})} {...stylex.props(styles.root)} />`,
    },

    // No spread at all, so nothing to clobber.
    {code: `<div className={cls} style={inline} />`},
    // A literal className beside a NON-stylex spread is out of scope: the
    // rule speaks about stylex.props(), which is not here.
    {code: `<div className={cls} {...rest} />`},

    // Unknown calls are not producers, however many there are.
    {code: `<div {...getAriaProps()} {...useSomething()} />`},
  ],

  invalid: [
    // The Breadcrumbs regression, literally. `mergeProps` on the first spread
    // reads as if merging is handled; the second spread still wins, and
    // astryx-breadcrumb-item-menu-trigger reached no element.
    {
      code: `
        <button
          {...mergeProps(themeProps('breadcrumb-item-menu-trigger'), {
            ...popover.triggerProps,
            'aria-haspopup': 'menu',
          })}
          {...stylex.props(
            itemStyles.link,
            itemStyles.buttonReset,
            isSupporting ? itemStyles.supportingLink : itemStyles.defaultLink,
          )}
        />
      `,
      errors: [
        {
          messageId: 'spreadClassNameClobber',
          data: {earlier: 'mergeProps()', later: 'stylex.props()'},
        },
      ],
    },

    // The bare two-spread shape.
    {
      code: `<div {...themeProps('card')} {...stylex.props(styles.root)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },
    // ...and in the other order, which loses the StyleX classes instead.
    {
      code: `<div {...stylex.props(styles.root)} {...themeProps('card')} />`,
      errors: [
        {
          messageId: 'spreadClassNameClobber',
          data: {earlier: 'stylex.props()', later: 'themeProps()'},
        },
      ],
    },

    // Two stylex.props spreads: the second replaces the first outright.
    {
      code: `<div {...stylex.props(styles.a)} {...stylex.props(styles.b)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },

    // focusOutlineProps.* returns stylex.props(), so the focus ring is what
    // gets thrown away here.
    {
      code: `<a {...themeProps('link')} {...focusOutlineProps.focusVisible(styles.root)} />`,
      errors: [
        {
          messageId: 'spreadClassNameClobber',
          data: {earlier: 'themeProps()', later: 'focusOutlineProps.focusVisible()'},
        },
      ],
    },

    // Two mergeProps calls, each carrying a className of its own.
    {
      code: `<div {...mergeProps(themeProps('x'), rest)} {...mergeProps(stylex.props(styles.a), other)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },

    // A TS cast around the call does not hide it.
    {
      code: `<div {...themeProps('card')} {...(stylex.props(styles.root) as never)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },

    // Unknown spreads in between change nothing.
    {
      code: `<div {...themeProps('card')} {...rest} {...stylex.props(styles.root)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },

    // Three producers, one report: the fix rewrites the whole attribute list.
    {
      code: `<div {...themeProps('card')} {...stylex.props(styles.a)} {...focusOutlineProps.focusVisible(styles.b)} />`,
      errors: [{messageId: 'spreadClassNameClobber'}],
    },

    // The original shape, unchanged: a literal attribute beside the spread.
    {
      code: `<div className={cls} {...stylex.props(styles.root)} />`,
      errors: [{messageId: 'classNameClobber'}],
    },
    {
      code: `<div {...stylex.props(styles.root)} style={inline} />`,
      errors: [{messageId: 'styleClobber'}],
    },
    {
      code: `<div className={cls} style={inline} {...stylex.props(styles.root)} />`,
      errors: [{messageId: 'classNameClobber'}, {messageId: 'styleClobber'}],
    },
    // Both halves of the rule on one element, reported once each.
    {
      code: `<div className={cls} {...themeProps('card')} {...stylex.props(styles.root)} />`,
      errors: [
        {messageId: 'classNameClobber'},
        {messageId: 'spreadClassNameClobber'},
      ],
    },
  ],
});
