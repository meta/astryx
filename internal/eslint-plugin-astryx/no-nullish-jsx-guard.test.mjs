// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-nullish-jsx-guard.test.mjs
 * @description Tests for the Astryx no-nullish-jsx-guard ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-nullish-jsx-guard.js';

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      ecmaFeatures: {jsx: true},
    },
  },
});

// RuleTester registers its own describe/it blocks internally, so it must run
// at the top level (Vitest 4 forbids calling suite functions inside an it()).
tester.run('no-nullish-jsx-guard', rule, {
  valid: [
    // ✅ The shared utility, or a presence test without a boolean test.
    {code: `const hasLabel = isRenderable(label);`},
    {code: `const hasValue = value != null && value !== '';`},
    {code: `const isFlag = typeof flag === 'boolean' && flag;`},
    // ✅ Different values in the presence and boolean tests.
    {code: `const ok = a != null && typeof b !== 'boolean';`},
    // ✅ Type switches test the value against another type too.
    {
      code: `function f(value) { return value == null || typeof value === 'boolean' || typeof value === 'number'; }`,
    },
    {
      code: `const isMenu = mobileNav != null && mobileNav !== false && !isValidElement(mobileNav);`,
    },
    {
      code: `const isList = items != null && items !== false && Array.isArray(items);`,
    },
    // ✅ A grouped type switch (AppShell's mobileNav).
    {
      code: `const isNode = mobileNav != null && mobileNav !== false && (isValidElement(mobileNav) || typeof mobileNav === 'string');`,
    },
    // ✅ The utility's own definition.
    {
      code: `export function isRenderable(node) { return node != null && typeof node !== 'boolean' && node !== ''; }`,
      filename: '/repo/packages/core/src/utils/isRenderable.ts',
    },
    // ✅ Baselined values in their own file, for both checks.
    {
      code: `const hasLabel = label != null && typeof label !== 'boolean'; const C = () => <div>{slot != null && <b>{slot}</b>}</div>;`,
      filename: '/repo/packages/core/src/Badge/Badge.tsx',
      options: [
        {
          baseline: {'packages/core/src/Badge/Badge.tsx': ['label', 'slot']},
          root: '/repo',
        },
      ],
    },
    // ✅ Already using isRenderable — the shipped fix.
    {
      code: `const C = () => <div>{isRenderable(sideNav) && <aside>{sideNav}</aside>}</div>;`,
    },
    {
      code: `const C = () => <div>{isRenderable(label) ? <span>{label}</span> : null}</div>;`,
    },

    // ✅ Guarded value is a data object used only as a prop, not rendered as a
    //    child — `!= null` is the correct guard, do not flag.
    {
      code: `const C = () => <div>{user != null && <Profile user={user} />}</div>;`,
    },
    {
      code: `const C = () => <div>{config !== undefined ? <Widget config={config} /> : null}</div>;`,
    },

    // ✅ Boolean-style guard with no nullish comparison at all.
    {code: `const C = () => <div>{isOpen && <Menu />}</div>;`},
    {code: `const C = () => <div>{hasItems ? <List /> : null}</div>;`},

    // ✅ Nullish comparison but the branch does not render JSX.
    {code: `const C = () => <div>{title != null && title}</div>;`},
    {code: `const x = value != null && doSomething();`},

    // ✅ Nullish comparison guarding JSX, but the guarded value is NOT the
    //    thing being rendered (a sibling value is).
    {
      code: `const C = () => <div>{count != null && <Badge>{label}</Badge>}</div>;`,
    },

    // ✅ Non-nullish comparison (numeric) — out of scope.
    {
      code: `const C = () => <div>{items.length > 0 && <List>{items}</List>}</div>;`,
    },

    // ✅ Equality nullish check whose rendered branch does not contain the value.
    {
      code: `const C = () => <div>{value == null ? <Empty /> : <Filled />}</div>;`,
    },

    // ✅ Test fixtures are skipped.
    {
      code: `const C = () => <div>{sideNav != null && <aside>{sideNav}</aside>}</div>;`,
      filename: '/packages/core/src/AppShell/AppShell.test.tsx',
    },
  ],

  invalid: [
    // ❌ isRenderable written out by hand (Badge's form), outside JSX.
    {
      code: `const hasLabel = label !== '' && label != null && typeof label !== 'boolean';`,
      errors: [{messageId: 'handRolledRenderable'}],
    },
    {
      code: `const hasTitle = title != null && title !== '' && title !== false;`,
      errors: [{messageId: 'handRolledRenderable'}],
    },
    {
      code: `const hasToolbar = props.toolbar != null && typeof props.toolbar !== 'boolean';`,
      errors: [{messageId: 'handRolledRenderable'}],
    },
    // ❌ The negated form: nothing to render.
    {
      code: `function f(rendered) { if (rendered == null || typeof rendered === 'boolean') { return null; } return rendered; }`,
      errors: [{messageId: 'handRolledRenderable'}],
    },
    // ❌ A hand-written check that also guards JSX is one report, not two.
    {
      code: `const C = () => <div>{label != null && typeof label !== 'boolean' && <span>{label}</span>}</div>;`,
      errors: [{messageId: 'handRolledRenderable'}],
    },
    // ❌ One more check of a listed value than the baseline allows.
    {
      code: `const a = label != null && typeof label !== 'boolean'; const b = label != null && typeof label !== 'boolean';`,
      filename: '/repo/packages/core/src/Badge/Badge.tsx',
      options: [
        {
          baseline: {'packages/core/src/Badge/Badge.tsx': ['label']},
          root: '/repo',
        },
      ],
      errors: [{messageId: 'handRolledRenderable'}],
    },
    // ❌ A baseline for another file or another value does not cover it.
    {
      code: `const hasLabel = label != null && typeof label !== 'boolean';`,
      filename: '/repo/packages/core/src/Badge/Badge.tsx',
      options: [
        {
          baseline: {'packages/core/src/Badge/Badge.tsx': ['title']},
          root: '/repo',
        },
      ],
      errors: [{messageId: 'handRolledRenderable'}],
    },
    // ❌ Canonical slot leak: `x != null && <El>{x}</El>`.
    {
      code: `const C = () => <div>{sideNav != null && <aside>{sideNav}</aside>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(sideNav)',
              output: `const C = () => <div>{isRenderable(sideNav) && <aside>{sideNav}</aside>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ `!== null` variant.
    {
      code: `const C = () => <div>{icon !== null && <span>{icon}</span>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(icon)',
              output: `const C = () => <div>{isRenderable(icon) && <span>{icon}</span>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ `!== undefined` variant.
    {
      code: `const C = () => <div>{footer !== undefined && <footer>{footer}</footer>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(footer)',
              output: `const C = () => <div>{isRenderable(footer) && <footer>{footer}</footer>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Reversed operand order: `null != x`.
    {
      code: `const C = () => <div>{null != banner && <header>{banner}</header>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(banner)',
              output: `const C = () => <div>{isRenderable(banner) && <header>{banner}</header>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Extra conjuncts in the `&&` chain — the nullish guard is still flagged.
    {
      code: `const C = () => <div>{metadata != null && !isSystem && <div>{metadata}</div>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(metadata)',
              output: `const C = () => <div>{isRenderable(metadata) && !isSystem && <div>{metadata}</div>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Member-expression slot value rendered as a child.
    {
      code: `const C = () => <div>{call.node != null && <pre>{call.node}</pre>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(call.node)',
              output: `const C = () => <div>{isRenderable(call.node) && <pre>{call.node}</pre>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Ternary consequent render (`!=` polarity).
    {
      code: `const C = () => <div>{label != null ? <span>{label}</span> : null}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(label)',
              output: `const C = () => <div>{isRenderable(label) ? <span>{label}</span> : null}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Ternary alternate render (`==` polarity) — suggests `!isRenderable`.
    {
      code: `const C = () => <div>{label == null ? null : <span>{label}</span>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with !isRenderable(label)',
              output: `const C = () => <div>{!isRenderable(label) ? null : <span>{label}</span>}</div>;`,
            },
          ],
        },
      ],
    },
    // ❌ Value rendered nested deeper inside the branch, via an expression.
    {
      code: `const C = () => <div>{title != null && <h1><Trim>{title.trim()}</Trim></h1>}</div>;`,
      errors: [
        {
          messageId: 'nullishGuard',
          suggestions: [
            {
              desc: 'Replace with isRenderable(title)',
              output: `const C = () => <div>{isRenderable(title) && <h1><Trim>{title.trim()}</Trim></h1>}</div>;`,
            },
          ],
        },
      ],
    },
  ],
});
