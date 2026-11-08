// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-light-dark-outside-theme.test.mjs
 * @description Tests for the no-light-dark-outside-theme ESLint rule. Most of
 * these are the exemption list: the repo's legitimate `light-dark()` all lives
 * in the theme layer or in files that quote CSS rather than ship it, and a
 * rule that flagged those would be turned off within a day. The invalid cases
 * are the two shapes that actually occur in component source — a module-level
 * tint constant and an interpolated template literal.
 */

import {RuleTester} from 'eslint';
import tseslint from 'typescript-eslint';
import noLightDarkOutsideThemeRule from './no-light-dark-outside-theme.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: {jsx: true},
    },
  },
});

const COMPONENT = 'packages/core/src/Table/plugins/stickyColumns/useTableStickyColumns.tsx';

// RuleTester registers its own describe/it blocks internally, so it
// must run at the top level. Vitest 4 forbids calling suite functions
// (describe/it) from inside another it() callback.
ruleTester.run('no-light-dark-outside-theme', noLightDarkOutsideThemeRule, {
  valid: [
    // The path this rule points at: read a token, let the theme own the pair.
    {
      code: "const TINT = colorVars['--color-shadow'];",
      filename: COMPONENT,
    },
    {
      code: "const bg = `linear-gradient(to right, ${colorVars['--color-shadow']}, transparent)`;",
      filename: COMPONENT,
    },

    // THE THEME LAYER — where the pair is written. defineTheme generates these
    // strings from [light, dark] tuples; tokens.stylex states the defaults.
    {
      code: "export const colorDefaults = {'--color-shadow': 'light-dark(rgba(5, 54, 89, 0.1), rgba(0, 0, 0, 0.3))'};",
      filename: 'packages/core/src/theme/tokens.stylex.ts',
    },
    {
      code: "const ld = (light, dark) => `light-dark(${light}, ${dark})`;",
      filename: 'packages/core/src/theme/defineTheme.ts',
    },
    {
      code: "const t = {'--color-data-1': 'light-dark(#0064E0, #2694FE)'};",
      filename: 'packages/core/src/theme/domainTokens/dataTokens.ts',
    },
    // Nested under the theme layer (syntax themes) — still the theme layer.
    {
      code: "const punctuation = 'light-dark(#6e6e6e, #a0a0a0)';",
      filename: 'packages/core/src/theme/syntax/defineSyntaxTheme.ts',
    },
    // A shipped theme package is the theme layer too.
    {
      code: "export const stoneTheme = {'--color-shadow': 'light-dark(#25252a1a, #0000004d)'};",
      filename: 'packages/themes/stone/src/stoneTheme.ts',
    },

    // FILES THAT QUOTE CSS RATHER THAN SHIP IT.
    // A test asserting on what the theme layer generated.
    {
      code: "expect(rules['--color-shadow']).toBe('light-dark(#000, #fff)');",
      filename: 'packages/core/src/theme/generateThemeRules.test.ts',
    },
    // ...including one outside the theme directory.
    {
      code: "expect(style.color).toBe('light-dark(red, blue)');",
      filename: 'packages/core/src/Table/Table.test.tsx',
    },
    {
      code: "const probe = 'light-dark(red, blue)';",
      filename: 'packages/core/src/hooks/__tests__/useAutoMediaMode.test.ts',
    },
    // Prose docs, which show the generated output to the reader.
    {
      code: "export default {body: 'Tokens resolve to light-dark(a, b) pairs.'};",
      filename: 'packages/core/src/theme/MediaTheme.doc.mjs',
    },
    // A story demonstrating the mechanism.
    {
      code: "const demo = 'light-dark(#fff, #000)';",
      filename: 'apps/storybook/stories/MediaTheme.stories.tsx',
    },

    // A PREFIX, NOT A VALUE. A resolver detecting a token it has to parse
    // never writes a complete call — this is getChartColors' actual shape.
    {
      code: "if (raw.startsWith('light-dark(') && raw.endsWith(')')) { return raw.slice(11, -1); }",
      filename: 'packages/lab/src/Chart/getChartColors.ts',
    },
    {
      code: "const OPENER = 'light-dark(';",
      filename: COMPONENT,
    },

    // Comments are not literals, so the rule never sees them — the mechanism
    // is discussed all over core and none of that is a violation.
    {
      code: '// Astryx tokens are light-dark(a, b) pairs that resolve when used.\nconst x = 1;',
      filename: 'packages/core/src/hooks/useAutoMediaMode.ts',
    },
    {
      code: '/** Pages pinning color-scheme resolve light-dark() by OS preference. */\nconst y = 2;',
      filename: 'packages/core/src/Toast/useToast.tsx',
    },

    // Near-misses: the name has to be the CSS function, called.
    {
      code: "const mode = 'light-dark';",
      filename: COMPONENT,
    },
    {
      code: "const label = 'Light / Dark';",
      filename: COMPONENT,
    },
    // Not a functional notation — CSS forbids the space, so this is prose.
    {
      code: "const note = 'light-dark (a, b)';",
      filename: COMPONENT,
    },
  ],

  invalid: [
    // THE REAL ONE (#5321's ruling, found on main): a module-level tint
    // constant deciding both schemes inside a component.
    {
      code: "const SHADOW_TINT = 'light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.32))';",
      filename: COMPONENT,
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // Interpolated over tokens: still the component choosing per scheme.
    {
      code: 'const c = `light-dark(${colorVars["--color-error"]}, color-mix(in srgb, ${colorVars["--color-error"]} 82%, white))`;',
      filename: 'packages/lab/src/LogStream/LogStream.tsx',
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // A nested call must not be mistaken for the closing parenthesis.
    {
      code: "const c = 'light-dark(color-mix(in srgb, #fff 58%, black), #000)';",
      filename: 'packages/lab/src/LogStream/LogStream.tsx',
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // Inside stylex.create, which is where component CSS actually lives.
    {
      code: "const styles = stylex.create({strip: {backgroundImage: 'linear-gradient(to right, light-dark(#0002, #0005), transparent)'}});",
      filename: COMPONENT,
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // An inline style prop is the same decision in a different place.
    {
      code: "const el = <div style={{color: 'light-dark(#000, #fff)'}} />;",
      filename: 'packages/core/src/Avatar/Avatar.tsx',
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // CSS function names are case-insensitive; the rule is too.
    {
      code: "const c = 'LIGHT-DARK(#000, #fff)';",
      filename: COMPONENT,
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // `theme` exempts a DIRECTORY, not a filename that merely mentions one —
    // a component is a component wherever its name points.
    {
      code: "const c = 'light-dark(#000, #fff)';",
      filename: 'packages/core/src/Callout/ThemeBadge.tsx',
      errors: [{messageId: 'lightDarkInComponent'}],
    },
    // Two independent calls in one file are two reports.
    {
      code: "const a = 'light-dark(#000, #fff)';\nconst b = 'light-dark(#111, #eee)';",
      filename: COMPONENT,
      errors: [
        {messageId: 'lightDarkInComponent'},
        {messageId: 'lightDarkInComponent'},
      ],
    },
  ],
});
