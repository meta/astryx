#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * StyleX CSS Capability Scanner
 *
 * Tests a battery of CSS features against the installed StyleX babel plugin
 * to determine what's supported. Outputs a capability reference document.
 *
 * Usage: node internal/stylex-capabilities/scan.mjs
 */

import babel from '@babel/core';
import stylexPlugin from '@stylexjs/babel-plugin';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const requireFromCore = createRequire(
  path.join(repoRoot, 'packages/core/package.json'),
);
const typescriptPreset = requireFromCore.resolve('@babel/preset-typescript');
const stylexPackagePath = requireFromCore.resolve(
  '@stylexjs/stylex/package.json',
);

// ============================================================================
// Test cases — each is a minimal StyleX snippet testing one CSS feature
// ============================================================================

const tests = [
  // At-rules
  {
    category: 'At-Rules',
    name: '@media',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', '@media (max-width: 768px)': 'blue' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@media (hover: hover)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', '@media (hover: hover)': 'blue' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@media (prefers-reduced-motion)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { animationDuration: { default: '0.3s', '@media (prefers-reduced-motion: reduce)': '0.01s' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@media (prefers-color-scheme)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'black', '@media (prefers-color-scheme: dark)': 'white' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@supports',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: { default: 'flex', '@supports (display: grid)': 'grid' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@container',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { fontSize: { default: '14px', '@container (min-width: 400px)': '16px' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@container (named)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { fontSize: { default: '14px', '@container sidebar (min-width: 400px)': '16px' } } });`,
  },
  {
    category: 'At-Rules',
    name: '@layer',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '@layer': 'utilities', color: 'red' } });`,
  },
  {
    category: 'At-Rules',
    name: '@starting-style',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { opacity: 1, '@starting-style': { opacity: 0 } } });`,
  },
  {
    category: 'At-Rules',
    name: '@starting-style (transform)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transform: 'translateX(0)', '@starting-style': { transform: 'translateX(100%)' } } });`,
  },

  // Pseudo-classes
  {
    category: 'Pseudo-Classes',
    name: ':hover',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', ':hover': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':focus',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', ':focus': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':focus-visible',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { outline: { default: 'none', ':focus-visible': '2px solid blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':focus-within',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { borderColor: { default: 'gray', ':focus-within': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':active',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', ':active': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':disabled',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { opacity: { default: 1, ':disabled': 0.5 } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':first-child',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { marginTop: { default: 8, ':first-child': 0 } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':last-child',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { marginBottom: { default: 8, ':last-child': 0 } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':nth-child()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { backgroundColor: { default: 'white', ':nth-child(even)': '#f5f5f5' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':where()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: { default: 'none', ':where([open])': 'flex' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':is()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', ':is(:hover, :focus)': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':has()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { borderColor: { default: 'gray', ':has(:focus)': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':not()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: { default: 'block', ':not(:last-child)': 'block' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':placeholder-shown',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'black', ':placeholder-shown': 'gray' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':checked',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { backgroundColor: { default: 'white', ':checked': 'blue' } } });`,
  },
  {
    category: 'Pseudo-Classes',
    name: ':empty',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: { default: 'block', ':empty': 'none' } } });`,
  },

  // Pseudo-elements
  {
    category: 'Pseudo-Elements',
    name: '::before',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::before': { content: '""', display: 'block' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::after',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::after': { content: '""', display: 'block' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::placeholder',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::placeholder': { color: 'gray', fontStyle: 'italic' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::selection',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::selection': { backgroundColor: 'blue', color: 'white' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::backdrop',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::backdrop': { backgroundColor: 'rgba(0,0,0,0.5)' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::marker',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::marker': { color: 'blue' } } });`,
  },
  {
    category: 'Pseudo-Elements',
    name: '::file-selector-button',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::file-selector-button': { backgroundColor: 'blue', color: 'white' } } });`,
  },

  // Combinators & compound selectors
  {
    category: 'Compound Selectors',
    name: 'Pseudo-class on pseudo-element (::backdrop + condition)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::backdrop': { opacity: { default: 0, ':where([data-open])::backdrop': 1 } } } });`,
  },
  {
    category: 'Compound Selectors',
    name: 'RTL context (:is([dir="rtl"] *))',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transform: { default: 'translateX(-100%)', ':is([dir="rtl"] *)': 'translateX(100%)' } } });`,
  },
  {
    category: 'Compound Selectors',
    name: 'Nested @media + pseudo',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', ':hover': 'blue' }, '@media (hover: hover)': { color: { ':hover': 'green' } } } });`,
  },

  // CSS features
  {
    category: 'CSS Values',
    name: 'CSS variables (custom properties)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: 'var(--color-accent)' } });`,
  },
  {
    category: 'CSS Values',
    name: 'calc()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { width: 'calc(100% - 32px)' } });`,
  },
  {
    category: 'CSS Values',
    name: 'clamp()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { fontSize: 'clamp(14px, 2vw, 18px)' } });`,
  },
  {
    category: 'CSS Values',
    name: 'light-dark()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: 'light-dark(black, white)' } });`,
  },
  {
    category: 'CSS Values',
    name: 'color-mix()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: 'color-mix(in srgb, red 50%, blue)' } });`,
  },
  {
    category: 'CSS Values',
    name: 'container-type',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { containerType: 'inline-size' } });`,
  },
  {
    category: 'CSS Values',
    name: 'container-name',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { containerName: 'sidebar' } });`,
  },

  // Transitions & animations
  {
    category: 'Transitions & Animations',
    name: 'transition (shorthand)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transition: 'opacity 0.3s ease' } });`,
  },
  {
    category: 'Transitions & Animations',
    name: 'transition (individual properties)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transitionProperty: 'opacity', transitionDuration: '0.3s', transitionTimingFunction: 'ease' } });`,
  },
  {
    category: 'Transitions & Animations',
    name: 'transitionBehavior: allow-discrete',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transitionBehavior: 'allow-discrete' } });`,
  },
  {
    category: 'Transitions & Animations',
    name: 'animation (shorthand)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { animation: 'spin 1s linear infinite' } });`,
  },
  {
    category: 'Transitions & Animations',
    name: 'stylex.keyframes',
    code: `import * as stylex from '@stylexjs/stylex';
const spin = stylex.keyframes({ from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } });
const s = stylex.create({ t: { animationName: spin } });`,
  },

  // Dynamic styles
  {
    category: 'Dynamic Styles',
    name: 'Dynamic values (function in stylex.create)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ w: (w) => ({ width: w + 'px' }) });`,
  },

  // Define variables
  {
    category: 'Variables',
    name: 'stylex.defineVars',
    filename: 'test.stylex.ts',
    code: `import * as stylex from '@stylexjs/stylex';
export const vars = stylex.defineVars({ primary: 'blue', secondary: 'green' });`,
  },
  {
    category: 'Variables',
    name: 'stylex.createTheme',
    filename: 'test.stylex.ts',
    code: `import * as stylex from '@stylexjs/stylex';
export const vars = stylex.defineVars({ primary: 'blue' });
export const theme = stylex.createTheme(vars, { primary: 'red' });`,
  },

  // stylex.when — ancestor/sibling state selectors
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor(:hover)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.ancestor(':hover')]: 'blue' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor(:hover) + @media',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.ancestor(':hover')]: { '@media (hover: hover)': 'blue' } } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor(:focus-within)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { borderColor: { default: 'gray', [stylex.when.ancestor(':focus-within')]: 'blue' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor(:active)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { transform: { default: 'none', [stylex.when.ancestor(':active')]: 'scale(0.98)' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor(:disabled)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { opacity: { default: 1, [stylex.when.ancestor(':disabled')]: 0.5 } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.ancestor([data-attr])',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.ancestor('[data-selected]')]: 'blue' } } });`,
  },

  // stylex.when — descendant and sibling selectors
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.descendant(:hover)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.descendant(':hover')]: 'blue' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.siblingBefore(:checked)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.siblingBefore(':checked')]: 'blue' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.siblingAfter(:checked)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', [stylex.when.siblingAfter(':checked')]: 'blue' } } });`,
  },
  {
    category: 'Ancestor/Sibling Selectors',
    name: 'stylex.when.anySibling(:hover)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { opacity: { default: 1, [stylex.when.anySibling(':hover')]: 0.5 } } });`,
  },

  // stylex top-level APIs
  {
    category: 'StyleX APIs',
    name: 'stylex.firstThatWorks()',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: stylex.firstThatWorks('grid', 'flex') } });`,
  },
  {
    category: 'StyleX APIs',
    name: 'stylex.positionTry()',
    code: `import * as stylex from '@stylexjs/stylex';
