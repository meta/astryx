// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-private-attribute.test.mjs
 * @description Tests for the Astryx no-raw-private-attribute ESLint rule.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import rule from './no-raw-private-attribute.js';

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

const site = '/repo/packages/core/src/Button/Button.tsx';
const owner = '/repo/packages/core/src/privateAttributes/press.stylex.ts';
const baselined = attributes => [
  {
    baseline: {'packages/core/src/Button/Button.tsx': attributes},
    root: '/repo',
  },
];

// RuleTester registers its own describe/it blocks internally, so it must run
// at the top level (Vitest 4 forbids calling suite functions inside an it()).
tester.run('no-raw-private-attribute', rule, {
  valid: [
    // ✅ The public theme and media scopes, in every shape.
    {code: `const s = '[data-astryx-theme="dark"]';`, filename: site},
    {code: `const C = () => <div data-astryx-theme="dark" />;`, filename: site},
    {
      code: `const C = () => <div data-astryx-media="photo" />;`,
      filename: site,
    },
    {code: `const p = {'data-astryx-media': surface};`, filename: site},
    {code: 'const s = `[data-astryx-theme="${name}"]`;', filename: site},
    {
      code: 'const s = `[data-${dataAttrNamespace}-media="${surface}"]`;',
      filename: site,
    },
    {code: `el.setAttribute(dataAttr('theme'), name);`, filename: site},
    {code: `const p = {[dataAttr('media')]: resolved};`, filename: site},
    // ✅ The rest of the public list INV23 names.
    {
      code: `
        const C = () => (
          <span
            data-astryx-aspect-ratio-override={fit}
            data-astryx-token=""
            data-astryx-token-value={value}
            data-astryx-menu-press=""
            data-astryx-pressable=""
            data-astryx-edge-comp=""
          />
        );
        const EDGE_COMP_ATTR = 'data-astryx-edge-comp';
        const s = ':has(> [data-astryx-edge-comp]:first-child)';
      `,
      filename: site,
    },
    // ✅ Other data attributes and prose that only mentions the prefix's parts.
    {
      code: `const C = () => <div data-testid="x" data-state="open" />;`,
      filename: site,
    },
    {code: `const s = '[data-astryx]';`, filename: site},
    // ✅ The owner module writes its own attribute: selector, key and setter.
    {
      code: `
        const styles = stylex.create({
          pressed: {transform: {default: null, '[data-astryx-press="on"]': 'scale(0.98)'}},
          ring: {[stylex.when.ancestor('[data-astryx-press="on"]', scope)]: {opacity: 1}},
        });
        export const pressedStyles = styles.pressed;
        export const pressOn = {'data-astryx-press': 'on'};
      `,
      filename: owner,
    },
    // ✅ An owner module in another package writes its own attribute.
    {
      code: `export const syntaxOn = {'data-astryx-richtext-code-syntax': ''};`,
      filename:
        '/repo/packages/richtext/src/privateAttributes/richtext-code-syntax.stylex.ts',
    },
    // ✅ A file imports its own package's owner module.
    {
      code: `import {pressOn} from '../privateAttributes/press.stylex';`,
      filename: site,
    },
    // ✅ A non-exported name inside the owner module.
    {
      code: `const ATTRIBUTE = 'data-astryx-press'; export function setPress(el) { el.setAttribute(ATTRIBUTE, 'on'); }`,
      filename: owner,
    },
    // ✅ Owner-module readers and writers take the name as a call argument,
    //    and setter props use it as a key, including through a constant.
    {
      code: `
        const ATTRIBUTE = 'data-astryx-press';
        const PRESSED = '[data-astryx-press="on"]';
        export const pressOn = {[ATTRIBUTE]: 'on'};
        export function isPressed(element) { return element.matches(PRESSED); }
        export const closestPressed = element => element.closest(PRESSED);
        export const isOn = element => element.matches(\`[\${ATTRIBUTE}="on"]\`);
        export function setPress(element, value) { element.setAttribute(ATTRIBUTE, value); }
        export const styles = stylex.create({base: {opacity: {default: 1, [PRESSED]: 0.8}}});
      `,
      filename: owner,
    },
    // ✅ naming.ts builds every data-astryx-* name.
    {
      code: 'export function dataAttr(name) { return `data-${dataAttrNamespace}-${name}`; }',
      filename: '/repo/packages/core/src/naming.ts',
    },
    // ✅ Baselined sites, once per site, in their own file.
    {
      code: `
        const s = '[data-astryx-press="on"]';
        const C = () => <div data-astryx-submenu-host="" />;
      `,
      filename: site,
      options: baselined(['data-astryx-press', 'data-astryx-submenu-host']),
    },
    {
      code: `const a = '[data-astryx-press="on"]'; const b = '[data-astryx-press="fading"]';`,
      filename: site,
      options: baselined(['data-astryx-press', 'data-astryx-press']),
    },
    {
      code: 'const s = `data-astryx-${part}`;',
      filename: site,
      options: baselined(['data-astryx-*']),
    },
  ],
  invalid: [
    // ❌ A string literal.
    {
      code: `el.setAttribute('data-astryx-press', 'on');`,
      filename: site,
      errors: [
        {
          message:
            '`data-astryx-press` is a private data attribute. Write it only in its owner module, packages/core/src/privateAttributes/press.stylex.ts, and spread the styles, setter props and readers it exports (architecture:public-component-api INV23 lists the public attributes).',
        },
      ],
    },
    // ❌ A template literal, plain or built from the namespace constant.
    {
      code: 'const s = `[data-astryx-cell-gliding="${state}"]`;',
      filename: site,
      errors: [
        {
          messageId: 'raw',
          data: {
            attribute: 'data-astryx-cell-gliding',
            owner: 'packages/core/src/privateAttributes/cell-gliding.stylex.ts',
          },
        },
      ],
    },
    {
      code: 'const s = `[data-${dataAttrNamespace}-table-pinned]`;',
      filename: site,
      errors: [{messageId: 'raw'}],
    },
    // ❌ A JSX attribute name.
    {
      code: `const C = () => <div data-astryx-popover-fallback-close="" />;`,
      filename: site,
      errors: [{messageId: 'raw'}],
    },
    // ❌ An object key, including a setter-props object.
    {
      code: `const props = {'data-astryx-input-group-item': ''};`,
      filename: site,
      errors: [{messageId: 'raw'}],
    },
    // ❌ A selector inside stylex.create, as a key and through stylex.when.
    {
      code: `const styles = stylex.create({base: {transform: {default: null, '[data-astryx-press="on"]': 'scale(0.98)'}}});`,
      filename: site,
      errors: [{messageId: 'raw'}],
    },
    {
      code: `const styles = stylex.create({base: {[stylex.when.ancestor('[data-astryx-press="fading"]', scope)]: {opacity: 0}}});`,
      filename: site,
      errors: [{messageId: 'raw'}],
    },
    // ❌ One selector naming two private attributes reports each.
    {
      code: `const s = ':has(~ [data-astryx-submenu-host] > [data-astryx-submenu-regions="view"])';`,
      filename: site,
      errors: [{messageId: 'raw'}, {messageId: 'raw'}],
    },
    // ❌ A name that starts like a public one is still private.
    {
      code: `style.setAttribute('data-astryx-theme-prose', name);`,
      filename: site,
      errors: [
        {
          messageId: 'raw',
          data: {
            attribute: 'data-astryx-theme-prose',
            owner: 'packages/core/src/privateAttributes/theme-prose.stylex.ts',
          },
        },
      ],
    },
    // ❌ dataAttr() naming a private attribute, or a name it cannot read.
    {
      code: `style.setAttribute(dataAttr('id'), id);`,
      filename: site,
      errors: [
        {
          messageId: 'raw',
          data: {
            attribute: 'data-astryx-id',
            owner: 'packages/core/src/privateAttributes/id.stylex.ts',
          },
        },
      ],
    },
    {
      code: `style.setAttribute(dataAttr(name), id);`,
      filename: site,
      errors: [{messageId: 'unreadable'}],
    },
    // ❌ An interpolated name, or the bare prefix.
    {
      code: 'const s = `data-astryx-${part}`;',
      filename: site,
      errors: [
        {
          messageId: 'unreadable',
          data: {
            attribute: 'data-astryx-*',
            ownerDirectory: 'packages/core/src/privateAttributes',
          },
        },
      ],
    },
    {
      code: `const isOurs = name.startsWith('data-astryx-');`,
      filename: site,
      errors: [{messageId: 'unreadable'}],
    },
    // ❌ A private attribute in Lab names Lab's own owner module.
    {
      code: `const s = '[data-astryx-popover-fallback-close]';`,
      filename: '/repo/packages/lab/src/Schedule/useScheduleViewPopover.ts',
      errors: [
        {
          messageId: 'raw',
          data: {
            attribute: 'data-astryx-popover-fallback-close',
            owner:
              'packages/lab/src/privateAttributes/popover-fallback-close.stylex.ts',
          },
        },
      ],
    },
    // ❌ A new site beyond the baseline's count for that attribute.
    {
      code: `const a = '[data-astryx-press="on"]'; const b = '[data-astryx-press="fading"]';`,
      filename: site,
      options: baselined(['data-astryx-press']),
      errors: [{messageId: 'raw'}],
    },
    // ❌ A baseline for another file or another attribute does not cover it.
    {
      code: `const s = '[data-astryx-press="on"]';`,
      filename: site,
      options: [
        {
          baseline: {'packages/core/src/Tab/Tab.tsx': ['data-astryx-press']},
          root: '/repo',
        },
      ],
      errors: [{messageId: 'raw'}],
    },
    {
      code: `const s = '[data-astryx-press="on"]';`,
      filename: site,
      options: baselined(['data-astryx-token']),
      errors: [{messageId: 'raw'}],
    },
    // ❌ An owner module writing another attribute.
    {
      code: `export const pinnedOn = {'data-astryx-table-pinned': ''};`,
      filename: owner,
      errors: [
        {
          messageId: 'foreignOwner',
          data: {
            attribute: 'data-astryx-table-pinned',
            owner: 'packages/core/src/privateAttributes/table-pinned.stylex.ts',
          },
        },
      ],
    },
    // ❌ An owner module exporting its raw name or a selector on it.
    {
      code: `export const PRESS_ATTRIBUTE = 'data-astryx-press';`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `const PRESSED = '[data-astryx-press="on"]' as const; export {PRESSED};`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    // ❌ The owner's name or a selector leaving the module as a string, by
    //    every route: default export, object value, array, return value,
    //    module constant, dataAttr().
    {
      code: `export default 'data-astryx-press';`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `export const selectors = {pressed: '[data-astryx-press="on"]'};`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `export const names = ['data-astryx-press'];`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `export function pressSelector() { return '[data-astryx-press="on"]'; }`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `export const pressAttribute = () => 'data-astryx-press';`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `const PRESSED = '[data-astryx-press="on"]'; export function pressSelector() { return PRESSED; }`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `const ATTRIBUTE = 'data-astryx-press'; export default ATTRIBUTE;`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: `export const PRESS_ATTRIBUTE = dataAttr('press');`,
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    // ❌ A selector built from the name constant, in a template or with `+`.
    {
      code: 'const ATTRIBUTE = \'data-astryx-press\'; export const PRESSED_SELECTOR = `[${ATTRIBUTE}="on"]`;',
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: 'const ATTRIBUTE = \'data-astryx-press\'; export function pressedSelector(state) { return `[${ATTRIBUTE}="${state}"]`; }',
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    {
      code: "const ATTRIBUTE = 'data-astryx-press'; export const PRESSED_SELECTOR = '[' + ATTRIBUTE + ']';",
      filename: owner,
      errors: [{messageId: 'exportedName'}],
    },
    // ❌ Importing another package's owner module, by package path or by a
    //    relative path into its source.
    {
      code: `import {fallbackClose} from '@astryxdesign/core/privateAttributes/popover-fallback-close.stylex';`,
      filename: '/repo/packages/lab/src/Schedule/useScheduleViewPopover.ts',
      errors: [{messageId: 'foreignPackage'}],
    },
    {
      code: `import {fallbackClose} from '../../../core/src/privateAttributes/popover-fallback-close.stylex';`,
      filename: '/repo/packages/lab/src/Schedule/useScheduleViewPopover.ts',
      errors: [{messageId: 'foreignPackage'}],
    },
  ],
});
