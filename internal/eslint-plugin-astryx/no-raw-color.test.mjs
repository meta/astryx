// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-raw-color.test.mjs
 *
 * One invalid case per shape a raw colour has actually taken in this repo, and
 * one valid case per thing the rule must stay quiet about. Every invalid case
 * below was watched failing against the rule before the rule handled it.
 */

import {RuleTester, Linter} from 'eslint';
import {expect, test} from 'vitest';
import rule from './no-raw-color.js';

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: {ecmaFeatures: {jsx: true}},
  },
});

const IN_COMPONENT = 'packages/core/src/Widget/Widget.tsx';
const one = [{messageId: 'rawColor'}];

ruleTester.run('no-raw-color', rule, {
  valid: [
    // T2b — the sanctioned non-token values.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        borderWidth: 0,
        borderStyle: 'none',
        backgroundColor: 'transparent',
        color: 'inherit',
        fill: 'currentColor',
      }});`,
    },
    // T2b — layout values are not theme values, and a colour rule structurally
    // cannot reach them.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        width: '100%',
        flex: 1,
        maxHeight: '300px',
        maxWidth: '360px',
        minWidth: '120px',
      }});`,
    },
    // Reading a token is the whole point.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: colorVars['--color-text-primary']}});`,
    },
    // Derived from tokens: color-mix on vars, and the percentage is a mix
    // ratio, not a channel.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        backgroundColor: 'color-mix(in oklab, var(--color-accent), var(--color-surface) 50%)',
      }});`,
    },
    // A colour assembled from channels it was handed is a utility, not a
    // decision — this is how packages/core/src/utils/color.ts serializes.
    {
      filename: IN_COMPONENT,
      code: 'const out = `rgba(${r}, ${g}, ${b}, ${a})`;',
    },
    // A prefix with no closing parenthesis is how a parser detects a notation.
    {
      filename: IN_COMPONENT,
      code: `const isRgb = raw.startsWith('rgb(');`,
    },
    // Every channel from a token.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: 'rgb(var(--r) var(--g) var(--b))'}});`,
    },
    // A mask resolves its gradient through alpha, so the black never paints.
    {
      filename: IN_COMPONENT,
      code: 'const s = stylex.create({a: {maskImage: `linear-gradient(to right, transparent, rgba(0,0,0,0.3) 2px, black)`}});',
    },
    // Still the mask's value when it is picked by a ternary or defaulted with
    // `??` — the exemption follows the value, not its syntactic position.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        maskImage: isStart
          ? 'linear-gradient(to right, transparent, rgba(0,0,0,0.3))'
          : 'linear-gradient(to left, transparent, rgba(0,0,0,0.3))',
        WebkitMaskImage: custom ?? 'linear-gradient(to right, rgba(0,0,0,0.3), black)',
      }});`,
    },
    // StyleX's conditional object, which is how TabList.tsx:261 writes its
    // fade — the gradient is the value of `default` inside the value of
    // `maskImage`, two levels below the key that names it.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        maskImage: {
          default: 'linear-gradient(to right, transparent, rgba(0,0,0,0.3))',
          ':is([dir="rtl"] *)': 'linear-gradient(to left, transparent, rgba(0,0,0,0.3))',
        },
      }});`,
    },
    // The other mask spellings, each pinned so dropping one fails something.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        mask: 'linear-gradient(rgba(0,0,0,0.3), black)',
        WebkitMask: 'linear-gradient(rgba(0,0,0,0.3), black)',
        maskBorderSource: 'linear-gradient(rgba(0,0,0,0.3), black)',
        WebkitMaskBoxImage: 'linear-gradient(rgba(0,0,0,0.3), black)',
      }});`,
    },
    // A sandbox page demonstrates a theme, exactly as a story does — named in
    // the rubric's own exceptions note.
    {
      filename: 'packages/core/src/Widget/Widget.sandbox.tsx',
      code: `const demo = defineTheme({tokens: {'--color-accent': '#7c3aed'}});`,
    },
    // The theme layer is where a colour value is written.
    {
      filename: 'packages/core/src/theme/tokens.stylex.ts',
      code: `export const colorVars = stylex.defineVars({'--color-accent': '#0064e0'});`,
    },
    {
      filename: 'packages/themes/chocolate/src/index.ts',
      code: `export default defineTheme({tokens: {'--color-shadow': '#4a35201A'}});`,
    },
    // A CLI template's theme is a theme author's own input, which is the thing
    // the template exists to demonstrate.
    {
      filename: 'packages/cli/assets/templates/app/themes/brand.ts',
      code: `export default defineTheme({tokens: {'--color-accent': '#7c3aed'}});`,
    },
    // A theming story MUST use literals — a theme author writes literals, and
    // that is precisely what the story demonstrates.
    {
      filename: 'packages/core/src/Widget/Widget.stories.tsx',
      code: `const custom = defineTheme({tokens: {'--color-accent': '#7c3aed'}});`,
    },
    {
      filename: 'packages/core/src/Widget/Widget.test.tsx',
      code: `expect(style.color).toBe('#ff0000');`,
    },
    {
      filename: 'packages/core/src/Widget/Widget.doc.mjs',
      code: `export const theming = {example: 'color: #7c3aed'};`,
    },
    {
      filename: 'packages/core/src/__tests__/helpers.ts',
      code: `export const RED = '#ff0000';`,
    },
    // Not colour-shaped: too few digits, too many, and a word that merely
    // starts with hex characters.
    {
      filename: IN_COMPONENT,
      code: `const a = '#ff'; const b = '#1234567'; const c = '#facade1';`,
    },
  ],

  invalid: [
    // The plain case the old rule already caught, kept so this rule is a
    // superset of it.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: '#ff0000'}});`,
      errors: one,
    },
    // Short hex.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {backgroundColor: '#fff'}});`,
      errors: one,
    },
    // rgb()/rgba().
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {borderColor: 'rgba(0, 0, 0, 0.5)'}});`,
      errors: one,
    },
    // hsl()/hsla() — never covered by the property-keyed rule at all.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: 'hsl(210, 80%, 50%)'}});`,
      errors: one,
    },
    // Inside light-dark(). The motivating shape: an anchored top-level
    // pattern sees a string starting with `light-dark(` and passes it.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: 'light-dark(#fff, #000)'}});`,
      errors: one,
    },
    // Inside color-mix(), where only one side is a token.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        backgroundColor: 'color-mix(in oklab, var(--color-accent), #1c1c1e 20%)',
      }});`,
      errors: one,
    },
    // Behind a const — the literal is one hop from the style object.
    {
      filename: IN_COMPONENT,
      code: `const SHADOW_TINT = '#00000020';
        const s = stylex.create({a: {boxShadow: SHADOW_TINT}});`,
      errors: one,
    },
    // In a template literal, and boxShadow specifically — the property the
    // rubric records as not lint-covered.
    {
      filename: IN_COMPONENT,
      code: 'const s = stylex.create({a: {boxShadow: `0 1px 2px ${spacingVars["--spacing-1"]} rgba(0, 0, 0, 0.12)`}});',
      errors: one,
    },
    // One literal channel is enough, even when the rest is interpolated.
    {
      filename: IN_COMPONENT,
      code: 'const bar = `hsl(calc(var(--accent-hue, 210) + ${shift}), 80%, 50%)`;',
      errors: one,
    },
    // A var() fallback is a colour that paints when the token is missing.
    {
      filename: IN_COMPONENT,
      code: `el.style.color = 'var(--color-text-disabled, #999)';`,
      errors: one,
    },
    // A JSX attribute is styling too.
    {
      filename: IN_COMPONENT,
      code: `const el = <circle fill="var(--color-background-surface, #fff)" />;`,
      errors: one,
    },
    // A modern notation is the same defect with a different spelling.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {color: 'oklch(0.7 0.1 200)'}});`,
      errors: one,
    },
    // Colour reaches far past the three properties the property-keyed rule
    // knows about.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        outlineColor: '#0064e0',
        fill: '#ff6166',
        caretColor: 'rgb(28, 28, 30)',
      }});`,
      errors: [{messageId: 'rawColor'}, {messageId: 'rawColor'}, {messageId: 'rawColor'}],
    },
    // A style RULE named `mask` is not the CSS property — `stylex.create()`'s
    // top-level keys are rule names, and the declarations inside one are
    // ordinary paint.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({mask: {backgroundColor: 'rgba(0, 0, 0, 0.5)'}});`,
      errors: one,
    },
    // A computed key's identifier is a variable name, not the property it
    // resolves to.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {[maskImage]: '#f00'}});`,
      errors: one,
    },
    // The theme exemption is matched by POSITION, not by directory name: a
    // `theme/` a component happens to nest inside itself is component source.
    // This is the boundary, and it is pinned from both sides — the two valid
    // cases above are the real theme layer.
    {
      filename: 'packages/core/src/Chat/theme/bubbleColors.ts',
      code: `export const BUBBLE_TINT = '#1c1c1e';`,
      errors: one,
    },
    {
      filename: 'packages/core/src/Widget/themes/local.ts',
      code: `export const LOCAL = '#1c1c1e';`,
      errors: one,
    },
    // backgroundImage paints the same gradient a mask discards — including
    // through the same conditional object and the same ternary, so the walk
    // cannot be exempting on shape rather than on the property it lands on.
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        backgroundImage: 'linear-gradient(to right, transparent, rgba(0, 0, 0, 0.3))',
      }});`,
      errors: one,
    },
    {
      filename: IN_COMPONENT,
      code: `const s = stylex.create({a: {
        backgroundImage: {
          default: 'linear-gradient(to right, transparent, rgba(0, 0, 0, 0.3))',
          ':hover': isOn ? 'linear-gradient(#fff, #000)' : 'none',
        },
      }});`,
      errors: [{messageId: 'rawColor'}, {messageId: 'rawColor'}],
    },
  ],
});

/**
 * The escape hatch is deliberately left open, so this asserts the decision
 * rather than an accident. T1 says a disable is not an exception to the RULE —
 * a reviewer still owes the finding — but suppression stays available, because
 * the only way to close it is `--no-inline-config`, which is process-wide and
 * would also void the sanctioned disables other rules in this plugin rely on.
 * A disable here is a signal a reviewer can grep for, not a loophole.
 */
test('an eslint-disable suppresses it, and that is on purpose', () => {
  const linter = new Linter();
  const config = {
    files: ['**/*.tsx'],
    plugins: {'@astryx': {rules: {'no-raw-color': rule}}},
    rules: {'@astryx/no-raw-color': 'error'},
  };
  const options = {filename: IN_COMPONENT};

  const reported = linter.verify(
    `const s = stylex.create({a: {color: '#ff0000'}});`,
    config,
    options,
  );
  expect(reported.map(m => m.messageId)).toEqual(['rawColor']);

  const suppressed = linter.verify(
    `// eslint-disable-next-line @astryx/no-raw-color
const s = stylex.create({a: {color: '#ff0000'}});`,
    config,
    options,
  );
  expect(suppressed).toEqual([]);
});
