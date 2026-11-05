// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file require-baseprops-passthrough.test.mjs
 * @description Tests for the require-baseprops-passthrough ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './require-baseprops-passthrough.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {ecmaFeatures: {jsx: true}},
  },
});

ruleTester.run('require-baseprops-passthrough', rule, {
  valid: [
    // ✅ All three styling props destructured and threaded into mergeProps.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({xstyle, className, style}: FooProps) {
          return (
            <div
              {...mergeProps(
                stylex.props(styles.root, xstyle),
                className,
                style,
              )}
            />
          );
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ className/style ride a rest spread onto the root; xstyle threaded.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({xstyle, ...rest}: FooProps) {
          return <div {...rest} {...stylex.props(styles.root, xstyle)} />;
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ Everything rides a rest spread onto a composed component.
    {
      code: `
        interface FooProps extends BaseProps<HTMLButtonElement> {}
        function Foo({label, ...rest}: FooProps) {
          return <Button label={label} {...rest} />;
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ Explicit opt-out of all three via Omit.
    {
      code: `
        interface FooProps extends Omit<BaseProps<HTMLElement>, 'xstyle' | 'className' | 'style'> {}
        function Foo({as: Comp = 'span'}: FooProps) {
          return <Comp {...stylex.props(styles.root)} />;
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ Leading-underscore binding = intentionally unused.
    {
      code: `
        interface FooProps extends BaseProps<HTMLButtonElement> {}
        function Foo({xstyle, className: _className, style: _style}: FooProps) {
          return <Button xstyle={xstyle} />;
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ Internal helper (no displayName) is not checked.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function InternalHelper({label}: FooProps) {
          return <div {...stylex.props(styles.root)} />;
        }
      `,
    },
    // ✅ Props type does not extend BaseProps → not checked.
    {
      code: `
        interface FooProps {label: string;}
        function Foo({label}: FooProps) {
          return <div>{label}</div>;
        }
        Foo.displayName = 'Foo';
      `,
    },
    // ✅ Pick that includes only className/style, both forwarded.
    {
      code: `
        interface FooProps extends Pick<BaseProps, 'className' | 'style'> {}
        function Foo({className, style}: FooProps) {
          return <div className={className} style={style} />;
        }
        Foo.displayName = 'Foo';
      `,
    },
  ],
  invalid: [
    // ❌ xstyle destructured but never used.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({xstyle, className, style}: FooProps) {
          return (
            <div {...mergeProps(stylex.props(styles.root), className, style)} />
          );
        }
        Foo.displayName = 'Foo';
      `,
      errors: [{messageId: 'unusedStylingProp', data: {prop: 'xstyle'}}],
    },
    // ❌ className/style never forwarded (no rest, not threaded).
    //    xstyle IS threaded, so only className + style are flagged.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({xstyle}: FooProps) {
          return <div {...stylex.props(styles.root, xstyle)} />;
        }
        Foo.displayName = 'Foo';
      `,
      errors: [
        {messageId: 'droppedStylingProp'},
        {messageId: 'droppedStylingProp'},
      ],
    },
    // ❌ Nothing forwarded at all → all three flagged.
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({label}: FooProps) {
          return <div {...stylex.props(styles.root)}>{label}</div>;
        }
        Foo.displayName = 'Foo';
      `,
      errors: [
        {messageId: 'droppedStylingProp'},
        {messageId: 'droppedStylingProp'},
        {messageId: 'droppedStylingProp'},
      ],
    },
    // ❌ xstyle rides ...rest onto a native element (inert); className/style are OK there.
    {
      code: `
        interface FooProps extends BaseProps<HTMLButtonElement> {}
        function Foo({label, ...rest}: FooProps) {
          return <button {...rest} {...stylex.props(styles.root)}>{label}</button>;
        }
        Foo.displayName = 'Foo';
      `,
      errors: [
        {
          messageId: 'xstyleInertOnRest',
          data: {rest: 'rest', element: 'button'},
        },
      ],
    },
    // ❌ className destructured but unused (style rides rest).
    {
      code: `
        interface FooProps extends BaseProps<HTMLDivElement> {}
        function Foo({xstyle, className, ...rest}: FooProps) {
          return <div {...rest} {...stylex.props(styles.root, xstyle)} />;
        }
        Foo.displayName = 'Foo';
      `,
      errors: [{messageId: 'unusedStylingProp', data: {prop: 'className'}}],
    },
  ],
});
