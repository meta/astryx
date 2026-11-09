// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-truthy-jsx-guard.test.mjs
 * @description Tests for the Astryx no-truthy-jsx-guard ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-truthy-jsx-guard.js';

// The rule reads types. Each case is a file that no tsconfig includes, so the
// project service gives it the default project.
const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
      projectService: {allowDefaultProject: ['*.tsx']},
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const filename = `${import.meta.dirname}/fixture.tsx`;

const header = `
import type {ReactNode} from 'react';
type IconType = (props: {size: number}) => ReactNode;
declare function isRenderable(node: ReactNode): boolean;
declare const Slot: (props: {children?: ReactNode}) => ReactNode;
`;

function file(body) {
  return {code: `${header}\n${body}`, filename};
}

/**
 * One report on `value`, whose suggestion wraps its `occurrence`-th guard
 * (1-based) in `isRenderable`.
 */
function flagged(body, messageId, value, occurrence = 1) {
  const guard = messageId === 'andGuard' ? `${value} &&` : `${value} ?`;
  const parts = body.split(guard);
  const fixed =
    parts.slice(0, occurrence).join(guard) +
    `isRenderable(${value}) ${guard.slice(value.length + 1)}` +
    parts.slice(occurrence).join(guard);
  return {
    ...file(body),
    errors: [
      {
        messageId,
        data: {value},
        suggestions: [
          {
            desc: `Replace with isRenderable(${value})`,
            output: `${header}\n${fixed}`,
          },
        ],
      },
    ],
  };
}

// RuleTester registers its own describe/it blocks internally, so it must run
// at the top level (Vitest 4 forbids calling suite functions inside an it()).
tester.run('no-truthy-jsx-guard', rule, {
  valid: [
    // ✅ The shared presence check.
    file(
      `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{isRenderable(startIcon) && <Slot>{startIcon}</Slot>}</div>;`,
    ),
    file(
      `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{isRenderable(startIcon) ? <Slot>{startIcon}</Slot> : null}</div>;`,
    ),
    // ✅ A boolean is not a slot value.
    file(
      `export const C = ({isOpen}: {isOpen?: boolean}) => <div>{isOpen && <Slot>open</Slot>}</div>;`,
    ),
    // ✅ Neither is a string, a plain number or a data object.
    file(
      `export const C = ({title}: {title?: string}) => <div>{title && <h2>{title}</h2>}</div>;`,
    ),
    file(
      `export const C = ({count}: {count: number}) => <div>{count ? <b>{count}</b> : null}</div>;`,
    ),
    file(
      `export const C = ({user}: {user?: {name: string}}) => <div>{user && <b>{user.name}</b>}</div>;`,
    ),
    // ✅ A converted guard renders no stray text.
    file(
      `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{!!startIcon && <Slot>{startIcon}</Slot>}</div>;`,
    ),
    // ✅ A truthiness test that does not guard JSX.
    file(`export const f = (label: ReactNode) => (label ? 'yes' : 'no');`),
    // ✅ The allow form names its reason.
    file(
      `export const C = ({startIcon}: {startIcon?: ReactNode}) => (
  <div>
    {/* eslint-disable-next-line rule-to-test/no-truthy-jsx-guard -- 0 is not a valid icon here */}
    {startIcon && <Slot>{startIcon}</Slot>}
  </div>
);`,
    ),
    // ✅ Baselined values in their own file.
    {
      ...file(
        `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{startIcon && <Slot>{startIcon}</Slot>}</div>;`,
      ),
      options: [
        {
          baseline: {'fixture.tsx': ['startIcon']},
          root: import.meta.dirname,
        },
      ],
    },
  ],
  invalid: [
    // ❌ The stray "0": `0 && <Slot />` renders 0.
    flagged(
      `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{startIcon && <Slot>{startIcon}</Slot>}</div>;`,
      'andGuard',
      'startIcon',
    ),
    // ❌ A union that adds a component type to ReactNode.
    flagged(
      `export const C = ({startIcon}: {startIcon?: ReactNode | IconType}) => <div>{startIcon && <Slot>icon</Slot>}</div>;`,
      'andGuard',
      'startIcon',
    ),
    // ❌ A member expression later in a chain.
    flagged(
      `export const C = ({item, isOpen}: {item: {icon?: ReactNode}; isOpen: boolean}) => <div>{isOpen && item.icon && <Slot>{item.icon}</Slot>}</div>;`,
      'andGuard',
      'item.icon',
    ),
    // ❌ The ternary drops the slot for 0.
    flagged(
      `export const C = ({label}: {label?: ReactNode}) => <div>{label ? <Slot>{label}</Slot> : null}</div>;`,
      'ternaryGuard',
      'label',
    ),
    // ❌ A type parameter bound by ReactNode.
    flagged(
      `export function C<T extends ReactNode>({icon}: {icon: T}) { return <div>{icon && <Slot>{icon}</Slot>}</div>; }`,
      'andGuard',
      'icon',
    ),
    // ❌ The baseline allows as many guards as it lists; one more is reported.
    {
      ...flagged(
        `export const C = ({startIcon}: {startIcon?: ReactNode}) => <div>{startIcon && <Slot>{startIcon}</Slot>}<Slot>{startIcon && <b>{startIcon}</b>}</Slot></div>;`,
        'andGuard',
        'startIcon',
        2,
      ),
      options: [
        {
          baseline: {'fixture.tsx': ['startIcon']},
          root: import.meta.dirname,
        },
      ],
    },
  ],
});