const pt = stylex.positionTry({ insetBlockStart: 'anchor(end)' });
const s = stylex.create({ t: { positionTryOptions: pt } });`,
  },
  {
    category: 'StyleX APIs',
    name: 'stylex.viewTransitionClass()',
    code: `import * as stylex from '@stylexjs/stylex';
const vtc = stylex.viewTransitionClass({ old: { opacity: 0 }, new: { opacity: 1 } });
const s = stylex.create({ t: { viewTransitionName: vtc } });`,
  },
  {
    category: 'StyleX APIs',
    name: 'stylex.defineConsts()',
    filename: 'test.stylex.ts',
    code: `import * as stylex from '@stylexjs/stylex';
export const consts = stylex.defineConsts({ maxWidth: '1200px', headerHeight: '64px' });`,
  },
  {
    category: 'StyleX APIs',
    name: 'stylex.types.color()',
    filename: 'test.stylex.ts',
    code: `import * as stylex from '@stylexjs/stylex';
export const vars = stylex.defineVars({ primary: stylex.types.color('blue') });`,
  },
  {
    category: 'StyleX APIs',
    name: 'stylex.types.length()',
    filename: 'test.stylex.ts',
    code: `import * as stylex from '@stylexjs/stylex';
export const vars = stylex.defineVars({ spacing: stylex.types.length('16px') });`,
  },

  // Bleeding-edge CSS features
  {
    category: 'Bleeding Edge',
    name: '@scope',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: { default: 'red', '@scope (.card)': 'blue' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: '@property (explicit)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '@property --my-color': { syntax: '"<color>"', inherits: 'false', initialValue: 'red' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: '::view-transition-old',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::view-transition-old(root)': { animationDuration: '0.3s' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: '::view-transition-new',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { '::view-transition-new(root)': { animationDuration: '0.3s' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: ':modal',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { backgroundColor: { default: 'white', ':modal': 'white' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'anchor() positioning',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { top: 'anchor(--my-anchor bottom)', positionAnchor: '--my-anchor' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'CSS nesting (&)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { color: 'red', '& .child': { color: 'blue' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: '@media (scripting: none)',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: { default: 'block', '@media (scripting: none)': 'none' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: ':user-valid / :user-invalid',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { borderColor: { default: 'gray', ':user-invalid': 'red', ':user-valid': 'green' } } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'color-scheme property',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { colorScheme: 'light dark' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'text-wrap: balance',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { textWrap: 'balance' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'text-wrap: pretty',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { textWrap: 'pretty' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'field-sizing: content',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { fieldSizing: 'content' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'interpolate-size: allow-keywords',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { interpolateSize: 'allow-keywords' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'scrollbar-gutter',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { scrollbarGutter: 'stable' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'scrollbar-width',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { scrollbarWidth: 'thin' } });`,
  },
  {
    category: 'Bleeding Edge',
    name: 'accent-color',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { accentColor: 'blue' } });`,
  },

  // Logical properties
  {
    category: 'Logical Properties',
    name: 'paddingInline / paddingBlock',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { paddingInline: 16, paddingBlock: 8 } });`,
  },
  {
    category: 'Logical Properties',
    name: 'insetInlineStart / insetInlineEnd',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { insetInlineStart: 0, insetInlineEnd: 'auto' } });`,
  },
  {
    category: 'Logical Properties',
    name: 'borderInlineStart',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { borderInlineStartWidth: 1, borderInlineStartStyle: 'solid', borderInlineStartColor: 'gray' } });`,
  },
  {
    category: 'Logical Properties',
    name: 'marginInlineStart: auto',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { marginInlineStart: 'auto' } });`,
  },

  // Modern layout
  {
    category: 'Layout',
    name: 'display: grid',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } });`,
  },
  {
    category: 'Layout',
    name: 'display: flex + gap',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { display: 'flex', gap: 16 } });`,
  },
  {
    category: 'Layout',
    name: 'aspect-ratio',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { aspectRatio: '16 / 9' } });`,
  },
  {
    category: 'Layout',
    name: 'overscrollBehavior',
    code: `import * as stylex from '@stylexjs/stylex';
const s = stylex.create({ t: { overscrollBehavior: 'contain' } });`,
  },
];

