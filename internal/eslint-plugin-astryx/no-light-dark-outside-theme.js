// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file no-light-dark-outside-theme.js
 * @description Disallow the CSS `light-dark()` function in component source.
 * A light/dark decision belongs to the theme layer, not to a component.
 *
 * `light-dark(a, b)` picks a value from the resolved `color-scheme`. Written
 * in a component, it hardcodes both halves of that choice at the one place a
 * theme cannot reach: a theme can retint every token a component consumes, but
 * it cannot reach inside the component to change a literal.
 *
 * That is not a style preference — it is why the same defect keeps coming
 * back. A dark-mode contrast failure fixed with a component-level
 * `light-dark()` fixes exactly the scheme the author was looking at. The
 * element still fails on the other side in every theme whose palette lands
 * differently, and no theme can do anything about it. A token pair fixed once
 * in the theme layer reaches both schemes in every theme.
 *
 * Bad — the component decides, and only for the scheme it was written for:
 *   const TINT = 'light-dark(rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.32))';
 *
 * Good — the theme decides, and every theme gets to:
 *   colorVars['--color-shadow']
 *
 * The theme layer is where the pair is written, so it is exempt: `defineTheme`
 * generates `light-dark()` strings from `[light, dark]` tuples, and
 * `tokens.stylex.ts` states the defaults those tuples override. Both are the
 * sanctioned path this rule points authors back to.
 *
 * SCOPE — what this rule can and cannot see. It reads string and template
 * literals, so a comment mentioning `light-dark()` is invisible to it, as is a
 * `.css` file (ESLint never parses one) and a `.doc.mjs` prose file (unlinted
 * outside the CLI). Path exemptions are kept here rather than only in
 * eslint.config.js so they are testable, and so a future config edit cannot
 * quietly turn the theme layer into a violation.
 *
 * A bare `'light-dark('` with no closing parenthesis is a PREFIX, not a value:
 * that is how a resolver detects a token it has to parse (`getChartColors`
 * does exactly this). Only a complete, balanced call is reported.
 *
 * KNOWN LIMITATION: the sibling mechanisms are not covered — a
 * `@media (prefers-color-scheme: …)` block or a `:is([data-theme='dark'] *)`
 * selector hardcodes the same decision and this rule says nothing. `light-dark()`
 * is where the pattern actually shows up in this repo; the others can be added
 * to this rule if they start to.
 */

import path from 'node:path';

/**
 * Directory names that ARE the theme layer. A `light-dark()` written in one of
 * these is the token pair itself, which is the whole point of the mechanism:
 * `packages/core/src/theme/**` (defineTheme, tokens.stylex, the expanders) and
 * the shipped theme packages under `packages/themes/**`.
 */
const THEME_DIRECTORIES = new Set(['theme', 'themes']);

/**
 * File kinds that quote CSS rather than ship it: tests asserting on generated
 * theme output, stories, and doc sources. Matched on the basename.
 */
const NON_SHIPPING_FILE = /\.(test|spec|stories|doc)\./;

const TEST_DIRECTORIES = new Set(['__tests__', '__mocks__']);

/** Is this file part of the theme layer, or otherwise not shipped CSS? */
function isExemptFile(filename) {
  if (!filename || filename === '<input>' || filename === '<text>') {
    return false;
  }
  const normalized = filename.split(path.sep).join('/');
  const segments = normalized.split('/');
  const basename = segments.pop() ?? '';
  if (NON_SHIPPING_FILE.test(basename)) {
    return true;
  }
  return segments.some(
    segment => THEME_DIRECTORIES.has(segment) || TEST_DIRECTORIES.has(segment),
  );
}

/**
 * Does the parenthesis opened at `from - 1` ever close within `text`?
 *
 * Distinguishes a `light-dark()` VALUE from a `'light-dark('` prefix used to
 * detect one. Nested calls count, so `light-dark(color-mix(…), …)` closes on
 * its own final parenthesis rather than color-mix's.
 */
function closes(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')' && --depth === 0) {
      return true;
    }
  }
  return false;
}

/** Does `text` contain a complete `light-dark(…)` call? (CSS is case-insensitive.) */
function hasLightDarkCall(text) {
  const opener = /light-dark\(/gi;
  let match;
  while ((match = opener.exec(text)) !== null) {
    if (closes(text, match.index + match[0].length)) {
      return true;
    }
  }
  return false;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow the CSS light-dark() function in component source — a ' +
        'light/dark decision belongs to the theme layer, where a token pair ' +
        'reaches both schemes in every theme, not to a component literal no ' +
        'theme can override',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      lightDarkInComponent:
        '`light-dark()` in a component hardcodes a light/dark decision that ' +
        'belongs to the theme. A theme can retint any token this component ' +
        'reads, but it cannot reach inside a literal — so this value fixes ' +
        'the one scheme it was written for and leaves every other theme ' +
        'failing on the other side. Read a token instead ' +
        "(`colorVars['--color-…']`), and if none fits, add the `[light, dark]` " +
        'pair in the theme layer, where `defineTheme` generates the ' +
        '`light-dark()` for every theme at once.',
    },
    schema: [],
  },
  create(context) {
    if (isExemptFile(context.filename)) {
      return {};
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string' && hasLightDarkCall(node.value)) {
          context.report({node, messageId: 'lightDarkInComponent'});
        }
      },
      TemplateLiteral(node) {
        // Interpolations are opaque: replace each with a placeholder so the
        // parenthesis balance is computed from the literal text alone, and an
        // expression carrying a stray parenthesis cannot skew it.
        const text = node.quasis.map(quasi => quasi.value.raw).join('\u0000');
        if (hasLightDarkCall(text)) {
          context.report({node, messageId: 'lightDarkInComponent'});
        }
      },
    };
  },
};

export default rule;