// ============================================================================
// Runner
// ============================================================================

function testFeature(test) {
  if (test.skipTest) {
    return {...test};
  }
  try {
    const result = babel.transformSync(test.code, {
      filename: test.filename || 'test.tsx',
      presets: [typescriptPreset],
      plugins: [
        [
          stylexPlugin,
          {
            dev: true,
            runtimeInjection: true,
            propertyValidationMode: 'throw',
            unstable_moduleResolution: {
              type: 'commonJS',
              rootDir: repoRoot,
            },
          },
        ],
      ],
    });
    // Check if StyleX actually processed it (look for inject calls)
    const hasInject = result.code.includes('_inject');
    const hasStylex = result.code.includes('stylex');
    const output = result.code
      .split('\n')
      .filter(l => l.includes('ltr:'))
      .map(l => l.trim())
      .join('\n');

    // Validate output — some features compile but produce invalid CSS
    const invalidPatterns = [
      // @layer used as a property value inside a class selector
      /@layer\{[^}]*\{@layer:/,
      // @property wrapping class selectors (should be standalone declaration)
      /@property[^{]*\{\.x[a-z0-9]+/,
    ];
    const hasInvalidOutput = invalidPatterns.some(p => p.test(output));

    return {
      ...test,
      supported: !hasInvalidOutput,
      hasInject,
      output,
      ...(hasInvalidOutput
        ? {invalidReason: 'Compiles but produces invalid CSS output'}
        : {}),
    };
  } catch (e) {
    const message = String(e.message)
      .replaceAll(repoRoot, '<repo>')
      .split('\n')[0];
    return {
      ...test,
      supported: false,
      error: message,
    };
  }
}

// ============================================================================
// Main
// ============================================================================

const results = tests.map(testFeature);

// Get StyleX version
const stylexPkg = JSON.parse(fs.readFileSync(stylexPackagePath, 'utf8'));

// Group by category
const categories = {};
for (const r of results) {
  if (!categories[r.category]) categories[r.category] = [];
  categories[r.category].push(r);
}

// Generate markdown
let md = `# StyleX CSS Capability Reference\n\n`;
md += `> Auto-generated by \`internal/stylex-capabilities/scan.mjs\`\n`;
md += `> StyleX version: **${stylexPkg.version}**\n`;
md += `> Generated: ${new Date().toISOString().split('T')[0]}\n\n`;

const supported = results.filter(r => r.supported).length;
const total = results.length;
md += `**${supported}/${total}** features supported\n\n`;

for (const [cat, items] of Object.entries(categories)) {
  md += `## ${cat}\n\n`;
  md += `| Feature | Status | CSS Output |\n`;
  md += `|---------|--------|------------|\n`;
  for (const item of items) {
    const status = item.supported ? '✅' : '❌';
    const output = item.supported
      ? item.output
        ? `\`${item.output.slice(0, 80)}\``
        : '(processed)'
      : item.error?.slice(0, 60) || 'Error';
    md += `| ${item.name} | ${status} | ${output} |\n`;
  }
  md += `\n`;
}

// Also generate a compact version for LLM context
md += `---\n\n## Compact Reference (for LLM context)\n\n`;
md += `StyleX v${stylexPkg.version} supports these CSS features in \`stylex.create()\`:\n\n`;
for (const [cat, items] of Object.entries(categories)) {
  md += `**${cat}:** `;
  md += items.map(i => `${i.name} ${i.supported ? '✅' : '❌'}`).join(', ');
  md += `\n\n`;
}

// Write output
const outPath = path.resolve(__dirname, 'CAPABILITIES.md');
fs.writeFileSync(outPath, md);
console.log(`Written to ${outPath}`);
console.log(
  `\n${supported}/${total} features supported (StyleX v${stylexPkg.version})`,
);

// Also write JSON for programmatic use
const jsonPath = path.resolve(__dirname, 'capabilities.json');
fs.writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      version: stylexPkg.version,
      generatedAt: new Date().toISOString(),
      total,
      supported,
      results: results.map(({code, ...r}) => r),
    },
    null,
    2,
  ),
);
console.log(`JSON written to ${jsonPath}`);
